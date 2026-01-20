/**
 * Type Guards for EvoDB
 *
 * Provides runtime type validation functions that narrow TypeScript types.
 * Use these guards before type assertions to ensure type safety.
 *
 * @example
 * ```typescript
 * import { isArray, isRecord } from './guards.js';
 *
 * function processValue(val: unknown): void {
 *   if (isArray(val)) {
 *     // TypeScript now knows val is unknown[]
 *     val.forEach(item => console.log(item));
 *   } else if (isRecord(val)) {
 *     // TypeScript now knows val is Record<string, unknown>
 *     Object.keys(val).forEach(key => console.log(key, val[key]));
 *   }
 * }
 * ```
 */

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
 * Type guard: check if value is a number
 *
 * Note: This excludes NaN by default since NaN often causes unexpected behavior.
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
 * Type guard: check if value is a Date instance
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
