/**
 * ShardRouter - Hash-based routing for writer DO shards
 *
 * Routes writes to appropriate shard DOs based on hash(tenant/table).
 * This enables horizontal scaling by distributing CDC streams across
 * multiple writer DOs instead of funneling through a single Parent DO.
 *
 * @packageDocumentation
 */

/**
 * Shard configuration options
 */
export interface ShardRouterConfig {
  /** Total number of shards (power of 2 recommended) */
  shardCount: number;
  /** Shard namespace binding name (e.g., 'WRITER_SHARDS') */
  namespaceBinding: string;
  /** Optional: Prefix for shard DO IDs */
  shardIdPrefix?: string;
  /** Optional: Custom hash function */
  hashFn?: (key: string) => number;
  /** Optional: Virtual nodes per shard for better distribution */
  virtualNodesPerShard?: number;
  /** Optional: Maximum cache size for routing cache (default: 10000) */
  maxCacheSize?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_SHARD_CONFIG: Omit<ShardRouterConfig, 'shardCount' | 'namespaceBinding'> = {
  shardIdPrefix: 'shard',
  virtualNodesPerShard: 1,
  maxCacheSize: 10000,
};

/**
 * Shard routing key - identifies a unique write destination
 */
export interface ShardKey {
  /** Tenant identifier */
  tenant: string;
  /** Table name or path */
  table: string;
}

/**
 * Resolved shard information
 */
export interface ShardInfo {
  /** Shard number (0 to shardCount - 1) */
  shardNumber: number;
  /** Shard DO ID string */
  shardId: string;
  /** Hash value used for routing */
  hashValue: number;
  /** Original routing key */
  key: ShardKey;
}

/**
 * Shard statistics
 */
export interface ShardStats {
  /** Shard number */
  shardNumber: number;
  /** Number of tenants routed to this shard */
  tenantCount: number;
  /** Number of tables routed to this shard */
  tableCount: number;
  /** List of routing keys assigned to this shard */
  keys: ShardKey[];
}

/**
 * xxHash-inspired 32-bit hash function
 * Fast, well-distributed hash for string keys
 */
function xxhash32(input: string, seed: number = 0): number {
  const PRIME1 = 0x9E3779B1;
  const PRIME2 = 0x85EBCA77;
  const PRIME3 = 0xC2B2AE3D;
  const PRIME4 = 0x27D4EB2F;
  const PRIME5 = 0x165667B1;

  let h32 = seed + PRIME5;
  let i = 0;
  const len = input.length;

  // Process 4-byte chunks
  while (i + 4 <= len) {
    let k = 0;
    for (let j = 0; j < 4; j++) {
      k |= input.charCodeAt(i + j) << (j * 8);
    }
    k = Math.imul(k, PRIME3);
    k = (k << 17) | (k >>> 15);
    k = Math.imul(k, PRIME4);
    h32 ^= k;
    h32 = (h32 << 13) | (h32 >>> 19);
    h32 = Math.imul(h32, PRIME1) + PRIME4;
    i += 4;
  }

  // Process remaining bytes
  while (i < len) {
    h32 ^= Math.imul(input.charCodeAt(i), PRIME5);
    h32 = (h32 << 11) | (h32 >>> 21);
    h32 = Math.imul(h32, PRIME1);
    i++;
  }

  // Final mixing
  h32 ^= len;
  h32 ^= h32 >>> 15;
  h32 = Math.imul(h32, PRIME2);
  h32 ^= h32 >>> 13;
  h32 = Math.imul(h32, PRIME3);
  h32 ^= h32 >>> 16;

  return h32 >>> 0; // Convert to unsigned 32-bit
}

/**
 * ShardRouter - Routes writes to appropriate shard DOs
 *
 * Uses consistent hashing on tenant/table combination to determine
 * which shard DO should handle writes for that partition.
 *
 * @example
 * ```typescript
 * const router = new ShardRouter({
 *   shardCount: 16,
 *   namespaceBinding: 'WRITER_SHARDS'
 * });
 *
 * // Get shard for a tenant/table
 * const shard = router.getShard({ tenant: 'acme', table: 'users' });
 * console.log(shard.shardNumber, shard.shardId);
 *
 * // Get the actual DO stub
 * const stub = router.getShardStub(env.WRITER_SHARDS, {
 *   tenant: 'acme',
 *   table: 'users'
 * });
 * ```
 */
export class ShardRouter {
  private readonly config: Required<ShardRouterConfig>;
  private readonly shardMask: number;
  private readonly isPowerOfTwo: boolean;

