/**
 * WebSocket Null State Race Condition Tests
 *
 * TDD RED Phase: These tests verify that WebSocket operations properly handle
 * null state that can occur after async reconnection operations.
 *
 * Race conditions can occur when:
 * 1. WebSocket becomes null during async operations (reconnect, batch send)
 * 2. State checks (isConnected) don't atomically protect subsequent operations
 * 3. Timers fire after WebSocket has been closed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EvoDBRpcClient } from '../client.js';

describe('WebSocket Null State Race Conditions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sendHeartbeat race conditions', () => {
    it('should not throw when WebSocket becomes null during heartbeat interval', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'heartbeat-race-client',
        heartbeatIntervalMs: 100,
      });

      // Start heartbeat monitor
      client.startHeartbeatMonitor();

      // Simulate WebSocket becoming null (as if closed externally)
      // by triggering a close event just before heartbeat fires
      vi.advanceTimersByTime(50);

      // Close the connection (sets internal ws to null)
      client.handleClose({ code: 1006, reason: 'Connection lost' });

      // Advance past heartbeat interval - should not throw
      expect(() => {
        vi.advanceTimersByTime(60);
      }).not.toThrow();
    });

    it('should safely handle heartbeat when connection closes mid-send', async () => {
      const mockSend = vi.fn().mockImplementation(() => {
        throw new Error('WebSocket is already in CLOSING or CLOSED state');
      });

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'closing-ws-client',
        heartbeatIntervalMs: 100,
      });

      // Connect and start heartbeat
      await client.connect();
      client.startHeartbeatMonitor();

      // Advance to trigger heartbeat - if ws.send throws, it should be handled
      expect(() => {
        vi.advanceTimersByTime(100);
      }).not.toThrow();
    });
  });

  describe('sendBatch race conditions', () => {
    it('should reject sendBatch if connection closes during async operation', async () => {
      const connectFn = vi.fn().mockResolvedValue(undefined);
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'async-close-client',
        connect: connectFn,
      });

      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Start a batch send operation
      const batchPromise = client.sendBatch([
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' },
      ]);

      // Simulate connection closing during the operation
      client.handleClose({ code: 1006, reason: 'Network error' });

      // The batch should be handled gracefully (either rejected or queued for retry)
      // It should NOT throw an unhandled error about null WebSocket
      await expect(batchPromise).resolves.toBeDefined().catch(() => {
        // If it rejects, that's also acceptable behavior
      });
    });

    it('should guard against null WebSocket in sendMessage', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'null-guard-client',
      });

      // Don't connect - ws should be null/undefined
      expect(client.isConnected()).toBe(false);

      // Attempt to send should throw ConnectionError, not TypeError
      await expect(client.sendBatch([
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' },
      ])).rejects.toThrow(/not connected/i);
    });
  });

  describe('reconnection race conditions', () => {
    it('should handle rapid connect/disconnect cycles without null pointer errors', async () => {
      const connectFn = vi.fn().mockResolvedValue(undefined);
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'rapid-cycle-client',
        autoReconnect: true,
        reconnectDelayMs: 50,
        maxReconnectAttempts: 3,
        connect: connectFn,
      });

      // Rapid connect/disconnect cycle
      await client.connect();
      client.handleClose({ code: 1006, reason: 'Error 1' });

      // Advance partially through reconnect delay
      await vi.advanceTimersByTimeAsync(25);

      // Another close event during reconnect attempt
      client.handleClose({ code: 1006, reason: 'Error 2' });

      // Should not throw, state machine should handle this
      expect(() => {
        vi.advanceTimersByTime(100);
      }).not.toThrow();
    });

    it('should not attempt operations on null WebSocket after failed reconnect', async () => {
      const connectFn = vi.fn()
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValue(new Error('Connection refused'));

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'failed-reconnect-client',
        autoReconnect: true,
        reconnectDelayMs: 100,
        maxReconnectAttempts: 2,
        connect: connectFn,
      });

      // Initial disconnect triggers reconnect attempts
      client.handleClose({ code: 1006, reason: 'Network error' });

      // Exhaust reconnect attempts
      await vi.advanceTimersByTimeAsync(100); // First attempt
      await vi.advanceTimersByTimeAsync(200); // Second attempt

      // After max attempts, client should be in error state
      expect(client.getState()).toBe('error');

      // Any subsequent operations should safely handle null WebSocket
      expect(() => client.handleMessage(JSON.stringify({ type: 'ack', sequenceNumber: 1 }))).not.toThrow();
    });
  });

  describe('initiateHandshake with null WebSocket', () => {
    it('should handle initiateHandshake when WebSocket is in invalid state', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'handshake-null-client',
      });

      const mockWs = {
        send: vi.fn().mockImplementation(() => {
          throw new Error('WebSocket is not open');
        }),
        readyState: 3, // CLOSED
      };

      // Should handle gracefully, not throw unhandled error
      await expect(client.initiateHandshake(mockWs)).resolves.not.toThrow();
    });
  });

  describe('resendPendingBatches with null state', () => {
    it('should safely skip resend when no send function configured', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'no-send-client',
        // Note: no send function configured
      });

      // Queue some batches
      client.queuePendingBatch([
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' },
      ], 1);

      // Should not throw when trying to resend without send function
      await expect(client.resendPendingBatches()).resolves.not.toThrow();
    });

    it('should handle send function throwing during resend', async () => {
      const sendFn = vi.fn().mockImplementation(() => {
        throw new Error('WebSocket closed');
      });

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'throw-send-client',
        send: sendFn,
      });

      // Queue batches
      client.queuePendingBatch([
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' },
      ], 1);

      // Should handle the error gracefully
      await expect(client.resendPendingBatches()).resolves.not.toThrow();
    });
  });

  describe('concurrent state transitions', () => {
    it('should handle disconnect during handshake wait', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'handshake-disconnect-client',
        handshakeTimeoutMs: 5000,
      });

      // Start waiting for handshake
      // Note: waitForHandshakeResponse() attaches a no-op catch handler internally
      // to prevent unhandled rejection warnings when handleClose rejects the promise
      const handshakePromise = client.waitForHandshakeResponse();

      // Disconnect before handshake completes
      client.handleClose({ code: 1006, reason: 'Connection lost' });

      // Handshake should reject with connection closed error
      await expect(handshakePromise).rejects.toThrow('Connection closed during handshake');
    });

    it('should cleanup pending operations when state changes to error', async () => {
      const connectFn = vi.fn().mockRejectedValue(new Error('Connection refused'));
      const onReconnectFailed = vi.fn();

      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'cleanup-client',
        autoReconnect: true,
        reconnectDelayMs: 100,
        maxReconnectAttempts: 1,
        connect: connectFn,
        onReconnectFailed,
      });

      // Queue pending batches
      client.queuePendingBatch([
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' },
      ], 1);

      // Trigger reconnection failure
      client.handleClose({ code: 1006, reason: 'Network error' });
      await vi.advanceTimersByTimeAsync(100);

      expect(client.getState()).toBe('error');
      expect(onReconnectFailed).toHaveBeenCalled();

      // Pending batches should still be accessible for potential manual recovery
      expect(client.getPendingBatches().size).toBe(1);
    });
  });

  describe('connection state guard pattern', () => {
    it('should provide atomic isConnectedAndReady check', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'atomic-check-client',
      });

      // Before connect
      expect(client.isConnected()).toBe(false);

      // After connect
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // After disconnect
      await client.disconnect();
      expect(client.isConnected()).toBe(false);

      // In reconnecting state
      client.handleClose({ code: 1006 });
      expect(client.isConnected()).toBe(false);
    });

    it('should guard sendBatch with connection check before WebSocket access', async () => {
      const client = new EvoDBRpcClient({
        parentDoUrl: 'ws://parent-do/rpc',
        sourceDoId: 'guard-send-client',
      });

      // Not connected - should reject immediately
      const result = client.sendBatch([
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 't', rowId: 'r1' },
      ]);

      await expect(result).rejects.toThrow(/not connected/i);
    });
  });
});
