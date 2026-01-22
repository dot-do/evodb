/**
 * Result<T, E> - Functional Error Handling Pattern
 *
 * Issue: evodb-nkp8 - Evaluate and implement Result<T, E> pattern
 *
 * The Result type provides explicit error handling without exceptions.
 * Inspired by Rust's Result<T, E> type, this implementation offers:
 * - Compile-time error handling enforcement
 * - Chainable transformations (map, flatMap)
 * - Type-safe unwrapping with defaults
 * - Pattern matching via isOk/isErr type guards
 *
 * @module result
 *
 * @example
 * ```typescript
 * import { Result, ok, err, isOk, isErr } from '@evodb/core';
 *
 * // Function that returns a Result
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return err('Division by zero');
 *   }
 *   return ok(a / b);
 * }
 *
 * // Using the Result
 * const result = divide(10, 2);
 *
 * if (isOk(result)) {
 *   console.log(`Result: ${result.value}`);
 * } else {
 *   console.log(`Error: ${result.error}`);
 * }
 *
 * // Or chain operations
 * const doubled = divide(10, 2)
 *   .map(n => n * 2)
 *   .unwrapOr(0);
 * ```
 *
 * ## When to Use Result vs Throwing
 *
 * **Use Result<T, E> when:**
 * - Errors are expected and should be handled by the caller (e.g., validation, parsing)
 * - You want to chain operations that might fail (e.g., multiple sequential validations)
 * - The error is part of the normal control flow, not truly exceptional
 * - You want to force callers to handle the error case
 * - Working with functional programming patterns
 *
 * **Use Exceptions (throw) when:**
 * - The error is truly exceptional (e.g., out of memory, network failure)
 * - You're at an API boundary where exceptions are expected
 * - The error should propagate up the call stack
 * - Using existing EvoDB error classes (EvoDBError, QueryError, ValidationError, etc.)
 * - Interoperating with code that expects exceptions
 *
 * **Examples:**
 * ```typescript
 * // Good use of Result - validation that can fail normally
 * function parseConfig(json: string): Result<Config, ParseError> {
 *   const result = safeParseJSON(json, ConfigSchema);
 *   if (!result.success) {
 *     return err(new ParseError(result.error.message));
 *   }
 *   return ok(result.data);
 * }
 *
 * // Good use of throw - exceptional conditions
 * async function readBlock(id: string): Promise<Uint8Array> {
 *   const data = await storage.get(id);
 *   if (!data) {
 *     throw new StorageError(`Block not found: ${id}`, StorageErrorCode.NOT_FOUND);
 *   }
 *   return data;
 * }
 * ```
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Represents a successful result containing a value of type T.
 *
 * @typeParam T - The type of the success value
 */
export interface Ok<T> {
  readonly _tag: 'Ok';
  readonly value: T;
  readonly error?: never;

  /**
   * Transform the success value using a function.
   * If this is an Err, returns the Err unchanged.
   *
   * @typeParam U - The return type of the mapping function
   * @param fn - Function to transform the value
   * @returns A new Result with the transformed value
   */
  map<U>(fn: (value: T) => U): Result<U, never>;

  /**
   * Transform the success value using a function that returns a Result.
   * Useful for chaining operations that can fail.
   *
   * @typeParam U - The success type of the returned Result
   * @typeParam F - The error type of the returned Result
   * @param fn - Function that takes the value and returns a Result
   * @returns The Result returned by fn
   */
  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, F>;

  /**
   * Transform the error value using a function.
   * For Ok, this returns the Ok unchanged.
   *
   * @typeParam F - The return type of the mapping function
   * @param fn - Function to transform the error
   * @returns This Ok unchanged
   */
  mapErr<F>(fn: (error: never) => F): Result<T, F>;

  /**
   * Get the value, throwing if this is an Err.
   *
   * @returns The success value
   * @throws Error if this is an Err
   */
  unwrap(): T;

  /**
   * Get the value or a default if this is an Err.
   *
   * @param defaultValue - The value to return if this is an Err
   * @returns The success value or the default
   */
  unwrapOr(defaultValue: T): T;

  /**
   * Get the value or compute a default if this is an Err.
   *
   * @param fn - Function to compute the default value
   * @returns The success value or the computed default
   */
  unwrapOrElse(fn: () => T): T;

