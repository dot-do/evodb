/**
 * Tests for EvoDB schema locking modes
 * BEADS ISSUE: pocs-r7z9
 */

import { describe, it, expect } from 'vitest';
import {
  type SchemaLockMode,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidationConfig,
  type SchemaColumn,
  validateDocument,
  validateDocuments,
} from '../locking.js';

// =============================================================================
// Test Schema Definitions
// =============================================================================

const userSchema: SchemaColumn[] = [
  { name: 'id', type: 'int64', nullable: false },
  { name: 'name', type: 'string', nullable: false },
  { name: 'email', type: 'string', nullable: true },
  { name: 'age', type: 'int32', nullable: true },
  { name: 'active', type: 'boolean', nullable: false, defaultValue: true },
];

const versionedSchema: SchemaColumn[] = [
  { name: 'id', type: 'int64', nullable: false },
  { name: 'name', type: 'string', nullable: false },
  { name: '_schemaVersion', type: 'int32', nullable: true },
];

// =============================================================================
// Type Exports Tests
// =============================================================================

describe('Type Exports', () => {
  it('should export SchemaLockMode type', () => {
    const mode: SchemaLockMode = 'evolve';
    expect(['evolve', 'locked', 'strict', 'versioned']).toContain(mode);
  });

  it('should export ValidationResult interface', () => {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };
    expect(result.valid).toBe(true);
  });

  it('should export ValidationError interface', () => {
    const error: ValidationError = {
      path: 'field.nested',
      code: 'UNKNOWN_FIELD',
      message: 'Unknown field',
    };
    expect(error.code).toBe('UNKNOWN_FIELD');
  });
});

// =============================================================================
// Evolve Mode Tests
// =============================================================================

describe('Evolve Mode', () => {
  const config: ValidationConfig = { mode: 'evolve' };

  it('should accept valid documents', () => {
    const doc = { id: 1, name: 'Alice', email: 'alice@test.com', active: true };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept documents with unknown fields and return schema updates', () => {
    const doc = { id: 1, name: 'Alice', newField: 'value', anotherNew: 42 };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(true);
    expect(result.schemaUpdates).toBeDefined();
    expect(result.schemaUpdates).toHaveLength(2);

    const newFieldNames = result.schemaUpdates!.map(c => c.name);
    expect(newFieldNames).toContain('newField');
    expect(newFieldNames).toContain('anotherNew');
  });

  it('should infer types for new columns in schema updates', () => {
    const doc = {
      id: 1,
      name: 'Alice',
      newString: 'text',
      newNumber: 42,
      newFloat: 3.14,
      newBool: true,
    };
    const result = validateDocument(doc, userSchema, config);

    expect(result.schemaUpdates).toBeDefined();
    const updates = result.schemaUpdates!;

    const stringCol = updates.find(c => c.name === 'newString');
    expect(stringCol?.type).toBe('string');

    const intCol = updates.find(c => c.name === 'newNumber');
    expect(intCol?.type).toBe('int64');

    const floatCol = updates.find(c => c.name === 'newFloat');
    expect(floatCol?.type).toBe('float64');

    const boolCol = updates.find(c => c.name === 'newBool');
    expect(boolCol?.type).toBe('boolean');
  });

  it('should add warnings for schema evolution', () => {
    const doc = { id: 1, name: 'Alice', unexpectedField: 'value' };
    const result = validateDocument(doc, userSchema, config);

    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].code).toBe('SCHEMA_EVOLVED');
  });

  it('should still reject type mismatches', () => {
    const doc = { id: 'not-a-number', name: 'Alice' };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('TYPE_MISMATCH');
    expect(result.errors[0].path).toBe('id');
  });

  it('should reject missing required fields', () => {
    const doc = { id: 1 }; // missing 'name' which is required
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED')).toBe(true);
  });

  it('should handle nested field paths in schema updates', () => {
    const doc = {
      id: 1,
      name: 'Alice',
      address: { city: 'NYC', zip: '10001' },
    };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(true);
    expect(result.schemaUpdates).toBeDefined();
    // Should detect 'address' as a new JSON field
    const addressCol = result.schemaUpdates!.find(c => c.name === 'address');
    expect(addressCol).toBeDefined();
    expect(addressCol?.type).toBe('json');
  });
});

