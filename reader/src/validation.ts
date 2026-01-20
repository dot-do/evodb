/**
 * @evodb/reader - Runtime JSON Validation
 *
 * Provides runtime validation for columnar block data parsed from JSON.
 * This module is critical for ensuring data integrity and providing
 * descriptive error messages when block data is malformed.
 *
 * Performance considerations:
 * - Validation happens in the hot path (every block read)
 * - Use `isValidBlockData` for fast boolean checks without error details
 * - Use `validateBlockData` when you need detailed error information
 * - TextDecoder is reused to avoid allocation overhead
 */

/**
 * Error codes for block data validation failures
 * Use these for programmatic error handling
 */
export enum BlockDataValidationErrorCode {
  /** JSON parsing failed (syntax error) */
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  /** Block data is null */
  NULL_DATA = 'NULL_DATA',
  /** Block data is a primitive instead of object */
  PRIMITIVE_DATA = 'PRIMITIVE_DATA',
  /** Block data is an array instead of object */
  ARRAY_DATA = 'ARRAY_DATA',
  /** A column value is not an array */
  COLUMN_NOT_ARRAY = 'COLUMN_NOT_ARRAY',
  /** Column arrays have inconsistent lengths */
  COLUMN_LENGTH_MISMATCH = 'COLUMN_LENGTH_MISMATCH',
}

/**
 * Error thrown when block data validation fails.
 *
 * Provides detailed information about the validation failure including:
 * - Human-readable error message
 * - Block path for identifying the problematic file
 * - Error code for programmatic handling
 * - Additional details for debugging
 *
 * @example
 * ```typescript
 * try {
 *   validateBlockData(data, 'blocks/001.json');
 * } catch (error) {
 *   if (error instanceof BlockDataValidationError) {
 *     console.error(`Validation failed: ${error.code}`);
 *     console.error(`Block: ${error.blockPath}`);
 *     console.error(`Details: ${JSON.stringify(error.details)}`);
 *   }
 * }
 * ```
 */
export class BlockDataValidationError extends Error {
  public readonly code: BlockDataValidationErrorCode;

  constructor(
    message: string,
    public readonly blockPath: string,
    code: BlockDataValidationErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BlockDataValidationError';
    this.code = code;
  }
}

/**
 * Columnar block data type.
 *
 * Block data is stored in columnar format where each property represents
 * a column name and its value is an array of values for that column.
 * All column arrays must have the same length (the row count).
 *
 * @example
 * ```typescript
 * const block: BlockData = {
 *   id: [1, 2, 3],
 *   name: ['Alice', 'Bob', 'Charlie'],
 *   active: [true, false, true],
 * };
 * ```
 */
export type BlockData = Record<string, unknown[]>;

/**
 * Result of successful block data validation
 */
export interface BlockDataValidationResult {
  /** Always true for successful validation */
  valid: true;
  /** The validated block data */
  data: BlockData;
  /** Number of rows in the block (length of column arrays) */
  rowCount: number;
}

// Reuse TextDecoder for performance (avoid allocation per parse)
const sharedDecoder = new TextDecoder();

/**
 * Validates that a value is a valid BlockData structure.
 *
 * BlockData requirements:
 * - Must be a non-null object (not array, not primitive)
 * - Each property value must be an array
 * - All arrays must have the same length (consistent row count)
 *
 * @param data - The parsed JSON data to validate
 * @param blockPath - Path to the block file (for error messages)
 * @returns Validated BlockData with row count
 * @throws BlockDataValidationError if validation fails
 *
 * @example
 * ```typescript
 * const data = JSON.parse(jsonString);
 * const { data: blockData, rowCount } = validateBlockData(data, 'blocks/001.json');
 * console.log(`Block has ${rowCount} rows`);
 * ```
 */
