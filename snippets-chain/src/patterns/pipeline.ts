/**
 * Pipeline Pattern
 *
 * Sequential processing stages where each stage transforms
 * the output of the previous stage.
 *
 * Use cases:
 * - ETL pipelines (Extract, Transform, Load)
 * - Multi-stage data validation
 * - Progressive data enrichment
 * - Query optimization pipelines
 *
 * Pattern Structure:
 *   [Input] → Stage1 → Stage2 → Stage3 → ... → StageN → [Output]
 *
 * Resource Budget:
 * - Each stage: 1 snippet invocation
 * - Total: N snippet invocations (where N = number of stages)
 * - CPU: Sum of all stage CPU times (sequential)
 * - Memory: Max of any stage memory (stages don't overlap)
 */

import {
  type ChainDefinition,
  type ResourceEstimate,
} from '../types.js';
import { ChainBuilder } from '../chain-builder.js';

// =============================================================================
// Pipeline Types
// =============================================================================

/**
 * Configuration for a pipeline stage
 */
export interface PipelineStage {
  /** Stage identifier */
  id: string;
  /** Stage name */
  name: string;
  /** Description */
  description?: string;
  /** Snippet ID */
  snippetId: string;
  /** Resource estimate */
  resourceEstimate?: Partial<ResourceEstimate>;
  /** Whether this stage can be skipped based on input */
  skippable?: boolean;
  /** Timeout override for this stage */
  timeoutMs?: number;
}

/**
 * Configuration for pipeline pattern
 */
export interface PipelineConfig {
  /** Chain identifier */
  id: string;
  /** Chain name */
  name: string;
  /** Description */
  description?: string;
  /** Pipeline stages in order */
  stages: PipelineStage[];
  /** Enable short-circuit on error */
  shortCircuitOnError?: boolean;
}

/**
 * Pipeline execution context extension
 */
export interface PipelineContext<T = unknown> {
  /** Current stage index */
  stageIndex: number;
  /** Total stages */
  totalStages: number;
  /** Stage history (previous outputs) */
  history: Array<{ stageId: string; output: T; durationMs: number }>;
  /** Pipeline metadata */
  metadata: Record<string, unknown>;
}

// =============================================================================
// Builder Function
// =============================================================================

/**
 * Build a pipeline chain
 */
export function pipeline(config: PipelineConfig): ChainDefinition {
  if (config.stages.length === 0) {
    throw new Error('Pipeline must have at least one stage');
  }

  const builder = ChainBuilder.create({
    id: config.id,
    name: config.name,
    description: config.description ?? `Pipeline with ${config.stages.length} stages`,
  });

  // Add each stage as a sequential step
  for (const stage of config.stages) {
    builder.sequential(stage.id, {
      name: stage.name,
      description: stage.description,
      snippet: stage.snippetId,
      resourceEstimate: stage.resourceEstimate,
    });
  }

  return builder.build();
}

// =============================================================================
// Fluent Pipeline Builder
// =============================================================================

/**
 * Fluent builder specifically for pipelines
 */
export class PipelineBuilder {
  private stages: PipelineStage[] = [];
  private config: Partial<PipelineConfig> = {};

  constructor(id: string, name: string) {
    this.config.id = id;
    this.config.name = name;
  }

  /**
   * Create a new pipeline builder
   */
  static create(id: string, name: string): PipelineBuilder {
    return new PipelineBuilder(id, name);
  }

  /**
   * Set description
   */
  description(desc: string): this {
    this.config.description = desc;
    return this;
  }

  /**
   * Add a stage
   */
  stage(
    id: string,
    name: string,
    snippetId: string,
    options?: {
      description?: string;
      resourceEstimate?: Partial<ResourceEstimate>;
      skippable?: boolean;
      timeoutMs?: number;
    }
  ): this {
    this.stages.push({
      id,
      name,
      snippetId,
      ...options,
    });
    return this;
  }

  /**
   * Add an extraction stage
   */
  extract(snippetId: string, options?: Partial<PipelineStage>): this {
    return this.stage(
      options?.id ?? 'extract',
      options?.name ?? 'Extract',
      snippetId,
      {
        description: options?.description ?? 'Extract data from source',
        resourceEstimate: options?.resourceEstimate ?? {
          subrequests: 2,
          cpuMs: 2,
          memoryBytes: 8 * 1024 * 1024,
        },
      }
    );
  }

  /**
   * Add a transformation stage
   */
  transform(snippetId: string, options?: Partial<PipelineStage>): this {
    return this.stage(
      options?.id ?? `transform-${this.stages.length}`,
      options?.name ?? 'Transform',
      snippetId,
      {
        description: options?.description ?? 'Transform data',
        resourceEstimate: options?.resourceEstimate ?? {
          subrequests: 0,
          cpuMs: 3,
          memoryBytes: 16 * 1024 * 1024,
        },
      }
    );
  }

  /**
   * Add a validation stage
   */
  validate(snippetId: string, options?: Partial<PipelineStage>): this {
    return this.stage(
      options?.id ?? `validate-${this.stages.length}`,
      options?.name ?? 'Validate',
      snippetId,
      {
        description: options?.description ?? 'Validate data',
        resourceEstimate: options?.resourceEstimate ?? {
          subrequests: 0,
          cpuMs: 1,
          memoryBytes: 4 * 1024 * 1024,
        },
      }
    );
  }