// =============================================================================
// Locked Mode Tests
// =============================================================================

describe('Locked Mode', () => {
  const config: ValidationConfig = { mode: 'locked' };

  it('should accept valid documents', () => {
    const doc = { id: 1, name: 'Alice', email: 'alice@test.com', active: true };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject documents with unknown fields', () => {
    const doc = { id: 1, name: 'Alice', unknownField: 'value' };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('UNKNOWN_FIELD');
    expect(result.errors[0].path).toBe('unknownField');
  });

  it('should reject type mismatches', () => {
    const doc = { id: 'string-instead-of-number', name: 'Alice' };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('TYPE_MISMATCH');
    expect(result.errors[0].expected).toBe('int64');
    expect(result.errors[0].received).toBe('string');
  });

  it('should reject missing required fields', () => {
    const doc = { id: 1 }; // missing 'name'
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED')).toBe(true);
  });

  it('should accept null for nullable fields', () => {
    const doc = { id: 1, name: 'Alice', email: null, age: null, active: true };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(true);
  });

  it('should reject null for non-nullable fields', () => {
    const doc = { id: 1, name: null, active: true };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('TYPE_MISMATCH');
    expect(result.errors[0].path).toBe('name');
  });

  it('should not return schema updates', () => {
    const doc = { id: 1, name: 'Alice', unknownField: 'value' };
    const result = validateDocument(doc, userSchema, config);

    expect(result.schemaUpdates).toBeUndefined();
  });
});

// =============================================================================
// Strict Mode Tests
// =============================================================================

describe('Strict Mode', () => {
  const config: ValidationConfig = { mode: 'strict' };

  it('should accept valid documents', () => {
    const doc = { id: 1, name: 'Alice', email: 'alice@test.com', active: true };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject unknown fields with detailed error messages', () => {
    const doc = { id: 1, name: 'Alice', unknownField: 'value', anotherBad: 42 };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);

    const unknownFieldError = result.errors.find(e => e.path === 'unknownField');
    expect(unknownFieldError).toBeDefined();
    expect(unknownFieldError!.code).toBe('UNKNOWN_FIELD');
    expect(unknownFieldError!.message).toContain('unknownField');
    expect(unknownFieldError!.message).toContain('schema'); // Should mention schema
  });

  it('should provide detailed type mismatch messages', () => {
    const doc = { id: 'not-a-number', name: 123 };
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);

    const idError = result.errors.find(e => e.path === 'id');
    expect(idError).toBeDefined();
    expect(idError!.message).toContain('id');
    expect(idError!.message).toContain('int64');
    expect(idError!.message).toContain('string');

    const nameError = result.errors.find(e => e.path === 'name');
    expect(nameError).toBeDefined();
    expect(nameError!.message).toContain('name');
    expect(nameError!.message).toContain('string');
    expect(nameError!.message).toContain('number');
  });

  it('should provide detailed missing field messages', () => {
    const doc = { id: 1 }; // missing 'name'
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    const missingError = result.errors.find(e => e.code === 'MISSING_REQUIRED');
    expect(missingError).toBeDefined();
    expect(missingError!.path).toBe('name');
    expect(missingError!.message).toContain('required');
    expect(missingError!.message).toContain('name');
  });

  it('should report all errors, not just the first one', () => {
    const doc = { unknownA: 1, unknownB: 2, unknownC: 3 }; // Missing id, name + 3 unknown
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(false);
    // Should have errors for missing required fields + unknown fields
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});

// =============================================================================
// Versioned Mode Tests
// =============================================================================

