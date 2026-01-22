/**
 * @evodb/core/validation - Input Validation for Security
 *
 * This submodule provides comprehensive input validation to prevent security vulnerabilities.
 * Issue: evodb-go5v - TDD: Add comprehensive input validation for security
 *
 * Security features:
 * - SQL injection prevention in column names
 * - XSS pattern rejection
 * - Path traversal prevention
 * - Control character filtering
 * - Input length limits
 *
 * @example
 * ```typescript
 * import { createColumnNameValidator, createPathValidator, sanitizeInput } from '@evodb/core/validation';
 *
 * const validateColumn = createColumnNameValidator();
 * validateColumn('user_id');     // true
 * validateColumn("'; DROP TABLE"); // false
 *
 * const validatePath = createPathValidator();
 * validatePath('blocks/123');   // true
 * validatePath('../secret');    // false
 *
 * sanitizeInput('<script>alert(1)</script>');
 * // Returns: '&lt;script&gt;alert(1)&lt;/script&gt;'
 * ```
 *
 * @module validation
 */

export {
  // Validator creators
  createColumnNameValidator,
  createPathValidator,
  // Sanitizer function
  sanitizeInput,
  // Throwing validators for API boundaries
  assertValidColumnName,
  assertValidPath,
  // Convenience aliases matching issue requirements
  assertValidColumnName as validateColumnName,
  assertValidPath as validateStoragePath,
  // Type-safe JSON parsing with Zod
  parseJSON,
  safeParseJSON,
  validate,
  safeValidate,
  createTypeGuard,
  JSONParseError,
  JSONValidationError,
  // Types
  type ColumnNameValidator,
  type PathValidator,
  type InputSanitizer,
  type ColumnNameValidatorOptions,
  type PathValidatorOptions,
  type SanitizeInputOptions,
  type ValidationResult,
  type SafeParseJSONResult,
  type ZodErrorLike,
  type ZodSchemaLike,
} from '../validation.js';

// JSON validation schemas
export {
  // Schemas
  SerializableBackupMetadataSchema,
  ImportJSONRecordSchema,
  ImportJSONArraySchema,
  // Type guards
  isSerializableBackupMetadata,
  isImportJSONRecord,
  isImportJSONArray,
  // Types
  type ImportJSONRecord,
  type ImportJSONArray,
} from '../schemas.js';
