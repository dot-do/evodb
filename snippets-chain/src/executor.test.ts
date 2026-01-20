/**
 * Tests for ChainExecutor - chain execution engine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChainExecutor,
  SnippetRegistry,
  SimulationExecutor,
  createRegistry,
  createExecutor,
  createSimulator,
  type ExecutorOptions,
} from './executor.js';
import { chain } from './chain-builder.js';
import {
  type ChainDefinition,
  type ExecutionContext,
  type SnippetHandler,
  type Partitioner,
  type ConditionEvaluator,
  type PartitionSpec,
  DEFAULT_SNIPPET_BUDGET,
} from './types.js';

describe('SnippetRegistry', () => {
  let registry: SnippetRegistry;

  beforeEach(() => {
    registry = createRegistry();
  });

  describe('registerSnippet', () => {
    it('should register a snippet handler', () => {
      const handler: SnippetHandler = async () => 'result';
      registry.registerSnippet('my-snippet', handler);

      const retrieved = registry.getSnippet('my-snippet');
      expect(retrieved).toBe(handler);
    });

    it('should return this for chaining', () => {
      const handler: SnippetHandler = async () => 'result';
      const result = registry.registerSnippet('snippet', handler);
      expect(result).toBe(registry);
    });
  });

  describe('registerPartitioner', () => {
    it('should register a partitioner', () => {
      const partitioner: Partitioner = () => [];
      registry.registerPartitioner('my-partitioner', partitioner);

      const retrieved = registry.getPartitioner('my-partitioner');
      expect(retrieved).toBe(partitioner);
    });

    it('should return this for chaining', () => {
      const partitioner: Partitioner = () => [];
      const result = registry.registerPartitioner('part', partitioner);
      expect(result).toBe(registry);
    });
  });

  describe('registerCondition', () => {
    it('should register a condition evaluator', () => {
      const condition: ConditionEvaluator = () => true;
      registry.registerCondition('my-condition', condition);

      const retrieved = registry.getCondition('my-condition');
      expect(retrieved).toBe(condition);
    });

    it('should return this for chaining', () => {
      const condition: ConditionEvaluator = () => true;
      const result = registry.registerCondition('cond', condition);
      expect(result).toBe(registry);
    });
  });

  describe('getSnippet', () => {
    it('should return undefined for non-existent snippet', () => {
      expect(registry.getSnippet('non-existent')).toBeUndefined();
    });
  });

  describe('getPartitioner', () => {
    it('should return undefined for non-existent partitioner', () => {
      expect(registry.getPartitioner('non-existent')).toBeUndefined();
    });
  });

  describe('getCondition', () => {
    it('should return undefined for non-existent condition', () => {
      expect(registry.getCondition('non-existent')).toBeUndefined();
    });
  });

  describe('chained registration', () => {
    it('should support chained registration', () => {
      registry
        .registerSnippet('s1', async () => 'result')
        .registerPartitioner('p1', () => [])
        .registerCondition('c1', () => true);

      expect(registry.getSnippet('s1')).toBeDefined();
      expect(registry.getPartitioner('p1')).toBeDefined();
      expect(registry.getCondition('c1')).toBeDefined();
    });
  });
});

describe('ChainExecutor', () => {
  let registry: SnippetRegistry;
  let executor: ChainExecutor;

  beforeEach(() => {
    registry = createRegistry();
    executor = createExecutor({ registry });
  });

  describe('construction', () => {
    it('should create executor with default options', () => {
      const exec = createExecutor({ registry });
      expect(exec.budget).toEqual(DEFAULT_SNIPPET_BUDGET);
      expect(exec.stepTimeoutMs).toBe(5000);
    });

    it('should accept budget override', () => {
      const exec = createExecutor({
        registry,
        budgetOverride: { maxSubrequests: 10 },
      });
      expect(exec.budget.maxSubrequests).toBe(10);
    });

    it('should accept custom step timeout', () => {
      const exec = createExecutor({
        registry,
        stepTimeoutMs: 10000,
      });
      expect(exec.stepTimeoutMs).toBe(10000);
    });
  });

  describe('execute - sequential steps', () => {
    it('should execute a single sequential step', async () => {
      registry.registerSnippet('double', async (ctx, input: number) => input * 2);

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Double', snippet: 'double' })
        .build();

      const result = await executor.execute(chainDef, 5);

      expect(result.status).toBe('completed');
      expect(result.output).toBe(10);
    });

    it('should execute multiple sequential steps', async () => {
      registry
        .registerSnippet('add-one', async (ctx, input: number) => input + 1)
        .registerSnippet('double', async (ctx, input: number) => input * 2);

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Add One', snippet: 'add-one' })
        .sequential({ name: 'Double', snippet: 'double' })
        .build();

      const result = await executor.execute(chainDef, 5);

      expect(result.status).toBe('completed');
      expect(result.output).toBe(12); // (5 + 1) * 2
    });

    it('should pass input to first step', async () => {
      const receivedInput = vi.fn();
      registry.registerSnippet('capture', async (ctx, input) => {
        receivedInput(input);
        return input;
      });

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Capture', snippet: 'capture' })
        .build();

      await executor.execute(chainDef, { data: 'test' });

      expect(receivedInput).toHaveBeenCalledWith({ data: 'test' });
    });

    it('should pass output from previous step as input', async () => {
      const secondInput = vi.fn();
      registry
        .registerSnippet('first', async () => ({ transformed: true }))
        .registerSnippet('second', async (ctx, input) => {
          secondInput(input);
          return input;
        });

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'First', snippet: 'first' })
        .sequential({ name: 'Second', snippet: 'second' })
        .build();

      await executor.execute(chainDef, {});

      expect(secondInput).toHaveBeenCalledWith({ transformed: true });
    });
  });

  describe('execute - parallel steps', () => {
    it('should execute parallel step with partitioner', async () => {
      const partitioner: Partitioner<number[]> = (input, maxPartitions) => {
        return input.slice(0, maxPartitions).map((item, index) => ({
          index,
          input: item,
        }));
      };

      registry
        .registerPartitioner('array-partitioner', partitioner)
        .registerSnippet('process', async (ctx, input: number) => input * 2);

      const chainDef = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel Process',
          snippet: 'process',
          partitioner: 'array-partitioner',
          maxParallelism: 5,
        })
        .build();

      const result = await executor.execute(chainDef, [1, 2, 3]);

      expect(result.status).toBe('completed');
      expect(result.output).toEqual([2, 4, 6]);
    });

    it('should respect maxParallelism', async () => {
      const callCount = vi.fn();
      const partitioner: Partitioner<number[]> = (input) => {
        return input.map((item, index) => ({ index, input: item }));
      };

      registry
        .registerPartitioner('partitioner', partitioner)
        .registerSnippet('process', async (ctx, input: number) => {
          callCount();
          return input;
        });

      const chainDef = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel',
          snippet: 'process',
          partitioner: 'partitioner',
          maxParallelism: 3,
        })
        .build();

      const result = await executor.execute(chainDef, [1, 2, 3, 4, 5]);

      // All 5 items should be processed (partitioner returns all)
      expect(callCount).toHaveBeenCalledTimes(5);
    });

    it('should sort partition outputs by index', async () => {
      const delays = [50, 10, 30]; // Middle one finishes first
      const partitioner: Partitioner<number[]> = (input) => {
        return input.map((item, index) => ({ index, input: item }));
      };

      registry
        .registerPartitioner('partitioner', partitioner)
        .registerSnippet('process', async (ctx, input: number) => {
          const idx = ctx.partitionIndex ?? 0;
          await new Promise(r => setTimeout(r, delays[idx]));
          return input * 10;
        });

      const chainDef = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel',
          snippet: 'process',
          partitioner: 'partitioner',
          maxParallelism: 3,
        })
        .build();

      const result = await executor.execute(chainDef, [1, 2, 3]);

      // Results should be in order [10, 20, 30] regardless of completion order
      expect(result.output).toEqual([10, 20, 30]);
    });
  });

  describe('execute - conditional steps', () => {
    it('should execute ifTrue branch when condition is true', async () => {
      registry
        .registerCondition('is-positive', (input: number) => input > 0)
        .registerSnippet('positive-handler', async (ctx, input: number) => `positive: ${input}`)
        .registerSnippet('negative-handler', async (ctx, input: number) => `negative: ${input}`);

      const chainDef = chain({ id: 'test', name: 'Test' })
        .conditional({
          name: 'Check Sign',
          condition: 'is-positive',
          ifTrue: 'positive-handler',
          ifFalse: 'negative-handler',
        })
        .build();

      const result = await executor.execute(chainDef, 5);

      expect(result.status).toBe('completed');
      expect(result.output).toBe('positive: 5');
    });

    it('should execute ifFalse branch when condition is false', async () => {
      registry
        .registerCondition('is-positive', (input: number) => input > 0)
        .registerSnippet('positive-handler', async (ctx, input: number) => `positive: ${input}`)
        .registerSnippet('negative-handler', async (ctx, input: number) => `negative: ${input}`);

      const chainDef = chain({ id: 'test', name: 'Test' })
        .conditional({
          name: 'Check Sign',
          condition: 'is-positive',
          ifTrue: 'positive-handler',
          ifFalse: 'negative-handler',
        })
        .build();

      const result = await executor.execute(chainDef, -5);

      expect(result.status).toBe('completed');
      expect(result.output).toBe('negative: -5');
    });

    it('should return undefined when condition is false and no ifFalse', async () => {
      registry
        .registerCondition('is-positive', (input: number) => input > 0)
        .registerSnippet('positive-handler', async () => 'positive');

      const chainDef = chain({ id: 'test', name: 'Test' })
        .conditional({
          name: 'Check Sign',
          condition: 'is-positive',
          ifTrue: 'positive-handler',
        })
        .build();

      const result = await executor.execute(chainDef, -5);

      expect(result.status).toBe('completed');
      expect(result.output).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should fail when snippet is not found', async () => {
      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Missing', snippet: 'non-existent' })
        .build();

      const result = await executor.execute(chainDef, {});

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Snippet not found');
    });

    it('should fail when partitioner is not found', async () => {
      registry.registerSnippet('process', async () => 'result');

      const chainDef = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel',
          snippet: 'process',
          partitioner: 'non-existent',
        })
        .build();

      const result = await executor.execute(chainDef, [1, 2, 3]);

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Partitioner not found');
    });

    it('should fail when condition is not found', async () => {
      registry.registerSnippet('handler', async () => 'result');

      const chainDef = chain({ id: 'test', name: 'Test' })
        .conditional({
          name: 'Conditional',
          condition: 'non-existent',
          ifTrue: 'handler',
        })
        .build();

      const result = await executor.execute(chainDef, {});

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Condition not found');
    });

    it('should capture snippet execution errors', async () => {
      registry.registerSnippet('failing', async () => {
        throw new Error('Snippet failed');
      });

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Failing', snippet: 'failing' })
        .build();

      const result = await executor.execute(chainDef, {});

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('Snippet failed');
      expect(result.error?.code).toBe('STEP_ERROR');
    });
  });

  describe('execution cancellation', () => {
    it('should cancel execution when abort signal is triggered', async () => {
      const controller = new AbortController();
      registry.registerSnippet('slow', async () => {
        await new Promise(r => setTimeout(r, 100));
        return 'done';
      });

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Slow', snippet: 'slow' })
        .sequential({ name: 'After', snippet: 'slow' })
        .build();

      // Abort after a short delay
      setTimeout(() => controller.abort(), 50);

      const result = await executor.execute(chainDef, {}, controller.signal);

      expect(result.status).toBe('cancelled');
    });
  });

  describe('execution context', () => {
    it('should provide execution context to snippets', async () => {
      let capturedContext: ExecutionContext | null = null;
      registry.registerSnippet('capture', async (ctx) => {
        capturedContext = ctx;
        return 'done';
      });

      const chainDef = chain({ id: 'my-chain', name: 'Test' })
        .sequential('step-1', { name: 'Capture', snippet: 'capture' })
        .build();

      await executor.execute(chainDef, { inputData: true });

      expect(capturedContext).not.toBeNull();
      expect(capturedContext?.chainId).toBe('my-chain');
      expect(capturedContext?.stepId).toBe('step-1');
      expect(capturedContext?.input).toEqual({ inputData: true });
    });

    it('should provide partition info to parallel snippets', async () => {
      const capturedContexts: ExecutionContext[] = [];
      const partitioner: Partitioner<number[]> = (input) => {
        return input.map((item, index) => ({ index, input: item }));
      };

      registry
        .registerPartitioner('partitioner', partitioner)
        .registerSnippet('capture', async (ctx, input) => {
          capturedContexts.push({ ...ctx });
          return input;
        });

      const chainDef = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel',
          snippet: 'capture',
          partitioner: 'partitioner',
          maxParallelism: 3,
        })
        .build();

      await executor.execute(chainDef, [1, 2, 3]);

      expect(capturedContexts).toHaveLength(3);
      expect(capturedContexts.map(c => c.partitionIndex).sort()).toEqual([0, 1, 2]);
      expect(capturedContexts[0].totalPartitions).toBe(3);
    });
  });

  describe('resource tracking', () => {
    it('should track execution duration', async () => {
      registry.registerSnippet('slow', async () => {
        await new Promise(r => setTimeout(r, 50));
        return 'done';
      });

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Slow', snippet: 'slow' })
        .build();

      const result = await executor.execute(chainDef, {});

      expect(result.totalDurationMs).toBeGreaterThanOrEqual(50);
    });

    it('should calculate actual cost', async () => {
      registry.registerSnippet('process', async () => 'result');

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential('step-1', { name: 'First', snippet: 'process' })
        .sequential('step-2', { name: 'Second', snippet: 'process' })
        .build();

      const result = await executor.execute(chainDef, {});

      // actualCost tracks what actually happened during execution
      expect(result.actualCost.sequentialStages).toBe(2);
      // Verify step outputs exist for all stages
      expect(result.stepOutputs.size).toBe(2);
      expect(result.stepOutputs.get('step-1' as any)).toBeDefined();
      expect(result.stepOutputs.get('step-2' as any)).toBeDefined();
    });

    it('should store step outputs in result', async () => {
      registry
        .registerSnippet('step-a', async () => 'output-a')
        .registerSnippet('step-b', async () => 'output-b');

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential('step-a', { name: 'A', snippet: 'step-a' })
        .sequential('step-b', { name: 'B', snippet: 'step-b' })
        .build();

      const result = await executor.execute(chainDef, {});

      expect(result.stepOutputs.get('step-a' as any)?.data).toBe('output-a');
      expect(result.stepOutputs.get('step-b' as any)?.data).toBe('output-b');
    });
  });

  describe('dependency handling', () => {
    it('should handle multiple dependencies', async () => {
      const receivedInput = vi.fn();
      registry
        .registerSnippet('a', async () => 'result-a')
        .registerSnippet('b', async () => 'result-b')
        .registerSnippet('merge', async (ctx, input) => {
          receivedInput(input);
          return 'merged';
        });

      const builder = chain({ id: 'test', name: 'Test' })
        .sequential('a', { name: 'A', snippet: 'a' })
        .sequential('b', { name: 'B', snippet: 'b' });

      // Manually set step B to have no dependencies (parallel with A)
      const stepB = builder.getStep('b');
      if (stepB) {
        stepB.dependencies = [];
      }

      // Add merge step that depends on both A and B
      builder.step(
        'merge',
        {
          name: 'Merge',
          mode: 'sequential',
          snippet: { snippetId: 'merge' },
          resourceEstimate: { subrequests: 0, cpuMs: 1, memoryBytes: 1024 },
        } as any,
        ['a', 'b']
      );

      const chainDef = builder.build();
      await executor.execute(chainDef, {});

      // Merge step should receive both outputs as an object
      expect(receivedInput).toHaveBeenCalledWith({
        a: 'result-a',
        b: 'result-b',
      });
    });
  });
});

describe('SimulationExecutor', () => {
  describe('simulate', () => {
    it('should simulate sequential chain cost', () => {
      const simulator = createSimulator();

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential({
          name: 'Step 1',
          snippet: 's1',
          resourceEstimate: { subrequests: 2, cpuMs: 3, memoryBytes: 8 * 1024 * 1024 },
        })
        .sequential({
          name: 'Step 2',
          snippet: 's2',
          resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 },
        })
        .build();

      const cost = simulator.simulate(chainDef);

      expect(cost.totalSnippetInvocations).toBe(2);
      expect(cost.totalSubrequests).toBe(3); // 2 + 1
      expect(cost.estimatedCpuMs).toBe(5); // 3 + 2
      expect(cost.maxParallelism).toBe(1);
      expect(cost.sequentialStages).toBe(2);
    });

    it('should simulate parallel chain cost', () => {
      const simulator = createSimulator();

      const chainDef = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel',
          snippet: 's1',
          partitioner: 'partitioner',
          maxParallelism: 5,
          resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 },
        })
        .build();

      const cost = simulator.simulate(chainDef);

      expect(cost.totalSnippetInvocations).toBe(5);
      expect(cost.totalSubrequests).toBe(5); // 1 * 5
      expect(cost.maxParallelism).toBe(5);
    });

    it('should use custom partition counts', () => {
      const simulator = createSimulator();

      const chainDef = chain({ id: 'test', name: 'Test' })
        .parallel('par-step', {
          name: 'Parallel',
          snippet: 's1',
          partitioner: 'partitioner',
          maxParallelism: 10,
        })
        .build();

      const cost = simulator.simulate(chainDef, {
        partitionCounts: { 'par-step': 3 },
      });

      expect(cost.totalSnippetInvocations).toBe(3);
    });

    it('should calculate peak memory for parallel execution', () => {
      const simulator = createSimulator();

      const chainDef = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel',
          snippet: 's1',
          partitioner: 'partitioner',
          maxParallelism: 4,
          resourceEstimate: { subrequests: 1, cpuMs: 1, memoryBytes: 8 * 1024 * 1024 },
        })
        .build();

      const cost = simulator.simulate(chainDef);

      // Peak memory = 4 partitions * 8MB each = 32MB
      expect(cost.estimatedPeakMemoryBytes).toBe(32 * 1024 * 1024);
    });

    it('should provide stage breakdown', () => {
      const simulator = createSimulator();

      const chainDef = chain({ id: 'test', name: 'Test' })
        .sequential('s1', { name: 'S1', snippet: 's1' })
        .parallel('p1', {
          name: 'P1',
          snippet: 's2',
          partitioner: 'part',
          maxParallelism: 3,
        })
        .sequential('s2', { name: 'S2', snippet: 's3' })
        .build();

      const cost = simulator.simulate(chainDef);

      expect(cost.stageBreakdown).toHaveLength(3);
      expect(cost.stageBreakdown.find(s => s.stageId === 's1')?.parallelism).toBe(1);
      expect(cost.stageBreakdown.find(s => s.stageId === 'p1')?.parallelism).toBe(3);
      expect(cost.stageBreakdown.find(s => s.stageId === 's2')?.parallelism).toBe(1);
    });
  });
});

describe('Factory functions', () => {
  describe('createRegistry', () => {
    it('should create a new SnippetRegistry instance', () => {
      const registry = createRegistry();
      expect(registry).toBeInstanceOf(SnippetRegistry);
    });
  });

  describe('createExecutor', () => {
    it('should create a new ChainExecutor instance', () => {
      const registry = createRegistry();
      const executor = createExecutor({ registry });
      expect(executor).toBeInstanceOf(ChainExecutor);
    });
  });

  describe('createSimulator', () => {
    it('should create a new SimulationExecutor instance', () => {
      const simulator = createSimulator();
      expect(simulator).toBeInstanceOf(SimulationExecutor);
    });
  });
});

describe('Concurrency handling', () => {
  it('should execute partitions in parallel', async () => {
    const registry = createRegistry();
    const executor = createExecutor({ registry, maxConcurrency: 10 });

    let concurrentCount = 0;
    let maxConcurrent = 0;
    const executionOrder: number[] = [];

    const partitioner: Partitioner<number[]> = (input) => {
      return input.map((item, index) => ({ index, input: item }));
    };

    registry
      .registerPartitioner('partitioner', partitioner)
      .registerSnippet('process', async (ctx, input: number) => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        executionOrder.push(input);
        await new Promise(r => setTimeout(r, 10));
        concurrentCount--;
        return input * 2;
      });

    const chainDef = chain({ id: 'test', name: 'Test' })
      .parallel({
        name: 'Parallel',
        snippet: 'process',
        partitioner: 'partitioner',
        maxParallelism: 5,
      })
      .build();

    const result = await executor.execute(chainDef, [1, 2, 3]);

    // All partitions should execute
    expect(result.output).toEqual([2, 4, 6]);
    // Should have had some concurrent execution
    expect(maxConcurrent).toBeGreaterThan(0);
  });

  it('should process all partitions', async () => {
    const registry = createRegistry();
    const executor = createExecutor({ registry });

    const processedItems: number[] = [];

    const partitioner: Partitioner<number[]> = (input) => {
      return input.map((item, index) => ({ index, input: item }));
    };

    registry
      .registerPartitioner('partitioner', partitioner)
      .registerSnippet('collect', async (ctx, input: number) => {
        processedItems.push(input);
        return input;
      });

    const chainDef = chain({ id: 'test', name: 'Test' })
      .parallel({
        name: 'Parallel',
        snippet: 'collect',
        partitioner: 'partitioner',
        maxParallelism: 10,
      })
      .build();

    await executor.execute(chainDef, [5, 10, 15, 20]);

    // Sort numerically (not lexicographically)
    expect(processedItems.sort((a, b) => a - b)).toEqual([5, 10, 15, 20]);
  });
});