describe('Versioned Mode', () => {
  const config: ValidationConfig = {
    mode: 'versioned',
    currentSchemaVersion: 2,
  };

  it('should accept documents matching current schema version', () => {
    const doc = { id: 1, name: 'Alice', _schemaVersion: 2 };
    const result = validateDocument(doc, versionedSchema, config);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept documents from older schema versions', () => {
    const doc = { id: 1, name: 'Alice', _schemaVersion: 1 };
    const result = validateDocument(doc, versionedSchema, config);

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].code).toBe('OLDER_VERSION');
  });

  it('should reject documents from newer schema versions', () => {
    const doc = { id: 1, name: 'Alice', _schemaVersion: 3 };
    const result = validateDocument(doc, versionedSchema, config);

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('VERSION_MISMATCH');
  });

  it('should add version to documents without one', () => {
    const doc = { id: 1, name: 'Alice' };
    const result = validateDocument(doc, versionedSchema, config);

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.code === 'VERSION_ADDED')).toBe(true);
  });

  it('should track version in validation result', () => {
    const doc = { id: 1, name: 'Alice', _schemaVersion: 1 };
    const result = validateDocument(doc, versionedSchema, config);

    expect(result.documentVersion).toBe(1);
    expect(result.currentSchemaVersion).toBe(2);
  });

  it('should handle version migration suggestions', () => {
    const doc = { id: 1, name: 'Alice', _schemaVersion: 1 };
    const result = validateDocument(doc, versionedSchema, config);

    expect(result.valid).toBe(true);
    // Older version documents should suggest migration
    expect(result.warnings.some(w => w.message.toLowerCase().includes('migrate'))).toBe(true);
  });
});

// =============================================================================
// Batch Validation Tests
// =============================================================================

