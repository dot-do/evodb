/**
 * TDD Tests for Generic Constraints
 *
 * Issue: evodb-aqap - Add generic constraints for better type inference
 *
 * This file tests that TypeScript properly infers types and catches
 * errors at compile time when using generic types with proper constraints.
 *
 * @packageDocumentation
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  Column,
  ColumnStats,
  NumericColumnStats,
  StringColumnStats,
  Type,
  DocumentConstraint,
  DocumentWithId,
  KeysOfType,
  FieldPath,
  StringFieldsOf,
  NumericFieldsOf,
  InvalidFieldError,
  TypedIndexFields,
  TypedUpdate,
  TypedFilter,
} from '../types.js';
import {
  isNumericStats,
  isStringStats,
  getNumericStats,
  getStringStats,
} from '../types.js';

// =============================================================================
// Test Type Definitions
// =============================================================================

/**
 * Test document interface for type inference tests.
 */
interface TestDocument {
  id: string;
  name: string;
  age: number;
  active: boolean;
  createdAt: number;
  tags?: string[];
}

/**
 * Document with required fields only.
 */
interface RequiredFieldsDoc {
  id: string;
  value: number;
}

// =============================================================================
// Helper Types for Constraint Testing (local aliases for tests)
// =============================================================================

/**
 * Type for numeric fields within a document.
 */
type NumericFields<T> = NumericFieldsOf<T>;

/**
 * Type for string fields within a document.
 */
type StringFields<T> = StringFieldsOf<T>;

// =============================================================================
// Tests: Document Type Constraints
// =============================================================================

describe('Generic Constraints: Document Types', () => {
  describe('DocumentConstraint type', () => {
    it('should accept valid document types', () => {
      // These should all be valid documents
      type ValidDoc1 = TestDocument;
      type ValidDoc2 = { id: string; name: string };
      type ValidDoc3 = Record<string, unknown>;

      // Type assertions (compile-time checks)
      const doc1: DocumentConstraint = {} as ValidDoc1;
      const doc2: DocumentConstraint = {} as ValidDoc2;
      const doc3: DocumentConstraint = {} as ValidDoc3;

      expect(doc1).toBeDefined();
      expect(doc2).toBeDefined();
      expect(doc3).toBeDefined();
    });

    it('should reject invalid document types at compile time', () => {
      // These should NOT be assignable (compile-time check)
      // Primitive types are not valid documents
      // @ts-expect-error - string is not a valid document type
      const _invalidDoc1: DocumentConstraint = 'string';

      // @ts-expect-error - number is not a valid document type
      const _invalidDoc2: DocumentConstraint = 42;

      // @ts-expect-error - null is not a valid document type
      const _invalidDoc3: DocumentConstraint = null;

      expect(true).toBe(true); // Test passes if it compiles
    });
  });

  describe('FieldPath type', () => {
    it('should infer correct field paths from document', () => {
      type TestPaths = FieldPath<TestDocument>;

      // Valid paths
      const validPath1: TestPaths = 'id';
      const validPath2: TestPaths = 'name';
      const validPath3: TestPaths = 'age';
      const validPath4: TestPaths = 'active';
      const validPath5: TestPaths = 'createdAt';
      const validPath6: TestPaths = 'tags';

      expect(validPath1).toBe('id');
      expect(validPath2).toBe('name');
      expect(validPath3).toBe('age');
      expect(validPath4).toBe('active');
      expect(validPath5).toBe('createdAt');
      expect(validPath6).toBe('tags');
    });

    it('should reject invalid field paths at compile time', () => {
      type TestPaths = FieldPath<TestDocument>;

      // @ts-expect-error - 'nonexistent' is not a valid field
      const _invalidPath: TestPaths = 'nonexistent';

      // @ts-expect-error - 'foo' is not a valid field
      const _invalidPath2: TestPaths = 'foo';

      expect(true).toBe(true);
    });
  });

  describe('Field type extraction', () => {
    it('should extract numeric fields correctly', () => {
      type TestNumericFields = NumericFields<TestDocument>;

      // Should include 'age' and 'createdAt'
      const numField1: TestNumericFields = 'age';
      const numField2: TestNumericFields = 'createdAt';

      expect(numField1).toBe('age');
      expect(numField2).toBe('createdAt');
    });

    it('should reject non-numeric fields', () => {
      type TestNumericFields = NumericFields<TestDocument>;

      // @ts-expect-error - 'id' is a string field, not numeric
      const _invalidNumField1: TestNumericFields = 'id';

      // @ts-expect-error - 'name' is a string field, not numeric
      const _invalidNumField2: TestNumericFields = 'name';

      // @ts-expect-error - 'active' is a boolean field, not numeric
      const _invalidNumField3: TestNumericFields = 'active';

      expect(true).toBe(true);
    });

    it('should extract string fields correctly', () => {
      type TestStringFields = StringFields<TestDocument>;

      // Should include 'id' and 'name'
      const strField1: TestStringFields = 'id';
      const strField2: TestStringFields = 'name';

      expect(strField1).toBe('id');
      expect(strField2).toBe('name');
    });

    it('should reject non-string fields', () => {
      type TestStringFields = StringFields<TestDocument>;

      // @ts-expect-error - 'age' is a number field, not string
      const _invalidStrField1: TestStringFields = 'age';

      // @ts-expect-error - 'active' is a boolean field, not string
      const _invalidStrField2: TestStringFields = 'active';

      expect(true).toBe(true);
    });
  });
});

