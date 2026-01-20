/**
 * Chained Snippets Architecture for EvoDB
 *
 * Types and interfaces for building complex query pipelines from
 * modular, parallelizable snippet steps.
 *
 * Snippet Constraints (per Cloudflare):
 * - 5 subrequests max
 * - 5ms CPU time
 * - 32MB RAM
 *
 * Chaining unlocks more complex queries by composing snippets:
 * - Sequential: A → B → C
 * - Parallel fan-out: A → [B1, B2, B3] → C
 * - DAG execution: Complex dependency graphs
 */

// =============================================================================
// Resource Budget Types
// =============================================================================

/**
 * Resource limits for a single snippet execution
 */
export interface SnippetBudget {
  /** Maximum subrequests (default: 5) */
  maxSubrequests: number;
  /** Maximum CPU time in milliseconds (default: 5) */
  maxCpuMs: number;
  /** Maximum memory in bytes (default: 32MB) */
  maxMemoryBytes: number;
}

/**
 * Default Cloudflare snippet constraints
 */
export const DEFAULT_SNIPPET_BUDGET: SnippetBudget = {
  maxSubrequests: 5,
  maxCpuMs: 5,
  maxMemoryBytes: 32 * 1024 * 1024, // 32MB
};

/**
 * Estimated resource usage for a snippet step
 */
export interface ResourceEstimate {
  /** Estimated subrequests */
  subrequests: number;
  /** Estimated CPU time in milliseconds */
  cpuMs: number;
  /** Estimated memory in bytes */
  memoryBytes: number;
}

/**
 * Aggregated cost for an entire chain execution
 */
export interface ChainCost {
  /** Total number of snippet invocations */
  totalSnippetInvocations: number;
  /** Total subrequests across all snippets */
  totalSubrequests: number;
  /** Maximum parallel width at any stage */
  maxParallelism: number;
  /** Number of sequential stages */
  sequentialStages: number;
  /** Estimated total CPU time (sequential sum) */
  estimatedCpuMs: number;
  /** Estimated peak memory (max of any stage) */
  estimatedPeakMemoryBytes: number;
  /** Per-stage breakdown */
  stageBreakdown: StageResourceSummary[];
}

export interface StageResourceSummary {
  stageId: string;
  parallelism: number;
  perSnippetEstimate: ResourceEstimate;
  totalSubrequests: number;
}

// =============================================================================
// Step Types
// =============================================================================

/**
 * Unique identifier for a step in the chain
 */
export type StepId = string & { readonly __brand: 'StepId' };

/**
 * Creates a branded StepId
 */
export function stepId(id: string): StepId {
  return id as StepId;
}

/**
 * Execution mode for a step
 */
export type StepExecutionMode =
  | 'sequential'    // Single snippet execution
  | 'parallel'      // Fan-out to multiple parallel snippets
  | 'conditional';  // Execute based on runtime condition

/**
 * Base step definition
 */
export interface StepBase<_TInput = unknown, _TOutput = unknown> {
  /** Unique step identifier */
  id: StepId;
  /** Human-readable step name */
  name: string;
  /** Step description */
  description?: string;
  /** Execution mode */
  mode: StepExecutionMode;
  /** Resource estimate for this step */
  resourceEstimate: ResourceEstimate;
  /** IDs of steps that must complete before this step */
  dependencies: StepId[];
}

/**
 * Sequential step - single snippet execution
 */
export interface SequentialStep<TInput = unknown, TOutput = unknown>
  extends StepBase<TInput, TOutput> {
  mode: 'sequential';
  /** Snippet code or reference */
  snippet: SnippetRef;
}

/**
 * Parallel step - fan-out to multiple snippets
 */
export interface ParallelStep<TInput = unknown, TOutput = unknown>
  extends StepBase<TInput, TOutput> {
  mode: 'parallel';
  /** Snippet code or reference (executed for each partition) */
  snippet: SnippetRef;
  /** Function to determine parallelism factor at runtime */
  partitioner: PartitionerRef;
  /** Maximum parallel instances */
  maxParallelism: number;
}

/**
 * Conditional step - execute based on runtime condition
 */
export interface ConditionalStep<TInput = unknown, TOutput = unknown>
  extends StepBase<TInput, TOutput> {
  mode: 'conditional';
  /** Condition evaluator */
  condition: ConditionRef;
  /** Step to execute if condition is true */
  ifTrue: SnippetRef;
  /** Step to execute if condition is false (optional) */
  ifFalse?: SnippetRef;
}

/**
 * Union type for all step types
 */
export type Step<TInput = unknown, TOutput = unknown> =
  | SequentialStep<TInput, TOutput>
  | ParallelStep<TInput, TOutput>
  | ConditionalStep<TInput, TOutput>;

// =============================================================================
// Snippet References
// =============================================================================

/**
 * Reference to a snippet (for serialization/transport)
 */
export interface SnippetRef {
  /** Unique snippet identifier */
  snippetId: string;
  /** Snippet version (for cache invalidation) */
  version?: string;
  /** Inline snippet code (for development/testing) */
  inlineCode?: string;
  /** Configuration passed to snippet */
  config?: Record<string, unknown>;
}

/**
 * Reference to a partitioner function
 */
