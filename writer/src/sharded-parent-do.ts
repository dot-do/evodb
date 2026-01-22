/**
 * ShardedParentDO - Sharded writer coordinator
 *
 * Provides two main components:
 * 1. ShardCoordinator - Entry point that routes CDC to appropriate shards
 * 2. ShardWriterDO - Individual shard writer that handles CDC for its partition
 *
 * Architecture:
 * ```
 * Child DO 1 ─┐
 * Child DO 2 ─┼─→ ShardCoordinator ─┬→ ShardWriterDO-0 → R2
 * Child DO 3 ─┤     (router)       ├→ ShardWriterDO-1 → R2
 * Child DO N ─┘                    ├→ ShardWriterDO-2 → R2
 *                                  └→ ShardWriterDO-N → R2
 * ```
 *
 * @packageDocumentation
 */

import { LakehouseWriter } from './writer.js';
import { ShardRouter, type ShardKey } from './shard-router.js';
import type {
  ParentDOEnv,
  WriterOptions,
  FlushResult,
  PartitionMode,
  WriterStats,
} from './types.js';
import { unbatchWalEntries, isArray, isRecord, isString, isNumber, type WalEntry } from '@evodb/core';
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
 * Environment bindings for sharded parent DO
 */
export interface ShardedParentDOEnv extends ParentDOEnv {
  /** Shard writer DO namespace */
  SHARD_WRITERS: DurableObjectNamespace;
}

/**
 * Configuration for sharded parent DO
 */
export interface ShardedParentDOConfig {
  /** Number of shards */
  shardCount: number;
  /** Base table location */
  tableLocation: string;
  /** Partition mode */
  partitionMode?: PartitionMode;
  /** Writer options */
  writerOptions?: Partial<WriterOptions>;
  /** Shard ID prefix */
  shardIdPrefix?: string;
}

/**
 * Message envelope for shard routing
 */
interface ShardedCDCMessage {
  type: 'cdc_batch';
  /** Original source DO ID */
  sourceDoId: string;
  /** Tenant from routing key */
  tenant: string;
  /** Table from routing key */
  table: string;
  /** Sequence number */
  sequenceNumber: bigint;
  /** WAL entries */
  entries: WalEntry[];
}

/**
 * WebSocket with routing metadata
 */
interface RoutedWebSocket extends WebSocket {
  /** Source DO ID */
  sourceDoId?: string;
  /** Tenant for routing */
  tenant?: string;
  /** Table for routing */
  table?: string;
  /** Last sequence number */
  lastSequence?: bigint;
  /** Connected at timestamp */
  connectedAt?: number;
  /** Uses binary protocol */
  usesBinaryProtocol?: boolean;
}

/**
 * ShardCoordinator - Routes CDC messages to appropriate shard writers
 *
 * This is the entry point for CDC streams. It:
 * 1. Receives WebSocket connections from child DOs
 * 2. Extracts routing key (tenant/table) from messages
 * 3. Routes messages to appropriate shard writers
 * 4. Forwards acknowledgments back to child DOs
 *
 * @example
 * ```typescript
 * // In wrangler.toml:
 * // [[durable_objects.bindings]]
 * // name = "SHARD_COORDINATOR"
 * // class_name = "ShardCoordinator"
 * //
 * // [[durable_objects.bindings]]
 * // name = "SHARD_WRITERS"
 * // class_name = "ShardWriterDO"
 *
 * export class MyShardCoordinator extends ShardCoordinator {
 *   protected getConfig(): ShardedParentDOConfig {
 *     return {
 *       shardCount: 16,
 *       tableLocation: 'com/example/api',
 *     };
 *   }
 * }
 * ```
 */
export abstract class ShardCoordinator {
  protected readonly state: DurableObjectState;
  protected readonly env: ShardedParentDOEnv;
  protected readonly router: ShardRouter;
  protected readonly connectedSockets: Map<string, RoutedWebSocket> = new Map();

  /** Pending acks waiting for shard responses */
  protected readonly pendingAcks: Map<string, {
    ws: WebSocket;
    sequenceNumber: bigint;
    timestamp: number;
  }> = new Map();

  constructor(state: DurableObjectState, env: ShardedParentDOEnv) {
    this.state = state;
    this.env = env;

    const config = this.getConfig();
    this.router = new ShardRouter({
      shardCount: config.shardCount,
      namespaceBinding: 'SHARD_WRITERS',
      shardIdPrefix: config.shardIdPrefix ?? 'shard',
    });
  }

