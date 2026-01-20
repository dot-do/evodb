/**
 * Tests for Scatter-Gather Pattern
 */

import { describe, it, expect } from 'vitest';
import {
  scatterGather,
  arrayPartitioner,
  idPartitioner,
  rangePartitioner,
  createScatterHandler,
  createGatherHandler,
  simpleScatterGather,
  partitionScan,
  calculateScatterGatherCost,
  type ScatterGatherConfig,
  type ScatterResult,
} from './scatter-gather.js';

describe('scatterGather builder', () => {
  it('should create a scatter-gather chain with 3 steps', () => {
    const config: ScatterGatherConfig = {
      id: 'test-sg',
      name: 'Test Scatter-Gather',
      scatter: { snippetId: 'scatter-snippet' },
      partition: {
        partitionerId: 'array-partitioner',
        maxPartitions: 10,
        snippetId: 'partition-snippet',
      },
      gather: { snippetId: 'gather-snippet' },
    };

    const chain = scatterGather(config);

    expect(chain.id).toBe('test-sg');
    expect(chain.name).toBe('Test Scatter-Gather');
    expect(chain.steps).toHaveLength(3);
  });

  it('should create scatter step as sequential', () => {
    const config: ScatterGatherConfig = {
      id: 'test',
      name: 'Test',
      scatter: { snippetId: 'scatter' },
      partition: { partitionerId: 'part', maxPartitions: 5, snippetId: 'process' },
      gather: { snippetId: 'gather' },
    };

    const chain = scatterGather(config);
    const scatterStep = chain.steps.find(s => s.name === 'Scatter');

    expect(scatterStep?.mode).toBe('sequential');
  });

  it('should create partition step as parallel with correct maxParallelism', () => {
    const config: ScatterGatherConfig = {
      id: 'test',
      name: 'Test',
      scatter: { snippetId: 'scatter' },
      partition: { partitionerId: 'part', maxPartitions: 8, snippetId: 'process' },
      gather: { snippetId: 'gather' },
    };

    const chain = scatterGather(config);
    const partitionStep = chain.steps.find(s => s.name === 'Process Partitions') as any;

    expect(partitionStep.mode).toBe('parallel');
    expect(partitionStep.maxParallelism).toBe(8);
  });

  it('should create gather step as sequential', () => {
    const config: ScatterGatherConfig = {
      id: 'test',
      name: 'Test',
      scatter: { snippetId: 'scatter' },
      partition: { partitionerId: 'part', maxPartitions: 5, snippetId: 'process' },
      gather: { snippetId: 'gather' },
    };

    const chain = scatterGather(config);
    const gatherStep = chain.steps.find(s => s.name === 'Gather');

    expect(gatherStep?.mode).toBe('sequential');
  });

  it('should set dependencies correctly', () => {
    const config: ScatterGatherConfig = {
      id: 'test',
      name: 'Test',
      scatter: { snippetId: 'scatter' },
      partition: { partitionerId: 'part', maxPartitions: 5, snippetId: 'process' },
      gather: { snippetId: 'gather' },
    };

    const chain = scatterGather(config);

    // Scatter has no dependencies
    expect(chain.steps[0].dependencies).toHaveLength(0);
    // Partition depends on scatter
    expect(chain.steps[1].dependencies).toContain('scatter');
    // Gather depends on partition
    expect(chain.steps[2].dependencies).toContain('process-partitions');
  });

  it('should apply custom resource estimates', () => {
    const config: ScatterGatherConfig = {
      id: 'test',
      name: 'Test',
      scatter: {
        snippetId: 'scatter',
        resourceEstimate: { subrequests: 2, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 },
      },
      partition: {
        partitionerId: 'part',
        maxPartitions: 5,
        snippetId: 'process',
        resourceEstimate: { subrequests: 3, cpuMs: 4, memoryBytes: 8 * 1024 * 1024 },
      },
      gather: {
        snippetId: 'gather',
        resourceEstimate: { subrequests: 0, cpuMs: 2, memoryBytes: 16 * 1024 * 1024 },
      },
    };

    const chain = scatterGather(config);

    expect(chain.steps[0].resourceEstimate.subrequests).toBe(2);
    expect(chain.steps[1].resourceEstimate.subrequests).toBe(3);
    expect(chain.steps[2].resourceEstimate.memoryBytes).toBe(16 * 1024 * 1024);
  });

  it('should include description if provided', () => {
    const config: ScatterGatherConfig = {
      id: 'test',
      name: 'Test',
      description: 'Custom description',
      scatter: { snippetId: 'scatter' },
      partition: { partitionerId: 'part', maxPartitions: 5, snippetId: 'process' },
      gather: { snippetId: 'gather' },
    };

    const chain = scatterGather(config);

    expect(chain.description).toBe('Custom description');
  });

  it('should use default description if not provided', () => {
    const config: ScatterGatherConfig = {
      id: 'test',
      name: 'Test',
      scatter: { snippetId: 'scatter' },
      partition: { partitionerId: 'part', maxPartitions: 5, snippetId: 'process' },
      gather: { snippetId: 'gather' },
    };

    const chain = scatterGather(config);

    expect(chain.description).toBe('Scatter-gather pattern chain');
  });
});

