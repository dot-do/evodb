/**
 * @evodb/core - Input Validation for Security
 *
 * This module provides comprehensive input validation to prevent security vulnerabilities.
 * Issue: evodb-go5v - TDD: Add comprehensive input validation for security
 *
 * Security features:
 * - SQL injection prevention in column names
 * - XSS pattern rejection
 * - Path traversal prevention
 * - Control character filtering
 * - Input length limits
 *
 * @module validation
 */

import { ValidationError, ErrorCode } from './errors.js';
import { captureStackTrace } from './stack-trace.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Validator function type for column names
 */
export type ColumnNameValidator = (name: string) => boolean;

/**
 * Validator function type for storage paths
 */
export type PathValidator = (path: string) => boolean;

/**
 * Sanitizer function type for general input strings
 */
export type InputSanitizer = (
  input: string,
  options?: SanitizeInputOptions
) => string;

/**
 * Configuration options for column name validation
 */
export interface ColumnNameValidatorOptions {
  /** Maximum allowed length for column names (default: 255) */
  maxLength?: number;
  /** Whether to allow dot notation for nested paths (default: true) */
  allowDots?: boolean;
  /** Whether to allow array bracket notation (default: true) */
  allowBrackets?: boolean;
}

/**
 * Configuration options for path validation
 */
export interface PathValidatorOptions {
  /** Maximum allowed length for paths (default: 1024) */
  maxLength?: number;
  /** Whether to allow leading slashes (default: false) */
  allowAbsolutePaths?: boolean;
}

/**
 * Options for input sanitization
 */
export interface SanitizeInputOptions {
  /** Maximum length of output (default: 10000) */
  maxLength?: number;
  /** Whether to escape HTML entities (default: true) */
  escapeHtml?: boolean;
  /** Whether to preserve newlines and tabs (default: true) */
  preserveWhitespace?: boolean;
}

/**
 * Detailed validation result with reason for failure
 */
export interface ValidationResult {
  /** Whether the input is valid */
  valid: boolean;
  /** Reason for validation failure (only set if valid is false) */
  reason?: string;
  /** Error code for programmatic handling */
  code?: string;
}

// =============================================================================
// Security Patterns (Compiled RegExp for performance)
// All patterns are pre-compiled and frozen for security and performance.
// =============================================================================

/**
 * Security pattern collection for easy auditing and updates.
 * All patterns are case-insensitive where appropriate.
 */