  /**
   * Get sharded parent DO configuration (override in subclass)
   */
  protected abstract getConfig(): ShardedParentDOConfig;

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
        return this.handleAggregatedStats();
      case '/shards':
        return this.handleShardList();
      case '/route':
        return this.handleRouteQuery(url);
      case '/health':
        return this.handleHealth();
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
    const tenant = url.searchParams.get('tenant');
    const table = url.searchParams.get('table');

    if (!sourceDoId) {
      return new Response('Missing sourceDoId parameter', { status: 400 });
    }

    if (!tenant || !table) {
      return new Response('Missing tenant or table parameter for routing', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Track the socket with routing info
    const routedSocket = server as RoutedWebSocket;
    routedSocket.sourceDoId = sourceDoId;
    routedSocket.tenant = tenant;
    routedSocket.table = table;
    routedSocket.connectedAt = Date.now();
    routedSocket.lastSequence = 0n;
    routedSocket.usesBinaryProtocol = url.searchParams.get('binary') === 'true';

    // Accept with hibernation support
    this.state.acceptWebSocket(server);
    this.connectedSockets.set(sourceDoId, routedSocket);

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket message
   */
  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    const routedWs = ws as RoutedWebSocket;
    const sourceDoId = routedWs.sourceDoId;

    if (!sourceDoId) {
      ws.close(1008, 'Not authenticated');
      return;
    }

    try {
      // Handle binary CDC message
      if (message instanceof ArrayBuffer) {
        const data = new Uint8Array(message);
        await this.handleBinaryCDCMessage(routedWs, data);
        return;
      }

      // Handle JSON message
      const parsed = JSON.parse(message as string);
      await this.handleJsonMessage(routedWs, parsed);
    } catch (error) {
      // WebSocket message handling error - send NACK to client
      // Note: In production, this should be logged through @evodb/observability
      this.sendNack(
        ws,
        routedWs.lastSequence ?? 0n,
        'internal_error',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Handle binary CDC message
   */
  private async handleBinaryCDCMessage(ws: RoutedWebSocket, data: Uint8Array): Promise<void> {
    if (!ws.tenant || !ws.table || !ws.sourceDoId) {
      throw new Error('WebSocket missing required routing metadata (tenant, table, or sourceDoId)');
    }

    // Parse message header
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const sequenceNumber = view.getBigUint64(0, true);
    // Entry count is in bytes 8-12 but we extract entries directly from unbatch
    void view.getUint32(8, true);

    // Extract entries
    const entriesData = data.subarray(16);
    const entries = unbatchWalEntries(entriesData);

    // Get routing key
    const key: ShardKey = {
      tenant: ws.tenant,
      table: ws.table,
    };

    // Route to shard
    await this.routeToShard(key, ws.sourceDoId, sequenceNumber, entries, ws);
    ws.lastSequence = sequenceNumber;
  }

  /**
   * Handle JSON message
   */
  private async handleJsonMessage(
    ws: RoutedWebSocket,
    message: CDCBatchMessage | ConnectMessage | HeartbeatMessage | FlushRequestMessage
  ): Promise<void> {
    if (!('type' in message)) return;

    switch (message.type) {
      case 'cdc_batch':
        await this.handleCDCBatch(ws, message as CDCBatchMessage);
        break;
      case 'connect':
        await this.handleConnect(ws, message as ConnectMessage);
        break;
      case 'heartbeat':
        await this.handleHeartbeat(ws);
        break;
      case 'flush_request':
        await this.handleFlushRequest(ws);
        break;
    }
  }

  /**
   * Handle CDC batch message
   */
  private async handleCDCBatch(ws: RoutedWebSocket, message: CDCBatchMessage): Promise<void> {
    if (!ws.tenant || !ws.table || !ws.sourceDoId) {
      throw new Error('WebSocket missing required routing metadata (tenant, table, or sourceDoId)');
    }

    const key: ShardKey = {
      tenant: ws.tenant,
      table: ws.table,
    };

    // Convert entries
    const entries: WalEntry[] = message.entries.map((e: { sequence: number; timestamp: number; operation: string; after?: unknown; before?: unknown }) => ({
      lsn: BigInt(e.sequence),
      timestamp: BigInt(e.timestamp),
      op: e.operation === 'INSERT' ? 1 : e.operation === 'UPDATE' ? 2 : 3,
      flags: 0,
      data: new TextEncoder().encode(JSON.stringify(e.after ?? e.before)),
      checksum: 0,
    }));

    await this.routeToShard(key, ws.sourceDoId, BigInt(message.sequenceNumber), entries, ws);
    ws.lastSequence = BigInt(message.sequenceNumber);
  }

  /**
   * Route CDC to appropriate shard
   */
  private async routeToShard(
    key: ShardKey,
    sourceDoId: string,
    sequenceNumber: bigint,
    entries: WalEntry[],
    ws: WebSocket
  ): Promise<void> {
    // Get shard stub for routing
    void this.router.getShard(key); // Validates key is routable
    const stub = this.router.getShardStub(this.env.SHARD_WRITERS, key);

    // Create pending ack entry
    const ackId = `${sourceDoId}-${sequenceNumber}`;
    this.pendingAcks.set(ackId, {
      ws,
      sequenceNumber,
      timestamp: Date.now(),
    });

    try {
      // Serialize entries for sending to shard
      const shardMessage: ShardedCDCMessage = {
        type: 'cdc_batch',
        sourceDoId,
        tenant: key.tenant,
        table: key.table,
        sequenceNumber,
        entries,
      };

      // Send to shard via HTTP (shard DO will handle internally)
      const response = await stub.fetch('https://shard/cdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shardMessage, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ),
      });

      if (response.ok) {
        const result = await response.json() as { status: AckStatus; entryCount: number; r2Key?: string };
        this.sendAck(ws, sequenceNumber, result.status, result.entryCount, result.r2Key);
      } else {
        const error = await response.text();
        this.sendNack(ws, sequenceNumber, 'internal_error', error);
      }
    } catch (error) {
      this.sendNack(
        ws,
        sequenceNumber,
        'internal_error',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      this.pendingAcks.delete(ackId);
    }
  }

  /**
   * Handle connect message
   */
  private async handleConnect(ws: RoutedWebSocket, _message: ConnectMessage): Promise<void> {
    if (!ws.tenant || !ws.table) {
      throw new Error('WebSocket missing required routing metadata (tenant or table)');
    }

    // Send status response
    const statusMessage = {
      type: 'status',
      timestamp: Date.now(),
      state: 'routing',
      shardCount: this.router.shardCount,
      connectedChildren: this.connectedSockets.size,
      assignedShard: this.router.getShard({
        tenant: ws.tenant,
        table: ws.table,
      }).shardNumber,
    };

    ws.send(JSON.stringify(statusMessage));
  }

  /**
   * Handle heartbeat message
   */
  private async handleHeartbeat(ws: RoutedWebSocket): Promise<void> {
    ws.connectedAt = Date.now();
    this.sendAck(ws, ws.lastSequence ?? 0n, 'ok', 0);
  }

  /**
   * Handle flush request
   */
  private async handleFlushRequest(ws: RoutedWebSocket): Promise<void> {
    if (!ws.tenant || !ws.table) {
      throw new Error('WebSocket missing required routing metadata (tenant or table)');
    }

    const key: ShardKey = {
      tenant: ws.tenant,
      table: ws.table,
    };

    const stub = this.router.getShardStub(this.env.SHARD_WRITERS, key);

    try {
      const response = await stub.fetch('https://shard/flush', { method: 'POST' });
      const result = await response.json() as FlushResult;
      const status: AckStatus = result.status === 'persisted' ? 'persisted' : 'buffered';
      this.sendAck(ws, ws.lastSequence ?? 0n, status, result.entryCount, result.block?.r2Key);
    } catch (error) {
      this.sendNack(
        ws,
        ws.lastSequence ?? 0n,
        'internal_error',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Send acknowledgment
   */
  private sendAck(
    ws: WebSocket,
    sequenceNumber: bigint,
    status: AckStatus,
    entriesProcessed: number,
    persistedPath?: string
  ): void {
    const ack: AckMessage = {
      type: 'ack',
      timestamp: Date.now(),
      sequenceNumber: Number(sequenceNumber),
      status,
      details: {
        entriesProcessed,
        bufferUtilization: 0,
        persistedPath,
      },
    };
    ws.send(JSON.stringify(ack));
  }

  /**
   * Send negative acknowledgment
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
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    const routedWs = ws as RoutedWebSocket;
    if (routedWs.sourceDoId) {
      this.connectedSockets.delete(routedWs.sourceDoId);
    }
  }

  /**
   * Handle WebSocket error
   */
  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    // WebSocket error occurred - state will be cleaned up on close
    // Note: In production, this should be logged through @evodb/observability
    void (ws as RoutedWebSocket).sourceDoId; // Acknowledge the error context
  }

  /**
   * Handle /stats endpoint - aggregate stats from all shards
   */
  private async handleAggregatedStats(): Promise<Response> {
    const stats = {
      shardCount: this.router.shardCount,
      connectedSources: this.connectedSockets.size,
      pendingAcks: this.pendingAcks.size,
      shardStats: [] as Array<{ shardNumber: number; stats: WriterStats | null }>,
    };

    // Fetch stats from all shards in parallel
    const promises = [];
    for (let i = 0; i < this.router.shardCount; i++) {
      const shardId = this.router.generateShardId(i);
      const id = this.env.SHARD_WRITERS.idFromName(shardId);
      const stub = this.env.SHARD_WRITERS.get(id);

      promises.push(
        (async () => {
          try {
            const response = await stub.fetch('https://shard/stats');
            const shardStats = await response.json() as WriterStats;
            return { shardNumber: i, stats: shardStats };
          } catch {
            return { shardNumber: i, stats: null };
          }
        })()
      );
    }

    stats.shardStats = await Promise.all(promises);

    return Response.json(stats);
  }

  /**
   * Handle /shards endpoint - list all shards
   */
  private handleShardList(): Response {
    const shards = [];
    for (let i = 0; i < this.router.shardCount; i++) {
      shards.push({
        shardNumber: i,
        shardId: this.router.generateShardId(i),
      });
    }
    return Response.json({ shardCount: this.router.shardCount, shards });
  }

  /**
   * Handle /route endpoint - query routing
   */
  private handleRouteQuery(url: URL): Response {
    const tenant = url.searchParams.get('tenant');
    const table = url.searchParams.get('table');

    if (!tenant || !table) {
      return new Response('Missing tenant or table parameter', { status: 400 });
    }

    const shardInfo = this.router.getShard({ tenant, table });
    return Response.json(shardInfo);
  }

  /**
   * Handle /health endpoint
   */
  private handleHealth(): Response {
    return Response.json({
      status: 'healthy',
      shardCount: this.router.shardCount,
      connectedSources: this.connectedSockets.size,
    });
  }
}

/**
 * ShardWriterDO - Individual shard writer
 *
 * Handles CDC writes for a specific shard partition.
 * Extends the functionality of LakehouseParentDO but operates as one of many shards.
 *
 * @example
 * ```typescript
 * export class MyShardWriterDO extends ShardWriterDO {
 *   protected getTableLocation(): string {
 *     return 'com/example/api';
 *   }
 * }
 * ```
 */
export abstract class ShardWriterDO {
  protected readonly state: DurableObjectState;
  protected readonly env: ShardedParentDOEnv;
  protected writer: LakehouseWriter | null = null;
  protected shardNumber: number | null = null;

  constructor(state: DurableObjectState, env: ShardedParentDOEnv) {
    this.state = state;
    this.env = env;
  }

  /**
   * Get the base table location (override in subclass)
   */
  protected abstract getTableLocation(): string;

  /**
   * Get the partition mode (override to customize)
   */
  protected getPartitionMode(): PartitionMode {
    return 'do-sqlite';
  }

  /**
   * Get additional writer options (override to customize)
   */
  protected getWriterOptions(): Partial<WriterOptions> {
    return {};
  }

  /**
   * Initialize the writer for this shard
   */
  protected async initialize(): Promise<void> {
    if (this.writer) return;

    // Extract shard number from DO ID
    const id = this.state.id.toString();
    const shardNumMatch = id.match(/shard-(\d+)/);
    this.shardNumber = shardNumMatch ? parseInt(shardNumMatch[1], 10) : 0;

    // Create writer with shard-specific table location
    const tableLocation = `${this.getTableLocation()}/shard-${this.shardNumber?.toString().padStart(4, '0')}`;

    this.writer = new LakehouseWriter({
      r2Bucket: this.env.R2_BUCKET,
      tableLocation,
      partitionMode: this.getPartitionMode(),
      ...this.getWriterOptions(),
    });

    this.writer.setDOStorage(this.state.storage);
    await this.writer.loadState();
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    await this.initialize();
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/cdc':
        return this.handleCDC(request);
      case '/flush':
        return this.handleFlush();
      case '/compact':
        return this.handleCompact();
      case '/stats':
        return this.handleStats();
      case '/blocks':
        return this.handleBlocks();
      case '/health':
        return this.handleHealth();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  /**
   * Handle CDC request from coordinator
   */
  private async handleCDC(request: Request): Promise<Response> {
    if (!this.writer) {
      throw new Error('Writer not initialized');
    }

    const message = await request.json() as ShardedCDCMessage;

    // Validate and reconstruct bigint entries from JSON-serialized format
    // JSON doesn't support bigint natively, so lsn/timestamp come as strings
    const rawEntries = message.entries;
    if (!isArray(rawEntries)) {
      throw new Error('Invalid CDC message: entries must be an array');
    }

    const entries: WalEntry[] = rawEntries.map((e, i) => {
      if (!isRecord(e)) {
        throw new Error(`Invalid CDC entry at index ${i}: must be an object`);
      }
      // lsn and timestamp are serialized as strings in JSON
      const lsnValue = e.lsn;
      const timestampValue = e.timestamp;
      if (!isString(lsnValue) && typeof lsnValue !== 'bigint') {
        throw new Error(`Invalid CDC entry at index ${i}: lsn must be a string or bigint`);
      }
      if (!isString(timestampValue) && typeof timestampValue !== 'bigint') {
        throw new Error(`Invalid CDC entry at index ${i}: timestamp must be a string or bigint`);
      }
      if (!isNumber(e.op) || !isNumber(e.flags) || !isNumber(e.checksum)) {
        throw new Error(`Invalid CDC entry at index ${i}: op, flags, checksum must be numbers`);
      }

      return {
        lsn: typeof lsnValue === 'bigint' ? lsnValue : BigInt(lsnValue),
        timestamp: typeof timestampValue === 'bigint' ? timestampValue : BigInt(timestampValue),
        op: e.op,
        flags: e.flags,
        data: e.data instanceof Uint8Array ? e.data : new Uint8Array(Object.values(e.data as Record<string, number>)),
        checksum: e.checksum,
      };
    });

    // Receive CDC
    await this.writer.receiveCDC(message.sourceDoId, entries);

    // Check if we should flush
    let result: FlushResult | null = null;
    if (this.writer.shouldFlush()) {
      result = await this.writer.flush();
    }

    const status: AckStatus = result?.status === 'persisted' ? 'persisted' : 'buffered';

    return Response.json({
      status,
      entryCount: entries.length,
      r2Key: result?.block?.r2Key,
    });
  }

  /**
   * Handle flush request
   */
  private async handleFlush(): Promise<Response> {
    if (!this.writer) {
      throw new Error('Writer not initialized');
    }
    const result = await this.writer.flush();
    return Response.json(result);
  }

  /**
   * Handle compact request
   */
  private async handleCompact(): Promise<Response> {
    if (!this.writer) {
      throw new Error('Writer not initialized');
    }
    const result = await this.writer.compact();
    return Response.json(result);
  }

  /**
   * Handle stats request
   */
  private handleStats(): Response {
    if (!this.writer) {
      throw new Error('Writer not initialized');
    }
    const stats = this.writer.getStats();

    // Convert Maps to objects for JSON serialization
    const serializedStats = {
      ...stats,
      shardNumber: this.shardNumber,
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
   * Handle blocks request
   */
  private handleBlocks(): Response {
    if (!this.writer) {
      throw new Error('Writer not initialized');
    }
    const blocks = this.writer.getBlockIndex();
    return Response.json(blocks);
  }

  /**
   * Handle health request
   */
  private handleHealth(): Response {
    if (!this.writer) {
      throw new Error('Writer not initialized');
    }
    const stats = this.writer.getStats();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (stats.blocks.pendingBlockCount > 10) {
      status = 'unhealthy';
    } else if (stats.blocks.pendingBlockCount > 0) {
      status = 'degraded';
    }

    return Response.json({
      status,
      shardNumber: this.shardNumber,
      blockCount: stats.blocks.r2BlockCount,
      pendingBlockCount: stats.blocks.pendingBlockCount,
    });
  }

  /**
   * Handle alarm
   */
  async alarm(): Promise<void> {
    await this.initialize();

    if (!this.writer) {
      throw new Error('Writer not initialized');
    }

    if (this.writer.shouldFlush()) {
      await this.writer.flush();
    }

    if (this.writer.getPendingBlockCount() > 0) {
      await this.writer.retryPendingBlocks();
    }

    const stats = this.writer.getStats();
    if (stats.blocks.smallBlockCount >= 4) {
      await this.writer.compact();
    }

    // Schedule next alarm
    const nextAlarm = this.writer.getNextAlarmTime();
    if (nextAlarm) {
      await this.state.storage.setAlarm(nextAlarm);
    }
  }
}

/**
 * Factory function to create a ShardCoordinator class
 */
export function createShardCoordinatorClass(
  config: ShardedParentDOConfig
): new (state: DurableObjectState, env: ShardedParentDOEnv) => ShardCoordinator {
  return class extends ShardCoordinator {
    protected getConfig(): ShardedParentDOConfig {
      return config;
    }
  };
}

/**
 * Factory function to create a ShardWriterDO class
 */
export function createShardWriterDOClass(
  tableLocation: string,
  partitionMode: PartitionMode = 'do-sqlite',
  options?: Partial<WriterOptions>
): new (state: DurableObjectState, env: ShardedParentDOEnv) => ShardWriterDO {
  return class extends ShardWriterDO {
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
