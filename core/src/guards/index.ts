/**
 * @evodb/core/guards - Type guards
 *
 * This submodule exports runtime type validation functions that narrow
 * TypeScript types.
 *
 * @module guards
 */

export {
  // Core type guards
  isArray,
  isRecord,
  isNumber,
  isNumberIncludingNaN,
  isString,
  isBoolean,
  isNullish,
  isNotNullish,
  isBigInt,
  isFunction,
  isDate,
  isValidDate,
  isUint8Array,
  isArrayBuffer,
  // Assertion helpers
  assertArray,
  assertRecord,
  assertNumber,
  assertString,
} from '../guards.js';
