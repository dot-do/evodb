/**
 * @evodb/core - JSON Validation Schema Tests
 *
 * TDD tests for JSON.parse validation schemas.
 * Issue: evodb-hyz2 - TDD: Add Zod validation for JSON.parse results
 *
 * These schemas provide type-safe validation for JSON.parse results
 * using the existing validation infrastructure (ZodSchemaLike interface).
 */

import { describe, it, expect } from 'vitest';
import {
  parseJSON,
  safeParseJSON,
  createTypeGuard,
  JSONParseError,
  JSONValidationError,
} from '../validation.js';
import {
  SerializableBackupMetadataSchema,
  ImportJSONRecordSchema,
  ImportJSONArraySchema,
  isImportJSONRecord,
  isImportJSONArray,
  isSerializableBackupMetadata,
} from '../schemas.js';
import { BackupType, BackupStatus } from '../backup.js';

describe('JSON Validation Schemas', () => {
  describe('SerializableBackupMetadataSchema', () => {
    it('should validate a valid full backup metadata', () => {
      const validMetadata = {
        id: 'backup-123',
        type: BackupType.Full,
        status: BackupStatus.Completed,
        createdAt: Date.now(),
        completedAt: Date.now() + 1000,
        sizeBytes: 1024,
        checksum: 12345,
        rowCount: 100,
        schemaVersion: 1,
        tags: ['daily', 'production'],
        description: 'Daily backup',
      };

      const json = JSON.stringify(validMetadata);
      const result = parseJSON(json, SerializableBackupMetadataSchema);

      expect(result.id).toBe('backup-123');
      expect(result.type).toBe(BackupType.Full);
      expect(result.status).toBe(BackupStatus.Completed);
      expect(result.rowCount).toBe(100);
    });

    it('should validate incremental backup metadata with baseSnapshotId', () => {
      const validMetadata = {
        id: 'backup-456',
        type: BackupType.Incremental,
        status: BackupStatus.Completed,
        createdAt: Date.now(),
        sizeBytes: 512,
        checksum: 67890,
        baseSnapshotId: 'backup-123',
        rowCount: 50,
        minLsn: '100',
        maxLsn: '200',
      };

      const json = JSON.stringify(validMetadata);
      const result = parseJSON(json, SerializableBackupMetadataSchema);

      expect(result.baseSnapshotId).toBe('backup-123');
      expect(result.minLsn).toBe('100');
      expect(result.maxLsn).toBe('200');
    });

    it('should validate minimal required fields only', () => {
      const minimalMetadata = {
        id: 'backup-789',
        type: BackupType.Full,
        status: BackupStatus.InProgress,
        createdAt: Date.now(),
        sizeBytes: 0,
        checksum: 0,
        rowCount: 0,
      };

      const json = JSON.stringify(minimalMetadata);
      const result = safeParseJSON(json, SerializableBackupMetadataSchema);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('backup-789');
    });

    it('should reject metadata with missing required field: id', () => {
      const invalidMetadata = {
        type: BackupType.Full,
        status: BackupStatus.Completed,
        createdAt: Date.now(),
        sizeBytes: 1024,
        checksum: 12345,
        rowCount: 100,
      };

      const json = JSON.stringify(invalidMetadata);
      expect(() => parseJSON(json, SerializableBackupMetadataSchema)).toThrow(
        JSONValidationError
      );
    });

    it('should reject metadata with missing required field: type', () => {
      const invalidMetadata = {
        id: 'backup-123',
        status: BackupStatus.Completed,
        createdAt: Date.now(),
        sizeBytes: 1024,
        checksum: 12345,
        rowCount: 100,
      };

      const json = JSON.stringify(invalidMetadata);
      const result = safeParseJSON(json, SerializableBackupMetadataSchema);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject metadata with invalid type enum value', () => {
      const invalidMetadata = {
        id: 'backup-123',
        type: 'invalid-type',
        status: BackupStatus.Completed,
        createdAt: Date.now(),
        sizeBytes: 1024,
        checksum: 12345,
        rowCount: 100,
      };

      const json = JSON.stringify(invalidMetadata);
      const result = safeParseJSON(json, SerializableBackupMetadataSchema);

      expect(result.success).toBe(false);
    });

    it('should reject metadata with invalid status enum value', () => {
      const invalidMetadata = {
        id: 'backup-123',
        type: BackupType.Full,
        status: 'invalid-status',
        createdAt: Date.now(),
        sizeBytes: 1024,
        checksum: 12345,
        rowCount: 100,
      };

      const json = JSON.stringify(invalidMetadata);
      const result = safeParseJSON(json, SerializableBackupMetadataSchema);

      expect(result.success).toBe(false);
    });

    it('should reject metadata with wrong type for createdAt', () => {
      const invalidMetadata = {
        id: 'backup-123',
        type: BackupType.Full,
        status: BackupStatus.Completed,
        createdAt: 'not-a-number',
        sizeBytes: 1024,
        checksum: 12345,
        rowCount: 100,
      };

      const json = JSON.stringify(invalidMetadata);
      const result = safeParseJSON(json, SerializableBackupMetadataSchema);

      expect(result.success).toBe(false);
    });

    it('should reject metadata with non-string tags', () => {
      const invalidMetadata = {
        id: 'backup-123',
        type: BackupType.Full,
        status: BackupStatus.Completed,
        createdAt: Date.now(),
        sizeBytes: 1024,
        checksum: 12345,
        rowCount: 100,
        tags: [123, 456], // should be strings
      };

      const json = JSON.stringify(invalidMetadata);
      const result = safeParseJSON(json, SerializableBackupMetadataSchema);

      expect(result.success).toBe(false);
    });

    it('should reject non-object input', () => {
      expect(() => parseJSON('"string"', SerializableBackupMetadataSchema)).toThrow(
        JSONValidationError
      );
      expect(() => parseJSON('123', SerializableBackupMetadataSchema)).toThrow(
        JSONValidationError
      );
      expect(() => parseJSON('[]', SerializableBackupMetadataSchema)).toThrow(
        JSONValidationError
      );
      expect(() => parseJSON('null', SerializableBackupMetadataSchema)).toThrow(
        JSONValidationError
      );
    });

    it('should handle invalid JSON syntax', () => {
      expect(() => parseJSON('not valid json', SerializableBackupMetadataSchema)).toThrow(
        JSONParseError
      );
    });
  });

  describe('ImportJSONRecordSchema', () => {
    it('should validate a simple record', () => {
      const record = { name: 'Alice', age: 30, email: 'alice@example.com' };
      const json = JSON.stringify(record);
      const result = parseJSON(json, ImportJSONRecordSchema);

      expect(result.name).toBe('Alice');
      expect(result.age).toBe(30);
    });

    it('should validate nested objects', () => {
      const record = {
        user: { name: 'Bob', profile: { bio: 'Developer' } },
        settings: { theme: 'dark' },
      };
      const json = JSON.stringify(record);
      const result = parseJSON(json, ImportJSONRecordSchema);

      expect(result.user).toEqual({ name: 'Bob', profile: { bio: 'Developer' } });
    });

    it('should validate records with arrays', () => {
      const record = { tags: ['tech', 'coding'], scores: [1, 2, 3] };
      const json = JSON.stringify(record);
      const result = parseJSON(json, ImportJSONRecordSchema);

      expect(result.tags).toEqual(['tech', 'coding']);
    });

    it('should validate records with null values', () => {
      const record = { name: 'Charlie', deletedAt: null };
      const json = JSON.stringify(record);
      const result = parseJSON(json, ImportJSONRecordSchema);

      expect(result.deletedAt).toBeNull();
    });

    it('should validate empty object', () => {
      const record = {};
      const json = JSON.stringify(record);
      const result = parseJSON(json, ImportJSONRecordSchema);

      expect(result).toEqual({});
    });

    it('should reject non-object values', () => {
      const result1 = safeParseJSON('"string"', ImportJSONRecordSchema);
      expect(result1.success).toBe(false);

      const result2 = safeParseJSON('123', ImportJSONRecordSchema);
      expect(result2.success).toBe(false);

      const result3 = safeParseJSON('null', ImportJSONRecordSchema);
      expect(result3.success).toBe(false);
    });

    it('should reject arrays (arrays are not records)', () => {
      const result = safeParseJSON('[1, 2, 3]', ImportJSONRecordSchema);
      expect(result.success).toBe(false);
    });
  });

  describe('ImportJSONArraySchema', () => {
    it('should validate array of simple records', () => {
      const data = [
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
      ];
      const json = JSON.stringify(data);
      const result = parseJSON(json, ImportJSONArraySchema);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
    });

    it('should validate empty array', () => {
      const json = '[]';
      const result = parseJSON(json, ImportJSONArraySchema);

      expect(result).toEqual([]);
    });

    it('should validate array with nested objects', () => {
      const data = [
        { user: { name: 'Alice' }, settings: { theme: 'light' } },
        { user: { name: 'Bob' }, settings: { theme: 'dark' } },
      ];
      const json = JSON.stringify(data);
      const result = parseJSON(json, ImportJSONArraySchema);

      expect(result[0].user).toEqual({ name: 'Alice' });
    });

    it('should reject non-array input', () => {
      const result1 = safeParseJSON('{"name": "Alice"}', ImportJSONArraySchema);
      expect(result1.success).toBe(false);

      const result2 = safeParseJSON('"string"', ImportJSONArraySchema);
      expect(result2.success).toBe(false);

      const result3 = safeParseJSON('123', ImportJSONArraySchema);
      expect(result3.success).toBe(false);
    });

    it('should reject array with non-object elements', () => {
      const result1 = safeParseJSON('["string1", "string2"]', ImportJSONArraySchema);
      expect(result1.success).toBe(false);

      const result2 = safeParseJSON('[1, 2, 3]', ImportJSONArraySchema);
      expect(result2.success).toBe(false);

      const result3 = safeParseJSON('[null, null]', ImportJSONArraySchema);
      expect(result3.success).toBe(false);
    });

    it('should reject mixed array (objects and primitives)', () => {
      const result = safeParseJSON('[{"name": "Alice"}, "not an object"]', ImportJSONArraySchema);
      expect(result.success).toBe(false);
    });
  });

  describe('Type guards', () => {
    describe('isSerializableBackupMetadata', () => {
      it('should return true for valid metadata', () => {
        const metadata = {
          id: 'backup-123',
          type: BackupType.Full,
          status: BackupStatus.Completed,
          createdAt: Date.now(),
          sizeBytes: 1024,
          checksum: 12345,
          rowCount: 100,
        };
        expect(isSerializableBackupMetadata(metadata)).toBe(true);
      });

      it('should return false for invalid metadata', () => {
        expect(isSerializableBackupMetadata(null)).toBe(false);
        expect(isSerializableBackupMetadata(undefined)).toBe(false);
        expect(isSerializableBackupMetadata('string')).toBe(false);
        expect(isSerializableBackupMetadata({ id: 'only-id' })).toBe(false);
      });
    });

    describe('isImportJSONRecord', () => {
      it('should return true for valid records', () => {
        expect(isImportJSONRecord({ name: 'Alice' })).toBe(true);
        expect(isImportJSONRecord({})).toBe(true);
        expect(isImportJSONRecord({ nested: { value: 1 } })).toBe(true);
      });

      it('should return false for non-records', () => {
        expect(isImportJSONRecord(null)).toBe(false);
        expect(isImportJSONRecord(undefined)).toBe(false);
        expect(isImportJSONRecord('string')).toBe(false);
        expect(isImportJSONRecord([])).toBe(false);
        expect(isImportJSONRecord(123)).toBe(false);
      });
    });

    describe('isImportJSONArray', () => {
      it('should return true for valid arrays', () => {
        expect(isImportJSONArray([{ name: 'Alice' }])).toBe(true);
        expect(isImportJSONArray([])).toBe(true);
        expect(isImportJSONArray([{}, {}])).toBe(true);
      });

      it('should return false for non-arrays', () => {
        expect(isImportJSONArray(null)).toBe(false);
        expect(isImportJSONArray({ name: 'Alice' })).toBe(false);
        expect(isImportJSONArray('string')).toBe(false);
      });

      it('should return false for arrays with non-objects', () => {
        expect(isImportJSONArray(['string'])).toBe(false);
        expect(isImportJSONArray([123])).toBe(false);
        expect(isImportJSONArray([null])).toBe(false);
      });
    });
  });

  describe('createTypeGuard integration', () => {
    it('should create working type guard from SerializableBackupMetadataSchema', () => {
      const guard = createTypeGuard(SerializableBackupMetadataSchema);

      expect(
        guard({
          id: 'backup-123',
          type: BackupType.Full,
          status: BackupStatus.Completed,
          createdAt: Date.now(),
          sizeBytes: 1024,
          checksum: 12345,
          rowCount: 100,
        })
      ).toBe(true);

      expect(guard({ invalid: true })).toBe(false);
    });

    it('should create working type guard from ImportJSONArraySchema', () => {
      const guard = createTypeGuard(ImportJSONArraySchema);

      expect(guard([{ name: 'Alice' }, { name: 'Bob' }])).toBe(true);
      expect(guard('not an array')).toBe(false);
      expect(guard([123])).toBe(false);
    });
  });

  describe('safeParseJSON integration', () => {
    it('should safely parse valid backup metadata', () => {
      const metadata = {
        id: 'backup-123',
        type: BackupType.Full,
        status: BackupStatus.Completed,
        createdAt: Date.now(),
        sizeBytes: 1024,
        checksum: 12345,
        rowCount: 100,
      };
      const json = JSON.stringify(metadata);
      const result = safeParseJSON(json, SerializableBackupMetadataSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('backup-123');
      }
    });

    it('should return error for invalid backup metadata', () => {
      const result = safeParseJSON('{"invalid": true}', SerializableBackupMetadataSchema);

      expect(result.success).toBe(false);
      expect(result.error?.issues).toBeDefined();
    });

    it('should safely parse valid import array', () => {
      const data = [{ name: 'Alice' }, { name: 'Bob' }];
      const json = JSON.stringify(data);
      const result = safeParseJSON(json, ImportJSONArraySchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });
  });
});
