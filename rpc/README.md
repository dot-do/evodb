# @evodb/rpc

DO-to-DO RPC with WebSocket Hibernation for distributed lakehouse CDC aggregation.

## Installation

```bash
npm install @evodb/rpc
```

## Overview

This package provides infrastructure for streaming CDC (Change Data Capture) events from child Durable Objects to a parent aggregator DO, which buffers and flushes data to R2.

**Key Features:**
- WebSocket Hibernation: 95% cost reduction on idle connections
- Binary Protocol: Efficient encoding for high-throughput CDC streaming
- Automatic Batching: Client-side batching with configurable thresholds
- Buffer Management: Parent-side buffering with flush triggers
- Fallback Storage: Local DO storage when R2 unavailable
- Deduplication: Prevent duplicate entries from retries

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Child DOs (Shards)                           │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                 │
│  │Shard 1 │  │Shard 2 │  │Shard 3 │  │Shard N │                 │
│  └───┬────┘  └───┬────┘  └───┬────┘  └───┬────┘                 │
│      │           │           │           │                       │
│      │  WebSocket Hibernation (95% cost discount)                │
│      ▼           ▼           ▼           ▼                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Parent DO (Aggregator)                       │   │
│  │  - Receives CDC batches via WebSocket                    │   │
│  │  - Buffers in memory                                     │   │
│  │  - Flushes to R2 as Parquet/Iceberg                     │   │
│  └───────────────────────────┬──────────────────────────────┘   │
│                              ▼                                   │
│                         ┌────────┐                               │
│                         │   R2   │                               │
│                         └────────┘                               │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Parent DO Setup

```typescript
// wrangler.jsonc
{
  "durable_objects": {
    "bindings": [{
      "name": "LAKEHOUSE_PARENT",
      "class_name": "LakehouseParentDO"
    }]
  }
}

// worker.ts
import { LakehouseParentDO } from '@evodb/rpc';

export { LakehouseParentDO };

export default {
  async fetch(request: Request, env: Env) {
    const id = env.LAKEHOUSE_PARENT.idFromName('aggregator');
    const stub = env.LAKEHOUSE_PARENT.get(id);
    return stub.fetch(request);
  }
};
```

### Client Usage

```typescript
import { createRpcClient } from '@evodb/rpc';

const client = createRpcClient({
  parentStub: env.LAKEHOUSE_PARENT.get(parentId),
  childId: 'shard-001',
});

await client.connect();

// Send CDC entries
await client.sendBatch([
  { op: 'INSERT', table: 'users', data: { id: 1, name: 'Alice' } },
  { op: 'UPDATE', table: 'users', data: { id: 1, name: 'Alice Smith' } },
]);
```

## API Reference

### Types

```typescript
type WalEntry          // WAL entry structure
type RpcMessage        // RPC message envelope
type CDCBatchMessage   // Batch of CDC entries
type AckMessage        // Acknowledgment message
type BufferedBatch     // Buffered batch in parent
type ParentConfig      // Parent DO configuration
type ChildConfig       // Child client configuration
```

### Protocol

```typescript
encodeMessage(msg)     // Encode RPC message to binary
decodeMessage(buffer)  // Decode binary to RPC message
isBinaryEncoded(data)  // Check if data is binary encoded
```

### Buffer Management

```typescript
CDCBufferManager       // Manages buffered batches
type BufferSnapshot    // Current buffer state
type ChildConnectionState // Per-child connection tracking
```

### Client

```typescript
LakehouseRpcClient     // WebSocket RPC client
createRpcClient(opts)  // Create client instance
type ClientState       // Connection state
type ClientStats       // Client statistics
```

### Server

```typescript
LakehouseParentDO      // Parent DO with WebSocket hibernation
type LakehouseParentEnv // Environment bindings
```

### Fallback Storage

```typescript
FallbackStorage           // Local DO storage fallback
FallbackRecoveryManager   // Recovery from fallback to R2
type RecoveryConfig       // Recovery configuration
```

## Related Packages

- `@evodb/core` - Columnar JSON shredding
- `@evodb/writer` - R2 block writing
- `@evodb/lakehouse` - Manifest management

## License

MIT
