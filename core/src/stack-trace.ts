/**
 * Stack trace capture utility
 *
 * Encapsulates V8-specific Error.captureStackTrace functionality
 * in a type-safe manner without requiring `any` casts.
 *
 * V8 engines (Node.js, Chrome, Cloudflare Workers) provide
 * Error.captureStackTrace for creating clean stack traces that
 * exclude internal error constructor frames.
 *
 * @example
 * ```typescript
 * class MyError extends Error {
 *   constructor(message: string) {
 *     super(message);
 *     this.name = 'MyError';
 *     captureStackTrace(this, MyError);
 *   }
 * }
 * ```
 */

/**
 * Type definition for V8's Error.captureStackTrace
 *
 * This function captures the current stack trace and stores it
 * in the `stack` property of the target object. When a constructor
 * function is provided, frames above (and including) that constructor
 * are omitted from the stack trace.
 */
interface V8Error {
  captureStackTrace(targetObject: object, constructorOpt?: Function): void;
}

/**
 * Type guard to check if the environment supports V8's captureStackTrace
 */
function hasV8CaptureStackTrace(
  errorConstructor: typeof Error
): errorConstructor is typeof Error & V8Error {
  return typeof (errorConstructor as unknown as V8Error).captureStackTrace === 'function';
}

/**
 * Captures a stack trace for the given error object.
 *
 * In V8 environments (Node.js, Chrome, Cloudflare Workers), this uses
 * the native Error.captureStackTrace to create clean stack traces
 * that exclude internal constructor frames.
 *
 * In non-V8 environments, this is a no-op - the error will still have
 * a stack trace from the Error constructor, just without the exclusion
 * of constructor frames.
 *
 * @param error - The error object to capture the stack trace on
 * @param constructorOpt - Optional constructor function to exclude from trace.
 *                         Pass the error class constructor to exclude it and
 *                         all frames above it from the stack trace.
 *
 * @example
 * ```typescript
 * // Basic usage - exclude the current constructor
 * class MyError extends Error {
 *   constructor(message: string) {
 *     super(message);
 *     this.name = 'MyError';
 *     captureStackTrace(this, MyError);
 *   }
 * }
 *
 * // Usage without constructor exclusion
 * const error = new Error('test');
 * captureStackTrace(error);
 * ```
 */
export function captureStackTrace(
  error: Error,
  constructorOpt?: Function
): void {
  if (hasV8CaptureStackTrace(Error)) {
    Error.captureStackTrace(error, constructorOpt);
  }
  // In non-V8 environments, the Error constructor already
  // populates the stack property, so no action needed
}
