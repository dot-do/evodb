/**
 * Tests for Result<T, E> functional error handling pattern
 *
 * Issue: evodb-nkp8 - Evaluate and implement Result<T, E> pattern
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  tryCatch,
  tryCatchAsync,
  all,
  any,
  fromPromise,
  fromNullable,
  toPromise,
  mapAsync,
  flatMapAsync,
  type Result,
} from '../result.js';

// =============================================================================
// Basic Construction Tests
// =============================================================================

describe('ok() constructor', () => {
  it('should create an Ok result with the given value', () => {
    const result = ok(42);
    expect(result._tag).toBe('Ok');
    expect(result.value).toBe(42);
  });

  it('should create Ok with undefined value', () => {
    const result = ok(undefined);
    expect(result._tag).toBe('Ok');
    expect(result.value).toBeUndefined();
  });

  it('should create Ok with null value', () => {
    const result = ok(null);
    expect(result._tag).toBe('Ok');
    expect(result.value).toBeNull();
  });

  it('should create Ok with complex objects', () => {
    const obj = { name: 'test', nested: { value: [1, 2, 3] } };
    const result = ok(obj);
    expect(result.value).toEqual(obj);
  });
});

describe('err() constructor', () => {
  it('should create an Err result with the given error', () => {
    const result = err('something went wrong');
    expect(result._tag).toBe('Err');
    expect(result.error).toBe('something went wrong');
  });

  it('should create Err with Error objects', () => {
    const error = new Error('Test error');
    const result = err(error);
    expect(result.error).toBe(error);
  });

  it('should create Err with complex error objects', () => {
    const errorObj = { code: 'VALIDATION', details: ['field1', 'field2'] };
    const result = err(errorObj);
    expect(result.error).toEqual(errorObj);
  });
});

// =============================================================================
// Type Guard Tests
// =============================================================================

describe('isOk() type guard', () => {
  it('should return true for Ok results', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
  });

  it('should return false for Err results', () => {
    const result = err('error');
    expect(isOk(result)).toBe(false);
  });

  it('should narrow the type in conditionals', () => {
    const result: Result<number, string> = ok(42);
    if (isOk(result)) {
      // TypeScript should know result.value is number here
      const value: number = result.value;
      expect(value).toBe(42);
    }
  });
});

describe('isErr() type guard', () => {
  it('should return true for Err results', () => {
    const result = err('error');
    expect(isErr(result)).toBe(true);
  });

  it('should return false for Ok results', () => {
    const result = ok(42);
    expect(isErr(result)).toBe(false);
  });

  it('should narrow the type in conditionals', () => {
    const result: Result<number, string> = err('failed');
    if (isErr(result)) {
      // TypeScript should know result.error is string here
      const error: string = result.error;
      expect(error).toBe('failed');
    }
  });
});

// =============================================================================
// Instance Method Tests - isOk/isErr
// =============================================================================

describe('Result.isOk() method', () => {
  it('should return true for Ok', () => {
    expect(ok(42).isOk()).toBe(true);
  });

  it('should return false for Err', () => {
    expect(err('error').isOk()).toBe(false);
  });
});

describe('Result.isErr() method', () => {
  it('should return true for Err', () => {
    expect(err('error').isErr()).toBe(true);
  });

  it('should return false for Ok', () => {
    expect(ok(42).isErr()).toBe(false);
  });
});

// =============================================================================
// map() Tests
// =============================================================================

describe('Result.map()', () => {
  it('should transform Ok value', () => {
    const result = ok(5).map(x => x * 2);
    expect(result.value).toBe(10);
  });

  it('should not transform Err', () => {
    const result = err('error').map(x => x * 2);
    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('error');
  });

  it('should allow type transformation', () => {
    const result = ok(42).map(x => x.toString());
    expect(result.value).toBe('42');
  });

  it('should chain multiple maps', () => {
    const result = ok(2)
      .map(x => x + 3)
      .map(x => x * 2)
      .map(x => `Result: ${x}`);
    expect(result.value).toBe('Result: 10');
  });
});

// =============================================================================
// flatMap() Tests
// =============================================================================

describe('Result.flatMap()', () => {
  it('should flatten nested Ok results', () => {
    const result = ok(5).flatMap(x => ok(x * 2));
    expect(result.value).toBe(10);
  });

  it('should propagate Err from inner function', () => {
    const result = ok(5).flatMap(x => err(`Failed at ${x}`));
    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('Failed at 5');
  });

  it('should not call function for Err', () => {
    const fn = vi.fn();
    const result = err('initial error').flatMap(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(result.error).toBe('initial error');
  });

  it('should chain multiple flatMaps', () => {
    const safeDivide = (a: number, b: number): Result<number, string> =>
      b === 0 ? err('division by zero') : ok(a / b);

    const result = ok(100)
      .flatMap(x => safeDivide(x, 2))
      .flatMap(x => safeDivide(x, 5));
    expect(result.value).toBe(10);
  });

  it('should short-circuit on first error', () => {
    const safeDivide = (a: number, b: number): Result<number, string> =>
      b === 0 ? err('division by zero') : ok(a / b);

    const result = ok(100)
      .flatMap(x => safeDivide(x, 0))
      .flatMap(x => safeDivide(x, 5));
    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('division by zero');
  });
});

// =============================================================================
// mapErr() Tests
// =============================================================================

describe('Result.mapErr()', () => {
  it('should transform Err error', () => {
    const result = err('error').mapErr(e => `Wrapped: ${e}`);
    expect(result.error).toBe('Wrapped: error');
  });

  it('should not transform Ok', () => {
    const result = ok(42).mapErr(e => `Wrapped: ${e}`);
    expect(isOk(result)).toBe(true);
    expect(result.value).toBe(42);
  });

  it('should allow error type transformation', () => {
    const result = err('string error').mapErr(e => new Error(e));
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('string error');
  });
});

// =============================================================================
// unwrap() Tests
// =============================================================================

describe('Result.unwrap()', () => {
  it('should return value for Ok', () => {
    expect(ok(42).unwrap()).toBe(42);
  });

  it('should throw for Err with string error', () => {
    expect(() => err('failure').unwrap()).toThrow('failure');
  });

  it('should throw original Error for Err with Error object', () => {
    const error = new Error('Test error');
    expect(() => err(error).unwrap()).toThrow(error);
  });
});

// =============================================================================
// unwrapOr() Tests
// =============================================================================

describe('Result.unwrapOr()', () => {
  it('should return value for Ok', () => {
    expect(ok(42).unwrapOr(0)).toBe(42);
  });

  it('should return default for Err', () => {
    expect(err('error').unwrapOr(0)).toBe(0);
  });

  it('should work with complex default values', () => {
    const defaultObj = { default: true };
    const result = err('error').unwrapOr(defaultObj);
    expect(result).toBe(defaultObj);
  });
});

// =============================================================================
// unwrapOrElse() Tests
// =============================================================================

describe('Result.unwrapOrElse()', () => {
  it('should return value for Ok without calling fn', () => {
    const fn = vi.fn(() => 0);
    const result = ok(42).unwrapOrElse(fn);
    expect(result).toBe(42);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should call fn and return result for Err', () => {
    const fn = vi.fn(() => 0);
    const result = err('error').unwrapOrElse(fn);
    expect(result).toBe(0);
    expect(fn).toHaveBeenCalled();
  });
});

// =============================================================================
// unwrapErr() Tests
// =============================================================================

describe('Result.unwrapErr()', () => {
  it('should return error for Err', () => {
    expect(err('error message').unwrapErr()).toBe('error message');
  });

  it('should throw for Ok', () => {
    expect(() => ok(42).unwrapErr()).toThrow('Called unwrapErr on Ok');
  });
});

// =============================================================================
// tap() and tapErr() Tests
// =============================================================================

describe('Result.tap()', () => {
  it('should call fn with value for Ok', () => {
    const fn = vi.fn();
    const result = ok(42).tap(fn);
    expect(fn).toHaveBeenCalledWith(42);
    expect(result.value).toBe(42);
  });

  it('should not call fn for Err', () => {
    const fn = vi.fn();
    const result = err('error').tap(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(result.error).toBe('error');
  });

  it('should return the same result for chaining', () => {
    const result = ok(42).tap(() => {}).tap(() => {});
    expect(result.value).toBe(42);
  });
});

describe('Result.tapErr()', () => {
  it('should call fn with error for Err', () => {
    const fn = vi.fn();
    const result = err('error').tapErr(fn);
    expect(fn).toHaveBeenCalledWith('error');
    expect(result.error).toBe('error');
  });

  it('should not call fn for Ok', () => {
    const fn = vi.fn();
    const result = ok(42).tapErr(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(result.value).toBe(42);
  });
});

// =============================================================================
// match() Tests
// =============================================================================

describe('Result.match()', () => {
  it('should call ok handler for Ok', () => {
    const result = ok(42).match({
      ok: v => `Value: ${v}`,
      err: e => `Error: ${e}`,
    });
    expect(result).toBe('Value: 42');
  });

  it('should call err handler for Err', () => {
    const result = err('failure').match({
      ok: v => `Value: ${v}`,
      err: e => `Error: ${e}`,
    });
    expect(result).toBe('Error: failure');
  });

  it('should work with different return types', () => {
    const formatResult = (r: Result<number, string>): string =>
      r.match({
        ok: v => `Success: ${v}`,
        err: e => `Failed: ${e}`,
      });

    expect(formatResult(ok(42))).toBe('Success: 42');
    expect(formatResult(err('oops'))).toBe('Failed: oops');
  });
});

// =============================================================================
// toOption() Tests
// =============================================================================

describe('Result.toOption()', () => {
  it('should return value for Ok', () => {
    expect(ok(42).toOption()).toBe(42);
  });

  it('should return undefined for Err', () => {
    expect(err('error').toOption()).toBeUndefined();
  });
});

// =============================================================================
// tryCatch() Tests
// =============================================================================

describe('tryCatch()', () => {
  it('should wrap successful function in Ok', () => {
    const safeJson = tryCatch(JSON.parse);
    const result = safeJson('{"name": "test"}');
    expect(isOk(result)).toBe(true);
    expect(result.unwrap()).toEqual({ name: 'test' });
  });

  it('should wrap throwing function in Err', () => {
    const safeJson = tryCatch(JSON.parse);
    const result = safeJson('invalid json');
    expect(isErr(result)).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('should convert non-Error throws to Error', () => {
    const throwString = tryCatch(() => {
      throw 'string error';
    });
    const result = throwString();
    expect(isErr(result)).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('string error');
  });
});

// =============================================================================
// tryCatchAsync() Tests
// =============================================================================

describe('tryCatchAsync()', () => {
  it('should wrap successful async function in Ok', async () => {
    const asyncFn = tryCatchAsync(async () => 'success');
    const result = await asyncFn();
    expect(isOk(result)).toBe(true);
    expect(result.unwrap()).toBe('success');
  });

  it('should wrap rejecting async function in Err', async () => {
    const asyncFn = tryCatchAsync(async () => {
      throw new Error('async error');
    });
    const result = await asyncFn();
    expect(isErr(result)).toBe(true);
    expect(result.error.message).toBe('async error');
  });

  it('should pass arguments through', async () => {
    const asyncAdd = tryCatchAsync(async (a: number, b: number) => a + b);
    const result = await asyncAdd(5, 3);
    expect(result.unwrap()).toBe(8);
  });
});

// =============================================================================
// all() Tests
// =============================================================================

describe('all()', () => {
  it('should combine multiple Ok results', () => {
    const results = [ok(1), ok(2), ok(3)];
    const combined = all(results);
    expect(isOk(combined)).toBe(true);
    expect(combined.unwrap()).toEqual([1, 2, 3]);
  });

  it('should return first Err when any fails', () => {
    const results = [ok(1), err('first error'), ok(3), err('second error')];
    const combined = all(results);
    expect(isErr(combined)).toBe(true);
    expect(combined.error).toBe('first error');
  });

  it('should return empty array for empty input', () => {
    const combined = all([]);
    expect(combined.unwrap()).toEqual([]);
  });

  it('should preserve types', () => {
    const results: Result<number, string>[] = [ok(1), ok(2)];
    const combined: Result<number[], string> = all(results);
    expect(combined.unwrap()).toEqual([1, 2]);
  });
});

// =============================================================================
// any() Tests
// =============================================================================

describe('any()', () => {
  it('should return first Ok', () => {
    const results = [err('first'), ok(42), err('third')];
    const first = any(results);
    expect(isOk(first)).toBe(true);
    expect(first.unwrap()).toBe(42);
  });

  it('should return all errors when all fail', () => {
    const results = [err('a'), err('b'), err('c')];
    const combined = any(results);
    expect(isErr(combined)).toBe(true);
    expect(combined.error).toEqual(['a', 'b', 'c']);
  });

  it('should return empty errors array for empty input', () => {
    const combined = any<number, string>([]);
    expect(isErr(combined)).toBe(true);
    expect(combined.error).toEqual([]);
  });
});

// =============================================================================
// fromPromise() Tests
// =============================================================================

describe('fromPromise()', () => {
  it('should convert resolved promise to Ok', async () => {
    const result = await fromPromise(Promise.resolve(42));
    expect(isOk(result)).toBe(true);
    expect(result.unwrap()).toBe(42);
  });

  it('should convert rejected promise to Err', async () => {
    const result = await fromPromise(Promise.reject(new Error('rejected')));
    expect(isErr(result)).toBe(true);
    expect(result.error.message).toBe('rejected');
  });

  it('should wrap non-Error rejections', async () => {
    const result = await fromPromise(Promise.reject('string rejection'));
    expect(isErr(result)).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('string rejection');
  });
});

// =============================================================================
// fromNullable() Tests
// =============================================================================

describe('fromNullable()', () => {
  it('should return Ok for non-null values', () => {
    const result = fromNullable(42, 'was null');
    expect(isOk(result)).toBe(true);
    expect(result.unwrap()).toBe(42);
  });

  it('should return Ok for falsy but non-null values', () => {
    expect(isOk(fromNullable(0, 'error'))).toBe(true);
    expect(isOk(fromNullable('', 'error'))).toBe(true);
    expect(isOk(fromNullable(false, 'error'))).toBe(true);
  });

  it('should return Err for null', () => {
    const result = fromNullable(null, 'was null');
    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('was null');
  });

  it('should return Err for undefined', () => {
    const result = fromNullable(undefined, 'was undefined');
    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('was undefined');
  });
});

// =============================================================================
// toPromise() Tests
// =============================================================================

describe('toPromise()', () => {
  it('should resolve for Ok', async () => {
    const value = await toPromise(ok(42));
    expect(value).toBe(42);
  });

  it('should reject for Err', async () => {
    await expect(toPromise(err('error'))).rejects.toBe('error');
  });

  it('should reject with Error for Err containing Error', async () => {
    const error = new Error('test');
    await expect(toPromise(err(error))).rejects.toThrow('test');
  });
});

// =============================================================================
// mapAsync() Tests
// =============================================================================

describe('mapAsync()', () => {
  it('should map over Ok value', async () => {
    const asyncResult = Promise.resolve(ok(42));
    const result = await mapAsync(asyncResult, x => x * 2);
    expect(result.unwrap()).toBe(84);
  });

  it('should pass through Err', async () => {
    const asyncResult = Promise.resolve(err('error'));
    const result = await mapAsync(asyncResult, x => x * 2);
    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('error');
  });
});

// =============================================================================
// flatMapAsync() Tests
// =============================================================================

describe('flatMapAsync()', () => {
  it('should flatMap over Ok value with async function', async () => {
    const asyncResult = Promise.resolve(ok(42));
    const asyncFn = async (x: number) => ok(x * 2);
    const result = await flatMapAsync(asyncResult, asyncFn);
    expect(result.unwrap()).toBe(84);
  });

  it('should propagate Err from async function', async () => {
    const asyncResult = Promise.resolve(ok(42));
    const asyncFn = async (_x: number) => err('async error');
    const result = await flatMapAsync(asyncResult, asyncFn);
    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('async error');
  });

  it('should pass through initial Err', async () => {
    const asyncResult: Promise<Result<number, string>> = Promise.resolve(err('initial'));
    const asyncFn = vi.fn(async (x: number) => ok(x * 2));
    const result = await flatMapAsync(asyncResult, asyncFn);
    expect(isErr(result)).toBe(true);
    expect(result.error).toBe('initial');
    expect(asyncFn).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Real-World Usage Examples
// =============================================================================

describe('Real-world usage patterns', () => {
  // Example: User validation
  interface User {
    name: string;
    age: number;
    email: string;
  }

  const validateName = (name: string): Result<string, string> =>
    name.length > 0 ? ok(name) : err('Name is required');

  const validateAge = (age: number): Result<number, string> =>
    age >= 0 && age <= 150 ? ok(age) : err('Age must be between 0 and 150');

  const validateEmail = (email: string): Result<string, string> =>
    email.includes('@') ? ok(email) : err('Invalid email format');

  it('should chain validations with flatMap', () => {
    const createUser = (name: string, age: number, email: string): Result<User, string> =>
      validateName(name).flatMap(validName =>
        validateAge(age).flatMap(validAge =>
          validateEmail(email).map(validEmail => ({
            name: validName,
            age: validAge,
            email: validEmail,
          }))
        )
      );

    const validUser = createUser('John', 30, 'john@example.com');
    expect(isOk(validUser)).toBe(true);
    expect(validUser.unwrap()).toEqual({
      name: 'John',
      age: 30,
      email: 'john@example.com',
    });

    const invalidUser = createUser('', 30, 'john@example.com');
    expect(isErr(invalidUser)).toBe(true);
    expect(invalidUser.error).toBe('Name is required');
  });

  it('should use all() for parallel validations', () => {
    const validateUser = (name: string, age: number, email: string): Result<User, string[]> => {
      const results = all([validateName(name), validateAge(age), validateEmail(email)]);
      return results.map(([n, a, e]) => ({ name: n, age: a, email: e }));
    };

    // Note: This returns first error only, not all errors
    const invalid = validateUser('', -5, 'invalid');
    expect(isErr(invalid)).toBe(true);
  });

  // Example: Config parsing
  it('should parse config with error handling', () => {
    const safeParseJson = tryCatch((s: string) => JSON.parse(s));

    const parseConfig = (json: string): Result<{ port: number }, string> => {
      return safeParseJson(json)
        .mapErr(e => `JSON parse error: ${e.message}`)
        .flatMap(data => {
          if (typeof data.port !== 'number') {
            return err('port must be a number');
          }
          return ok({ port: data.port });
        });
    };

    const validConfig = parseConfig('{"port": 3000}');
    expect(validConfig.unwrap()).toEqual({ port: 3000 });

    const invalidJson = parseConfig('not json');
    expect(isErr(invalidJson)).toBe(true);
    expect(invalidJson.error).toContain('JSON parse error');

    const missingPort = parseConfig('{}');
    expect(isErr(missingPort)).toBe(true);
    expect(missingPort.error).toBe('port must be a number');
  });

  // Example: Resource acquisition
  it('should handle resource acquisition patterns', async () => {
    const acquireResource = async (id: string): Promise<Result<string, string>> => {
      if (id === 'valid') {
        return ok(`Resource ${id}`);
      }
      return err(`Resource ${id} not found`);
    };

    const result = await flatMapAsync(
      acquireResource('valid'),
      async resource => ok(`Processed: ${resource}`)
    );

    expect(result.unwrap()).toBe('Processed: Resource valid');
  });
});