// =============================================================================
// Tests: Column Type Constraints
// =============================================================================

describe('Generic Constraints: Column Types', () => {
  describe('Column<T> type parameter', () => {
    it('should allow typed columns with matching value arrays', () => {
      const stringColumn: Column<string> = {
        path: 'name',
        type: 5 as Type, // Type.String
        nullable: false,
        values: ['Alice', 'Bob', 'Charlie'],
        nulls: [false, false, false],
      };

      const numberColumn: Column<number> = {
        path: 'age',
        type: 2 as Type, // Type.Int32
        nullable: false,
        values: [25, 30, 35],
        nulls: [false, false, false],
      };

      expect(stringColumn.values).toHaveLength(3);
      expect(numberColumn.values).toHaveLength(3);
    });

    it('should reject mismatched value types', () => {
      // @ts-expect-error - values should be string[], not number[]
      const _invalidColumn: Column<string> = {
        path: 'name',
        type: 5 as Type,
        nullable: false,
        values: [1, 2, 3], // Wrong type!
        nulls: [false, false, false],
      };

      expect(true).toBe(true);
    });
  });

  describe('ColumnStats<T> type parameter', () => {
    it('should type min/max correctly for numeric stats', () => {
      const numStats: ColumnStats<number> = {
        min: 0,
        max: 100,
        nullCount: 5,
        distinctEst: 50,
      };

      // TypeScript should know these are numbers
      if (numStats.min !== undefined && numStats.max !== undefined) {
        const range: number = numStats.max - numStats.min;
        expect(range).toBe(100);
      }
    });

    it('should type min/max correctly for string stats', () => {
      const strStats: ColumnStats<string> = {
        min: 'a',
        max: 'z',
        nullCount: 0,
        distinctEst: 26,
      };

      // TypeScript should know these are strings
      if (strStats.min !== undefined && strStats.max !== undefined) {
        const minChar: string = strStats.min;
        const maxChar: string = strStats.max;
        expect(minChar).toBe('a');
        expect(maxChar).toBe('z');
      }
    });

    it('should prevent type confusion between numeric and string stats', () => {
      // @ts-expect-error - min should be number for ColumnStats<number>
      const _invalidNumStats: ColumnStats<number> = {
        min: 'a',
        max: 'z',
        nullCount: 0,
        distinctEst: 26,
      };

      // @ts-expect-error - min should be string for ColumnStats<string>
      const _invalidStrStats: ColumnStats<string> = {
        min: 0,
        max: 100,
        nullCount: 0,
        distinctEst: 50,
      };

      expect(true).toBe(true);
    });
  });
});

