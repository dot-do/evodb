/**
 * Chained Snippets Architecture for EvoDB
 *
 * A framework for building complex query pipelines from modular,
 * parallelizable snippet steps that work within Cloudflare's
 * snippet constraints (5 subrequests, 5ms CPU, 32MB RAM).
 *
 * @example
 * ```ts
 * import { chain, seq, par } from '@dotdo/poc-evodb-snippets-chain';
 *
 * // Build a vector search chain
 * const vectorSearchChain = chain({
 *   id: 'semantic-search',
 *   name: 'Semantic Search'
 * })
 *   .sequential({
 *     name: 'Centroid Search',
 *     snippet: 'centroid-search'
 *   })
 *   .parallel({
 *     name: 'Partition Scan',
 *     snippet: 'partition-scan',
 *     partitioner: 'vector-partitioner',
 *     maxParallelism: 10
 *   })
 *   .sequential({
 *     name: 'Merge Results',
 *     snippet: 'merge-results'
 *   })
 *   .build();
 *
 * // Estimate cost
 * const cost = vectorSearchChain.estimateCost();
 * console.log(`Total snippets: ${cost.totalSnippetInvocations}`);
 * ```
 */

// Types
export * from './types.js';

// Chain Builder
export {
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

// Executor
export {
  ChainExecutor,
  SnippetRegistry,
  SimulationExecutor,
  createRegistry,
  createExecutor,
  createSimulator,
  type ExecutorOptions,
} from './executor.js';

// Patterns
export * from './patterns/index.js';
