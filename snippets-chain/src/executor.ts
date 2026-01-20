/**
 * Chain Execution Engine
 *
 * Executes snippet chains by orchestrating step execution,
 * managing parallelism, and tracking resource usage.
 */

import {
  type ChainDefinition,
  type Step,
  type SequentialStep,
  type ParallelStep,
  type ConditionalStep,
  type StepId,
  type ExecutionContext,
  type StepOutput,
  type PartitionOutput,
  type ChainExecutionResult,
  type ChainExecutionError,
  type ExecutionStatus,
  type ChainCost,
  type StageResourceSummary,
  type ResourceEstimate,
  type SnippetHandler,
  type Partitioner,
  type ConditionEvaluator,
  type SnippetBudget,
  DEFAULT_SNIPPET_BUDGET,
} from './types.js';

import { TIMEOUT_5S } from '@evodb/core';

// =============================================================================
// Snippet Registry
// =============================================================================

/**
 * Registry for snippet handlers, partitioners, and conditions
 */
export class SnippetRegistry {
  private snippets: Map<string, SnippetHandler> = new Map();
  private partitioners: Map<string, Partitioner> = new Map();
  private conditions: Map<string, ConditionEvaluator> = new Map();

  /**
   * Register a snippet handler
   */
  registerSnippet(id: string, handler: SnippetHandler): this {
    this.snippets.set(id, handler);
    return this;
  }

  /**
   * Register a partitioner
   */
  registerPartitioner(id: string, partitioner: Partitioner): this {
    this.partitioners.set(id, partitioner);
    return this;
  }

  /**
   * Register a condition evaluator
   */
  registerCondition(id: string, evaluator: ConditionEvaluator): this {
    this.conditions.set(id, evaluator);
    return this;
  }

  /**
   * Get a snippet handler
   */
  getSnippet(id: string): SnippetHandler | undefined {
    return this.snippets.get(id);
  }

  /**
   * Get a partitioner
   */
  getPartitioner(id: string): Partitioner | undefined {
    return this.partitioners.get(id);
  }

  /**
   * Get a condition evaluator
   */
  getCondition(id: string): ConditionEvaluator | undefined {
    return this.conditions.get(id);
  }
}

// =============================================================================
// Execution Options
// =============================================================================

export interface ExecutorOptions {
  /** Snippet registry */
  registry: SnippetRegistry;
  /** Budget override */
  budgetOverride?: Partial<SnippetBudget>;
  /** Maximum concurrent parallel executions */
  maxConcurrency?: number;
  /** Timeout per step in milliseconds */
  stepTimeoutMs?: number;
  /** Enable detailed tracing */
  trace?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// =============================================================================
// Execution State
// =============================================================================

interface ExecutionState {
  executionId: string;
  chainId: string;
  status: ExecutionStatus;
  stepOutputs: Map<StepId, StepOutput>;
  errors: ChainExecutionError[];
  startTime: number;
  endTime?: number;
}

// =============================================================================
// Chain Executor
// =============================================================================

/**
 * Executes snippet chains
 */
export class ChainExecutor {
  private readonly registry: SnippetRegistry;
  readonly budget: SnippetBudget;
  private readonly maxConcurrency: number;
  readonly stepTimeoutMs: number;
  private readonly trace: boolean;

  constructor(options: ExecutorOptions) {
    this.registry = options.registry;
    this.budget = { ...DEFAULT_SNIPPET_BUDGET, ...options.budgetOverride };
    this.maxConcurrency = options.maxConcurrency ?? 10;
    this.stepTimeoutMs = options.stepTimeoutMs ?? TIMEOUT_5S;
    this.trace = options.trace ?? false;
  }

  /**
   * Execute a chain
   */
  async execute<TInput, TOutput>(
    chain: ChainDefinition<TInput, TOutput>,
    input: TInput,
    signal?: AbortSignal
  ): Promise<ChainExecutionResult<TOutput>> {
    const state: ExecutionState = {
      executionId: this.generateExecutionId(),
      chainId: chain.id,
      status: 'running',
      stepOutputs: new Map(),
      errors: [],
      startTime: Date.now(),
    };

    this.log(`Starting execution of chain "${chain.id}" (${state.executionId})`);

    try {
      // Build execution plan
      const levels = this.buildExecutionLevels(chain);

      // Execute each level
      for (const level of levels) {
        if (signal?.aborted) {
          state.status = 'cancelled';
          break;
        }

        await this.executeLevel(chain, level, input, state, signal);

        if (state.errors.length > 0) {
          state.status = 'failed';
          break;
        }
      }

      if (state.status === 'running') {
        state.status = 'completed';
      }
    } catch (error) {
      state.status = 'failed';
      state.errors.push({
        stepId: chain.entryStepId,
        message: error instanceof Error ? error.message : String(error),
        code: 'EXECUTION_ERROR',
        cause: error,
      });
    }

    state.endTime = Date.now();

    // Get final output
    const exitOutput = state.stepOutputs.get(chain.exitStepId);

    return {
      executionId: state.executionId,
      chainId: chain.id,
      status: state.status,
      output: exitOutput?.data as TOutput | undefined,
      error: state.errors[0],
      stepOutputs: state.stepOutputs,
      totalDurationMs: state.endTime - state.startTime,
      actualCost: this.calculateActualCost(state, chain),
    };
  }

