/**
 * @evodb/benchmark - Data Generator
 *
 * Generates benchmark datasets with configurable sizes and distributions.
 * Supports partitioning for parallel query testing.
 */

import type {
  DataGeneratorConfig,
  DataSchema,
  ColumnDef,
  ColumnStats,
  PartitionMetadata,
  GeneratorHint,
} from '../types.js';
import { SeededRandom, createRandom } from '../utils/random.js';

/**
 * Generated dataset with metadata
 */
export interface GeneratedDataset {
  /** Schema used */
  schema: DataSchema;

  /** Total row count */
  rowCount: number;

  /** Partition metadata */
  partitions: PartitionMetadata[];

  /** Total size in bytes (estimated) */
  totalSizeBytes: number;

  /** Data rows (optional, only for small datasets) */
  rows?: Record<string, unknown>[];

  /** Partition data map (partition ID -> rows) */
  partitionData?: Map<string, Record<string, unknown>[]>;
}

/**
 * Data generator for benchmark datasets
 */
export class DataGenerator {
  private readonly config: DataGeneratorConfig;
  private readonly random: SeededRandom;
  private valueCache: Map<string, unknown[]> = new Map();

  constructor(config: DataGeneratorConfig) {
    this.config = config;
    this.random = createRandom(config.seed ?? Date.now());
  }

  /**
   * Generate complete dataset
   */
  generate(options?: { includeData?: boolean }): GeneratedDataset {
    const { schema, rowCount, partitionCount, partitionKey } = this.config;
    const includeData = options?.includeData ?? (rowCount <= 100_000);

    // Calculate rows per partition
    const baseRowsPerPartition = Math.floor(rowCount / partitionCount);
    const extraRows = rowCount % partitionCount;

    const partitions: PartitionMetadata[] = [];
    const partitionData = new Map<string, Record<string, unknown>[]>();
    let totalSizeBytes = 0;

    // Generate data for each partition
    for (let p = 0; p < partitionCount; p++) {
      const partitionRowCount = baseRowsPerPartition + (p < extraRows ? 1 : 0);
      const partitionId = `partition_${p.toString().padStart(4, '0')}`;

      // Generate partition value
      const partitionValue = this.generatePartitionValue(p, partitionCount, partitionKey);

      // Generate rows for this partition
      const rows: Record<string, unknown>[] = [];
      const columnStats: Record<string, ColumnStats> = {};

      // Initialize column stats
      for (const col of schema.columns) {
        columnStats[col.name] = {
          min: undefined,
          max: undefined,
          nullCount: 0,
          distinctCount: 0,
        };
      }

      const distinctValues: Map<string, Set<unknown>> = new Map();
      for (const col of schema.columns) {
        distinctValues.set(col.name, new Set());
      }

      // Generate rows
      for (let i = 0; i < partitionRowCount; i++) {
        const row: Record<string, unknown> = {};

        for (const col of schema.columns) {
          let value: unknown;

          if (col.name === partitionKey) {
            value = partitionValue;
          } else {
            value = this.generateValue(col, i, p * baseRowsPerPartition + i);
          }

          row[col.name] = value;

          // Update stats
          const distinctSet = distinctValues.get(col.name);
          if (distinctSet) {
            this.updateColumnStats(columnStats[col.name], distinctSet, value);
          }
        }

        rows.push(row);
      }

      // Finalize stats
      for (const col of schema.columns) {
        const distinctSet = distinctValues.get(col.name);
        if (distinctSet) {
          columnStats[col.name].distinctCount = distinctSet.size;
        }
      }

      // Estimate partition size
      const partitionSize = this.estimateSize(rows);
      totalSizeBytes += partitionSize;

      partitions.push({
        id: partitionId,
        partitionValues: { [partitionKey]: partitionValue },
        rowCount: partitionRowCount,
        sizeBytes: partitionSize,
        columnStats,
        files: [`${partitionId}/data.bin`],
      });

      if (includeData) {
        partitionData.set(partitionId, rows);
      }
    }

    const result: GeneratedDataset = {
      schema,
      rowCount,
      partitions,
      totalSizeBytes,
    };

    if (includeData) {
      result.partitionData = partitionData;
      // Flatten for convenience
      result.rows = Array.from(partitionData.values()).flat();
    }

    return result;
  }

  /**
   * Generate streaming rows (for large datasets)
   */
  *generateStreaming(): Generator<Record<string, unknown>, void, undefined> {
    const { schema, rowCount, partitionCount, partitionKey } = this.config;
    const rowsPerPartition = Math.floor(rowCount / partitionCount);

    for (let p = 0; p < partitionCount; p++) {
      const partitionValue = this.generatePartitionValue(p, partitionCount, partitionKey);
      const partitionRows = p < rowCount % partitionCount
        ? rowsPerPartition + 1
        : rowsPerPartition;

      for (let i = 0; i < partitionRows; i++) {
        const row: Record<string, unknown> = {};
        const globalIndex = p * rowsPerPartition + i;

        for (const col of schema.columns) {
          if (col.name === partitionKey) {
            row[col.name] = partitionValue;
          } else {
            row[col.name] = this.generateValue(col, i, globalIndex);
          }
        }

        yield row;
      }
    }
  }

