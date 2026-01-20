/**
 * Lakehouse RPC Server (Parent DO)
 *
 * Durable Object that aggregates CDC from child DOs via WebSocket with hibernation.
 * Uses the WebSocket Hibernation API for 95% cost reduction on idle connections.
 *
 * Key Features:
 * - WebSocket Hibernation: Connections stay open during hibernation, no duration charges
 * - Auto-response: Ping/pong handled by runtime without waking the DO
 * - State preservation: Attachment data survives hibernation
 * - Graceful flush: Buffer flushed before hibernation
 *
 * Usage:
 * ```typescript
 * // wrangler.jsonc
 * {
 *   "durable_objects": {
 *     "bindings": [{
 *       "name": "LAKEHOUSE_PARENT",
 *       "class_name": "LakehouseParentDO"
 *     }]
 *   }
 * }
 *
 * // worker.ts
 * export { LakehouseParentDO } from '@dotdo/poc-lakehouse-rpc';
 *
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const id = env.LAKEHOUSE_PARENT.idFromName('aggregator');
 *     const stub = env.LAKEHOUSE_PARENT.get(id);
 *     return stub.fetch(request);
 *   }
 * };
 * ```
 */

import {
  type ParentConfig,
  type ParentState,
  type WebSocketAttachment,
  type AckMessage,
  type NackMessage,
  type StatusMessage,
  type FlushResult,
  type FlushTrigger,
  DEFAULT_PARENT_CONFIG,
  isCDCBatchMessage,
  isConnectMessage,
  isHeartbeatMessage,
  encodeCapabilities,
} from './types.js';
import { decodeMessage, encodeMessage } from './protocol.js';
import { CDCBufferManager, type BufferSnapshot, type ChildConnectionState } from './buffer.js';
import { FallbackStorage } from './fallback.js';

// =============================================================================
// EvoDB RPC Server (Test-compatible API)
// =============================================================================

/**
 * Mock DO Context for EvoDBRpcServer
 */
export interface EvoDBRpcServerContext {
  acceptWebSocket?: (ws: unknown, tags?: string[]) => void;
  setWebSocketAutoResponse?: (pair: { request: string; response: string }) => void;
  getWebSockets?: (tag?: string) => unknown[];
  storage?: {
    get: <T>(key: string) => Promise<T | undefined>;
    put: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
}

/**
 * Configuration for EvoDBRpcServer
 */
export interface EvoDBRpcServerConfig {
  ctx?: EvoDBRpcServerContext;
  onFlush?: (event: { trigger: string }) => Promise<{ success: boolean }>;
  memoryPressureThreshold?: number;
  storage?: {
    get: <T>(key: string) => Promise<T | undefined>;
    put: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
}

/**
 * EvoDB RPC Server
 *
 * Server for Parent DO to receive CDC events from Child DOs.
 * Supports WebSocket hibernation API.
 */
export class EvoDBRpcServer {
  private config: EvoDBRpcServerConfig;
  public buffer: CDCBufferManager;
  private childStates: Map<string, ChildConnectionState> = new Map();

  constructor(config: EvoDBRpcServerConfig) {
    this.config = {
      memoryPressureThreshold: 0.9,
      ...config,
    };
    this.buffer = new CDCBufferManager();
  }

  /**
   * Create WebSocket attachment data for hibernation
   */
  createWebSocketAttachment(state: {
    childDoId: string;
    childShardName?: string;
    lastAckSequence: number;
    connectedAt: number;
    protocolVersion: number;
    capabilityFlags: number;
  }): WebSocketAttachment {
    return {
      childDoId: state.childDoId,
      childShardName: state.childShardName,
      lastAckSequence: state.lastAckSequence,
      connectedAt: state.connectedAt,
      protocolVersion: state.protocolVersion,
      capabilityFlags: state.capabilityFlags,
    };
  }

