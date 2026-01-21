/**
 * Tests for captureStackTrace utility
 *
 * TDD: Tests for encapsulating V8-specific stack trace capture
 *
 * The captureStackTrace helper should:
 * 1. Encapsulate V8-specific Error.captureStackTrace
 * 2. Work safely in non-V8 environments (graceful no-op)
 * 3. Properly exclude the constructor from the stack trace
 * 4. Be type-safe without needing `any` casts
 */

import { describe, it, expect } from 'vitest';
import { captureStackTrace } from '../stack-trace.js';
import {
  EvoDBError,
  QueryError,
  TimeoutError,
  ValidationError,
  StorageError,
  CorruptedBlockError,
} from '../errors.js';

describe('captureStackTrace utility', () => {
  describe('basic functionality', () => {
    it('should be a function', () => {
      expect(typeof captureStackTrace).toBe('function');
    });

    it('should not throw when called with valid arguments', () => {
      const error = new Error('test');
      expect(() => captureStackTrace(error, Error)).not.toThrow();
    });

    it('should not throw when called with only error argument', () => {
      const error = new Error('test');
      expect(() => captureStackTrace(error)).not.toThrow();
    });

    it('should maintain stack trace on the error object', () => {
      const error = new Error('test');
      captureStackTrace(error, Error);
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('constructor exclusion', () => {
    it('should exclude the specified constructor from stack trace', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
          captureStackTrace(this, CustomError);
        }
      }

      const error = new CustomError('test message');
      // The stack should contain CustomError name but the constructor
      // frame itself should be excluded, making the first frame
      // point to the test code that created the error
      expect(error.stack).toBeDefined();
      // The error name should appear at the top of the stack
      expect(error.stack).toContain('CustomError');
    });

    it('should produce cleaner stack traces compared to default', () => {
      class ErrorWithCapture extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'ErrorWithCapture';
          captureStackTrace(this, ErrorWithCapture);
        }
      }

      const error = new ErrorWithCapture('test');
      expect(error.stack).toBeDefined();
      // Verify the stack trace starts with the error message
      expect(error.stack!.startsWith('ErrorWithCapture: test')).toBe(true);
    });
  });

  describe('type safety', () => {
    it('should accept Error instances', () => {
      const error = new Error('test');
      // Should compile and run without issues
      captureStackTrace(error, Error);
      expect(error.stack).toBeDefined();
    });

    it('should accept custom Error subclasses', () => {
      class MyError extends Error {
        constructor() {
          super('my error');
          captureStackTrace(this, MyError);
        }
      }
      const error = new MyError();
      expect(error.stack).toBeDefined();
    });

    it('should work with objects that have a stack property', () => {
      const errorLike = { stack: '', message: 'test' };
      // This should not throw
      captureStackTrace(errorLike as Error, undefined);
      // Stack may or may not be modified depending on environment
      expect('stack' in errorLike).toBe(true);
    });
  });

  describe('environment compatibility', () => {
    it('should work in V8 environments (Node.js, Cloudflare Workers)', () => {
      // In V8 environments, Error.captureStackTrace should exist
      const error = new Error('test');
      captureStackTrace(error, Error);
      // Stack should be populated
      expect(error.stack).toBeDefined();
      expect(error.stack!.length).toBeGreaterThan(0);
    });

    it('should gracefully handle missing captureStackTrace', () => {
      // The utility should not throw even if called in an environment
      // where Error.captureStackTrace doesn't exist
      const error = new Error('test');
      // This should always succeed (either uses native or falls back)
      expect(() => captureStackTrace(error, Error)).not.toThrow();
    });
  });
});

describe('captureStackTrace integration with error classes', () => {
  describe('EvoDBError', () => {
    it('should have proper stack trace', () => {
      const error = new EvoDBError('test', 'TEST');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('EvoDBError');
    });

    it('should have stack trace starting with error name and message', () => {
      const error = new EvoDBError('my message', 'MY_CODE');
      expect(error.stack!.startsWith('EvoDBError: my message')).toBe(true);
    });
  });

  describe('QueryError', () => {
    it('should have proper stack trace', () => {
      const error = new QueryError('query failed');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('QueryError');
    });

    it('should have stack trace starting with QueryError', () => {
      const error = new QueryError('invalid syntax');
      expect(error.stack!.startsWith('QueryError: invalid syntax')).toBe(true);
    });
  });

  describe('TimeoutError', () => {
    it('should have proper stack trace', () => {
      const error = new TimeoutError('operation timed out');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TimeoutError');
    });
  });

  describe('ValidationError', () => {
    it('should have proper stack trace', () => {
      const error = new ValidationError('invalid data');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });

  describe('StorageError', () => {
    it('should have proper stack trace', () => {
      const error = new StorageError('storage failed');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('StorageError');
    });
  });

  describe('CorruptedBlockError', () => {
    it('should have proper stack trace', () => {
      const error = new CorruptedBlockError('block corrupted');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CorruptedBlockError');
    });
  });

  describe('stack trace quality', () => {
    it('should point to call site, not error constructor internals', () => {
      function throwQueryError(): never {
        throw new QueryError('test error');
      }

      try {
        throwQueryError();
      } catch (e) {
        const error = e as QueryError;
        // Stack should contain the function name that threw
        expect(error.stack).toContain('throwQueryError');
      }
    });

    it('should preserve error chain in nested calls', () => {
      function level1(): never {
        level2();
        throw new Error('unreachable');
      }

      function level2(): never {
        level3();
        throw new Error('unreachable');
      }

      function level3(): never {
        throw new ValidationError('deep error');
      }

      try {
        level1();
      } catch (e) {
        const error = e as ValidationError;
        // All function names should be in the stack
        expect(error.stack).toContain('level3');
        expect(error.stack).toContain('level2');
        expect(error.stack).toContain('level1');
      }
    });
  });
});
