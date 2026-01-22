/**
 * Type Guards for EvoDB - Centralized Type Checking Utilities
 *
 * This module provides a complete, standardized set of type guards following
 * consistent naming conventions:
 *
 * - `isX` - Type checking guards (narrow types at runtime)
 * - `hasX` - Property checking guards (check for properties on objects)
 * - `assertX` - Assertion guards (throw on failure, narrow types)
 *
 * All type guards are designed to work with TypeScript's type narrowing system,
 * allowing for safe type assertions after guards return true.
 *
 * @example
 * ```typescript
 * import {
 *   isArray, isRecord, isString,
 *   hasProperty, hasProperties,
 *   assertArray, assertString
 * } from '@evodb/core';
 *
 * function processValue(val: unknown): void {
 *   if (isArray(val)) {
 *     // TypeScript now knows val is unknown[]
 *     val.forEach(item => console.log(item));
 *   } else if (isRecord(val)) {
 *     // TypeScript now knows val is Record<string, unknown>
 *     if (hasProperty(val, 'name')) {
 *       console.log(val.name);
 *     }
 *   }
 * }
 *
 * // Or use assertion guards to throw on invalid input
 * function requireString(val: unknown): string {
 *   assertString(val, 'Expected a string');
 *   return val; // TypeScript knows val is string
 * }
 * ```
 *
 * @module type-guards
 */

// =============================================================================
// PRIMITIVE TYPE GUARDS (isX)
// =============================================================================

/**
 * Type guard: check if value is a string
 *
 * @param value - Value to check
 * @returns True if value is a string, narrowing type to string
 *
 * @example
 * ```typescript
 * const data: unknown = 'hello';
 * if (isString(data)) {
 *   // data is now typed as string
 *   console.log(data.toUpperCase());
 * }
 * ```
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard: check if value is a number (excludes NaN by default)
 *
 * Note: This excludes NaN since NaN often causes unexpected behavior.
 * Use isNumberIncludingNaN if you need to include NaN values.
 *
 * @param value - Value to check
 * @returns True if value is a finite number, narrowing type to number
 *
 * @example
 * ```typescript
 * const data: unknown = 42;
 * if (isNumber(data)) {
 *   // data is now typed as number
 *   console.log(data * 2);
 * }
 * ```
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Type guard: check if value is a number (including NaN)
 *
 * @param value - Value to check
 * @returns True if value is a number (including NaN), narrowing type to number
 */
export function isNumberIncludingNaN(value: unknown): value is number {
  return typeof value === 'number';
}

/**
 * Type guard: check if value is a boolean
 *
 * @param value - Value to check
 * @returns True if value is a boolean, narrowing type to boolean
 *
 * @example
 * ```typescript
 * const data: unknown = true;
 * if (isBoolean(data)) {
 *   // data is now typed as boolean
 *   console.log(!data);
 * }
 * ```
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard: check if value is a bigint
 *
 * @param value - Value to check
 * @returns True if value is a bigint, narrowing type to bigint
 */
export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

/**
 * Type guard: check if value is a function
 *
 * @param value - Value to check
 * @returns True if value is a function
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Type guard: check if value is a symbol
 *
 * @param value - Value to check
 * @returns True if value is a symbol, narrowing type to symbol
 */
export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

// =============================================================================
// NULLISH TYPE GUARDS (isX)
// =============================================================================

/**
 * Type guard: check if value is null
 *
 * @param value - Value to check
 * @returns True if value is null
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Type guard: check if value is undefined
 *
 * @param value - Value to check
 * @returns True if value is undefined
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Type guard: check if value is null or undefined
 *
 * @param value - Value to check
 * @returns True if value is null or undefined
 *
 * @example
 * ```typescript
 * const data: unknown = null;
 * if (isNullish(data)) {
 *   console.log('Value is null or undefined');
 * }
 * ```
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Type guard: check if value is not null or undefined
 *
 * This is useful for filtering out nullish values while preserving type narrowing.
 *
 * @param value - Value to check
 * @returns True if value is not null or undefined
 *
 * @example
 * ```typescript
 * const items: (string | null)[] = ['a', null, 'b'];
 * const filtered: string[] = items.filter(isNotNullish);
 * ```
 */