  /**
   * Restore connection state from hibernation
   */
  async restoreFromHibernation(ws?: {
    deserializeAttachment: () => WebSocketAttachment;
    serializeAttachment: (data: WebSocketAttachment) => void;
    send: (data: string | ArrayBuffer) => void;
  }): Promise<WebSocketAttachment | void> {
    if (ws) {
      const attachment = ws.deserializeAttachment();
      // Restore child state from attachment
      this.childStates.set(attachment.childDoId, {
        childDoId: attachment.childDoId,
        childShardName: attachment.childShardName,
        lastReceivedSequence: attachment.lastAckSequence,
        lastAckedSequence: attachment.lastAckSequence,
        connectedAt: attachment.connectedAt,
        lastActivityAt: Date.now(),
        batchesReceived: 0,
        entriesReceived: 0,
      });
      return attachment;
    }

    // Restore from context getWebSockets
    if (this.config.ctx?.getWebSockets) {
      const sockets = this.config.ctx.getWebSockets();
      for (const socket of sockets) {
        const ws = socket as { deserializeAttachment: () => WebSocketAttachment };
        if (ws.deserializeAttachment) {
          const attachment = ws.deserializeAttachment();
          this.childStates.set(attachment.childDoId, {
            childDoId: attachment.childDoId,
            childShardName: attachment.childShardName,
            lastReceivedSequence: attachment.lastAckSequence,
            lastAckedSequence: attachment.lastAckSequence,
            connectedAt: attachment.connectedAt,
            lastActivityAt: Date.now(),
            batchesReceived: 0,
            entriesReceived: 0,
          });
        }
      }
    }
  }

  /**
   * Accept a WebSocket with hibernation API
   */
  acceptHibernatingWebSocket(
    ws: { serializeAttachment: (data: WebSocketAttachment) => void; send: (data: string) => void },
    childDoId: string
  ): void {
    if (this.config.ctx?.acceptWebSocket) {
      this.config.ctx.acceptWebSocket(ws, [childDoId]);
    }
  }

  /**
   * Setup auto-response for ping/pong
   */
  setupAutoResponse(): void {
    if (this.config.ctx?.setWebSocketAutoResponse) {
      this.config.ctx.setWebSocketAutoResponse({
        request: 'ping',
        response: 'pong',
      });
    }
  }

  /**
   * Simulate memory pressure for testing
   */
  async simulateMemoryPressure(utilization: number): Promise<void> {
    if (utilization >= (this.config.memoryPressureThreshold ?? 0.9)) {
      if (this.config.onFlush) {
        await this.config.onFlush({ trigger: 'memory_pressure' });
      }
    }
  }

  /**
   * Save buffer state to storage
   */
  async saveBufferState(): Promise<void> {
    const storage = this.config.storage ?? this.config.ctx?.storage;
    if (storage) {
      const snapshot = this.buffer.serialize();
      await storage.put('buffer_snapshot', snapshot);
    }
  }

  /**
   * Get number of connected children
   */
  getConnectedChildren(): number {
    return this.childStates.size;
  }

  /**
   * Get state for a specific child
   */
  getChildState(childDoId: string): ChildConnectionState | undefined {
    return this.childStates.get(childDoId);
  }
}

// =============================================================================
// Environment Interface
// =============================================================================

/**
 * Environment bindings for the Parent DO
 */
export interface LakehouseParentEnv {
  /** R2 bucket for Iceberg data */
  LAKEHOUSE_BUCKET: R2Bucket;

  /** Optional KV for metadata */
  LAKEHOUSE_KV?: KVNamespace;
}

// =============================================================================
// Parent DO Implementation
// =============================================================================

/**
 * Lakehouse Parent Durable Object
 *
 * Receives CDC from child DOs and flushes to R2.
 * Uses WebSocket Hibernation for cost-effective real-time streaming.
 */
export class LakehouseParentDO implements DurableObject {
  private readonly ctx: DurableObjectState;
  private readonly env: LakehouseParentEnv;
  private readonly config: ParentConfig;

  private buffer: CDCBufferManager;
  private fallback: FallbackStorage;
  private state: ParentState = 'idle';
  private flushPromise: Promise<FlushResult> | null = null;

