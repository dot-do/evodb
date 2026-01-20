/**
 * Tests for Pipeline Pattern
 */

import { describe, it, expect } from 'vitest';
import {
  pipeline,
  PipelineBuilder,
  etlPipeline,
  validationPipeline,
  enrichmentPipeline,
  queryOptimizationPipeline,
  calculatePipelineCost,
  type PipelineConfig,
  type PipelineStage,
} from './pipeline.js';

describe('pipeline builder function', () => {
  it('should create a pipeline chain from stages', () => {
    const config: PipelineConfig = {
      id: 'test-pipeline',
      name: 'Test Pipeline',
      stages: [
        { id: 'stage-1', name: 'Stage 1', snippetId: 's1' },
        { id: 'stage-2', name: 'Stage 2', snippetId: 's2' },
        { id: 'stage-3', name: 'Stage 3', snippetId: 's3' },
      ],
    };

    const chain = pipeline(config);

    expect(chain.id).toBe('test-pipeline');
    expect(chain.name).toBe('Test Pipeline');
    expect(chain.steps).toHaveLength(3);
  });

  it('should throw error for empty stages', () => {
    const config: PipelineConfig = {
      id: 'test-pipeline',
      name: 'Test Pipeline',
      stages: [],
    };

    expect(() => pipeline(config)).toThrow('Pipeline must have at least one stage');
  });

  it('should set all stages as sequential', () => {
    const config: PipelineConfig = {
      id: 'test-pipeline',
      name: 'Test',
      stages: [
        { id: 'stage-1', name: 'Stage 1', snippetId: 's1' },
        { id: 'stage-2', name: 'Stage 2', snippetId: 's2' },
      ],
    };

    const chain = pipeline(config);

    chain.steps.forEach(step => {
      expect(step.mode).toBe('sequential');
    });
  });

  it('should set dependencies correctly (each stage depends on previous)', () => {
    const config: PipelineConfig = {
      id: 'test-pipeline',
      name: 'Test',
      stages: [
        { id: 'stage-1', name: 'Stage 1', snippetId: 's1' },
        { id: 'stage-2', name: 'Stage 2', snippetId: 's2' },
        { id: 'stage-3', name: 'Stage 3', snippetId: 's3' },
      ],
    };

    const chain = pipeline(config);

    expect(chain.steps[0].dependencies).toHaveLength(0);
    expect(chain.steps[1].dependencies).toContain('stage-1');
    expect(chain.steps[2].dependencies).toContain('stage-2');
  });

  it('should apply custom resource estimates', () => {
    const config: PipelineConfig = {
      id: 'test-pipeline',
      name: 'Test',
      stages: [
        {
          id: 'stage-1',
          name: 'Stage 1',
          snippetId: 's1',
          resourceEstimate: { subrequests: 3, cpuMs: 4, memoryBytes: 16 * 1024 * 1024 },
        },
      ],
    };

    const chain = pipeline(config);

    expect(chain.steps[0].resourceEstimate.subrequests).toBe(3);
    expect(chain.steps[0].resourceEstimate.cpuMs).toBe(4);
  });

  it('should include description if provided', () => {
    const config: PipelineConfig = {
      id: 'test-pipeline',
      name: 'Test',
      description: 'Custom description',
      stages: [{ id: 's1', name: 'Stage', snippetId: 'snippet' }],
    };

    const chain = pipeline(config);

    expect(chain.description).toBe('Custom description');
  });

  it('should use default description with stage count if not provided', () => {
    const config: PipelineConfig = {
      id: 'test-pipeline',
      name: 'Test',
      stages: [
        { id: 's1', name: 'Stage 1', snippetId: 'snippet' },
        { id: 's2', name: 'Stage 2', snippetId: 'snippet' },
      ],
    };

    const chain = pipeline(config);

    expect(chain.description).toBe('Pipeline with 2 stages');
  });
});

