/**
 * RPC Circuit Breaker Tests
 * Issue: evodb-bnv8 - TDD: Add circuit breaker to RPC client
 *
 * Tests for circuit breaker integration with the RPC client.
 * Uses the simplified CircuitBreaker from @evodb/core.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreakerRpcClient,
  type CircuitBreakerRpcConfig,
} from '../circuit-breaker-client.js';
import type { WalEntry } from '../types.js';

// =============================================================================
// Mock Time Provider
// =============================================================================

interface MockTimeProvider {
  now: () => number;
  advance: (ms: number) => void;
  setTime: (ms: number) => void;
}

function createMockTimeProvider(initialTime = 0): MockTimeProvider {
  let currentTime = initialTime;
  return {
    now: () => currentTime,
    advance: (ms: number) => {
      currentTime += ms;
    },
    setTime: (ms: number) => {
      currentTime = ms;
    },
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function createWalEntry(sequence: number): WalEntry {
  return {
    sequence,
    timestamp: Date.now(),
    operation: 'INSERT',
    table: 'test_table',
    rowId: `row-${sequence}`,
    after: { id: `row-${sequence}` },
  };
}

// =============================================================================
// RPC CIRCUIT BREAKER TESTS
// =============================================================================

describe('RPC Circuit Breaker', () => {
  let mockTimeProvider: MockTimeProvider;
  let client: CircuitBreakerRpcClient;
  let sendCount: number;
  let shouldFail: boolean;

  beforeEach(() => {
    mockTimeProvider = createMockTimeProvider();
    sendCount = 0;
    shouldFail = false;

    const config: CircuitBreakerRpcConfig = {
      parentDoUrl: 'ws://localhost:8787/ws',
      sourceDoId: 'test-source-do',
      circuitBreaker: {
        failureThreshold: 3,
        maxBackoffMs: 5000,
        timeProvider: mockTimeProvider,
      },
      // Mock send function to track calls
      send: async () => {
        sendCount++;
        if (shouldFail) {
          throw new Error('RPC call failed');
        }
        return { status: 'ok', sequenceNumber: sendCount };
      },
    };

    client = new CircuitBreakerRpcClient(config);
  });

  describe('allows requests when circuit is closed', () => {
    it('should pass through RPC calls when circuit is closed', async () => {
      const entries = [createWalEntry(1), createWalEntry(2)];

      const result = await client.sendBatch(entries);

      expect(result.status).toBe('ok');
      expect(sendCount).toBe(1);
      expect(client.getCircuitState()).toBe('CLOSED');
    });

    it('should allow multiple consecutive successful calls', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await client.sendBatch([createWalEntry(i)]);
        expect(result.status).toBe('ok');
      }

      expect(sendCount).toBe(5);
      expect(client.getCircuitState()).toBe('CLOSED');
    });
  });

  describe('opens circuit after threshold failures', () => {
    it('should track failures but remain closed below threshold', async () => {
      shouldFail = true;

      // 2 failures with threshold of 3
      for (let i = 0; i < 2; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      expect(client.getCircuitState()).toBe('CLOSED');
      expect(client.getFailureCount()).toBe(2);
    });

    it('should open circuit after reaching failure threshold', async () => {
      shouldFail = true;

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      expect(client.getCircuitState()).toBe('OPEN');
      expect(sendCount).toBe(3);
    });

    it('should reset failure count on successful request', async () => {
      shouldFail = true;

      // 2 failures
      for (let i = 0; i < 2; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      // Now succeed
      shouldFail = false;
      await client.sendBatch([createWalEntry(10)]);

      expect(client.getFailureCount()).toBe(0);
      expect(client.getCircuitState()).toBe('CLOSED');
    });
  });

  describe('rejects requests when circuit is open', () => {
    beforeEach(async () => {
      shouldFail = true;

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      // Reset counter to verify no more calls are made
      sendCount = 0;
    });

    it('should reject requests immediately when circuit is open', async () => {
      await expect(client.sendBatch([createWalEntry(100)])).rejects.toThrow(
        /circuit.*open/i
      );
      expect(sendCount).toBe(0); // No actual RPC call made
    });

    it('should not call the underlying send function when open', async () => {
      const mockSend = vi.fn();
      client = new CircuitBreakerRpcClient({
        parentDoUrl: 'ws://localhost:8787/ws',
        sourceDoId: 'test-source-do',
        circuitBreaker: {
          failureThreshold: 1,
          maxBackoffMs: 5000,
          timeProvider: mockTimeProvider,
        },
        send: mockSend.mockRejectedValue(new Error('fail')),
      });

      // Trip the circuit
      try {
        await client.sendBatch([createWalEntry(1)]);
      } catch {
        // expected
      }

      mockSend.mockClear();

      // Try to send when open
      try {
        await client.sendBatch([createWalEntry(2)]);
      } catch {
        // expected
      }

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should provide circuit state in rejected error', async () => {
      try {
        await client.sendBatch([createWalEntry(100)]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toMatch(/open/i);
      }
    });
  });

  describe('transitions to half-open after timeout', () => {
    beforeEach(async () => {
      shouldFail = true;

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      expect(client.getCircuitState()).toBe('OPEN');
    });

    it('should transition to closed after backoff expires', () => {
      // Advance time past backoff period (initial backoff is 1000ms * 2^0 = 1000ms)
      mockTimeProvider.advance(1001);

      expect(client.getCircuitState()).toBe('CLOSED');
    });

    it('should remain open during backoff period', () => {
      mockTimeProvider.advance(500);
      expect(client.getCircuitState()).toBe('OPEN');
    });

    it('should allow request attempt after backoff expires', async () => {
      mockTimeProvider.advance(1001);
      shouldFail = false;
      sendCount = 0;

      const result = await client.sendBatch([createWalEntry(100)]);

      expect(result.status).toBe('ok');
      expect(sendCount).toBe(1);
    });
  });

  describe('closes circuit on successful request in half-open', () => {
    beforeEach(async () => {
      shouldFail = true;

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      // Advance past backoff so circuit is in "half-open" (closed in simplified model)
      mockTimeProvider.advance(1001);
    });

    it('should stay closed after successful request following backoff', async () => {
      shouldFail = false;
      sendCount = 0;

      await client.sendBatch([createWalEntry(100)]);

      expect(client.getCircuitState()).toBe('CLOSED');
      expect(client.getFailureCount()).toBe(0);
    });

    it('should reopen circuit if request fails after backoff', async () => {
      shouldFail = true;
      sendCount = 0;

      try {
        await client.sendBatch([createWalEntry(100)]);
      } catch {
        // expected
      }

      // Circuit should be open again with increased backoff
      expect(client.getCircuitState()).toBe('OPEN');
    });

    it('should increase backoff time on repeated failures', async () => {
      shouldFail = true;
      sendCount = 0;

      try {
        await client.sendBatch([createWalEntry(100)]);
      } catch {
        // expected
      }

      // First backoff was 1000ms, second should be 2000ms
      mockTimeProvider.advance(1500);
      expect(client.getCircuitState()).toBe('OPEN'); // Still in backoff

      mockTimeProvider.advance(600);
      expect(client.getCircuitState()).toBe('CLOSED'); // Second backoff expired
    });
  });

  describe('statistics tracking', () => {
    it('should track success count', async () => {
      await client.sendBatch([createWalEntry(1)]);
      await client.sendBatch([createWalEntry(2)]);

      const stats = client.getStats();
      expect(stats.successCount).toBe(2);
    });

    it('should track total failure count', async () => {
      shouldFail = true;

      for (let i = 0; i < 2; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      const stats = client.getStats();
      expect(stats.totalFailureCount).toBe(2);
    });

    it('should track rejected count when open', async () => {
      shouldFail = true;

      // Trip circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      // These should be rejected immediately
      for (let i = 0; i < 5; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      const stats = client.getStats();
      expect(stats.rejectedCount).toBe(5);
    });
  });

  describe('configuration options', () => {
    it('should respect custom failure threshold', async () => {
      client = new CircuitBreakerRpcClient({
        parentDoUrl: 'ws://localhost:8787/ws',
        sourceDoId: 'test-source-do',
        circuitBreaker: {
          failureThreshold: 5,
          maxBackoffMs: 5000,
          timeProvider: mockTimeProvider,
        },
        send: async () => {
          throw new Error('fail');
        },
      });

      // 4 failures should not trip
      for (let i = 0; i < 4; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      expect(client.getCircuitState()).toBe('CLOSED');

      // 5th failure trips it
      try {
        await client.sendBatch([createWalEntry(5)]);
      } catch {
        // expected
      }

      expect(client.getCircuitState()).toBe('OPEN');
    });

    it('should respect custom maxBackoffMs', async () => {
      client = new CircuitBreakerRpcClient({
        parentDoUrl: 'ws://localhost:8787/ws',
        sourceDoId: 'test-source-do',
        circuitBreaker: {
          failureThreshold: 1,
          maxBackoffMs: 500, // Very short
          timeProvider: mockTimeProvider,
        },
        send: async () => {
          throw new Error('fail');
        },
      });

      // Trip the circuit
      try {
        await client.sendBatch([createWalEntry(1)]);
      } catch {
        // expected
      }

      expect(client.getCircuitState()).toBe('OPEN');

      // Should be capped at 500ms
      mockTimeProvider.advance(501);
      expect(client.getCircuitState()).toBe('CLOSED');
    });

    it('should support custom failure predicate', async () => {
      client = new CircuitBreakerRpcClient({
        parentDoUrl: 'ws://localhost:8787/ws',
        sourceDoId: 'test-source-do',
        circuitBreaker: {
          failureThreshold: 2,
          maxBackoffMs: 5000,
          // Only count network errors as failures
          isFailure: (error) => {
            return error instanceof Error && error.message.includes('network');
          },
          timeProvider: mockTimeProvider,
        },
        send: async () => {
          throw new Error('validation error');
        },
      });

      // Validation errors should not count
      try {
        await client.sendBatch([createWalEntry(1)]);
      } catch {
        // expected
      }

      expect(client.getFailureCount()).toBe(0);
    });
  });

  describe('manual controls', () => {
    it('should allow manual circuit reset', async () => {
      shouldFail = true;

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await client.sendBatch([createWalEntry(i)]);
        } catch {
          // expected
        }
      }

      expect(client.getCircuitState()).toBe('OPEN');

      // Manual reset
      client.resetCircuit();

      expect(client.getCircuitState()).toBe('CLOSED');
      expect(client.getFailureCount()).toBe(0);
    });

    it('should allow manual circuit trip', () => {
      expect(client.getCircuitState()).toBe('CLOSED');

      client.tripCircuit();

      expect(client.getCircuitState()).toBe('OPEN');
    });
  });
});
