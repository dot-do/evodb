# Cloudflare Snippets Optimization Guide

## Constraints
| Resource | Limit |
|----------|-------|
| CPU Time | 5ms |
| Memory | 32MB |
| Subrequests | 5 |

## snippets-chain Usage
```typescript
import { createSnippetChain } from '@evodb/snippets-chain';

const chain = createSnippetChain()
  .fetchManifest(r2)
  .filterPartitions(predicate)
  .fetchBlocks()
  .execute();
```

## snippets-lance Vector Search
```typescript
import { createLanceReader } from '@evodb/snippets-lance';

const reader = createLanceReader(r2Bucket);
const results = await reader.search(embedding, { k: 10 });
```

## Memory Optimization
- Use lazy bitmap unpacking
- Stream results instead of buffering
- Limit partition scans

## CPU Optimization
- Use pre-computed indexes
- Minimize JSON parsing
- Use zone maps for pruning
