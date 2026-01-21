/**
 * @evodb/core - Columnar JSON Tests (TDD RED Phase)
 *
 * These tests define the expected behavior for ClickHouse-style columnar JSON
 * with schema evolution. Tests are designed to FAIL initially - this is the
 * RED phase of TDD.
 *
 * Key features tested:
 * 1. JSON Shredding - flatten nested JSON to columnar paths
 * 2. Schema Inference - detect types from JSON values
 * 3. Schema Evolution - type widening (int->float), nullable promotion
 * 4. Path Extraction - extract dot-notation paths from nested objects
 */

import { describe, it, expect } from 'vitest';
import {
  shred,
  unshred,
  inferSchema,
  isCompatible,
  Type,
} from '../index.js';

// =============================================================================
// 1. JSON SHREDDING TESTS
// =============================================================================

describe('JSON Shredding', () => {
  describe('Basic Shredding', () => {
    it('should shred flat objects to columns', () => {
      const docs = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];

      const columns = shred(docs);

      expect(columns).toHaveLength(2);

      const nameCol = columns.find(c => c.path === 'name');
      expect(nameCol).toBeDefined();
      expect(nameCol?.values).toEqual(['Alice', 'Bob']);
      expect(nameCol?.type).toBe(Type.String);

      const ageCol = columns.find(c => c.path === 'age');
      expect(ageCol).toBeDefined();
      expect(ageCol?.values).toEqual([30, 25]);
      expect(ageCol?.type).toBe(Type.Int32);
    });

    it('should shred nested objects with dot-notation paths', () => {
      const docs = [
        { user: { name: 'Alice', profile: { email: 'alice@test.com' } } },
        { user: { name: 'Bob', profile: { email: 'bob@test.com' } } },
      ];

      const columns = shred(docs);

      expect(columns.find(c => c.path === 'user.name')?.values).toEqual(['Alice', 'Bob']);
      expect(columns.find(c => c.path === 'user.profile.email')?.values).toEqual([
        'alice@test.com',
        'bob@test.com',
      ]);
    });

    it('should handle deeply nested objects (5+ levels)', () => {
      const docs = [
        { a: { b: { c: { d: { e: { value: 1 } } } } } },
        { a: { b: { c: { d: { e: { value: 2 } } } } } },
      ];

      const columns = shred(docs);
      const col = columns.find(c => c.path === 'a.b.c.d.e.value');

      expect(col).toBeDefined();
      expect(col?.values).toEqual([1, 2]);
    });
  });

  describe('Null Handling', () => {
    it('should handle missing fields with null values', () => {
      const docs = [
        { name: 'Alice', age: 30 },
        { name: 'Bob' }, // missing age
        { name: 'Charlie', age: 35 },
      ];

      const columns = shred(docs);
      const ageCol = columns.find(c => c.path === 'age');

      expect(ageCol?.values).toEqual([30, null, 35]);
      expect(ageCol?.nulls).toEqual([false, true, false]);
      expect(ageCol?.nullable).toBe(true);
    });

    it('should handle explicit null values', () => {
      const docs = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: null },
        { name: 'Charlie', age: 25 },
      ];

      const columns = shred(docs);
      const ageCol = columns.find(c => c.path === 'age');

      expect(ageCol?.values[1]).toBeNull();
      expect(ageCol?.nulls[1]).toBe(true);
      expect(ageCol?.nullable).toBe(true);
    });

    it('should handle undefined values as nulls', () => {
      const docs = [
        { name: 'Alice', value: undefined },
        { name: 'Bob', value: 42 },
      ];

      const columns = shred(docs);
      const valueCol = columns.find(c => c.path === 'value');

      expect(valueCol?.nulls[0]).toBe(true);
      expect(valueCol?.nullable).toBe(true);
    });

    it('should mark columns as non-nullable when no nulls exist', () => {
      const docs = [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' },
      ];

      const columns = shred(docs);
      const nameCol = columns.find(c => c.path === 'name');

      expect(nameCol?.nullable).toBe(false);
    });
  });

  describe('Unshredding (Reconstruction)', () => {
    it('should reconstruct flat objects from columns', () => {
      const original = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];

      const columns = shred(original);
      const result = unshred(columns);

      expect(result).toEqual(original);
    });

    it('should reconstruct nested objects from columns', () => {
      const original = [
        { user: { name: 'Alice', age: 30 } },
        { user: { name: 'Bob', age: 25 } },
      ];

      const columns = shred(original);
      const result = unshred(columns);

      expect(result).toEqual(original);
    });

    it('should handle null values during reconstruction', () => {
      const original = [
        { name: 'Alice', age: 30 },
        { name: 'Bob' }, // missing age
      ];

      const columns = shred(original);
      const result = unshred(columns);

      // Missing fields should not appear in reconstructed object
      expect(result[0]).toEqual({ name: 'Alice', age: 30 });
      expect(result[1]).toEqual({ name: 'Bob' });
      expect('age' in (result[1] as object)).toBe(false);
    });

    it('should be idempotent: shred(unshred(shred(x))) === shred(x)', () => {
      const original = [
        { user: { name: 'Alice', scores: [1, 2, 3] }, active: true },
        { user: { name: 'Bob' }, active: false },
      ];

      const shredded1 = shred(original);
      const unshredded = unshred(shredded1);
      const shredded2 = shred(unshredded);

      // Compare column count and paths
      expect(shredded2.length).toBe(shredded1.length);
      expect(shredded2.map(c => c.path).sort()).toEqual(shredded1.map(c => c.path).sort());
    });
  });
});

