/**
 * Fluent API for building snippet chains
 *
 * Provides a type-safe, composable interface for constructing
 * complex query pipelines from modular snippet steps.
 */

import {
  type ChainDefinition,
  type Step,
  type SequentialStep,
  type ParallelStep,
  type ConditionalStep,
  type StepId,
  type SnippetRef,
  type PartitionerRef,
  type ConditionRef,
  type ResourceEstimate,
  type SnippetBudget,
  type ChainCost,
  type StageResourceSummary,
  type ChainValidationResult,
  type ChainValidationError,
  type ChainValidationWarning,
  DEFAULT_SNIPPET_BUDGET,
  stepId,
} from './types.js';

// =============================================================================
// Builder Types
// =============================================================================

/**
 * Options for creating a new chain
 */
export interface ChainBuilderOptions {
  /** Chain identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
  /** Version string */
  version?: string;
  /** Budget override */
  budgetOverride?: Partial<SnippetBudget>;
}

/**
 * Options for adding a sequential step
 */
export interface SequentialStepOptions {
  /** Step name */
  name: string;
  /** Description */
  description?: string;
  /** Snippet reference */
  snippet: SnippetRef | string;
  /** Resource estimate */
  resourceEstimate?: Partial<ResourceEstimate>;
}

/**
 * Options for adding a parallel step
 */
export interface ParallelStepOptions {
  /** Step name */
  name: string;
  /** Description */
  description?: string;
  /** Snippet reference */
  snippet: SnippetRef | string;
  /** Partitioner reference */
  partitioner: PartitionerRef | string;
  /** Maximum parallelism */
  maxParallelism?: number;
  /** Resource estimate per partition */
  resourceEstimate?: Partial<ResourceEstimate>;
}

/**
 * Options for adding a conditional step
 */
export interface ConditionalStepOptions {
  /** Step name */
  name: string;
  /** Description */
  description?: string;
  /** Condition reference */
  condition: ConditionRef | string;
  /** Snippet to run if true */
  ifTrue: SnippetRef | string;
  /** Snippet to run if false */
  ifFalse?: SnippetRef | string;
  /** Resource estimate */
  resourceEstimate?: Partial<ResourceEstimate>;
}

// =============================================================================
// Default Resource Estimates
// =============================================================================

const DEFAULT_RESOURCE_ESTIMATE: ResourceEstimate = {
  subrequests: 1,
  cpuMs: 2,
  memoryBytes: 8 * 1024 * 1024, // 8MB
};

