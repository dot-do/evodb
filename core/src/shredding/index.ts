/**
 * @evodb/core/shredding - JSON shredding operations
 *
 * This submodule exports JSON shredding functionality for converting
 * between JSON documents and columnar format.
 *
 * @module shredding
 */

export {
  shred,
  unshred,
  extractPath,
  extractPaths,
  coerceToType,
  appendRows,
  buildPathIndex,
} from '../shred.js';