// =============================================================================
// Tests: Type Guards with Generic Constraints
// =============================================================================

describe('Generic Constraints: Type Guards', () => {
  describe('isNumericStats type guard', () => {
    it('should narrow type to NumericColumnStats', () => {
      const stats: ColumnStats = {
        min: 0,
        max: 100,
        nullCount: 5,
        distinctEst: 50,
      };

      if (isNumericStats(stats)) {
        // TypeScript should know stats.min and stats.max are number | undefined
        expectTypeOf(stats).toMatchTypeOf<NumericColumnStats>();

        const min = stats.min;
        const max = stats.max;

        if (min !== undefined && max !== undefined) {
          // Should be able to do arithmetic
          const range = max - min;
          expect(range).toBe(100);
        }
      }
    });

    it('should return false for string stats', () => {
      const stats: ColumnStats = {
        min: 'a',
        max: 'z',
        nullCount: 0,
        distinctEst: 26,
      };

      expect(isNumericStats(stats)).toBe(false);
    });
  });

  describe('isStringStats type guard', () => {
    it('should narrow type to StringColumnStats', () => {
      const stats: ColumnStats = {
        min: 'a',
        max: 'z',
        nullCount: 0,
        distinctEst: 26,
      };

      if (isStringStats(stats)) {
        // TypeScript should know stats.min and stats.max are string | undefined
        expectTypeOf(stats).toMatchTypeOf<StringColumnStats>();

        const min = stats.min;
        const max = stats.max;

        if (min !== undefined && max !== undefined) {
          // Should be able to do string operations
          expect(min.length).toBe(1);
          expect(max.length).toBe(1);
        }
      }
    });

    it('should return false for numeric stats', () => {
      const stats: ColumnStats = {
        min: 0,
        max: 100,
        nullCount: 5,
        distinctEst: 50,
      };

      expect(isStringStats(stats)).toBe(false);
    });
  });

  describe('getNumericStats accessor', () => {
    it('should extract typed numeric values', () => {
      const stats: ColumnStats = {
        min: 0,
        max: 100,
        nullCount: 5,
        distinctEst: 50,
      };

      const { min, max } = getNumericStats(stats);

      // TypeScript knows these are number | null
      expectTypeOf(min).toEqualTypeOf<number | null>();
      expectTypeOf(max).toEqualTypeOf<number | null>();

      expect(min).toBe(0);
      expect(max).toBe(100);
    });

    it('should return null for non-numeric values', () => {
      const stats: ColumnStats = {
        min: 'a',
        max: 'z',
        nullCount: 0,
        distinctEst: 26,
      };

      const { min, max } = getNumericStats(stats);

      expect(min).toBeNull();
      expect(max).toBeNull();
    });
  });

  describe('getStringStats accessor', () => {
    it('should extract typed string values', () => {
      const stats: ColumnStats = {
        min: 'a',
        max: 'z',
        nullCount: 0,
        distinctEst: 26,
      };

      const { min, max } = getStringStats(stats);

      // TypeScript knows these are string | null
      expectTypeOf(min).toEqualTypeOf<string | null>();
      expectTypeOf(max).toEqualTypeOf<string | null>();

      expect(min).toBe('a');
      expect(max).toBe('z');
    });

    it('should return null for non-string values', () => {
      const stats: ColumnStats = {
        min: 0,
        max: 100,
        nullCount: 5,
        distinctEst: 50,
      };

      const { min, max } = getStringStats(stats);

      expect(min).toBeNull();
      expect(max).toBeNull();
    });
  });
});

// =============================================================================
// Tests: Generic Function Constraints
// =============================================================================

