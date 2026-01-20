/**
 * Tests for Types and Utility Functions
 */

import { describe, it, expect } from 'vitest';
import {
  stepId,
  DEFAULT_SNIPPET_BUDGET,
  isSequentialStep,
  isParallelStep,
  isConditionalStep,
  type StepId,
  type SnippetBudget,
  type ResourceEstimate,
  type ChainCost,
  type ChainDefinition,
  type Step,
  type SequentialStep,
  type ParallelStep,
  type ConditionalStep,
  type ExecutionContext,
  type StepOutput,
  type PartitionOutput,
  type ChainExecutionResult,
  type ChainExecutionError,
  type SnippetRef,
  type PartitionerRef,
  type ConditionRef,
} from './types.js';

describe('DEFAULT_SNIPPET_BUDGET', () => {
  it('should have maxSubrequests of 5', () => {
    expect(DEFAULT_SNIPPET_BUDGET.maxSubrequests).toBe(5);
  });

  it('should have maxCpuMs of 5', () => {
    expect(DEFAULT_SNIPPET_BUDGET.maxCpuMs).toBe(5);
  });

  it('should have maxMemoryBytes of 32MB', () => {
    expect(DEFAULT_SNIPPET_BUDGET.maxMemoryBytes).toBe(32 * 1024 * 1024);
  });

  it('should match Cloudflare snippet constraints', () => {
    const budget = DEFAULT_SNIPPET_BUDGET;

    // These are the documented Cloudflare snippet constraints
    expect(budget.maxSubrequests).toBeLessThanOrEqual(5);
    expect(budget.maxCpuMs).toBeLessThanOrEqual(5);
    expect(budget.maxMemoryBytes).toBeLessThanOrEqual(32 * 1024 * 1024);
  });
});

describe('stepId', () => {
  it('should create a StepId from string', () => {
    const id = stepId('my-step');
    expect(id).toBe('my-step');
  });

  it('should be usable as a string', () => {
    const id = stepId('step-123');
    const map = new Map<StepId, number>();
    map.set(id, 42);

    expect(map.get(id)).toBe(42);
    expect(map.get('step-123' as StepId)).toBe(42);
  });

  it('should allow concatenation with strings', () => {
    const id = stepId('step');
    const result = `prefix-${id}-suffix`;
    expect(result).toBe('prefix-step-suffix');
  });

  it('should work with template literals', () => {
    const id = stepId('my-step');
    const message = `Processing ${id}`;
    expect(message).toBe('Processing my-step');
  });
});