  /**
   * Get the error value, throwing if this is an Ok.
   *
   * @returns Never (throws)
   * @throws Error because this is an Ok
   */
  unwrapErr(): never;

  /**
   * Returns true if this is an Ok.
   */
  isOk(): this is Ok<T>;

  /**
   * Returns true if this is an Err.
   */
  isErr(): this is Err<never>;

  /**
   * Execute a function if this is Ok.
   *
   * @param fn - Function to execute with the value
   * @returns This Result unchanged
   */
  tap(fn: (value: T) => void): Result<T, never>;

  /**
   * Execute a function if this is Err.
   *
   * @param fn - Function to execute with the error
   * @returns This Result unchanged
   */
  tapErr(fn: (error: never) => void): Result<T, never>;

  /**
   * Match on the Result, executing one of two functions.
   *
   * @typeParam U - The return type
   * @param handlers - Object with ok and err handlers
   * @returns The result of the matching handler
   */
  match<U>(handlers: { ok: (value: T) => U; err: (error: never) => U }): U;

  /**
   * Convert Ok to Some, Err to None (Option pattern).
   * Note: Returns the value or undefined, useful for optional chaining.
   *
   * @returns The value or undefined
   */
  toOption(): T | undefined;
}

/**
 * Represents a failed result containing an error of type E.
 *
 * @typeParam E - The type of the error value
 */
export interface Err<E> {
  readonly _tag: 'Err';
  readonly error: E;
  readonly value?: never;

  /**
   * Transform the success value using a function.
   * For Err, this returns the Err unchanged.
   *
   * @typeParam U - The return type of the mapping function
   * @param fn - Function to transform the value
   * @returns This Err unchanged
   */
  map<U>(fn: (value: never) => U): Result<U, E>;

  /**
   * Transform the success value using a function that returns a Result.
   * For Err, this returns the Err unchanged.
   *
   * @typeParam U - The success type of the returned Result
   * @typeParam F - The error type of the returned Result
   * @param fn - Function that takes the value and returns a Result
   * @returns This Err unchanged
   */
  flatMap<U, F>(fn: (value: never) => Result<U, F>): Result<U, E | F>;

  /**
   * Transform the error value using a function.
   * If this is an Err, returns a new Err with the transformed error.
   *
   * @typeParam F - The return type of the mapping function
   * @param fn - Function to transform the error
   * @returns A new Err with the transformed error
   */
  mapErr<F>(fn: (error: E) => F): Result<never, F>;

  /**
   * Get the value, throwing if this is an Err.
   *
   * @returns Never (throws)
   * @throws The error value or an Error wrapping it
   */
  unwrap(): never;

  /**
   * Get the value or a default if this is an Err.
   *
   * @param defaultValue - The value to return
   * @returns The default value
   */
  unwrapOr<T>(defaultValue: T): T;

  /**
   * Get the value or compute a default if this is an Err.
   *
   * @param fn - Function to compute the default value
   * @returns The computed default
   */
  unwrapOrElse<T>(fn: () => T): T;

  /**
   * Get the error value.
   *
   * @returns The error value
   */
  unwrapErr(): E;

  /**
   * Returns true if this is an Ok.
   */
  isOk(): this is Ok<never>;

  /**
   * Returns true if this is an Err.
   */
  isErr(): this is Err<E>;

  /**
   * Execute a function if this is Ok.
   *
   * @param fn - Function to execute with the value
   * @returns This Result unchanged
   */
  tap(fn: (value: never) => void): Result<never, E>;

  /**
   * Execute a function if this is Err.
   *
   * @param fn - Function to execute with the error
   * @returns This Result unchanged
   */
  tapErr(fn: (error: E) => void): Result<never, E>;

  /**
   * Match on the Result, executing one of two functions.
   *
   * @typeParam U - The return type
   * @param handlers - Object with ok and err handlers
   * @returns The result of the matching handler
   */
  match<U>(handlers: { ok: (value: never) => U; err: (error: E) => U }): U;

  /**
   * Convert Ok to Some, Err to None (Option pattern).
   *
   * @returns undefined
   */
  toOption(): undefined;
}