  /**
   * Routing cache for consistent routing
   * Maps "tenant/table" -> ShardInfo
   */
  private readonly routingCache: Map<string, ShardInfo> = new Map();

  /**
   * Create a new ShardRouter
   *
   * @param config - Shard configuration
   */
  constructor(config: ShardRouterConfig) {
    if (config.shardCount < 1) {
      throw new Error('shardCount must be at least 1');
    }

    if (config.shardCount > 65536) {
      throw new Error('shardCount must not exceed 65536');
    }

    this.config = {
      ...DEFAULT_SHARD_CONFIG,
      ...config,
      hashFn: config.hashFn ?? xxhash32,
    } as Required<ShardRouterConfig>;

    // Check if shardCount is a power of 2 for fast modulo
    this.isPowerOfTwo = (config.shardCount & (config.shardCount - 1)) === 0;
    this.shardMask = this.isPowerOfTwo ? config.shardCount - 1 : 0;
  }

  /**
   * Get the shard count
   */
  get shardCount(): number {
    return this.config.shardCount;
  }

  /**
   * Get shard information for a given key
   *
   * @param key - Shard routing key (tenant/table)
   * @returns Shard information including shard number and DO ID
   */
  getShard(key: ShardKey): ShardInfo {
    const cacheKey = this.getCacheKey(key);

    // Check cache first
    const cached = this.routingCache.get(cacheKey);
    if (cached) {
      // LRU: Move to end by deleting and re-inserting
      this.routingCache.delete(cacheKey);
      this.routingCache.set(cacheKey, cached);
      return cached;
    }

    // Compute hash
    const hashValue = this.config.hashFn(cacheKey);

    // Map hash to shard number
    const shardNumber = this.hashToShard(hashValue);

    // Generate shard DO ID
    const shardId = this.generateShardId(shardNumber);

    const info: ShardInfo = {
      shardNumber,
      shardId,
      hashValue,
      key,
    };

    // LRU eviction: Remove oldest entries if cache is full
    while (this.routingCache.size >= this.config.maxCacheSize) {
      // Map.keys().next() returns the first (oldest) key
      const oldestKey = this.routingCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.routingCache.delete(oldestKey);
      } else {
        break;
      }
    }

    // Cache the result
    this.routingCache.set(cacheKey, info);

    return info;
  }

  /**
   * Get the shard number for a raw key string
   *
   * @param rawKey - Raw key string (will be hashed)
   * @returns Shard number
   */
  getShardNumber(rawKey: string): number {
    const hashValue = this.config.hashFn(rawKey);
    return this.hashToShard(hashValue);
  }

  /**
   * Get shard DO stub from namespace
   *
   * @param namespace - Durable Object namespace
   * @param key - Shard routing key
   * @returns Durable Object stub for the shard
   */
  getShardStub(namespace: DurableObjectNamespace, key: ShardKey): DurableObjectStub {
    const shard = this.getShard(key);
    const id = namespace.idFromName(shard.shardId);
    return namespace.get(id);
  }

  /**
   * Get all shard stubs from namespace
   *
   * @param namespace - Durable Object namespace
   * @returns Array of shard stubs with their shard numbers
   */
  getAllShardStubs(namespace: DurableObjectNamespace): Array<{ shardNumber: number; stub: DurableObjectStub }> {
    const stubs: Array<{ shardNumber: number; stub: DurableObjectStub }> = [];

    for (let i = 0; i < this.config.shardCount; i++) {
      const shardId = this.generateShardId(i);
      const id = namespace.idFromName(shardId);
      stubs.push({
        shardNumber: i,
        stub: namespace.get(id),
      });
    }

    return stubs;
  }

