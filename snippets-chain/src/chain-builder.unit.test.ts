/**
 * Tests for ChainBuilder - fluent API for constructing snippet chains
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChainBuilder,
  chain,
  seq,
  par,
  cond,
  type ChainBuilderOptions,
  type SequentialStepOptions,
  type ParallelStepOptions,
  type ConditionalStepOptions,
} from './chain-builder.js';
import { stepId, type SequentialStep, type ParallelStep, type ConditionalStep } from './types.js';

describe('ChainBuilder', () => {
  describe('construction', () => {
    it('should create a new ChainBuilder with factory function', () => {
      const builder = chain({ id: 'test', name: 'Test Chain' });
      expect(builder).toBeInstanceOf(ChainBuilder);
    });

    it('should create a new ChainBuilder with static create method', () => {
      const builder = ChainBuilder.create({ id: 'test', name: 'Test Chain' });
      expect(builder).toBeInstanceOf(ChainBuilder);
    });

    it('should set default version to 1.0.0', () => {
      const builder = chain({ id: 'test', name: 'Test Chain' });
      const definition = builder
        .sequential({ name: 'Step', snippet: 'test-snippet' })
        .build();
      expect(definition.version).toBe('1.0.0');
    });

    it('should allow custom version', () => {
      const builder = chain({ id: 'test', name: 'Test Chain', version: '2.0.0' });
      const definition = builder
        .sequential({ name: 'Step', snippet: 'test-snippet' })
        .build();
      expect(definition.version).toBe('2.0.0');
    });
  });

  describe('sequential steps', () => {
    it('should add a sequential step with string snippet', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Step 1', snippet: 'my-snippet' })
        .build();

      expect(definition.steps).toHaveLength(1);
      expect(definition.steps[0].mode).toBe('sequential');
      expect((definition.steps[0] as SequentialStep).snippet.snippetId).toBe('my-snippet');
    });

    it('should add a sequential step with SnippetRef object', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential({
          name: 'Step 1',
          snippet: { snippetId: 'my-snippet', version: '1.0' },
        })
        .build();

      const step = definition.steps[0] as SequentialStep;
      expect(step.snippet.snippetId).toBe('my-snippet');
      expect(step.snippet.version).toBe('1.0');
    });

    it('should set default resource estimate', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Step 1', snippet: 'snippet' })
        .build();

      const step = definition.steps[0];
      expect(step.resourceEstimate.subrequests).toBe(1);
      expect(step.resourceEstimate.cpuMs).toBe(2);
      expect(step.resourceEstimate.memoryBytes).toBe(8 * 1024 * 1024);
    });

    it('should merge custom resource estimate', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential({
          name: 'Step 1',
          snippet: 'snippet',
          resourceEstimate: { subrequests: 3 },
        })
        .build();

      const step = definition.steps[0];
      expect(step.resourceEstimate.subrequests).toBe(3);
      expect(step.resourceEstimate.cpuMs).toBe(2); // default
    });

    it('should generate unique step IDs', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Step 1', snippet: 's1' })
        .sequential({ name: 'Step 2', snippet: 's2' })
        .build();

      expect(definition.steps[0].id).not.toBe(definition.steps[1].id);
    });

    it('should allow custom step ID', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential('custom-id', { name: 'Step 1', snippet: 's1' })
        .build();

      expect(definition.steps[0].id).toBe('custom-id');
    });

    it('should set dependencies on sequential steps', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential('step-1', { name: 'Step 1', snippet: 's1' })
        .sequential('step-2', { name: 'Step 2', snippet: 's2' })
        .build();

      expect(definition.steps[0].dependencies).toHaveLength(0);
      expect(definition.steps[1].dependencies).toContain('step-1');
    });
  });

  describe('parallel steps', () => {
    it('should add a parallel step', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel Step',
          snippet: 'parallel-snippet',
          partitioner: 'my-partitioner',
        })
        .build();

      expect(definition.steps).toHaveLength(1);
      expect(definition.steps[0].mode).toBe('parallel');
    });

    it('should set default maxParallelism to 10', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel Step',
          snippet: 'snippet',
          partitioner: 'partitioner',
        })
        .build();

      const step = definition.steps[0] as ParallelStep;
      expect(step.maxParallelism).toBe(10);
    });

    it('should allow custom maxParallelism', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel Step',
          snippet: 'snippet',
          partitioner: 'partitioner',
          maxParallelism: 20,
        })
        .build();

      const step = definition.steps[0] as ParallelStep;
      expect(step.maxParallelism).toBe(20);
    });

    it('should normalize string partitioner to PartitionerRef', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel Step',
          snippet: 'snippet',
          partitioner: 'my-partitioner',
        })
        .build();

      const step = definition.steps[0] as ParallelStep;
      expect(step.partitioner.partitionerId).toBe('my-partitioner');
    });

    it('should accept PartitionerRef object', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel Step',
          snippet: 'snippet',
          partitioner: { partitionerId: 'my-partitioner', staticPartitionCount: 5 },
        })
        .build();

      const step = definition.steps[0] as ParallelStep;
      expect(step.partitioner.partitionerId).toBe('my-partitioner');
      expect(step.partitioner.staticPartitionCount).toBe(5);
    });
  });

  describe('conditional steps', () => {
    it('should add a conditional step', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .conditional({
          name: 'Conditional Step',
          condition: 'my-condition',
          ifTrue: 'true-snippet',
        })
        .build();

      expect(definition.steps).toHaveLength(1);
      expect(definition.steps[0].mode).toBe('conditional');
    });

    it('should set ifTrue snippet', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .conditional({
          name: 'Conditional Step',
          condition: 'condition',
          ifTrue: 'true-snippet',
        })
        .build();

      const step = definition.steps[0] as ConditionalStep;
      expect(step.ifTrue.snippetId).toBe('true-snippet');
    });

    it('should set optional ifFalse snippet', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .conditional({
          name: 'Conditional Step',
          condition: 'condition',
          ifTrue: 'true-snippet',
          ifFalse: 'false-snippet',
        })
        .build();

      const step = definition.steps[0] as ConditionalStep;
      expect(step.ifFalse?.snippetId).toBe('false-snippet');
    });

    it('should allow undefined ifFalse', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .conditional({
          name: 'Conditional Step',
          condition: 'condition',
          ifTrue: 'true-snippet',
        })
        .build();

      const step = definition.steps[0] as ConditionalStep;
      expect(step.ifFalse).toBeUndefined();
    });
  });

  describe('step() method for DAG construction', () => {
    it('should add step with explicit dependencies', () => {
      const builder = chain({ id: 'test', name: 'Test' });

      builder.sequential('step-a', { name: 'A', snippet: 'a' });
      builder.sequential('step-b', { name: 'B', snippet: 'b' });
      builder.step(
        'step-c',
        {
          name: 'C',
          mode: 'sequential',
          snippet: { snippetId: 'c' },
          resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
        } as Omit<SequentialStep, 'id' | 'dependencies'>,
        ['step-a', 'step-b']
      );

      const definition = builder.build();
      const stepC = definition.steps.find(s => s.id === 'step-c');
      expect(stepC?.dependencies).toContain('step-a');
      expect(stepC?.dependencies).toContain('step-b');
    });
  });

  describe('entry and exit steps', () => {
    it('should set first step as entry step', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential('first', { name: 'First', snippet: 's1' })
        .sequential('second', { name: 'Second', snippet: 's2' })
        .build();

      expect(definition.entryStepId).toBe('first');
    });

    it('should set last step as exit step', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential('first', { name: 'First', snippet: 's1' })
        .sequential('second', { name: 'Second', snippet: 's2' })
        .build();

      expect(definition.exitStepId).toBe('second');
    });

    it('should allow explicit entry step', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential('first', { name: 'First', snippet: 's1' })
        .sequential('second', { name: 'Second', snippet: 's2' })
        .setEntryStep('second')
        .build();

      expect(definition.entryStepId).toBe('second');
    });

    it('should allow explicit exit step', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential('first', { name: 'First', snippet: 's1' })
        .sequential('second', { name: 'Second', snippet: 's2' })
        .setExitStep('first')
        .build();

      expect(definition.exitStepId).toBe('first');
    });
  });

  describe('addDependency', () => {
    it('should add dependency to existing step', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential('a', { name: 'A', snippet: 'a' })
        .sequential('b', { name: 'B', snippet: 'b' })
        .addDependency('b', 'a');

      const definition = builder.build();
      const stepB = definition.steps.find(s => s.id === 'b');
      expect(stepB?.dependencies).toContain('a');
    });
  });

  describe('validation', () => {
    it('should fail validation for empty chain', () => {
      const builder = chain({ id: 'test', name: 'Test' });
      const result = builder.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'EMPTY_CHAIN' })
      );
    });

    it('should pass validation for valid chain', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Step', snippet: 'snippet' });
      const result = builder.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing dependency', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential('step-1', { name: 'Step 1', snippet: 's1' });

      // Manually add invalid dependency
      const step = builder.getStep('step-1');
      if (step) {
        step.dependencies.push(stepId('non-existent'));
      }

      const result = builder.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_DEPENDENCY' })
      );
    });

    it('should detect self-dependency', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential('step-1', { name: 'Step 1', snippet: 's1' });

      // Manually add self dependency
      const step = builder.getStep('step-1');
      if (step) {
        step.dependencies.push(stepId('step-1'));
      }

      const result = builder.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'SELF_DEPENDENCY' })
      );
    });

    it('should detect cycles', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential('step-1', { name: 'Step 1', snippet: 's1' })
        .sequential('step-2', { name: 'Step 2', snippet: 's2' });

      // Create a cycle: step-1 -> step-2 -> step-1
      const step1 = builder.getStep('step-1');
      if (step1) {
        step1.dependencies.push(stepId('step-2'));
      }

      const result = builder.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'CYCLE_DETECTED' })
      );
    });

    it('should warn about exceeding subrequest budget', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential({
          name: 'Heavy Step',
          snippet: 'snippet',
          resourceEstimate: { subrequests: 10 },
        });

      const result = builder.validate();
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'EXCEEDS_SUBREQUEST_BUDGET' })
      );
    });

    it('should warn about exceeding CPU budget', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential({
          name: 'Slow Step',
          snippet: 'snippet',
          resourceEstimate: { cpuMs: 10 },
        });

      const result = builder.validate();
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'EXCEEDS_CPU_BUDGET' })
      );
    });

    it('should warn about exceeding memory budget', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential({
          name: 'Memory Heavy Step',
          snippet: 'snippet',
          resourceEstimate: { memoryBytes: 64 * 1024 * 1024 },
        });

      const result = builder.validate();
      expect(result.warnings).toContainEqual(
        expect.objectContaining({ code: 'EXCEEDS_MEMORY_BUDGET' })
      );
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost for sequential chain', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Step 1', snippet: 's1' })
        .sequential({ name: 'Step 2', snippet: 's2' });

      const cost = builder.estimateCost();

      expect(cost.totalSnippetInvocations).toBe(2);
      expect(cost.sequentialStages).toBe(2);
      expect(cost.maxParallelism).toBe(1);
    });

    it('should calculate cost for parallel step', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .parallel({
          name: 'Parallel Step',
          snippet: 'snippet',
          partitioner: 'partitioner',
          maxParallelism: 5,
        });

      const cost = builder.estimateCost();

      expect(cost.totalSnippetInvocations).toBe(5);
      expect(cost.maxParallelism).toBe(5);
    });

    it('should calculate total subrequests', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential({
          name: 'Step 1',
          snippet: 's1',
          resourceEstimate: { subrequests: 2 },
        })
        .parallel({
          name: 'Parallel',
          snippet: 's2',
          partitioner: 'p',
          maxParallelism: 3,
          resourceEstimate: { subrequests: 1 },
        });

      const cost = builder.estimateCost();

      // 2 subrequests for step 1 + 1*3 for parallel = 5
      expect(cost.totalSubrequests).toBe(5);
    });

    it('should calculate estimated CPU time', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential({
          name: 'Step 1',
          snippet: 's1',
          resourceEstimate: { cpuMs: 3 },
        })
        .sequential({
          name: 'Step 2',
          snippet: 's2',
          resourceEstimate: { cpuMs: 4 },
        });

      const cost = builder.estimateCost();

      // Sequential: 3 + 4 = 7
      expect(cost.estimatedCpuMs).toBe(7);
    });

    it('should provide stage breakdown', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential('step-1', { name: 'Step 1', snippet: 's1' })
        .sequential('step-2', { name: 'Step 2', snippet: 's2' });

      const cost = builder.estimateCost();

      expect(cost.stageBreakdown).toHaveLength(2);
      expect(cost.stageBreakdown[0].stageId).toBe('step-1');
      expect(cost.stageBreakdown[1].stageId).toBe('step-2');
    });
  });

  describe('build', () => {
    it('should throw error for invalid chain', () => {
      const builder = chain({ id: 'test', name: 'Test' });
      expect(() => builder.build()).toThrow('Invalid chain');
    });

    it('should return complete chain definition', () => {
      const definition = chain({ id: 'test-chain', name: 'Test Chain' })
        .sequential({ name: 'Step', snippet: 'snippet' })
        .build();

      expect(definition.id).toBe('test-chain');
      expect(definition.name).toBe('Test Chain');
      expect(definition.steps).toHaveLength(1);
      expect(definition.entryStepId).toBeDefined();
      expect(definition.exitStepId).toBeDefined();
    });

    it('should include description if provided', () => {
      const definition = chain({
        id: 'test',
        name: 'Test',
        description: 'Test description',
      })
        .sequential({ name: 'Step', snippet: 'snippet' })
        .build();

      expect(definition.description).toBe('Test description');
    });

    it('should include budget override if provided', () => {
      const definition = chain({
        id: 'test',
        name: 'Test',
        budgetOverride: { maxSubrequests: 10 },
      })
        .sequential({ name: 'Step', snippet: 'snippet' })
        .build();

      expect(definition.budgetOverride?.maxSubrequests).toBe(10);
    });
  });

  describe('getSteps and getStep', () => {
    it('should return all steps', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential('a', { name: 'A', snippet: 'a' })
        .sequential('b', { name: 'B', snippet: 'b' });

      const steps = builder.getSteps();
      expect(steps).toHaveLength(2);
    });

    it('should return specific step by id', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential('my-step', { name: 'My Step', snippet: 'snippet' });

      const step = builder.getStep('my-step');
      expect(step).toBeDefined();
      expect(step?.name).toBe('My Step');
    });

    it('should return undefined for non-existent step', () => {
      const builder = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'Step', snippet: 'snippet' });

      const step = builder.getStep('non-existent');
      expect(step).toBeUndefined();
    });
  });

  describe('fluent API method chaining', () => {
    it('should support method chaining', () => {
      const definition = chain({ id: 'test', name: 'Test' })
        .sequential({ name: 'S1', snippet: 's1' })
        .parallel({ name: 'P1', snippet: 'p1', partitioner: 'part' })
        .conditional({ name: 'C1', condition: 'cond', ifTrue: 'true' })
        .sequential({ name: 'S2', snippet: 's2' })
        .build();

      expect(definition.steps).toHaveLength(4);
      expect(definition.steps[0].mode).toBe('sequential');
      expect(definition.steps[1].mode).toBe('parallel');
      expect(definition.steps[2].mode).toBe('conditional');
      expect(definition.steps[3].mode).toBe('sequential');
    });
  });
});

describe('Convenience factory functions', () => {
  describe('seq', () => {
    it('should create SequentialStepOptions', () => {
      const options = seq('My Step', 'my-snippet');
      expect(options.name).toBe('My Step');
      expect(options.snippet).toBe('my-snippet');
    });

    it('should accept resource estimate', () => {
      const options = seq('My Step', 'my-snippet', { cpuMs: 4 });
      expect(options.resourceEstimate?.cpuMs).toBe(4);
    });
  });

  describe('par', () => {
    it('should create ParallelStepOptions', () => {
      const options = par('Parallel', 'snippet', 'partitioner');
      expect(options.name).toBe('Parallel');
      expect(options.snippet).toBe('snippet');
      expect(options.partitioner).toBe('partitioner');
      expect(options.maxParallelism).toBe(10); // default
    });

    it('should accept custom maxParallelism', () => {
      const options = par('Parallel', 'snippet', 'partitioner', 20);
      expect(options.maxParallelism).toBe(20);
    });

    it('should accept resource estimate', () => {
      const options = par('Parallel', 'snippet', 'partitioner', 10, { subrequests: 2 });
      expect(options.resourceEstimate?.subrequests).toBe(2);
    });
  });

  describe('cond', () => {
    it('should create ConditionalStepOptions', () => {
      const options = cond('Conditional', 'condition', 'true-snippet');
      expect(options.name).toBe('Conditional');
      expect(options.condition).toBe('condition');
      expect(options.ifTrue).toBe('true-snippet');
      expect(options.ifFalse).toBeUndefined();
    });

    it('should accept ifFalse snippet', () => {
      const options = cond('Conditional', 'condition', 'true-snippet', 'false-snippet');
      expect(options.ifFalse).toBe('false-snippet');
    });

    it('should accept resource estimate', () => {
      const options = cond('Conditional', 'condition', 'true', 'false', { cpuMs: 1 });
      expect(options.resourceEstimate?.cpuMs).toBe(1);
    });
  });
});
