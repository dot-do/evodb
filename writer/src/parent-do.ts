/**
 * LakehouseParentDO
 *
 * Parent Durable Object that:
 * - Receives CDC from child DOs via WebSocket
 * - Buffers and writes blocks to R2
 * - Handles compaction via alarms
 * - Supports hibernation for cost efficiency
 * - Integrates with @evodb/rpc for CDC message handling
 */

import { LakehouseWriter } from './writer.js';
import type {
  ParentDOEnv,
  CDCMessage,
  AckRPCPayload as _AckRPCPayload,
  WriterOptions,
  FlushResult,
  CompactResult,
  PartitionMode,
} from './types.js';
import { unbatchWalEntries } from '@evodb/core';
import type {
  CDCBatchMessage,
  ConnectMessage,
  HeartbeatMessage,
  FlushRequestMessage,
  AckMessage,
  NackMessage,
  AckStatus,
} from '@evodb/rpc';

/**
 * WebSocket with metadata for tracking
 */
interface TrackedWebSocket extends WebSocket {
  /** Source DO ID */
  sourceDoId?: string;
  /** Last received sequence number */
  lastSequence?: bigint;
  /** Connection time */
  connectedAt?: number;
  /** Protocol version */
  protocolVersion?: number;
  /** Uses binary protocol */
  usesBinaryProtocol?: boolean;
}

/**
 * Abstract base class for Parent DO
 * Extend this with your own implementation
 */
export abstract class LakehouseParentDO {
  protected readonly state: DurableObjectState;
  protected readonly env: ParentDOEnv;
  protected writer: LakehouseWriter;
  protected connectedSockets: Map<string, TrackedWebSocket> = new Map();

  constructor(state: DurableObjectState, env: ParentDOEnv) {
    this.state = state;
    this.env = env;

    // Initialize writer - subclass should provide tableLocation
    this.writer = new LakehouseWriter({
      r2Bucket: env.R2_BUCKET,
      tableLocation: this.getTableLocation(),
      partitionMode: this.getPartitionMode(),
      ...this.getWriterOptions(),
    });

    // Set DO storage for fallback
    this.writer.setDOStorage(state.storage);
  }

  /**
   * Get the table location for this DO (override in subclass)
   */
  protected abstract getTableLocation(): string;

  /**
   * Get the partition mode (override to customize)
   */
  protected getPartitionMode(): PartitionMode {
    return 'do-sqlite'; // Default to DO SQLite mode
  }

  /**
   * Get additional writer options (override to customize)
   */
  protected getWriterOptions(): Partial<WriterOptions> {
    return {};
  }