export function isNotNullish<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

// =============================================================================
// OBJECT TYPE GUARDS (isX)
// =============================================================================

/**
 * Type guard: check if value is an array
 *
 * @param value - Value to check
 * @returns True if value is an array, narrowing type to unknown[]
 *
 * @example
 * ```typescript
 * const data: unknown = [1, 2, 3];
 * if (isArray(data)) {
 *   // data is now typed as unknown[]
 *   console.log(data.length);
 * }
 * ```
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard: check if value is a plain object (not null, not array)
 *
 * This is more strict than `typeof value === 'object'` as it excludes:
 * - null
 * - arrays
 * - class instances (by default objects but often not what you want)
 *
 * @param value - Value to check
 * @returns True if value is a plain object, narrowing type to Record<string, unknown>
 *
 * @example
 * ```typescript
 * const data: unknown = { name: 'Alice', age: 30 };
 * if (isRecord(data)) {
 *   // data is now typed as Record<string, unknown>
 *   console.log(data.name);
 * }
 * ```
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard: alias for isRecord
 *
 * @param value - Value to check
 * @returns True if value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

/**
 * Type guard: check if value is a Date instance
 *
 * Note: This does not check if the Date is valid (not Invalid Date).
 * Use isValidDate for that.
 *
 * @param value - Value to check
 * @returns True if value is a Date instance
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

/**
 * Type guard: check if value is a valid Date (not Invalid Date)
 *
 * @param value - Value to check
 * @returns True if value is a valid Date instance
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Type guard: check if value is a Uint8Array
 *
 * @param value - Value to check
 * @returns True if value is a Uint8Array
 */
export function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

/**
 * Type guard: check if value is an ArrayBuffer
 *
 * @param value - Value to check
 * @returns True if value is an ArrayBuffer
 */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

/**
 * Type guard: check if value is an Error instance
 *
 * @param value - Value to check
 * @returns True if value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard: check if value is a Promise
 *
 * @param value - Value to check
 * @returns True if value is a Promise
 */
export function isPromise(value: unknown): value is Promise<unknown> {
  return value instanceof Promise;
}

/**
 * Type guard: check if value is a RegExp
 *
 * @param value - Value to check
 * @returns True if value is a RegExp
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

/**
 * Type guard: check if value is a Map
 *
 * @param value - Value to check
 * @returns True if value is a Map
 */
export function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map;
}

/**
 * Type guard: check if value is a Set
 *
 * @param value - Value to check
 * @returns True if value is a Set
 */
export function isSet(value: unknown): value is Set<unknown> {
  return value instanceof Set;
}

// =============================================================================
// COMPOUND TYPE GUARDS (isX)
// =============================================================================

/**
 * Type guard: check if value is a tuple of two numbers
 *
 * Useful for range values like [min, max] or [lo, hi].
 * Excludes NaN values by default for safety.
 *
 * @param value - Value to check
 * @returns True if value is a [number, number] tuple
 *
 * @example
 * ```typescript
 * const range: unknown = [10, 20];
 * if (isNumberTuple(range)) {
 *   const [lo, hi] = range;
 *   console.log(`Range: ${lo} to ${hi}`);
 * }
 * ```
 */
export function isNumberTuple(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isNumber(value[0]) &&
    isNumber(value[1])
  );
}

/**
 * Type guard: check if value is an array where all elements pass a guard
 *
 * @param value - Value to check
 * @param guard - Type guard function to apply to each element
 * @returns True if value is an array and all elements pass the guard
 *
 * @example
 * ```typescript
 * const data: unknown = [1, 2, 3];
 * if (isArrayOf(data, isNumber)) {
 *   // data is now typed as number[]
 *   const sum = data.reduce((a, b) => a + b, 0);
 * }
 * ```
 */
