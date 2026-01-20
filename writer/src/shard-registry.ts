/**
 * ShardRegistry - Shard discovery and metadata for readers
 *
 * Provides readers with the ability to:
 * - Discover all active shards
 * - Query shard metadata (block counts, health, etc.)
 * - Find shards containing specific tenant/table data
 * - Aggregate statistics across all shards
 *
 * @packageDocumentation
 */

import type { ShardRouter, ShardKey, ShardInfo } from './shard-router.js';
import type { WriterStats, BlockMetadata, PartitionMode, SourceStats } from './types.js';

/**
 * Shard metadata returned by shard DOs
 */
export interface ShardMetadata {
  /** Shard number */
  shardNumber: number;
  /** Shard DO ID */
  shardId: string;
  /** Health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Number of blocks in R2 */
  blockCount: number;
  /** Number of pending blocks in DO storage */
  pendingBlockCount: number;
  /** Total rows written */
  totalRows: number;
  /** Total bytes written to R2 */
  totalBytesR2: number;
  /** Number of connected child DOs */
  connectedSources: number;
  /** Buffer entry count */
  bufferEntryCount: number;
  /** Last flush time */
  lastFlushTime: number | null;
  /** Partition mode */
  partitionMode: PartitionMode;
  /** Tenant/table assignments */
  assignments: ShardAssignment[];
}

/**
 * Tenant/table assignment to a shard
 */
export interface ShardAssignment {
  /** Tenant identifier */
  tenant: string;
  /** Table name */
  table: string;
  /** Entry count from this assignment */
  entryCount: number;
  /** Last activity time */
  lastActivityTime: number;
}

/**
 * Aggregated registry statistics
 */
export interface RegistryStats {
  /** Total number of shards */
  totalShards: number;
  /** Number of healthy shards */
  healthyShards: number;
  /** Number of degraded shards */
  degradedShards: number;
  /** Number of unhealthy shards */
  unhealthyShards: number;
  /** Total blocks across all shards */
  totalBlocks: number;
  /** Total pending blocks across all shards */
  totalPendingBlocks: number;
  /** Total rows across all shards */
  totalRows: number;
  /** Total bytes in R2 across all shards */
  totalBytesR2: number;
  /** Total connected sources across all shards */
  totalConnectedSources: number;
  /** Average blocks per shard */
  avgBlocksPerShard: number;
  /** Max blocks on a single shard */
  maxBlocksOnShard: number;
  /** Min blocks on a single shard */
  minBlocksOnShard: number;
  /** Standard deviation of block distribution */
  blockDistributionStdDev: number;
}

/**
 * Query result for finding shards with specific data
 */
export interface ShardQueryResult {
  /** Shards containing the requested data */
  shards: ShardMetadata[];
  /** Total result count */
  totalCount: number;
  /** Query execution time in ms */
  queryTimeMs: number;
}

/**
 * Block location with shard information
 */
export interface ShardedBlockLocation {
  /** Block metadata */
  block: BlockMetadata;
  /** Shard number where block is located */
  shardNumber: number;
  /** Shard DO ID */
  shardId: string;
  /** R2 key for the block */
  r2Key: string;
}

/**
 * ShardRegistry - Discovery and metadata service for sharded writers
 *
 * Used by readers to:
 * 1. Discover which shards exist and their health
 * 2. Find shards containing data for specific tenants/tables
 * 3. Aggregate statistics across all shards
 * 4. Plan read operations across shards
 *
 * @example
 * ```typescript
 * const router = new ShardRouter({ shardCount: 16, namespaceBinding: 'WRITER_SHARDS' });
 * const registry = new ShardRegistry(router, env.WRITER_SHARDS);
 *
 * // Get all shard metadata
 * const metadata = await registry.getAllShardMetadata();
 *
 * // Find shards for a specific tenant
 * const result = await registry.findShardsForTenant('acme');
 *
 * // Get aggregated statistics
 * const stats = await registry.getRegistryStats();
 * ```
 */
export class ShardRegistry {
  private readonly router: ShardRouter;
  private readonly namespace: DurableObjectNamespace;

  /**
   * Cache for shard metadata
   * Maps shardNumber -> { metadata, fetchedAt }
   */
  private readonly metadataCache: Map<number, { metadata: ShardMetadata; fetchedAt: number }> = new Map();

  /** Cache TTL in milliseconds (default: 30 seconds) */
  private readonly cacheTtlMs: number;

  /** Timeout for shard queries in milliseconds */
  private readonly queryTimeoutMs: number;

  /**
   * Create a new ShardRegistry
   *
   * @param router - ShardRouter instance
   * @param namespace - Durable Object namespace for shard DOs
   * @param options - Optional configuration
   */
  constructor(
    router: ShardRouter,
    namespace: DurableObjectNamespace,
    options?: {
      /** Cache TTL in milliseconds (default: 30000) */
      cacheTtlMs?: number;
      /** Query timeout in milliseconds (default: 5000) */
      queryTimeoutMs?: number;
    }
  ) {
    this.router = router;
    this.namespace = namespace;
    this.cacheTtlMs = options?.cacheTtlMs ?? 30000;
    this.queryTimeoutMs = options?.queryTimeoutMs ?? 5000;
  }