describe('Batch Validation (validateDocuments)', () => {
  it('should validate multiple documents', () => {
    const docs = [
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
      { id: 3, name: 'Charlie', active: true },
    ];
    const config: ValidationConfig = { mode: 'locked' };
    const results = validateDocuments(docs, userSchema, config);

    expect(results).toHaveLength(3);
    expect(results.every(r => r.valid)).toBe(true);
  });

  it('should return individual results for each document', () => {
    const docs = [
      { id: 1, name: 'Alice', active: true },
      { id: 'invalid', name: 'Bob' },
      { id: 3, name: 'Charlie', active: true },
    ];
    const config: ValidationConfig = { mode: 'locked' };
    const results = validateDocuments(docs, userSchema, config);

    expect(results).toHaveLength(3);
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[2].valid).toBe(true);
  });

  it('should aggregate schema updates in evolve mode', () => {
    const docs = [
      { id: 1, name: 'Alice', newFieldA: 'value' },
      { id: 2, name: 'Bob', newFieldB: 42 },
      { id: 3, name: 'Charlie', newFieldA: 'another' }, // Same as doc 1
    ];
    const config: ValidationConfig = { mode: 'evolve' };
    const results = validateDocuments(docs, userSchema, config);

    expect(results.every(r => r.valid)).toBe(true);

    // Each result should contain the relevant schema updates
    expect(results[0].schemaUpdates?.some(c => c.name === 'newFieldA')).toBe(true);
    expect(results[1].schemaUpdates?.some(c => c.name === 'newFieldB')).toBe(true);
  });

  it('should handle empty document array', () => {
    const docs: Record<string, unknown>[] = [];
    const config: ValidationConfig = { mode: 'locked' };
    const results = validateDocuments(docs, userSchema, config);

    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// Type Validation Tests
// =============================================================================

describe('Type Validation', () => {
  const config: ValidationConfig = { mode: 'locked' };

  it('should validate int32 type', () => {
    const schema: SchemaColumn[] = [{ name: 'value', type: 'int32', nullable: false }];

    expect(validateDocument({ value: 42 }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: 2147483647 }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: 3.14 }, schema, config).valid).toBe(false);
    expect(validateDocument({ value: 'string' }, schema, config).valid).toBe(false);
  });

  it('should validate int64 type', () => {
    const schema: SchemaColumn[] = [{ name: 'value', type: 'int64', nullable: false }];

    expect(validateDocument({ value: 42 }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: Number.MAX_SAFE_INTEGER }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: 3.14 }, schema, config).valid).toBe(false);
  });

  it('should validate float64 type', () => {
    const schema: SchemaColumn[] = [{ name: 'value', type: 'float64', nullable: false }];

    expect(validateDocument({ value: 3.14 }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: 42 }, schema, config).valid).toBe(true); // integers are valid floats
    expect(validateDocument({ value: 'string' }, schema, config).valid).toBe(false);
  });

  it('should validate string type', () => {
    const schema: SchemaColumn[] = [{ name: 'value', type: 'string', nullable: false }];

    expect(validateDocument({ value: 'hello' }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: '' }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: 42 }, schema, config).valid).toBe(false);
  });

  it('should validate boolean type', () => {
    const schema: SchemaColumn[] = [{ name: 'value', type: 'boolean', nullable: false }];

    expect(validateDocument({ value: true }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: false }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: 1 }, schema, config).valid).toBe(false);
    expect(validateDocument({ value: 'true' }, schema, config).valid).toBe(false);
  });

  it('should validate timestamp type (Date objects or ISO strings)', () => {
    const schema: SchemaColumn[] = [{ name: 'value', type: 'timestamp', nullable: false }];

    expect(validateDocument({ value: new Date() }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: '2024-01-15T12:00:00Z' }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: Date.now() }, schema, config).valid).toBe(true); // epoch ms
    expect(validateDocument({ value: 'not-a-date' }, schema, config).valid).toBe(false);
  });

  it('should validate json type', () => {
    const schema: SchemaColumn[] = [{ name: 'value', type: 'json', nullable: false }];

    expect(validateDocument({ value: { nested: 'object' } }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: [1, 2, 3] }, schema, config).valid).toBe(true);
    expect(validateDocument({ value: 'string' }, schema, config).valid).toBe(true); // JSON accepts any
    expect(validateDocument({ value: 42 }, schema, config).valid).toBe(true);
  });
});

// =============================================================================
// Default Values Tests
// =============================================================================