/**
 * A Result is either Ok<T> (success) or Err<E> (failure).
 *
 * @typeParam T - The type of the success value
 * @typeParam E - The type of the error value
 *
 * @example
 * ```typescript
 * function safeDivide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return err('Cannot divide by zero');
 *   return ok(a / b);
 * }
 *
 * const result = safeDivide(10, 2);
 * console.log(result.unwrapOr(0)); // 5
 * ```
 */
export type Result<T, E> = Ok<T> | Err<E>;

// =============================================================================
// Implementation Classes
// =============================================================================

/**
 * Internal implementation of the Ok variant.
 * @internal
 */
class OkImpl<T> implements Ok<T> {
  readonly _tag = 'Ok' as const;
  readonly error?: never;

  constructor(readonly value: T) {}

  map<U>(fn: (value: T) => U): Result<U, never> {
    return new OkImpl(fn(this.value));
  }

  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, F> {
    return fn(this.value);
  }

  mapErr<F>(_fn: (error: never) => F): Result<T, F> {
    // OkImpl has no error to transform, so we return a new Ok with the same value
    // This avoids the type assertion while maintaining type safety
    return new OkImpl(this.value);
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_defaultValue: T): T {
    return this.value;
  }

  unwrapOrElse(_fn: () => T): T {
    return this.value;
  }

  unwrapErr(): never {
    throw new Error('Called unwrapErr on Ok');
  }

  isOk(): this is Ok<T> {
    return true;
  }

  isErr(): this is Err<never> {
    return false;
  }

  tap(fn: (value: T) => void): Result<T, never> {
    fn(this.value);
    return this;
  }

  tapErr(_fn: (error: never) => void): Result<T, never> {
    return this;
  }

  match<U>(handlers: { ok: (value: T) => U; err: (error: never) => U }): U {
    return handlers.ok(this.value);
  }

  toOption(): T | undefined {
    return this.value;
  }
}

/**
 * Internal implementation of the Err variant.
 * @internal
 */
class ErrImpl<E> implements Err<E> {
  readonly _tag = 'Err' as const;
  readonly value?: never;

  constructor(readonly error: E) {}

  map<U>(_fn: (value: never) => U): Result<U, E> {
    // ErrImpl has no value to transform, so we return a new Err with the same error
    // This avoids the type assertion while maintaining type safety
    return new ErrImpl(this.error);
  }

  flatMap<U, F>(_fn: (value: never) => Result<U, F>): Result<U, E | F> {
    // ErrImpl has no value to transform, so we return a new Err with the same error
    // This avoids the type assertion while maintaining type safety
    return new ErrImpl(this.error);
  }

  mapErr<F>(fn: (error: E) => F): Result<never, F> {
    return new ErrImpl(fn(this.error));
  }

  unwrap(): never {
    if (this.error instanceof Error) {
      throw this.error;
    }
    throw new Error(String(this.error));
  }

  unwrapOr<T>(defaultValue: T): T {
    return defaultValue;
  }

  unwrapOrElse<T>(fn: () => T): T {
    return fn();
  }

  unwrapErr(): E {
    return this.error;
  }

  isOk(): this is Ok<never> {
    return false;
  }

  isErr(): this is Err<E> {
    return true;
  }

  tap(_fn: (value: never) => void): Result<never, E> {
    return this;
  }

  tapErr(fn: (error: E) => void): Result<never, E> {
    fn(this.error);
    return this;
  }

  match<U>(handlers: { ok: (value: never) => U; err: (error: E) => U }): U {
    return handlers.err(this.error);
  }

  toOption(): undefined {
    return undefined;
  }
}

// =============================================================================
// Constructor Functions
// =============================================================================

/**
 * Create a successful Result containing a value.
 *
 * @typeParam T - The type of the value
 * @param value - The success value
 * @returns An Ok Result containing the value
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * console.log(result.value); // 42
 * console.log(result.isOk()); // true
 * ```
 */
export function ok<T>(value: T): Ok<T> {
  return new OkImpl(value);
}

/**
 * Create a failed Result containing an error.
 *
 * @typeParam E - The type of the error
 * @param error - The error value
 * @returns An Err Result containing the error
 *
 * @example
 * ```typescript
 * const result = err('Something went wrong');
 * console.log(result.error); // 'Something went wrong'
 * console.log(result.isErr()); // true
 * ```
 */
