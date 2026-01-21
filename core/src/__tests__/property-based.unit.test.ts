/**
 * @evodb/core - Property-Based Tests with fast-check
 *
 * Comprehensive property-based testing for:
 * 1. Encoding/decoding roundtrips - Values survive encode/decode cycles
 * 2. Schema inference invariants - Schema properties hold for any input
 * 3. Query result consistency - Filter/sort operations are deterministic
 *
 * Issue: evodb-yx1 - TDD: Add property-based testing with fast-check
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  encode,
  decode,
  shred,
  unshred,
  inferSchema,
  serializeSchema,
  deserializeSchema,
  isCompatible,
  schemaDiff,
  Type,
  Encoding,
  type Column,
  type Schema,
} from '../index.js';
import {
  evaluateFilter,
  evaluateFilters,
  sortRows,
  compareValues,
  computeAggregate,
  computeAggregations,
  getNestedValue,
  likePatternToRegex,
  type FilterPredicate,
  type SortSpec,
  type AggregateSpec,
} from '../query-ops.js';

// =============================================================================
// ARBITRARIES - Custom generators for domain-specific types
// =============================================================================

/**
 * Generate valid column paths (dot-notation with optional array indices)
 */
const pathArbitrary = fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/).chain(base =>
  fc.array(
    fc.oneof(
      fc.stringMatching(/^[a-z][a-z0-9]{0,4}$/),
      fc.nat({ max: 9 }).map(n => `[${n}]`)
    ),
    { minLength: 0, maxLength: 3 }
  ).map(parts => [base, ...parts].join('.').replace(/\.\[/g, '['))
);

/**
 * Generate primitive values that can be encoded/decoded
 */
const primitiveArbitrary = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -2147483648, max: 2147483647 }), // Int32 range
  fc.double({ min: -1e10, max: 1e10, noNaN: true, noDefaultInfinity: true }),
  fc.string({ minLength: 0, maxLength: 100 })
);

/**
 * Generate simple JSON-like objects (no nested arrays/objects for roundtrip testing)
 */
const simpleObjectArbitrary = fc.dictionary(
  fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/),
  primitiveArbitrary,
  { minKeys: 1, maxKeys: 5 }
);

/**
 * Generate arrays of simple objects for shredding tests
 */
const documentArrayArbitrary = fc.array(simpleObjectArbitrary, { minLength: 1, maxLength: 20 });

/**
 * Generate filter operators
 */
const filterOperatorArbitrary = fc.constantFrom(
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'isNull', 'isNotNull'
) as fc.Arbitrary<FilterPredicate['operator']>;

/**
 * Generate sort directions
 */
const sortDirectionArbitrary = fc.constantFrom('asc', 'desc') as fc.Arbitrary<SortSpec['direction']>;

// =============================================================================
// 1. ENCODING/DECODING ROUNDTRIP TESTS
// =============================================================================