  /**
   * Generate partition value based on partition scheme
   */
  private generatePartitionValue(
    partitionIndex: number,
    totalPartitions: number,
    partitionKey: string
  ): unknown {
    const col = this.config.schema.columns.find(c => c.name === partitionKey);
    if (!col) {
      return `partition_${partitionIndex}`;
    }

    switch (col.type) {
      case 'timestamp':
      case 'date': {
        // Time-based partitioning
        const startTime = col.generator?.min ?? (Date.now() - 365 * 24 * 60 * 60 * 1000);
        const endTime = col.generator?.max ?? Date.now();
        const timeRange = (endTime as number) - (startTime as number);
        const partitionStart = (startTime as number) + (timeRange * partitionIndex) / totalPartitions;
        return new Date(partitionStart).toISOString().split('T')[0];
      }

      case 'int32':
      case 'int64': {
        // Range partitioning
        return partitionIndex;
      }

      case 'string':
      default: {
        // Hash-like partitioning
        return `p${partitionIndex.toString().padStart(4, '0')}`;
      }
    }
  }

  /**
   * Generate a single value for a column
   */
  private generateValue(col: ColumnDef, _rowIndex: number, globalIndex: number): unknown {
    // Check for null
    if (col.nullable && this.random.random() < (this.config.nullPercentage ?? 0.02)) {
      return null;
    }

    const hint = col.generator;

    switch (col.type) {
      case 'uuid':
        return this.random.uuid();

      case 'int32':
      case 'int64':
        return this.generateNumber(hint, globalIndex);

      case 'float64':
        return this.generateFloat(hint, globalIndex);

      case 'string':
        return this.generateString(hint, col.name, globalIndex);

      case 'bool':
        return this.random.bool(0.5);

      case 'timestamp':
        return this.generateTimestamp(hint, globalIndex);

      case 'date':
        return this.generateDate(hint, globalIndex);

      case 'json':
        return this.generateJson();

      default:
        return null;
    }
  }

  /**
   * Generate numeric value
   */
  private generateNumber(hint: GeneratorHint | undefined, index: number): number {
    if (!hint) {
      return this.random.int(0, 1000000);
    }

    const min = hint.min ?? 0;
    const max = hint.max ?? 1000000;

    switch (hint.type) {
      case 'sequential':
        return min + index;

      case 'uniform':
        return this.random.int(min, max);

      case 'zipf':
        if (hint.values) {
          const idx = this.random.zipf(hint.values.length, hint.zipfSkew ?? 1.0);
          return hint.values[idx] as number;
        }
        return min + this.random.zipf(max - min + 1, hint.zipfSkew ?? 1.0);

      case 'gaussian':
        return Math.round(
          Math.max(min, Math.min(max, this.random.gaussian(hint.mean ?? (min + max) / 2, hint.stdDev ?? (max - min) / 6)))
        );

      default:
        return this.random.int(min, max);
    }
  }

  /**
   * Generate float value
   */
  private generateFloat(hint: GeneratorHint | undefined, index: number): number {
    if (!hint) {
      return this.random.float(0, 1000);
    }

    const min = hint.min ?? 0;
    const max = hint.max ?? 1000;

    switch (hint.type) {
      case 'sequential':
        return min + index * 0.1;

      case 'uniform':
        return this.random.float(min, max);

      case 'gaussian':
        return Math.max(min, Math.min(max, this.random.gaussian(hint.mean ?? (min + max) / 2, hint.stdDev ?? (max - min) / 6)));

      default:
        return this.random.float(min, max);
    }
  }

  /**
   * Generate string value
   */
  private generateString(hint: GeneratorHint | undefined, colName: string, index: number): string {
    if (!hint) {
      return this.random.string(10);
    }

    const prefix = hint.prefix ?? '';
    const cardinality = hint.cardinality ?? 1000;

    // Cache values for consistent cardinality
    const cacheKey = `${colName}_${cardinality}`;
    if (!this.valueCache.has(cacheKey)) {
      if (hint.values) {
        this.valueCache.set(cacheKey, hint.values);
      } else {
        const values: string[] = [];
        for (let i = 0; i < cardinality; i++) {
          const len = hint.lengthRange
            ? this.random.int(hint.lengthRange[0], hint.lengthRange[1])
            : 10;
          values.push(`${prefix}${this.random.string(len)}`);
        }
        this.valueCache.set(cacheKey, values);
      }
    }

    const values = this.valueCache.get(cacheKey)!;

    switch (hint.type) {
      case 'sequential':
        return `${prefix}${index}`;

      case 'enum':
        return this.random.pick(values) as string;

      case 'zipf':
        return values[this.random.zipf(values.length, hint.zipfSkew ?? 1.0)] as string;

      case 'uniform':
      default:
        return this.random.pick(values) as string;
    }
  }

