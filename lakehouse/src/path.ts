/**
 * URL-based path utilities for R2 organization
 * Uses reverse hostname structure for efficient prefix listing
 *
 * Example:
 *   URL: https://api.example.com/users
 *   R2: com/example/api/users/
 */

import type { PartitionValue } from './types.js';
import { TablePaths, dataFilePath } from './types.js';

// =============================================================================
// URL to R2 Path Conversion
// =============================================================================

/**
 * Parse a URL or hostname into R2 path components
 *
 * @example
 * parseUrl('https://api.example.com/users')
 * // { hostname: 'api.example.com', path: '/users', r2Path: 'com/example/api/users' }
 *
 * parseUrl('api.example.com')
 * // { hostname: 'api.example.com', path: '', r2Path: 'com/example/api' }
 */
export function parseUrl(input: string): {
  hostname: string;
  path: string;
  r2Path: string;
} {
  let hostname: string;
  let path = '';

  // Handle full URLs
  if (input.includes('://')) {
    try {
      const url = new URL(input);
      hostname = url.hostname;
      path = url.pathname;
    } catch {
      // Fall back to treating as hostname
      hostname = input;
    }
  } else if (input.includes('/')) {
    // hostname/path format
    const slashIndex = input.indexOf('/');
    hostname = input.slice(0, slashIndex);
    path = input.slice(slashIndex);
  } else {
    // Just a hostname
    hostname = input;
  }

  // Clean path (remove leading/trailing slashes, normalize)
  path = path.replace(/^\/+|\/+$/g, '');

  // Build R2 path
  const r2Path = urlToR2Path(hostname, path);

  return { hostname, path, r2Path };
}

/**
 * Convert hostname and optional path to R2 path
 *
 * @example
 * urlToR2Path('api.example.com', 'users')
 * // 'com/example/api/users'
 */
export function urlToR2Path(hostname: string, path = ''): string {
  // Reverse hostname segments
  const hostSegments = hostname
    .toLowerCase()
    .split('.')
    .reverse()
    .filter(s => s.length > 0);

  // Add path segments
  const pathSegments = path
    .split('/')
    .filter(s => s.length > 0);

  return [...hostSegments, ...pathSegments].join('/');
}

/**
 * Convert R2 path back to hostname/path format
 *
 * @example
 * r2PathToUrl('com/example/api/users')
 * // { hostname: 'api.example.com', path: 'users' }
 */
export function r2PathToUrl(r2Path: string, pathDepth = 0): {
  hostname: string;
  path: string;
} {
  const segments = r2Path.split('/').filter(s => s.length > 0);

  // Split into hostname and path portions
  // By default, assume all segments are hostname (no path)
  // pathDepth specifies how many trailing segments are path
  const hostSegments = pathDepth > 0
    ? segments.slice(0, -pathDepth)
    : segments;
  const pathSegments = pathDepth > 0
    ? segments.slice(-pathDepth)
    : [];

  // Reverse hostname back to normal order
  const hostname = [...hostSegments].reverse().join('.');
  const path = pathSegments.join('/');

  return { hostname, path };
}

// =============================================================================
// Table Location Utilities
// =============================================================================

/**
 * Build the full R2 path to a table's manifest file
 */
export function manifestPath(tableLocation: string): string {
  return joinPath(tableLocation, TablePaths.MANIFEST);
}

/**
 * Build the full R2 path to a table's schema directory
 */
export function schemaDir(tableLocation: string): string {
  return joinPath(tableLocation, TablePaths.SCHEMA_DIR);
}

/**
 * Build the full R2 path to a specific schema file
 */
export function schemaFilePath(tableLocation: string, schemaId: number): string {
  return joinPath(tableLocation, `${TablePaths.SCHEMA_DIR}/v${schemaId}.json`);
}

/**
 * Build the full R2 path to a table's data directory
 */
export function dataDir(tableLocation: string): string {
  return joinPath(tableLocation, TablePaths.DATA_DIR);
}

/**
 * Build the full R2 path to a table's snapshots directory
 */
export function snapshotsDir(tableLocation: string): string {
  return joinPath(tableLocation, TablePaths.SNAPSHOTS_DIR);
}

/**
 * Build the full R2 path to a specific snapshot file
 */
export function snapshotFilePath(tableLocation: string, snapshotId: string): string {
  return joinPath(tableLocation, `${TablePaths.SNAPSHOTS_DIR}/${snapshotId}.json`);
}

/**
 * Build full R2 path to a data file
 */
export function fullDataFilePath(
  tableLocation: string,
  partitions: PartitionValue[],
  filename: string
): string {
  const relativePath = dataFilePath(partitions, filename);
  return joinPath(tableLocation, relativePath);
}

// =============================================================================
// Path Manipulation Utilities
// =============================================================================

/**
 * Join path segments, handling slashes correctly
 */