export function isArrayOf<T>(
  value: unknown,
  guard: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/**
 * Type guard: check if value is a non-empty string
 *
 * @param value - Value to check
 * @returns True if value is a string with length > 0
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

/**
 * Type guard: check if value is a finite number (not NaN, not Infinity)
 *
 * @param value - Value to check
 * @returns True if value is a finite number
 */
export function isFiniteNumber(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value);
}

/**
 * Type guard: check if value is a positive number
 *
 * @param value - Value to check
 * @returns True if value is a number > 0
 */
export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

/**
 * Type guard: check if value is a non-negative number
 *
 * @param value - Value to check
 * @returns True if value is a number >= 0
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

/**
 * Type guard: check if value is an integer
 *
 * @param value - Value to check
 * @returns True if value is an integer
 */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

/**
 * Type guard: check if value is a positive integer
 *
 * @param value - Value to check
 * @returns True if value is an integer > 0
 */
export function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

/**
 * Type guard: check if value is a non-negative integer
 *
 * @param value - Value to check
 * @returns True if value is an integer >= 0
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

// =============================================================================
// PROPERTY CHECKING GUARDS (hasX)
// =============================================================================

/**
 * Type guard: check if a record has a specific property
 *
 * This is useful for safely accessing properties on unknown objects
 * after validating they exist.
 *
 * @param value - Value to check (must be a record)
 * @param key - Property key to check for
 * @returns True if value is a record with the specified property
 *
 * @example
 * ```typescript
 * const data: unknown = { name: 'Alice', age: 30 };
 * if (hasProperty(data, 'name')) {
 *   console.log(data.name); // TypeScript knows 'name' exists
 * }
 * ```
 */
export function hasProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<string, unknown> & Record<K, unknown> {
  return isRecord(value) && key in value;
}

/**
 * Type guard: check if a record has all specified properties
 *
 * @param value - Value to check (must be a record)
 * @param keys - Array of property keys to check for
 * @returns True if value is a record with all specified properties
 *
 * @example
 * ```typescript
 * const data: unknown = { lsn: '123', timestamp: '456', op: 1 };
 * if (hasProperties(data, ['lsn', 'timestamp', 'op'])) {
 *   // TypeScript knows all properties exist
 *   console.log(data.lsn, data.timestamp, data.op);
 * }
 * ```
 */
export function hasProperties<K extends string>(
  value: unknown,
  keys: K[]
): value is Record<string, unknown> & Record<K, unknown> {
  return isRecord(value) && keys.every(key => key in value);
}

/**
 * Type guard: check if a record has a property with a specific type
 *
 * @param value - Value to check
 * @param key - Property key to check for
 * @param guard - Type guard to apply to the property value
 * @returns True if value has the property and it passes the guard
 *
 * @example
 * ```typescript
 * const data: unknown = { count: 42 };
 * if (hasTypedProperty(data, 'count', isNumber)) {
 *   // data.count is typed as number
 *   console.log(data.count * 2);
 * }
 * ```
 */
export function hasTypedProperty<K extends string, T>(
  value: unknown,
  key: K,
  guard: (item: unknown) => item is T
): value is Record<string, unknown> & Record<K, T> {
  return hasProperty(value, key) && guard(value[key]);
}

/**
 * Type guard: check if a record has a string property
 *
 * @param value - Value to check
 * @param key - Property key to check for
 * @returns True if value has a string property with the given key
 */
export function hasStringProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<string, unknown> & Record<K, string> {
  return hasTypedProperty(value, key, isString);
}

/**
 * Type guard: check if a record has a number property
 *
 * @param value - Value to check
 * @param key - Property key to check for
 * @returns True if value has a number property with the given key
 */
export function hasNumberProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<string, unknown> & Record<K, number> {
  return hasTypedProperty(value, key, isNumber);
}

/**
 * Type guard: check if a record has a boolean property
 *
 * @param value - Value to check
 * @param key - Property key to check for
 * @returns True if value has a boolean property with the given key
 */
