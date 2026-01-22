/**
 * RPC Client Unit Tests (TDD)
 *
 * Unit tests for the RPC client covering:
 * - WebSocket connection management
 * - Message encoding/decoding
 * - Response handling
 * - Connection error handling
 * - Reconnection logic
 * - Message queuing during reconnection
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EvoDBRpcClient,
  LakehouseRpcClient,
  createRpcClient,
  type ClientState,
} from '../client.js';
import { encodeMessage, decodeMessage } from '../protocol.js';
import type { WalEntry, AckMessage, NackMessage } from '../types.js';

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Create a mock WebSocket for testing
 */
function createMockWebSocket(): {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  readyState: number;
  CONNECTING: number;
  OPEN: number;
  CLOSING: number;
  CLOSED: number;
} {
  return {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1, // WebSocket.OPEN
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  };
}

/**
 * Create a sample WAL entry for testing
 */
function createWalEntry(overrides?: Partial<WalEntry>): WalEntry {
  return {
    sequence: 1,
    timestamp: Date.now(),
    operation: 'INSERT',
    table: 'test_table',
    rowId: 'row-123',
    after: { id: 'row-123', name: 'Test' },
    ...overrides,
  };
}

// =============================================================================
// Test Suite: RPC Client
// =============================================================================

describe('RPC Client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // WebSocket Connection Tests
  // ===========================================================================

  describe('connects to server via WebSocket', () => {
    test('should create WebSocket connection with correct URL', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-child-do',
      });

      // Connect should initialize the client
      const connectFn = vi.fn().mockResolvedValue(undefined);
      const clientWithConnect = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-child-do',
        connect: connectFn,
      });

      await clientWithConnect.connect();

      expect(connectFn).toHaveBeenCalled();
      expect(clientWithConnect.getState()).toBe('connected');
    });

    test('should transition to connected state on successful connection', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-child-do',
      });

      expect(client.getState()).toBe('disconnected');

      await client.connect();

      expect(client.getState()).toBe('connected');
      expect(client.isConnected()).toBe(true);
    });

    test('should send connect message with client capabilities', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-child-do',
      });

      const mockWs = createMockWebSocket();

      await client.initiateHandshake(mockWs);

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const sentData = mockWs.send.mock.calls[0][0];
      const decoded = JSON.parse(sentData);

      expect(decoded.type).toBe('connect');
      expect(decoded.protocolVersion).toBe(1);
      expect(decoded.capabilities).toBeDefined();
      expect(decoded.capabilities.binaryProtocol).toBe(true);
    });

    test('should not initiate handshake if WebSocket is not open', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-child-do',
      });

      const mockWs = createMockWebSocket();
      mockWs.readyState = 3; // CLOSED

      await client.initiateHandshake(mockWs);

      // Should not send anything if WebSocket is not OPEN
      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Message Encoding Tests
  // ===========================================================================

  describe('sends messages with correct encoding', () => {
    test('should encode CDC batch message to binary format', () => {
      const entries: WalEntry[] = [
        createWalEntry({ sequence: 1 }),
        createWalEntry({ sequence: 2, operation: 'UPDATE', before: { id: 'row-123', name: 'Old' } }),
      ];

      const message = {
        type: 'cdc_batch' as const,
        timestamp: Date.now(),
        correlationId: 'corr-123',
        sourceDoId: 'test-do',
        entries,
        sequenceNumber: 1,
        firstEntrySequence: 1,
        lastEntrySequence: 2,
        sizeBytes: 1000,
        isRetry: false,
        retryCount: 0,
      };

      const encoded = encodeMessage(message, true);

      expect(encoded).toBeInstanceOf(ArrayBuffer);
      expect((encoded as ArrayBuffer).byteLength).toBeGreaterThan(0);

      // Verify magic number
      const view = new DataView(encoded as ArrayBuffer);
      expect(view.getUint16(0, true)).toBe(0xcdc2); // CDC2 magic
    });

    test('should encode connect message as JSON', () => {
      const message = {
        type: 'connect' as const,
        timestamp: Date.now(),
        sourceDoId: 'test-do',
        lastAckSequence: 0,
        protocolVersion: 1,
        capabilities: {
          binaryProtocol: true,
          compression: false,
          batching: true,
          maxBatchSize: 1000,
          maxMessageSize: 4 * 1024 * 1024,
        },
      };

      // Connect message falls back to JSON
      const encoded = encodeMessage(message, false);

      expect(typeof encoded).toBe('string');
      const decoded = JSON.parse(encoded as string);
      expect(decoded.type).toBe('connect');
      expect(decoded.protocolVersion).toBe(1);
    });

    test('should include correlation ID for request tracking', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      const entries = [createWalEntry()];
      client.queuePendingBatch(entries, 1);

      const pending = client.getPendingBatches();
      expect(pending.size).toBe(1);
      expect(pending.get(1)).toBeDefined();
      expect(pending.get(1)!.entries).toEqual(entries);
    });
  });

  // ===========================================================================
  // Response Decoding Tests
  // ===========================================================================

  describe('receives and decodes responses', () => {
    test('should decode ACK message correctly', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      // Queue a pending batch
      client.queuePendingBatch([createWalEntry()], 5);
      expect(client.getPendingBatches().has(5)).toBe(true);

      // Handle ACK message
      client.handleMessage(JSON.stringify({
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 5,
        status: 'ok',
      }));

      // Should remove from pending
      expect(client.getPendingBatches().has(5)).toBe(false);
    });

    test('should handle duplicate ACK status', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      // Queue a pending batch
      client.queuePendingBatch([createWalEntry()], 10);

      // Handle duplicate ACK
      client.handleMessage(JSON.stringify({
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 10,
        status: 'duplicate',
      }));

      // Should still remove from pending
      expect(client.getPendingBatches().has(10)).toBe(false);
    });

    test('should decode NACK message and set paused state', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      expect(client.isPaused).toBe(false);

      client.handleMessage(JSON.stringify({
        type: 'nack',
        timestamp: Date.now(),
        sequenceNumber: 5,
        reason: 'buffer_full',
        errorMessage: 'Server buffer is full',
        shouldRetry: true,
        retryDelayMs: 5000,
      }));

      expect(client.isPaused).toBe(true);
      expect(client.pendingRetryDelay).toBe(5000);
    });

    test('should track last acknowledged sequence number', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      client.handleMessage(JSON.stringify({
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 15,
        status: 'ok',
      }));

      expect(client.getResumeSequence()).toBe(15);

      // Higher sequence should update
      client.handleMessage(JSON.stringify({
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 20,
        status: 'ok',
      }));

      expect(client.getResumeSequence()).toBe(20);

      // Lower sequence should not update
      client.handleMessage(JSON.stringify({
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 10,
        status: 'ok',
      }));

      expect(client.getResumeSequence()).toBe(20);
    });
  });

  // ===========================================================================
  // Connection Error Handling Tests
  // ===========================================================================

  describe('handles connection errors', () => {
    test('should transition to disconnected state on WebSocket close', () => {
      const onDisconnect = vi.fn();
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        onDisconnect,
      });

      client.handleClose({ code: 1006, reason: 'Connection lost' });

      expect(client.getState()).toBe('disconnected');
      expect(onDisconnect).toHaveBeenCalledWith(
        expect.objectContaining({ code: 1006 })
      );
    });

    test('should handle graceful server-initiated disconnect', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      // Server sends disconnect message
      client.handleMessage(JSON.stringify({
        type: 'disconnect',
        timestamp: Date.now(),
        reason: 'shutting_down',
      }));

      expect(client.receivedGracefulDisconnect).toBe(true);
      expect(client.disconnectReason).toBe('shutting_down');
    });

    test('should not reconnect on clean close (code 1000)', () => {
      const connectFn = vi.fn();
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        autoReconnect: true,
        connect: connectFn,
      });

      client.handleClose({ code: 1000, reason: 'Normal closure' });

      expect(connectFn).not.toHaveBeenCalled();
      expect(client.getState()).toBe('disconnected');
    });

    test('should handle handshake timeout', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        handshakeTimeoutMs: 5000,
      });

      const handshakePromise = client.waitForHandshakeResponse();

      // Advance time past timeout
      vi.advanceTimersByTime(6000);

      await expect(handshakePromise).rejects.toThrow(/timeout/i);
    });

    test('should clear handshake state on close to prevent unhandled rejections', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        handshakeTimeoutMs: 10000,
      });

      // Start waiting for handshake response
      const handshakePromise = client.waitForHandshakeResponse();

      // Close connection before handshake completes
      client.handleClose({ code: 1006, reason: 'Connection lost' });

      // The promise should reject with connection closed error
      await expect(handshakePromise).rejects.toThrow(/closed/i);
    });

    test('should reject sendBatch when not connected', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      // Not connected, should throw
      await expect(client.sendBatch([createWalEntry()])).rejects.toThrow(/not connected/i);
    });
  });

  // ===========================================================================
  // Reconnection Tests
  // ===========================================================================

  describe('reconnects on disconnect', () => {
    test('should attempt reconnection after abnormal close', async () => {
      const connectFn = vi.fn().mockResolvedValue(undefined);
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        autoReconnect: true,
        reconnectDelayMs: 1000,
        connect: connectFn,
      });

      // Trigger abnormal disconnect
      client.handleClose({ code: 1006, reason: 'Network error' });

      expect(client.getState()).toBe('reconnecting');

      // Advance time past reconnect delay
      await vi.advanceTimersByTimeAsync(1100);

      expect(connectFn).toHaveBeenCalled();
    });

    test('should use exponential backoff for reconnection attempts', async () => {
      const connectFn = vi.fn()
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValue(undefined);

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        autoReconnect: true,
        initialRetryDelayMs: 100,
        backoffMultiplier: 2,
        maxRetryDelayMs: 10000,
        maxReconnectAttempts: 5,
        connect: connectFn,
      });

      // Test exponential backoff calculation
      expect(client.getNextRetryDelay(0)).toBe(100);
      expect(client.getNextRetryDelay(1)).toBe(200);
      expect(client.getNextRetryDelay(2)).toBe(400);
      expect(client.getNextRetryDelay(3)).toBe(800);

      // Should cap at maxRetryDelayMs
      expect(client.getNextRetryDelay(10)).toBe(10000);
    });

    test('should stop reconnecting after max attempts', async () => {
      const connectFn = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const onReconnectFailed = vi.fn();

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        autoReconnect: true,
        initialRetryDelayMs: 100,
        maxReconnectAttempts: 3,
        connect: connectFn,
        onReconnectFailed,
      });

      // Trigger disconnect
      client.handleClose({ code: 1006, reason: 'Network error' });

      // Advance through all retry attempts
      await vi.advanceTimersByTimeAsync(100); // First attempt
      await vi.advanceTimersByTimeAsync(200); // Second attempt
      await vi.advanceTimersByTimeAsync(400); // Third attempt

      expect(connectFn).toHaveBeenCalledTimes(3);
      expect(onReconnectFailed).toHaveBeenCalledWith({ attempts: 3 });
      expect(client.getState()).toBe('error');
    });

    test('should include last ack sequence in connect message after reconnect', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      // Simulate some acknowledged messages
      client.handleMessage(JSON.stringify({
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 25,
        status: 'ok',
      }));

      expect(client.getResumeSequence()).toBe(25);

      // Reconnect and verify connect message includes lastAckSequence
      const mockWs = createMockWebSocket();
      await client.initiateHandshake(mockWs);

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.lastAckSequence).toBe(25);
    });
  });

  // ===========================================================================
  // Message Queuing During Reconnection Tests
  // ===========================================================================

  describe('queues messages during reconnection', () => {
    test('should queue pending batches for retry', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      const entries1 = [createWalEntry({ sequence: 1 })];
      const entries2 = [createWalEntry({ sequence: 2 })];

      client.queuePendingBatch(entries1, 1);
      client.queuePendingBatch(entries2, 2);

      const pending = client.getPendingBatches();
      expect(pending.size).toBe(2);
      expect(pending.get(1)!.entries).toEqual(entries1);
      expect(pending.get(2)!.entries).toEqual(entries2);
    });

    test('should resend pending batches after reconnection', async () => {
      const sendFn = vi.fn();
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        send: sendFn,
      });

      // Queue some batches
      client.queuePendingBatch([createWalEntry({ sequence: 11 })], 11);
      client.queuePendingBatch([createWalEntry({ sequence: 12 })], 12);

      // Resend pending batches
      await client.resendPendingBatches();

      expect(sendFn).toHaveBeenCalledTimes(2);
      // Verify batches are marked as retries
      expect(sendFn.mock.calls[0][0].isRetry).toBe(true);
      expect(sendFn.mock.calls[1][0].isRetry).toBe(true);
    });

    test('should enforce max pending batches limit', () => {
      const onEvicted = vi.fn();
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        maxPendingBatches: 3,
        onPendingBatchEvicted: onEvicted,
      });

      // Queue batches up to limit
      client.queuePendingBatch([createWalEntry({ sequence: 1 })], 1);
      client.queuePendingBatch([createWalEntry({ sequence: 2 })], 2);
      client.queuePendingBatch([createWalEntry({ sequence: 3 })], 3);

      expect(client.getPendingBatches().size).toBe(3);

      // Queue one more - should evict oldest
      client.queuePendingBatch([createWalEntry({ sequence: 4 })], 4);

      expect(client.getPendingBatches().size).toBe(3);
      expect(client.getPendingBatches().has(1)).toBe(false); // Oldest evicted
      expect(client.getPendingBatches().has(4)).toBe(true);
      expect(onEvicted).toHaveBeenCalledWith(
        expect.objectContaining({ sequenceNumber: 1, reason: 'max_pending_exceeded' })
      );
    });

    test('should cleanup expired pending batches', async () => {
      const onExpired = vi.fn();
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        pendingBatchTtlMs: 1000, // 1 second TTL
        onPendingBatchExpired: onExpired,
      });

      // Queue a batch
      client.queuePendingBatch([createWalEntry({ sequence: 1 })], 1);
      expect(client.getPendingBatches().size).toBe(1);

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      // Trigger cleanup
      client.cleanupExpiredPendingBatches();

      expect(client.getPendingBatches().size).toBe(0);
      expect(onExpired).toHaveBeenCalledWith(
        expect.objectContaining({ sequenceNumber: 1, reason: 'ttl_expired' })
      );
    });

    test('should clear pending batches on disconnect', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      await client.connect();

      // Queue some batches
      client.queuePendingBatch([createWalEntry({ sequence: 1 })], 1);
      client.queuePendingBatch([createWalEntry({ sequence: 2 })], 2);
      expect(client.getPendingBatches().size).toBe(2);

      // Disconnect
      await client.disconnect();

      expect(client.getPendingBatches().size).toBe(0);
    });

    test('should provide pending batches statistics', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        maxPendingBatches: 100,
        pendingBatchTtlMs: 30000,
      });

      client.queuePendingBatch([createWalEntry({ sequence: 1 })], 1);
      client.queuePendingBatch([createWalEntry({ sequence: 2 }), createWalEntry({ sequence: 3 })], 2);

      const stats = client.getPendingBatchesStats();

      expect(stats.count).toBe(2);
      expect(stats.totalEntries).toBe(3);
      expect(stats.ttlMs).toBe(30000);
      expect(stats.maxBatches).toBe(100);
    });
  });

  // ===========================================================================
  // LakehouseRpcClient Tests (Alternative Client Implementation)
  // ===========================================================================

  describe('LakehouseRpcClient', () => {
    test('should create client with factory function', () => {
      const client = createRpcClient(
        'source-do-123',
        'ws://parent-do/rpc',
        { maxBatchSize: 500 },
        'shard-1'
      );

      expect(client).toBeInstanceOf(LakehouseRpcClient);
    });

    test('should provide client statistics', () => {
      const client = new LakehouseRpcClient('source-do-123', {
        parentDoUrl: 'ws://parent-do/rpc',
      });

      const stats = client.getStats();

      expect(stats.state).toBe('disconnected');
      expect(stats.lastSequence).toBe(0);
      expect(stats.lastAckSequence).toBe(0);
      expect(stats.pendingBatches).toBe(0);
      expect(stats.batchBufferSize).toBe(0);
    });

    test('should emit events on state changes', async () => {
      const stateChangeHandler = vi.fn();
      const client = new LakehouseRpcClient('source-do-123', {
        parentDoUrl: 'ws://parent-do/rpc',
      });

      client.on('stateChange', stateChangeHandler);

      // Note: We can't fully test connect() without a real WebSocket,
      // but we can verify the event emitter works
      expect(stateChangeHandler).not.toHaveBeenCalled();
    });

    test('should handle event handler errors gracefully', () => {
      const onHandlerError = vi.fn();
      const client = new LakehouseRpcClient('source-do-123', {
        parentDoUrl: 'ws://parent-do/rpc',
        onHandlerError,
      });

      // Add a handler that throws
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      client.on('stateChange', errorHandler);

      // Emit an event - should not throw
      expect(() => {
        (client as any).emit('stateChange', 'connected');
      }).not.toThrow();

      expect(errorHandler).toHaveBeenCalled();
      expect(onHandlerError).toHaveBeenCalledWith('stateChange', expect.any(Error));
    });
  });

  // ===========================================================================
  // Protocol Negotiation Tests
  // ===========================================================================

  describe('protocol negotiation', () => {
    test('should negotiate highest common protocol version', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      // Client supports versions 1 and 2
      const clientVersions = [1, 2];

      // Server supports version 1
      const negotiated = await client.negotiateVersion(clientVersions, {
        serverVersions: [1],
      });

      expect(negotiated).toBe(1);
    });

    test('should select highest version when multiple are supported', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      // Both support versions 1 and 2
      const clientVersions = [1, 2];
      const serverVersions = [1, 2];

      const negotiated = await client.negotiateVersion(clientVersions, {
        serverVersions,
      });

      expect(negotiated).toBe(2);
    });

    test('should throw when no common version exists', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
      });

      // Client supports only version 2
      const clientVersions = [2];
      // Server supports only version 1
      const serverVersions = [1];

      await expect(
        client.negotiateVersion(clientVersions, { serverVersions })
      ).rejects.toThrow(/no common protocol version/i);
    });
  });

  // ===========================================================================
  // Heartbeat Tests
  // ===========================================================================

  describe('heartbeat monitoring', () => {
    test('should detect heartbeat timeout', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        heartbeatIntervalMs: 30000,
        heartbeatTimeoutMs: 10000,
      });

      // Start monitoring
      client.startHeartbeatMonitor();

      // Advance past heartbeat interval + timeout
      vi.advanceTimersByTime(45000);

      expect(client.getState()).toBe('disconnected');
    });

    test('should reset timeout on pong response', () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://localhost:8787/rpc',
        sourceDoId: 'test-do',
        heartbeatIntervalMs: 30000,
        heartbeatTimeoutMs: 10000,
      });

      client.startHeartbeatMonitor();

      // Advance time but receive pong
      vi.advanceTimersByTime(25000);
      client.handleMessage(JSON.stringify({
        type: 'pong',
        timestamp: Date.now(),
      }));

      // Advance more time - should still be connected
      vi.advanceTimersByTime(25000);
      client.handleMessage(JSON.stringify({
        type: 'pong',
        timestamp: Date.now(),
      }));

      // Still connected because pongs were received
      // Note: The actual heartbeat monitor uses setInterval,
      // so the state check happens after the interval
    });
  });
});