describe('Type Guards and Interfaces', () => {
  describe('SnippetRef', () => {
    it('should support minimal snippet reference', () => {
      const ref: SnippetRef = {
        snippetId: 'my-snippet',
      };
      expect(ref.snippetId).toBe('my-snippet');
    });

    it('should support full snippet reference', () => {
      const ref: SnippetRef = {
        snippetId: 'my-snippet',
        version: '1.0.0',
        inlineCode: 'return input * 2;',
        config: { multiplier: 2 },
      };
      expect(ref.version).toBe('1.0.0');
      expect(ref.inlineCode).toBe('return input * 2;');
      expect(ref.config).toEqual({ multiplier: 2 });
    });
  });

  describe('PartitionerRef', () => {
    it('should support minimal partitioner reference', () => {
      const ref: PartitionerRef = {
        partitionerId: 'chunk-partitioner',
      };
      expect(ref.partitionerId).toBe('chunk-partitioner');
    });

    it('should support static partition count', () => {
      const ref: PartitionerRef = {
        partitionerId: 'static-partitioner',
        staticPartitionCount: 10,
      };
      expect(ref.staticPartitionCount).toBe(10);
    });
  });

  describe('ConditionRef', () => {
    it('should support minimal condition reference', () => {
      const ref: ConditionRef = {
        conditionId: 'is-valid',
      };
      expect(ref.conditionId).toBe('is-valid');
    });

    it('should support inline code', () => {
      const ref: ConditionRef = {
        conditionId: 'custom',
        inlineCode: 'return input > 0;',
      };
      expect(ref.inlineCode).toBe('return input > 0;');
    });
  });

  describe('ResourceEstimate', () => {
    it('should represent resource usage', () => {
      const estimate: ResourceEstimate = {
        subrequests: 2,
        cpuMs: 3,
        memoryBytes: 8 * 1024 * 1024,
      };

      expect(estimate.subrequests).toBe(2);
      expect(estimate.cpuMs).toBe(3);
      expect(estimate.memoryBytes).toBe(8 * 1024 * 1024);
    });
  });

  describe('SequentialStep', () => {
    it('should have mode of sequential', () => {
      const step: SequentialStep = {
        id: stepId('step-1'),
        name: 'Step 1',
        mode: 'sequential',
        snippet: { snippetId: 'my-snippet' },
        resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
        dependencies: [],
      };

      expect(step.mode).toBe('sequential');
      expect(step.snippet.snippetId).toBe('my-snippet');
    });
  });

  describe('ParallelStep', () => {
    it('should have mode of parallel with partitioner', () => {
      const step: ParallelStep = {
        id: stepId('par-1'),
        name: 'Parallel Step',
        mode: 'parallel',
        snippet: { snippetId: 'process' },
        partitioner: { partitionerId: 'chunk-partitioner' },
        maxParallelism: 10,
        resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
        dependencies: [],
      };

      expect(step.mode).toBe('parallel');
      expect(step.partitioner.partitionerId).toBe('chunk-partitioner');
      expect(step.maxParallelism).toBe(10);
    });
  });

  describe('ConditionalStep', () => {
    it('should have mode of conditional with condition and branches', () => {
      const step: ConditionalStep = {
        id: stepId('cond-1'),
        name: 'Conditional Step',
        mode: 'conditional',
        condition: { conditionId: 'is-valid' },
        ifTrue: { snippetId: 'handle-valid' },
        ifFalse: { snippetId: 'handle-invalid' },
        resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
        dependencies: [],
      };

      expect(step.mode).toBe('conditional');
      expect(step.condition.conditionId).toBe('is-valid');
      expect(step.ifTrue.snippetId).toBe('handle-valid');
      expect(step.ifFalse?.snippetId).toBe('handle-invalid');
    });
  });

  describe('ChainDefinition', () => {
    it('should represent a complete chain', () => {
      const chain: ChainDefinition = {
        id: 'my-chain',
        name: 'My Chain',
        version: '1.0.0',
        steps: [],
        entryStepId: stepId('start'),
        exitStepId: stepId('end'),
      };

      expect(chain.id).toBe('my-chain');
      expect(chain.version).toBe('1.0.0');
    });

    it('should support optional description and budget override', () => {
      const chain: ChainDefinition = {
        id: 'my-chain',
        name: 'My Chain',
        description: 'A test chain',
        version: '1.0.0',
        steps: [],
        entryStepId: stepId('start'),
        exitStepId: stepId('end'),
        budgetOverride: { maxSubrequests: 10 },
      };

      expect(chain.description).toBe('A test chain');
      expect(chain.budgetOverride?.maxSubrequests).toBe(10);
    });
  });

  describe('ExecutionContext', () => {
    it('should represent runtime context', () => {
      const ctx: ExecutionContext = {
        executionId: 'exec-123',
        chainId: 'my-chain',
        stepId: stepId('step-1'),
        input: { data: 'test' },
        stepOutputs: new Map(),
        startTime: Date.now(),
        resourceUsage: { subrequests: 0, cpuMs: 0, memoryBytes: 0 },
      };

      expect(ctx.executionId).toBe('exec-123');
      expect(ctx.chainId).toBe('my-chain');
      expect(ctx.input).toEqual({ data: 'test' });
    });

    it('should support partition info for parallel steps', () => {
      const ctx: ExecutionContext = {
        executionId: 'exec-123',
        chainId: 'my-chain',
        stepId: stepId('par-step'),
        partitionIndex: 2,
        totalPartitions: 5,
        input: { partitionData: true },
        stepOutputs: new Map(),
        startTime: Date.now(),
        resourceUsage: { subrequests: 0, cpuMs: 0, memoryBytes: 0 },
      };

      expect(ctx.partitionIndex).toBe(2);
      expect(ctx.totalPartitions).toBe(5);
    });
  });

  describe('StepOutput', () => {
    it('should represent step execution output', () => {
      const output: StepOutput = {
        stepId: stepId('step-1'),
        data: { result: 'success' },
        resourceUsage: { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 },
        durationMs: 50,
      };

      expect(output.data).toEqual({ result: 'success' });
      expect(output.durationMs).toBe(50);
    });

    it('should support partition outputs for parallel steps', () => {
      const partitionOutputs: PartitionOutput[] = [
        { partitionIndex: 0, data: 'r0', resourceUsage: { subrequests: 1, cpuMs: 1, memoryBytes: 1024 }, durationMs: 10 },
        { partitionIndex: 1, data: 'r1', resourceUsage: { subrequests: 1, cpuMs: 1, memoryBytes: 1024 }, durationMs: 15 },
      ];

      const output: StepOutput = {
        stepId: stepId('par-step'),
        data: ['r0', 'r1'],
        resourceUsage: { subrequests: 2, cpuMs: 1, memoryBytes: 2048 },
        durationMs: 15,
        partitionOutputs,
      };

      expect(output.partitionOutputs).toHaveLength(2);
    });
  });

  describe('ChainExecutionResult', () => {
    it('should represent completed execution', () => {
      const result: ChainExecutionResult = {
        executionId: 'exec-123',
        chainId: 'my-chain',
        status: 'completed',
        output: { finalResult: true },
        stepOutputs: new Map(),
        totalDurationMs: 100,
        actualCost: {
          totalSnippetInvocations: 3,
          totalSubrequests: 5,
          maxParallelism: 2,
          sequentialStages: 2,
          estimatedCpuMs: 10,
          estimatedPeakMemoryBytes: 16 * 1024 * 1024,
          stageBreakdown: [],
        },
      };

      expect(result.status).toBe('completed');
      expect(result.output).toEqual({ finalResult: true });
      expect(result.error).toBeUndefined();
    });

    it('should represent failed execution', () => {
      const error: ChainExecutionError = {
        stepId: stepId('failing-step'),
        message: 'Something went wrong',
        code: 'STEP_ERROR',
      };

      const result: ChainExecutionResult = {
        executionId: 'exec-123',
        chainId: 'my-chain',
        status: 'failed',
        error,
        stepOutputs: new Map(),
        totalDurationMs: 50,
        actualCost: {
          totalSnippetInvocations: 1,
          totalSubrequests: 1,
          maxParallelism: 1,
          sequentialStages: 1,
          estimatedCpuMs: 2,
          estimatedPeakMemoryBytes: 8 * 1024 * 1024,
          stageBreakdown: [],
        },
      };

      expect(result.status).toBe('failed');
      expect(result.error?.message).toBe('Something went wrong');
      expect(result.output).toBeUndefined();
    });
  });

  describe('ChainCost', () => {
    it('should represent execution cost', () => {
      const cost: ChainCost = {
        totalSnippetInvocations: 5,
        totalSubrequests: 10,
        maxParallelism: 3,
        sequentialStages: 2,
        estimatedCpuMs: 15,
        estimatedPeakMemoryBytes: 24 * 1024 * 1024,
        stageBreakdown: [
          {
            stageId: 'stage-1',
            parallelism: 1,
            perSnippetEstimate: { subrequests: 2, cpuMs: 3, memoryBytes: 8 * 1024 * 1024 },
            totalSubrequests: 2,
          },
          {
            stageId: 'stage-2',
            parallelism: 3,
            perSnippetEstimate: { subrequests: 2, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
            totalSubrequests: 6,
          },
        ],
      };

      expect(cost.totalSnippetInvocations).toBe(5);
      expect(cost.stageBreakdown).toHaveLength(2);
    });
  });
});

describe('Execution Status', () => {
  it('should support all execution states', () => {
    const statuses: Array<'pending' | 'running' | 'completed' | 'failed' | 'cancelled'> = [
      'pending',
      'running',
      'completed',
      'failed',
      'cancelled',
    ];

    statuses.forEach(status => {
      expect(['pending', 'running', 'completed', 'failed', 'cancelled']).toContain(status);
    });
  });
});

describe('Step Execution Modes', () => {
  it('should support all step modes', () => {
    const modes: Array<'sequential' | 'parallel' | 'conditional'> = [
      'sequential',
      'parallel',
      'conditional',
    ];

    modes.forEach(mode => {
      expect(['sequential', 'parallel', 'conditional']).toContain(mode);
    });
  });
});

describe('Step Type Guards', () => {
  // Helper to create test steps
  const createSequentialStep = (): SequentialStep => ({
    id: stepId('seq-1'),
    name: 'Sequential Step',
    mode: 'sequential',
    snippet: { snippetId: 'my-snippet' },
    resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    dependencies: [],
  });

  const createParallelStep = (): ParallelStep => ({
    id: stepId('par-1'),
    name: 'Parallel Step',
    mode: 'parallel',
    snippet: { snippetId: 'process' },
    partitioner: { partitionerId: 'chunk-partitioner' },
    maxParallelism: 10,
    resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    dependencies: [],
  });

  const createConditionalStep = (): ConditionalStep => ({
    id: stepId('cond-1'),
    name: 'Conditional Step',
    mode: 'conditional',
    condition: { conditionId: 'is-valid' },
    ifTrue: { snippetId: 'handle-valid' },
    ifFalse: { snippetId: 'handle-invalid' },
    resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    dependencies: [],
  });

  describe('isSequentialStep', () => {
    it('should return true for sequential steps', () => {
      const step: Step = createSequentialStep();
      expect(isSequentialStep(step)).toBe(true);
    });

    it('should return false for parallel steps', () => {
      const step: Step = createParallelStep();
      expect(isSequentialStep(step)).toBe(false);
    });

    it('should return false for conditional steps', () => {
      const step: Step = createConditionalStep();
      expect(isSequentialStep(step)).toBe(false);
    });

    it('should narrow type to SequentialStep', () => {
      const step: Step = createSequentialStep();
      if (isSequentialStep(step)) {
        // TypeScript should allow access to snippet property
        expect(step.snippet.snippetId).toBe('my-snippet');
      } else {
        throw new Error('Should have been a sequential step');
      }
    });
  });

  describe('isParallelStep', () => {
    it('should return true for parallel steps', () => {
      const step: Step = createParallelStep();
      expect(isParallelStep(step)).toBe(true);
    });

    it('should return false for sequential steps', () => {
      const step: Step = createSequentialStep();
      expect(isParallelStep(step)).toBe(false);
    });

    it('should return false for conditional steps', () => {
      const step: Step = createConditionalStep();
      expect(isParallelStep(step)).toBe(false);
    });

    it('should narrow type to ParallelStep', () => {
      const step: Step = createParallelStep();
      if (isParallelStep(step)) {
        // TypeScript should allow access to partitioner and maxParallelism
        expect(step.partitioner.partitionerId).toBe('chunk-partitioner');
        expect(step.maxParallelism).toBe(10);
      } else {
        throw new Error('Should have been a parallel step');
      }
    });
  });

  describe('isConditionalStep', () => {
    it('should return true for conditional steps', () => {
      const step: Step = createConditionalStep();
      expect(isConditionalStep(step)).toBe(true);
    });

    it('should return false for sequential steps', () => {
      const step: Step = createSequentialStep();
      expect(isConditionalStep(step)).toBe(false);
    });

    it('should return false for parallel steps', () => {
      const step: Step = createParallelStep();
      expect(isConditionalStep(step)).toBe(false);
    });

    it('should narrow type to ConditionalStep', () => {
      const step: Step = createConditionalStep();
      if (isConditionalStep(step)) {
        // TypeScript should allow access to condition, ifTrue, ifFalse
        expect(step.condition.conditionId).toBe('is-valid');
        expect(step.ifTrue.snippetId).toBe('handle-valid');
        expect(step.ifFalse?.snippetId).toBe('handle-invalid');
      } else {
        throw new Error('Should have been a conditional step');
      }
    });
  });

  describe('Type guard exhaustiveness', () => {
    it('should categorize any step into exactly one type', () => {
      const steps: Step[] = [
        createSequentialStep(),
        createParallelStep(),
        createConditionalStep(),
      ];

      for (const step of steps) {
        const isSeq = isSequentialStep(step);
        const isPar = isParallelStep(step);
        const isCond = isConditionalStep(step);

        // Exactly one should be true
        const trueCount = [isSeq, isPar, isCond].filter(Boolean).length;
        expect(trueCount).toBe(1);
      }
    });
  });
});