  constructor(ctx: DurableObjectState, env: LakehouseParentEnv) {
    this.ctx = ctx;
    this.env = env;
    this.config = DEFAULT_PARENT_CONFIG;
    this.buffer = new CDCBufferManager(this.config);
    this.fallback = new FallbackStorage(ctx.storage, this.config.maxFallbackSize);

    // Restore state from hibernation
    this.restoreFromHibernation();

    // Setup auto-response for ping/pong (handled by runtime without waking DO)
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  // ===========================================================================
  // HTTP Handler (WebSocket Upgrade)
  // ===========================================================================

  /**
   * Handle incoming HTTP requests
   *
   * For WebSocket upgrades, this establishes the hibernation-aware connection.
   * For regular HTTP, provides status and management endpoints.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for CDC streaming
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // REST API endpoints
    switch (url.pathname) {
      case '/status':
        return this.handleStatusRequest();
      case '/flush':
        if (request.method === 'POST') {
          return this.handleFlushRequest();
        }
        break;
      case '/health':
        return new Response('OK', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket upgrade request
   *
   * IMPORTANT: Uses ctx.acceptWebSocket() for hibernation support.
   * This is the key to getting the 95% cost discount.
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    // Create WebSocket pair
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Extract client info from headers
    const clientId = request.headers.get('X-Client-ID') ?? 'unknown';
    const shardName = request.headers.get('X-Shard-Name') ?? undefined;

    // Create attachment data for hibernation recovery
    const attachment: WebSocketAttachment = {
      childDoId: clientId,
      childShardName: shardName,
      lastAckSequence: 0,
      connectedAt: Date.now(),
      protocolVersion: 1,
      capabilityFlags: 0,
    };

    // CRITICAL: Use ctx.acceptWebSocket() instead of server.accept()
    // This enables hibernation - the DO can be evicted while WebSocket stays open
    this.ctx.acceptWebSocket(server, [clientId]);

    // Store attachment for hibernation recovery
    server.serializeAttachment(attachment);

    // Update buffer with new connection
    this.buffer.updateChildState(clientId, 0, 0, shardName);
    this.buffer.registerChildWebSocket(clientId, server);

    // Update state
    if (this.state === 'idle') {
      this.state = 'receiving';
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // ===========================================================================
  // WebSocket Hibernation Handlers
  // ===========================================================================

  /**
   * Handle incoming WebSocket message
   *
   * This is called by the runtime when a hibernated DO receives a message.
   * The DO is automatically woken up, constructor runs, then this handler.
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    // Restore attachment from hibernation
    const attachment = this.deserializeAttachment(ws);
    if (!attachment) {
      // Unknown connection, close it
      ws.close(1008, 'Unknown connection');
      return;
    }

    try {
      // Decode the message
      const rpcMessage = decodeMessage(
        typeof message === 'string' ? message : message
      );

      if (isCDCBatchMessage(rpcMessage)) {
        await this.handleCDCBatch(ws, attachment, rpcMessage);
      } else if (isConnectMessage(rpcMessage)) {
        await this.handleConnect(ws, attachment, rpcMessage);
      } else if (isHeartbeatMessage(rpcMessage)) {
        await this.handleHeartbeat(ws, attachment, rpcMessage);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendNack(ws, 0, 'invalid_format', String(error), false);
    }

    // Check if we should flush
    const trigger = this.buffer.shouldFlush();
    if (trigger) {
      await this.scheduleFlush(trigger);
    }
  }

  /**
   * Handle WebSocket close
   *
   * Called when a WebSocket connection is closed.
   * Flush any remaining buffer before the connection is fully closed.
   */
  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const attachment = this.deserializeAttachment(ws);
    if (attachment) {
      this.buffer.unregisterChildWebSocket(attachment.childDoId);
      // Don't remove child state immediately - they might reconnect
    }

    // If no more connections, consider flushing
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0 && this.buffer.getStats().entryCount > 0) {
      await this.flush('shutdown');
    }
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);

    const attachment = this.deserializeAttachment(ws);
    if (attachment) {
      this.buffer.unregisterChildWebSocket(attachment.childDoId);
    }
  }