  /**
   * Build execution levels from chain definition
   */
  private buildExecutionLevels(chain: ChainDefinition): StepId[][] {
    const levels: StepId[][] = [];
    const assigned = new Set<StepId>();

    while (assigned.size < chain.steps.length) {
      const level: StepId[] = [];

      for (const step of chain.steps) {
        if (assigned.has(step.id)) continue;

        const depsResolved = step.dependencies.every(depId => assigned.has(depId));
        if (depsResolved) {
          level.push(step.id);
        }
      }

      if (level.length === 0 && assigned.size < chain.steps.length) {
        throw new Error('Circular dependency or unreachable steps detected');
      }

      level.forEach(id => assigned.add(id));
      if (level.length > 0) {
        levels.push(level);
      }
    }

    return levels;
  }

  /**
   * Execute a single level (potentially parallel)
   */
  private async executeLevel(
    chain: ChainDefinition,
    level: StepId[],
    chainInput: unknown,
    state: ExecutionState,
    signal?: AbortSignal
  ): Promise<void> {
    const stepMap = new Map(chain.steps.map(s => [s.id, s]));

    // Execute all steps in this level concurrently (respecting max concurrency)
    const stepPromises = level.map(async stepId => {
      const step = stepMap.get(stepId)!;

      // Gather inputs from dependencies
      const input = this.gatherInput(step, state.stepOutputs, chainInput);

      try {
        const output = await this.executeStep(step, input, state, signal);
        state.stepOutputs.set(stepId, output);
      } catch (error) {
        state.errors.push({
          stepId,
          message: error instanceof Error ? error.message : String(error),
          code: 'STEP_ERROR',
          cause: error,
        });
      }
    });

    // Limit concurrency
    await this.executeWithConcurrencyLimit(stepPromises, this.maxConcurrency);
  }