export function err<E>(error: E): Err<E> {
  return new ErrImpl(error);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a Result is Ok.
 *
 * @typeParam T - The success type
 * @typeParam E - The error type
 * @param result - The Result to check
 * @returns true if the Result is Ok
 *
 * @example
 * ```typescript
 * const result: Result<number, string> = ok(42);
 *
 * if (isOk(result)) {
 *   // TypeScript knows result is Ok<number> here
 *   console.log(result.value); // 42
 * }
 * ```
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result._tag === 'Ok';
}

/**
 * Type guard to check if a Result is Err.
 *
 * @typeParam T - The success type
 * @typeParam E - The error type
 * @param result - The Result to check
 * @returns true if the Result is Err
 *
 * @example
 * ```typescript
 * const result: Result<number, string> = err('failed');
 *
 * if (isErr(result)) {
 *   // TypeScript knows result is Err<string> here
 *   console.log(result.error); // 'failed'
 * }
 * ```
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result._tag === 'Err';
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Wrap a function that might throw into a function that returns a Result.
 *
 * @typeParam T - The return type of the function
 * @typeParam Args - The argument types of the function
 * @param fn - The function to wrap
 * @returns A function that returns a Result instead of throwing
 *
 * @example
 * ```typescript
 * const safeJsonParse = tryCatch((str: string) => JSON.parse(str));
 *
 * const result = safeJsonParse('{"name": "test"}');
 * if (isOk(result)) {
 *   console.log(result.value.name); // 'test'
 * }
 *
 * const errorResult = safeJsonParse('invalid json');
 * if (isErr(errorResult)) {
 *   console.log('Parse failed:', errorResult.error.message);
 * }
 * ```
 */