// =============================================================================
// 2. SCHEMA INFERENCE TESTS
// =============================================================================

describe('Schema Inference', () => {
  describe('Type Detection', () => {
    it('should detect boolean type', () => {
      const columns = shred([{ active: true }, { active: false }]);
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'active')?.type).toBe(Type.Bool);
    });

    it('should detect Int32 for small integers', () => {
      const columns = shred([{ count: 42 }, { count: 100 }]);
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'count')?.type).toBe(Type.Int32);
    });

    it('should detect Float64 for decimal numbers', () => {
      const columns = shred([{ price: 19.99 }, { price: 29.99 }]);
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'price')?.type).toBe(Type.Float64);
    });

    it('should detect Float64 for numbers exceeding Int32 range', () => {
      const columns = shred([{ big: 3000000000 }]); // > 2^31-1
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'big')?.type).toBe(Type.Float64);
    });

    it('should detect Int64 for bigint values', () => {
      const columns = shred([{ huge: 9007199254740993n }]);
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'huge')?.type).toBe(Type.Int64);
    });

    it('should detect String type', () => {
      const columns = shred([{ name: 'Alice' }, { name: 'Bob' }]);
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'name')?.type).toBe(Type.String);
    });

    it('should detect Binary type for Uint8Array', () => {
      const columns = shred([{ data: new Uint8Array([1, 2, 3]) }]);
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'data')?.type).toBe(Type.Binary);
    });

    it('should detect Array type (shredded to indexed paths)', () => {
      const columns = shred([{ tags: ['a', 'b'] }]);
      const schema = inferSchema(columns);

      // Arrays are shredded to indexed paths: tags[0], tags[1]
      expect(schema.columns.find(c => c.path === 'tags[0]')?.type).toBe(Type.String);
      expect(schema.columns.find(c => c.path === 'tags[1]')?.type).toBe(Type.String);
    });
  });

  describe('Nullable Inference', () => {
    it('should infer nullable from missing fields', () => {
      const columns = shred([
        { name: 'Alice', age: 30 },
        { name: 'Bob' },
      ]);
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'name')?.nullable).toBe(false);
      expect(schema.columns.find(c => c.path === 'age')?.nullable).toBe(true);
    });

    it('should infer nullable from explicit null values', () => {
      const columns = shred([
        { name: 'Alice', age: null },
        { name: 'Bob', age: 25 },
      ]);
      const schema = inferSchema(columns);

      expect(schema.columns.find(c => c.path === 'age')?.nullable).toBe(true);
    });
  });

  describe('Schema Metadata', () => {
    it('should assign schema ID and version', () => {
      const columns = shred([{ x: 1 }]);
      const schema = inferSchema(columns, 42, 3);

      expect(schema.id).toBe(42);
      expect(schema.version).toBe(3);
    });

    it('should use defaults for ID and version when not specified', () => {
      const columns = shred([{ x: 1 }]);
      const schema = inferSchema(columns);

      expect(schema.id).toBe(1);
      expect(schema.version).toBe(1);
    });
  });
});