function mergeResourceEstimate(
  partial?: Partial<ResourceEstimate>
): ResourceEstimate {
  return {
    ...DEFAULT_RESOURCE_ESTIMATE,
    ...partial,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function normalizeSnippetRef(ref: SnippetRef | string): SnippetRef {
  if (typeof ref === 'string') {
    return { snippetId: ref };
  }
  return ref;
}

function normalizePartitionerRef(ref: PartitionerRef | string): PartitionerRef {
  if (typeof ref === 'string') {
    return { partitionerId: ref };
  }
  return ref;
}

function normalizeConditionRef(ref: ConditionRef | string): ConditionRef {
  if (typeof ref === 'string') {
    return { conditionId: ref };
  }
  return ref;
}

// =============================================================================
// Chain Builder Class
// =============================================================================

/**
 * Fluent builder for constructing snippet chains
 */
export class ChainBuilder {
  private readonly options: ChainBuilderOptions;
  private steps: Map<StepId, Step> = new Map();
  private stepOrder: StepId[] = [];
  private entryStepId: StepId | null = null;
  private exitStepId: StepId | null = null;
  private stepCounter = 0;

  constructor(options: ChainBuilderOptions) {
    this.options = {
      ...options,
      version: options.version ?? '1.0.0',
    };
  }

  /**
   * Create a new chain builder
   */
  static create(options: ChainBuilderOptions): ChainBuilder {
    return new ChainBuilder(options);
  }

  /**
   * Generate a unique step ID
   */
  private generateStepId(prefix: string): StepId {
    return stepId(`${prefix}-${++this.stepCounter}`);
  }

  /**
   * Add a sequential step
   */
  sequential(
    idOrOptions: string | SequentialStepOptions,
    options?: SequentialStepOptions
  ): ChainBuilder {
    const id = typeof idOrOptions === 'string'
      ? stepId(idOrOptions)
      : this.generateStepId('seq');
    const opts = typeof idOrOptions === 'string' ? options! : idOrOptions;

    const step: SequentialStep = {
      id,
      name: opts.name,
      description: opts.description,
      mode: 'sequential',
      snippet: normalizeSnippetRef(opts.snippet),
      resourceEstimate: mergeResourceEstimate(opts.resourceEstimate),
      dependencies: this.stepOrder.length > 0 ? [this.stepOrder[this.stepOrder.length - 1]] : [],
    };

    this.steps.set(id, step);
    this.stepOrder.push(id);

    if (!this.entryStepId) {
      this.entryStepId = id;
    }
    this.exitStepId = id;

    return this;
  }

  /**
   * Add a parallel (fan-out) step
   */
  parallel(
    idOrOptions: string | ParallelStepOptions,
    options?: ParallelStepOptions
  ): ChainBuilder {
    const id = typeof idOrOptions === 'string'
      ? stepId(idOrOptions)
      : this.generateStepId('par');
    const opts = typeof idOrOptions === 'string' ? options! : idOrOptions;

    const step: ParallelStep = {
      id,
      name: opts.name,
      description: opts.description,
      mode: 'parallel',
      snippet: normalizeSnippetRef(opts.snippet),
      partitioner: normalizePartitionerRef(opts.partitioner),
      maxParallelism: opts.maxParallelism ?? 10,
      resourceEstimate: mergeResourceEstimate(opts.resourceEstimate),
      dependencies: this.stepOrder.length > 0 ? [this.stepOrder[this.stepOrder.length - 1]] : [],
    };

    this.steps.set(id, step);
    this.stepOrder.push(id);

    if (!this.entryStepId) {
      this.entryStepId = id;
    }
    this.exitStepId = id;

    return this;
  }

  /**
   * Add a conditional step
   */
  conditional(
    idOrOptions: string | ConditionalStepOptions,
    options?: ConditionalStepOptions
  ): ChainBuilder {
    const id = typeof idOrOptions === 'string'
      ? stepId(idOrOptions)
      : this.generateStepId('cond');
    const opts = typeof idOrOptions === 'string' ? options! : idOrOptions;

    const step: ConditionalStep = {
      id,
      name: opts.name,
      description: opts.description,
      mode: 'conditional',
      condition: normalizeConditionRef(opts.condition),
      ifTrue: normalizeSnippetRef(opts.ifTrue),
      ifFalse: opts.ifFalse ? normalizeSnippetRef(opts.ifFalse) : undefined,
      resourceEstimate: mergeResourceEstimate(opts.resourceEstimate),
      dependencies: this.stepOrder.length > 0 ? [this.stepOrder[this.stepOrder.length - 1]] : [],
    };

    this.steps.set(id, step);
    this.stepOrder.push(id);

    if (!this.entryStepId) {
      this.entryStepId = id;
    }
    this.exitStepId = id;

    return this;
  }

  /**
   * Add a step with explicit dependencies (for DAG construction)
   */
  step(
    id: string,
    step: Omit<Step, 'id' | 'dependencies'>,
    dependencies: string[] = []
  ): ChainBuilder {
    const stepWithId: Step = {
      ...step,
      id: stepId(id),
      dependencies: dependencies.map(stepId),
    } as Step;

    this.steps.set(stepWithId.id, stepWithId);
    this.stepOrder.push(stepWithId.id);

    if (!this.entryStepId) {
      this.entryStepId = stepWithId.id;
    }
    this.exitStepId = stepWithId.id;

    return this;
  }

  /**
   * Set the entry step explicitly
   */
  setEntryStep(id: string): ChainBuilder {
    this.entryStepId = stepId(id);
    return this;
  }

  /**
   * Set the exit step explicitly
   */
  setExitStep(id: string): ChainBuilder {
    this.exitStepId = stepId(id);
    return this;
  }

  /**
   * Add dependency between steps
   */
  addDependency(stepId: string, dependsOn: string): ChainBuilder {
    const step = this.steps.get(stepId as StepId);
    if (step) {
      step.dependencies.push(dependsOn as StepId);
    }
    return this;
  }

  /**
   * Validate the chain definition
   */
  validate(): ChainValidationResult {
    const errors: ChainValidationError[] = [];
    const warnings: ChainValidationWarning[] = [];

    // Check for empty chain
    if (this.steps.size === 0) {
      errors.push({
        code: 'EMPTY_CHAIN',
        message: 'Chain has no steps defined',
      });
      return { valid: false, errors, warnings };
    }

    // Check entry/exit steps
    if (!this.entryStepId) {
      errors.push({
        code: 'NO_ENTRY_STEP',
        message: 'No entry step defined',
      });
    } else if (!this.steps.has(this.entryStepId)) {
      errors.push({
        code: 'INVALID_ENTRY_STEP',
        message: `Entry step "${this.entryStepId}" not found`,
        stepId: this.entryStepId,
      });
    }

    if (!this.exitStepId) {
      errors.push({
        code: 'NO_EXIT_STEP',
        message: 'No exit step defined',
      });
    } else if (!this.steps.has(this.exitStepId)) {
      errors.push({
        code: 'INVALID_EXIT_STEP',
        message: `Exit step "${this.exitStepId}" not found`,
        stepId: this.exitStepId,
      });
    }

    // Check dependencies
    for (const [id, step] of this.steps) {
      for (const depId of step.dependencies) {
        if (!this.steps.has(depId)) {
          errors.push({
            code: 'MISSING_DEPENDENCY',
            message: `Step "${id}" depends on non-existent step "${depId}"`,
            stepId: id,
          });
        }
      }

      // Check for self-dependency
      if (step.dependencies.includes(id)) {
        errors.push({
          code: 'SELF_DEPENDENCY',
          message: `Step "${id}" depends on itself`,
          stepId: id,
        });
      }
    }

    // Check for cycles (simplified - full cycle detection would use DFS)
    const visited = new Set<StepId>();
    const recursionStack = new Set<StepId>();

    const hasCycle = (id: StepId): boolean => {
      if (recursionStack.has(id)) return true;
      if (visited.has(id)) return false;

      visited.add(id);
      recursionStack.add(id);

      const step = this.steps.get(id);
      if (step) {
        for (const depId of step.dependencies) {
          if (hasCycle(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(id);
      return false;
    };

    for (const id of this.steps.keys()) {
      if (hasCycle(id)) {
        errors.push({
          code: 'CYCLE_DETECTED',
          message: `Cycle detected involving step "${id}"`,
          stepId: id,
        });
        break;
      }
    }

    // Resource warnings
    const budget = { ...DEFAULT_SNIPPET_BUDGET, ...this.options.budgetOverride };
    for (const [id, step] of this.steps) {
      if (step.resourceEstimate.subrequests > budget.maxSubrequests) {
        warnings.push({
          code: 'EXCEEDS_SUBREQUEST_BUDGET',
          message: `Step "${id}" estimates ${step.resourceEstimate.subrequests} subrequests (budget: ${budget.maxSubrequests})`,
          stepId: id,
        });
      }
      if (step.resourceEstimate.cpuMs > budget.maxCpuMs) {
        warnings.push({
          code: 'EXCEEDS_CPU_BUDGET',
          message: `Step "${id}" estimates ${step.resourceEstimate.cpuMs}ms CPU (budget: ${budget.maxCpuMs}ms)`,
          stepId: id,
        });
      }
      if (step.resourceEstimate.memoryBytes > budget.maxMemoryBytes) {
        warnings.push({
          code: 'EXCEEDS_MEMORY_BUDGET',
          message: `Step "${id}" estimates ${step.resourceEstimate.memoryBytes} bytes (budget: ${budget.maxMemoryBytes})`,
          stepId: id,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate estimated cost for the chain
   */
  estimateCost(): ChainCost {
    const stageBreakdown: StageResourceSummary[] = [];
    let totalSnippetInvocations = 0;
    let totalSubrequests = 0;
    let maxParallelism = 1;
    let estimatedCpuMs = 0;
    let estimatedPeakMemoryBytes = 0;

    // Group steps by execution level (topological sort)
    const levels = this.getExecutionLevels();

    for (const level of levels) {
      let levelParallelism = 0;
      let levelCpuMs = 0;
      let levelMemoryBytes = 0;

      for (const id of level) {
        const step = this.steps.get(id)!;
        let parallelism = 1;

        if (step.mode === 'parallel') {
          parallelism = (step as ParallelStep).maxParallelism;
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
          stageId: id,
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
   * Get execution levels (topological sort)
   */
  private getExecutionLevels(): StepId[][] {
    const levels: StepId[][] = [];
    const assigned = new Set<StepId>();

    while (assigned.size < this.steps.size) {
      const level: StepId[] = [];

      for (const [id, step] of this.steps) {
        if (assigned.has(id)) continue;

        const depsResolved = step.dependencies.every(depId => assigned.has(depId));
        if (depsResolved) {
          level.push(id);
        }
      }

      if (level.length === 0 && assigned.size < this.steps.size) {
        // Circular dependency or unreachable steps
        break;
      }

      level.forEach(id => assigned.add(id));
      if (level.length > 0) {
        levels.push(level);
      }
    }

    return levels;
  }

  /**
   * Build the final chain definition
   */
  build(): ChainDefinition {
    const validation = this.validate();
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => e.message).join(', ');
      throw new Error(`Invalid chain: ${errorMessages}`);
    }

    return {
      id: this.options.id,
      name: this.options.name,
      description: this.options.description,
      version: this.options.version!,
      steps: Array.from(this.steps.values()),
      entryStepId: this.entryStepId!,
      exitStepId: this.exitStepId!,
      budgetOverride: this.options.budgetOverride,
    };
  }

  /**
   * Get all steps
   */
  getSteps(): Step[] {
    return Array.from(this.steps.values());
  }

  /**
   * Get a specific step by ID
   */
  getStep(id: string): Step | undefined {
    return this.steps.get(stepId(id));
  }
}

// =============================================================================
// Convenience Factory Functions
// =============================================================================

/**
 * Create a new chain builder
 */
export function chain(options: ChainBuilderOptions): ChainBuilder {
  return ChainBuilder.create(options);
}

/**
 * Create a sequential step definition
 */
export function seq(
  name: string,
  snippet: SnippetRef | string,
  resourceEstimate?: Partial<ResourceEstimate>
): SequentialStepOptions {
  return { name, snippet, resourceEstimate };
}

/**
 * Create a parallel step definition
 */
export function par(
  name: string,
  snippet: SnippetRef | string,
  partitioner: PartitionerRef | string,
  maxParallelism = 10,
  resourceEstimate?: Partial<ResourceEstimate>
): ParallelStepOptions {
  return { name, snippet, partitioner, maxParallelism, resourceEstimate };
}

/**
 * Create a conditional step definition
 */
export function cond(
  name: string,
  condition: ConditionRef | string,
  ifTrue: SnippetRef | string,
  ifFalse?: SnippetRef | string,
  resourceEstimate?: Partial<ResourceEstimate>
): ConditionalStepOptions {
  return { name, condition, ifTrue, ifFalse, resourceEstimate };
}