describe('Generic Constraints: Function Types', () => {
  /**
   * Example function with generic constraint.
   * Requires T to have a string 'id' field.
   */
  function getDocumentId<T extends DocumentWithId>(doc: T): string {
    return doc.id;
  }

  /**
   * Example function that extracts a field value with type safety.
   */
  function getField<T extends Record<string, unknown>, K extends keyof T>(
    obj: T,
    key: K
  ): T[K] {
    return obj[key];
  }

  /**
   * Example function that updates a field with type safety.
   */
  function updateField<
    T extends Record<string, unknown>,
    K extends keyof T,
  >(obj: T, key: K, value: T[K]): T {
    return { ...obj, [key]: value };
  }

  describe('getDocumentId with DocumentWithId constraint', () => {
    it('should accept documents with id field', () => {
      const doc: TestDocument = {
        id: 'doc-123',
        name: 'Test',
        age: 25,
        active: true,
        createdAt: Date.now(),
      };

      const id = getDocumentId(doc);
      expect(id).toBe('doc-123');
    });

    it('should reject objects without id field', () => {
      const invalidDoc = { name: 'Test', age: 25 };

      // @ts-expect-error - object doesn't have required 'id' field
      getDocumentId(invalidDoc);

      expect(true).toBe(true);
    });
  });

  describe('getField with keyof constraint', () => {
    it('should infer correct return type', () => {
      const doc: TestDocument = {
        id: 'doc-123',
        name: 'Test',
        age: 25,
        active: true,
        createdAt: Date.now(),
      };

      const name = getField(doc, 'name');
      const age = getField(doc, 'age');
      const active = getField(doc, 'active');

      // TypeScript should infer correct types
      expectTypeOf(name).toEqualTypeOf<string>();
      expectTypeOf(age).toEqualTypeOf<number>();
      expectTypeOf(active).toEqualTypeOf<boolean>();

      expect(name).toBe('Test');
      expect(age).toBe(25);
      expect(active).toBe(true);
    });

    it('should reject invalid keys', () => {
      const doc: TestDocument = {
        id: 'doc-123',
        name: 'Test',
        age: 25,
        active: true,
        createdAt: Date.now(),
      };

      // @ts-expect-error - 'invalid' is not a key of TestDocument
      getField(doc, 'invalid');

      expect(true).toBe(true);
    });
  });

  describe('updateField with value type constraint', () => {
    it('should accept matching value types', () => {
      const doc: TestDocument = {
        id: 'doc-123',
        name: 'Test',
        age: 25,
        active: true,
        createdAt: Date.now(),
      };

      const updated = updateField(doc, 'name', 'New Name');
      expect(updated.name).toBe('New Name');

      const updated2 = updateField(doc, 'age', 30);
      expect(updated2.age).toBe(30);
    });

    it('should reject mismatched value types', () => {
      const doc: TestDocument = {
        id: 'doc-123',
        name: 'Test',
        age: 25,
        active: true,
        createdAt: Date.now(),
      };

      // @ts-expect-error - 'age' expects number, not string
      updateField(doc, 'age', 'not a number');

      // @ts-expect-error - 'name' expects string, not number
      updateField(doc, 'name', 123);

      // @ts-expect-error - 'active' expects boolean, not string
      updateField(doc, 'active', 'yes');

      expect(true).toBe(true);
    });
  });
});

// =============================================================================
// Tests: Collection-like Generic Constraints
// =============================================================================

