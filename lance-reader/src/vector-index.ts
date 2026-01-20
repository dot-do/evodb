/**
 * Abstract VectorIndex base class
 * Separated to avoid circular dependencies
 *
 * @module @evodb/lance-reader/vector-index
 */

import type { VectorSearchOptions, SearchResult } from './types.js';

/**
 * Abstract base class for vector indices
 */
export abstract class VectorIndex {
  /**
   * Search for k nearest neighbors to the query vector
   */
  abstract search(
    query: Float32Array,
    options: VectorSearchOptions
  ): Promise<SearchResult[]>;

  /**
   * Get the index type identifier
   */
  abstract get indexType(): string;

  /**
   * Get the vector dimension
   */
  abstract get dimension(): number;
}
