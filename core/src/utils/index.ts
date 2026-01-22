/**
 * @evodb/core/utils - Utility Functions
 *
 * This submodule exports common utility functions for type safety,
 * exhaustiveness checking, and runtime validation.
 *
 * @module utils
 *
 * @example
 * ```typescript
 * import { assertNever, isDefined } from '@evodb/core/utils';
 *
 * type Status = 'pending' | 'active' | 'completed';
 *
 * function handleStatus(status: Status): string {
 *   switch (status) {
 *     case 'pending': return 'Waiting...';
 *     case 'active': return 'In progress';
 *     case 'completed': return 'Done!';
 *     default:
 *       return assertNever(status, `Unknown status: ${status}`);
 *   }
 * }
 *
 * const items: (string | null)[] = ['a', null, 'b'];
 * const defined = items.filter(isDefined); // ['a', 'b']
 * ```
 */

export {
  assertNever,
  isObject,
  isString,
  isNumber,
  isBoolean,
  isNullish,
  isDefined,
} from '../utils.js';