describe('Common Partitioners', () => {
  describe('arrayPartitioner', () => {
    it('should partition ScatterResult into individual items', () => {
      const partitioner = arrayPartitioner<number>();
      const input: ScatterResult<number> = {
        partitions: [1, 2, 3, 4, 5],
      };

      const partitions = partitioner(input, 10);

      expect(partitions).toHaveLength(5);
      expect(partitions[0].input).toBe(1);
      expect(partitions[1].input).toBe(2);
      expect(partitions[2].input).toBe(3);
    });

    it('should respect maxPartitions limit', () => {
      const partitioner = arrayPartitioner<number>();
      const input: ScatterResult<number> = {
        partitions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      };

      const partitions = partitioner(input, 3);

      expect(partitions).toHaveLength(3);
    });

    it('should set correct partition indices', () => {
      const partitioner = arrayPartitioner<string>();
      const input: ScatterResult<string> = {
        partitions: ['a', 'b', 'c'],
      };

      const partitions = partitioner(input, 10);

      expect(partitions.map(p => p.index)).toEqual([0, 1, 2]);
    });

    it('should include totalPartitions in metadata', () => {
      const partitioner = arrayPartitioner<number>();
      const input: ScatterResult<number> = {
        partitions: [1, 2, 3],
      };

      const partitions = partitioner(input, 10);

      expect(partitions[0].metadata?.totalPartitions).toBe(3);
    });

    it('should handle empty partitions', () => {
      const partitioner = arrayPartitioner<number>();
      const input: ScatterResult<number> = {
        partitions: [],
      };

      const partitions = partitioner(input, 10);

      expect(partitions).toHaveLength(0);
    });
  });

  describe('idPartitioner', () => {
    it('should partition by string IDs', () => {
      const partitioner = idPartitioner();
      const input: ScatterResult<string> = {
        partitions: ['partition-1', 'partition-2', 'partition-3'],
      };

      const partitions = partitioner(input, 10);

      expect(partitions).toHaveLength(3);
      expect(partitions[0].input).toEqual({ partitionId: 'partition-1' });
      expect(partitions[1].input).toEqual({ partitionId: 'partition-2' });
    });

    it('should respect maxPartitions limit', () => {
      const partitioner = idPartitioner();
      const input: ScatterResult<string> = {
        partitions: ['p1', 'p2', 'p3', 'p4', 'p5'],
      };

      const partitions = partitioner(input, 2);

      expect(partitions).toHaveLength(2);
    });

    it('should include partitionId in metadata', () => {
      const partitioner = idPartitioner();
      const input: ScatterResult<string> = {
        partitions: ['my-partition'],
      };

      const partitions = partitioner(input, 10);

      expect(partitions[0].metadata?.partitionId).toBe('my-partition');
    });
  });

  describe('rangePartitioner', () => {
    it('should partition numeric range into equal chunks', () => {
      const partitioner = rangePartitioner(100);
      const input: ScatterResult<void> = { partitions: [] };

      const partitions = partitioner(input, 4);

      expect(partitions).toHaveLength(4);
      expect(partitions[0].input).toEqual({ start: 0, end: 25 });
      expect(partitions[1].input).toEqual({ start: 25, end: 50 });
      expect(partitions[2].input).toEqual({ start: 50, end: 75 });
      expect(partitions[3].input).toEqual({ start: 75, end: 100 });
    });

    it('should handle non-divisible ranges', () => {
      const partitioner = rangePartitioner(10);
      const input: ScatterResult<void> = { partitions: [] };

      const partitions = partitioner(input, 3);

      expect(partitions).toHaveLength(3);
      expect(partitions[0].input).toEqual({ start: 0, end: 4 });
      expect(partitions[1].input).toEqual({ start: 4, end: 8 });
      expect(partitions[2].input).toEqual({ start: 8, end: 10 });
    });

    it('should include start/end in metadata', () => {
      const partitioner = rangePartitioner(50);
      const input: ScatterResult<void> = { partitions: [] };

      const partitions = partitioner(input, 5);

      expect(partitions[0].metadata).toEqual({ start: 0, end: 10 });
    });

    it('should handle case where maxPartitions > totalItems', () => {
      const partitioner = rangePartitioner(3);
      const input: ScatterResult<void> = { partitions: [] };

      const partitions = partitioner(input, 10);

      expect(partitions).toHaveLength(3);
      expect(partitions[0].input).toEqual({ start: 0, end: 1 });
      expect(partitions[1].input).toEqual({ start: 1, end: 2 });
      expect(partitions[2].input).toEqual({ start: 2, end: 3 });
    });
  });
});