  /**
   * Get the underlying router
   */
  getRouter(): ShardRouter {
    return this.router;
  }

  /**
   * Get shard count
   */
  get shardCount(): number {
    return this.router.shardCount;
  }

  /**
   * Get metadata for a specific shard
   *
   * @param shardNumber - Shard number to query
   * @param forceRefresh - Bypass cache if true
   * @returns Shard metadata
   */
  async getShardMetadata(shardNumber: number, forceRefresh: boolean = false): Promise<ShardMetadata> {
    // Check cache
    if (!forceRefresh) {
      const cached = this.metadataCache.get(shardNumber);
      if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
        return cached.metadata;
      }
    }

    // Fetch from shard DO
    const shardId = this.router.generateShardId(shardNumber);
    const id = this.namespace.idFromName(shardId);
    const stub = this.namespace.get(id);

    try {
      const response = await this.fetchWithTimeout(stub, '/stats');
      const stats = await response.json() as WriterStats;

      const metadata = this.statsToMetadata(shardNumber, shardId, stats);

      // Update cache
      this.metadataCache.set(shardNumber, {
        metadata,
        fetchedAt: Date.now(),
      });

      return metadata;
    } catch (error) {
      // Return degraded metadata on error
      return {
        shardNumber,
        shardId,
        status: 'unhealthy',
        blockCount: 0,
        pendingBlockCount: 0,
        totalRows: 0,
        totalBytesR2: 0,
        connectedSources: 0,
        bufferEntryCount: 0,
        lastFlushTime: null,
        partitionMode: 'do-sqlite',
        assignments: [],
      };
    }
  }

  /**
   * Get metadata for all shards
   *
   * @param forceRefresh - Bypass cache if true
   * @returns Array of shard metadata
   */
  async getAllShardMetadata(forceRefresh: boolean = false): Promise<ShardMetadata[]> {
    const promises: Promise<ShardMetadata>[] = [];

    for (let i = 0; i < this.router.shardCount; i++) {
      promises.push(this.getShardMetadata(i, forceRefresh));
    }

    return Promise.all(promises);
  }

  /**
   * Get aggregated registry statistics
   *
   * @param forceRefresh - Bypass cache if true
   * @returns Aggregated statistics
   */
  async getRegistryStats(forceRefresh: boolean = false): Promise<RegistryStats> {
    const metadata = await this.getAllShardMetadata(forceRefresh);

    let totalBlocks = 0;
    let totalPendingBlocks = 0;
    let totalRows = 0;
    let totalBytesR2 = 0;
    let totalConnectedSources = 0;
    let healthyShards = 0;
    let degradedShards = 0;
    let unhealthyShards = 0;
    let maxBlocks = 0;
    let minBlocks = Infinity;
    const blockCounts: number[] = [];

    for (const shard of metadata) {
      totalBlocks += shard.blockCount;
      totalPendingBlocks += shard.pendingBlockCount;
      totalRows += shard.totalRows;
      totalBytesR2 += shard.totalBytesR2;
      totalConnectedSources += shard.connectedSources;
      blockCounts.push(shard.blockCount);

      if (shard.blockCount > maxBlocks) maxBlocks = shard.blockCount;
      if (shard.blockCount < minBlocks) minBlocks = shard.blockCount;

      switch (shard.status) {
        case 'healthy':
          healthyShards++;
          break;
        case 'degraded':
          degradedShards++;
          break;
        case 'unhealthy':
          unhealthyShards++;
          break;
      }
    }

    if (minBlocks === Infinity) minBlocks = 0;

    const avgBlocksPerShard = metadata.length > 0 ? totalBlocks / metadata.length : 0;

    // Calculate standard deviation
    let stdDev = 0;
    if (blockCounts.length > 0) {
      const mean = avgBlocksPerShard;
      const squaredDiffs = blockCounts.map(count => Math.pow(count - mean, 2));
      const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
      stdDev = Math.sqrt(avgSquaredDiff);
    }

    return {
      totalShards: metadata.length,
      healthyShards,
      degradedShards,
      unhealthyShards,
      totalBlocks,
      totalPendingBlocks,
      totalRows,
      totalBytesR2,
      totalConnectedSources,
      avgBlocksPerShard,
      maxBlocksOnShard: maxBlocks,
      minBlocksOnShard: minBlocks,
      blockDistributionStdDev: stdDev,
    };
  }

  /**
   * Find shards for a specific tenant
   *
   * @param tenant - Tenant identifier
   * @returns Query result with matching shards
   */
  async findShardsForTenant(tenant: string): Promise<ShardQueryResult> {
    const startTime = Date.now();
    const metadata = await this.getAllShardMetadata();

    const matchingShards = metadata.filter(shard =>
      shard.assignments.some(a => a.tenant === tenant)
    );

    return {
      shards: matchingShards,
      totalCount: matchingShards.length,
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Find shards for a specific tenant/table combination
   *
   * @param key - Shard routing key
   * @returns Query result with matching shards
   */
  async findShardsForKey(key: ShardKey): Promise<ShardQueryResult> {
    const startTime = Date.now();

    // Use router to determine the exact shard
    const shardInfo = this.router.getShard(key);
    const metadata = await this.getShardMetadata(shardInfo.shardNumber);

    return {
      shards: [metadata],
      totalCount: 1,
      queryTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get all blocks across all shards for a tenant/table
   *
   * @param key - Shard routing key
   * @returns Array of block locations
   */
  async getBlocksForKey(key: ShardKey): Promise<ShardedBlockLocation[]> {
    const shardInfo = this.router.getShard(key);
    const shardId = shardInfo.shardId;
    const id = this.namespace.idFromName(shardId);
    const stub = this.namespace.get(id);

    try {
      const response = await this.fetchWithTimeout(stub, '/blocks');
      const blocks = await response.json() as BlockMetadata[];

      return blocks.map(block => ({
        block,
        shardNumber: shardInfo.shardNumber,
        shardId,
        r2Key: block.r2Key,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get all blocks across all shards
   *
   * @returns Array of all block locations
   */
  async getAllBlocks(): Promise<ShardedBlockLocation[]> {
    const allBlocks: ShardedBlockLocation[] = [];

    const promises = [];
    for (let i = 0; i < this.router.shardCount; i++) {
      const shardId = this.router.generateShardId(i);
      promises.push(
        (async () => {
          const id = this.namespace.idFromName(shardId);
          const stub = this.namespace.get(id);
          try {
            const response = await this.fetchWithTimeout(stub, '/blocks');
            const blocks = await response.json() as BlockMetadata[];
            return blocks.map(block => ({
              block,
              shardNumber: i,
              shardId,
              r2Key: block.r2Key,
            }));
          } catch {
            return [];
          }
        })()
      );
    }

    const results = await Promise.all(promises);
    for (const blocks of results) {
      allBlocks.push(...blocks);
    }

    return allBlocks;
  }

  /**
   * Find healthy shards
   *
   * @returns Array of healthy shard metadata
   */
  async getHealthyShards(): Promise<ShardMetadata[]> {
    const metadata = await this.getAllShardMetadata();
    return metadata.filter(shard => shard.status === 'healthy');
  }

  /**
   * Find degraded or unhealthy shards
   *
   * @returns Array of problematic shard metadata
   */
  async getProblematicShards(): Promise<ShardMetadata[]> {
    const metadata = await this.getAllShardMetadata();
    return metadata.filter(shard => shard.status !== 'healthy');
  }

  /**
   * Get shard info for a key without fetching full metadata
   *
   * @param key - Shard routing key
   * @returns Shard info from router
   */
  getShardInfo(key: ShardKey): ShardInfo {
    return this.router.getShard(key);
  }

  /**
   * Clear the metadata cache
   */
  clearCache(): void {
    this.metadataCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.metadataCache.size,
      hitRate: 0, // Would need to track hits/misses to calculate
    };
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  /**
   * Fetch with timeout
   */
  private async fetchWithTimeout(stub: DurableObjectStub, path: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.queryTimeoutMs);

    try {
      const response = await stub.fetch(`https://shard${path}`, {
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Convert WriterStats to ShardMetadata
   */
  private statsToMetadata(
    shardNumber: number,
    shardId: string,
    stats: WriterStats
  ): ShardMetadata {
    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (stats.blocks.pendingBlockCount > 10) {
      status = 'unhealthy';
    } else if (stats.blocks.pendingBlockCount > 0 || stats.buffer.entryCount > 50000) {
      status = 'degraded';
    }

    // Convert source stats to assignments
    // Handle both Map and plain object (from JSON serialization)
    const assignments: ShardAssignment[] = [];
    if (stats.sources) {
      const entries: Array<[string, SourceStats]> =
        stats.sources instanceof Map
          ? Array.from(stats.sources.entries())
          : Object.entries(stats.sources);

      for (const [sourceId, sourceStats] of entries) {
        // Parse tenant/table from sourceId if possible
        const parts = sourceId.split('/');
        assignments.push({
          tenant: parts[0] || sourceId,
          table: parts[1] || 'default',
          entryCount: sourceStats.entriesReceived,
          lastActivityTime: sourceStats.lastEntryTime,
        });
      }
    }

    return {
      shardNumber,
      shardId,
      status,
      blockCount: stats.blocks.r2BlockCount,
      pendingBlockCount: stats.blocks.pendingBlockCount,
      totalRows: stats.blocks.totalRows,
      totalBytesR2: stats.blocks.totalBytesR2,
      connectedSources: assignments.filter(a => a.lastActivityTime > Date.now() - 60000).length,
      bufferEntryCount: stats.buffer.entryCount,
      lastFlushTime: stats.timing.lastFlushTime,
      partitionMode: stats.partitionMode,
      assignments,
    };
  }
}

/**
 * Create a ShardRegistry with router and namespace
 *
 * @param router - ShardRouter instance
 * @param namespace - Durable Object namespace
 * @returns Configured ShardRegistry
 */
export function createShardRegistry(
  router: ShardRouter,
  namespace: DurableObjectNamespace
): ShardRegistry {
  return new ShardRegistry(router, namespace);
}
