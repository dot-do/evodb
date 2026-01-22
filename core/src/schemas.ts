/**
 * @evodb/core - JSON Validation Schemas
 *
 * Provides type-safe validation schemas for JSON.parse results.
 * Issue: evodb-hyz2 - TDD: Add Zod validation for JSON.parse results
 *
 * These schemas use the existing ZodSchemaLike interface, allowing them
 * to work with or without Zod as a runtime dependency.
 *
 * @example
 * ```typescript
 * import { parseJSON, safeParseJSON } from '@evodb/core/validation';
 * import { SerializableBackupMetadataSchema, ImportJSONArraySchema } from '@evodb/core/schemas';
 *
 * // Type-safe backup metadata parsing
 * const metadata = parseJSON(jsonStr, SerializableBackupMetadataSchema);
 *
 * // Type-safe import data parsing
 * const records = parseJSON(jsonStr, ImportJSONArraySchema);
 * ```
 *
 * @module schemas
 */

import type { ZodSchemaLike, ZodErrorLike } from './validation.js';
import { BackupType, BackupStatus, type SerializableBackupMetadata } from './backup.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * A record type for JSON import/export data
 * Represents a plain JavaScript object with string keys and any JSON-compatible values
 */
export type ImportJSONRecord = Record<string, unknown>;

/**
 * An array of records for JSON import/export data
 */
export type ImportJSONArray = ImportJSONRecord[];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a ZodErrorLike object for validation failures
 */
function createError(message: string, path: (string | number)[] = []): ZodErrorLike {
  return {
    issues: [{ code: 'custom', path, message }],
    message,
  };
}

/**
 * Checks if a value is a non-null object (not an array)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// =============================================================================
// SerializableBackupMetadata Schema
// =============================================================================

/**
 * Type guard for SerializableBackupMetadata
 */
export function isSerializableBackupMetadata(value: unknown): value is SerializableBackupMetadata {
  if (!isPlainObject(value)) return false;

  // Required fields
  if (typeof value.id !== 'string') return false;
  if (typeof value.type !== 'string') return false;
  if (typeof value.status !== 'string') return false;
  if (typeof value.createdAt !== 'number') return false;
  if (typeof value.sizeBytes !== 'number') return false;
  if (typeof value.checksum !== 'number') return false;
  if (typeof value.rowCount !== 'number') return false;

  // Validate enum values
  const validTypes: string[] = [BackupType.Full, BackupType.Incremental];
  if (!validTypes.includes(value.type)) return false;

  const validStatuses: string[] = [
    BackupStatus.InProgress,
    BackupStatus.Completed,
    BackupStatus.Failed,
    BackupStatus.Verifying,
  ];
  if (!validStatuses.includes(value.status)) return false;

  // Optional fields with type checks
  if (value.completedAt !== undefined && typeof value.completedAt !== 'number') return false;
  if (value.baseSnapshotId !== undefined && typeof value.baseSnapshotId !== 'string') return false;
  if (value.schemaVersion !== undefined && typeof value.schemaVersion !== 'number') return false;
  if (value.minLsn !== undefined && typeof value.minLsn !== 'string') return false;
  if (value.maxLsn !== undefined && typeof value.maxLsn !== 'string') return false;
  if (value.description !== undefined && typeof value.description !== 'string') return false;

  // Validate tags array if present
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags)) return false;
    if (!value.tags.every((tag): tag is string => typeof tag === 'string')) return false;
  }

  return true;
}

/**
 * Schema for validating SerializableBackupMetadata JSON
 *
 * This schema validates the serialized form of BackupMetadata,
 * where bigint fields (minLsn, maxLsn) are represented as strings.
 *
 * @example
 * ```typescript
 * import { parseJSON } from '@evodb/core/validation';
 * import { SerializableBackupMetadataSchema } from '@evodb/core/schemas';
 *
 * const json = '{"id":"backup-123","type":"full","status":"completed",...}';
 * const metadata = parseJSON(json, SerializableBackupMetadataSchema);
 * ```
 */
