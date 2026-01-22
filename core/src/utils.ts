/**
 * @evodb/core - Utility Functions
 *
 * Common utility functions for type safety, exhaustiveness checking,
 * and runtime validation.
 *
 * @module utils
 */

// =============================================================================
// Exhaustiveness Checking
// =============================================================================

/**
 * Assert that a value is of type `never` at compile time.
 * Used in switch statements to ensure all cases of a discriminated union are handled.
 *
 * When all cases are handled in a switch statement, TypeScript narrows the type
 * in the default case to `never`. This function accepts only `never`, so if you
 * add a new case to the union but forget to handle it, TypeScript will error.
 *
 * @param value - The value that should be of type `never`
 * @param message - Optional custom error message for runtime errors
 * @returns Never returns - always throws
 * @throws Error with the provided message or a default message
 *
 * @example
 * ```typescript
 * import { assertNever } from '@evodb/core/utils';
 *
 * type Operation = 'read' | 'write' | 'delete';
 *
 * function handleOp(op: Operation): void {
 *   switch (op) {
 *     case 'read':
 *       console.log('Reading...');
 *       break;
 *     case 'write':
 *       console.log('Writing...');
 *       break;
 *     case 'delete':
 *       console.log('Deleting...');
 *       break;
 *     default:
 *       // TypeScript error if a case is missing
 *       assertNever(op, `Unhandled operation: ${op}`);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With discriminated unions
 * type Event =
 *   | { kind: 'insert'; data: unknown }
 *   | { kind: 'update'; id: string }
 *   | { kind: 'delete'; id: string };
 *
 * function processEvent(event: Event): void {
 *   switch (event.kind) {
 *     case 'insert':
 *       handleInsert(event.data);
 *       break;
 *     case 'update':
 *       handleUpdate(event.id);
 *       break;
 *     case 'delete':
 *       handleDelete(event.id);
 *       break;
 *     default:
 *       assertNever(event, 'Unhandled event kind');
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With enums
 * import { Type, assertNever } from '@evodb/core';
 *
 * function getTypeName(type: Type): string {
 *   switch (type) {
 *     case Type.Null: return 'null';
 *     case Type.Bool: return 'boolean';
 *     case Type.Int32: return 'int32';
 *     case Type.Int64: return 'int64';
 *     case Type.Float64: return 'float64';
 *     case Type.String: return 'string';
 *     case Type.Binary: return 'binary';
 *     case Type.Array: return 'array';
 *     case Type.Object: return 'object';
 *     case Type.Timestamp: return 'timestamp';
 *     case Type.Date: return 'date';
 *     default:
 *       return assertNever(type, `Unhandled type: ${type}`);
 *   }
 * }
 * ```
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(value)}`);
}

// =============================================================================
// Type Narrowing Helpers
// =============================================================================

/**
 * Check if a value is a non-null object (not an array).
 * Useful for type narrowing in discriminated unions.
 *
 * @param value - The value to check
 * @returns True if value is a non-null, non-array object
 *
 * @example
 * ```typescript
 * function process(data: unknown) {
 *   if (isObject(data) && 'type' in data) {
 *     // data is narrowed to object with 'type' property
 *     console.log(data.type);
 *   }
 * }
 * ```
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Check if a value is a string.
 * Type guard for narrowing unknown values.
 *
 * @param value - The value to check
 * @returns True if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if a value is a number (excluding NaN).
 * Type guard for narrowing unknown values.
 *
 * @param value - The value to check
 * @returns True if value is a finite number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Check if a value is a boolean.
 * Type guard for narrowing unknown values.
 *
 * @param value - The value to check
 * @returns True if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if a value is null or undefined.
 * Type guard for narrowing unknown values.
 *
 * @param value - The value to check
 * @returns True if value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if a value is defined (not null or undefined).
 * Type guard for narrowing optional values.
 *
 * @param value - The value to check
 * @returns True if value is not null or undefined
 *
 * @example
 * ```typescript
 * const items: (string | null)[] = ['a', null, 'b'];
 * const defined = items.filter(isDefined); // string[]
 * ```
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
