# @evodb/snippets-chain

**Big Queries, Tiny Budgets**

Build complex query pipelines that execute within Cloudflare Snippets' strict constraints: 5 subrequests, 5ms CPU, 32MB RAM.

## The Challenge

You want to run a complex query. But you're in a Snippet:

```
                    Your Query
                        │
                        ▼
┌──────────────────────────────────────────────┐
│            Cloudflare Snippets               │
│                                              │
│   Subrequests: 5 max                        │
│   CPU Time: 5ms                             │
│   Memory: 32MB                              │
│                                              │
│   Can you do vector search?                 │
│   Can you join across tables?               │
│   Can you aggregate millions of rows?       │
│                                              │
│   With snippets-chain: YES                  │
└──────────────────────────────────────────────┘
```

## The Solution

Break complex operations into a chain of simple steps. Each step fits within Snippet constraints. Chain them together with smart orchestration.

```typescript
import { chain, patterns } from '@evodb/snippets-chain';

// Vector search that would normally take 100ms and 100MB
const semanticSearch = chain({ id: 'semantic-search' })
  .sequential({
    name: 'Find Centroids',
    snippet: 'centroid-search',  // 0.5ms, 500KB
  })
  .parallel({
    name: 'Search Partitions',
    snippet: 'partition-scan',   // 0.5ms each, 200KB each
    maxParallelism: 3,           // Stay under 5 subrequests
  })
  .sequential({
    name: 'Merge Results',
    snippet: 'merge-results',    // 0.2ms, 100KB
  })
  .build();

// Total: ~2ms CPU, ~1MB memory, 4 subrequests
```

## Installation

```bash
npm install @evodb/snippets-chain
```

## Built-in Patterns

### Map-Reduce

```typescript
import { patterns } from '@evodb/snippets-chain';

const aggregation = patterns.mapReduce({
  mapper: 'count-per-partition',   // Run on each partition
  reducer: 'sum-counts',           // Combine results
  partitions: 4,                   // Process 4 partitions
});

// Execution:
// 1. Parallel: 4 mapper snippets (1 subrequest each)
// 2. Sequential: 1 reducer snippet
// Total: 5 subrequests (fits!)
```

### Scatter-Gather

```typescript
const distributed = patterns.scatterGather({
  scatter: 'split-by-region',      // Decide where to send
  workers: [
    'worker-us',
    'worker-eu',
    'worker-asia'
  ],
  gather: 'combine-results',       // Merge all responses
});
```

### Pipeline

```typescript
const etl = patterns.pipeline([
  'extract-data',      // Step 1
  'transform-data',    // Step 2
  'load-data',         // Step 3
]);

// Each step's output flows to the next
```

### Fan-Out/Fan-In

```typescript
const parallel = patterns.fanOutIn({
  source: 'generate-queries',      // Produces N sub-queries
  workers: 5,                      // Process in parallel
  sink: 'merge-responses',         // Combine results
});
```

## Chain Builder API

```typescript
import { chain } from '@evodb/snippets-chain';

const myChain = chain({ id: 'my-query', name: 'My Query' })
  // Sequential step - one snippet, waits for completion
  .sequential({
    name: 'Step 1',
    snippet: 'my-snippet',
    input: { key: 'value' },
  })
  // Parallel step - multiple snippets, runs concurrently
  .parallel({
    name: 'Step 2',
    snippet: 'parallel-snippet',
    partitioner: 'split-by-key',   // How to divide input
    maxParallelism: 4,             // Max concurrent
    combiner: 'merge-arrays',      // How to combine output
  })
  // Conditional step - branch based on result
  .conditional({
    name: 'Branch',
    condition: 'has-more-data',
    then: 'process-more',
    else: 'finalize',
  })
  .build();
```

## Cost Estimation

Know if your chain will fit before running:

```typescript
const cost = myChain.estimateCost();

console.log(`Snippet invocations: ${cost.totalSnippetInvocations}`);
console.log(`Max parallelism: ${cost.maxParallelism}`);
console.log(`Subrequests per step: ${cost.subrequestsPerInvocation}`);
console.log(`Estimated CPU: ${cost.estimatedCpuMs}ms`);
console.log(`Estimated memory: ${cost.estimatedMemoryMb}MB`);

// Validate against Snippets constraints
if (cost.subrequestsPerInvocation > 5) {
  console.error('Chain exceeds subrequest limit!');
}

if (cost.estimatedCpuMs > 5) {
  console.error('Chain may exceed CPU limit!');
}
```

## Execution

```typescript
import { createExecutor, createRegistry } from '@evodb/snippets-chain';

// Register your snippets
const registry = createRegistry();

registry.register('my-snippet', async (input, ctx) => {
  // Your snippet logic
  return { result: input.data * 2 };
});

// Create executor
const executor = createExecutor({
  registry,
  timeout: 5000,
  maxRetries: 3,
});

// Execute chain
const result = await executor.execute(myChain, { data: 42 });
```

## Simulation

Test chains without hitting real snippets:

```typescript
import { createSimulator } from '@evodb/snippets-chain';

const simulator = createSimulator({
  registry,
  mockLatency: true,  // Simulate network delays
});

const simResult = await simulator.simulate(myChain, input);

console.log(`Simulated duration: ${simResult.durationMs}ms`);
console.log(`Steps executed: ${simResult.stepsExecuted}`);
console.log(`Bottleneck: ${simResult.bottleneck}`);
```

## API Reference

### Chain Types

```typescript
interface Chain {
  id: string;
  name: string;
  steps: ChainStep[];
  estimateCost(): ChainCost;
}

interface ChainStep {
  type: 'sequential' | 'parallel' | 'conditional';
  name: string;
  snippet: string;
  // ... type-specific options
}

interface ChainCost {
  totalSnippetInvocations: number;
  maxParallelism: number;
  estimatedLatencyMs: number;
  estimatedCpuMs: number;
  estimatedMemoryMb: number;
  subrequestsPerInvocation: number;
}
```

### Step Options

```typescript
interface SequentialStepOptions {
  name: string;
  snippet: string;
  input?: unknown;
  transform?: string;
}

interface ParallelStepOptions {
  name: string;
  snippet: string;
  partitioner: string;
  maxParallelism: number;
  combiner?: string;
}

interface ConditionalStepOptions {
  name: string;
  condition: string;
  then: string;
  else: string;
}
```

## Best Practices

1. **Stay under 5 subrequests** - Count your parallel workers
2. **Budget CPU carefully** - Each step should be <1ms
3. **Minimize data transfer** - Only pass what's needed between steps
4. **Use caching** - Store intermediate results in edge cache
5. **Test with simulator** - Validate before production

## Related Packages

- [@evodb/snippets-lance](../snippets-lance) - Vector search for Snippets
- [@evodb/core](../core) - Columnar encoding
- [@evodb/edge-cache](../edge-cache) - Edge caching

## License

MIT - Copyright 2026 .do