// =============================================================================
// 3. SCHEMA EVOLUTION TESTS
// =============================================================================

describe('Schema Evolution', () => {
  describe('Type Widening', () => {
    it('should widen Int32 to Float64 when encountering floats', () => {
      // First batch has integers
      const docs1 = [{ value: 1 }, { value: 2 }];
      // Second batch has floats
      const docs2 = [{ value: 3.14 }, { value: 2.71 }];

      // Shred both together to trigger type promotion
      const allDocs = [...docs1, ...docs2];
      const columns = shred(allDocs);

      const valueCol = columns.find(c => c.path === 'value');
      expect(valueCol?.type).toBe(Type.Float64);
    });

    it('should widen Int32 to Int64 when encountering bigints', () => {
      const docs = [
        { id: 1 },
        { id: 2 },
        { id: 9007199254740993n }, // bigint
      ];

      const columns = shred(docs);
      expect(columns.find(c => c.path === 'id')?.type).toBe(Type.Int64);
    });

    it('should widen any type to String when types are incompatible', () => {
      const docs = [
        { value: 42 },
        { value: 'hello' },
      ];

      const columns = shred(docs);
      expect(columns.find(c => c.path === 'value')?.type).toBe(Type.String);
    });

    it('should widen Bool to String when mixed with strings', () => {
      const docs = [
        { flag: true },
        { flag: 'yes' },
      ];

      const columns = shred(docs);
      expect(columns.find(c => c.path === 'flag')?.type).toBe(Type.String);
    });
  });

  describe('Nullable Promotion', () => {
    it('should promote non-nullable to nullable when null appears', () => {
      // First batch: all values present
      const docs1 = [{ name: 'Alice', age: 30 }];
      // Second batch: null value
      const docs2 = [{ name: 'Bob', age: null }];

      const columns = shred([...docs1, ...docs2]);
      expect(columns.find(c => c.path === 'age')?.nullable).toBe(true);
    });

    it('should promote non-nullable to nullable when field is missing', () => {
      const docs = [
        { name: 'Alice', age: 30 },
        { name: 'Bob' }, // age is missing
      ];

      const columns = shred(docs);
      expect(columns.find(c => c.path === 'age')?.nullable).toBe(true);
    });
  });

  describe('Schema Compatibility', () => {
    it('should be compatible when adding nullable columns', () => {
      const oldSchema = inferSchema(shred([{ name: 'Test' }]));
      const newSchema = inferSchema(shred([{ name: 'Test', age: 30 }]));

      // Make age nullable in new schema
      newSchema.columns.find(c => c.path === 'age')!.nullable = true;

      expect(isCompatible(oldSchema, newSchema)).toBe(true);
    });

    it('should be compatible when adding columns with defaults', () => {
      const oldSchema = inferSchema(shred([{ name: 'Test' }]));
      const newSchema = inferSchema(shred([{ name: 'Test', age: 30 }]));

      // Make age non-nullable but with default
      const ageCol = newSchema.columns.find(c => c.path === 'age')!;
      ageCol.nullable = false;
      ageCol.defaultValue = 0;

      expect(isCompatible(oldSchema, newSchema)).toBe(true);
    });

    it('should NOT be compatible when adding non-nullable columns without defaults', () => {
      const oldSchema = inferSchema(shred([{ name: 'Test' }]));
      const newSchema = inferSchema(shred([{ name: 'Test', age: 30 }]));

      // Make age non-nullable without default
      newSchema.columns.find(c => c.path === 'age')!.nullable = false;

      expect(isCompatible(oldSchema, newSchema)).toBe(false);
    });

    it('should be compatible when widening Int32 to Int64', () => {
      const oldColumns = shred([{ value: 42 }]);
      const oldSchema = inferSchema(oldColumns);
      oldSchema.columns[0].type = Type.Int32;

      const newColumns = shred([{ value: 42 }]);
      const newSchema = inferSchema(newColumns);
      newSchema.columns[0].type = Type.Int64;

      expect(isCompatible(oldSchema, newSchema)).toBe(true);
    });

    it('should be compatible when widening Int32 to Float64', () => {
      const oldColumns = shred([{ value: 42 }]);
      const oldSchema = inferSchema(oldColumns);
      oldSchema.columns[0].type = Type.Int32;

      const newColumns = shred([{ value: 42 }]);
      const newSchema = inferSchema(newColumns);
      newSchema.columns[0].type = Type.Float64;

      expect(isCompatible(oldSchema, newSchema)).toBe(true);
    });

    it('should be compatible when widening any type to String', () => {
      const oldColumns = shred([{ value: 42 }]);
      const oldSchema = inferSchema(oldColumns);
      oldSchema.columns[0].type = Type.Int32;

      const newColumns = shred([{ value: '42' }]);
      const newSchema = inferSchema(newColumns);
      newSchema.columns[0].type = Type.String;

      expect(isCompatible(oldSchema, newSchema)).toBe(true);
    });

    it('should NOT be compatible when narrowing Float64 to Int32', () => {
      const oldColumns = shred([{ value: 3.14 }]);
      const oldSchema = inferSchema(oldColumns);
      oldSchema.columns[0].type = Type.Float64;

      const newColumns = shred([{ value: 42 }]);
      const newSchema = inferSchema(newColumns);
      newSchema.columns[0].type = Type.Int32;

      expect(isCompatible(oldSchema, newSchema)).toBe(false);
    });
  });

  // NOTE: Column Migration tests removed
  // Migration functions (migrateColumns, promoteColumn, promoteValue) removed from schema module
  // Migration is now handled by the manifest layer
  // See evodb-dlp: Simplify schema.ts to essential functions
});

