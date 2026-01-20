/**
 * Event Handler Error Logging Tests (TDD)
 *
 * Issue: evodb-5xa
 *
 * Tests that demonstrate handler errors in EventEmitter.emit() should be logged
 * rather than silently swallowed.
 *
 * TDD Approach:
 * 1. RED: Write failing tests showing handler errors are silently swallowed
 * 2. GREEN: Add try-catch in EventEmitter.emit() that logs errors
 * 3. REFACTOR: Consider re-throwing in non-blocking way or error callbacks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LakehouseRpcClient } from '../client.js';

describe('EventEmitter Error Handling', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on console.error to verify error logging
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Handler Error Logging', () => {
    it('should log errors when event handlers throw synchronously', () => {
      // RED: Currently, errors in handlers are silently swallowed
      // This test will fail until we add error logging

      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
      });

      const errorMessage = 'Handler threw an error!';

      // Register a handler that throws
      client.on('stateChange', () => {
        throw new Error(errorMessage);
      });

      // Emit an event - this should trigger the handler
      // Currently the error is swallowed silently
      // After fix, it should be logged to console.error
      (client as any).emit('stateChange', 'connected');

      // Verify the error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('EventEmitter'),
        expect.any(Error)
      );
    });

    it('should log error details including event name', () => {
      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
      });

      client.on('error', () => {
        throw new Error('Nested error in error handler');
      });

      (client as any).emit('error', new Error('Original error'));

      // Should log with context about which event caused the error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/error.*handler/i),
        expect.any(Error)
      );
    });

    it('should continue calling other handlers after one throws', () => {
      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
      });

      const handler1 = vi.fn().mockImplementation(() => {
        throw new Error('First handler fails');
      });
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      client.on('message', handler1);
      client.on('message', handler2);
      client.on('message', handler3);

      (client as any).emit('message', { type: 'test' });

      // All handlers should have been called despite handler1 throwing
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();

      // And the error should have been logged
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log multiple errors if multiple handlers throw', () => {
      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
      });

      client.on('ack', () => {
        throw new Error('Handler 1 error');
      });
      client.on('ack', () => {
        throw new Error('Handler 2 error');
      });

      (client as any).emit('ack', { sequenceNumber: 1 });

      // Both errors should be logged
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('should include the thrown error in log output', () => {
      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
      });

      const specificError = new Error('Specific error message for testing');

      client.on('connected', () => {
        throw specificError;
      });

      (client as any).emit('connected', undefined);

      // The actual error object should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.any(String),
        specificError
      );
    });
  });

  describe('Error Callback Support', () => {
    it('should support optional onHandlerError callback for custom error handling', () => {
      // This test verifies we can add custom error handling beyond console.error
      const onHandlerError = vi.fn();

      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
        onHandlerError,
      } as any);

      const testError = new Error('Test error');

      client.on('stateChange', () => {
        throw testError;
      });

      (client as any).emit('stateChange', 'disconnected');

      // Custom error handler should be called with event name and error
      expect(onHandlerError).toHaveBeenCalledWith('stateChange', testError);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should log errors in stateChange handlers during connect', async () => {
      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
      });

      // Simulate a user adding a buggy state change handler
      client.on('stateChange', (state) => {
        if (state === 'connecting') {
          throw new Error('Bug in user state handler');
        }
      });

      // Emit stateChange which happens during connection flow
      (client as any).emit('stateChange', 'connecting');

      // Error should be logged, not silently swallowed
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log errors in ack handlers without disrupting message flow', () => {
      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
      });

      // Track if internal ack handling completes
      const internalAckHandler = vi.fn();

      // User adds a buggy ack handler
      client.on('ack', () => {
        throw new Error('User ack handler bug');
      });

      // Internal handler (added after user handler)
      client.on('ack', internalAckHandler);

      (client as any).emit('ack', { sequenceNumber: 42 });

      // Internal handler should still be called
      expect(internalAckHandler).toHaveBeenCalled();
      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log errors in error event handlers without infinite recursion', () => {
      const client = new LakehouseRpcClient('test-do-id', {
        parentDoUrl: 'ws://test/rpc',
      });

      // User adds a buggy error handler that also throws
      client.on('error', () => {
        throw new Error('Error handler also throws');
      });

      // Emit an error event
      (client as any).emit('error', new Error('Original error'));

      // Should log the handler error without infinite loop
      expect(consoleErrorSpy).toHaveBeenCalled();
      // Should only log once (no recursion)
      expect(consoleErrorSpy.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });
});
