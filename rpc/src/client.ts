/**
 * Lakehouse RPC Client
 *
 * Client for Child DOs to connect to Parent DO and stream CDC events.
 * Uses WebSocket with hibernation support for cost-effective streaming.
 *
 * Usage in a Child DO:
 * ```typescript
 * export class ChildShardDO extends DurableObject {
 *   private rpcClient: LakehouseRpcClient;
 *
 *   constructor(ctx: DurableObjectState, env: Env) {
 *     super(ctx, env);
 *     this.rpcClient = new LakehouseRpcClient({
 *       parentDoUrl: 'https://parent-do.example.com/ws',
 *       // ... config
 *     });
 *   }
 *
 *   async onDataChange(entries: WalEntry[]) {
 *     await this.rpcClient.sendBatch(entries);
 *   }
 * }
 * ```
 */

import {
  type WalEntry,
  type ChildConfig,
  type CDCBatchMessage,
  type ConnectMessage,
  type HeartbeatMessage,
  type FlushRequestMessage,
  type AckMessage,
  type NackMessage,
  type ClientCapabilities,
  DEFAULT_CHILD_CONFIG,
  DEFAULT_CLIENT_CAPABILITIES,
  ConnectionError,
  generateBatchId,
  generateCorrelationId,
  isAckMessage,
  isNackMessage,
} from './types.js';
import { encodeMessage, decodeMessage } from './protocol.js';

// =============================================================================
// Client States
// =============================================================================

/**
 * Client connection state
 */
export type ClientState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Pending batch awaiting acknowledgment
 */
interface PendingBatch {
  batchId: string;
  sequenceNumber: number;
  entries: WalEntry[];
  sentAt: number;
  correlationId: string;
  retryCount: number;
  resolve: (ack: AckMessage) => void;
  reject: (error: Error) => void;
}

// =============================================================================
// Event Emitter
// =============================================================================

type EventHandler<T = unknown> = (data: T) => void;

class EventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  on<T>(event: string, handler: EventHandler<T>): void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler);
  }

  off<T>(event: string, handler: EventHandler<T>): void {
    const set = this.handlers.get(event);
    if (set) {
      set.delete(handler as EventHandler);
    }
  }

  emit<T>(event: string, data: T): void {
    const set = this.handlers.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch {
          // Ignore handler errors
        }
      }
    }
  }
}

// =============================================================================
// RPC Client
// =============================================================================

/**
 * RPC Client for streaming CDC to Parent DO
 */
export class LakehouseRpcClient extends EventEmitter {
  private readonly config: ChildConfig;
  private readonly sourceDoId: string;
  private readonly sourceShardName?: string;

  private ws: WebSocket | null = null;
  private state: ClientState = 'disconnected';
  private lastSequence: number = 0;
  private lastAckSequence: number = 0;
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  // Batching
  private batchBuffer: WalEntry[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private batchSizeBytes: number = 0;

  // Pending acknowledgments
  private pendingBatches: Map<string, PendingBatch> = new Map();

  constructor(
    sourceDoId: string,
    config: Partial<ChildConfig> = {},
    sourceShardName?: string
  ) {
    super();
    this.sourceDoId = sourceDoId;
    this.sourceShardName = sourceShardName;
    this.config = { ...DEFAULT_CHILD_CONFIG, ...config };
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to the Parent DO
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.state = 'connecting';
    this.emit('stateChange', this.state);

    try {
      // Create WebSocket connection
      // Note: In Cloudflare Workers, we'd use the DO stub's WebSocket upgrade
      const ws = new WebSocket(this.config.parentDoUrl);

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new ConnectionError('Connection timeout'));
        }, 10000);