describe('Default Values', () => {
  const config: ValidationConfig = { mode: 'locked' };

  it('should accept missing optional fields with defaults', () => {
    const doc = { id: 1, name: 'Alice' }; // missing 'active' which has default
    const result = validateDocument(doc, userSchema, config);

    expect(result.valid).toBe(true);
  });

  it('should not require fields with default values', () => {
    const schema: SchemaColumn[] = [
      { name: 'id', type: 'int64', nullable: false },
      { name: 'status', type: 'string', nullable: false, defaultValue: 'pending' },
    ];

    const doc = { id: 1 }; // missing 'status' but it has default
    const result = validateDocument(doc, schema, config);

    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Complex Type Validation Tests
// =============================================================================

describe('Complex Type Validation', () => {
  const config: ValidationConfig = { mode: 'locked' };

  it('should validate binary type with Uint8Array', () => {
    const schema: SchemaColumn[] = [{ name: 'data', type: 'binary', nullable: false }];

    expect(validateDocument({ data: new Uint8Array([1, 2, 3]) }, schema, config).valid).toBe(true);
    expect(validateDocument({ data: 'not-binary' }, schema, config).valid).toBe(false);
  });

  it('should validate binary type with ArrayBuffer', () => {
    const schema: SchemaColumn[] = [{ name: 'data', type: 'binary', nullable: false }];
    const buffer = new ArrayBuffer(8);
    expect(validateDocument({ data: buffer }, schema, config).valid).toBe(true);
  });

  it('should validate date type with string format', () => {
    const schema: SchemaColumn[] = [{ name: 'date', type: 'date', nullable: false }];

    expect(validateDocument({ date: '2024-01-15' }, schema, config).valid).toBe(true);
    expect(validateDocument({ date: '2024-1-15' }, schema, config).valid).toBe(false); // Invalid format
    expect(validateDocument({ date: '01/15/2024' }, schema, config).valid).toBe(false);
  });

  it('should validate date type with Date object', () => {
    const schema: SchemaColumn[] = [{ name: 'date', type: 'date', nullable: false }];
    expect(validateDocument({ date: new Date() }, schema, config).valid).toBe(true);
  });

  it('should validate uuid type', () => {
    const schema: SchemaColumn[] = [{ name: 'id', type: 'uuid', nullable: false }];

    expect(validateDocument({ id: '550e8400-e29b-41d4-a716-446655440000' }, schema, config).valid).toBe(true);
    expect(validateDocument({ id: '550E8400-E29B-41D4-A716-446655440000' }, schema, config).valid).toBe(true); // Uppercase
    expect(validateDocument({ id: 'not-a-uuid' }, schema, config).valid).toBe(false);
    expect(validateDocument({ id: '550e8400e29b41d4a716446655440000' }, schema, config).valid).toBe(false); // No dashes
  });

  it('should validate array type', () => {
    const schema: SchemaColumn[] = [{
      name: 'tags',
      type: { type: 'array', elementType: 'string' },
      nullable: false,
    }];

    expect(validateDocument({ tags: ['a', 'b', 'c'] }, schema, config).valid).toBe(true);
    expect(validateDocument({ tags: [] }, schema, config).valid).toBe(true);
    expect(validateDocument({ tags: 'not-array' }, schema, config).valid).toBe(false);
  });

  it('should validate array with null elements', () => {
    const schema: SchemaColumn[] = [{
      name: 'tags',
      type: { type: 'array', elementType: 'string' },
      nullable: false,
    }];

    // Arrays with null elements should be valid (elements can be null)
    expect(validateDocument({ tags: ['a', null, 'c'] }, schema, config).valid).toBe(true);
  });

  it('should validate map type', () => {
    const schema: SchemaColumn[] = [{
      name: 'metadata',
      type: { type: 'map', keyType: 'string', valueType: 'int64' },
      nullable: false,
    }];

    expect(validateDocument({ metadata: { a: 1, b: 2 } }, schema, config).valid).toBe(true);
    expect(validateDocument({ metadata: {} }, schema, config).valid).toBe(true);
    expect(validateDocument({ metadata: 'not-object' }, schema, config).valid).toBe(false);
    expect(validateDocument({ metadata: [] }, schema, config).valid).toBe(false);
    expect(validateDocument({ metadata: null }, schema, config).valid).toBe(false);
  });

  it('should validate map with null values', () => {
    const schema: SchemaColumn[] = [{
      name: 'metadata',
      type: { type: 'map', keyType: 'string', valueType: 'int64' },
      nullable: false,
    }];

    // Map with null values should be valid
    expect(validateDocument({ metadata: { a: 1, b: null } }, schema, config).valid).toBe(true);
  });

  it('should validate struct type', () => {
    const schema: SchemaColumn[] = [{
      name: 'address',
      type: {
        type: 'struct',
        fields: [
          { name: 'street', type: 'string', nullable: false },
          { name: 'city', type: 'string', nullable: false },
        ],
      },
      nullable: false,
    }];

    expect(validateDocument({ address: { street: '123 Main', city: 'NYC' } }, schema, config).valid).toBe(true);
    expect(validateDocument({ address: 'not-object' }, schema, config).valid).toBe(false);
    expect(validateDocument({ address: [] }, schema, config).valid).toBe(false);
    expect(validateDocument({ address: null }, schema, config).valid).toBe(false);
  });

  it('should validate null type', () => {
    const schema: SchemaColumn[] = [{ name: 'value', type: 'null', nullable: true }];

    // Note: null type expects actual null value
    expect(validateDocument({ value: null }, schema, config).valid).toBe(true);
  });

  it('should handle unknown complex type', () => {
    // Test with an unexpected type structure
    const schema: SchemaColumn[] = [{
      name: 'field',
      type: { type: 'unknown' } as unknown as ColumnType,
      nullable: false,
    }];

    // Unknown types should fail validation
    expect(validateDocument({ field: 'value' }, schema, config).valid).toBe(false);
  });
});

// =============================================================================
// Type Inference Tests
// =============================================================================

describe('Type Inference in Evolve Mode', () => {
  const config: ValidationConfig = { mode: 'evolve' };
  const emptySchema: SchemaColumn[] = [];

  it('should infer null type', () => {
    const doc = { field: null };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('null');
  });

  it('should infer boolean type', () => {
    const doc = { field: true };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('boolean');
  });

  it('should infer int64 for integers', () => {
    const doc = { field: 42 };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('int64');
  });

  it('should infer float64 for decimals', () => {
    const doc = { field: 3.14 };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('float64');
  });

  it('should infer timestamp for ISO date strings', () => {
    const doc = { field: '2024-01-15T12:00:00Z' };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('timestamp');
  });

  it('should infer date for date-only strings', () => {
    const doc = { field: '2024-01-15' };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('date');
  });

  it('should infer uuid for UUID strings', () => {
    const doc = { field: '550e8400-e29b-41d4-a716-446655440000' };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('uuid');
  });

  it('should infer timestamp for Date objects', () => {
    const doc = { field: new Date() };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('timestamp');
  });

  it('should infer array type for arrays', () => {
    const doc = { field: ['a', 'b', 'c'] };
    const result = validateDocument(doc, emptySchema, config);
    const type = result.schemaUpdates?.[0]?.type;
    expect(type).toEqual({ type: 'array', elementType: 'string' });
  });

  it('should infer array with json element type for empty arrays', () => {
    const doc = { field: [] };
    const result = validateDocument(doc, emptySchema, config);
    const type = result.schemaUpdates?.[0]?.type;
    expect(type).toEqual({ type: 'array', elementType: 'json' });
  });

  it('should infer undefined as null type', () => {
    const doc = { field: undefined };
    const result = validateDocument(doc, emptySchema, config);
    expect(result.schemaUpdates?.[0]?.type).toBe('null');
  });
});

// =============================================================================
// Custom Version Field Tests
// =============================================================================

describe('Custom Version Field', () => {
  const schema: SchemaColumn[] = [
    { name: 'id', type: 'int64', nullable: false },
    { name: '__version', type: 'int32', nullable: true },
  ];

  it('should use custom version field name', () => {
    const config: ValidationConfig = {
      mode: 'versioned',
      currentSchemaVersion: 1,
      versionField: '__version',
    };

    const doc = { id: 1, __version: 1 };
    const result = validateDocument(doc, schema, config);

    expect(result.valid).toBe(true);
    expect(result.documentVersion).toBe(1);
  });

  it('should warn when custom version field is missing', () => {
    const config: ValidationConfig = {
      mode: 'versioned',
      currentSchemaVersion: 1,
      versionField: '__version',
    };

    const doc = { id: 1 };
    const result = validateDocument(doc, schema, config);

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.code === 'VERSION_ADDED')).toBe(true);
  });
});

// =============================================================================
// Versioned Mode Default Version Tests
// =============================================================================

describe('Versioned Mode Default Version', () => {
  const schema: SchemaColumn[] = [
    { name: 'id', type: 'int64', nullable: false },
  ];

  it('should default to version 1 when currentSchemaVersion not specified', () => {
    const config: ValidationConfig = {
      mode: 'versioned',
      // No currentSchemaVersion specified
    };

    const doc = { id: 1 };
    const result = validateDocument(doc, schema, config);

    expect(result.currentSchemaVersion).toBe(1);
  });
});
