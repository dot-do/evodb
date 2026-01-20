/**
 * @evodb/rpc Test Suite - GREEN Phase
 *
 * These tests verify the implementation of EvoDB RPC functionality.
 *
 * EvoDB uses CapnWeb RPC (https://github.com/cloudflare/capnweb) for DO-to-DO
 * communication with WebSocket hibernation for 95% cost savings.
 *
 * Test Coverage:
 * 1. Message Framing - encode/decode CDC events over WebSocket
 * 2. Protocol Handshake - connection establishment, hibernation hooks
 * 3. Backpressure Handling - buffer management when receiver is slow
 * 4. Reconnection Logic - graceful recovery from disconnects
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the implementations
import { encodeFrame, decodeFrame, encodeBatch } from '../protocol.js';
import { EvoDBRpcClient } from '../client.js';
import { EvoDBRpcServer } from '../server.js';
import { BackpressureController, CDCBufferManager } from '../buffer.js';

// =============================================================================
// 1. MESSAGE FRAMING TESTS
// =============================================================================

describe('Message Framing', () => {
  describe('CDC Event Encoding', () => {
    it('should encode INSERT operation to binary frame', () => {
      // RED: encodeFrame function does not exist yet

      const cdcEvent = {
        type: 'cdc_event' as const,
        operation: 'INSERT',
        table: 'users',
        rowId: 'user-123',
        timestamp: Date.now(),
        sequence: 1,
        after: { id: 'user-123', name: 'Alice', email: 'alice@example.com' },
      };

      const frame = encodeFrame(cdcEvent);

      expect(frame).toBeInstanceOf(ArrayBuffer);
      expect(frame.byteLength).toBeGreaterThan(0);
      // Should have magic number at start
      const view = new DataView(frame);
      expect(view.getUint16(0, true)).toBe(0xEDB0); // EvoDB magic
    });

    it('should encode UPDATE operation with before/after data', () => {

      const cdcEvent = {
        type: 'cdc_event' as const,
        operation: 'UPDATE',
        table: 'users',
        rowId: 'user-123',
        timestamp: Date.now(),
        sequence: 2,
        before: { id: 'user-123', name: 'Alice', email: 'alice@example.com' },
        after: { id: 'user-123', name: 'Alice Smith', email: 'alice@example.com' },
      };

      const frame = encodeFrame(cdcEvent);

      expect(frame).toBeInstanceOf(ArrayBuffer);
      // Both before and after should be encoded
      expect(frame.byteLength).toBeGreaterThan(100);
    });

    it('should encode DELETE operation with before data only', () => {

      const cdcEvent = {
        type: 'cdc_event' as const,
        operation: 'DELETE',
        table: 'users',
        rowId: 'user-123',
        timestamp: Date.now(),
        sequence: 3,
        before: { id: 'user-123', name: 'Alice', email: 'alice@example.com' },
      };

      const frame = encodeFrame(cdcEvent);

      expect(frame).toBeInstanceOf(ArrayBuffer);
    });

    it('should encode batch of CDC events efficiently', () => {

      const events = Array.from({ length: 100 }, (_, i) => ({
        type: 'cdc_event' as const,
        operation: 'INSERT',
        table: 'events',
        rowId: `event-${i}`,
        timestamp: Date.now(),
        sequence: i,
        after: { id: `event-${i}`, data: `payload-${i}` },
      }));

      const frame = encodeBatch(events);

      expect(frame).toBeInstanceOf(ArrayBuffer);
      // Batch should have header with event count
      const view = new DataView(frame);
      expect(view.getUint32(8, true)).toBe(100);
    });
  });

  describe('CDC Event Decoding', () => {
    it('should decode binary frame back to CDC event', () => {

      const original = {
        type: 'cdc_event' as const,
        operation: 'INSERT',
        table: 'orders',
        rowId: 'order-456',
        timestamp: Date.now(),
        sequence: 42,
        after: { id: 'order-456', total: 99.99, status: 'pending' },
      };

      const frame = encodeFrame(original);
      const decoded = decodeFrame(frame);

      expect(decoded.operation).toBe(original.operation);
      expect(decoded.table).toBe(original.table);
      expect(decoded.rowId).toBe(original.rowId);
      expect(decoded.sequence).toBe(original.sequence);
      expect(decoded.after).toEqual(original.after);
    });

    it('should reject frames with invalid magic number', () => {

      const badFrame = new ArrayBuffer(64);
      const view = new DataView(badFrame);
      view.setUint16(0, 0xDEAD, true); // Wrong magic

      expect(() => decodeFrame(badFrame)).toThrow(/invalid.*magic/i);
    });

    it('should reject frames with unsupported protocol version', () => {

      const badFrame = new ArrayBuffer(64);
      const view = new DataView(badFrame);
      view.setUint16(0, 0xEDB0, true); // Correct magic
      view.setUint8(2, 255); // Invalid version

      expect(() => decodeFrame(badFrame)).toThrow(/unsupported.*version/i);
    });

    it('should validate CRC32 checksum on decode', () => {

      const event = {
        type: 'cdc_event' as const,
        operation: 'INSERT',
        table: 'test',
        rowId: 'test-1',
        timestamp: Date.now(),
        sequence: 1,
        after: { data: 'test' },
      };

      const frame = encodeFrame(event);

      // Corrupt the frame
      const uint8 = new Uint8Array(frame);
      uint8[50] = uint8[50] ^ 0xFF;

      expect(() => decodeFrame(frame)).toThrow(/checksum/i);
    });
  });

  describe('Frame Size Limits', () => {
    it('should reject frames exceeding 16MB', () => {

      const hugeEvent = {
        type: 'cdc_event' as const,
        operation: 'INSERT',
        table: 'large_data',
        rowId: 'huge-1',
        timestamp: Date.now(),
        sequence: 1,
        // Create a payload larger than 16MB
        after: { data: 'x'.repeat(17 * 1024 * 1024) },
      };

      expect(() => encodeFrame(hugeEvent)).toThrow(/exceeds.*maximum/i);
    });

    it('should encode frames up to 16MB', () => {

      const largeEvent = {
        type: 'cdc_event' as const,
        operation: 'INSERT',
        table: 'large_data',
        rowId: 'large-1',
        timestamp: Date.now(),
        sequence: 1,
        // Just under 16MB
        after: { data: 'x'.repeat(15 * 1024 * 1024) },
      };

      const frame = encodeFrame(largeEvent);
      expect(frame.byteLength).toBeLessThan(16 * 1024 * 1024);
    });
  });
});

// =============================================================================
// 2. PROTOCOL HANDSHAKE TESTS
// =============================================================================

describe('Protocol Handshake', () => {
  describe('Connection Establishment', () => {
    it('should send CONNECT message with client capabilities', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'child-do-123',
      });

      // Mock WebSocket
      const mockWs = {
        send: vi.fn(),
        readyState: 1, // OPEN
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      // RED: initiateHandshake does not exist
      await client.initiateHandshake(mockWs);

      expect(mockWs.send).toHaveBeenCalledTimes(1);
      const sentData = mockWs.send.mock.calls[0][0];
      const decoded = JSON.parse(sentData);

      expect(decoded.type).toBe('connect');
      expect(decoded.protocolVersion).toBe(1);
      expect(decoded.capabilities.binaryProtocol).toBe(true);
      expect(decoded.capabilities.hibernation).toBe(true);
    });

    it('should receive STATUS response after CONNECT', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'child-do-456',
      });

      // RED: waitForHandshakeResponse does not exist
      const statusPromise = client.waitForHandshakeResponse();

      // Simulate server response
      client.handleMessage(JSON.stringify({
        type: 'status',
        timestamp: Date.now(),
        state: 'idle',
        buffer: { entryCount: 0, utilization: 0 },
        connectedChildren: 1,
      }));

      const status = await statusPromise;
      expect(status.state).toBe('idle');
      expect(status.connectedChildren).toBe(1);
    });

    it('should timeout if no handshake response within 10 seconds', async () => {

      vi.useFakeTimers();

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'child-do-789',
        handshakeTimeoutMs: 10000,
      });

      const handshakePromise = client.waitForHandshakeResponse();

      // Advance time past timeout
      vi.advanceTimersByTime(11000);

      await expect(handshakePromise).rejects.toThrow(/handshake.*timeout/i);

      vi.useRealTimers();
    });

    it('should negotiate protocol version with server', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'child-do-negotiation',
      });

      // Client supports version 1 and 2
      const clientVersions = [1, 2];

      // RED: negotiateVersion does not exist
      const negotiated = await client.negotiateVersion(clientVersions, {
        serverVersions: [1], // Server only supports v1
      });

      expect(negotiated).toBe(1);
    });
  });

  describe('Hibernation Hooks', () => {
    it('should serialize connection state for hibernation', () => {

      const server = new EvoDBRpcServer({});

      const connectionState = {
        childDoId: 'shard-001',
        childShardName: 'users-partition-1',
        lastAckSequence: 42,
        connectedAt: Date.now(),
        protocolVersion: 1,
        capabilityFlags: 0x07, // binary + compression + batching
      };

      // RED: createWebSocketAttachment does not exist
      const attachment = server.createWebSocketAttachment(connectionState);

      expect(attachment).toBeDefined();
      // Attachment must be <= 2048 bytes for hibernation
      const serialized = JSON.stringify(attachment);
      expect(serialized.length).toBeLessThanOrEqual(2048);
    });

    it('should restore connection state from hibernation', async () => {

      const server = new EvoDBRpcServer({});

      const mockWs = {
        deserializeAttachment: vi.fn().mockReturnValue({
          childDoId: 'shard-002',
          childShardName: 'orders-partition-3',
          lastAckSequence: 100,
          connectedAt: Date.now() - 60000,
          protocolVersion: 1,
          capabilityFlags: 0x05,
        }),
        serializeAttachment: vi.fn(),
        send: vi.fn(),
      };

      // RED: restoreFromHibernation does not exist
      const restored = await server.restoreFromHibernation(mockWs);

      expect(restored.childDoId).toBe('shard-002');
      expect(restored.lastAckSequence).toBe(100);
    });

    it('should accept WebSocket with hibernation API', () => {

      const mockCtx = {
        acceptWebSocket: vi.fn(),
        setWebSocketAutoResponse: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
        storage: { get: vi.fn(), put: vi.fn() },
      };

      const server = new EvoDBRpcServer({ ctx: mockCtx });

      const mockWs = {
        serializeAttachment: vi.fn(),
        send: vi.fn(),
      };

      // RED: acceptHibernatingWebSocket does not exist
      server.acceptHibernatingWebSocket(mockWs, 'child-123');

      expect(mockCtx.acceptWebSocket).toHaveBeenCalledWith(mockWs, ['child-123']);
    });

    it('should setup auto-response for ping/pong', () => {

      const mockCtx = {
        acceptWebSocket: vi.fn(),
        setWebSocketAutoResponse: vi.fn(),
        getWebSockets: vi.fn().mockReturnValue([]),
        storage: { get: vi.fn(), put: vi.fn() },
      };

      const server = new EvoDBRpcServer({ ctx: mockCtx });

      // RED: setupAutoResponse does not exist
      server.setupAutoResponse();

      expect(mockCtx.setWebSocketAutoResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          request: 'ping',
          response: 'pong',
        })
      );
    });
  });
});

// =============================================================================
// 3. BACKPRESSURE HANDLING TESTS
// =============================================================================

describe('Backpressure Handling', () => {
  describe('Buffer Management', () => {
    it('should track buffer utilization', () => {

      const controller = new BackpressureController({
        maxBufferSize: 1024 * 1024, // 1MB
        highWaterMark: 0.8,
        lowWaterMark: 0.2,
      });

      // RED: BackpressureController does not exist
      controller.addBytes(500 * 1024); // 500KB

      expect(controller.utilization).toBeCloseTo(0.5, 1); // 500KB / 1MB ~ 0.488
      expect(controller.isHighWater).toBe(false);
    });

    it('should signal high water mark when buffer is 80% full', () => {

      const onHighWater = vi.fn();
      const controller = new BackpressureController({
        maxBufferSize: 1024 * 1024,
        highWaterMark: 0.8,
        lowWaterMark: 0.2,
        onHighWater,
      });

      controller.addBytes(850 * 1024); // 83% full

      expect(controller.isHighWater).toBe(true);
      expect(onHighWater).toHaveBeenCalled();
    });

    it('should signal low water mark when buffer drops below 20%', () => {

      const onLowWater = vi.fn();
      const controller = new BackpressureController({
        maxBufferSize: 1024 * 1024,
        highWaterMark: 0.8,
        lowWaterMark: 0.2,
        onLowWater,
      });

      controller.addBytes(900 * 1024); // Fill to 88%
      controller.removeBytes(750 * 1024); // Drop to 14.6%

      expect(controller.isHighWater).toBe(false);
      expect(onLowWater).toHaveBeenCalled();
    });

    it('should reject new data when buffer is full', () => {

      const controller = new BackpressureController({
        maxBufferSize: 1024 * 1024,
        highWaterMark: 0.8,
        lowWaterMark: 0.2,
      });

      controller.addBytes(1024 * 1024); // Fill completely

      expect(() => controller.addBytes(1)).toThrow(/buffer.*full/i);
    });
  });

  describe('Flow Control', () => {
    it('should pause sender when receiver buffer is high', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'fast-producer',
      });

      // Simulate receiving NACK with buffer_full reason
      client.handleMessage(JSON.stringify({
        type: 'nack',
        sequenceNumber: 5,
        reason: 'buffer_full',
        shouldRetry: true,
        retryDelayMs: 5000,
      }));

      // RED: isPaused does not exist
      expect(client.isPaused).toBe(true);
    });

    it('should resume sender after receiving ACK with low utilization', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'fast-producer',
      });

      // First pause due to buffer_full
      client.handleMessage(JSON.stringify({
        type: 'nack',
        sequenceNumber: 5,
        reason: 'buffer_full',
        shouldRetry: true,
        retryDelayMs: 5000,
      }));

      expect(client.isPaused).toBe(true);

      // Then receive ACK with low utilization
      client.handleMessage(JSON.stringify({
        type: 'ack',
        sequenceNumber: 6,
        status: 'ok',
        details: { bufferUtilization: 0.3 },
      }));

      // RED: automatic resume on low utilization does not exist
      expect(client.isPaused).toBe(false);
    });

    it('should apply exponential backoff on repeated buffer_full', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'persistent-producer',
        initialRetryDelayMs: 100,
        backoffMultiplier: 2,
        maxRetryDelayMs: 10000,
      });

      // RED: getNextRetryDelay does not exist
      expect(client.getNextRetryDelay(0)).toBe(100);
      expect(client.getNextRetryDelay(1)).toBe(200);
      expect(client.getNextRetryDelay(2)).toBe(400);
      expect(client.getNextRetryDelay(10)).toBe(10000); // Capped at max
    });

    it('should respect server-suggested retry delay', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'compliant-producer',
      });

      client.handleMessage(JSON.stringify({
        type: 'nack',
        sequenceNumber: 5,
        reason: 'buffer_full',
        shouldRetry: true,
        retryDelayMs: 7500, // Server says wait 7.5 seconds
      }));

      // RED: pendingRetryDelay does not exist
      expect(client.pendingRetryDelay).toBe(7500);
    });
  });

  describe('Memory Pressure Detection', () => {
    it('should trigger flush on memory pressure', async () => {

      const flushHandler = vi.fn().mockResolvedValue({ success: true });

      const server = new EvoDBRpcServer({
        onFlush: flushHandler,
        memoryPressureThreshold: 0.9,
      });

      // RED: simulateMemoryPressure does not exist
      await server.simulateMemoryPressure(0.95);

      expect(flushHandler).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: 'memory_pressure' })
      );
    });

    it('should drop oldest batches when memory is critical', () => {

      const buffer = new CDCBufferManager({
        maxBufferSize: 100000, // Large enough buffer to fit test entries
        enableDropOnCritical: true,
        criticalThreshold: 0.95,
      });

      // Fill buffer to >95% capacity (each entry is ~120 bytes)
      // Need ~96000 bytes = 800 entries @ 120 bytes
      for (let i = 0; i < 800; i++) {
        buffer.addBatch(`source-${i}`, [
          { sequence: i, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: `r${i}` },
        ], i);
      }

      // Verify we're at critical level before drop
      expect(buffer.getStats().utilization).toBeGreaterThan(0.95);

      // Now drop oldest batches
      const dropped = buffer.dropOldestOnCritical();

      expect(dropped).toBeGreaterThan(0);
      expect(buffer.getStats().utilization).toBeLessThan(0.95);
    });
  });
});

// =============================================================================
// 4. RECONNECTION LOGIC TESTS
// =============================================================================

describe('Reconnection Logic', () => {
  describe('Disconnect Detection', () => {
    it('should detect WebSocket close event', () => {

      const onDisconnect = vi.fn();
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'watchful-client',
        onDisconnect,
      });

      // RED: handleClose should trigger onDisconnect callback
      client.handleClose({ code: 1006, reason: 'Connection lost' });

      expect(onDisconnect).toHaveBeenCalledWith(
        expect.objectContaining({ code: 1006 })
      );
      expect(client.getState()).toBe('disconnected');
    });

    it('should detect heartbeat timeout', async () => {

      vi.useFakeTimers();

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'heartbeat-client',
        heartbeatIntervalMs: 30000,
        heartbeatTimeoutMs: 10000,
      });

      // RED: startHeartbeatMonitor does not exist
      client.startHeartbeatMonitor();

      // No heartbeat response for 45 seconds
      vi.advanceTimersByTime(45000);

      expect(client.getState()).toBe('disconnected');

      vi.useRealTimers();
    });

    it('should handle server-initiated disconnect gracefully', () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'graceful-client',
      });

      // Server sends disconnect message before closing
      client.handleMessage(JSON.stringify({
        type: 'disconnect',
        reason: 'shutting_down',
        timestamp: Date.now(),
      }));

      // RED: receivedGracefulDisconnect does not exist
      expect(client.receivedGracefulDisconnect).toBe(true);
      expect(client.disconnectReason).toBe('shutting_down');
    });
  });

  describe('Automatic Reconnection', () => {
    it('should attempt reconnection after disconnect', async () => {

      vi.useFakeTimers();

      const connectFn = vi.fn().mockResolvedValue(undefined);
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'reconnecting-client',
        autoReconnect: true,
        reconnectDelayMs: 1000,
        connect: connectFn,
      });

      // Trigger disconnect
      client.handleClose({ code: 1006, reason: 'Network error' });

      // Wait for reconnect delay
      vi.advanceTimersByTime(1100);

      // RED: automatic reconnection does not work yet
      expect(connectFn).toHaveBeenCalled();
      expect(client.getState()).toBe('reconnecting');

      vi.useRealTimers();
    });

    it('should use exponential backoff for reconnection attempts', async () => {

      vi.useFakeTimers();

      const connectFn = vi.fn()
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValue(undefined);

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'persistent-client',
        autoReconnect: true,
        reconnectDelayMs: 1000,
        backoffMultiplier: 2,
        maxReconnectAttempts: 5,
        connect: connectFn,
      });

      client.handleClose({ code: 1006, reason: 'Network error' });

      // First attempt after 1000ms (1000 * 2^0)
      await vi.advanceTimersByTimeAsync(1000);
      expect(connectFn).toHaveBeenCalledTimes(1);

      // Second attempt after 2000ms more (1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2000);
      expect(connectFn).toHaveBeenCalledTimes(2);

      // Third attempt after 4000ms more (1000 * 2^2)
      await vi.advanceTimersByTimeAsync(4000);
      expect(connectFn).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it('should stop reconnecting after max attempts', async () => {

      vi.useFakeTimers();

      const connectFn = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const onReconnectFailed = vi.fn();

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'giving-up-client',
        autoReconnect: true,
        reconnectDelayMs: 100,
        maxReconnectAttempts: 3,
        connect: connectFn,
        onReconnectFailed,
      });

      client.handleClose({ code: 1006, reason: 'Network error' });

      // Exhaust all attempts with async timer advancement
      // Attempt 1: 100ms, Attempt 2: 200ms, Attempt 3: 400ms
      await vi.advanceTimersByTimeAsync(100); // First attempt
      await vi.advanceTimersByTimeAsync(200); // Second attempt
      await vi.advanceTimersByTimeAsync(400); // Third attempt

      expect(connectFn).toHaveBeenCalledTimes(3);
      expect(onReconnectFailed).toHaveBeenCalledWith({ attempts: 3 });
      expect(client.getState()).toBe('error');

      vi.useRealTimers();
    });

    it('should not reconnect on clean close (code 1000)', () => {

      const connectFn = vi.fn();
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'clean-close-client',
        autoReconnect: true,
        connect: connectFn,
      });

      // Clean close (user-initiated or server graceful shutdown)
      client.handleClose({ code: 1000, reason: 'Normal closure' });

      expect(connectFn).not.toHaveBeenCalled();
      expect(client.getState()).toBe('disconnected');
    });
  });

  describe('State Recovery', () => {
    it('should resume from last acknowledged sequence after reconnect', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'resuming-client',
      });

      // Simulate some acknowledged messages
      client.handleMessage(JSON.stringify({
        type: 'ack',
        sequenceNumber: 10,
        status: 'ok',
      }));

      // Disconnect
      client.handleClose({ code: 1006, reason: 'Network error' });

      // RED: getResumeSequence does not exist
      expect(client.getResumeSequence()).toBe(10);

      // On reconnect, should send CONNECT with lastAckSequence
      const mockWs = { send: vi.fn(), readyState: 1 };
      await client.initiateHandshake(mockWs);

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.lastAckSequence).toBe(10);
    });

    it('should resend pending batches after reconnect', async () => {

      const sendFn = vi.fn();
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'resending-client',
        send: sendFn,
      });

      // Queue some batches that weren't acknowledged
      const batch1 = [{ sequence: 11, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }];
      const batch2 = [{ sequence: 12, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r2' }];

      // RED: queuePendingBatch does not exist
      client.queuePendingBatch(batch1, 11);
      client.queuePendingBatch(batch2, 12);

      // Disconnect and reconnect
      client.handleClose({ code: 1006, reason: 'Network error' });
      await client.connect();

      // RED: resendPendingBatches does not exist
      await client.resendPendingBatches();

      expect(sendFn).toHaveBeenCalledTimes(2);
      // Batches should be marked as retries
      expect(sendFn.mock.calls[0][0].isRetry).toBe(true);
      expect(sendFn.mock.calls[1][0].isRetry).toBe(true);
    });

    it('should handle duplicate detection on resend', async () => {

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'dedup-client',
      });

      // Resend a batch
      client.queuePendingBatch([{ sequence: 15, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' }], 15);
      await client.resendPendingBatches();

      // Server responds with duplicate status
      client.handleMessage(JSON.stringify({
        type: 'ack',
        sequenceNumber: 15,
        status: 'duplicate',
      }));

      // RED: getPendingBatches does not exist
      // Batch should be removed from pending
      expect(client.getPendingBatches().has(15)).toBe(false);
    });

    it('should preserve buffer state across reconnections', async () => {

      const mockStorage = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      };

      const server = new EvoDBRpcServer({
        storage: mockStorage,
      });

      // Add some batches to buffer
      server.buffer.addBatch('child-1', [
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' },
      ], 1);

      // RED: saveBufferState does not exist
      await server.saveBufferState();

      expect(mockStorage.put).toHaveBeenCalledWith(
        'buffer_snapshot',
        expect.objectContaining({
          batches: expect.any(Array),
          totalEntryCount: 1,
        })
      );
    });
  });
});

// =============================================================================
// INTEGRATION TESTS (RED PHASE)
// =============================================================================

describe('Integration', () => {
  it('should handle full CDC flow: connect -> send -> ack -> disconnect', async () => {

    // RED: Full integration does not work yet
    const server = new EvoDBRpcServer({});
    const client = new EvoDBRpcClient({
      parentDoUrl: 'ws://parent-do/rpc',
      sourceDoId: 'integration-client',
    });

    // Connect
    await client.connect();
    expect(client.isConnected()).toBe(true);

    // Send CDC batch
    const ackPromise = client.sendBatch([
      { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 'users', rowId: 'u1', after: { name: 'Test' } },
    ]);

    // Server processes and responds
    // (In real test, this would be wired through mock WebSocket)

    const ack = await ackPromise;
    expect(ack.status).toBe('ok');

    // Disconnect
    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('should recover from hibernation and continue processing', async () => {

    const mockCtx = {
      acceptWebSocket: vi.fn(),
      setWebSocketAutoResponse: vi.fn(),
      getWebSockets: vi.fn().mockReturnValue([{
        deserializeAttachment: () => ({
          childDoId: 'hibernated-child',
          lastAckSequence: 50,
        }),
      }]),
      storage: {
        get: vi.fn().mockResolvedValue({
          batches: [],
          totalEntryCount: 0,
        }),
        put: vi.fn(),
        delete: vi.fn(),
      },
    };

    // RED: Server does not properly restore from hibernation
    const server = new EvoDBRpcServer({ ctx: mockCtx });
    await server.restoreFromHibernation();

    // Should have one connected child restored
    expect(server.getConnectedChildren()).toBe(1);
    expect(server.getChildState('hibernated-child')?.lastAckedSequence).toBe(50);
  });
});