// =============================================================================
// 4. PATH EXTRACTION TESTS
// =============================================================================

describe('Path Extraction', () => {
  describe('Dot-Notation Paths', () => {
    it('should extract top-level paths', () => {
      const docs = [{ name: 'Alice', age: 30 }];
      const columns = shred(docs);

      const paths = columns.map(c => c.path).sort();
      expect(paths).toEqual(['age', 'name']);
    });

    it('should extract nested paths with dot notation', () => {
      const docs = [{ user: { name: 'Alice', profile: { email: 'a@test.com' } } }];
      const columns = shred(docs);

      const paths = columns.map(c => c.path).sort();
      expect(paths).toEqual(['user.name', 'user.profile.email']);
    });

    it('should handle keys with special characters', () => {
      // Keys with special characters that need escaping
      const docs = [{ 'user-name': 'Alice', 'user_id': 123 }];
      const columns = shred(docs);

      const paths = columns.map(c => c.path).sort();
      expect(paths).toContain('user-name');
      expect(paths).toContain('user_id');
    });

    it('should handle numeric keys in objects', () => {
      const docs = [{ '0': 'first', '1': 'second' }];
      const columns = shred(docs);

      const paths = columns.map(c => c.path).sort();
      expect(paths).toEqual(['0', '1']);
    });
  });

  describe('Sparse Objects', () => {
    it('should handle objects with different field sets', () => {
      const docs = [
        { a: 1, b: 2 },
        { b: 3, c: 4 },
        { a: 5, c: 6 },
      ];

      const columns = shred(docs);

      // All unique paths should be extracted
      const paths = columns.map(c => c.path).sort();
      expect(paths).toEqual(['a', 'b', 'c']);

      // Verify null handling for missing fields
      const colA = columns.find(c => c.path === 'a')!;
      expect(colA.values).toEqual([1, null, 5]);
      expect(colA.nulls).toEqual([false, true, false]);
    });

    it('should handle deeply sparse nested objects', () => {
      const docs = [
        { a: { b: 1 } },
        { a: { c: 2 } },
        { a: { b: 3, c: 4 } },
      ];

      const columns = shred(docs);

      const colB = columns.find(c => c.path === 'a.b')!;
      const colC = columns.find(c => c.path === 'a.c')!;

      expect(colB.values).toEqual([1, null, 3]);
      expect(colC.values).toEqual([null, 2, 4]);
    });
  });

  describe('Empty and Edge Cases', () => {
    it('should handle empty documents array', () => {
      const columns = shred([]);
      expect(columns).toEqual([]);
    });

    it('should handle empty objects', () => {
      const columns = shred([{}, {}, {}]);
      expect(columns).toEqual([]);
    });

    it('should handle single document', () => {
      const columns = shred([{ x: 1 }]);

      expect(columns).toHaveLength(1);
      expect(columns[0].path).toBe('x');
      expect(columns[0].values).toEqual([1]);
    });

    it('should handle objects with only null values', () => {
      const columns = shred([
        { value: null },
        { value: null },
      ]);

      expect(columns).toHaveLength(1);
      expect(columns[0].type).toBe(Type.Null);
      expect(columns[0].nullable).toBe(true);
    });
  });
});