export function hasBooleanProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<string, unknown> & Record<K, boolean> {
  return hasTypedProperty(value, key, isBoolean);
}

/**
 * Type guard: check if a record has an array property
 *
 * @param value - Value to check
 * @param key - Property key to check for
 * @returns True if value has an array property with the given key
 */
export function hasArrayProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<string, unknown> & Record<K, unknown[]> {
  return hasTypedProperty(value, key, isArray);
}

// =============================================================================
// ASSERTION GUARDS (assertX)
// =============================================================================

/**
 * Assertion helper: assert value is a string or throw
 *
 * @param value - Value to assert
 * @param message - Optional error message
 * @throws TypeError if value is not a string
 */
export function assertString(value: unknown, message?: string): asserts value is string {
  if (!isString(value)) {
    throw new TypeError(message ?? `Expected string, got ${typeof value}`);
  }
}

/**
 * Assertion helper: assert value is a number or throw
 *
 * @param value - Value to assert
 * @param message - Optional error message
 * @throws TypeError if value is not a number
 */
export function assertNumber(value: unknown, message?: string): asserts value is number {
  if (!isNumber(value)) {
    throw new TypeError(message ?? `Expected number, got ${typeof value}`);
  }
}

/**
 * Assertion helper: assert value is a boolean or throw
 *
 * @param value - Value to assert
 * @param message - Optional error message
 * @throws TypeError if value is not a boolean
 */
export function assertBoolean(value: unknown, message?: string): asserts value is boolean {
  if (!isBoolean(value)) {
    throw new TypeError(message ?? `Expected boolean, got ${typeof value}`);
  }
}

/**
 * Assertion helper: assert value is an array or throw
 *
 * @param value - Value to assert
 * @param message - Optional error message
 * @throws TypeError if value is not an array
 */
export function assertArray(value: unknown, message?: string): asserts value is unknown[] {
  if (!isArray(value)) {
    throw new TypeError(message ?? `Expected array, got ${typeof value}`);
  }
}

/**
 * Assertion helper: assert value is a record or throw
 *
 * @param value - Value to assert
 * @param message - Optional error message
 * @throws TypeError if value is not a record
 */
export function assertRecord(value: unknown, message?: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(message ?? `Expected object, got ${typeof value}`);
  }
}

/**
 * Assertion helper: assert value is a [number, number] tuple or throw
 *
 * @param value - Value to assert
 * @param message - Optional error message
 * @throws TypeError if value is not a [number, number] tuple
 */
export function assertNumberTuple(
  value: unknown,
  message?: string
): asserts value is [number, number] {
  if (!isNumberTuple(value)) {
    throw new TypeError(message ?? 'Expected [number, number] tuple');
  }
}

/**
 * Assertion helper: assert value is defined (not null or undefined) or throw
 *
 * @param value - Value to assert
 * @param message - Optional error message
 * @throws TypeError if value is null or undefined
 */
export function assertDefined<T>(value: T, message?: string): asserts value is NonNullable<T> {
  if (isNullish(value)) {
    throw new TypeError(message ?? 'Expected defined value, got null or undefined');
  }
}

/**
 * Assert that a value is of type `never` at compile time.
 * Used in switch statements to ensure all cases are handled.
 *
 * @example
 * ```typescript
 * switch (value.type) {
 *   case 'a': return handleA();
 *   case 'b': return handleB();
 *   default:
 *     return assertNever(value.type, `Unhandled type: ${value.type}`);
 * }
 * ```
 *
 * If a new case is added to the union type, TypeScript will error at compile time
 * because the value won't be assignable to `never`.
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

// =============================================================================
// DOMAIN-SPECIFIC TYPE GUARDS
// =============================================================================

/**
 * Check if a string contains only ASCII characters (code points 0-127)
 * Used for fast-path string comparison optimization.
 *
 * @param value - String to check
 * @returns True if string contains only ASCII characters
 */
export function isAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 127) return false;
  }
  return true;
}