export interface PartitionerRef {
  /** Partitioner identifier */
  partitionerId: string;
  /** Inline partitioner code */
  inlineCode?: string;
  /** Static partition count (if known at build time) */
  staticPartitionCount?: number;
}

/**
 * Reference to a condition evaluator
 */
export interface ConditionRef {
  /** Condition identifier */
  conditionId: string;
  /** Inline condition code */
  inlineCode?: string;
}

// =============================================================================
// Chain Definition
// =============================================================================

/**
 * Complete chain definition
 */
export interface ChainDefinition<_TInput = unknown, _TOutput = unknown> {
  /** Unique chain identifier */
  id: string;
  /** Human-readable chain name */
  name: string;
  /** Chain description */
  description?: string;
  /** Chain version */
  version: string;
  /** All steps in the chain */
  steps: Step[];
  /** ID of the entry step */
  entryStepId: StepId;
  /** ID of the final step (output) */
  exitStepId: StepId;
  /** Global resource budget override */
  budgetOverride?: Partial<SnippetBudget>;
}

// =============================================================================
// Execution Context
// =============================================================================

/**
 * Runtime context for snippet execution
 */
export interface ExecutionContext {
  /** Unique execution ID */
  executionId: string;
  /** Chain being executed */
  chainId: string;
  /** Current step being executed */
  stepId: StepId;
  /** Partition index (for parallel steps) */
  partitionIndex?: number;
  /** Total partitions (for parallel steps) */
  totalPartitions?: number;
  /** Input data for this step */
  input: unknown;
  /** Accumulated outputs from previous steps */
  stepOutputs: Map<StepId, StepOutput>;
  /** Start time */
  startTime: number;
  /** Resource tracking */
  resourceUsage: ResourceEstimate;
}

/**
 * Output from a completed step
 */
export interface StepOutput<T = unknown> {
  /** Step that produced this output */
  stepId: StepId;
  /** Output data */
  data: T;
  /** Actual resource usage */
  resourceUsage: ResourceEstimate;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Partition outputs (for parallel steps) */
  partitionOutputs?: PartitionOutput<T>[];
}

/**
 * Output from a single partition of a parallel step
 */
export interface PartitionOutput<T = unknown> {
  /** Partition index */
  partitionIndex: number;
  /** Partition data */
  data: T;
  /** Resource usage for this partition */
  resourceUsage: ResourceEstimate;
  /** Execution duration */
  durationMs: number;
}

// =============================================================================
// Execution Results
// =============================================================================

/**
 * Status of chain execution
 */
export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Result of chain execution
 */
export interface ChainExecutionResult<T = unknown> {
  /** Execution ID */
  executionId: string;
  /** Chain ID */
  chainId: string;
  /** Execution status */
  status: ExecutionStatus;
  /** Final output (if completed) */
  output?: T;
  /** Error (if failed) */
  error?: ChainExecutionError;
  /** All step outputs */
  stepOutputs: Map<StepId, StepOutput>;
  /** Total execution time */
  totalDurationMs: number;
  /** Actual resource cost */
  actualCost: ChainCost;
}

/**
 * Error during chain execution
 */
export interface ChainExecutionError {
  /** Step where error occurred */
  stepId: StepId;
  /** Partition index (if parallel step) */
  partitionIndex?: number;
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** Original error */
  cause?: unknown;
}

// =============================================================================
// Snippet Handler Types
// =============================================================================

/**
 * Handler function signature for a snippet
 */
export type SnippetHandler<TInput = unknown, TOutput = unknown> = (
  ctx: ExecutionContext,
  input: TInput
) => Promise<TOutput>;

/**
 * Partitioner function signature
 */
export type Partitioner<TInput = unknown> = (
  input: TInput,
  maxPartitions: number
) => PartitionSpec[];

/**
 * Specification for a partition
 */
export interface PartitionSpec {
  /** Partition index */
  index: number;
  /** Partition-specific input data */
  input: unknown;
  /** Optional partition metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Condition evaluator function signature
 */
export type ConditionEvaluator<TInput = unknown> = (
  input: TInput,
  ctx: ExecutionContext
) => boolean;

/**
 * Reducer function for combining parallel outputs
 */
export type Reducer<TPartitionOutput = unknown, TOutput = unknown> = (
  outputs: PartitionOutput<TPartitionOutput>[]
) => TOutput;

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Extract input type from a step
 */
export type StepInput<S extends Step> = S extends Step<infer I, unknown> ? I : never;

/**
 * Extract output type from a step
 */
export type StepOutputType<S extends Step> = S extends Step<unknown, infer O> ? O : never;

/**
 * Type-safe step connection
 */
export interface StepConnection<TOutput = unknown, TInput = unknown> {
  fromStep: StepId;
  toStep: StepId;
  /** Optional transformer for data shape conversion */
  transform?: (output: TOutput) => TInput;
}

/**
 * Validate that a chain is well-formed
 */
export interface ChainValidationResult {
  valid: boolean;
  errors: ChainValidationError[];
  warnings: ChainValidationWarning[];
}

export interface ChainValidationError {
  code: string;
  message: string;
  stepId?: StepId;
}

export interface ChainValidationWarning {
  code: string;
  message: string;
  stepId?: StepId;
}