describe('Helper Handlers', () => {
  describe('createScatterHandler', () => {
    it('should create handler that extracts partitions from input', async () => {
      const handler = createScatterHandler((input: { items: number[] }) => input.items);

      const result = await handler({} as any, { items: [1, 2, 3] });

      expect(result.partitions).toEqual([1, 2, 3]);
    });

    it('should work with different input types', async () => {
      const handler = createScatterHandler((input: string) => input.split(','));

      const result = await handler({} as any, 'a,b,c,d');

      expect(result.partitions).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('createGatherHandler', () => {
    it('should create handler that reduces partition results', async () => {
      const handler = createGatherHandler((results: number[]) => results.reduce((a, b) => a + b, 0));

      const result = await handler({} as any, [1, 2, 3, 4, 5]);

      expect(result).toBe(15);
    });

    it('should work with different output types', async () => {
      const handler = createGatherHandler((results: string[]) => results.join('-'));

      const result = await handler({} as any, ['a', 'b', 'c']);

      expect(result).toBe('a-b-c');
    });

    it('should work with object aggregation', async () => {
      interface PartitionResult {
        count: number;
        sum: number;
      }

      const handler = createGatherHandler((results: PartitionResult[]) => ({
        totalCount: results.reduce((acc, r) => acc + r.count, 0),
        totalSum: results.reduce((acc, r) => acc + r.sum, 0),
      }));

      const result = await handler({} as any, [
        { count: 5, sum: 100 },
        { count: 3, sum: 50 },
        { count: 2, sum: 30 },
      ]);

      expect(result).toEqual({ totalCount: 10, totalSum: 180 });
    });
  });
});

describe('Pre-built Scatter-Gather Variants', () => {
  describe('simpleScatterGather', () => {
    it('should create simple scatter-gather chain', () => {
      const chain = simpleScatterGather('simple-sg', 'process-snippet', 'gather-snippet');

      expect(chain.id).toBe('simple-sg');
      expect(chain.name).toBe('Simple Scatter-Gather: simple-sg');
      expect(chain.steps).toHaveLength(3);
    });

    it('should use identity scatter snippet', () => {
      const chain = simpleScatterGather('simple-sg', 'process', 'gather');
      const scatterStep = chain.steps.find(s => s.name === 'Scatter') as any;

      expect(scatterStep.snippet.snippetId).toBe('identity-scatter');
    });

    it('should use array partitioner', () => {
      const chain = simpleScatterGather('simple-sg', 'process', 'gather');
      const partitionStep = chain.steps.find(s => s.name === 'Process Partitions') as any;

      expect(partitionStep.partitioner.partitionerId).toBe('array-partitioner');
    });

    it('should use default maxPartitions of 10', () => {
      const chain = simpleScatterGather('simple-sg', 'process', 'gather');
      const partitionStep = chain.steps.find(s => s.name === 'Process Partitions') as any;

      expect(partitionStep.maxParallelism).toBe(10);
    });

    it('should accept custom maxPartitions', () => {
      const chain = simpleScatterGather('simple-sg', 'process', 'gather', 20);
      const partitionStep = chain.steps.find(s => s.name === 'Process Partitions') as any;

      expect(partitionStep.maxParallelism).toBe(20);
    });
  });

  describe('partitionScan', () => {
    it('should create partition scan chain', () => {
      const chain = partitionScan('ps-chain', {
        findPartitionsSnippetId: 'find-partitions',
        scanPartitionSnippetId: 'scan-partition',
        mergeResultsSnippetId: 'merge-results',
      });

      expect(chain.id).toBe('ps-chain');
      expect(chain.name).toBe('Partition Scan: ps-chain');
      expect(chain.description).toBe('Scan data across multiple partitions');
    });

    it('should use partition-id-partitioner', () => {
      const chain = partitionScan('ps-chain', {
        findPartitionsSnippetId: 'find',
        scanPartitionSnippetId: 'scan',
        mergeResultsSnippetId: 'merge',
      });
      const partitionStep = chain.steps.find(s => s.name === 'Process Partitions') as any;

      expect(partitionStep.partitioner.partitionerId).toBe('partition-id-partitioner');
    });

    it('should have appropriate resource estimates', () => {
      const chain = partitionScan('ps-chain', {
        findPartitionsSnippetId: 'find',
        scanPartitionSnippetId: 'scan',
        mergeResultsSnippetId: 'merge',
      });

      // Scatter (find partitions) - 1 subrequest
      expect(chain.steps[0].resourceEstimate.subrequests).toBe(1);
      // Partition processing - 2 subrequests each
      expect(chain.steps[1].resourceEstimate.subrequests).toBe(2);
      // Gather (merge) - 0 subrequests
      expect(chain.steps[2].resourceEstimate.subrequests).toBe(0);
    });

    it('should accept custom maxPartitions', () => {
      const chain = partitionScan('ps-chain', {
        findPartitionsSnippetId: 'find',
        scanPartitionSnippetId: 'scan',
        mergeResultsSnippetId: 'merge',
        maxPartitions: 20,
      });
      const partitionStep = chain.steps.find(s => s.name === 'Process Partitions') as any;

      expect(partitionStep.maxParallelism).toBe(20);
    });

    it('should use default maxPartitions of 10', () => {
      const chain = partitionScan('ps-chain', {
        findPartitionsSnippetId: 'find',
        scanPartitionSnippetId: 'scan',
        mergeResultsSnippetId: 'merge',
      });
      const partitionStep = chain.steps.find(s => s.name === 'Process Partitions') as any;

      expect(partitionStep.maxParallelism).toBe(10);
    });
  });
});

describe('calculateScatterGatherCost', () => {
  it('should calculate total snippet invocations', () => {
    const cost = calculateScatterGatherCost(
      5,
      { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 }
    );

    // 1 scatter + 5 partitions + 1 gather = 7
    expect(cost.totalSnippetInvocations).toBe(7);
  });

  it('should calculate total subrequests', () => {
    const cost = calculateScatterGatherCost(
      4,
      { subrequests: 2, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 },
      { subrequests: 1, cpuMs: 1, memoryBytes: 2 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 }
    );

    // 1 (scatter) + 4*2 (partitions) + 0 (gather) = 9
    expect(cost.totalSubrequests).toBe(9);
  });

  it('should calculate estimated CPU time', () => {
    const cost = calculateScatterGatherCost(
      5,
      { subrequests: 1, cpuMs: 3, memoryBytes: 4 * 1024 * 1024 },
      { subrequests: 1, cpuMs: 1, memoryBytes: 2 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 }
    );

    // 1 (scatter) + 3 (parallel, so max of one) + 2 (gather) = 6
    expect(cost.estimatedCpuMs).toBe(6);
  });

  it('should calculate peak memory', () => {
    const cost = calculateScatterGatherCost(
      4,
      { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
      { subrequests: 1, cpuMs: 1, memoryBytes: 4 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 2, memoryBytes: 16 * 1024 * 1024 }
    );

    // Max of: 4MB (scatter), 4*8MB=32MB (partitions), 16MB (gather)
    expect(cost.peakMemoryBytes).toBe(32 * 1024 * 1024);
  });

  it('should use default scatter estimate', () => {
    const cost = calculateScatterGatherCost(
      3,
      { subrequests: 2, cpuMs: 3, memoryBytes: 4 * 1024 * 1024 }
    );

    // Default scatter: 1 subrequest
    // Total: 1 + 3*2 + 0 (default gather) = 7
    expect(cost.totalSubrequests).toBe(7);
  });

  it('should use default gather estimate', () => {
    const cost = calculateScatterGatherCost(
      3,
      { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 }
    );

    // Default gather: 2ms CPU
    // Total CPU: 1 (scatter) + 2 (partitions) + 2 (gather) = 5
    expect(cost.estimatedCpuMs).toBe(5);
  });

  it('should handle single partition', () => {
    const cost = calculateScatterGatherCost(
      1,
      { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 }
    );

    expect(cost.totalSnippetInvocations).toBe(3); // scatter + 1 + gather
    expect(cost.totalSubrequests).toBe(2); // 1 + 1 + 0
  });

  it('should handle zero partitions', () => {
    const cost = calculateScatterGatherCost(
      0,
      { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 }
    );

    expect(cost.totalSnippetInvocations).toBe(2); // scatter + 0 + gather
    expect(cost.totalSubrequests).toBe(1); // 1 + 0 + 0
  });
});
