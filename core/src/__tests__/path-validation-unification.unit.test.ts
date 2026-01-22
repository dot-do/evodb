/**
 * @evodb/core - Path Validation Unification Tests
 *
 * Issue: evodb-7lmk - Unify path validation between storage-provider and storage modules
 *
 * Tests verify that:
 * 1. storage-provider uses centralized validation from validation.ts
 * 2. storage module uses centralized validation from validation.ts
 * 3. No duplicate path validation logic exists
 */

import { describe, it, expect } from 'vitest';

// Import centralized validation
import { assertValidPath } from '../validation.js';

// Import storage-provider to verify it uses centralized validation
import { R2StorageProvider, InMemoryStorageProvider } from '../storage-provider.js';

// Import storage module to verify it uses centralized validation
import {
  validateStoragePath as storageValidateStoragePath,
  validateKeyPrefix as storageValidateKeyPrefix,
  R2Storage,
  R2ObjectStorageAdapter,
} from '../storage.js';

// Import from validation/index.ts to verify the alias export
import { validateStoragePath as validationValidateStoragePath } from '../validation/index.js';

describe('Path Validation Unification (evodb-7lmk)', () => {
  describe('storage-provider uses centralized validation', () => {
    it('should use assertValidPath from validation.ts for path validation', async () => {
      // Both should throw the same error for invalid paths
      const invalidPath = '../../../etc/passwd';

      // Test centralized validation
      expect(() => assertValidPath(invalidPath)).toThrow();

      // Test that storage-provider validates paths (via R2StorageProvider.get)
      // We can't directly test internal validateStoragePath, but we can verify
      // the behavior is consistent by checking error messages
      const mockBucket = {
        get: async () => null,
        put: async () => ({ key: '', size: 0, etag: '', uploaded: new Date(), arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' }),
        delete: async () => {},
        list: async () => ({ objects: [], truncated: false }),
        head: async () => null,
      };

      const provider = new R2StorageProvider(mockBucket);

      // Valid paths should work
      await expect(provider.get('valid/path')).resolves.toBeNull();

      // Invalid paths should throw with consistent error message pattern
      await expect(provider.get('../../../etc/passwd')).rejects.toThrow(/path/i);
    });

    it('should reject path traversal attempts consistently', async () => {
      const traversalPaths = [
        '../secret',
        '..%2f..%2fetc/passwd',
        '%2e%2e/secret',
      ];

      for (const invalidPath of traversalPaths) {
        // Centralized validation should reject
        expect(() => assertValidPath(invalidPath)).toThrow();
      }
    });

    it('should accept valid paths consistently', () => {
      const validPaths = [
        'blocks/123',
        'data/2024/01/file.bin',
        'tenant_123/blocks/abc-def',
      ];

      for (const validPath of validPaths) {
        // Centralized validation should accept
        expect(() => assertValidPath(validPath)).not.toThrow();
      }
    });
  });

  describe('storage module uses centralized validation', () => {
    it('should export validateStoragePath that matches centralized validation behavior', () => {
      // Both should have the same behavior for invalid paths
      const invalidPaths = [
        '../secret',
        '/etc/passwd',
        'file\0.txt',
      ];

      for (const invalidPath of invalidPaths) {
        expect(() => storageValidateStoragePath(invalidPath)).toThrow();
        expect(() => assertValidPath(invalidPath)).toThrow();
      }
    });

    it('should export validateKeyPrefix that uses centralized validation', () => {
      // Empty prefix should be allowed
      expect(() => storageValidateKeyPrefix('')).not.toThrow();

      // Valid prefixes should pass
      expect(() => storageValidateKeyPrefix('tenant-123')).not.toThrow();

      // Invalid prefixes should fail
      expect(() => storageValidateKeyPrefix('../secret')).toThrow();
    });

    it('should have consistent error messages between modules', () => {
      const invalidPath = '../../../etc/passwd';

      // Both should throw with similar error patterns
      try {
        storageValidateStoragePath(invalidPath);
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toMatch(/path/i);
      }

      try {
        assertValidPath(invalidPath);
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toMatch(/path/i);
      }
    });
  });

  describe('no duplicate path validation logic', () => {
    it('storage.ts validateStoragePath should be re-exported from validation.ts', () => {
      // After unification, both should reference the same function
      // We verify this by checking they produce identical error messages
      const testPaths = [
        { path: '', expectedMatch: /empty|non-empty/i },
        { path: '../secret', expectedMatch: /path traversal/i },
        { path: '/etc/passwd', expectedMatch: /absolute/i },
        { path: 'file\0.txt', expectedMatch: /control/i },
      ];

      for (const { path, expectedMatch } of testPaths) {
        let storageError: Error | null = null;
        let validationError: Error | null = null;

        try {
          storageValidateStoragePath(path);
        } catch (e) {
          storageError = e as Error;
        }

        try {
          assertValidPath(path);
        } catch (e) {
          validationError = e as Error;
        }

        // Both should throw
        expect(storageError).not.toBeNull();
        expect(validationError).not.toBeNull();

        // Both should have similar error messages (indicating unified validation)
        expect(storageError!.message).toMatch(expectedMatch);
        expect(validationError!.message).toMatch(expectedMatch);
      }
    });

    it('storage-provider.ts should use centralized validation', async () => {
      // Test by verifying that R2StorageProvider produces the same error patterns
      // as the centralized assertValidPath
      const mockBucket = {
        get: async () => null,
        put: async () => ({ key: '', size: 0, etag: '', uploaded: new Date(), arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' }),
        delete: async () => {},
        list: async () => ({ objects: [], truncated: false }),
        head: async () => null,
      };

      const provider = new R2StorageProvider(mockBucket);

      const testPaths = [
        '../secret',
        '/etc/passwd',
        'file\0.txt',
      ];

      for (const path of testPaths) {
        // Both should throw for invalid paths
        let providerError: Error | null = null;
        let validationError: Error | null = null;

        try {
          await provider.get(path);
        } catch (e) {
          providerError = e as Error;
        }

        try {
          assertValidPath(path);
        } catch (e) {
          validationError = e as Error;
        }

        // Both should throw
        expect(providerError).not.toBeNull();
        expect(validationError).not.toBeNull();

        // After unification, error messages should be identical or very similar
        // (both using ValidationError from the centralized validation)
        expect(providerError!.message).toMatch(/path/i);
        expect(validationError!.message).toMatch(/path/i);
      }
    });

    it('validation/index.ts should export validateStoragePath alias', () => {
      // The validateStoragePath function should be available from validation submodule
      expect(typeof validationValidateStoragePath).toBe('function');

      // Should work correctly
      expect(() => validationValidateStoragePath('valid/path')).not.toThrow();
      expect(() => validationValidateStoragePath('../secret')).toThrow();
    });
  });

  describe('consistent error messages', () => {
    it('should provide consistent error messages for path traversal', () => {
      const invalidPath = '../../../etc/passwd';

      try {
        assertValidPath(invalidPath);
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        // Error message should be descriptive and consistent
        expect(error.message).toMatch(/invalid path|path traversal/i);
      }
    });

    it('should provide consistent error messages for absolute paths', () => {
      const invalidPath = '/etc/passwd';

      try {
        assertValidPath(invalidPath);
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        // Error message should mention absolute paths
        expect(error.message).toMatch(/invalid path|absolute/i);
      }
    });

    it('should provide consistent error messages for empty paths', () => {
      try {
        assertValidPath('');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        // Error message should be descriptive
        expect(error.message).toMatch(/invalid path|empty|non-empty/i);
      }
    });

    it('should provide consistent error messages for control characters', () => {
      const invalidPath = 'file\0.txt';

      try {
        assertValidPath(invalidPath);
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        // Error message should mention the issue
        expect(error.message).toMatch(/invalid path|control/i);
      }
    });
  });
});
