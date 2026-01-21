/**
 * @evodb/e2e - Mock R2 Bucket Implementation
 *
 * In-memory R2 bucket mock for E2E testing without real R2.
 * Implements the R2Bucket interface with full functionality.
 */

import type {
  SimpleR2Bucket as R2Bucket,
  SimpleR2Object as R2Object,
  SimpleR2ListOptions as R2ListOptions,
  SimpleR2Objects as R2Objects,
} from '@evodb/query';

/**
 * In-memory R2 object implementation
 */
export class MockR2Object implements R2Object {
  readonly key: string;
  readonly size: number;
  readonly etag: string;
  readonly httpEtag: string;
  readonly uploaded: Date;
  readonly customMetadata?: Record<string, string>;

  private readonly data: ArrayBuffer;

  constructor(
    key: string,
    data: ArrayBuffer,
    metadata?: Record<string, string>
  ) {
    this.key = key;
    this.data = data;
    this.size = data.byteLength;
    this.etag = `"${this.computeEtag(data)}"`;
    this.httpEtag = this.etag;
    this.uploaded = new Date();
    this.customMetadata = metadata;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.data.slice(0);
  }

  async text(): Promise<string> {
    return new TextDecoder().decode(this.data);
  }

  async json<T = unknown>(): Promise<T> {
    const text = await this.text();
    return JSON.parse(text) as T;
  }

  private computeEtag(data: ArrayBuffer): string {
    const bytes = new Uint8Array(data);
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) {
      hash = ((hash << 5) - hash + bytes[i]) | 0;
    }
    return hash.toString(16).padStart(8, '0');
  }
}

/**
 * In-memory R2 bucket mock for testing
 *
 * Provides a fully functional R2Bucket implementation backed by a Map.
 * Useful for unit and integration tests without real R2.
 *
 * @example
 * ```typescript
 * const bucket = new MockR2Bucket();
 * await bucket.put('test.json', JSON.stringify({ hello: 'world' }));
 * const obj = await bucket.get('test.json');
 * const data = await obj?.json();
 * ```
 */
export class MockR2Bucket implements R2Bucket {
  private storage = new Map<string, { data: ArrayBuffer; metadata?: Record<string, string> }>();

  /**
   * Put an object into the bucket
   */
  async put(
    key: string,
    value: ArrayBuffer | string | Uint8Array,
    options?: { customMetadata?: Record<string, string> }
  ): Promise<R2Object> {
    let data: ArrayBuffer;
    if (typeof value === 'string') {
      data = new TextEncoder().encode(value).buffer as ArrayBuffer;
    } else if (value instanceof Uint8Array) {
      data = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
    } else {
      data = value;
    }

    this.storage.set(key, { data, metadata: options?.customMetadata });
    return new MockR2Object(key, data, options?.customMetadata);
  }

  /**
   * Get an object from the bucket
   */
  async get(key: string): Promise<R2Object | null> {
    const entry = this.storage.get(key);
    if (!entry) return null;
    return new MockR2Object(key, entry.data, entry.metadata);
  }

  /**
   * Get object metadata without body
   */
  async head(key: string): Promise<R2Object | null> {
    return this.get(key);
  }

  /**
   * Delete an object
   */
  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  /**
   * List objects with optional prefix
   */
  async list(options?: R2ListOptions): Promise<R2Objects> {
    const prefix = options?.prefix ?? '';
    const limit = options?.limit ?? 1000;

    let keys = [...this.storage.keys()].filter(k => k.startsWith(prefix)).sort();

    // Handle cursor for pagination
    if (options?.cursor) {
      const cursorIndex = keys.indexOf(options.cursor);
      if (cursorIndex >= 0) {
        keys = keys.slice(cursorIndex + 1);
      }
    }

    const truncated = keys.length > limit;
    const resultKeys = keys.slice(0, limit);

    const objects: R2Object[] = resultKeys.map(key => {
      const entry = this.storage.get(key)!;
      return new MockR2Object(key, entry.data, entry.metadata);
    });

    return {
      objects,
      truncated,
      cursor: truncated ? resultKeys[resultKeys.length - 1] : undefined,
    };
  }

  // ==========================================================================
  // Test utilities
  // ==========================================================================

  /**
   * Clear all stored objects
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Get number of stored objects
   */
  get size(): number {
    return this.storage.size;
  }

  /**
   * Get all keys (for debugging)
   */
  keys(): string[] {
    return [...this.storage.keys()];
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.storage.has(key);
  }
}
