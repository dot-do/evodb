/**
 * Type Guards for EvoDB
 *
 * This file re-exports from the centralized type-guards module for backward
 * compatibility. New code should import directly from '@evodb/core' or
 * '@evodb/core/guards'.
 *
 * @deprecated Import from '@evodb/core' or '@evodb/core/guards' instead
 * @see type-guards.ts for the canonical implementation
 *
 * @example
 * ```typescript
 * // Preferred: import from core
 * import { isArray, isRecord, assertString } from '@evodb/core';
 *
 * // Alternative: import from guards submodule
 * import { isArray, isRecord, assertString } from '@evodb/core/guards';
 * ```
 */

// Re-export everything from the centralized type-guards module
export {
  // Primitive type guards
  isString,
  isNumber,
  isNumberIncludingNaN,
  isBoolean,
  isBigInt,
  isFunction,
  isSymbol,

  // Nullish type guards
  isNull,
  isUndefined,
  isNullish,
  isNotNullish,

  // Object type guards
  isArray,
  isRecord,
  isPlainObject,
  isDate,
  isValidDate,
  isUint8Array,
  isArrayBuffer,
  isError,
  isPromise,
  isRegExp,
  isMap,
  isSet,

  // Compound type guards
  isNumberTuple,
  isArrayOf,
  isNonEmptyString,
  isFiniteNumber,
  isPositiveNumber,
  isNonNegativeNumber,
  isInteger,
  isPositiveInteger,
  isNonNegativeInteger,

  // Property checking guards
  hasProperty,
  hasProperties,
  hasTypedProperty,
  hasStringProperty,
  hasNumberProperty,
  hasBooleanProperty,
  hasArrayProperty,

  // Assertion guards
  assertString,
  assertNumber,
  assertBoolean,
  assertArray,
  assertRecord,
  assertNumberTuple,
  assertDefined,
  // Note: assertNever is exported from types.ts to avoid duplicate exports

  // Domain-specific guards (general)
  isAscii,
  isUUID,
  isJsonPrimitive,
  isJsonValue,

  // EvoDB domain-specific guards (type narrowing versions)
  isBlockId,
  isTableId,

  // EvoDB interface guards
  isColumn,
  isEncodedColumn,
  isSchemaColumn,
  isSchema,
  isColumnStats,
  isWalEntry,
  isBlockHeader,
  isTableSchemaColumn,
  isTableSchema,
  isRpcWalEntry,

  // Type guards for unsafe cast replacement (evodb-u602)
  isTableManifest,
  hasInFilter,
  isSnapshotRef,
  isSchemaRef,
  isInternalMetric,
  isHistogramData,
  isInternalHistogram,
} from './type-guards.js';