  /**
   * Initialize the writer (call in fetch/webSocketMessage)
   */
  protected async initialize(): Promise<void> {
    await this.writer.loadState();
    await this.scheduleNextAlarm();
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // API routes
    switch (url.pathname) {
      case '/stats':
        return this.handleStats();
      case '/flush':
        return this.handleManualFlush();
      case '/compact':
        return this.handleManualCompact();
      case '/health':
        return this.handleHealth();
      case '/partition-mode':
        return this.handlePartitionMode();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  /**
   * Handle WebSocket upgrade
   */
  private handleWebSocketUpgrade(request: Request): Response {
    const url = new URL(request.url);
    const sourceDoId = url.searchParams.get('sourceDoId');

    if (!sourceDoId) {
      return new Response('Missing sourceDoId parameter', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Track the socket
    const trackedSocket = server as TrackedWebSocket;
    trackedSocket.sourceDoId = sourceDoId;
    trackedSocket.connectedAt = Date.now();
    trackedSocket.lastSequence = 0n;
    trackedSocket.protocolVersion = 1;
    trackedSocket.usesBinaryProtocol = url.searchParams.get('binary') === 'true';

    // Accept with hibernation support
    this.state.acceptWebSocket(server);
    this.connectedSockets.set(sourceDoId, trackedSocket);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket message (hibernation-compatible)
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const trackedWs = ws as TrackedWebSocket;
    const sourceDoId = trackedWs.sourceDoId;

    if (!sourceDoId) {
      ws.close(1008, 'Not authenticated');
      return;
    }

    try {
      // Ensure initialized
      await this.initialize();

      // Handle binary CDC message
      if (message instanceof ArrayBuffer) {
        const data = new Uint8Array(message);
        await this.handleBinaryCDCMessage(trackedWs, data);
        return;
      }

      // Handle text message (JSON)
      const parsed = JSON.parse(message as string);
      await this.handleJsonMessage(trackedWs, parsed);
    } catch (error) {
      console.error('Error handling WebSocket message:', error);

      // Send error acknowledgment
      this.sendNack(
        ws,
        trackedWs.lastSequence ?? 0n,
        'internal_error',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Handle binary CDC message (batched WAL entries)
   */
  private async handleBinaryCDCMessage(ws: TrackedWebSocket, data: Uint8Array): Promise<void> {
    // Parse message header (16 bytes)
    // Format: sequenceNumber(8) + entryCount(4) + reserved(4)
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const sequenceNumber = view.getBigUint64(0, true);
    const entryCount = view.getUint32(8, true);

    // Extract batched entries
    const entriesData = data.subarray(16);
    const entries = unbatchWalEntries(entriesData);

    if (entries.length !== entryCount) {
      console.warn(`Entry count mismatch: expected ${entryCount}, got ${entries.length}`);
    }

    // Check for backpressure
    if (this.writer.shouldApplyBackpressure()) {
      const delay = this.writer.getBackpressureDelay();
      this.sendNack(ws, sequenceNumber, 'buffer_full', `Buffer full, retry after ${delay}ms`, delay);
      return;
    }

    // Receive CDC
    await this.writer.receiveCDC(ws.sourceDoId!, entries);
    ws.lastSequence = sequenceNumber;

    // Check if we should flush
    if (this.writer.shouldFlush()) {
      const result = await this.writer.flush();
      await this.onFlush(result);
    }

    // Send acknowledgment
    this.sendAck(ws, sequenceNumber, 'buffered', entries.length);

    // Update alarm
    await this.scheduleNextAlarm();
  }

  /**
   * Handle JSON message (from @evodb/rpc)
   */
  private async handleJsonMessage(
    ws: TrackedWebSocket,
    message: CDCBatchMessage | ConnectMessage | HeartbeatMessage | FlushRequestMessage | CDCMessage
  ): Promise<void> {
    // Handle @evodb/rpc message types
    if ('type' in message) {
      switch (message.type) {
        case 'cdc_batch':
          await this.handleCDCBatchMessage(ws, message as CDCBatchMessage);
          break;
        case 'connect':
          await this.handleConnectMessage(ws, message as ConnectMessage);
          break;
        case 'heartbeat':
          await this.handleHeartbeatMessage(ws, message as HeartbeatMessage);
          break;
        case 'flush_request':
          await this.handleFlushRequestMessage(ws, message as FlushRequestMessage);
          break;
        case 'cdc':
          // Legacy CDC message format
          await this.handleLegacyCDCMessage(ws, message as CDCMessage);
          break;
        default:
          console.warn('Unknown message type:', (message as { type: string }).type);
      }
    }
  }

  /**
   * Handle CDC batch message from @evodb/rpc
   */
  private async handleCDCBatchMessage(ws: TrackedWebSocket, message: CDCBatchMessage): Promise<void> {
    // Check for backpressure
    if (this.writer.shouldApplyBackpressure()) {
      const delay = this.writer.getBackpressureDelay();
      this.sendNack(ws, BigInt(message.sequenceNumber), 'buffer_full', `Buffer full, retry after ${delay}ms`, delay);
      return;
    }

    // Convert RPC WalEntry to core WalEntry
    const entries = message.entries.map((e: { sequence: number; timestamp: number; operation: string; after?: unknown; before?: unknown }) => ({
      lsn: BigInt(e.sequence),
      timestamp: BigInt(e.timestamp),
      op: e.operation === 'INSERT' ? 1 : e.operation === 'UPDATE' ? 2 : 3,
      flags: 0,
      data: new TextEncoder().encode(JSON.stringify(e.after ?? e.before)),
      checksum: 0,
    }));

    await this.writer.receiveCDC(ws.sourceDoId!, entries);
    ws.lastSequence = BigInt(message.sequenceNumber);

    // Check if we should flush
    if (this.writer.shouldFlush()) {
      const result = await this.writer.flush();
      await this.onFlush(result);
    }

    // Send acknowledgment
    this.sendAck(ws, BigInt(message.sequenceNumber), 'buffered', entries.length);

    // Update alarm
    await this.scheduleNextAlarm();
  }

  /**
   * Handle connect message
   */
  private async handleConnectMessage(ws: TrackedWebSocket, message: ConnectMessage): Promise<void> {
    ws.protocolVersion = message.protocolVersion;
    ws.usesBinaryProtocol = message.capabilities.binaryProtocol;

    // Send status response
    const stats = this.writer.getStats();
    const statusMessage = {
      type: 'status',
      timestamp: Date.now(),
      state: stats.buffer.readyToFlush ? 'receiving' : 'idle',
      buffer: {
        batchCount: stats.blocks.pendingBlockCount,
        entryCount: stats.buffer.entryCount,
        totalSizeBytes: stats.buffer.estimatedSize,
        utilization: Math.min(1, stats.buffer.entryCount / 10000),
      },
      connectedChildren: this.connectedSockets.size,
      lastFlushTime: stats.timing.lastFlushTime ?? undefined,
    };

    ws.send(JSON.stringify(statusMessage));
  }

  /**
   * Handle heartbeat message
   */
  private async handleHeartbeatMessage(ws: TrackedWebSocket, _message: HeartbeatMessage): Promise<void> {
    // Update last activity timestamp
    ws.connectedAt = Date.now();

    // Send ack
    this.sendAck(ws, ws.lastSequence ?? 0n, 'ok', 0);
  }

  /**
   * Handle flush request message
   */
  private async handleFlushRequestMessage(ws: TrackedWebSocket, _message: FlushRequestMessage): Promise<void> {
    const result = await this.writer.flush();
    await this.onFlush(result);

    // Send ack with flush result
    const status: AckStatus = result.status === 'persisted' ? 'persisted' : 'buffered';
    this.sendAck(ws, ws.lastSequence ?? 0n, status, result.entryCount, result.block?.r2Key);
  }

  /**
   * Handle legacy CDC message format
   */
  private async handleLegacyCDCMessage(ws: TrackedWebSocket, message: CDCMessage): Promise<void> {
    if (message.type !== 'cdc' || !message.entries) {
      return;
    }

    // Convert JSON entries to WalEntry
    const entries = message.entries;
    const sequenceNumber = message.sequenceNumber;

    await this.writer.receiveCDC(ws.sourceDoId!, entries);
    ws.lastSequence = sequenceNumber;

    // Check if we should flush
    if (this.writer.shouldFlush()) {
      const result = await this.writer.flush();
      await this.onFlush(result);
    }

    // Send acknowledgment
    this.sendAck(ws, sequenceNumber, 'buffered', entries.length);

    // Update alarm
    await this.scheduleNextAlarm();
  }

  /**
   * Send acknowledgment to client
   */
  private sendAck(
    ws: WebSocket,
    sequenceNumber: bigint,
    status: AckStatus,
    entriesProcessed: number,
    persistedPath?: string
  ): void {
    const stats = this.writer.getStats();

    const ack: AckMessage = {
      type: 'ack',
      timestamp: Date.now(),
      sequenceNumber: Number(sequenceNumber),
      status,
      details: {
        entriesProcessed,
        bufferUtilization: Math.min(1, stats.buffer.entryCount / 10000),
        timeUntilFlush: this.writer.getTimeToFlush() ?? undefined,
        persistedPath,
      },
    };

    ws.send(JSON.stringify(ack));
  }

  /**
   * Send negative acknowledgment to client
   */
  private sendNack(
    ws: WebSocket,
    sequenceNumber: bigint,
    reason: 'buffer_full' | 'rate_limited' | 'invalid_sequence' | 'invalid_format' | 'internal_error' | 'shutting_down',
    errorMessage: string,
    retryDelayMs?: number
  ): void {
    const nack: NackMessage = {
      type: 'nack',
      timestamp: Date.now(),
      sequenceNumber: Number(sequenceNumber),
      reason,
      errorMessage,
      shouldRetry: reason === 'buffer_full' || reason === 'rate_limited',
      retryDelayMs,
    };

    ws.send(JSON.stringify(nack));
  }

  /**
   * Handle WebSocket close (hibernation-compatible)
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const trackedWs = ws as TrackedWebSocket;
    const sourceDoId = trackedWs.sourceDoId;

    if (sourceDoId) {
      this.connectedSockets.delete(sourceDoId);
      this.writer.markSourceDisconnected(sourceDoId);
    }

    console.log(`WebSocket closed: ${sourceDoId} (${code}: ${reason})`);
  }

  /**
   * Handle WebSocket error (hibernation-compatible)
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const trackedWs = ws as TrackedWebSocket;
    console.error(`WebSocket error for ${trackedWs.sourceDoId}:`, error);
  }

  /**
   * Handle alarm (called periodically by DO runtime)
   */
  async alarm(): Promise<void> {
    try {
      await this.initialize();

      // Flush buffer if needed
      if (this.writer.shouldFlush()) {
        const result = await this.writer.flush();
        await this.onFlush(result);
      }

      // Retry pending blocks
      if (this.writer.getPendingBlockCount() > 0) {
        const { succeeded, failed } = await this.writer.retryPendingBlocks();
        if (succeeded > 0 || failed > 0) {
          console.log(`Retry pending blocks: ${succeeded} succeeded, ${failed} failed`);
        }
      }

      // Check if compaction needed
      const stats = this.writer.getStats();
      if (stats.blocks.smallBlockCount >= 4) {
        const result = await this.writer.compact();
        await this.onCompact(result);
      }

      // Schedule next alarm
      await this.scheduleNextAlarm();
    } catch (error) {
      console.error('Alarm error:', error);
      // Schedule retry alarm
      await this.state.storage.setAlarm(Date.now() + 30000);
    }
  }

  /**
   * Schedule next alarm based on writer state
   */
  private async scheduleNextAlarm(): Promise<void> {
    const nextAlarmTime = this.writer.getNextAlarmTime();

    if (nextAlarmTime !== null) {
      await this.state.storage.setAlarm(nextAlarmTime);
    }
  }

  /**
   * Callback when flush completes (override to customize)
   */
  protected async onFlush(result: FlushResult): Promise<void> {
    if (result.status === 'persisted') {
      console.log(`Flushed ${result.entryCount} entries to R2 in ${result.durationMs}ms`);
    } else if (result.status === 'buffered') {
      console.warn(`Flush failed, buffered to DO: ${result.error}`);
    }
  }

  /**
   * Callback when compaction completes (override to customize)
   */
  protected async onCompact(result: CompactResult): Promise<void> {
    if (result.status === 'completed') {
      console.log(`Compacted ${result.blocksMerged} blocks in ${result.durationMs}ms`);
    }
  }

  /**
   * Handle /stats endpoint
   */
  private handleStats(): Response {
    const stats = this.writer.getStats();

    // Convert Maps to objects for JSON serialization
    const serializedStats = {
      ...stats,
      sources: Object.fromEntries(
        Array.from(stats.sources.entries()).map(([k, v]) => [
          k,
          { ...v, lastLsn: v.lastLsn.toString() },
        ])
      ),
    };

    return Response.json(serializedStats);
  }

  /**
   * Handle /flush endpoint (manual flush)
   */
  private async handleManualFlush(): Promise<Response> {
    await this.initialize();
    const result = await this.writer.flush();
    await this.onFlush(result);
    return Response.json(result);
  }

  /**
   * Handle /compact endpoint (manual compaction)
   */
  private async handleManualCompact(): Promise<Response> {
    await this.initialize();
    const result = await this.writer.compact();
    await this.onCompact(result);
    return Response.json(result);
  }

  /**
   * Handle /health endpoint
   */
  private handleHealth(): Response {
    const stats = this.writer.getStats();

    const health = {
      status: 'healthy' as 'healthy' | 'degraded' | 'unhealthy',
      connectedSources: this.connectedSockets.size,
      bufferEntries: stats.buffer.entryCount,
      pendingBlocks: stats.blocks.pendingBlockCount,
      r2Blocks: stats.blocks.r2BlockCount,
      lastFlushTime: stats.timing.lastFlushTime,
      r2WriteFailures: stats.operations.r2WriteFailures,
      partitionMode: stats.partitionMode,
    };

    // Determine health status
    if (stats.blocks.pendingBlockCount > 10) {
      health.status = 'unhealthy';
    } else if (stats.blocks.pendingBlockCount > 0 || stats.buffer.entryCount > 50000) {
      health.status = 'degraded';
    }

    return Response.json(health);
  }

  /**
   * Handle /partition-mode endpoint
   */
  private handlePartitionMode(): Response {
    return Response.json({
      partitionMode: this.writer.getPartitionMode(),
      metrics: this.writer.getCompactionMetrics(),
    });
  }

  /**
   * Broadcast message to all connected sockets
   */
  protected broadcastMessage(message: unknown): void {
    const json = JSON.stringify(message);
    for (const ws of this.connectedSockets.values()) {
      try {
        ws.send(json);
      } catch (error) {
        console.error('Failed to send to socket:', error);
      }
    }
  }

  /**
   * Get writer for direct access
   */
  protected getWriter(): LakehouseWriter {
    return this.writer;
  }
}

/**
 * Example concrete implementation with default partition mode
 */
export class ExampleLakehouseParentDO extends LakehouseParentDO {
  protected getTableLocation(): string {
    // Extract from DO ID or use a default
    return 'com/example/api/users';
  }

  protected getPartitionMode(): PartitionMode {
    return 'do-sqlite';
  }

  protected getWriterOptions(): Partial<WriterOptions> {
    return {
      bufferSize: 5000,
      bufferTimeout: 3000,
    };
  }
}

/**
 * Factory function to create Parent DO class with custom table location
 */
export function createLakehouseParentDOClass(
  tableLocation: string,
  partitionMode: PartitionMode = 'do-sqlite',
  options?: Partial<WriterOptions>
): new (state: DurableObjectState, env: ParentDOEnv) => LakehouseParentDO {
  return class extends LakehouseParentDO {
    protected getTableLocation(): string {
      return tableLocation;
    }

    protected getPartitionMode(): PartitionMode {
      return partitionMode;
    }

    protected getWriterOptions(): Partial<WriterOptions> {
      return options ?? {};
    }
  };
}

/**
 * Pre-configured Parent DO for edge cache mode (500MB blocks)
 */
export abstract class EdgeCacheParentDO extends LakehouseParentDO {
  protected abstract getTableLocation(): string;

  protected getPartitionMode(): PartitionMode {
    return 'edge-cache';
  }

  protected getWriterOptions(): Partial<WriterOptions> {
    return {
      bufferSize: 50000,
      bufferTimeout: 30000,
    };
  }
}

/**
 * Pre-configured Parent DO for enterprise mode (5GB blocks)
 */
export abstract class EnterpriseParentDO extends LakehouseParentDO {
  protected abstract getTableLocation(): string;

  protected getPartitionMode(): PartitionMode {
    return 'enterprise';
  }

  protected getWriterOptions(): Partial<WriterOptions> {
    return {
      bufferSize: 100000,
      bufferTimeout: 60000,
    };
  }
}