export function validateBlockData(data: unknown, blockPath: string): BlockDataValidationResult {
  // Fast path: null check
  if (data === null) {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object but got null`,
      blockPath,
      BlockDataValidationErrorCode.NULL_DATA,
      { receivedType: 'null' }
    );
  }

  // Fast path: type check for primitives
  if (typeof data !== 'object') {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object but got ${typeof data}`,
      blockPath,
      BlockDataValidationErrorCode.PRIMITIVE_DATA,
      { receivedType: typeof data }
    );
  }

  // Fast path: array check (arrays are objects in JS)
  if (Array.isArray(data)) {
    throw new BlockDataValidationError(
      `Invalid block data in '${blockPath}': expected object with column arrays but got array`,
      blockPath,
      BlockDataValidationErrorCode.ARRAY_DATA,
      { receivedType: 'array' }
    );
  }

  const blockData = data as Record<string, unknown>;
  const columns = Object.keys(blockData);

  // Empty object is valid (empty block with no columns)
  if (columns.length === 0) {
    return { valid: true, data: blockData as BlockData, rowCount: 0 };
  }

  // Validate each column value is an array with consistent length
  let expectedRowCount: number | null = null;
  const firstColumnName = columns[0];

  for (const columnName of columns) {
    const columnValue = blockData[columnName];

    // Check if column value is an array
    if (!Array.isArray(columnValue)) {
      const valueType = columnValue === null ? 'null' : typeof columnValue;
      throw new BlockDataValidationError(
        `Invalid column '${columnName}' in block '${blockPath}': expected array but got ${valueType}`,
        blockPath,
        BlockDataValidationErrorCode.COLUMN_NOT_ARRAY,
        { column: columnName, receivedType: valueType }
      );
    }

    // Check row count consistency
    const rowCount = columnValue.length;
    if (expectedRowCount === null) {
      expectedRowCount = rowCount;
    } else if (rowCount !== expectedRowCount) {
      throw new BlockDataValidationError(
        `Column length mismatch in block '${blockPath}': column '${columnName}' has ${rowCount} rows but '${firstColumnName}' has ${expectedRowCount} rows`,
        blockPath,
        BlockDataValidationErrorCode.COLUMN_LENGTH_MISMATCH,
        {
          column: columnName,
          expectedLength: expectedRowCount,
          actualLength: rowCount,
          firstColumn: firstColumnName
        }
      );
    }
  }

  return {
    valid: true,
    data: blockData as BlockData,
    rowCount: expectedRowCount ?? 0,
  };
}

/**
 * Parses JSON from a buffer and validates as BlockData in a single operation.
 *
 * This is the primary function to use when reading block data from R2/cache.
 * It provides descriptive error messages for both JSON syntax errors and
 * structure validation errors.
 *
 * @param buffer - Raw bytes to parse (from R2 or cache)
 * @param blockPath - Path to the block file (for error messages)
 * @returns Validated BlockData with row count
 * @throws BlockDataValidationError if parsing or validation fails
 *
 * @example
 * ```typescript
 * const buffer = await r2Object.arrayBuffer();
 * const { data, rowCount } = parseAndValidateBlockData(buffer, 'blocks/001.json');
 * ```
 */
export function parseAndValidateBlockData(
  buffer: ArrayBuffer,
  blockPath: string
): BlockDataValidationResult {
  const text = sharedDecoder.decode(buffer);

  // Parse JSON with descriptive error wrapping
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const jsonError = error as SyntaxError;
    throw new BlockDataValidationError(
      `Invalid JSON in block '${blockPath}': ${jsonError.message}`,
      blockPath,
      BlockDataValidationErrorCode.JSON_PARSE_ERROR,
      { parseError: jsonError.message }
    );
  }

  // Validate structure
  return validateBlockData(parsed, blockPath);
}

/**
 * Type guard to check if a value is valid BlockData.
 *
 * This is a fast check that returns a boolean without throwing errors
 * or providing detailed validation messages. Use this when you only
 * need to know if data is valid, not why it's invalid.
 *
 * For detailed error messages, use `validateBlockData` instead.
 *
 * @param data - The value to check
 * @returns True if data is valid BlockData
 *
 * @example
 * ```typescript
 * if (isValidBlockData(data)) {
 *   // TypeScript knows data is BlockData here
 *   const columns = Object.keys(data);
 * }
 * ```
 */
export function isValidBlockData(data: unknown): data is BlockData {
  // Fast null/type checks
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const obj = data as Record<string, unknown>;
  const columns = Object.keys(obj);

  // Empty object is valid
  if (columns.length === 0) {
    return true;
  }

  // Check all columns are arrays with consistent length
  let expectedLength: number | null = null;

  for (const col of columns) {
    const value = obj[col];
    if (!Array.isArray(value)) {
      return false;
    }
    if (expectedLength === null) {
      expectedLength = value.length;
    } else if (value.length !== expectedLength) {
      return false;
    }
  }

  return true;
}
