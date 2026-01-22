/**
 * @evodb/core/guards - Type guards
 *
 * This submodule exports runtime type validation functions that narrow
 * TypeScript types.
 *
 * All guards follow consistent naming conventions:
 * - `isX` - Type checking guards (narrow types at runtime)
 * - `hasX` - Property checking guards (check for properties on objects)
 * - `assertX` - Assertion guards (throw on failure, narrow types)
 *
 * @module guards
 */

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
  // Note: assertNever is exported from types.ts (via types/index.ts) to avoid duplicate exports

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
} from '../type-guards.js';