  // ===========================================================================
  // Message Handlers
  // ===========================================================================

  /**
   * Handle CDC batch from child
   */
  private async handleCDCBatch(
    ws: WebSocket,
    attachment: WebSocketAttachment,
    message: import('./types.js').CDCBatchMessage
  ): Promise<void> {
    this.state = 'receiving';

    try {
      // Add batch to buffer
      const result = this.buffer.addBatch(
        message.sourceDoId,
        message.entries,
        message.sequenceNumber,
        message.sourceShardName
      );

      if (result.isDuplicate) {
        // Duplicate batch, acknowledge but note it
        this.sendAck(ws, message.sequenceNumber, 'duplicate', message.correlationId);
        return;
      }

      if (!result.added) {
        // Failed to add (shouldn't happen if not duplicate)
        this.sendNack(
          ws,
          message.sequenceNumber,
          'internal_error',
          'Failed to add batch to buffer',
          true
        );
        return;
      }

      // Update attachment with latest ack sequence
      attachment.lastAckSequence = message.sequenceNumber;
      ws.serializeAttachment(attachment);

      // Determine status based on buffer state
      const stats = this.buffer.getStats();
      const status: AckMessage['status'] =
        stats.utilization > 0.8 ? 'buffered' : 'ok';

      this.sendAck(ws, message.sequenceNumber, status, message.correlationId, {
        entriesProcessed: message.entries.length,
        bufferUtilization: stats.utilization,
        timeUntilFlush: this.buffer.getTimeUntilFlush(),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'BufferOverflowError') {
        // Buffer full, ask client to retry later
        this.sendNack(
          ws,
          message.sequenceNumber,
          'buffer_full',
          'Parent buffer is full',
          true,
          5000 // Retry after 5 seconds
        );
      } else {
        this.sendNack(
          ws,
          message.sequenceNumber,
          'internal_error',
          String(error),
          true
        );
      }
    }
  }

  /**
   * Handle connect message from child
   */
  private async handleConnect(
    ws: WebSocket,
    attachment: WebSocketAttachment,
    message: import('./types.js').ConnectMessage
  ): Promise<void> {
    // Update attachment with client info
    attachment.childDoId = message.sourceDoId;
    attachment.childShardName = message.sourceShardName;
    attachment.lastAckSequence = message.lastAckSequence;
    attachment.protocolVersion = message.protocolVersion;
    attachment.capabilityFlags = encodeCapabilities(message.capabilities);
    ws.serializeAttachment(attachment);

    // Update buffer state
    this.buffer.updateChildState(
      message.sourceDoId,
      0,
      message.lastAckSequence,
      message.sourceShardName
    );
    this.buffer.registerChildWebSocket(message.sourceDoId, ws);

    // Send status response
    this.sendStatus(ws);
  }

  /**
   * Handle heartbeat from child
   */
  private async handleHeartbeat(
    ws: WebSocket,
    attachment: WebSocketAttachment,
    message: import('./types.js').HeartbeatMessage
  ): Promise<void> {
    // Update child state
    this.buffer.updateChildState(
      message.sourceDoId,
      0,
      message.lastAckSequence
    );

    // Update attachment
    attachment.lastAckSequence = message.lastAckSequence;
    ws.serializeAttachment(attachment);

    // Respond with pong (auto-response handles "ping" text, this is for structured heartbeats)
    ws.send(JSON.stringify({
      type: 'pong',
      timestamp: message.timestamp,
      serverTime: Date.now(),
    }));
  }

  // ===========================================================================
  // Response Helpers
  // ===========================================================================

  /**
   * Send ACK message
   */
  private sendAck(
    ws: WebSocket,
    sequenceNumber: number,
    status: AckMessage['status'],
    correlationId?: string,
    details?: AckMessage['details']
  ): void {
    const message: AckMessage = {
      type: 'ack',
      timestamp: Date.now(),
      correlationId,
      sequenceNumber,
      status,
      details,
    };

    const encoded = encodeMessage(message, true);
    ws.send(encoded);
  }

  /**
   * Send NACK message
   */
  private sendNack(
    ws: WebSocket,
    sequenceNumber: number,
    reason: NackMessage['reason'],
    errorMessage: string,
    shouldRetry: boolean,
    retryDelayMs?: number
  ): void {
    const message: NackMessage = {
      type: 'nack',
      timestamp: Date.now(),
      sequenceNumber,
      reason,
      errorMessage,
      shouldRetry,
      retryDelayMs,
    };

    const encoded = encodeMessage(message, true);
    ws.send(encoded);
  }

  /**
   * Send status message
   */
  private sendStatus(ws: WebSocket): void {
    const stats = this.buffer.getStats();
    const sockets = this.ctx.getWebSockets();

    const message: StatusMessage = {
      type: 'status',
      timestamp: Date.now(),
      state: this.state,
      buffer: stats,
      connectedChildren: sockets.length,
      lastFlushTime: undefined, // Would track this
      nextFlushTime: Date.now() + this.buffer.getTimeUntilFlush(),
    };

    ws.send(JSON.stringify(message));
  }

  // ===========================================================================
  // Flush Operations
  // ===========================================================================

  /**
   * Schedule a flush operation
   */
  private async scheduleFlush(trigger: FlushTrigger): Promise<void> {
    // If already flushing, wait for it
    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }

    await this.flush(trigger);
  }