export function tryCatch<T, Args extends unknown[]>(
  fn: (...args: Args) => T
): (...args: Args) => Result<T, Error> {
  return (...args: Args): Result<T, Error> => {
    try {
      return ok(fn(...args));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Wrap an async function that might throw into a function that returns a Result.
 *
 * @typeParam T - The resolved type of the promise
 * @typeParam Args - The argument types of the function
 * @param fn - The async function to wrap
 * @returns An async function that returns a Result instead of throwing
 *
 * @example
 * ```typescript
 * const safeFetch = tryCatchAsync(async (url: string) => {
 *   const response = await fetch(url);
 *   if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *   return response.json();
 * });
 *
 * const result = await safeFetch('https://api.example.com/data');
 * const data = result.unwrapOr({ default: true });
 * ```
 */
export function tryCatchAsync<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<Result<T, Error>> {
  return async (...args: Args): Promise<Result<T, Error>> => {
    try {
      return ok(await fn(...args));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Combine multiple Results into a single Result containing an array.
 * If any Result is Err, returns the first Err.
 *
 * @typeParam T - The success type
 * @typeParam E - The error type
 * @param results - Array of Results to combine
 * @returns A Result containing an array of all values, or the first error
 *
 * @example
 * ```typescript
 * const results = [ok(1), ok(2), ok(3)];
 * const combined = all(results);
 * console.log(combined.unwrap()); // [1, 2, 3]
 *
 * const withError = [ok(1), err('failed'), ok(3)];
 * const combined2 = all(withError);
 * console.log(combined2.unwrapErr()); // 'failed'
 * ```
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (isErr(result)) {
      // Return a new Err with the same error to maintain correct type
      return err(result.error);
    }
    values.push(result.value);
  }

  return ok(values);
}

/**
 * Combine multiple Results into a single Result.
 * Returns the first Ok, or if all are Err, returns an Err containing all errors.
 *
 * @typeParam T - The success type
 * @typeParam E - The error type
 * @param results - Array of Results to combine
 * @returns The first Ok, or an Err containing all errors
 *
 * @example
 * ```typescript
 * const results = [err('first error'), ok(42), err('third error')];
 * const first = any(results);
 * console.log(first.unwrap()); // 42
 *
 * const allErrors = [err('a'), err('b'), err('c')];
 * const combined = any(allErrors);
 * console.log(combined.unwrapErr()); // ['a', 'b', 'c']
 * ```
 */
export function any<T, E>(results: Result<T, E>[]): Result<T, E[]> {
  const errors: E[] = [];

  for (const result of results) {
    if (isOk(result)) {
      // Return a new Ok with the same value to maintain correct type
      return ok(result.value);
    }
    errors.push(result.error);
  }

  return err(errors);
}

/**
 * Convert a Promise that might reject into a Promise<Result>.
 *
 * @typeParam T - The resolved type of the promise
 * @param promise - The promise to convert
 * @returns A Promise that always resolves to a Result
 *
 * @example
 * ```typescript
 * const result = await fromPromise(fetch('https://api.example.com/data'));
 *
 * if (isOk(result)) {
 *   const response = result.value;
 *   // handle response
 * } else {
 *   // handle error
 *   console.error('Fetch failed:', result.error.message);
 * }
 * ```
 */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await promise);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Convert a nullable value to a Result.
 *
 * @typeParam T - The type of the value
 * @typeParam E - The type of the error
 * @param value - The nullable value
 * @param error - The error to use if value is null/undefined
 * @returns Ok(value) if value is not null/undefined, otherwise Err(error)
 *
 * @example
 * ```typescript
 * const maybeUser = users.find(u => u.id === id);
 * const result = fromNullable(maybeUser, 'User not found');
 *
 * const user = result.unwrapOr(defaultUser);
 * ```
 */
export function fromNullable<T, E>(
  value: T | null | undefined,
  error: E
): Result<T, E> {
  return value != null ? ok(value) : err(error);
}

/**
 * Convert a Result to a Promise.
 * Ok values become resolved promises, Err values become rejected promises.
 *
 * @typeParam T - The success type
 * @typeParam E - The error type
 * @param result - The Result to convert
 * @returns A Promise that resolves or rejects based on the Result
 *
 * @example
 * ```typescript
 * const result = ok(42);
 * const value = await toPromise(result); // 42
 *
 * const errorResult = err(new Error('failed'));
 * try {
 *   await toPromise(errorResult);
 * } catch (e) {
 *   console.error(e.message); // 'failed'
 * }
 * ```
 */
export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
  return isOk(result) ? Promise.resolve(result.value) : Promise.reject(result.error);
}

// =============================================================================
// AsyncResult Utilities
// =============================================================================

/**
 * AsyncResult is a Promise that resolves to a Result.
 * This type alias makes it easier to work with async operations that can fail.
 *
 * @typeParam T - The success type
 * @typeParam E - The error type
 */
export type AsyncResult<T, E> = Promise<Result<T, E>>;

/**
 * Map over an AsyncResult's success value.
 *
 * @typeParam T - The original success type
 * @typeParam U - The mapped success type
 * @typeParam E - The error type
 * @param asyncResult - The AsyncResult to map over
 * @param fn - The mapping function
 * @returns A new AsyncResult with the mapped value
 *
 * @example
 * ```typescript
 * const asyncResult: AsyncResult<number, string> = Promise.resolve(ok(42));
 * const doubled = await mapAsync(asyncResult, n => n * 2);
 * console.log(doubled.unwrap()); // 84
 * ```
 */
export async function mapAsync<T, U, E>(
  asyncResult: AsyncResult<T, E>,
  fn: (value: T) => U
): Promise<Result<U, E>> {
  const result = await asyncResult;
  return result.map(fn);
}

/**
 * FlatMap over an AsyncResult's success value with an async function.
 *
 * @typeParam T - The original success type
 * @typeParam U - The mapped success type
 * @typeParam E - The error type
 * @typeParam F - The potential new error type
 * @param asyncResult - The AsyncResult to flatMap over
 * @param fn - The async flatMapping function
 * @returns A new AsyncResult
 *
 * @example
 * ```typescript
 * const getUserId: AsyncResult<number, string> = Promise.resolve(ok(1));
 * const fetchUser = async (id: number): AsyncResult<User, string> => {
 *   // fetch user...
 * };
 *
 * const user = await flatMapAsync(getUserId, fetchUser);
 * ```
 */
export async function flatMapAsync<T, U, E, F>(
  asyncResult: AsyncResult<T, E>,
  fn: (value: T) => AsyncResult<U, F>
): Promise<Result<U, E | F>> {
  const result = await asyncResult;
  if (isErr(result)) {
    // Return a new Err with the same error to maintain correct type
    return err(result.error);
  }
  return fn(result.value);
}