  /**
   * Generate timestamp value
   */
  private generateTimestamp(hint: GeneratorHint | undefined, index: number): number {
    const now = Date.now();
    const yearAgo = now - 365 * 24 * 60 * 60 * 1000;

    if (!hint) {
      return this.random.int(yearAgo, now);
    }

    const min = hint.min ?? yearAgo;
    const max = hint.max ?? now;

    switch (hint.type) {
      case 'sequential':
        const range = (max as number) - (min as number);
        const totalRows = this.config.rowCount;
        return (min as number) + Math.floor((range * index) / totalRows);

      default:
        return this.random.int(min as number, max as number);
    }
  }

  /**
   * Generate date value (YYYY-MM-DD)
   */
  private generateDate(hint: GeneratorHint | undefined, index: number): string {
    const timestamp = this.generateTimestamp(hint, index);
    return new Date(timestamp).toISOString().split('T')[0];
  }

  /**
   * Generate JSON value
   */
  private generateJson(): Record<string, unknown> {
    // Generate a small random JSON object
    const fields = this.random.int(1, 5);
    const result: Record<string, unknown> = {};

    for (let i = 0; i < fields; i++) {
      const key = `field_${this.random.string(5)}`;
      const valueType = this.random.int(0, 3);

      switch (valueType) {
        case 0:
          result[key] = this.random.int(0, 1000);
          break;
        case 1:
          result[key] = this.random.string(10);
          break;
        case 2:
          result[key] = this.random.bool();
          break;
        case 3:
          result[key] = [this.random.int(0, 100), this.random.int(0, 100)];
          break;
      }
    }

    return result;
  }

  /**
   * Update column statistics
   */
  private updateColumnStats(
    stats: ColumnStats,
    distinctSet: Set<unknown>,
    value: unknown
  ): void {
    if (value === null) {
      stats.nullCount++;
      return;
    }

    distinctSet.add(value);

    if (typeof value === 'number' || typeof value === 'string') {
      if (stats.min === undefined || value < (stats.min as number | string)) {
        stats.min = value;
      }
      if (stats.max === undefined || value > (stats.max as number | string)) {
        stats.max = value;
      }
    }
  }

  /**
   * Estimate size of rows in bytes
   */
  private estimateSize(rows: Record<string, unknown>[]): number {
    if (rows.length === 0) return 0;

    // Sample a few rows to estimate average size
    const sampleSize = Math.min(100, rows.length);
    let totalSize = 0;

    for (let i = 0; i < sampleSize; i++) {
      const row = rows[Math.floor(i * rows.length / sampleSize)];
      totalSize += JSON.stringify(row).length;
    }

    const avgSize = totalSize / sampleSize;
    return Math.round(avgSize * rows.length);
  }
}

/**
 * Quick generator function for common use cases
 */
export function generateDataset(
  schema: DataSchema,
  rowCount: number,
  options?: {
    partitionCount?: number;
    seed?: number;
    includeData?: boolean;
  }
): GeneratedDataset {
  const partitionKey = schema.columns.find(c => c.partitionKey)?.name ?? schema.columns[0].name;

  const generator = new DataGenerator({
    schema,
    rowCount,
    partitionCount: options?.partitionCount ?? Math.ceil(rowCount / 10000),
    partitionKey,
    seed: options?.seed,
  });

  return generator.generate({ includeData: options?.includeData ?? (rowCount <= 100_000) });
}

/**
 * Generate dataset for specific size preset
 */
export function generateForSize(
  schema: DataSchema,
  size: '1K' | '10K' | '100K' | '1M' | '10M' | '100M',
  options?: { seed?: number; includeData?: boolean }
): GeneratedDataset {
  const rowCounts: Record<string, number> = {
    '1K': 1_000,
    '10K': 10_000,
    '100K': 100_000,
    '1M': 1_000_000,
    '10M': 10_000_000,
    '100M': 100_000_000,
  };

  const partitionCounts: Record<string, number> = {
    '1K': 1,
    '10K': 4,
    '100K': 16,
    '1M': 64,
    '10M': 256,
    '100M': 1024,
  };

  return generateDataset(schema, rowCounts[size], {
    partitionCount: partitionCounts[size],
    seed: options?.seed,
    includeData: options?.includeData ?? rowCounts[size] <= 100_000,
  });
}