describe('Generic Constraints: Collection Types', () => {
  /**
   * Type-safe collection interface with generic document type.
   */
  interface TypedCollection<T extends Record<string, unknown>> {
    insert(doc: T): T;
    find(query: Partial<T>): T[];
    findOne(query: Partial<T>): T | null;
    update(query: Partial<T>, changes: Partial<T>): number;
    delete(query: Partial<T>): number;
  }

  /**
   * Mock implementation for testing type constraints.
   */
  function createMockCollection<
    T extends Record<string, unknown>,
  >(): TypedCollection<T> {
    const data: T[] = [];

    return {
      insert(doc: T): T {
        data.push(doc);
        return doc;
      },
      find(query: Partial<T>): T[] {
        return data.filter((doc) =>
          Object.entries(query).every(
            ([key, value]) => doc[key] === value
          )
        );
      },
      findOne(query: Partial<T>): T | null {
        return this.find(query)[0] ?? null;
      },
      update(query: Partial<T>, changes: Partial<T>): number {
        let count = 0;
        for (const doc of data) {
          const matches = Object.entries(query).every(
            ([key, value]) => doc[key] === value
          );
          if (matches) {
            Object.assign(doc, changes);
            count++;
          }
        }
        return count;
      },
      delete(query: Partial<T>): number {
        const originalLength = data.length;
        const filtered = data.filter(
          (doc) =>
            !Object.entries(query).every(
              ([key, value]) => doc[key] === value
            )
        );
        data.length = 0;
        data.push(...filtered);
        return originalLength - data.length;
      },
    };
  }

  describe('TypedCollection with document constraint', () => {
    it('should accept documents matching the generic type', () => {
      const collection = createMockCollection<TestDocument>();

      const doc = collection.insert({
        id: 'doc-1',
        name: 'Test',
        age: 25,
        active: true,
        createdAt: Date.now(),
      });

      expect(doc.id).toBe('doc-1');
    });

    it('should reject documents with missing required fields', () => {
      const collection = createMockCollection<TestDocument>();

      // @ts-expect-error - missing required fields (age, active, createdAt)
      collection.insert({
        id: 'doc-1',
        name: 'Test',
      });

      expect(true).toBe(true);
    });

    it('should reject documents with wrong field types', () => {
      const collection = createMockCollection<TestDocument>();

      // @ts-expect-error - age should be number, not string
      collection.insert({
        id: 'doc-1',
        name: 'Test',
        age: 'not a number',
        active: true,
        createdAt: Date.now(),
      });

      expect(true).toBe(true);
    });

    it('should type query parameters correctly', () => {
      const collection = createMockCollection<TestDocument>();

      // Valid query - partial document
      const results = collection.find({ active: true });
      expectTypeOf(results).toEqualTypeOf<TestDocument[]>();

      // @ts-expect-error - invalid field type in query
      collection.find({ age: 'not a number' });

      // @ts-expect-error - invalid field name in query
      collection.find({ invalidField: true });

      expect(results).toBeDefined();
    });

    it('should type update changes correctly', () => {
      const collection = createMockCollection<TestDocument>();

      // Valid update
      const count = collection.update({ id: 'doc-1' }, { name: 'Updated' });
      expectTypeOf(count).toEqualTypeOf<number>();

      // @ts-expect-error - wrong type for name field
      collection.update({ id: 'doc-1' }, { name: 123 });

      // @ts-expect-error - invalid field in changes
      collection.update({ id: 'doc-1' }, { invalidField: 'value' });

      expect(count).toBeDefined();
    });
  });
});

// =============================================================================
// Tests: Index Field Type Constraints
// =============================================================================

describe('Generic Constraints: Index Types', () => {
  /**
   * Type-safe index definition.
   * Ensures index fields exist on the document type.
   */
  interface TypedIndexDefinition<
    T extends Record<string, unknown>,
    K extends keyof T = keyof T,
  > {
    name: string;
    fields: K[];
    unique?: boolean;
  }

  /**
   * Creates a typed index definition.
   */
  function createIndex<
    T extends Record<string, unknown>,
    K extends keyof T,
  >(
    name: string,
    fields: K[],
    options?: { unique?: boolean }
  ): TypedIndexDefinition<T, K> {
    return {
      name,
      fields,
      unique: options?.unique,
    };
  }

  describe('TypedIndexDefinition with field constraint', () => {
    it('should accept valid field names', () => {
      const index = createIndex<TestDocument, 'name' | 'age'>(
        'idx_name_age',
        ['name', 'age']
      );

      expect(index.name).toBe('idx_name_age');
      expect(index.fields).toEqual(['name', 'age']);
    });

    it('should reject invalid field names', () => {
      // @ts-expect-error - 'invalid' is not a key of TestDocument
      createIndex<TestDocument, 'name' | 'invalid'>('idx', ['name', 'invalid']);

      expect(true).toBe(true);
    });

    it('should enforce field type consistency', () => {
      // Index on string fields
      const nameIndex = createIndex<TestDocument, 'id' | 'name'>(
        'idx_strings',
        ['id', 'name']
      );

      // Index on numeric fields
      const numericIndex = createIndex<TestDocument, 'age' | 'createdAt'>(
        'idx_numbers',
        ['age', 'createdAt']
      );

      expect(nameIndex.fields).toEqual(['id', 'name']);
      expect(numericIndex.fields).toEqual(['age', 'createdAt']);
    });
  });

  describe('Index field autocomplete support', () => {
    it('should infer field type from index fields', () => {
      type TestFields = keyof TestDocument;

      // All valid fields
      const validFields: TestFields[] = [
        'id',
        'name',
        'age',
        'active',
        'createdAt',
        'tags',
      ];

      expect(validFields).toHaveLength(6);
    });
  });
});