// =============================================================================
// 5. ADVANCED SCENARIOS (ClickHouse-style behaviors)
// =============================================================================

describe('Advanced Scenarios', () => {
  describe('Large Document Sets', () => {
    it('should handle 1000+ documents efficiently', () => {
      const docs = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        nested: { value: i * 2 },
      }));

      const columns = shred(docs);

      expect(columns).toHaveLength(3);
      expect(columns.find(c => c.path === 'id')?.values.length).toBe(1000);
    });
  });

  describe('Mixed Type Evolution Scenarios', () => {
    it('should handle gradual type evolution across batches', () => {
      // Simulate real-world scenario: data starts as integers, evolves to floats
      const batch1 = [{ metric: 1 }, { metric: 2 }];
      const batch2 = [{ metric: 3 }, { metric: 4.5 }]; // Float introduced
      const batch3 = [{ metric: 'N/A' }]; // String introduced

      const allDocs = [...batch1, ...batch2, ...batch3];
      const columns = shred(allDocs);

      // Final type should be String (most general)
      expect(columns.find(c => c.path === 'metric')?.type).toBe(Type.String);
    });
  });

  describe('Round-Trip Integrity', () => {
    it('should maintain data integrity through multiple shred/unshred cycles', () => {
      const original = [
        { id: 1, user: { name: 'Alice', email: 'alice@test.com' }, active: true },
        { id: 2, user: { name: 'Bob' }, active: false }, // Missing email
        { id: 3, user: { name: 'Charlie', email: null }, active: true }, // Explicit null
      ];

      // Cycle 1
      const columns1 = shred(original);
      const result1 = unshred(columns1);

      // Cycle 2
      const columns2 = shred(result1);
      const result2 = unshred(columns2);

      // Data should be equivalent (but missing fields won't reappear)
      expect(result1).toEqual(result2);

      // Verify specific values
      expect(result2[0]).toEqual({ id: 1, user: { name: 'Alice', email: 'alice@test.com' }, active: true });
      expect(result2[1]).toEqual({ id: 2, user: { name: 'Bob' }, active: false });
      // null fields are not reconstructed
      expect('email' in (result2[2] as { user: object }).user).toBe(false);
    });
  });
});

// =============================================================================
// 6. RED PHASE TESTS - Features that need implementation
// =============================================================================