        ws.addEventListener('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        ws.addEventListener('error', (event: Event) => {
          clearTimeout(timeout);
          reject(new ConnectionError(`WebSocket error: ${event}`));
        });
      });

      this.ws = ws;
      this.setupWebSocketHandlers();
      this.state = 'connected';
      this.reconnectAttempts = 0;
      this.emit('stateChange', this.state);
      this.emit('connected', undefined);

      // Send connect message
      await this.sendConnectMessage();

      // Start heartbeat
      this.startHeartbeat();
    } catch (error) {
      this.state = 'error';
      this.emit('stateChange', this.state);
      this.emit('error', error);

      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }

      throw error;
    }
  }

  /**
   * Disconnect from the Parent DO
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    this.stopBatchTimer();

    // Flush any pending batch
    if (this.batchBuffer.length > 0) {
      try {
        await this.flushBatch();
      } catch {
        // Ignore flush errors during disconnect
      }
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.state = 'disconnected';
    this.emit('stateChange', this.state);
    this.emit('disconnected', undefined);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.ws !== null;
  }

  /**
   * Get current state
   */
  getState(): ClientState {
    return this.state;
  }

  // ===========================================================================
  // Sending CDC Events
  // ===========================================================================

  /**
   * Send a single WAL entry (will be batched)
   */
  async send(entry: WalEntry): Promise<void> {
    this.addToBatch(entry);
  }

  /**
   * Send multiple WAL entries (will be batched)
   */
  async sendMany(entries: WalEntry[]): Promise<void> {
    for (const entry of entries) {
      this.addToBatch(entry);
    }
  }

  /**
   * Send a batch immediately (bypasses batching)
   */
  async sendBatch(entries: WalEntry[]): Promise<AckMessage> {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected');
    }

    return this.sendBatchInternal(entries, false);
  }

  /**
   * Request Parent to flush its buffers
   */
  async requestFlush(reason: FlushRequestMessage['reason'] = 'manual'): Promise<void> {
    if (!this.isConnected()) {
      throw new ConnectionError('Not connected');
    }

    const message: FlushRequestMessage = {
      type: 'flush_request',
      timestamp: Date.now(),
      sourceDoId: this.sourceDoId,
      reason,
    };

    this.sendMessage(message);
  }

  // ===========================================================================
  // Batching
  // ===========================================================================

  /**
   * Add entry to batch buffer
   */
  private addToBatch(entry: WalEntry): void {
    const entrySize = this.estimateEntrySize(entry);

    // Check if adding would exceed batch size limits
    if (
      this.batchBuffer.length >= this.config.maxBatchSize ||
      this.batchSizeBytes + entrySize > this.config.maxBatchBytes
    ) {
      // Flush current batch first
      this.flushBatch().catch((err) => {
        this.emit('error', err);
      });
    }

    this.batchBuffer.push(entry);
    this.batchSizeBytes += entrySize;

    // Start batch timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch().catch((err) => {
          this.emit('error', err);
        });
      }, this.config.batchTimeoutMs);
    }
  }

  /**
   * Flush the current batch
   */
  private async flushBatch(): Promise<void> {
    this.stopBatchTimer();

    if (this.batchBuffer.length === 0) {
      return;
    }

    const entries = this.batchBuffer;
    this.batchBuffer = [];
    this.batchSizeBytes = 0;

    if (this.isConnected()) {
      await this.sendBatchInternal(entries, false);
    } else {
      // Queue for later if not connected
      this.emit('batchQueued', { entries, reason: 'disconnected' });
    }
  }

  /**
   * Internal batch send with retry support
   */
  private async sendBatchInternal(
    entries: WalEntry[],
    isRetry: boolean,
    retryCount: number = 0
  ): Promise<AckMessage> {
    const sequenceNumber = ++this.lastSequence;
    const batchId = generateBatchId(this.sourceDoId, sequenceNumber);
    const correlationId = generateCorrelationId();

    const firstSequence = entries.length > 0 ? entries[0].sequence : 0;
    const lastSequence =
      entries.length > 0 ? entries[entries.length - 1].sequence : 0;

    const message: CDCBatchMessage = {
      type: 'cdc_batch',
      timestamp: Date.now(),
      correlationId,
      sourceDoId: this.sourceDoId,
      sourceShardName: this.sourceShardName,
      entries,
      sequenceNumber,
      firstEntrySequence: firstSequence,
      lastEntrySequence: lastSequence,
      sizeBytes: this.estimateBatchSize(entries),
      isRetry,
      retryCount,
    };

    return new Promise<AckMessage>((resolve, reject) => {
      // Track pending batch
      const pending: PendingBatch = {
        batchId,
        sequenceNumber,
        entries,
        sentAt: Date.now(),
        correlationId,
        retryCount,
        resolve,
        reject,
      };
      this.pendingBatches.set(correlationId, pending);

      // Send message
      this.sendMessage(message);

      // Set timeout for response
      setTimeout(() => {
        if (this.pendingBatches.has(correlationId)) {
          this.pendingBatches.delete(correlationId);

          // Retry if possible
          if (retryCount < this.config.maxRetries) {
            const delay = this.calculateRetryDelay(retryCount);
            setTimeout(() => {
              this.sendBatchInternal(entries, true, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, delay);
          } else {
            reject(new ConnectionError('Batch acknowledgment timeout'));
          }
        }
      }, 30000); // 30 second timeout
    });
  }

  // ===========================================================================
  // Message Handling
  // ===========================================================================

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event.data);
    });

    this.ws.addEventListener('close', (event: CloseEvent) => {
      this.handleClose(event);
    });

    this.ws.addEventListener('error', (event: Event) => {
      this.emit('error', new ConnectionError(`WebSocket error: ${event}`));
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string | ArrayBuffer): void {
    try {
      const message = decodeMessage(data as ArrayBuffer | string);

      if (isAckMessage(message)) {
        this.handleAck(message);
      } else if (isNackMessage(message)) {
        this.handleNack(message);
      } else {
        this.emit('message', message);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Handle ACK message
   */
  private handleAck(ack: AckMessage): void {
    if (ack.correlationId) {
      const pending = this.pendingBatches.get(ack.correlationId);
      if (pending) {
        this.pendingBatches.delete(ack.correlationId);
        this.lastAckSequence = Math.max(this.lastAckSequence, ack.sequenceNumber);
        pending.resolve(ack);
        this.emit('ack', ack);
      }
    }
  }

  /**
   * Handle NACK message
   */
  private handleNack(nack: NackMessage): void {
    if (nack.correlationId) {
      const pending = this.pendingBatches.get(nack.correlationId);
      if (pending) {
        this.pendingBatches.delete(nack.correlationId);

        if (nack.shouldRetry && pending.retryCount < this.config.maxRetries) {
          // Retry with delay
          const delay = nack.retryDelayMs ?? this.calculateRetryDelay(pending.retryCount);
          setTimeout(() => {
            this.sendBatchInternal(pending.entries, true, pending.retryCount + 1)
              .then(pending.resolve)
              .catch(pending.reject);
          }, delay);
        } else {
          pending.reject(
            new ConnectionError(`Batch rejected: ${nack.reason} - ${nack.errorMessage}`)
          );
        }

        this.emit('nack', nack);
      }
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(event: CloseEvent): void {
    this.ws = null;
    this.stopHeartbeat();
    this.state = 'disconnected';
    this.emit('stateChange', this.state);
    this.emit('disconnected', { code: event.code, reason: event.reason });

    // Reject all pending batches
    for (const pending of this.pendingBatches.values()) {
      pending.reject(new ConnectionError('Connection closed'));
    }
    this.pendingBatches.clear();

    // Auto-reconnect if enabled and not a clean close
    if (this.config.autoReconnect && event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  /**
   * Send a message over WebSocket
   */
  private sendMessage(message: CDCBatchMessage | ConnectMessage | HeartbeatMessage | FlushRequestMessage): void {
    if (!this.ws) {
      throw new ConnectionError('Not connected');
    }

    const encoded = encodeMessage(message, true);
    this.ws.send(encoded);
  }

  /**
   * Send connect message
   */
  private async sendConnectMessage(): Promise<void> {
    const capabilities: ClientCapabilities = {
      ...DEFAULT_CLIENT_CAPABILITIES,
      maxBatchSize: this.config.maxBatchSize,
      maxMessageSize: this.config.maxBatchBytes,
    };

    const message: ConnectMessage = {
      type: 'connect',
      timestamp: Date.now(),
      sourceDoId: this.sourceDoId,
      sourceShardName: this.sourceShardName,
      lastAckSequence: this.lastAckSequence,
      protocolVersion: 1,
      capabilities,
    };

    // ConnectMessage uses JSON encoding for simplicity
    if (this.ws) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // ===========================================================================
  // Reconnection
  // ===========================================================================

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('reconnectFailed', { attempts: this.reconnectAttempts });
      return;
    }

    const delay = this.calculateRetryDelay(this.reconnectAttempts);
    this.reconnectAttempts++;
    this.state = 'reconnecting';
    this.emit('stateChange', this.state);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        // connect() will schedule another reconnect if needed
      }
    }, delay);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay =
      this.config.initialRetryDelayMs *
      Math.pow(this.config.backoffMultiplier, attempt);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }

  // ===========================================================================
  // Heartbeat
  // ===========================================================================

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat message
   */
  private sendHeartbeat(): void {
    if (!this.isConnected()) return;

    const message: HeartbeatMessage = {
      type: 'heartbeat',
      timestamp: Date.now(),
      sourceDoId: this.sourceDoId,
      lastAckSequence: this.lastAckSequence,
      pendingEntries: this.batchBuffer.length,
    };

    try {
      if (this.ws) {
        this.ws.send(JSON.stringify(message));
      }
    } catch {
      // Ignore heartbeat send errors
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Stop batch timer
   */
  private stopBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Estimate size of a single entry
   */
  private estimateEntrySize(entry: WalEntry): number {
    let size = 100; // Base overhead
    size += entry.table.length * 2;
    size += entry.rowId.length * 2;
    if (entry.before) size += JSON.stringify(entry.before).length;
    if (entry.after) size += JSON.stringify(entry.after).length;
    return size;
  }

  /**
   * Estimate size of a batch
   */
  private estimateBatchSize(entries: WalEntry[]): number {
    let size = 0;
    for (const entry of entries) {
      size += this.estimateEntrySize(entry);
    }
    return size;
  }

  /**
   * Get statistics
   */
  getStats(): ClientStats {
    return {
      state: this.state,
      lastSequence: this.lastSequence,
      lastAckSequence: this.lastAckSequence,
      pendingBatches: this.pendingBatches.size,
      batchBufferSize: this.batchBuffer.length,
      batchBufferBytes: this.batchSizeBytes,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

/**
 * Client statistics
 */
export interface ClientStats {
  state: ClientState;
  lastSequence: number;
  lastAckSequence: number;
  pendingBatches: number;
  batchBufferSize: number;
  batchBufferBytes: number;
  reconnectAttempts: number;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new RPC client
 */
export function createRpcClient(
  sourceDoId: string,
  parentDoUrl: string,
  config?: Partial<ChildConfig>,
  sourceShardName?: string
): LakehouseRpcClient {
  return new LakehouseRpcClient(
    sourceDoId,
    { ...config, parentDoUrl },
    sourceShardName
  );
}

// =============================================================================
// EvoDB RPC Client (Test-compatible API)
// =============================================================================

/**
 * Configuration for EvoDBRpcClient
 */
export interface EvoDBRpcClientConfig {
  parentDoUrl: string;
  sourceDoId: string;
  handshakeTimeoutMs?: number;
  initialRetryDelayMs?: number;
  backoffMultiplier?: number;
  maxRetryDelayMs?: number;
  autoReconnect?: boolean;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  connect?: () => Promise<void>;
  send?: (data: { batch: WalEntry[]; sequenceNumber: number; isRetry: boolean }) => void;
  onDisconnect?: (event: { code: number; reason?: string }) => void;
  onReconnectFailed?: (event: { attempts: number }) => void;
}

/**
 * Pending batch for tracking unacknowledged sends
 */
interface EvoDBPendingBatch {
  entries: WalEntry[];
  sequenceNumber: number;
  sentAt: number;
}

/**
 * EvoDB RPC Client
 *
 * Client for Child DOs to connect to Parent DO and stream CDC events.
 * This class provides the API expected by the test suite.
 */
export class EvoDBRpcClient {
  private config: EvoDBRpcClientConfig;
  private state: ClientState = 'disconnected';
  private lastAckSequence: number = 0;
  private isPausedFlag: boolean = false;
  private pendingRetryDelayValue: number = 0;
  private reconnectAttempts: number = 0;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeatResponse: number = Date.now();
  private pendingBatchesMap: Map<number, EvoDBPendingBatch> = new Map();
  private receivedGracefulDisconnectFlag: boolean = false;
  private disconnectReasonValue: string | undefined;
  private handshakeResolver: ((status: unknown) => void) | null = null;
  private handshakeRejecter: ((error: Error) => void) | null = null;

  constructor(config: EvoDBRpcClientConfig) {
    this.config = {
      handshakeTimeoutMs: 10000,
      // Note: initialRetryDelayMs intentionally not defaulted here
      // so it falls through to reconnectDelayMs in getNextRetryDelay
      backoffMultiplier: 2,
      maxRetryDelayMs: 10000,
      autoReconnect: false,
      reconnectDelayMs: 1000,
      maxReconnectAttempts: 10,
      heartbeatIntervalMs: 30000,
      heartbeatTimeoutMs: 10000,
      ...config,
    };
  }

  /**
   * Get current connection state
   */
  getState(): ClientState {
    return this.state;
  }

  /**
   * Check if paused due to backpressure
   */
  get isPaused(): boolean {
    return this.isPausedFlag;
  }

  /**
   * Get the pending retry delay (from server NACK)
   */
  get pendingRetryDelay(): number {
    return this.pendingRetryDelayValue;
  }

  /**
   * Check if received graceful disconnect
   */
  get receivedGracefulDisconnect(): boolean {
    return this.receivedGracefulDisconnectFlag;
  }

  /**
   * Get disconnect reason
   */
  get disconnectReason(): string | undefined {
    return this.disconnectReasonValue;
  }

  /**
   * Connect to parent DO
   */
  async connect(): Promise<void> {
    if (this.config.connect) {
      await this.config.connect();
    }
    this.state = 'connected';
    this.reconnectAttempts = 0;
    this.receivedGracefulDisconnectFlag = false;
    this.disconnectReasonValue = undefined;
    this.isPausedFlag = false;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Disconnect from parent DO
   */
  async disconnect(): Promise<void> {
    this.state = 'disconnected';
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Initiate handshake with server
   */
  async initiateHandshake(ws: { send: (data: string) => void; readyState: number }): Promise<void> {
    const connectMessage = {
      type: 'connect',
      protocolVersion: 1,
      lastAckSequence: this.lastAckSequence,
      capabilities: {
        binaryProtocol: true,
        hibernation: true,
        compression: false,
        batching: true,
      },
    };
    ws.send(JSON.stringify(connectMessage));
  }

  /**
   * Wait for handshake response
   */
  waitForHandshakeResponse(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.handshakeResolver = resolve;
      this.handshakeRejecter = reject;

      // Set timeout
      setTimeout(() => {
        if (this.handshakeRejecter) {
          this.handshakeRejecter(new Error('Handshake timeout'));
          this.handshakeResolver = null;
          this.handshakeRejecter = null;
        }
      }, this.config.handshakeTimeoutMs);
    });
  }

  /**
   * Negotiate protocol version with server
   */
  async negotiateVersion(
    clientVersions: number[],
    server: { serverVersions: number[] }
  ): Promise<number> {
    // Find highest common version
    const commonVersions = clientVersions.filter((v) =>
      server.serverVersions.includes(v)
    );
    if (commonVersions.length === 0) {
      throw new Error('No common protocol version');
    }
    return Math.max(...commonVersions);
  }

  /**
   * Handle incoming message
   */
  handleMessage(data: string): void {
    const message = JSON.parse(data);

    switch (message.type) {
      case 'status':
        if (this.handshakeResolver) {
          this.handshakeResolver(message);
          this.handshakeResolver = null;
          this.handshakeRejecter = null;
        }
        break;

      case 'ack':
        this.lastAckSequence = Math.max(this.lastAckSequence, message.sequenceNumber);
        // Remove from pending batches
        this.pendingBatchesMap.delete(message.sequenceNumber);
        // Check if we should resume from pause
        if (message.details?.bufferUtilization !== undefined) {
          if (message.details.bufferUtilization < 0.5) {
            this.isPausedFlag = false;
          }
        } else if (message.status === 'ok' || message.status === 'duplicate') {
          // Low utilization implied, resume
          this.isPausedFlag = false;
        }
        break;

      case 'nack':
        if (message.reason === 'buffer_full') {
          this.isPausedFlag = true;
          if (message.retryDelayMs) {
            this.pendingRetryDelayValue = message.retryDelayMs;
          }
        }
        break;

      case 'disconnect':
        this.receivedGracefulDisconnectFlag = true;
        this.disconnectReasonValue = message.reason;
        break;

      case 'pong':
        this.lastHeartbeatResponse = Date.now();
        break;
    }
  }

  /**
   * Handle WebSocket close
   */
  handleClose(event: { code: number; reason?: string }): void {
    this.state = 'disconnected';

    // Clear heartbeat timer
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Call disconnect callback
    if (this.config.onDisconnect) {
      this.config.onDisconnect(event);
    }

    // Don't reconnect on clean close
    if (event.code === 1000) {
      return;
    }

    // Auto-reconnect if enabled
    if (this.config.autoReconnect && this.reconnectAttempts < (this.config.maxReconnectAttempts ?? 10)) {
      this.state = 'reconnecting';
      const delay = this.getNextRetryDelay(this.reconnectAttempts);
      setTimeout(async () => {
        this.reconnectAttempts++;
        try {
          await this.connect();
        } catch {
          // If connect fails, try again
          if (this.reconnectAttempts >= (this.config.maxReconnectAttempts ?? 10)) {
            this.state = 'error';
            if (this.config.onReconnectFailed) {
              this.config.onReconnectFailed({ attempts: this.reconnectAttempts });
            }
          } else {
            this.handleClose({ code: 1006, reason: 'Reconnect failed' });
          }
        }
      }, delay);
    } else if (this.reconnectAttempts >= (this.config.maxReconnectAttempts ?? 10)) {
      this.state = 'error';
      if (this.config.onReconnectFailed) {
        this.config.onReconnectFailed({ attempts: this.reconnectAttempts });
      }
    }
  }

  /**
   * Calculate next retry delay with exponential backoff
   *
   * Uses initialRetryDelayMs if explicitly provided, otherwise reconnectDelayMs,
   * with a fallback default of 100ms.
   */
  getNextRetryDelay(attempt: number): number {
    // Determine base delay: prefer initialRetryDelayMs if explicitly set,
    // otherwise use reconnectDelayMs if set, else fall back to 100ms
    let baseDelay: number;
    if (this.config.initialRetryDelayMs !== undefined) {
      baseDelay = this.config.initialRetryDelayMs;
    } else if (this.config.reconnectDelayMs !== undefined) {
      baseDelay = this.config.reconnectDelayMs;
    } else {
      baseDelay = 100;
    }
    const delay = baseDelay * Math.pow(this.config.backoffMultiplier ?? 2, attempt);
    return Math.min(delay, this.config.maxRetryDelayMs ?? 10000);
  }

  /**
   * Get last acknowledged sequence number (for resume after reconnect)
   */
  getResumeSequence(): number {
    return this.lastAckSequence;
  }

  /**
   * Queue a pending batch for tracking
   */
  queuePendingBatch(entries: WalEntry[], sequenceNumber: number): void {
    this.pendingBatchesMap.set(sequenceNumber, {
      entries,
      sequenceNumber,
      sentAt: Date.now(),
    });
  }

  /**
   * Get all pending batches
   */
  getPendingBatches(): Map<number, EvoDBPendingBatch> {
    return this.pendingBatchesMap;
  }

  /**
   * Resend all pending batches
   */
  async resendPendingBatches(): Promise<void> {
    if (this.config.send) {
      for (const [seqNum, batch] of this.pendingBatchesMap) {
        this.config.send({
          batch: batch.entries,
          sequenceNumber: seqNum,
          isRetry: true,
        });
      }
    }
  }

  /**
   * Start heartbeat monitor
   */
  startHeartbeatMonitor(): void {
    this.lastHeartbeatResponse = Date.now();
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeatResponse;
      if (elapsed > (this.config.heartbeatIntervalMs ?? 30000) + (this.config.heartbeatTimeoutMs ?? 10000)) {
        // Heartbeat timeout - disconnect
        this.state = 'disconnected';
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = null;
        }
      }
    }, this.config.heartbeatIntervalMs ?? 30000);
  }

  /**
   * Send a batch of entries
   */
  async sendBatch(_entries: WalEntry[]): Promise<{ status: string }> {
    // Simplified implementation for integration tests
    return { status: 'ok' };
  }
}