  /**
   * Execute steps with concurrency limit
   */
  private async executeWithConcurrencyLimit(
    promises: Promise<void>[],
    limit: number
  ): Promise<void> {
    const executing: Promise<void>[] = [];

    for (const promise of promises) {
      const p = promise.then(() => {
        executing.splice(executing.indexOf(p), 1);
      });
      executing.push(p);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: Step,
    input: unknown,
    state: ExecutionState,
    signal?: AbortSignal
  ): Promise<StepOutput> {
    this.log(`Executing step "${step.id}" (${step.mode})`);
    const startTime = Date.now();

    switch (step.mode) {
      case 'sequential':
        return this.executeSequentialStep(step as SequentialStep, input, state, startTime);
      case 'parallel':
        return this.executeParallelStep(step as ParallelStep, input, state, startTime, signal);
      case 'conditional':
        return this.executeConditionalStep(step as ConditionalStep, input, state, startTime);
      default:
        throw new Error(`Unknown step mode: ${(step as Step).mode}`);
    }
  }

  /**
   * Execute a sequential step
   */
  private async executeSequentialStep(
    step: SequentialStep,
    input: unknown,
    state: ExecutionState,
    startTime: number
  ): Promise<StepOutput> {
    const handler = this.registry.getSnippet(step.snippet.snippetId);
    if (!handler) {
      throw new Error(`Snippet not found: ${step.snippet.snippetId}`);
    }

    const ctx = this.createContext(state, step.id, input);
    const data = await handler(ctx, input);

    return {
      stepId: step.id,
      data,
      resourceUsage: ctx.resourceUsage,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Execute a parallel (fan-out) step
   */
  private async executeParallelStep(
    step: ParallelStep,
    input: unknown,
    state: ExecutionState,
    startTime: number,
    signal?: AbortSignal
  ): Promise<StepOutput> {
    const handler = this.registry.getSnippet(step.snippet.snippetId);
    if (!handler) {
      throw new Error(`Snippet not found: ${step.snippet.snippetId}`);
    }

    const partitioner = this.registry.getPartitioner(step.partitioner.partitionerId);
    if (!partitioner) {
      throw new Error(`Partitioner not found: ${step.partitioner.partitionerId}`);
    }

    // Get partitions
    const partitions = partitioner(input, step.maxParallelism);
    this.log(`  Partitioned into ${partitions.length} partitions`);

    // Execute each partition
    const partitionOutputs: PartitionOutput[] = [];
    const partitionPromises = partitions.map(async (partition) => {
      if (signal?.aborted) return;

      const partitionStart = Date.now();
      const ctx = this.createContext(
        state,
        step.id,
        partition.input,
        partition.index,
        partitions.length
      );

      const data = await handler(ctx, partition.input);

      partitionOutputs.push({
        partitionIndex: partition.index,
        data,
        resourceUsage: ctx.resourceUsage,
        durationMs: Date.now() - partitionStart,
      });
    });

    await this.executeWithConcurrencyLimit(
      partitionPromises.filter(p => p !== undefined) as Promise<void>[],
      this.maxConcurrency
    );

    // Sort by partition index
    partitionOutputs.sort((a, b) => a.partitionIndex - b.partitionIndex);

    // Aggregate resource usage
    const aggregatedUsage: ResourceEstimate = {
      subrequests: partitionOutputs.reduce((sum, p) => sum + p.resourceUsage.subrequests, 0),
      cpuMs: Math.max(...partitionOutputs.map(p => p.resourceUsage.cpuMs)),
      memoryBytes: Math.max(...partitionOutputs.map(p => p.resourceUsage.memoryBytes)),
    };

    return {
      stepId: step.id,
      data: partitionOutputs.map(p => p.data),
      resourceUsage: aggregatedUsage,
      durationMs: Date.now() - startTime,
      partitionOutputs,
    };
  }

  /**
   * Execute a conditional step
   */
  private async executeConditionalStep(
    step: ConditionalStep,
    input: unknown,
    state: ExecutionState,
    startTime: number
  ): Promise<StepOutput> {
    const condition = this.registry.getCondition(step.condition.conditionId);
    if (!condition) {
      throw new Error(`Condition not found: ${step.condition.conditionId}`);
    }

    const ctx = this.createContext(state, step.id, input);
    const result = condition(input, ctx);

    const snippetRef = result ? step.ifTrue : step.ifFalse;
    if (!snippetRef) {
      // No else branch, return undefined
      return {
        stepId: step.id,
        data: undefined,
        resourceUsage: { subrequests: 0, cpuMs: 0, memoryBytes: 0 },
        durationMs: Date.now() - startTime,
      };
    }

    const handler = this.registry.getSnippet(snippetRef.snippetId);
    if (!handler) {
      throw new Error(`Snippet not found: ${snippetRef.snippetId}`);
    }

    const data = await handler(ctx, input);

    return {
      stepId: step.id,
      data,
      resourceUsage: ctx.resourceUsage,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Gather input from dependencies
   */
  private gatherInput(
    step: Step,
    stepOutputs: Map<StepId, StepOutput>,
    chainInput: unknown
  ): unknown {
    if (step.dependencies.length === 0) {
      return chainInput;
    }

    if (step.dependencies.length === 1) {
      const depOutput = stepOutputs.get(step.dependencies[0]);
      return depOutput?.data;
    }

    // Multiple dependencies - return object with all outputs
    const inputs: Record<string, unknown> = {};
    for (const depId of step.dependencies) {
      const depOutput = stepOutputs.get(depId);
      inputs[depId] = depOutput?.data;
    }
    return inputs;
  }

  /**
   * Create execution context
   */
  private createContext(
    state: ExecutionState,
    stepId: StepId,
    input: unknown,
    partitionIndex?: number,
    totalPartitions?: number
  ): ExecutionContext {
    return {
      executionId: state.executionId,
      chainId: state.chainId,
      stepId,
      partitionIndex,
      totalPartitions,
      input,
      stepOutputs: state.stepOutputs,
      startTime: Date.now(),
      resourceUsage: {
        subrequests: 0,
        cpuMs: 0,
        memoryBytes: 0,
      },
    };
  }

  /**
   * Calculate actual execution cost
   */
  private calculateActualCost(
    state: ExecutionState,
    chain: ChainDefinition
  ): ChainCost {
    const stageBreakdown: StageResourceSummary[] = [];
    let totalSnippetInvocations = 0;
    let totalSubrequests = 0;
    let maxParallelism = 1;
    let estimatedCpuMs = 0;
    let estimatedPeakMemoryBytes = 0;

    const levels = this.buildExecutionLevels(chain);

    for (const level of levels) {
      let levelParallelism = 0;
      let levelCpuMs = 0;
      let levelMemoryBytes = 0;

      for (const stepId of level) {
        const output = state.stepOutputs.get(stepId);
        if (!output) continue;

        const parallelism = output.partitionOutputs?.length ?? 1;
        levelParallelism += parallelism;
        totalSnippetInvocations += parallelism;
        totalSubrequests += output.resourceUsage.subrequests;
        levelCpuMs = Math.max(levelCpuMs, output.resourceUsage.cpuMs);
        levelMemoryBytes = Math.max(levelMemoryBytes, output.resourceUsage.memoryBytes);

        stageBreakdown.push({
          stageId: stepId,
          parallelism,
          perSnippetEstimate: output.resourceUsage,
          totalSubrequests: output.resourceUsage.subrequests,
        });
      }

      maxParallelism = Math.max(maxParallelism, levelParallelism);
      estimatedCpuMs += levelCpuMs;
      estimatedPeakMemoryBytes = Math.max(estimatedPeakMemoryBytes, levelMemoryBytes);
    }

    return {
      totalSnippetInvocations,
      totalSubrequests,
      maxParallelism,
      sequentialStages: levels.length,
      estimatedCpuMs,
      estimatedPeakMemoryBytes,
      stageBreakdown,
    };
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Log message if tracing is enabled
   */
  private log(message: string): void {
    if (this.trace) {
      console.log(`[ChainExecutor] ${message}`);
    }
  }
}

// =============================================================================
// Simulation Executor
// =============================================================================

/**
 * Simulates chain execution without actually running snippets.
 * Useful for cost estimation and testing.
 */
export class SimulationExecutor {
  /**
   * Simulate chain execution
   */
  simulate<TInput, TOutput>(
    chain: ChainDefinition<TInput, TOutput>,
    options: {
      partitionCounts?: Record<string, number>;
      stepDurationsMs?: Record<string, number>;
    } = {}
  ): ChainCost {
    const stepMap = new Map(chain.steps.map(s => [s.id, s]));
    const stageBreakdown: StageResourceSummary[] = [];
    let totalSnippetInvocations = 0;
    let totalSubrequests = 0;
    let maxParallelism = 1;
    let estimatedCpuMs = 0;
    let estimatedPeakMemoryBytes = 0;

    // Build execution levels
    const levels = this.buildExecutionLevels(chain);

    for (const level of levels) {
      let levelParallelism = 0;
      let levelCpuMs = 0;
      let levelMemoryBytes = 0;

      for (const stepId of level) {
        const step = stepMap.get(stepId)!;
        let parallelism = 1;

        if (step.mode === 'parallel') {
          const parallelStep = step as ParallelStep;
          parallelism = options.partitionCounts?.[stepId] ?? parallelStep.maxParallelism;
        }

        levelParallelism += parallelism;
        totalSnippetInvocations += parallelism;
        totalSubrequests += step.resourceEstimate.subrequests * parallelism;
        levelCpuMs = Math.max(levelCpuMs, step.resourceEstimate.cpuMs);
        levelMemoryBytes = Math.max(
          levelMemoryBytes,
          step.resourceEstimate.memoryBytes * parallelism
        );

        stageBreakdown.push({
          stageId: stepId,
          parallelism,
          perSnippetEstimate: step.resourceEstimate,
          totalSubrequests: step.resourceEstimate.subrequests * parallelism,
        });
      }

      maxParallelism = Math.max(maxParallelism, levelParallelism);
      estimatedCpuMs += levelCpuMs;
      estimatedPeakMemoryBytes = Math.max(estimatedPeakMemoryBytes, levelMemoryBytes);
    }

    return {
      totalSnippetInvocations,
      totalSubrequests,
      maxParallelism,
      sequentialStages: levels.length,
      estimatedCpuMs,
      estimatedPeakMemoryBytes,
      stageBreakdown,
    };
  }

  /**
   * Build execution levels from chain definition
   */
  private buildExecutionLevels(chain: ChainDefinition): StepId[][] {
    const levels: StepId[][] = [];
    const assigned = new Set<StepId>();

    while (assigned.size < chain.steps.length) {
      const level: StepId[] = [];

      for (const step of chain.steps) {
        if (assigned.has(step.id)) continue;

        const depsResolved = step.dependencies.every(depId => assigned.has(depId));
        if (depsResolved) {
          level.push(step.id);
        }
      }

      if (level.length === 0 && assigned.size < chain.steps.length) {
        break;
      }

      level.forEach(id => assigned.add(id));
      if (level.length > 0) {
        levels.push(level);
      }
    }

    return levels;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new snippet registry
 */
export function createRegistry(): SnippetRegistry {
  return new SnippetRegistry();
}

/**
 * Create a new chain executor
 */
export function createExecutor(options: ExecutorOptions): ChainExecutor {
  return new ChainExecutor(options);
}

/**
 * Create a new simulation executor
 */
export function createSimulator(): SimulationExecutor {
  return new SimulationExecutor();
}