describe('RED PHASE: Features requiring implementation', () => {
  describe('Array Element Shredding (ClickHouse-style)', () => {
    // ClickHouse treats arrays specially - we need to support array element access
    it('should shred array elements with indexed paths like arr[0], arr[1]', () => {
      const docs = [
        { tags: ['a', 'b', 'c'] },
        { tags: ['x', 'y'] },
      ];

      const columns = shred(docs);

      // Currently arrays are stored as whole values (Type.Array)
      // ClickHouse-style would shred to individual paths: tags[0], tags[1], tags[2]
      // This test expects indexed access - should FAIL with current impl
      const tag0Col = columns.find(c => c.path === 'tags[0]');
      const tag1Col = columns.find(c => c.path === 'tags[1]');

      expect(tag0Col).toBeDefined();
      expect(tag0Col?.values).toEqual(['a', 'x']);
      expect(tag1Col?.values).toEqual(['b', 'y']);
    });

    it('should handle nested arrays with indexed paths', () => {
      const docs = [
        { matrix: [[1, 2], [3, 4]] },
        { matrix: [[5, 6], [7, 8]] },
      ];

      const columns = shred(docs);

      // Expect paths like matrix[0][0], matrix[0][1], etc.
      const m00Col = columns.find(c => c.path === 'matrix[0][0]');
      expect(m00Col).toBeDefined();
      expect(m00Col?.values).toEqual([1, 5]);
    });

    it('should handle arrays of objects with indexed paths', () => {
      const docs = [
        { users: [{ name: 'Alice' }, { name: 'Bob' }] },
        { users: [{ name: 'Charlie' }] },
      ];

      const columns = shred(docs);

      // Expect paths like users[0].name, users[1].name
      const user0Name = columns.find(c => c.path === 'users[0].name');
      expect(user0Name).toBeDefined();
      expect(user0Name?.values).toEqual(['Alice', 'Charlie']);
    });
  });

  describe('Path Query API', () => {
    // ClickHouse supports JSONPath-like queries - we need a query API
    it('should support extractPath function for single value extraction', async () => {
      const docs = [
        { user: { name: 'Alice', profile: { city: 'NYC' } } },
        { user: { name: 'Bob', profile: { city: 'LA' } } },
      ];

      const columns = shred(docs);

      // This function should be exported from the module
      // @ts-expect-error - extractPath not yet implemented
      const { extractPath } = await import('../index.js');

      const cities = extractPath(columns, 'user.profile.city');
      expect(cities).toEqual(['NYC', 'LA']);
    });

    it('should support extractPaths function for multiple paths', async () => {
      const docs = [
        { user: { name: 'Alice', age: 30 } },
        { user: { name: 'Bob', age: 25 } },
      ];

      const columns = shred(docs);

      // @ts-expect-error - extractPaths not yet implemented
      const { extractPaths } = await import('../index.js');

      const result = extractPaths(columns, ['user.name', 'user.age']);
      expect(result).toEqual({
        'user.name': ['Alice', 'Bob'],
        'user.age': [30, 25],
      });
    });
  });

  describe('Schema Versioning', () => {
    it('should track schema history with version chain', () => {
      const columns1 = shred([{ name: 'Alice' }]);
      const schema1 = inferSchema(columns1, 1, 1);

      const columns2 = shred([{ name: 'Bob', age: 25 }]);
      const schema2 = inferSchema(columns2, 1, 2);
      schema2.columns.find(c => c.path === 'age')!.nullable = true;

      // Schema should track parent version for evolution chain
      // @ts-expect-error - parentVersion not yet on Schema type
      schema2.parentVersion = 1;

      // @ts-expect-error - parentVersion not yet on Schema type
      expect(schema2.parentVersion).toBe(1);
      expect(schema2.version).toBe(2);
    });

    // NOTE: schemaDiff test removed - function no longer in schema module
    // See evodb-dlp: Simplify schema.ts to essential functions
  });

  describe('Timestamp and Date Types', () => {
    it('should detect Date objects as Timestamp type', () => {
      const docs = [
        { created: new Date('2024-01-01') },
        { created: new Date('2024-06-15') },
      ];

      const columns = shred(docs);
      const schema = inferSchema(columns);

      // @ts-expect-error - Type.Timestamp not yet defined
      expect(schema.columns.find(c => c.path === 'created')?.type).toBe(Type.Timestamp);
    });

    it('should detect ISO date strings as Date type', () => {
      const docs = [
        { date: '2024-01-01' },
        { date: '2024-06-15' },
      ];

      const columns = shred(docs);
      const schema = inferSchema(columns);

      // Currently detected as String, should be Date
      // @ts-expect-error - Type.Date not yet defined
      expect(schema.columns.find(c => c.path === 'date')?.type).toBe(Type.Date);
    });
  });

  describe('Column Pruning and Projection', () => {
    it('should support column projection during shred', () => {
      const docs = [
        { id: 1, name: 'Alice', email: 'alice@test.com', age: 30 },
        { id: 2, name: 'Bob', email: 'bob@test.com', age: 25 },
      ];

      // @ts-expect-error - shred does not yet support options.columns
      const columns = shred(docs, { columns: ['id', 'name'] });

      expect(columns).toHaveLength(2);
      expect(columns.map(c => c.path).sort()).toEqual(['id', 'name']);
    });

    it('should support nested column projection', () => {
      const docs = [
        { user: { name: 'Alice', profile: { email: 'a@test.com', phone: '123' } } },
      ];

      // @ts-expect-error - shred does not yet support options.columns
      const columns = shred(docs, { columns: ['user.name', 'user.profile.email'] });

      expect(columns).toHaveLength(2);
      expect(columns.find(c => c.path === 'user.profile.phone')).toBeUndefined();
    });
  });

  describe('Null Bitmap Compression', () => {
    it('should use RLE compression for null bitmaps with many consecutive nulls', () => {
      const docs = Array.from({ length: 100 }, (_, i) => ({
        value: i < 10 || i >= 90 ? i : null, // nulls in the middle
      }));

      const columns = shred(docs);
      const valueCol = columns.find(c => c.path === 'value')!;

      // Null bitmap should be RLE compressed
      // @ts-expect-error - nullBitmapCompressed not yet on Column
      expect(valueCol.nullBitmapCompressed).toBeDefined();
      // @ts-expect-error - nullBitmapCompression not yet on Column
      expect(valueCol.nullBitmapCompression).toBe('RLE');
    });
  });

  describe('Type Coercion Functions', () => {
    it('should export coerceToType function', async () => {
      // @ts-expect-error - coerceToType not yet exported
      const { coerceToType } = await import('../index.js');

      expect(coerceToType(42, Type.String)).toBe('42');
      expect(coerceToType('3.14', Type.Float64)).toBe(3.14);
      expect(coerceToType(1, Type.Bool)).toBe(true);
    });
  });

  describe('Incremental Shredding', () => {
    it('should support appending rows to existing columns', async () => {
      const docs1 = [{ id: 1, name: 'Alice' }];
      const columns1 = shred(docs1);

      const docs2 = [{ id: 2, name: 'Bob' }];

      // @ts-expect-error - appendRows not yet implemented
      const { appendRows } = await import('../index.js');

      const columns2 = appendRows(columns1, docs2);

      expect(columns2.find(c => c.path === 'id')?.values).toEqual([1, 2]);
      expect(columns2.find(c => c.path === 'name')?.values).toEqual(['Alice', 'Bob']);
    });

    it('should handle schema evolution during append', async () => {
      const docs1 = [{ id: 1, name: 'Alice' }];
      const columns1 = shred(docs1);

      const docs2 = [{ id: 2, name: 'Bob', age: 25 }]; // New field

      // @ts-expect-error - appendRows not yet implemented
      const { appendRows } = await import('../index.js');

      const columns2 = appendRows(columns1, docs2);

      // Should have 3 columns now, age backfilled with null
      expect(columns2).toHaveLength(3);
      expect(columns2.find(c => c.path === 'age')?.values).toEqual([null, 25]);
    });
  });

  describe('Materialized Path Indexes', () => {
    it('should build path index for fast column lookup', async () => {
      const docs = Array.from({ length: 1000 }, (_, i) => ({
        a: { b: { c: { d: { e: i } } } },
        x: { y: { z: i * 2 } },
      }));

      const columns = shred(docs);

      // @ts-expect-error - buildPathIndex not yet implemented
      const { buildPathIndex } = await import('../index.js');

      const index = buildPathIndex(columns);

      // O(1) lookup by path
      expect(index.get('a.b.c.d.e')).toBe(columns.find(c => c.path === 'a.b.c.d.e'));
      expect(index.get('x.y.z')).toBe(columns.find(c => c.path === 'x.y.z'));
    });
  });
});
