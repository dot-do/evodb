# @evodb/snippets-chain

Chained snippets architecture for complex query pipelines.

## Installation

```bash
npm install @evodb/snippets-chain
```

## Overview

This package provides a framework for building modular, parallelizable query pipelines that work within Cloudflare Snippets constraints:

- **5 subrequests max**
- **5ms CPU time**
- **32MB RAM**

Build complex operations by chaining simple snippet steps.

## Quick Start

```typescript
import { chain, createExecutor } from '@evodb/snippets-chain';

// Build a vector search chain
const vectorSearchChain = chain({
  id: 'semantic-search',
  name: 'Semantic Search',
})
  .sequential({
    name: 'Centroid Search',
    snippet: 'centroid-search',
  })
  .parallel({
    name: 'Partition Scan',
    snippet: 'partition-scan',
    partitioner: 'vector-partitioner',
    maxParallelism: 10,
  })
  .sequential({
    name: 'Merge Results',
    snippet: 'merge-results',
  })
  .build();

// Estimate cost before execution
const cost = vectorSearchChain.estimateCost();
console.log(`Total snippet invocations: ${cost.totalSnippetInvocations}`);
console.log(`Max parallelism: ${cost.maxParallelism}`);
console.log(`Estimated latency: ${cost.estimatedLatencyMs}ms`);

// Execute the chain
const executor = createExecutor({ snippetRegistry });
const result = await executor.execute(vectorSearchChain, input);
```

## API Reference

### Chain Builder

```typescript
import { chain, seq, par, cond } from '@evodb/snippets-chain';

// Create a new chain
const myChain = chain({ id: 'my-chain', name: 'My Chain' })
  .sequential({
    name: 'Step 1',
    snippet: 'snippet-1',
  })
  .parallel({
    name: 'Step 2',
    snippet: 'snippet-2',
    maxParallelism: 5,
  })
  .conditional({
    name: 'Branch',
    condition: 'has-more-data',
    then: 'process-more',
    else: 'finalize',
  })
  .build();

// Shorthand helpers
const step1 = seq({ snippet: 'my-snippet' });
const step2 = par({ snippet: 'parallel-snippet', maxParallelism: 10 });
const branch = cond({ condition: 'check', then: 'a', else: 'b' });
```

### Step Types

```typescript
interface SequentialStepOptions {
  name: string;
  snippet: string;          // Snippet ID to invoke
  input?: unknown;          // Static input data
  transform?: string;       // Output transformer
}

interface ParallelStepOptions {
  name: string;
  snippet: string;
  partitioner: string;      // How to partition input
  maxParallelism: number;   // Max concurrent invocations
  combiner?: string;        // How to combine results
}

interface ConditionalStepOptions {
  name: string;
  condition: string;        // Condition evaluator
  then: string;             // Chain/step if true
  else: string;             // Chain/step if false
}
```

### Executor

```typescript
import {
  createExecutor,
  createRegistry,
  createSimulator,
} from '@evodb/snippets-chain';

// Create snippet registry
const registry = createRegistry();
registry.register('my-snippet', async (input, ctx) => {
  return { result: input.data * 2 };
});

// Create executor
const executor = createExecutor({
  registry,
  timeout: 5000,
  maxRetries: 3,
});

// Execute chain
const result = await executor.execute(chain, input);

// Simulate execution (for testing)
const simulator = createSimulator({ registry });
const simResult = await simulator.simulate(chain, input);
console.log(`Simulated duration: ${simResult.durationMs}ms`);
```

### Built-in Patterns

```typescript
import { patterns } from '@evodb/snippets-chain';

// Map-Reduce pattern
const mapReduce = patterns.mapReduce({
  mapper: 'map-snippet',
  reducer: 'reduce-snippet',
  partitions: 10,
});

// Scatter-Gather pattern
const scatterGather = patterns.scatterGather({
  scatter: 'scatter-snippet',
  workers: ['worker-1', 'worker-2'],
  gather: 'gather-snippet',
});

// Pipeline pattern
const pipeline = patterns.pipeline([
  'stage-1',
  'stage-2',
  'stage-3',
]);

// Fan-out / Fan-in
const fanOutIn = patterns.fanOutIn({
  source: 'source-snippet',
  workers: 5,
  sink: 'sink-snippet',
});
```

### Cost Estimation

```typescript
interface ChainCost {
  totalSnippetInvocations: number;
  maxParallelism: number;
  estimatedLatencyMs: number;
  estimatedCpuMs: number;
  estimatedMemoryMb: number;
  subrequestsPerInvocation: number;
}

const cost = chain.estimateCost();
if (cost.subrequestsPerInvocation > 5) {
  console.warn('Chain exceeds snippet subrequest limit');
}
```

### Types

```typescript
// Chain definition
type Chain           // Complete chain definition
type ChainStep       // Single step in chain
type StepType        // 'sequential' | 'parallel' | 'conditional'

// Execution context
type ExecutionContext // Runtime context for snippets
type StepResult       // Result of step execution

// Cost and metrics
type ChainCost       // Cost estimation
type ExecutionStats  // Runtime statistics
```

## Related Packages

- `@evodb/snippets-lance` - Vector search for Snippets
- `@evodb/core` - Columnar encoding primitives
- `@evodb/query` - Query engine

## License

MIT
