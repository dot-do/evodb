/**
 * Tests for Map-Reduce Pattern
 */

import { describe, it, expect } from 'vitest';
import {
  mapReduce,
  chunkPartitioner,
  hashPartitioner,
  sumReducer,
  countReducer,
  minReducer,
  maxReducer,
  avgReducer,
  aggregationReducer,
  aggregationChain,
  wordCountChain,
  groupedAggregationChain,
  calculateMapReduceCost,
  type MapReduceConfig,
  type PartialAggregation,
  type AggregationType,
} from './map-reduce.js';
import { type ParallelStep, type PartitionSpec } from '../types.js';

describe('mapReduce builder', () => {
  it('should create a map-reduce chain without split', () => {
    const config: MapReduceConfig = {
      id: 'test-mr',
      name: 'Test Map Reduce',
      map: {
        partitionerId: 'chunk-partitioner',
        maxMappers: 5,
        snippetId: 'mapper',
      },
      reduce: {
        snippetId: 'reducer',
      },
    };

    const chain = mapReduce(config);

    expect(chain.id).toBe('test-mr');
    expect(chain.name).toBe('Test Map Reduce');
    expect(chain.steps).toHaveLength(2); // map + reduce
    expect(chain.steps[0].name).toBe('Map');
    expect(chain.steps[1].name).toBe('Reduce');
  });

  it('should create a map-reduce chain with split', () => {
    const config: MapReduceConfig = {
      id: 'test-mr',
      name: 'Test Map Reduce',
      split: {
        snippetId: 'splitter',
      },
      map: {
        partitionerId: 'chunk-partitioner',
        maxMappers: 5,
        snippetId: 'mapper',
      },
      reduce: {
        snippetId: 'reducer',
      },
    };

    const chain = mapReduce(config);

    expect(chain.steps).toHaveLength(3); // split + map + reduce
    expect(chain.steps[0].name).toBe('Split');
    expect(chain.steps[1].name).toBe('Map');
    expect(chain.steps[2].name).toBe('Reduce');
  });

  it('should set map step as parallel with correct maxParallelism', () => {
    const config: MapReduceConfig = {
      id: 'test-mr',
      name: 'Test',
      map: {
        partitionerId: 'partitioner',
        maxMappers: 10,
        snippetId: 'mapper',
      },
      reduce: {
        snippetId: 'reducer',
      },
    };

    const chain = mapReduce(config);
    const mapStep = chain.steps.find(s => s.name === 'Map') as ParallelStep;

    expect(mapStep.mode).toBe('parallel');
    expect(mapStep.maxParallelism).toBe(10);
  });

  it('should set reduce step as sequential', () => {
    const config: MapReduceConfig = {
      id: 'test-mr',
      name: 'Test',
      map: {
        partitionerId: 'partitioner',
        maxMappers: 5,
        snippetId: 'mapper',
      },
      reduce: {
        snippetId: 'reducer',
      },
    };

    const chain = mapReduce(config);
    const reduceStep = chain.steps.find(s => s.name === 'Reduce');

    expect(reduceStep?.mode).toBe('sequential');
  });

  it('should apply custom resource estimates', () => {
    const config: MapReduceConfig = {
      id: 'test-mr',
      name: 'Test',
      map: {
        partitionerId: 'partitioner',
        maxMappers: 5,
        snippetId: 'mapper',
        resourceEstimate: { subrequests: 3, cpuMs: 4, memoryBytes: 16 * 1024 * 1024 },
      },
      reduce: {
        snippetId: 'reducer',
        resourceEstimate: { subrequests: 0, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
      },
    };

    const chain = mapReduce(config);
    const mapStep = chain.steps.find(s => s.name === 'Map');
    const reduceStep = chain.steps.find(s => s.name === 'Reduce');

    expect(mapStep?.resourceEstimate.subrequests).toBe(3);
    expect(mapStep?.resourceEstimate.cpuMs).toBe(4);
    expect(reduceStep?.resourceEstimate.subrequests).toBe(0);
    expect(reduceStep?.resourceEstimate.cpuMs).toBe(2);
  });

  it('should include description if provided', () => {
    const config: MapReduceConfig = {
      id: 'test-mr',
      name: 'Test',
      description: 'Custom description',
      map: {
        partitionerId: 'partitioner',
        maxMappers: 5,
        snippetId: 'mapper',
      },
      reduce: {
        snippetId: 'reducer',
      },
    };

    const chain = mapReduce(config);

    expect(chain.description).toBe('Custom description');
  });

  it('should use default description if not provided', () => {
    const config: MapReduceConfig = {
      id: 'test-mr',
      name: 'Test',
      map: {
        partitionerId: 'partitioner',
        maxMappers: 5,
        snippetId: 'mapper',
      },
      reduce: {
        snippetId: 'reducer',
      },
    };

    const chain = mapReduce(config);

    expect(chain.description).toBe('Map-reduce pattern chain');
  });
});

describe('chunkPartitioner', () => {
  it('should partition array into chunks of specified size', () => {
    const partitioner = chunkPartitioner<number>(3);
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const partitions = partitioner(input, 10);

    expect(partitions).toHaveLength(4);
    expect(partitions[0].input).toEqual([1, 2, 3]);
    expect(partitions[1].input).toEqual([4, 5, 6]);
    expect(partitions[2].input).toEqual([7, 8, 9]);
    expect(partitions[3].input).toEqual([10]);
  });

  it('should respect maxPartitions limit', () => {
    const partitioner = chunkPartitioner<number>(2);
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    const partitions = partitioner(input, 3);

    expect(partitions.length).toBeLessThanOrEqual(3);
  });

  it('should include metadata with start and end indices', () => {
    const partitioner = chunkPartitioner<number>(3);
    const input = [1, 2, 3, 4, 5];

    const partitions = partitioner(input, 10);

    expect(partitions[0].metadata).toEqual({ startIndex: 0, endIndex: 3 });
    expect(partitions[1].metadata).toEqual({ startIndex: 3, endIndex: 5 });
  });

  it('should handle empty input', () => {
    const partitioner = chunkPartitioner<number>(3);
    const partitions = partitioner([], 10);

    expect(partitions).toHaveLength(0);
  });

  it('should set correct partition indices', () => {
    const partitioner = chunkPartitioner<number>(2);
    const input = [1, 2, 3, 4, 5];

    const partitions = partitioner(input, 10);

    expect(partitions.map(p => p.index)).toEqual([0, 1, 2]);
  });
});

describe('hashPartitioner', () => {
  it('should partition items by key hash', () => {
    const partitioner = hashPartitioner<{ key: string; value: number }>();
    const input = [
      { key: 'a', value: 1 },
      { key: 'b', value: 2 },
      { key: 'a', value: 3 },
      { key: 'c', value: 4 },
    ];

    const partitions = partitioner(input, 10);

    // Items with same key should be in same partition
    type Item = { key: string; value: number };
    const partitionA = partitions.find(p => (p.input as Item[]).some(i => i.key === 'a'));
    const itemsWithKeyA = (partitionA?.input as Item[]).filter(i => i.key === 'a');
    expect(itemsWithKeyA).toHaveLength(2);
  });

  it('should respect maxPartitions limit via modulo', () => {
    const partitioner = hashPartitioner<{ key: string }>();
    const input = Array.from({ length: 100 }, (_, i) => ({ key: `key-${i}` }));

    const partitions = partitioner(input, 5);

    // All partition indices should be 0-4
    partitions.forEach(p => {
      expect(p.index).toBeGreaterThanOrEqual(0);
      expect(p.index).toBeLessThan(5);
    });
  });

  it('should include bucket metadata', () => {
    const partitioner = hashPartitioner<{ key: string }>();
    const input = [{ key: 'test' }];

    const partitions = partitioner(input, 10);

    expect(partitions[0].metadata?.bucket).toBeDefined();
  });

  it('should accept custom hash function', () => {
    const customHash = (key: string) => key.length; // Simple hash by length
    const partitioner = hashPartitioner<{ key: string }>(customHash);

    const input = [
      { key: 'a' },    // length 1
      { key: 'bb' },   // length 2
      { key: 'c' },    // length 1
    ];

    const partitions = partitioner(input, 10);

    // 'a' and 'c' should be in same partition (same length)
    const partition1 = partitions.find(p => p.index === 1);
    expect((partition1?.input as { key: string }[]).length).toBe(2);
  });
});

describe('Aggregation Reducers', () => {
  describe('sumReducer', () => {
    it('should sum all partial values', () => {
      expect(sumReducer([1, 2, 3, 4, 5])).toBe(15);
    });

    it('should return 0 for empty array', () => {
      expect(sumReducer([])).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(sumReducer([-1, 2, -3, 4])).toBe(2);
    });
  });

  describe('countReducer', () => {
    it('should sum all partial counts', () => {
      expect(countReducer([10, 20, 30])).toBe(60);
    });

    it('should return 0 for empty array', () => {
      expect(countReducer([])).toBe(0);
    });
  });

  describe('minReducer', () => {
    it('should return minimum value', () => {
      expect(minReducer([5, 2, 8, 1, 9])).toBe(1);
    });

    it('should handle negative numbers', () => {
      expect(minReducer([5, -2, 8, -10, 9])).toBe(-10);
    });
  });

  describe('maxReducer', () => {
    it('should return maximum value', () => {
      expect(maxReducer([5, 2, 8, 1, 9])).toBe(9);
    });

    it('should handle negative numbers', () => {
      expect(maxReducer([-5, -2, -8, -1, -9])).toBe(-1);
    });
  });

  describe('avgReducer', () => {
    it('should calculate weighted average', () => {
      const partials = [
        { sum: 10, count: 2 },  // avg = 5
        { sum: 20, count: 3 },  // avg = 6.67
      ];
      // Total: (10 + 20) / (2 + 3) = 30 / 5 = 6
      expect(avgReducer(partials)).toBe(6);
    });

    it('should return 0 for empty partials', () => {
      expect(avgReducer([])).toBe(0);
    });

    it('should return 0 when total count is 0', () => {
      expect(avgReducer([{ sum: 10, count: 0 }, { sum: 20, count: 0 }])).toBe(0);
    });
  });

  describe('aggregationReducer', () => {
    it('should reduce sum aggregations', () => {
      const partials: PartialAggregation[] = [
        { type: 'sum', value: 10 },
        { type: 'sum', value: 20 },
      ];
      expect(aggregationReducer(partials)).toBe(30);
    });

    it('should reduce count aggregations', () => {
      const partials: PartialAggregation[] = [
        { type: 'count', value: 5 },
        { type: 'count', value: 10 },
      ];
      expect(aggregationReducer(partials)).toBe(15);
    });

    it('should reduce min aggregations', () => {
      const partials: PartialAggregation[] = [
        { type: 'min', value: 5 },
        { type: 'min', value: 3 },
        { type: 'min', value: 8 },
      ];
      expect(aggregationReducer(partials)).toBe(3);
    });

    it('should reduce max aggregations', () => {
      const partials: PartialAggregation[] = [
        { type: 'max', value: 5 },
        { type: 'max', value: 3 },
        { type: 'max', value: 8 },
      ];
      expect(aggregationReducer(partials)).toBe(8);
    });

    it('should reduce avg aggregations with count', () => {
      const partials: PartialAggregation[] = [
        { type: 'avg', value: 10, count: 2 },  // sum = 20
        { type: 'avg', value: 20, count: 3 },  // sum = 60
      ];
      // Total: (20 + 60) / (2 + 3) = 80 / 5 = 16
      expect(aggregationReducer(partials)).toBe(16);
    });

    it('should return 0 for empty array', () => {
      expect(aggregationReducer([])).toBe(0);
    });

    it('should throw for unknown aggregation type', () => {
      // Intentionally testing invalid type at runtime - cast required
      const partials = [{ type: 'unknown' as AggregationType, value: 10 }];
      expect(() => aggregationReducer(partials)).toThrow('Unknown aggregation type');
    });
  });
});

describe('Pre-built Map-Reduce Variants', () => {
  describe('aggregationChain', () => {
    it('should create aggregation chain with defaults', () => {
      const chain = aggregationChain('sum-chain', {
        mapSnippetId: 'mapper',
        reduceSnippetId: 'reducer',
      });

      expect(chain.id).toBe('sum-chain');
      expect(chain.name).toBe('Aggregation: sum-chain');
    });

    it('should use custom maxMappers', () => {
      const chain = aggregationChain('sum-chain', {
        mapSnippetId: 'mapper',
        reduceSnippetId: 'reducer',
        maxMappers: 20,
      });

      const mapStep = chain.steps.find(s => s.mode === 'parallel') as ParallelStep;
      expect(mapStep.maxParallelism).toBe(20);
    });

    it('should include aggregation type in description', () => {
      const chain = aggregationChain('avg-chain', {
        mapSnippetId: 'mapper',
        reduceSnippetId: 'reducer',
        aggregationType: 'avg',
      });

      expect(chain.description).toContain('avg');
    });
  });

  describe('wordCountChain', () => {
    it('should create word count chain', () => {
      const chain = wordCountChain('wc-chain', {
        mapSnippetId: 'word-mapper',
        reduceSnippetId: 'word-reducer',
      });

      expect(chain.id).toBe('wc-chain');
      expect(chain.name).toBe('Word Count: wc-chain');
      expect(chain.description).toContain('word occurrences');
    });

    it('should use custom maxMappers', () => {
      const chain = wordCountChain('wc-chain', {
        mapSnippetId: 'mapper',
        reduceSnippetId: 'reducer',
        maxMappers: 15,
      });

      const mapStep = chain.steps.find(s => s.mode === 'parallel') as ParallelStep;
      expect(mapStep.maxParallelism).toBe(15);
    });
  });

  describe('groupedAggregationChain', () => {
    it('should create grouped aggregation chain without split', () => {
      const chain = groupedAggregationChain('group-chain', {
        mapSnippetId: 'mapper',
        reduceSnippetId: 'reducer',
      });

      expect(chain.id).toBe('group-chain');
      expect(chain.steps).toHaveLength(2); // map + reduce (no split)
    });

    it('should create grouped aggregation chain with split', () => {
      const chain = groupedAggregationChain('group-chain', {
        splitSnippetId: 'splitter',
        mapSnippetId: 'mapper',
        reduceSnippetId: 'reducer',
      });

      expect(chain.steps).toHaveLength(3); // split + map + reduce
      expect(chain.steps[0].name).toBe('Split');
    });

    it('should use hash partitioner by default', () => {
      const chain = groupedAggregationChain('group-chain', {
        mapSnippetId: 'mapper',
        reduceSnippetId: 'reducer',
      });

      const mapStep = chain.steps.find(s => s.mode === 'parallel') as ParallelStep;
      expect(mapStep.partitioner.partitionerId).toBe('hash-partitioner');
    });
  });
});

describe('calculateMapReduceCost', () => {
  it('should calculate cost without split', () => {
    const cost = calculateMapReduceCost(
      5,
      { subrequests: 2, cpuMs: 3, memoryBytes: 8 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 }
    );

    expect(cost.totalSnippetInvocations).toBe(6); // 5 mappers + 1 reducer
    expect(cost.totalSubrequests).toBe(10); // 5 * 2 + 0
    expect(cost.estimatedCpuMs).toBe(5); // 3 (parallel) + 2
  });

  it('should calculate cost with split', () => {
    const cost = calculateMapReduceCost(
      5,
      { subrequests: 2, cpuMs: 3, memoryBytes: 8 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 },
      { subrequests: 1, cpuMs: 1, memoryBytes: 2 * 1024 * 1024 }
    );

    expect(cost.totalSnippetInvocations).toBe(7); // 1 split + 5 mappers + 1 reducer
    expect(cost.totalSubrequests).toBe(11); // 1 + 5*2 + 0
    expect(cost.estimatedCpuMs).toBe(6); // 1 + 3 + 2
  });

  it('should calculate peak memory as max of all stages', () => {
    const cost = calculateMapReduceCost(
      4,
      { subrequests: 0, cpuMs: 1, memoryBytes: 8 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 1, memoryBytes: 4 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 1, memoryBytes: 2 * 1024 * 1024 }
    );

    // Peak = 4 mappers * 8MB = 32MB
    expect(cost.peakMemoryBytes).toBe(32 * 1024 * 1024);
  });

  it('should use default reduce estimate', () => {
    const cost = calculateMapReduceCost(
      3,
      { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 }
    );

    expect(cost.totalSnippetInvocations).toBe(4); // 3 + 1
    expect(cost.totalSubrequests).toBe(3); // 3 * 1 + 0 (default)
    expect(cost.estimatedCpuMs).toBe(4); // 2 + 2 (default)
  });
});