/**
 * Check if a string is a valid UUID format
 *
 * @param value - Value to check
 * @returns True if value is a string in UUID format
 */
export function isUUID(value: unknown): value is string {
  return (
    isString(value) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Check if a value is a valid JSON primitive (string, number, boolean, null)
 *
 * @param value - Value to check
 * @returns True if value is a JSON primitive
 */
export function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
  return isString(value) || isNumber(value) || isBoolean(value) || value === null;
}

/**
 * Check if a value is valid JSON (can be serialized with JSON.stringify)
 *
 * @param value - Value to check
 * @returns True if value is valid JSON
 */
export function isJsonValue(value: unknown): boolean {
  if (isJsonPrimitive(value)) return true;
  if (isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

// =============================================================================
// EVODB DOMAIN-SPECIFIC TYPE GUARDS
// =============================================================================

/**
 * BlockId format regex: prefix:timestamp(base36):seq(base36)
 * @internal
 */
const BLOCK_ID_REGEX = /^[a-z0-9_-]+:[0-9a-z]+:[0-9a-z]+$/i;

/**
 * UUID format regex for TableId
 * @internal
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Type guard: check if value is a valid BlockId format (type narrowing version).
 *
 * Unlike `isValidBlockId` which only returns boolean, this guard narrows
 * the type to `string` with BlockId branding implied.
 *
 * @param value - Value to check
 * @returns True if value is a string in BlockId format
 *
 * @example
 * ```typescript
 * const id: unknown = 'table:abc123:001';
 * if (isBlockId(id)) {
 *   // id is now typed as string, safe to use as BlockId
 *   console.log(id);
 * }
 * ```
 */
export function isBlockId(value: unknown): value is string {
  return isString(value) && BLOCK_ID_REGEX.test(value);
}

/**
 * Type guard: check if value is a valid TableId (UUID) format (type narrowing version).
 *
 * Unlike `isValidTableId` which only returns boolean, this guard narrows
 * the type to `string` with TableId branding implied.
 *
 * @param value - Value to check
 * @returns True if value is a string in UUID format
 *
 * @example
 * ```typescript
 * const id: unknown = '550e8400-e29b-41d4-a716-446655440000';
 * if (isTableId(id)) {
 *   // id is now typed as string, safe to use as TableId
 *   console.log(id);
 * }
 * ```
 */
export function isTableId(value: unknown): value is string {
  return isString(value) && UUID_REGEX.test(value);
}

/**
 * Type guard: check if value is a valid Column interface.
 *
 * Validates that an object conforms to the Column interface structure
 * used in EvoDB's columnar storage.
 *
 * @param value - Value to check
 * @returns True if value conforms to Column interface
 *
 * @example
 * ```typescript
 * const data: unknown = fetchColumnData();
 * if (isColumn(data)) {
 *   // TypeScript knows data is Column
 *   console.log(data.path, data.type);
 * }
 * ```
 */
export function isColumn(value: unknown): value is {
  path: string;
  type: number;
  nullable: boolean;
  values: unknown[];
  nulls: unknown;
} {
  return (
    isRecord(value) &&
    isString(value.path) &&
    isNumber(value.type) &&
    isBoolean(value.nullable) &&
    isArray(value.values) &&
    // nulls can be boolean[] or SparseNullSet (object with isNull method)
    (isArray(value.nulls) ||
      (isRecord(value.nulls) && isFunction(value.nulls.isNull)))
  );
}

/**
 * Type guard: check if value is a valid EncodedColumn interface.
 *
 * Validates that an object conforms to the EncodedColumn interface structure
 * used after column encoding.
 *
 * @param value - Value to check
 * @returns True if value conforms to EncodedColumn interface
 */
export function isEncodedColumn(value: unknown): value is {
  path: string;
  type: number;
  encoding: number;
  data: Uint8Array;
  nullBitmap: Uint8Array;
  stats: Record<string, unknown>;
} {
  return (
    isRecord(value) &&
    isString(value.path) &&
    isNumber(value.type) &&
    isNumber(value.encoding) &&
    isUint8Array(value.data) &&
    isUint8Array(value.nullBitmap) &&
    isRecord(value.stats)
  );
}

/**
 * Type guard: check if value is a valid SchemaColumn interface.
 *
 * @param value - Value to check
 * @returns True if value conforms to SchemaColumn interface
 */
export function isSchemaColumn(value: unknown): value is {
  path: string;
  type: number;
  nullable: boolean;
  defaultValue?: unknown;
} {
  return (
    isRecord(value) &&
    isString(value.path) &&
    isNumber(value.type) &&
    isBoolean(value.nullable)
    // defaultValue is optional
  );
}

/**
 * Type guard: check if value is a valid Schema interface.
 *
 * Validates that an object conforms to the Schema interface structure
 * used for table schema definitions.
 *
 * @param value - Value to check
 * @returns True if value conforms to Schema interface
 *
 * @example
 * ```typescript
 * const data: unknown = JSON.parse(schemaJson);
 * if (isSchema(data)) {
 *   // TypeScript knows data is Schema
 *   console.log(`Schema v${data.version} with ${data.columns.length} columns`);
 * }
 * ```
 */
export function isSchema(value: unknown): value is {
  id: number;
  version: number;
  parentVersion?: number;
  columns: Array<{
    path: string;
    type: number;
    nullable: boolean;
    defaultValue?: unknown;
  }>;
} {
  return (
    isRecord(value) &&
    isNumber(value.id) &&
    isNumber(value.version) &&
    (value.parentVersion === undefined || isNumber(value.parentVersion)) &&
    isArrayOf(value.columns, isSchemaColumn)
  );
}

/**
 * Type guard: check if value is a valid ColumnStats interface.
 *
 * @param value - Value to check
 * @returns True if value conforms to ColumnStats interface
 */
export function isColumnStats(value: unknown): value is {
  min: unknown;
  max: unknown;
  nullCount: number;
  distinctEst: number;
} {
  return (
    isRecord(value) &&
    'min' in value &&
    'max' in value &&
    isNumber(value.nullCount) &&
    isNumber(value.distinctEst)
  );
}

/**
 * Type guard: check if value is a valid WalEntry interface.
 *
 * @param value - Value to check
 * @returns True if value conforms to WalEntry interface
 */
export function isWalEntry(value: unknown): value is {
  lsn: bigint;
  timestamp: bigint;
  op: number;
  flags: number;
  data: Uint8Array;
  checksum: number;
} {
  return (
    isRecord(value) &&
    isBigInt(value.lsn) &&
    isBigInt(value.timestamp) &&
    isNumber(value.op) &&
    isNumber(value.flags) &&
    isUint8Array(value.data) &&
    isNumber(value.checksum)
  );
}

/**
 * Type guard: check if value is a valid BlockHeader interface.
 *
 * @param value - Value to check
 * @returns True if value conforms to BlockHeader interface
 */
export function isBlockHeader(value: unknown): value is {
  magic: number;
  version: number;
  schemaId: number;
  rowCount: number;
  columnCount: number;
  flags: number;
  minLsn: bigint;
  maxLsn: bigint;
  checksum: number;
} {
  return (
    isRecord(value) &&
    isNumber(value.magic) &&
    isNumber(value.version) &&
    isNumber(value.schemaId) &&
    isNumber(value.rowCount) &&
    isNumber(value.columnCount) &&
    isNumber(value.flags) &&
    isBigInt(value.minLsn) &&
    isBigInt(value.maxLsn) &&
    isNumber(value.checksum)
  );
}

/**
 * Type guard: check if value is a valid TableSchemaColumn interface.
 *
 * This is for the high-level table schema format used in manifests.
 *
 * @param value - Value to check
 * @returns True if value conforms to TableSchemaColumn interface
 */
export function isTableSchemaColumn(value: unknown): value is {
  name: string;
  type: unknown; // TableColumnType can be string or complex object
  nullable: boolean;
  defaultValue?: unknown;
  doc?: string;
} {
  return (
    isRecord(value) &&
    isString(value.name) &&
    'type' in value && // type can be string or object
    isBoolean(value.nullable)
  );
}

/**
 * Type guard: check if value is a valid TableSchema interface.
 *
 * This is for the high-level table schema format used in manifests.
 *
 * @param value - Value to check
 * @returns True if value conforms to TableSchema interface
 */
export function isTableSchema(value: unknown): value is {
  schemaId: number;
  version: number;
  columns: Array<{
    name: string;
    type: unknown;
    nullable: boolean;
    defaultValue?: unknown;
    doc?: string;
  }>;
  createdAt: number;
} {
  return (
    isRecord(value) &&
    isNumber(value.schemaId) &&
    isNumber(value.version) &&
    isArrayOf(value.columns, isTableSchemaColumn) &&
    isNumber(value.createdAt)
  );
}

/**
 * Type guard: check if value is a valid RpcWalEntry interface.
 *
 * This is for the RPC communication format between DOs.
 *
 * @param value - Value to check
 * @returns True if value conforms to RpcWalEntry interface
 */
export function isRpcWalEntry(value: unknown): value is {
  sequence: number;
  timestamp: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  rowId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
} {
  return (
    isRecord(value) &&
    isNumber(value.sequence) &&
    isNumber(value.timestamp) &&
    isString(value.operation) &&
    (value.operation === 'INSERT' ||
      value.operation === 'UPDATE' ||
      value.operation === 'DELETE') &&
    isString(value.table) &&
    isString(value.rowId)
  );
}

// =============================================================================
// TYPE GUARDS FOR UNSAFE CAST REPLACEMENT (evodb-u602)
// =============================================================================

/**
 * Type guard: check if value is a valid TableManifest structure.
 *
 * This replaces the unsafe pattern:
 *   const manifest = parsed as unknown as TableManifest;
 *
 * With a safe runtime check:
 *   if (isTableManifest(parsed)) {
 *     // parsed is now typed as TableManifest
 *   }
 *
 * @param value - Value to check
 * @returns True if value conforms to TableManifest interface
 *
 * @example
 * ```typescript
 * const parsed: unknown = JSON.parse(manifestJson);
 * if (isTableManifest(parsed)) {
 *   // TypeScript knows parsed is TableManifest
 *   console.log(`Table: ${parsed.tableId}`);
 * }
 * ```
 */
export function isTableManifest(value: unknown): value is {
  schemaVersion: number;
  formatVersion: 1;
  tableId: string;
  location: string;
  currentSchemaId: number;
  schemas: unknown[];
  partitionSpec: Record<string, unknown>;
  currentSnapshotId: string | null;
  snapshots: unknown[];
  stats: Record<string, unknown>;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
} {
  if (!isRecord(value)) return false;

  // Check required number fields
  if (!isNumber(value.schemaVersion)) return false;
  if (value.formatVersion !== 1) return false;
  if (!isNumber(value.currentSchemaId)) return false;
  if (!isNumber(value.createdAt)) return false;
  if (!isNumber(value.updatedAt)) return false;

  // Check required string fields
  if (!isString(value.tableId)) return false;
  if (!isString(value.location)) return false;

  // Check array fields
  if (!isArray(value.schemas)) return false;
  if (!isArray(value.snapshots)) return false;

  // Check currentSnapshotId (string | null)
  if (value.currentSnapshotId !== null && !isString(value.currentSnapshotId)) return false;

  // Check nested objects
  if (!isRecord(value.partitionSpec)) return false;
  if (!isRecord(value.stats)) return false;
  if (!isRecord(value.properties)) return false;

  return true;
}

/**
 * Type guard: check if value has a valid $in filter array.
 *
 * This replaces the unsafe pattern:
 *   if ('$in' in filter && !((filter.$in as unknown[]).includes(docValue)))
 *
 * With a safe runtime check:
 *   if (hasInFilter(filter)) {
 *     filter.$in.includes(docValue) // safely typed as unknown[]
 *   }
 *
 * @param value - Value to check
 * @returns True if value has $in property that is an array
 *
 * @example
 * ```typescript
 * const filter: unknown = { $in: ['active', 'pending'] };
 * if (hasInFilter(filter)) {
 *   // filter.$in is now typed as unknown[]
 *   const matches = filter.$in.includes(docValue);
 * }
 * ```
 */
export function hasInFilter(value: unknown): value is Record<string, unknown> & { $in: unknown[] } {
  return (
    isRecord(value) &&
    hasProperty(value, '$in') &&
    isArray(value.$in)
  );
}

/**
 * Type guard: check if value is a valid SnapshotRef structure.
 *
 * @param value - Value to check
 * @returns True if value conforms to SnapshotRef interface
 *
 * @example
 * ```typescript
 * const ref: unknown = manifest.snapshots[0];
 * if (isSnapshotRef(ref)) {
 *   console.log(`Snapshot: ${ref.snapshotId}`);
 * }
 * ```
 */
export function isSnapshotRef(value: unknown): value is {
  snapshotId: string;
  timestamp: number;
  parentSnapshotId: string | null;
} {
  return (
    isRecord(value) &&
    isString(value.snapshotId) &&
    isNumber(value.timestamp) &&
    (value.parentSnapshotId === null || isString(value.parentSnapshotId))
  );
}

/**
 * Type guard: check if value is a valid SchemaRef structure.
 *
 * @param value - Value to check
 * @returns True if value conforms to SchemaRef interface
 */
export function isSchemaRef(value: unknown): value is {
  schemaId: number;
  path: string;
} {
  return (
    isRecord(value) &&
    isNumber(value.schemaId) &&
    isString(value.path)
  );
}

/**
 * Internal metric structure type for accessing internal values.
 * Used to safely check for internal metric implementation details.
 */
interface InternalMetricLike {
  _values?: Map<string, number>;
}

/**
 * Type guard: check if value has internal metric structure with _values Map.
 *
 * This replaces the unsafe pattern:
 *   const internalMetric = metric as unknown as InternalMetric;
 *   if (internalMetric._values) { ... }
 *
 * With a safe runtime check that properly validates the internal structure.
 *
 * @param value - Value to check
 * @returns True if value has valid internal metric structure
 *
 * @example
 * ```typescript
 * if (isInternalMetric(metric) && metric._values) {
 *   return metric._values; // safely typed as Map<string, number>
 * }
 * ```
 */
export function isInternalMetric(value: unknown): value is InternalMetricLike {
  if (!isRecord(value)) return false;
  // _values is optional, but if present must be a Map
  if (value._values !== undefined && !(value._values instanceof Map)) {
    return false;
  }
  return true;
}

/**
 * Internal histogram data structure.
 */
interface InternalHistogramData {
  count: number;
  sum: number;
  buckets: number[];
}

/**
 * Internal histogram structure type for accessing internal data.
 */
interface InternalHistogramLike {
  _data?: Map<string, InternalHistogramData>;
}

/**
 * Type guard: check if value is a valid internal histogram data structure.
 *
 * @param value - Value to check
 * @returns True if value conforms to InternalHistogramData
 */
export function isHistogramData(value: unknown): value is InternalHistogramData {
  return (
    isRecord(value) &&
    isNumber(value.count) &&
    isNumber(value.sum) &&
    isArray(value.buckets)
  );
}

/**
 * Type guard: check if value has internal histogram structure with _data Map.
 *
 * This replaces the unsafe pattern:
 *   const internalHistogram = histogram as unknown as InternalHistogram;
 *   if (internalHistogram._data) { ... }
 *
 * With a safe runtime check.
 *
 * @param value - Value to check
 * @returns True if value has valid internal histogram structure
 */
export function isInternalHistogram(value: unknown): value is InternalHistogramLike {
  if (!isRecord(value)) return false;
  // _data is optional, but if present must be a Map
  if (value._data !== undefined && !(value._data instanceof Map)) {
    return false;
  }
  return true;
}