const SecurityPatterns = Object.freeze({
  /**
   * SQL injection patterns - consolidated for efficiency
   * Matches: DROP, DELETE, INSERT, UPDATE, SELECT, UNION, OR, AND with SQL syntax
   * Also includes time-based injection functions (WAITFOR, BENCHMARK, SLEEP)
   */
  SQL_KEYWORDS: /\b(?:DROP|DELETE|INSERT|UPDATE|SELECT|UNION|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|EXEC|WAITFOR|BENCHMARK|SLEEP)\b/i,

  /**
   * SQL syntax patterns that shouldn't appear in column names
   * Includes: comments (-- and block comments), quotes, OR/AND tautologies, SQL clauses
   */
  SQL_SYNTAX: /(?:--|\/\*|\*\/|;|['"`]|\bOR\s+\d+=\d+|\bAND\s+\d+=\d+|\bHAVING\b|\bORDER\s+BY\b)/i,

  /**
   * XSS patterns - consolidated for efficiency
   * Matches: script tags, HTML with event handlers, javascript: protocol
   */
  XSS_SCRIPT_TAG: /<\s*script[^>]*>|<\s*\/\s*script\s*>/i,
  XSS_HTML_TAGS: /<[^>]*(?:on\w+\s*=|javascript:|src\s*=|href\s*=)[^>]*>/i,
  XSS_EVENT_HANDLERS: /\bon(?:load|error|click|mouse\w*|key\w*|focus|blur|submit|reset|change|select)\s*=/i,
  XSS_JAVASCRIPT_PROTOCOL: /javascript\s*:/i,
  XSS_ANGLE_BRACKETS: /<[a-z!\/]/i,

  /**
   * Control characters (ASCII 0x00-0x1F except tab, newline, carriage return)
   * These can be used for injection attacks and should never appear in identifiers
   */
  CONTROL_CHARS: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/,

  /**
   * Characters unsafe for SQL identifiers (column names, table names)
   * These characters have special meaning in SQL or could enable injection
   */
  UNSAFE_IDENTIFIER_CHARS: /[;'"`,(){}|&!@#$%^*=+\\<>?~]/,

  /**
   * Path traversal patterns - includes standard and evasion techniques
   * Standard: ../ and ..\
   * Evasion: ....// (collapses to ../), ..;/ (IIS bypass), .../
   */
  PATH_TRAVERSAL: /(?:^|[\\/])\.\.(?:[\\/]|$)/,
  PATH_TRAVERSAL_EVASION: /\.{3,}|\.\.;/,

  /**
   * URL-encoded path traversal patterns
   * %2e = ., %2f = /, %5c = \, %00 = null, %25 = % (double encoding)
   */
  ENCODED_TRAVERSAL: /%(?:2e|2f|5c|00|252e|252f)/i,

  /**
   * Shell metacharacters that could enable command injection
   */
  SHELL_METACHARACTERS: /[;|&`$(){}[\]<>!]/,
});

// Convenience aliases for backward compatibility and readability
const SQL_INJECTION_KEYWORDS = SecurityPatterns.SQL_KEYWORDS;
const SQL_SYNTAX_PATTERN = SecurityPatterns.SQL_SYNTAX;
const XSS_SCRIPT_TAG = SecurityPatterns.XSS_SCRIPT_TAG;
const XSS_HTML_TAGS = SecurityPatterns.XSS_HTML_TAGS;
const XSS_EVENT_HANDLERS = SecurityPatterns.XSS_EVENT_HANDLERS;
const XSS_JAVASCRIPT_PROTOCOL = SecurityPatterns.XSS_JAVASCRIPT_PROTOCOL;
const XSS_HTML_ANGLE_BRACKETS = SecurityPatterns.XSS_ANGLE_BRACKETS;
const CONTROL_CHARS = SecurityPatterns.CONTROL_CHARS;
const UNSAFE_COLUMN_CHARS = SecurityPatterns.UNSAFE_IDENTIFIER_CHARS;
const PATH_TRAVERSAL = SecurityPatterns.PATH_TRAVERSAL;
const PATH_TRAVERSAL_EVASION = SecurityPatterns.PATH_TRAVERSAL_EVASION;
const ENCODED_TRAVERSAL = SecurityPatterns.ENCODED_TRAVERSAL;
const SHELL_METACHARACTERS = SecurityPatterns.SHELL_METACHARACTERS;

/**
 * Valid identifier patterns - positive patterns for allowlisting
 */
const ValidPatterns = Object.freeze({
  /** Basic identifier: starts with letter or underscore, alphanumeric after */
  COLUMN_BASE: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  /** With dots: allows dot notation for nested paths */
  COLUMN_WITH_DOTS: /^[a-zA-Z_][a-zA-Z0-9_.]*$/,
  /** Full: allows dots and brackets for array access */
  COLUMN_FULL: /^[a-zA-Z_][a-zA-Z0-9_.\[\]0-9]*$/,
  /** Valid path characters: alphanumeric, underscore, hyphen, dot, forward slash */
  PATH_CHARS: /^[a-zA-Z0-9_.\-/]+$/,
});

// Convenience aliases
const VALID_COLUMN_BASE = ValidPatterns.COLUMN_BASE;
const VALID_COLUMN_WITH_DOTS = ValidPatterns.COLUMN_WITH_DOTS;
const VALID_COLUMN_FULL = ValidPatterns.COLUMN_FULL;
const VALID_PATH_CHARS = ValidPatterns.PATH_CHARS;

// =============================================================================
// Column Name Validator
// =============================================================================

/**
 * Creates a column name validator with configurable options.
 *
 * This validator protects against:
 * - SQL injection in column names
 * - XSS patterns
 * - Control characters
 * - Overly long inputs
 *
 * @param options - Configuration options
 * @returns A validator function that returns true for valid column names
 *
 * @example
 * ```typescript
 * const validate = createColumnNameValidator();
 * validate('user_id');     // true
 * validate('user.name');   // true
 * validate('items[0]');    // true
 * validate("'; DROP TABLE"); // false - SQL injection
 * validate('<script>');    // false - XSS
 * ```
 */
export function createColumnNameValidator(
  options: ColumnNameValidatorOptions = {}
): ColumnNameValidator {
  const {
    maxLength = 255,
    allowDots = true,
    allowBrackets = true,
  } = options;

  return function validateColumnName(name: string): boolean {
    // Basic checks
    if (!name || typeof name !== 'string') {
      return false;
    }

    // Length check
    if (name.length === 0 || name.length > maxLength) {
      return false;
    }

    // Control characters check (including null bytes, newlines, tabs)
    if (CONTROL_CHARS.test(name) || /[\n\r\t]/.test(name)) {
      return false;
    }

    // SQL injection checks
    if (SQL_INJECTION_KEYWORDS.test(name)) {
      return false;
    }
    if (SQL_SYNTAX_PATTERN.test(name)) {
      return false;
    }

    // Unsafe character check (includes quotes, semicolons, parentheses)
    if (UNSAFE_COLUMN_CHARS.test(name)) {
      return false;
    }

    // XSS pattern checks
    if (XSS_SCRIPT_TAG.test(name)) {
      return false;
    }
    if (XSS_HTML_TAGS.test(name)) {
      return false;
    }
    if (XSS_EVENT_HANDLERS.test(name)) {
      return false;
    }
    if (XSS_JAVASCRIPT_PROTOCOL.test(name)) {
      return false;
    }
    if (XSS_HTML_ANGLE_BRACKETS.test(name)) {
      return false;
    }

    // Check for empty segments (consecutive dots, leading/trailing dots)
    // This catches cases like '.', '..', '.column', 'column.', 'a..b'
    if (allowDots && name.includes('.')) {
      const segments = name.split('.');
      if (segments.some(s => s === '')) {
        return false;
      }
    }

    // Determine which pattern to use based on options
    let validPattern: RegExp;
    if (allowDots && allowBrackets) {
      validPattern = VALID_COLUMN_FULL;
    } else if (allowDots) {
      validPattern = VALID_COLUMN_WITH_DOTS;
    } else if (allowBrackets) {
      // Note: brackets without dots is unusual but we support it
      validPattern = /^[a-zA-Z_][a-zA-Z0-9_\[\]0-9]*$/;
    } else {
      validPattern = VALID_COLUMN_BASE;
    }

    // Valid character check - must match the positive pattern
    return validPattern.test(name);
  };
}

// =============================================================================
// Path Validator
// =============================================================================

/**
 * Creates a path validator with configurable options.
 *
 * This validator protects against:
 * - Path traversal attacks (../)
 * - Encoded path traversal
 * - Null byte injection
 * - Shell metacharacters
 * - Overly long paths
 *
 * @param options - Configuration options
 * @returns A validator function that returns true for valid paths
 *
 * @example
 * ```typescript
 * const validate = createPathValidator();
 * validate('blocks/123');           // true
 * validate('data/2024/01/file.bin'); // true
 * validate('../secret');            // false - traversal
 * validate('/etc/passwd');          // false - absolute path
 * validate('file%00.txt');          // false - null byte
 * ```
 */
export function createPathValidator(
  options: PathValidatorOptions = {}
): PathValidator {
  const {
    maxLength = 1024,
    allowAbsolutePaths = false,
  } = options;

  return function validatePath(path: string): boolean {
    // Basic checks
    if (!path || typeof path !== 'string') {
      return false;
    }

    // Length check
    if (path.length === 0 || path.length > maxLength) {
      return false;
    }

    // Control characters (including null bytes, newlines)
    if (CONTROL_CHARS.test(path) || /[\n\r]/.test(path)) {
      return false;
    }

    // Absolute path check
    if (!allowAbsolutePaths && (path.startsWith('/') || /^[a-zA-Z]:/.test(path))) {
      return false;
    }

    // Path traversal checks
    if (PATH_TRAVERSAL.test(path)) {
      return false;
    }

    // Path traversal evasion techniques (e.g., ....// or ..;/)
    if (PATH_TRAVERSAL_EVASION.test(path)) {
      return false;
    }

    // Encoded traversal (URL encoding)
    if (ENCODED_TRAVERSAL.test(path)) {
      return false;
    }

    // Windows backslash traversal
    if (path.includes('..\\')) {
      return false;
    }

    // Shell metacharacters
    if (SHELL_METACHARACTERS.test(path)) {
      return false;
    }

    // Valid characters check
    if (!VALID_PATH_CHARS.test(path)) {
      return false;
    }

    return true;
  };
}

// =============================================================================
// Input Sanitizer
// =============================================================================

/**
 * HTML entity escaping map
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Sanitizes input strings by removing dangerous characters and escaping HTML.
 *
 * This function:
 * - Removes control characters (preserving tabs/newlines by default)
 * - Escapes HTML entities to prevent XSS
 * - Truncates overly long inputs
 * - Preserves valid Unicode characters
 *
 * @param input - The string to sanitize
 * @param options - Configuration options
 * @returns The sanitized string
 *
 * @example
 * ```typescript
 * sanitizeInput('<script>alert(1)</script>');
 * // Returns: '&lt;script&gt;alert(1)&lt;/script&gt;'
 *
 * sanitizeInput('hello\0world');
 * // Returns: 'helloworld'
 *
 * sanitizeInput('Hello 世界');
 * // Returns: 'Hello 世界' (Unicode preserved)
 * ```
 */
export function sanitizeInput(
  input: string,
  options: SanitizeInputOptions = {}
): string {
  const {
    maxLength = 10000,
    escapeHtml = true,
    preserveWhitespace = true,
  } = options;

  if (!input || typeof input !== 'string') {
    return '';
  }

  let result = input;

  // Remove control characters (except optionally tabs and newlines)
  if (preserveWhitespace) {
    // Remove control chars except \t (0x09), \n (0x0A), \r (0x0D)
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    // Remove all control characters
    result = result.replace(/[\x00-\x1F\x7F]/g, '');
  }

  // Escape HTML entities if requested
  if (escapeHtml) {
    result = result.replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
  }

  // Truncate if too long
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  return result;
}

// =============================================================================
// Throwing Validators (for API boundaries)
// =============================================================================

/**
 * Validates a column name and throws ValidationError if invalid.
 *
 * Use this at API boundaries where you want to reject invalid input with
 * a descriptive error message.
 *
 * @param name - The column name to validate
 * @param options - Validator options
 * @throws {ValidationError} If the column name is invalid
 *
 * @example
 * ```typescript
 * try {
 *   assertValidColumnName("'; DROP TABLE users; --");
 * } catch (error) {
 *   // ValidationError: Invalid column name: contains SQL injection pattern
 * }
 * ```
 */
export function assertValidColumnName(
  name: string,
  options?: ColumnNameValidatorOptions
): void {
  const validator = createColumnNameValidator(options);

  if (!name || typeof name !== 'string') {
    throw new ValidationError(
      'Invalid column name: must be a non-empty string',
      'INVALID_COLUMN_NAME',
      { value: name }
    );
  }

  if (name.length === 0) {
    throw new ValidationError(
      'Invalid column name: cannot be empty',
      'INVALID_COLUMN_NAME',
      { value: name }
    );
  }

  if (name.length > (options?.maxLength ?? 255)) {
    throw new ValidationError(
      `Invalid column name: exceeds maximum length of ${options?.maxLength ?? 255} characters`,
      'INVALID_COLUMN_NAME',
      { value: name, maxLength: options?.maxLength ?? 255 }
    );
  }

  if (!validator(name)) {
    // Determine the specific reason for rejection
    let reason = 'contains invalid characters';

    if (CONTROL_CHARS.test(name) || /[\n\r\t]/.test(name)) {
      reason = 'contains control characters';
    } else if (SQL_INJECTION_KEYWORDS.test(name) || SQL_SYNTAX_PATTERN.test(name)) {
      reason = 'contains SQL injection pattern';
    } else if (XSS_SCRIPT_TAG.test(name) || XSS_HTML_TAGS.test(name) || XSS_EVENT_HANDLERS.test(name)) {
      reason = 'contains XSS pattern';
    } else if (UNSAFE_COLUMN_CHARS.test(name)) {
      reason = 'contains unsafe characters';
    }

    throw new ValidationError(
      `Invalid column name: ${reason}`,
      'INVALID_COLUMN_NAME',
      { value: name, reason }
    );
  }
}

/**
 * Validates a storage path and throws ValidationError if invalid.
 *
 * Use this at API boundaries where you want to reject invalid input with
 * a descriptive error message.
 *
 * @param path - The path to validate
 * @param options - Validator options
 * @throws {ValidationError} If the path is invalid
 *
 * @example
 * ```typescript
 * try {
 *   assertValidPath("../../../etc/passwd");
 * } catch (error) {
 *   // ValidationError: Invalid path: contains path traversal pattern
 * }
 * ```
 */
export function assertValidPath(
  path: string,
  options?: PathValidatorOptions
): void {
  const validator = createPathValidator(options);

  if (!path || typeof path !== 'string') {
    throw new ValidationError(
      'Invalid path: must be a non-empty string',
      'INVALID_PATH',
      { value: path }
    );
  }

  if (path.length === 0) {
    throw new ValidationError(
      'Invalid path: cannot be empty',
      'INVALID_PATH',
      { value: path }
    );
  }

  if (path.length > (options?.maxLength ?? 1024)) {
    throw new ValidationError(
      `Invalid path: exceeds maximum length of ${options?.maxLength ?? 1024} characters`,
      'INVALID_PATH',
      { value: path, maxLength: options?.maxLength ?? 1024 }
    );
  }

  if (!validator(path)) {
    // Determine the specific reason for rejection
    let reason = 'contains invalid characters';

    if (CONTROL_CHARS.test(path) || /[\n\r]/.test(path)) {
      reason = 'contains control characters';
    } else if (PATH_TRAVERSAL.test(path) || path.includes('..\\') || PATH_TRAVERSAL_EVASION.test(path)) {
      reason = 'contains path traversal pattern';
    } else if (ENCODED_TRAVERSAL.test(path)) {
      reason = 'contains encoded path traversal pattern';
    } else if (!options?.allowAbsolutePaths && (path.startsWith('/') || /^[a-zA-Z]:/.test(path))) {
      reason = 'absolute paths are not allowed';
    } else if (SHELL_METACHARACTERS.test(path)) {
      reason = 'contains shell metacharacters';
    }

    throw new ValidationError(
      `Invalid path: ${reason}`,
      'INVALID_PATH',
      { value: path, reason }
    );
  }
}

// =============================================================================
// Type-safe JSON Parsing with Zod
// =============================================================================

/**
 * Result type for safe JSON parsing operations
 */
export type SafeParseJSONResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: ZodErrorLike };

/**
 * ZodError-like interface for JSON parse failures
 * This allows consistent error handling without requiring zod as a runtime dependency
 */
export interface ZodErrorLike {
  issues: Array<{
    code: string;
    path: (string | number)[];
    message: string;
  }>;
  message: string;
}

/**
 * Interface for Zod-compatible schema
 * This allows using any Zod schema without importing the full zod package
 */
export interface ZodSchemaLike<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: ZodErrorLike };
  parse(data: unknown): T;
}

/**
 * Error thrown when JSON parsing fails.
 * Extends ValidationError for consistent error hierarchy.
 *
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   const data = parseJSON(jsonString, schema);
 * } catch (e) {
 *   if (e instanceof JSONParseError) {
 *     console.log(`JSON parse error: ${e.message}`);
 *   }
 *   // Or catch all EvoDB errors
 *   if (e instanceof EvoDBError && e.code === ErrorCode.JSON_PARSE_ERROR) {
 *     // Handle JSON parse error
 *   }
 * }
 * ```
 */
export class JSONParseError extends ValidationError {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(
      message,
      ErrorCode.JSON_PARSE_ERROR,
      { cause: cause instanceof Error ? cause.message : String(cause) },
      'Ensure the JSON string is valid.'
    );
    this.name = 'JSONParseError';
    this.cause = cause;
    captureStackTrace(this, JSONParseError);
  }
}

/**
 * Error thrown when JSON validation fails against a schema.
 * Extends ValidationError for consistent error hierarchy.
 *
 * @example
 * ```typescript
 * import { EvoDBError, ErrorCode } from '@evodb/core';
 *
 * try {
 *   const data = parseJSON(jsonString, schema);
 * } catch (e) {
 *   if (e instanceof JSONValidationError) {
 *     console.log(`Validation errors: ${e.zodError.issues.length}`);
 *   }
 *   // Or catch all EvoDB errors
 *   if (e instanceof EvoDBError && e.code === ErrorCode.SCHEMA_VALIDATION_ERROR) {
 *     // Handle validation error
 *   }
 * }
 * ```
 */
export class JSONValidationError extends ValidationError {
  public readonly zodError: ZodErrorLike;

  constructor(message: string, zodError: ZodErrorLike) {
    super(
      message,
      ErrorCode.SCHEMA_VALIDATION_ERROR,
      { issues: zodError.issues.map(i => ({ path: i.path, message: i.message })) },
      'Ensure the JSON data matches the expected schema.'
    );
    this.name = 'JSONValidationError';
    this.zodError = zodError;
    captureStackTrace(this, JSONValidationError);
  }
}

/**
 * Parse JSON string and validate against a Zod schema
 *
 * This function provides type-safe JSON parsing by:
 * 1. Parsing the JSON string
 * 2. Validating the result against the provided Zod schema
 * 3. Returning the typed and validated data
 *
 * @param json - The JSON string to parse
 * @param schema - A Zod schema to validate against
 * @returns The parsed and validated data
 * @throws {JSONParseError} If JSON parsing fails
 * @throws {JSONValidationError} If schema validation fails
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { parseJSON } from './validation.js';
 *
 * const ConfigSchema = z.object({
 *   version: z.number(),
 *   settings: z.record(z.string()),
 * });
 *
 * const config = parseJSON(configJson, ConfigSchema);
 * // config is typed as { version: number; settings: Record<string, string> }
 * ```
 */
export function parseJSON<T>(json: string, schema: ZodSchemaLike<T>): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch (cause) {
    throw new JSONParseError(
      `Failed to parse JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause
    );
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new JSONValidationError(
      `JSON validation failed: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      result.error
    );
  }

  return result.data;
}

/**
 * Safely parse JSON string and validate against a Zod schema
 *
 * Unlike parseJSON, this function never throws. Instead, it returns a result
 * object indicating success or failure with either the data or error.
 *
 * @param json - The JSON string to parse
 * @param schema - A Zod schema to validate against
 * @returns A result object with either the data or error
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { safeParseJSON } from './validation.js';
 *
 * const ManifestSchema = z.object({
 *   version: z.number(),
 *   files: z.array(z.string()),
 * });
 *
 * const result = safeParseJSON(manifestJson, ManifestSchema);
 *
 * if (result.success) {
 *   console.log(`Found ${result.data.files.length} files`);
 * } else {
 *   console.error('Invalid manifest:', result.error.issues);
 * }
 * ```
 */
export function safeParseJSON<T>(
  json: string,
  schema: ZodSchemaLike<T>
): SafeParseJSONResult<T> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    // Create a synthetic error for JSON parse failures
    // This allows consistent error handling for both parse and validation errors
    const zodErrorLike: ZodErrorLike = {
      issues: [
        {
          code: 'custom',
          path: [],
          message: 'Invalid JSON syntax',
        },
      ],
      message: 'Invalid JSON syntax',
    };

    return {
      success: false,
      error: zodErrorLike,
    };
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validate an already-parsed value against a Zod schema
 *
 * This is useful when you have already parsed JSON (e.g., from a library)
 * and want to validate and narrow its type.
 *
 * @param value - The value to validate
 * @param schema - A Zod schema to validate against
 * @returns The validated data
 * @throws {JSONValidationError} If validation fails
 *
 * @example
 * ```typescript
 * const data = response.json(); // already parsed
 * const validated = validate(data, MySchema);
 * ```
 */
export function validate<T>(value: unknown, schema: ZodSchemaLike<T>): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new JSONValidationError(
      `Validation failed: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      result.error
    );
  }

  return result.data;
}

/**
 * Safely validate an already-parsed value against a Zod schema
 *
 * @param value - The value to validate
 * @param schema - A Zod schema to validate against
 * @returns A result object with either the data or error
 *
 * @example
 * ```typescript
 * const data = response.json();
 * const result = safeValidate(data, MySchema);
 *
 * if (result.success) {
 *   processData(result.data);
 * }
 * ```
 */
export function safeValidate<T>(
  value: unknown,
  schema: ZodSchemaLike<T>
): SafeParseJSONResult<T> {
  const result = schema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

// =============================================================================
// Type Guard Factory
// =============================================================================

/**
 * Create a type guard function from a Zod schema
 *
 * This is useful for creating reusable type guards that can be used
 * with TypeScript's type narrowing.
 *
 * @param schema - A Zod schema to create a guard for
 * @returns A type guard function
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { createTypeGuard } from './validation.js';
 *
 * const UserSchema = z.object({ name: z.string(), age: z.number() });
 * const isUser = createTypeGuard(UserSchema);
 *
 * function processValue(value: unknown) {
 *   if (isUser(value)) {
 *     // value is typed as { name: string; age: number } here
 *     console.log(value.name);
 *   }
 * }
 * ```
 */
export function createTypeGuard<T>(
  schema: ZodSchemaLike<T>
): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    return schema.safeParse(value).success;
  };
}