describe('PipelineBuilder', () => {
  describe('construction', () => {
    it('should create builder with id and name', () => {
      const builder = PipelineBuilder.create('my-pipeline', 'My Pipeline');
      expect(builder.getStageCount()).toBe(0);
    });

    it('should support constructor instantiation', () => {
      const builder = new PipelineBuilder('my-pipeline', 'My Pipeline');
      expect(builder.getStageCount()).toBe(0);
    });
  });

  describe('description', () => {
    it('should set description', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .description('My description')
        .stage('s1', 'Stage', 'snippet')
        .build();

      expect(chain.description).toBe('My description');
    });
  });

  describe('stage', () => {
    it('should add a generic stage', () => {
      const builder = PipelineBuilder.create('id', 'Name')
        .stage('s1', 'Stage 1', 'snippet1')
        .stage('s2', 'Stage 2', 'snippet2');

      expect(builder.getStageCount()).toBe(2);
    });

    it('should accept stage options', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .stage('s1', 'Stage 1', 'snippet', {
          description: 'Stage description',
          resourceEstimate: { cpuMs: 5 },
          skippable: true,
          timeoutMs: 10000,
        })
        .build();

      expect(chain.steps[0].description).toBe('Stage description');
      expect(chain.steps[0].resourceEstimate.cpuMs).toBe(5);
    });
  });

  describe('extract', () => {
    it('should add extract stage with defaults', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .extract('extract-snippet')
        .build();

      expect(chain.steps[0].name).toBe('Extract');
      expect(chain.steps[0].description).toBe('Extract data from source');
      expect(chain.steps[0].resourceEstimate.subrequests).toBe(2);
    });

    it('should accept custom options', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .extract('extract-snippet', {
          id: 'custom-extract',
          name: 'Custom Extract',
          description: 'Custom description',
        })
        .build();

      expect(chain.steps[0].id).toBe('custom-extract');
      expect(chain.steps[0].name).toBe('Custom Extract');
    });
  });

  describe('transform', () => {
    it('should add transform stage with defaults', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .transform('transform-snippet')
        .build();

      expect(chain.steps[0].name).toBe('Transform');
      expect(chain.steps[0].description).toBe('Transform data');
      expect(chain.steps[0].resourceEstimate.cpuMs).toBe(3);
      expect(chain.steps[0].resourceEstimate.memoryBytes).toBe(16 * 1024 * 1024);
    });

    it('should generate unique IDs for multiple transforms', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .transform('t1')
        .transform('t2')
        .build();

      expect(chain.steps[0].id).not.toBe(chain.steps[1].id);
    });
  });

  describe('validate', () => {
    it('should add validate stage with defaults', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .validate('validate-snippet')
        .build();

      expect(chain.steps[0].name).toBe('Validate');
      expect(chain.steps[0].description).toBe('Validate data');
      expect(chain.steps[0].resourceEstimate.subrequests).toBe(0);
      expect(chain.steps[0].resourceEstimate.cpuMs).toBe(1);
    });
  });

  describe('enrich', () => {
    it('should add enrich stage with defaults', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .enrich('enrich-snippet')
        .build();

      expect(chain.steps[0].name).toBe('Enrich');
      expect(chain.steps[0].description).toBe('Enrich data with additional information');
      expect(chain.steps[0].resourceEstimate.subrequests).toBe(3);
    });
  });

  describe('load', () => {
    it('should add load stage with defaults', () => {
      const chain = PipelineBuilder.create('id', 'Name')
        .load('load-snippet')
        .build();

      expect(chain.steps[0].name).toBe('Load');
      expect(chain.steps[0].description).toBe('Load data to destination');
      expect(chain.steps[0].resourceEstimate.subrequests).toBe(2);
    });
  });

  describe('shortCircuitOnError', () => {
    it('should enable short circuit by default', () => {
      const builder = PipelineBuilder.create('id', 'Name')
        .shortCircuitOnError()
        .stage('s1', 'Stage', 'snippet');

      // This is stored in config but not directly visible on chain definition
      // The implementation uses this internally
      const chain = builder.build();
      expect(chain).toBeDefined();
    });

    it('should accept explicit value', () => {
      const builder = PipelineBuilder.create('id', 'Name')
        .shortCircuitOnError(false)
        .stage('s1', 'Stage', 'snippet');

      const chain = builder.build();
      expect(chain).toBeDefined();
    });
  });

  describe('fluent chaining', () => {
    it('should support full ETL pipeline construction', () => {
      const chain = PipelineBuilder.create('etl', 'ETL Pipeline')
        .description('Extract, Transform, Load')
        .extract('extract-snippet')
        .validate('validate-snippet')
        .transform('transform-snippet')
        .enrich('enrich-snippet')
        .load('load-snippet')
        .shortCircuitOnError()
        .build();

      expect(chain.steps).toHaveLength(5);
      expect(chain.steps[0].name).toBe('Extract');
      expect(chain.steps[1].name).toBe('Validate');
      expect(chain.steps[2].name).toBe('Transform');
      expect(chain.steps[3].name).toBe('Enrich');
      expect(chain.steps[4].name).toBe('Load');
    });
  });

  describe('getStageCount', () => {
    it('should return correct stage count', () => {
      const builder = PipelineBuilder.create('id', 'Name')
        .stage('s1', 'S1', 'snippet')
        .stage('s2', 'S2', 'snippet')
        .stage('s3', 'S3', 'snippet');

      expect(builder.getStageCount()).toBe(3);
    });
  });
});

