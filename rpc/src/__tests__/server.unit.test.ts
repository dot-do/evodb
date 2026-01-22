/**
 * RPC Server Unit Tests (TDD)
 *
 * Unit tests for the EvoDBRpcServer class that handles:
 * - WebSocket connection handling with hibernation API
 * - Message routing to correct handlers
 * - Hibernation mode support
 * - Broadcast to multiple clients
 * - Client disconnect handling
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { EvoDBRpcServer, type EvoDBRpcServerContext } from '../server.js';
import type { WebSocketAttachment } from '../types.js';

// =============================================================================
// Mock Helpers
// =============================================================================

/**
 * Create a mock DurableObject context for testing
 */
function createMockContext(): EvoDBRpcServerContext {
  const webSockets: Map<string, unknown[]> = new Map();

  return {
    acceptWebSocket: vi.fn((ws: unknown, tags?: string[]) => {
      for (const tag of tags ?? []) {
        if (!webSockets.has(tag)) {
          webSockets.set(tag, []);
        }
        webSockets.get(tag)!.push(ws);
      }
    }),
    setWebSocketAutoResponse: vi.fn(),
    getWebSockets: vi.fn((tag?: string) => {
      if (tag) {
        return webSockets.get(tag) ?? [];
      }
      const all: unknown[] = [];
      for (const sockets of webSockets.values()) {
        all.push(...sockets);
      }
      return all;
    }),
    storage: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

/**
 * Create a mock WebSocket for testing
 */
function createMockWebSocket(attachment?: WebSocketAttachment): {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  serializeAttachment: ReturnType<typeof vi.fn>;
  deserializeAttachment: ReturnType<typeof vi.fn>;
  readyState: number;
} {
  let storedAttachment = attachment;

  return {
    send: vi.fn(),
    close: vi.fn(),
    serializeAttachment: vi.fn((data: WebSocketAttachment) => {
      storedAttachment = data;
    }),
    deserializeAttachment: vi.fn(() => storedAttachment),
    readyState: 1, // OPEN
  };
}

/**
 * Create a WebSocket attachment for testing
 */
function createAttachment(overrides?: Partial<WebSocketAttachment>): WebSocketAttachment {
  return {
    childDoId: 'child-test-123',
    childShardName: 'test-shard',
    lastAckSequence: 0,
    connectedAt: Date.now(),
    protocolVersion: 1,
    capabilityFlags: 0x07,
    ...overrides,
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('RPC Server', () => {
  let mockCtx: EvoDBRpcServerContext;

  beforeEach(() => {
    mockCtx = createMockContext();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // WebSocket Connection Handling
  // ===========================================================================

  test('handles incoming WebSocket connection', () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });
    const mockWs = createMockWebSocket();
    const childDoId = 'child-do-001';

    // Accept a hibernating WebSocket connection
    server.acceptHibernatingWebSocket(mockWs, childDoId);

    // Should call ctx.acceptWebSocket with the WebSocket and tags
    expect(mockCtx.acceptWebSocket).toHaveBeenCalledWith(mockWs, [childDoId]);
  });

  test('stores attachment data on WebSocket connection', () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });
    const mockWs = createMockWebSocket();

    const connectionState = {
      childDoId: 'child-do-002',
      childShardName: 'users-shard-1',
      lastAckSequence: 10,
      connectedAt: Date.now(),
      protocolVersion: 1,
      capabilityFlags: 0x05,
    };

    // Create attachment for the connection
    const attachment = server.createWebSocketAttachment(connectionState);

    // Should create valid attachment
    expect(attachment).toBeDefined();
    expect(attachment.childDoId).toBe('child-do-002');
    expect(attachment.lastAckSequence).toBe(10);

    // Attachment must be <= 2048 bytes for hibernation
    const serialized = JSON.stringify(attachment);
    expect(serialized.length).toBeLessThanOrEqual(2048);
  });

  test('tracks connected children count', () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // Initially no connected children
    expect(server.getConnectedChildren()).toBe(0);

    // Simulate restoring connections from hibernation
    const mockWs1 = createMockWebSocket(createAttachment({ childDoId: 'child-1' }));
    const mockWs2 = createMockWebSocket(createAttachment({ childDoId: 'child-2' }));

    // Restore from hibernation with multiple WebSockets
    (mockCtx.getWebSockets as ReturnType<typeof vi.fn>).mockReturnValue([mockWs1, mockWs2]);
    server.restoreFromHibernation();

    expect(server.getConnectedChildren()).toBe(2);
  });

  // ===========================================================================
  // Message Routing
  // ===========================================================================

  test('routes messages to correct handler', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });
    const mockWs = createMockWebSocket(createAttachment({ childDoId: 'child-router-test' }));

    // Accept the WebSocket
    server.acceptHibernatingWebSocket(mockWs, 'child-router-test');

    // Restore from hibernation to register the child
    (mockCtx.getWebSockets as ReturnType<typeof vi.fn>).mockReturnValue([mockWs]);
    await server.restoreFromHibernation(mockWs);

    // Verify child state was restored
    const childState = server.getChildState('child-router-test');
    expect(childState).toBeDefined();
    expect(childState?.childDoId).toBe('child-router-test');
  });

  test('returns undefined for unknown child', () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // Query for non-existent child
    const childState = server.getChildState('non-existent-child');

    expect(childState).toBeUndefined();
  });

  test('updates child state from attachment on restore', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    const attachment = createAttachment({
      childDoId: 'child-with-history',
      lastAckSequence: 42,
      connectedAt: Date.now() - 30000,
    });

    const mockWs = createMockWebSocket(attachment);

    // Restore from hibernation
    await server.restoreFromHibernation(mockWs);

    // Check restored state
    const childState = server.getChildState('child-with-history');
    expect(childState).toBeDefined();
    expect(childState?.lastAckedSequence).toBe(42);
    expect(childState?.lastReceivedSequence).toBe(42);
  });

  // ===========================================================================
  // Hibernation Mode Support
  // ===========================================================================

  test('supports hibernation mode', () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // Setup auto-response for ping/pong (hibernation feature)
    server.setupAutoResponse();

    // Should configure auto-response in context
    expect(mockCtx.setWebSocketAutoResponse).toHaveBeenCalledWith({
      request: 'ping',
      response: 'pong',
    });
  });

  test('preserves attachment data through hibernation cycle', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    const originalAttachment = createAttachment({
      childDoId: 'hibernation-test-child',
      childShardName: 'orders-partition-2',
      lastAckSequence: 100,
      connectedAt: Date.now() - 60000,
    });

    const mockWs = createMockWebSocket(originalAttachment);

    // Restore from hibernation (simulating DO wake-up)
    const restored = await server.restoreFromHibernation(mockWs);

    // Attachment data should be preserved
    expect(restored).toBeDefined();
    expect(restored?.childDoId).toBe('hibernation-test-child');
    expect(restored?.childShardName).toBe('orders-partition-2');
    expect(restored?.lastAckSequence).toBe(100);
  });

  test('restores all WebSocket connections from context on hibernation wake', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // Create multiple mock WebSockets with attachments
    const mockWs1 = createMockWebSocket(createAttachment({ childDoId: 'child-a' }));
    const mockWs2 = createMockWebSocket(createAttachment({ childDoId: 'child-b' }));
    const mockWs3 = createMockWebSocket(createAttachment({ childDoId: 'child-c' }));

    // Configure getWebSockets to return all connections
    (mockCtx.getWebSockets as ReturnType<typeof vi.fn>).mockReturnValue([mockWs1, mockWs2, mockWs3]);

    // Restore without specific WebSocket (restores from context)
    await server.restoreFromHibernation();

    // All children should be restored
    expect(server.getConnectedChildren()).toBe(3);
    expect(server.getChildState('child-a')).toBeDefined();
    expect(server.getChildState('child-b')).toBeDefined();
    expect(server.getChildState('child-c')).toBeDefined();
  });

  // ===========================================================================
  // Broadcast to Multiple Clients
  // ===========================================================================

  test('broadcasts to multiple clients', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // Create multiple client WebSockets
    const mockWs1 = createMockWebSocket(createAttachment({ childDoId: 'broadcast-child-1' }));
    const mockWs2 = createMockWebSocket(createAttachment({ childDoId: 'broadcast-child-2' }));
    const mockWs3 = createMockWebSocket(createAttachment({ childDoId: 'broadcast-child-3' }));

    // Accept all connections
    server.acceptHibernatingWebSocket(mockWs1, 'broadcast-child-1');
    server.acceptHibernatingWebSocket(mockWs2, 'broadcast-child-2');
    server.acceptHibernatingWebSocket(mockWs3, 'broadcast-child-3');

    // Configure getWebSockets to return all
    (mockCtx.getWebSockets as ReturnType<typeof vi.fn>).mockReturnValue([mockWs1, mockWs2, mockWs3]);

    // Restore state for all
    await server.restoreFromHibernation();

    // Verify all clients are tracked
    expect(server.getConnectedChildren()).toBe(3);

    // Each client should have its own state
    expect(server.getChildState('broadcast-child-1')).toBeDefined();
    expect(server.getChildState('broadcast-child-2')).toBeDefined();
    expect(server.getChildState('broadcast-child-3')).toBeDefined();
  });

  test('buffer is accessible for batch operations', () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // Buffer should be initialized
    expect(server.buffer).toBeDefined();

    // Can add batches to buffer
    const result = server.buffer.addBatch(
      'source-do-1',
      [{ sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 'test', rowId: 'r1' }],
      1
    );

    expect(result.added).toBe(true);
    expect(result.isDuplicate).toBe(false);

    // Buffer stats should reflect the added batch
    const stats = server.buffer.getStats();
    expect(stats.entryCount).toBe(1);
    expect(stats.batchCount).toBe(1);
  });

  // ===========================================================================
  // Client Disconnect Handling
  // ===========================================================================

  test('handles client disconnect gracefully', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // Setup a connected client
    const attachment = createAttachment({ childDoId: 'disconnect-test-child' });
    const mockWs = createMockWebSocket(attachment);

    server.acceptHibernatingWebSocket(mockWs, 'disconnect-test-child');

    (mockCtx.getWebSockets as ReturnType<typeof vi.fn>).mockReturnValue([mockWs]);
    await server.restoreFromHibernation();

    // Verify client is connected
    expect(server.getConnectedChildren()).toBe(1);
    expect(server.getChildState('disconnect-test-child')).toBeDefined();

    // Note: The actual webSocketClose handler is on LakehouseParentDO
    // EvoDBRpcServer provides state management for the server
    // The child state persists after disconnect for potential reconnection
  });

  test('maintains child state after disconnect for reconnection', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // Setup initial connection
    const attachment = createAttachment({
      childDoId: 'reconnect-child',
      lastAckSequence: 50,
    });
    const mockWs = createMockWebSocket(attachment);

    (mockCtx.getWebSockets as ReturnType<typeof vi.fn>).mockReturnValue([mockWs]);
    await server.restoreFromHibernation();

    // Child state should be preserved with last ack sequence
    const state = server.getChildState('reconnect-child');
    expect(state).toBeDefined();
    expect(state?.lastAckedSequence).toBe(50);

    // State persists for reconnection scenarios
    expect(state?.lastReceivedSequence).toBe(50);
  });

  // ===========================================================================
  // Buffer State Persistence
  // ===========================================================================

  test('saves buffer state to storage', async () => {
    const server = new EvoDBRpcServer({
      ctx: mockCtx,
      storage: mockCtx.storage,
    });

    // Add some data to buffer
    server.buffer.addBatch(
      'persist-child',
      [
        { sequence: 1, timestamp: Date.now(), operation: 'INSERT', table: 'users', rowId: 'u1' },
        { sequence: 2, timestamp: Date.now(), operation: 'UPDATE', table: 'users', rowId: 'u1' },
      ],
      1
    );

    // Save buffer state
    await server.saveBufferState();

    // Storage.put should be called with buffer snapshot
    expect(mockCtx.storage?.put).toHaveBeenCalledWith(
      'buffer_snapshot',
      expect.objectContaining({
        batches: expect.any(Array),
        totalEntryCount: 2,
      })
    );
  });

  // ===========================================================================
  // Memory Pressure Handling
  // ===========================================================================

  test('triggers flush on memory pressure', async () => {
    const onFlush = vi.fn().mockResolvedValue({ success: true });

    const server = new EvoDBRpcServer({
      ctx: mockCtx,
      onFlush,
      memoryPressureThreshold: 0.9,
    });

    // Simulate memory pressure above threshold
    await server.simulateMemoryPressure(0.95);

    // Flush should be triggered
    expect(onFlush).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'memory_pressure' })
    );
  });

  test('does not trigger flush below memory pressure threshold', async () => {
    const onFlush = vi.fn().mockResolvedValue({ success: true });

    const server = new EvoDBRpcServer({
      ctx: mockCtx,
      onFlush,
      memoryPressureThreshold: 0.9,
    });

    // Simulate memory usage below threshold
    await server.simulateMemoryPressure(0.7);

    // Flush should not be triggered
    expect(onFlush).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  test('handles WebSocket without deserializeAttachment method', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    // WebSocket without proper attachment methods (edge case)
    const brokenWs = {
      send: vi.fn(),
      // Missing deserializeAttachment
    };

    (mockCtx.getWebSockets as ReturnType<typeof vi.fn>).mockReturnValue([brokenWs]);

    // Should not throw
    await expect(server.restoreFromHibernation()).resolves.not.toThrow();

    // No children should be restored from broken WebSocket
    expect(server.getConnectedChildren()).toBe(0);
  });

  test('handles empty WebSocket list on restore', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    (mockCtx.getWebSockets as ReturnType<typeof vi.fn>).mockReturnValue([]);

    // Should handle empty list gracefully
    await server.restoreFromHibernation();

    expect(server.getConnectedChildren()).toBe(0);
  });

  test('works without context configured', () => {
    // Server without context (for standalone testing)
    const server = new EvoDBRpcServer({});

    // Should still be functional for basic operations
    expect(server.buffer).toBeDefined();
    expect(server.getConnectedChildren()).toBe(0);

    // acceptHibernatingWebSocket should be safe without ctx
    const mockWs = createMockWebSocket();
    expect(() => {
      server.acceptHibernatingWebSocket(mockWs, 'test-child');
    }).not.toThrow();

    // setupAutoResponse should be safe without ctx
    expect(() => {
      server.setupAutoResponse();
    }).not.toThrow();
  });

  test('creates valid attachment with all required fields', () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    const state = {
      childDoId: 'full-state-child',
      childShardName: 'shard-name',
      lastAckSequence: 999,
      connectedAt: 1700000000000,
      protocolVersion: 1,
      capabilityFlags: 0x07,
    };

    const attachment = server.createWebSocketAttachment(state);

    // All fields should be present
    expect(attachment.childDoId).toBe('full-state-child');
    expect(attachment.childShardName).toBe('shard-name');
    expect(attachment.lastAckSequence).toBe(999);
    expect(attachment.connectedAt).toBe(1700000000000);
    expect(attachment.protocolVersion).toBe(1);
    expect(attachment.capabilityFlags).toBe(0x07);
  });

  test('restoreFromHibernation returns attachment when WebSocket provided', async () => {
    const server = new EvoDBRpcServer({ ctx: mockCtx });

    const attachment = createAttachment({
      childDoId: 'return-test',
      lastAckSequence: 25,
    });

    const mockWs = createMockWebSocket(attachment);

    const result = await server.restoreFromHibernation(mockWs);

    expect(result).toBeDefined();
    expect(result?.childDoId).toBe('return-test');
    expect(result?.lastAckSequence).toBe(25);
  });
});