export const SerializableBackupMetadataSchema: ZodSchemaLike<SerializableBackupMetadata> = {
  safeParse(data: unknown): { success: true; data: SerializableBackupMetadata } | { success: false; error: ZodErrorLike } {
    if (!isPlainObject(data)) {
      return { success: false, error: createError('Expected an object') };
    }

    // Required string fields
    if (typeof data.id !== 'string') {
      return { success: false, error: createError('Expected string', ['id']) };
    }

    // Validate type enum
    if (typeof data.type !== 'string') {
      return { success: false, error: createError('Expected string', ['type']) };
    }
    const validTypes: string[] = [BackupType.Full, BackupType.Incremental];
    if (!validTypes.includes(data.type)) {
      return { success: false, error: createError(`Expected one of: ${validTypes.join(', ')}`, ['type']) };
    }

    // Validate status enum
    if (typeof data.status !== 'string') {
      return { success: false, error: createError('Expected string', ['status']) };
    }
    const validStatuses: string[] = [
      BackupStatus.InProgress,
      BackupStatus.Completed,
      BackupStatus.Failed,
      BackupStatus.Verifying,
    ];
    if (!validStatuses.includes(data.status)) {
      return { success: false, error: createError(`Expected one of: ${validStatuses.join(', ')}`, ['status']) };
    }

    // Required number fields
    if (typeof data.createdAt !== 'number') {
      return { success: false, error: createError('Expected number', ['createdAt']) };
    }
    if (typeof data.sizeBytes !== 'number') {
      return { success: false, error: createError('Expected number', ['sizeBytes']) };
    }
    if (typeof data.checksum !== 'number') {
      return { success: false, error: createError('Expected number', ['checksum']) };
    }
    if (typeof data.rowCount !== 'number') {
      return { success: false, error: createError('Expected number', ['rowCount']) };
    }

    // Optional number fields
    if (data.completedAt !== undefined && typeof data.completedAt !== 'number') {
      return { success: false, error: createError('Expected number', ['completedAt']) };
    }
    if (data.schemaVersion !== undefined && typeof data.schemaVersion !== 'number') {
      return { success: false, error: createError('Expected number', ['schemaVersion']) };
    }

    // Optional string fields
    if (data.baseSnapshotId !== undefined && typeof data.baseSnapshotId !== 'string') {
      return { success: false, error: createError('Expected string', ['baseSnapshotId']) };
    }
    if (data.minLsn !== undefined && typeof data.minLsn !== 'string') {
      return { success: false, error: createError('Expected string', ['minLsn']) };
    }
    if (data.maxLsn !== undefined && typeof data.maxLsn !== 'string') {
      return { success: false, error: createError('Expected string', ['maxLsn']) };
    }
    if (data.description !== undefined && typeof data.description !== 'string') {
      return { success: false, error: createError('Expected string', ['description']) };
    }

    // Optional tags array
    if (data.tags !== undefined) {
      if (!Array.isArray(data.tags)) {
        return { success: false, error: createError('Expected array', ['tags']) };
      }
      for (let i = 0; i < data.tags.length; i++) {
        if (typeof data.tags[i] !== 'string') {
          return { success: false, error: createError('Expected string', ['tags', i]) };
        }
      }
    }

    return { success: true, data: data as SerializableBackupMetadata };
  },

  parse(data: unknown): SerializableBackupMetadata {
    const result = this.safeParse(data);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  },
};

// =============================================================================
// ImportJSON Schemas
// =============================================================================

/**
 * Type guard for ImportJSONRecord
 */
export function isImportJSONRecord(value: unknown): value is ImportJSONRecord {
  return isPlainObject(value);
}

/**
 * Type guard for ImportJSONArray
 */
export function isImportJSONArray(value: unknown): value is ImportJSONArray {
  if (!Array.isArray(value)) return false;
  return value.every(isPlainObject);
}

/**
 * Schema for validating a single JSON record (object with string keys)
 *
 * This schema validates that the input is a plain JavaScript object.
 * It allows any JSON-compatible values (strings, numbers, booleans, null, arrays, nested objects).
 *
 * @example
 * ```typescript
 * import { parseJSON } from '@evodb/core/validation';
 * import { ImportJSONRecordSchema } from '@evodb/core/schemas';
 *
 * const json = '{"name": "Alice", "age": 30}';
 * const record = parseJSON(json, ImportJSONRecordSchema);
 * ```
 */
export const ImportJSONRecordSchema: ZodSchemaLike<ImportJSONRecord> = {
  safeParse(data: unknown): { success: true; data: ImportJSONRecord } | { success: false; error: ZodErrorLike } {
    if (!isPlainObject(data)) {
      return { success: false, error: createError('Expected a plain object (not an array or null)') };
    }
    return { success: true, data: data as ImportJSONRecord };
  },

  parse(data: unknown): ImportJSONRecord {
    const result = this.safeParse(data);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  },
};

/**
 * Schema for validating an array of JSON records
 *
 * This schema validates that the input is an array where each element
 * is a plain JavaScript object. This is the expected format for JSON import data.
 *
 * @example
 * ```typescript
 * import { parseJSON } from '@evodb/core/validation';
 * import { ImportJSONArraySchema } from '@evodb/core/schemas';
 *
 * const json = '[{"name": "Alice"}, {"name": "Bob"}]';
 * const records = parseJSON(json, ImportJSONArraySchema);
 * ```
 */
export const ImportJSONArraySchema: ZodSchemaLike<ImportJSONArray> = {
  safeParse(data: unknown): { success: true; data: ImportJSONArray } | { success: false; error: ZodErrorLike } {
    if (!Array.isArray(data)) {
      return { success: false, error: createError('Expected an array') };
    }

    for (let i = 0; i < data.length; i++) {
      if (!isPlainObject(data[i])) {
        return { success: false, error: createError('Expected a plain object', [i]) };
      }
    }

    return { success: true, data: data as ImportJSONArray };
  },

  parse(data: unknown): ImportJSONArray {
    const result = this.safeParse(data);
    if (!result.success) {
      throw result.error;
    }
    return result.data;
  },
};