  /**
   * Generate shard DO ID for a given shard number
   *
   * @param shardNumber - Shard number
   * @returns Shard DO ID string
   */
  generateShardId(shardNumber: number): string {
    if (shardNumber < 0 || shardNumber >= this.config.shardCount) {
      throw new Error(`Shard number ${shardNumber} out of range [0, ${this.config.shardCount})`);
    }

    return `${this.config.shardIdPrefix}-${shardNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Parse shard number from shard ID
   *
   * @param shardId - Shard DO ID string
   * @returns Shard number or null if invalid
   */
  parseShardId(shardId: string): number | null {
    const prefix = `${this.config.shardIdPrefix}-`;
    if (!shardId.startsWith(prefix)) {
      return null;
    }

    const numStr = shardId.slice(prefix.length);
    const num = parseInt(numStr, 10);

    if (isNaN(num) || num < 0 || num >= this.config.shardCount) {
      return null;
    }

    return num;
  }

  /**
   * Get statistics about shard distribution
   *
   * @param keys - Array of routing keys to analyze
   * @returns Per-shard statistics
   */
  getDistributionStats(keys: ShardKey[]): ShardStats[] {
    const shardStats: Map<number, ShardStats> = new Map();

    // Initialize all shards
    for (let i = 0; i < this.config.shardCount; i++) {
      shardStats.set(i, {
        shardNumber: i,
        tenantCount: 0,
        tableCount: 0,
        keys: [],
      });
    }

    // Track unique tenants per shard
    const tenantsPerShard: Map<number, Set<string>> = new Map();
    for (let i = 0; i < this.config.shardCount; i++) {
      tenantsPerShard.set(i, new Set());
    }

    // Route each key
    for (const key of keys) {
      const shard = this.getShard(key);
      const stats = shardStats.get(shard.shardNumber);
      const tenantSet = tenantsPerShard.get(shard.shardNumber);

      if (stats && tenantSet) {
        stats.keys.push(key);
        tenantSet.add(key.tenant);
      }
    }

    // Update counts
    for (const [shardNum, stats] of shardStats) {
      const tenantSet = tenantsPerShard.get(shardNum);
      stats.tableCount = stats.keys.length;
      stats.tenantCount = tenantSet ? tenantSet.size : 0;
    }

    return Array.from(shardStats.values());
  }

  /**
   * Check if keys would be colocated on the same shard
   *
   * @param key1 - First routing key
   * @param key2 - Second routing key
   * @returns True if both keys route to the same shard
   */
  areColocated(key1: ShardKey, key2: ShardKey): boolean {
    return this.getShard(key1).shardNumber === this.getShard(key2).shardNumber;
  }

  /**
   * Get all keys that would route to a specific shard
   *
   * @param keys - Array of routing keys to filter
   * @param shardNumber - Target shard number
   * @returns Keys that route to the specified shard
   */
  getKeysForShard(keys: ShardKey[], shardNumber: number): ShardKey[] {
    return keys.filter(key => this.getShard(key).shardNumber === shardNumber);
  }

  /**
   * Clear the routing cache
   */
  clearCache(): void {
    this.routingCache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.routingCache.size;
  }

  /**
   * Get the maximum cache size
   */
  getMaxCacheSize(): number {
    return this.config.maxCacheSize;
  }

  /**
   * Check if a key is currently in the cache
   *
   * @param key - Shard routing key (tenant/table)
   * @returns True if the key is cached
   */
  isCached(key: ShardKey): boolean {
    const cacheKey = this.getCacheKey(key);
    return this.routingCache.has(cacheKey);
  }

  /**
   * Export configuration for serialization
   */
  toConfig(): ShardRouterConfig {
    return {
      shardCount: this.config.shardCount,
      namespaceBinding: this.config.namespaceBinding,
      shardIdPrefix: this.config.shardIdPrefix,
      virtualNodesPerShard: this.config.virtualNodesPerShard,
    };
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  /**
   * Generate cache key from shard key
   */
  private getCacheKey(key: ShardKey): string {
    return `${key.tenant}/${key.table}`;
  }

  /**
   * Map hash value to shard number
   */
  private hashToShard(hashValue: number): number {
    if (this.isPowerOfTwo) {
      // Fast bitwise AND for power of 2
      return hashValue & this.shardMask;
    }
    // Modulo for non-power-of-2
    return hashValue % this.config.shardCount;
  }
}

/**
 * Create a ShardRouter with sensible defaults
 *
 * @param shardCount - Number of shards
 * @param namespaceBinding - Binding name for shard namespace
 * @returns Configured ShardRouter
 */
export function createShardRouter(
  shardCount: number,
  namespaceBinding: string = 'WRITER_SHARDS'
): ShardRouter {
  return new ShardRouter({
    shardCount,
    namespaceBinding,
  });
}

/**
 * Recommended shard counts for different scales
 */
export const RECOMMENDED_SHARD_COUNTS = {
  /** Small scale: up to 1000 tenants */
  small: 4,
  /** Medium scale: 1000-10000 tenants */
  medium: 16,
  /** Large scale: 10000-100000 tenants */
  large: 64,
  /** Enterprise scale: 100000+ tenants */
  enterprise: 256,
} as const;