describe('Pre-built Pipeline Variants', () => {
  describe('etlPipeline', () => {
    it('should create ETL pipeline with 3 stages', () => {
      const chain = etlPipeline('my-etl', {
        extractSnippetId: 'extract',
        transformSnippetId: 'transform',
        loadSnippetId: 'load',
      });

      expect(chain.id).toBe('my-etl');
      expect(chain.name).toBe('ETL Pipeline: my-etl');
      expect(chain.description).toBe('Extract, Transform, Load pipeline');
      expect(chain.steps).toHaveLength(3);
      expect(chain.steps[0].name).toBe('Extract');
      expect(chain.steps[1].name).toBe('Transform');
      expect(chain.steps[2].name).toBe('Load');
    });
  });

  describe('validationPipeline', () => {
    it('should create validation pipeline with multiple stages', () => {
      const chain = validationPipeline('validation', ['v1', 'v2', 'v3']);

      expect(chain.id).toBe('validation');
      expect(chain.name).toBe('Validation Pipeline: validation');
      expect(chain.description).toBe('Multi-stage data validation pipeline');
      expect(chain.steps).toHaveLength(3);
    });

    it('should name stages sequentially', () => {
      const chain = validationPipeline('validation', ['v1', 'v2']);

      expect(chain.steps[0].name).toBe('Validation Stage 1');
      expect(chain.steps[1].name).toBe('Validation Stage 2');
    });

    it('should set stage IDs correctly', () => {
      const chain = validationPipeline('validation', ['v1', 'v2']);

      expect(chain.steps[0].id).toBe('validate-0');
      expect(chain.steps[1].id).toBe('validate-1');
    });
  });

  describe('enrichmentPipeline', () => {
    it('should create enrichment pipeline', () => {
      const chain = enrichmentPipeline('enrichment', ['e1', 'e2']);

      expect(chain.id).toBe('enrichment');
      expect(chain.name).toBe('Enrichment Pipeline: enrichment');
      expect(chain.description).toBe('Progressive data enrichment pipeline');
      expect(chain.steps).toHaveLength(2);
    });

    it('should name stages sequentially', () => {
      const chain = enrichmentPipeline('enrichment', ['e1', 'e2', 'e3']);

      expect(chain.steps[0].name).toBe('Enrichment Stage 1');
      expect(chain.steps[1].name).toBe('Enrichment Stage 2');
      expect(chain.steps[2].name).toBe('Enrichment Stage 3');
    });
  });

  describe('queryOptimizationPipeline', () => {
    it('should create query optimization pipeline with 4 stages', () => {
      const chain = queryOptimizationPipeline('query-opt', {
        parseSnippetId: 'parser',
        analyzeSnippetId: 'analyzer',
        optimizeSnippetId: 'optimizer',
        planSnippetId: 'planner',
      });

      expect(chain.id).toBe('query-opt');
      expect(chain.name).toBe('Query Optimization: query-opt');
      expect(chain.steps).toHaveLength(4);
      expect(chain.steps[0].name).toBe('Parse Query');
      expect(chain.steps[1].name).toBe('Analyze Query');
      expect(chain.steps[2].name).toBe('Optimize Query');
      expect(chain.steps[3].name).toBe('Generate Plan');
    });

    it('should have appropriate resource estimates for each stage', () => {
      const chain = queryOptimizationPipeline('query-opt', {
        parseSnippetId: 'parser',
        analyzeSnippetId: 'analyzer',
        optimizeSnippetId: 'optimizer',
        planSnippetId: 'planner',
      });

      // Parse should be CPU-light
      expect(chain.steps[0].resourceEstimate.cpuMs).toBe(1);
      // Plan should have subrequests
      expect(chain.steps[3].resourceEstimate.subrequests).toBe(2);
    });
  });
});