  /**
   * Add an enrichment stage
   */
  enrich(snippetId: string, options?: Partial<PipelineStage>): this {
    return this.stage(
      options?.id ?? `enrich-${this.stages.length}`,
      options?.name ?? 'Enrich',
      snippetId,
      {
        description: options?.description ?? 'Enrich data with additional information',
        resourceEstimate: options?.resourceEstimate ?? {
          subrequests: 3,
          cpuMs: 2,
          memoryBytes: 8 * 1024 * 1024,
        },
      }
    );
  }

  /**
   * Add a load stage
   */
  load(snippetId: string, options?: Partial<PipelineStage>): this {
    return this.stage(
      options?.id ?? 'load',
      options?.name ?? 'Load',
      snippetId,
      {
        description: options?.description ?? 'Load data to destination',
        resourceEstimate: options?.resourceEstimate ?? {
          subrequests: 2,
          cpuMs: 2,
          memoryBytes: 8 * 1024 * 1024,
        },
      }
    );
  }

  /**
   * Enable short-circuit on error
   */
  shortCircuitOnError(enabled = true): this {
    this.config.shortCircuitOnError = enabled;
    return this;
  }

  /**
   * Build the pipeline chain
   */
  build(): ChainDefinition {
    return pipeline({
      id: this.config.id!,
      name: this.config.name!,
      description: this.config.description,
      stages: this.stages,
      shortCircuitOnError: this.config.shortCircuitOnError,
    });
  }

  /**
   * Get stage count
   */
  getStageCount(): number {
    return this.stages.length;
  }
}

// =============================================================================
// Pre-built Pipeline Variants
// =============================================================================

/**
 * ETL (Extract, Transform, Load) pipeline
 */
export function etlPipeline(
  id: string,
  options: {
    extractSnippetId: string;
    transformSnippetId: string;
    loadSnippetId: string;
  }
): ChainDefinition {
  return PipelineBuilder.create(id, `ETL Pipeline: ${id}`)
    .description('Extract, Transform, Load pipeline')
    .extract(options.extractSnippetId)
    .transform(options.transformSnippetId)
    .load(options.loadSnippetId)
    .build();
}

/**
 * Data validation pipeline
 */
export function validationPipeline(
  id: string,
  validationSnippetIds: string[]
): ChainDefinition {
  const builder = PipelineBuilder.create(id, `Validation Pipeline: ${id}`)
    .description('Multi-stage data validation pipeline')
    .shortCircuitOnError();

  validationSnippetIds.forEach((snippetId, index) => {
    builder.validate(snippetId, {
      id: `validate-${index}`,
      name: `Validation Stage ${index + 1}`,
    });
  });

  return builder.build();
}

/**
 * Data enrichment pipeline
 */
export function enrichmentPipeline(
  id: string,
  enrichmentSnippetIds: string[]
): ChainDefinition {
  const builder = PipelineBuilder.create(id, `Enrichment Pipeline: ${id}`)
    .description('Progressive data enrichment pipeline');

  enrichmentSnippetIds.forEach((snippetId, index) => {
    builder.enrich(snippetId, {
      id: `enrich-${index}`,
      name: `Enrichment Stage ${index + 1}`,
    });
  });

  return builder.build();
}

/**
 * Query optimization pipeline
 */
export function queryOptimizationPipeline(
  id: string,
  options: {
    parseSnippetId: string;
    analyzeSnippetId: string;
    optimizeSnippetId: string;
    planSnippetId: string;
  }
): ChainDefinition {
  return PipelineBuilder.create(id, `Query Optimization: ${id}`)
    .description('Query parsing, analysis, optimization, and planning')
    .stage('parse', 'Parse Query', options.parseSnippetId, {
      description: 'Parse SQL/query into AST',
      resourceEstimate: { subrequests: 0, cpuMs: 1, memoryBytes: 4 * 1024 * 1024 },
    })
    .stage('analyze', 'Analyze Query', options.analyzeSnippetId, {
      description: 'Semantic analysis and validation',
      resourceEstimate: { subrequests: 1, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    })
    .stage('optimize', 'Optimize Query', options.optimizeSnippetId, {
      description: 'Apply optimization rules',
      resourceEstimate: { subrequests: 0, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    })
    .stage('plan', 'Generate Plan', options.planSnippetId, {
      description: 'Generate execution plan',
      resourceEstimate: { subrequests: 2, cpuMs: 2, memoryBytes: 8 * 1024 * 1024 },
    })
    .build();
}

// =============================================================================
// Cost Calculator
// =============================================================================

/**
 * Calculate estimated cost for pipeline pattern
 */
export function calculatePipelineCost(
  stageEstimates: ResourceEstimate[]
): {
  totalSnippetInvocations: number;
  totalSubrequests: number;
  estimatedCpuMs: number;
  peakMemoryBytes: number;
} {
  return {
    totalSnippetInvocations: stageEstimates.length,
    totalSubrequests: stageEstimates.reduce((sum, e) => sum + e.subrequests, 0),
    estimatedCpuMs: stageEstimates.reduce((sum, e) => sum + e.cpuMs, 0),
    peakMemoryBytes: Math.max(...stageEstimates.map(e => e.memoryBytes)),
  };
}