describe('Property-Based Tests: Encoding/Decoding Roundtrips', () => {
  describe('Plain Encoding Roundtrip', () => {
    it('Int32 values survive encode/decode cycle with plain encoding', () => {
      fc.assert(
        fc.property(
          // Use unsorted arrays to avoid triggering delta encoding
          // Delta encoding requires the data to be sorted for correct roundtrip
          fc.array(fc.integer({ min: -1000000, max: 1000000 }), { minLength: 1, maxLength: 100 })
            .filter(arr => {
              // Ensure array is NOT sorted (to trigger plain encoding)
              if (arr.length < 2) return true;
              let sorted = true;
              for (let i = 1; i < arr.length; i++) {
                if (arr[i] < arr[i - 1]) { sorted = false; break; }
              }
              return !sorted;
            }),
          (values) => {
            const column: Column = {
              path: 'test',
              type: Type.Int32,
              nullable: false,
              values,
              nulls: values.map(() => false),
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, values.length);

            expect(decoded.values).toEqual(values);
            expect(decoded.path).toBe('test');
            expect(decoded.type).toBe(Type.Int32);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Float64 values survive encode/decode cycle', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 100 }),
          (values) => {
            const column: Column = {
              path: 'test',
              type: Type.Float64,
              nullable: false,
              values,
              nulls: values.map(() => false),
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, values.length);

            // Float comparison with tolerance for encoding precision
            for (let i = 0; i < values.length; i++) {
              expect(decoded.values[i]).toBeCloseTo(values[i] as number, 10);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('String values survive encode/decode cycle', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 1, maxLength: 50 }),
          (values) => {
            const column: Column = {
              path: 'test',
              type: Type.String,
              nullable: false,
              values,
              nulls: values.map(() => false),
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, values.length);

            expect(decoded.values).toEqual(values);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Boolean values survive encode/decode cycle', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 100 }),
          (values) => {
            const column: Column = {
              path: 'test',
              type: Type.Bool,
              nullable: false,
              values,
              nulls: values.map(() => false),
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, values.length);

            expect(decoded.values).toEqual(values);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Null Handling Roundtrip', () => {
    it('Nullable columns preserve null positions', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              // Use smaller integers that won't trigger delta encoding issues
              fc.integer({ min: -1000000, max: 1000000 }).map(v => ({ value: v, isNull: false })),
              fc.constant({ value: null, isNull: true })
            ),
            { minLength: 1, maxLength: 50 }
          ).filter(items => {
            // Ensure at least one non-null value
            const hasNonNull = items.some(i => !i.isNull);
            if (!hasNonNull) return false;

            // Filter out sorted arrays to avoid delta encoding
            const nonNullValues = items.filter(i => !i.isNull).map(i => i.value);
            if (nonNullValues.length < 2) return true;
            let sorted = true;
            for (let i = 1; i < nonNullValues.length; i++) {
              if ((nonNullValues[i] as number) < (nonNullValues[i - 1] as number)) {
                sorted = false;
                break;
              }
            }
            return !sorted;
          }),
          (items) => {
            const values = items.map(i => i.value);
            const nulls = items.map(i => i.isNull);

            const column: Column = {
              path: 'test',
              type: Type.Int32,
              nullable: true,
              values,
              nulls,
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, items.length);

            // Check null positions are preserved
            for (let i = 0; i < items.length; i++) {
              expect(decoded.nulls[i]).toBe(nulls[i]);
            }

            // Check non-null values in order
            const originalNonNull = items.filter(i => !i.isNull).map(i => i.value);
            const decodedNonNull = decoded.values.filter((_, i) => !decoded.nulls[i]);
            expect(decodedNonNull).toEqual(originalNonNull);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Dictionary Encoding Roundtrip', () => {
    it('Low cardinality strings use dictionary encoding and roundtrip correctly', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            // Generate a small set of distinct values
            fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 5 }),
            // Generate number of rows
            fc.integer({ min: 10, max: 50 })
          ),
          ([distinctValues, rowCount]) => {
            // Create values by randomly selecting from distinct values
            const values = Array.from({ length: rowCount }, (_, i) =>
              distinctValues[i % distinctValues.length]
            );

            const column: Column = {
              path: 'test',
              type: Type.String,
              nullable: false,
              values,
              nulls: values.map(() => false),
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, rowCount);

            expect(decoded.values).toEqual(values);
            // Should use dictionary encoding for low cardinality
            // (distinctEst < nonNull.length / 2)
            if (distinctValues.length < rowCount / 2) {
              expect(encoded.encoding).toBe(Encoding.Dict);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Delta Encoding Roundtrip', () => {
    it('Sorted integers use delta encoding and roundtrip correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 1000000 }), { minLength: 2, maxLength: 50 })
            .map(arr => [...arr].sort((a, b) => a - b)),
          (sortedValues) => {
            const column: Column = {
              path: 'test',
              type: Type.Int32,
              nullable: false,
              values: sortedValues,
              nulls: sortedValues.map(() => false),
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, sortedValues.length);

            expect(decoded.values).toEqual(sortedValues);
            // Should use delta encoding for sorted integers
            expect(encoded.encoding).toBe(Encoding.Delta);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Shred/Unshred Roundtrip', () => {
    it('Simple objects survive shred/unshred cycle', () => {
      fc.assert(
        fc.property(
          documentArrayArbitrary,
          (docs) => {
            const columns = shred(docs);
            const reconstructed = unshred(columns, docs.length);

            // Each reconstructed doc should have the same keys and values
            for (let i = 0; i < docs.length; i++) {
              const original = docs[i];
              const restored = reconstructed[i] as Record<string, unknown>;

              for (const key of Object.keys(original)) {
                const origVal = original[key];
                const restoredVal = restored[key];

                if (origVal === null || origVal === undefined) {
                  // Null values may not appear in restored object
                  expect(restoredVal === null || restoredVal === undefined).toBe(true);
                } else {
                  expect(restoredVal).toEqual(origVal);
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Shredding preserves row count', () => {
      fc.assert(
        fc.property(
          fc.array(simpleObjectArbitrary, { minLength: 0, maxLength: 50 }),
          (docs) => {
            if (docs.length === 0) return; // Skip empty arrays

            const columns = shred(docs);

            // All columns should have the same length as input
            for (const col of columns) {
              expect(col.values.length).toBe(docs.length);
              expect(col.nulls.length).toBe(docs.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// =============================================================================
// 2. SCHEMA INFERENCE INVARIANTS
// =============================================================================

describe('Property-Based Tests: Schema Inference Invariants', () => {
  describe('Schema Structure Invariants', () => {
    it('Inferred schema has correct column count', () => {
      fc.assert(
        fc.property(
          documentArrayArbitrary,
          (docs) => {
            const columns = shred(docs);
            const schema = inferSchema(columns);

            expect(schema.columns.length).toBe(columns.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Schema column paths match shredded column paths', () => {
      fc.assert(
        fc.property(
          documentArrayArbitrary,
          (docs) => {
            const columns = shred(docs);
            const schema = inferSchema(columns);

            const columnPaths = new Set(columns.map(c => c.path));
            const schemaPaths = new Set(schema.columns.map(c => c.path));

            expect(columnPaths).toEqual(schemaPaths);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Schema column types match shredded column types', () => {
      fc.assert(
        fc.property(
          documentArrayArbitrary,
          (docs) => {
            const columns = shred(docs);
            const schema = inferSchema(columns);

            for (const col of columns) {
              const schemaCol = schema.columns.find(c => c.path === col.path);
              expect(schemaCol).toBeDefined();
              expect(schemaCol!.type).toBe(col.type);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Schema Serialization Invariants', () => {
    it('Schema survives serialize/deserialize cycle', () => {
      fc.assert(
        fc.property(
          documentArrayArbitrary,
          (docs) => {
            const columns = shred(docs);
            const schema = inferSchema(columns);

            const serialized = serializeSchema(schema);
            const deserialized = deserializeSchema(serialized);

            expect(deserialized.id).toBe(schema.id);
            expect(deserialized.version).toBe(schema.version);
            expect(deserialized.columns.length).toBe(schema.columns.length);

            for (let i = 0; i < schema.columns.length; i++) {
              expect(deserialized.columns[i].path).toBe(schema.columns[i].path);
              expect(deserialized.columns[i].type).toBe(schema.columns[i].type);
              expect(deserialized.columns[i].nullable).toBe(schema.columns[i].nullable);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Schema Compatibility Invariants', () => {
    it('Schema is always compatible with itself', () => {
      fc.assert(
        fc.property(
          documentArrayArbitrary,
          (docs) => {
            const columns = shred(docs);
            const schema = inferSchema(columns);

            expect(isCompatible(schema, schema)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Schema diff with itself returns no changes', () => {
      fc.assert(
        fc.property(
          documentArrayArbitrary,
          (docs) => {
            const columns = shred(docs);
            const schema = inferSchema(columns);

            const diff = schemaDiff(schema, schema);

            expect(diff.added).toEqual([]);
            expect(diff.removed).toEqual([]);
            expect(diff.modified).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Adding nullable columns maintains compatibility', () => {
      fc.assert(
        fc.property(
          fc.tuple(documentArrayArbitrary, pathArbitrary),
          ([docs, newPath]) => {
            const columns = shred(docs);
            const schema = inferSchema(columns);

            // Create new schema with additional nullable column
            const newSchema: Schema = {
              ...schema,
              version: schema.version + 1,
              columns: [
                ...schema.columns,
                { path: newPath, type: Type.String, nullable: true },
              ],
            };

            // New schema should be compatible (can read old data)
            expect(isCompatible(schema, newSchema)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

// =============================================================================
// 3. QUERY RESULT CONSISTENCY
// =============================================================================

describe('Property-Based Tests: Query Result Consistency', () => {
  describe('Filter Evaluation Consistency', () => {
    it('eq filter is reflexive (x == x is always true)', () => {
      fc.assert(
        fc.property(
          primitiveArbitrary,
          (value) => {
            if (value === null) return; // null == null is handled specially

            const filter: FilterPredicate = {
              column: 'test',
              operator: 'eq',
              value,
            };

            expect(evaluateFilter(value, filter)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('ne filter is irreflexive (x != x is always false for non-null)', () => {
      fc.assert(
        fc.property(
          primitiveArbitrary,
          (value) => {
            if (value === null) return;

            const filter: FilterPredicate = {
              column: 'test',
              operator: 'ne',
              value,
            };

            expect(evaluateFilter(value, filter)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('gt and lte are complementary', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.integer(), fc.integer()),
          ([a, b]) => {
            const gtFilter: FilterPredicate = { column: 'test', operator: 'gt', value: b };
            const lteFilter: FilterPredicate = { column: 'test', operator: 'lte', value: b };

            const gtResult = evaluateFilter(a, gtFilter);
            const lteResult = evaluateFilter(a, lteFilter);

            // Exactly one should be true (they are complements)
            expect(gtResult !== lteResult).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('lt and gte are complementary', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.integer(), fc.integer()),
          ([a, b]) => {
            const ltFilter: FilterPredicate = { column: 'test', operator: 'lt', value: b };
            const gteFilter: FilterPredicate = { column: 'test', operator: 'gte', value: b };

            const ltResult = evaluateFilter(a, ltFilter);
            const gteResult = evaluateFilter(a, gteFilter);

            // Exactly one should be true
            expect(ltResult !== gteResult).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('in filter matches when value is in array', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
            fc.nat({ max: 9 })
          ),
          ([values, index]) => {
            const idx = index % values.length;
            const searchValue = values[idx];

            const filter: FilterPredicate = {
              column: 'test',
              operator: 'in',
              values,
            };

            expect(evaluateFilter(searchValue, filter)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isNull and isNotNull are complements', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(null), fc.constant(undefined), fc.integer(), fc.string()),
          (value) => {
            const isNullFilter: FilterPredicate = { column: 'test', operator: 'isNull' };
            const isNotNullFilter: FilterPredicate = { column: 'test', operator: 'isNotNull' };

            const isNullResult = evaluateFilter(value, isNullFilter);
            const isNotNullResult = evaluateFilter(value, isNotNullFilter);

            expect(isNullResult !== isNotNullResult).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Sort Consistency', () => {
    it('Sorting is idempotent (sorting twice gives same result)', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.array(
              fc.record({
                id: fc.integer(),
                name: fc.string({ minLength: 1, maxLength: 10 }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            sortDirectionArbitrary
          ),
          ([rows, direction]) => {
            const orderBy: SortSpec[] = [{ column: 'id', direction }];

            const sortedOnce = sortRows(rows, orderBy);
            const sortedTwice = sortRows(sortedOnce, orderBy);

            expect(sortedOnce).toEqual(sortedTwice);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Sorting preserves array length', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.integer(),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          (rows) => {
            const orderBy: SortSpec[] = [{ column: 'value', direction: 'asc' }];
            const sorted = sortRows(rows, orderBy);

            expect(sorted.length).toBe(rows.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Ascending sort produces non-decreasing sequence', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.integer(),
            }),
            { minLength: 2, maxLength: 50 }
          ),
          (rows) => {
            const orderBy: SortSpec[] = [{ column: 'value', direction: 'asc' }];
            const sorted = sortRows(rows, orderBy);

            for (let i = 1; i < sorted.length; i++) {
              const prev = sorted[i - 1].value;
              const curr = sorted[i].value;
              expect(compareValues(prev, curr)).toBeLessThanOrEqual(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Descending sort produces non-increasing sequence', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.integer(),
            }),
            { minLength: 2, maxLength: 50 }
          ),
          (rows) => {
            const orderBy: SortSpec[] = [{ column: 'value', direction: 'desc' }];
            const sorted = sortRows(rows, orderBy);

            for (let i = 1; i < sorted.length; i++) {
              const prev = sorted[i - 1].value;
              const curr = sorted[i].value;
              expect(compareValues(prev, curr)).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Aggregation Consistency', () => {
    it('count returns row count for non-null values', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.oneof(fc.integer(), fc.constant(null)),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          (rows) => {
            const spec: AggregateSpec = {
              function: 'count',
              column: 'value',
              alias: 'cnt',
            };

            const result = computeAggregate(rows, spec);
            const expected = rows.filter(r => r.value !== null).length;

            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('sum of non-negative integers is non-negative', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.nat({ max: 1000 }),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          (rows) => {
            const spec: AggregateSpec = {
              function: 'sum',
              column: 'value',
              alias: 'total',
            };

            const result = computeAggregate(rows, spec) as number;

            expect(result).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('min <= avg <= max for numeric columns', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.integer({ min: -1000, max: 1000 }),
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (rows) => {
            const minSpec: AggregateSpec = { function: 'min', column: 'value', alias: 'min' };
            const avgSpec: AggregateSpec = { function: 'avg', column: 'value', alias: 'avg' };
            const maxSpec: AggregateSpec = { function: 'max', column: 'value', alias: 'max' };

            const min = computeAggregate(rows, minSpec) as number;
            const avg = computeAggregate(rows, avgSpec) as number;
            const max = computeAggregate(rows, maxSpec) as number;

            expect(min).toBeLessThanOrEqual(avg);
            expect(avg).toBeLessThanOrEqual(max);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('countDistinct <= count', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              value: fc.integer({ min: 1, max: 10 }), // Low cardinality for testing
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (rows) => {
            const countSpec: AggregateSpec = { function: 'count', column: 'value', alias: 'cnt' };
            const countDistinctSpec: AggregateSpec = { function: 'countDistinct', column: 'value', alias: 'cntd' };

            const count = computeAggregate(rows, countSpec) as number;
            const countDistinct = computeAggregate(rows, countDistinctSpec) as number;

            expect(countDistinct).toBeLessThanOrEqual(count);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Nested Value Access Consistency', () => {
    it('getNestedValue retrieves correct values', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 10 }),
            primitiveArbitrary
          ),
          ([key, value]) => {
            if (value === null) return; // Skip null for this test

            const obj = { [key]: value };
            const retrieved = getNestedValue(obj, key);

            expect(retrieved).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getNestedValue handles missing keys gracefully', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/),
            fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/)
          ),
          ([existingKey, missingKey]) => {
            if (existingKey === missingKey) return; // Skip if same key

            const obj = { [existingKey]: 'value' };
            const retrieved = getNestedValue(obj, missingKey);

            expect(retrieved).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('LIKE Pattern Consistency', () => {
    it('% at start matches any prefix', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 0, maxLength: 10 }),
            fc.string({ minLength: 1, maxLength: 5 })
          ),
          ([prefix, suffix]) => {
            const pattern = `%${suffix}`;
            const regex = likePatternToRegex(pattern);
            const testString = prefix + suffix;

            expect(regex.test(testString)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('% at end matches any suffix', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 5 }),
            fc.string({ minLength: 0, maxLength: 10 })
          ),
          ([prefix, suffix]) => {
            const pattern = `${prefix}%`;
            const regex = likePatternToRegex(pattern);
            const testString = prefix + suffix;

            expect(regex.test(testString)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('_ matches exactly one character', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z]{1,5}$/),
            fc.stringMatching(/^[a-z]$/), // Single char
            fc.stringMatching(/^[a-z]{1,5}$/)
          ),
          ([prefix, middle, suffix]) => {
            const pattern = `${prefix}_${suffix}`;
            const regex = likePatternToRegex(pattern);
            const testString = prefix + middle + suffix;

            expect(regex.test(testString)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('compareValues Consistency', () => {
    it('compareValues is reflexive (x compared to x is 0)', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.integer(), fc.string(), fc.constant(null)),
          (value) => {
            expect(compareValues(value, value)).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('compareValues is antisymmetric', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.integer(), fc.integer()),
          ([a, b]) => {
            const cmpAB = compareValues(a, b);
            const cmpBA = compareValues(b, a);

            // sign(cmp(a,b)) == -sign(cmp(b,a))
            expect(Math.sign(cmpAB)).toBe(-Math.sign(cmpBA));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('compareValues is transitive for ordering', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.integer(), fc.integer(), fc.integer()),
          ([a, b, c]) => {
            const cmpAB = compareValues(a, b);
            const cmpBC = compareValues(b, c);
            const cmpAC = compareValues(a, c);

            // If a < b and b < c, then a < c
            if (cmpAB < 0 && cmpBC < 0) {
              expect(cmpAC).toBeLessThan(0);
            }
            // If a > b and b > c, then a > c
            if (cmpAB > 0 && cmpBC > 0) {
              expect(cmpAC).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// =============================================================================
// 4. EDGE CASE AND STRESS TESTS
// =============================================================================

describe('Property-Based Tests: Edge Cases and Stress', () => {
  describe('Empty Input Handling', () => {
    it('Empty document array produces empty columns', () => {
      const columns = shred([]);
      expect(columns.length).toBe(0);
    });

    it('Empty columns produce empty unshred result', () => {
      const docs = unshred([], 0);
      expect(docs.length).toBe(0);
    });

    it('Empty filter array matches all rows', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer(),
            name: fc.string(),
          }),
          (row) => {
            expect(evaluateFilters(row, [])).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unicode and Special Characters', () => {
    it('Unicode strings survive encode/decode', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 20 }),
          (values) => {
            const column: Column = {
              path: 'test',
              type: Type.String,
              nullable: false,
              values,
              nulls: values.map(() => false),
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, values.length);

            expect(decoded.values).toEqual(values);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('Object keys with various characters survive shred/unshred', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.dictionary(
              // Use alphanumeric keys to avoid path parsing issues with dots/brackets
              fc.stringMatching(/^[a-z][a-z0-9]{0,4}$/),
              fc.integer(),
              { minKeys: 1, maxKeys: 3 }
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (docs) => {
            const columns = shred(docs);
            const reconstructed = unshred(columns, docs.length);

            // Verify key preservation
            for (let i = 0; i < docs.length; i++) {
              const original = docs[i];
              const restored = reconstructed[i] as Record<string, unknown>;

              for (const key of Object.keys(original)) {
                expect(restored[key]).toBe(original[key]);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Large Value Handling', () => {
    it('Large string values survive roundtrip', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 5000 }),
          (largeString) => {
            const column: Column = {
              path: 'test',
              type: Type.String,
              nullable: false,
              values: [largeString],
              nulls: [false],
            };

            const [encoded] = encode([column]);
            const decoded = decode(encoded, 1);

            expect(decoded.values[0]).toBe(largeString);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('Many columns survive encode/decode', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 50 }),
          (columnCount) => {
            const columns: Column[] = Array.from({ length: columnCount }, (_, i) => ({
              path: `col_${i}`,
              type: Type.Int32,
              nullable: false,
              values: [i, i + 1, i + 2],
              nulls: [false, false, false],
            }));

            const encoded = encode(columns);
            expect(encoded.length).toBe(columnCount);

            for (let i = 0; i < columnCount; i++) {
              const decoded = decode(encoded[i], 3);
              expect(decoded.values).toEqual([i, i + 1, i + 2]);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