// =============================================================================
// Tests: Chained Method Type Inference
// =============================================================================

describe('Generic Constraints: Method Chaining', () => {
  /**
   * Builder pattern with generic type preservation.
   */
  class TypedBuilder<T extends Record<string, unknown>> {
    private _data: Partial<T> = {};

    set<K extends keyof T>(key: K, value: T[K]): this {
      this._data[key] = value;
      return this;
    }

    get<K extends keyof T>(key: K): T[K] | undefined {
      return this._data[key];
    }

    build(): Partial<T> {
      return { ...this._data };
    }
  }

  describe('TypedBuilder with method chaining', () => {
    it('should preserve types through chained calls', () => {
      const builder = new TypedBuilder<TestDocument>();

      const result = builder
        .set('id', 'doc-123')
        .set('name', 'Test')
        .set('age', 25)
        .set('active', true)
        .set('createdAt', Date.now())
        .build();

      expect(result.id).toBe('doc-123');
      expect(result.name).toBe('Test');
      expect(result.age).toBe(25);
    });

    it('should reject wrong value types in chain', () => {
      const builder = new TypedBuilder<TestDocument>();

      builder
        .set('id', 'doc-123')
        // @ts-expect-error - age expects number, not string
        .set('age', 'not a number');

      expect(true).toBe(true);
    });

    it('should infer correct return type from get', () => {
      const builder = new TypedBuilder<TestDocument>();
      builder.set('name', 'Test').set('age', 25);

      const name = builder.get('name');
      const age = builder.get('age');

      expectTypeOf(name).toEqualTypeOf<string | undefined>();
      expectTypeOf(age).toEqualTypeOf<number | undefined>();

      expect(name).toBe('Test');
      expect(age).toBe(25);
    });
  });
});

// =============================================================================
// Tests: Error Message Quality
// =============================================================================

describe('Generic Constraints: Error Messages', () => {
  // Using InvalidFieldError from types.ts for template literal error messages

  /**
   * Function that produces readable error for invalid fields.
   */
  function validateField<T extends Record<string, unknown>>(
    _obj: T,
    _field: keyof T
  ): void {
    // Implementation not needed for type tests
  }

  describe('Template literal error types', () => {
    it('should accept valid fields', () => {
      const doc: TestDocument = {
        id: 'doc-123',
        name: 'Test',
        age: 25,
        active: true,
        createdAt: Date.now(),
      };

      validateField(doc, 'id');
      validateField(doc, 'name');
      validateField(doc, 'age');

      expect(true).toBe(true);
    });

    it('should produce type error for invalid fields', () => {
      const doc: TestDocument = {
        id: 'doc-123',
        name: 'Test',
        age: 25,
        active: true,
        createdAt: Date.now(),
      };

      // @ts-expect-error - 'invalidField' is not a valid field
      validateField(doc, 'invalidField');

      expect(true).toBe(true);
    });

    it('should work with the InvalidFieldError type', () => {
      // Valid field - should be never (no error)
      type ValidResult = InvalidFieldError<TestDocument, 'name'>;

      // Invalid field - should be error message string
      type InvalidResult = InvalidFieldError<TestDocument, 'nonexistent'>;

      // Type checks
      expectTypeOf<ValidResult>().toEqualTypeOf<never>();
      expectTypeOf<InvalidResult>().toEqualTypeOf<
        "Field 'nonexistent' does not exist on type"
      >();

      expect(true).toBe(true);
    });
  });
});
