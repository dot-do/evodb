/**
 * Import/Export functionality for EvoDB
 *
 * Provides functions to import data from CSV/JSON formats
 * and export data to CSV/JSON formats.
 *
 * @module import-export
 */

import type { EvoDB } from './evodb.js';
import { safeParseJSON } from './validation.js';
import { ImportJSONArraySchema } from './schemas.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for import operations
 */
export interface ImportOptions {
  /** Target table name */
  table: string;
  /** Number of rows to process in each batch (default: 100) */
  batchSize?: number;
  /** Callback function called with the count of processed rows */
  onProgress?: (count: number) => void;
}

/**
 * Options for export operations
 */
export interface ExportOptions {
  /** Whether to include the _id column (default: false) */
  includeId?: boolean;
}

// =============================================================================
// CSV Parser
// =============================================================================

/**
 * Parse a CSV string into an array of objects
 */
function parseCSV(data: string): Record<string, string>[] {
  if (!data || data.trim().length === 0) {
    throw new Error('CSV data is empty');
  }

  const result: Record<string, string>[] = [];
  let pos = 0;
  const length = data.length;

  // Helper to read a field (handles quoting)
  function readField(): string {
    if (pos >= length) return '';

    // Check for quoted field
    if (data[pos] === '"') {
      pos++; // Skip opening quote
      let value = '';
      while (pos < length) {
        if (data[pos] === '"') {
          // Check for escaped quote
          if (pos + 1 < length && data[pos + 1] === '"') {
            value += '"';
            pos += 2;
          } else {
            pos++; // Skip closing quote
            break;
          }
        } else {
          value += data[pos];
          pos++;
        }
      }
      return value;
    } else {
      // Unquoted field
      let value = '';
      while (pos < length && data[pos] !== ',' && data[pos] !== '\n' && data[pos] !== '\r') {
        value += data[pos];
        pos++;
      }
      return value;
    }
  }

  // Helper to read a row
  function readRow(): string[] {
    const fields: string[] = [];
    while (pos < length) {
      const field = readField();
      fields.push(field);

      if (pos >= length) break;

      if (data[pos] === ',') {
        pos++; // Skip comma
        continue;
      }

      if (data[pos] === '\r') {
        pos++;
        if (pos < length && data[pos] === '\n') {
          pos++;
        }
        break;
      }

      if (data[pos] === '\n') {
        pos++;
        break;
      }
    }
    return fields;
  }

  // Read header row
  const headers = readRow();
  if (headers.length === 0 || (headers.length === 1 && headers[0] === '')) {
    throw new Error('CSV header is invalid');
  }

  // Read data rows
  while (pos < length) {
    // Skip empty lines
    while (pos < length && (data[pos] === '\n' || data[pos] === '\r')) {
      pos++;
    }
    if (pos >= length) break;

    const values = readRow();
    // Skip empty rows
    if (values.length === 0 || (values.length === 1 && values[0] === '')) {
      continue;
    }

    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = i < values.length ? values[i] : '';
    }
    result.push(row);
  }

  return result;
}

/**
 * Convert an array of objects to CSV format
 */
function toCSV(rows: Record<string, unknown>[], excludeId: boolean = true): string {
  if (rows.length === 0) {
    return '';
  }

  // Get all unique keys
  const keySet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (excludeId && key === '_id') continue;
      keySet.add(key);
    }
  }
  const headers = Array.from(keySet);

  if (headers.length === 0) {
    return '';
  }

  // Helper to escape CSV value
  function escapeCSVValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    // Check if quoting is needed
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      // Escape quotes by doubling them
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // Build CSV
  const lines: string[] = [];

  // Header row
  lines.push(headers.map(h => escapeCSVValue(h)).join(','));

  // Data rows
  for (const row of rows) {
    const values = headers.map(h => escapeCSVValue(row[h]));
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

// =============================================================================
// Import Functions
// =============================================================================

/**
 * Import data from CSV format
 *
 * @param db - EvoDB instance
 * @param data - CSV string data
 * @param options - Import options
 * @returns Number of rows imported
 *
 * @example
 * ```typescript
 * const csv = `name,email
 * Alice,alice@example.com
 * Bob,bob@example.com`;
 *
 * const count = await importCSV(db, csv, { table: 'users' });
 * console.log(`Imported ${count} rows`);
 * ```
 */
export async function importCSV(
  db: EvoDB,
  data: string,
  options: ImportOptions
): Promise<number> {
  const { table, batchSize = 100, onProgress } = options;

  const rows = parseCSV(data);
  let imported = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await db.insert(table, batch);
    imported += batch.length;
    if (onProgress) {
      onProgress(imported);
    }
  }

  return imported;
}

/**
 * Import data from JSON format
 *
 * @param db - EvoDB instance
 * @param data - JSON string (must be an array of objects)
 * @param options - Import options
 * @returns Number of rows imported
 *
 * @example
 * ```typescript
 * const json = JSON.stringify([
 *   { name: 'Alice', email: 'alice@example.com' },
 *   { name: 'Bob', email: 'bob@example.com' }
 * ]);
 *
 * const count = await importJSON(db, json, { table: 'users' });
 * console.log(`Imported ${count} rows`);
 * ```
 */
export async function importJSON(
  db: EvoDB,
  data: string,
  options: ImportOptions
): Promise<number> {
  const { table, batchSize = 100, onProgress } = options;

  // Use type-safe JSON parsing with validation schema
  const parseResult = safeParseJSON(data, ImportJSONArraySchema);
  if (!parseResult.success) {
    const errorMessage = parseResult.error.issues[0]?.message ?? 'Invalid JSON';
    if (errorMessage === 'Invalid JSON syntax') {
      throw new Error('Invalid JSON format');
    }
    if (errorMessage === 'Expected an array') {
      throw new Error('JSON data must be an array of objects');
    }
    throw new Error(`JSON validation failed: ${errorMessage}`);
  }

  const rows = parseResult.data;
  let imported = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await db.insert(table, batch);
    imported += batch.length;
    if (onProgress) {
      onProgress(imported);
    }
  }

  return imported;
}

// =============================================================================
// Export Functions
// =============================================================================

/**
 * Export table data to CSV format
 *
 * @param db - EvoDB instance
 * @param table - Table name to export
 * @param options - Export options
 * @returns CSV string
 *
 * @example
 * ```typescript
 * const csv = await exportCSV(db, 'users');
 * console.log(csv);
 * // name,email
 * // Alice,alice@example.com
 * // Bob,bob@example.com
 * ```
 */
export async function exportCSV(
  db: EvoDB,
  table: string,
  options: ExportOptions = {}
): Promise<string> {
  const { includeId = false } = options;

  const rows = await db.query(table);
  return toCSV(rows, !includeId);
}

/**
 * Export table data to JSON format
 *
 * @param db - EvoDB instance
 * @param table - Table name to export
 * @param options - Export options
 * @returns JSON string (array of objects)
 *
 * @example
 * ```typescript
 * const json = await exportJSON(db, 'users');
 * const data = JSON.parse(json);
 * console.log(data);
 * // [{ name: 'Alice', email: 'alice@example.com' }, ...]
 * ```
 */
export async function exportJSON(
  db: EvoDB,
  table: string,
  options: ExportOptions = {}
): Promise<string> {
  const { includeId = false } = options;

  const rows = await db.query(table);

  // Remove _id if not included
  if (!includeId) {
    const filteredRows = rows.map(row => {
      const { _id, ...rest } = row as Record<string, unknown> & { _id?: unknown };
      return rest;
    });
    return JSON.stringify(filteredRows);
  }

  return JSON.stringify(rows);
}