  /**
   * Flush buffer to R2
   */
  async flush(trigger: FlushTrigger = 'manual'): Promise<FlushResult> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.state = 'flushing';
    this.flushPromise = this.doFlush(trigger);

    try {
      return await this.flushPromise;
    } finally {
      this.flushPromise = null;
      this.state = 'idle';
    }
  }

  /**
   * Internal flush implementation
   */
  private async doFlush(trigger: FlushTrigger): Promise<FlushResult> {
    const startTime = Date.now();
    const batches = this.buffer.getBatchesForFlush();

    if (batches.length === 0) {
      return {
        success: true,
        batchesFlushed: 0,
        entriesFlushed: 0,
        bytesWritten: 0,
        paths: [],
        durationMs: 0,
        usedFallback: false,
      };
    }

    // Get all entries sorted by timestamp
    const entries = this.buffer.getAllEntriesSorted();
    const batchIds = batches.map((b) => b.batchId);
    let totalBytes = 0;
    for (const b of batches) {
      totalBytes += b.sizeBytes;
    }

    try {
      // Write to R2
      const timestamp = Date.now();
      const path = `${this.config.r2BasePath}/cdc/${timestamp}.json`;

      // Format data for R2 (in production, would use Parquet/Avro)
      const data = {
        trigger,
        timestamp,
        entryCount: entries.length,
        batchCount: batches.length,
        entries,
      };

      await this.env.LAKEHOUSE_BUCKET.put(path, JSON.stringify(data), {
        httpMetadata: {
          contentType: 'application/json',
        },
        customMetadata: {
          trigger,
          entryCount: String(entries.length),
          batchCount: String(batches.length),
        },
      });

      // Mark batches as persisted
      this.buffer.markPersisted(batchIds);
      this.buffer.clearPersisted();

      return {
        success: true,
        batchesFlushed: batches.length,
        entriesFlushed: entries.length,
        bytesWritten: totalBytes,
        paths: [path],
        durationMs: Date.now() - startTime,
        usedFallback: false,
      };
    } catch (error) {
      console.error('R2 flush failed, using fallback:', error);

      // Fall back to local storage
      if (this.config.enableFallback) {
        try {
          await this.fallback.store(entries);
          this.buffer.markInFallback(batchIds);
          this.buffer.clearPersisted();

          return {
            success: true,
            batchesFlushed: batches.length,
            entriesFlushed: entries.length,
            bytesWritten: totalBytes,
            paths: [],
            durationMs: Date.now() - startTime,
            usedFallback: true,
          };
        } catch (fallbackError) {
          return {
            success: false,
            batchesFlushed: 0,
            entriesFlushed: 0,
            bytesWritten: 0,
            paths: [],
            durationMs: Date.now() - startTime,
            usedFallback: true,
            error: String(fallbackError),
          };
        }
      }

      return {
        success: false,
        batchesFlushed: 0,
        entriesFlushed: 0,
        bytesWritten: 0,
        paths: [],
        durationMs: Date.now() - startTime,
        usedFallback: false,
        error: String(error),
      };
    }
  }

  // ===========================================================================
  // Alarm Handler
  // ===========================================================================

  /**
   * Handle scheduled alarm
   *
   * Used for periodic flushes when DO is not receiving messages.
   */
  async alarm(): Promise<void> {
    const stats = this.buffer.getStats();

    // Flush if there's data in the buffer
    if (stats.entryCount > 0) {
      await this.flush('threshold_time');
    }

    // Recover from fallback if needed
    if (this.fallback.hasData()) {
      await this.recoverFromFallback();
    }

    // Schedule next alarm
    await this.scheduleAlarm();
  }

  /**
   * Schedule the next alarm
   */
  private async scheduleAlarm(): Promise<void> {
    const nextAlarm = Date.now() + this.config.flushIntervalMs;
    await this.ctx.storage.setAlarm(nextAlarm);
  }

  // ===========================================================================
  // Recovery
  // ===========================================================================

  /**
   * Recover data from fallback storage to R2
   */
  private async recoverFromFallback(): Promise<void> {
    this.state = 'recovering';

    try {
      const entries = await this.fallback.retrieve();
      if (entries.length === 0) {
        this.state = 'idle';
        return;
      }

      // Write to R2
      const timestamp = Date.now();
      const path = `${this.config.r2BasePath}/cdc/recovered_${timestamp}.json`;

      const data = {
        trigger: 'recovery',
        timestamp,
        entryCount: entries.length,
        recovered: true,
        entries,
      };

      await this.env.LAKEHOUSE_BUCKET.put(path, JSON.stringify(data), {
        httpMetadata: {
          contentType: 'application/json',
        },
        customMetadata: {
          trigger: 'recovery',
          entryCount: String(entries.length),
          recovered: 'true',
        },
      });

      // Clear fallback storage
      await this.fallback.clear();
    } catch (error) {
      console.error('Fallback recovery failed:', error);
    } finally {
      this.state = 'idle';
    }
  }

  /**
   * Restore state from hibernation
   */
  private async restoreFromHibernation(): Promise<void> {
    // Restore buffer state if saved
    try {
      const snapshot = await this.ctx.storage.get<BufferSnapshot>('buffer_snapshot');
      if (snapshot) {
        this.buffer = CDCBufferManager.restore(snapshot, this.config);
        await this.ctx.storage.delete('buffer_snapshot');
      }
    } catch {
      // Ignore errors, start fresh
    }

    // Restore WebSocket connections from getWebSockets()
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const attachment = this.deserializeAttachment(ws);
      if (attachment) {
        this.buffer.updateChildState(
          attachment.childDoId,
          0,
          attachment.lastAckSequence,
          attachment.childShardName
        );
        this.buffer.registerChildWebSocket(attachment.childDoId, ws);
      }
    }
  }

  /**
   * Deserialize WebSocket attachment
   */
  private deserializeAttachment(ws: WebSocket): WebSocketAttachment | null {
    try {
      return ws.deserializeAttachment() as WebSocketAttachment;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // HTTP Handlers
  // ===========================================================================

  /**
   * Handle status request
   */
  private handleStatusRequest(): Response {
    const stats = this.buffer.getStats();
    const sockets = this.ctx.getWebSockets();

    return new Response(
      JSON.stringify({
        state: this.state,
        buffer: stats,
        connectedChildren: sockets.length,
        childStates: Array.from(this.buffer.getChildStates().entries()).map(
          ([id, state]) => ({
            id,
            ...state,
            ws: undefined, // Don't serialize WebSocket
          })
        ),
        fallbackHasData: this.fallback.hasData(),
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  /**
   * Handle flush request
   */
  private async handleFlushRequest(): Promise<Response> {
    const result = await this.flush('manual');
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