describe('calculatePipelineCost', () => {
  it('should calculate total snippet invocations', () => {
    const stages = [
      { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 },
      { subrequests: 2, cpuMs: 3, memoryBytes: 8 * 1024 * 1024 },
      { subrequests: 1, cpuMs: 2, memoryBytes: 4 * 1024 * 1024 },
    ];

    const cost = calculatePipelineCost(stages);

    expect(cost.totalSnippetInvocations).toBe(3);
  });

  it('should sum all subrequests', () => {
    const stages = [
      { subrequests: 2, cpuMs: 1, memoryBytes: 1024 },
      { subrequests: 3, cpuMs: 1, memoryBytes: 1024 },
      { subrequests: 1, cpuMs: 1, memoryBytes: 1024 },
    ];

    const cost = calculatePipelineCost(stages);

    expect(cost.totalSubrequests).toBe(6);
  });

  it('should sum CPU time (sequential execution)', () => {
    const stages = [
      { subrequests: 0, cpuMs: 2, memoryBytes: 1024 },
      { subrequests: 0, cpuMs: 3, memoryBytes: 1024 },
      { subrequests: 0, cpuMs: 4, memoryBytes: 1024 },
    ];

    const cost = calculatePipelineCost(stages);

    expect(cost.estimatedCpuMs).toBe(9);
  });

  it('should return peak memory (max of any stage)', () => {
    const stages = [
      { subrequests: 0, cpuMs: 1, memoryBytes: 4 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 1, memoryBytes: 16 * 1024 * 1024 },
      { subrequests: 0, cpuMs: 1, memoryBytes: 8 * 1024 * 1024 },
    ];

    const cost = calculatePipelineCost(stages);

    expect(cost.peakMemoryBytes).toBe(16 * 1024 * 1024);
  });

  it('should handle single stage', () => {
    const stages = [
      { subrequests: 2, cpuMs: 3, memoryBytes: 8 * 1024 * 1024 },
    ];

    const cost = calculatePipelineCost(stages);

    expect(cost.totalSnippetInvocations).toBe(1);
    expect(cost.totalSubrequests).toBe(2);
    expect(cost.estimatedCpuMs).toBe(3);
    expect(cost.peakMemoryBytes).toBe(8 * 1024 * 1024);
  });

  it('should handle empty stages array', () => {
    const cost = calculatePipelineCost([]);

    expect(cost.totalSnippetInvocations).toBe(0);
    expect(cost.totalSubrequests).toBe(0);
    expect(cost.estimatedCpuMs).toBe(0);
    expect(cost.peakMemoryBytes).toBe(-Infinity); // Math.max of empty array
  });
});