export function joinPath(...segments: string[]): string {
  return segments
    .map((s, i) => {
      // Remove leading slash from all but first segment
      if (i > 0) {
        s = s.replace(/^\/+/, '');
      }
      // Remove trailing slash from all but last segment
      if (i < segments.length - 1) {
        s = s.replace(/\/+$/, '');
      }
      return s;
    })
    .filter(s => s.length > 0)
    .join('/');
}

/**
 * Get parent path (one level up)
 */
export function parentPath(path: string): string | null {
  const normalized = path.replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return null;
  return normalized.slice(0, lastSlash);
}

/**
 * Get the basename (last segment) of a path
 */
export function basename(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Check if a path is a child of another path
 */
export function isChildOf(childPath: string, parentPathStr: string): boolean {
  const normalizedChild = childPath.replace(/\/+$/, '').toLowerCase();
  const normalizedParent = parentPathStr.replace(/\/+$/, '').toLowerCase();

  if (normalizedChild === normalizedParent) return false;
  return normalizedChild.startsWith(normalizedParent + '/');
}

/**
 * Get relative path from base to target
 */
export function relativePath(basePath: string, targetPath: string): string | null {
  const normalizedBase = basePath.replace(/\/+$/, '').toLowerCase() + '/';
  const normalizedTarget = targetPath.toLowerCase();

  if (!normalizedTarget.startsWith(normalizedBase)) {
    return null;
  }

  return targetPath.slice(normalizedBase.length - 1);
}

// =============================================================================
// Partition Path Utilities
// =============================================================================

/**
 * Build partition path from values
 *
 * @example
 * buildPartitionPath([
 *   { name: 'year', value: 2026 },
 *   { name: 'month', value: 1 },
 *   { name: 'day', value: 19 }
 * ])
 * // 'year=2026/month=1/day=19'
 */
export function buildPartitionPath(partitions: PartitionValue[]): string {
  if (partitions.length === 0) return '';

  return partitions
    .map(p => `${encodePartitionName(p.name)}=${encodePartitionValue(p.value)}`)
    .join('/');
}

/**
 * Parse partition path into values
 *
 * @example
 * parsePartitionPath('year=2026/month=1/day=19')
 * // [{ name: 'year', value: '2026' }, { name: 'month', value: '1' }, { name: 'day', value: '19' }]
 */
export function parsePartitionPath(path: string): PartitionValue[] {
  if (!path) return [];

  return path
    .split('/')
    .filter(s => s.includes('='))
    .map(segment => {
      const eqIndex = segment.indexOf('=');
      const name = decodePartitionName(segment.slice(0, eqIndex));
      const rawValue = segment.slice(eqIndex + 1);
      const value = decodePartitionValue(rawValue);
      return { name, value };
    });
}

/**
 * Encode partition name for path safety
 */
function encodePartitionName(name: string): string {
  return name
    .replace(/%/g, '%25')
    .replace(/\//g, '%2F')
    .replace(/=/g, '%3D');
}

/**
 * Decode partition name from path
 */
function decodePartitionName(encoded: string): string {
  return decodeURIComponent(encoded);
}

/**
 * Encode partition value for path safety
 */
function encodePartitionValue(value: string | number | null): string {
  if (value === null) return '__null__';
  if (typeof value === 'number') return String(value);
  return String(value)
    .replace(/%/g, '%25')
    .replace(/\//g, '%2F')
    .replace(/=/g, '%3D');
}

/**
 * Decode partition value from path
 */
function decodePartitionValue(encoded: string): string | number | null {
  if (encoded === '__null__') return null;

  const decoded = decodeURIComponent(encoded);

  // Try to parse as number if it looks like one
  if (/^-?\d+$/.test(decoded)) {
    const num = parseInt(decoded, 10);
    if (!isNaN(num) && num <= Number.MAX_SAFE_INTEGER && num >= Number.MIN_SAFE_INTEGER) {
      return num;
    }
  }

  return decoded;
}

// =============================================================================
// Time-based Path Generation
// =============================================================================

/**
 * Generate time-based partition values from a timestamp
 *
 * @param timestamp - Milliseconds since epoch
 * @param granularity - How fine-grained to partition
 */
export function timePartitionValues(
  timestamp: number,
  granularity: 'year' | 'month' | 'day' | 'hour' = 'day'
): PartitionValue[] {
  const date = new Date(timestamp);
  const values: PartitionValue[] = [];

  values.push({ name: 'year', value: date.getUTCFullYear() });

  if (granularity === 'year') return values;

  values.push({ name: 'month', value: date.getUTCMonth() + 1 });

  if (granularity === 'month') return values;

  values.push({ name: 'day', value: date.getUTCDate() });

  if (granularity === 'day') return values;

  values.push({ name: 'hour', value: date.getUTCHours() });

  return values;
}

/**
 * Generate a unique block filename
 *
 * @param prefix - Optional prefix (e.g., DO ID)
 * @param extension - File extension (default: 'bin')
 */
export function generateBlockFilename(prefix = '', extension = 'bin'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const name = prefix ? `${prefix}-${timestamp}-${random}` : `block-${timestamp}-${random}`;
  return `${name}.${extension}`;
}
