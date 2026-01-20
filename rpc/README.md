# @evodb/rpc

**Real-Time CDC at Global Scale**

The nervous system of EvoDB. CapnWeb RPC enables real-time change data capture from thousands of edge databases to the unified lakehouse - with WebSocket hibernation for 95% cost reduction.

## The Challenge

You have user databases distributed globally - SQLite-backed Durable Objects next to your users in every region. How do you:

1. Stream changes to a central lakehouse in real-time?
2. Handle thousands of concurrent connections efficiently?
3. Ensure exactly-once delivery without duplicates?
4. Keep costs manageable at scale?

## The Solution

```
┌────────────────────────────────────────────────────────────────────┐
│                    Global Edge (100+ regions)                       │
│                                                                     │
│  ┌────────┐  ┌────────┐  ┌────────┐        ┌────────┐             │
│  │User DB │  │User DB │  │User DB │  ...   │User DB │             │
│  │(DO+SQL)│  │(DO+SQL)│  │(DO+SQL)│        │(DO+SQL)│             │
│  └───┬────┘  └───┬────┘  └───┬────┘        └───┬────┘             │
│      │           │           │                  │                   │
│      │     WebSocket Hibernation (95% cost reduction)               │
│      │           │           │                  │                   │
│      ▼           ▼           ▼                  ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Writer DO (Aggregator)                    │   │
│  │  • Deduplication with 5-min window                          │   │
│  │  • Memory-bounded buffers                                   │   │
│  │  • Automatic batch compaction                               │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
│                              ▼                                      │
│                         ┌────────┐                                  │
│                         │   R2   │  Lakehouse                       │
│                         └────────┘                                  │
└────────────────────────────────────────────────────────────────────┘
```

**WebSocket Hibernation**: Idle connections cost 95% less. You only pay when data flows.

**Deduplication**: Network retries won't create duplicate entries.

**Memory Bounds**: Won't OOM even under load spikes.

## Installation

```bash
npm install @evodb/rpc
```

## Quick Start

### Parent DO (Aggregator)

```typescript
import { LakehouseParentDO } from '@evodb/rpc';

export { LakehouseParentDO };

// wrangler.toml
// [[durable_objects.bindings]]
// name = "WRITER"
// class_name = "LakehouseParentDO"
```

### Child DO (Edge Database)

```typescript
import { createRpcClient } from '@evodb/rpc';

export class UserDO extends DurableObject {
  private rpc: RpcClient;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.rpc = createRpcClient({
      parentStub: env.WRITER.get(env.WRITER.idFromName('aggregator')),
      childId: state.id.toString(),
    });
  }

  async onWrite(data: any) {
    // Stream changes to lakehouse
    await this.rpc.sendBatch([
      { op: 'INSERT', table: 'events', data, lsn: this.nextLsn() }
    ]);
  }
}
```

## Key Features

### Deduplication

Every batch has a sequence number. The parent tracks seen sequences within a 5-minute window:

```typescript
// Even if the network retries...
await client.sendBatch([{ op: 'INSERT', ... }]);
await client.sendBatch([{ op: 'INSERT', ... }]); // Same batch, retried

// ...only one copy reaches R2
```

Configuration:

```typescript
const client = createRpcClient({
  dedup: {
    windowMs: 5 * 60 * 1000,      // 5 minute window
    maxEntriesPerSource: 10000,   // Per-child limit
    maxSources: 1000,             // Total children tracked
  }
});
```

### Memory Bounds

Buffers are bounded to prevent OOM under load:

```typescript
const parent = new LakehouseParentDO({
  buffer: {
    maxBytes: 50_000_000,    // 50MB max buffer
    maxEntries: 100_000,     // 100K entries max
    flushThreshold: 10_000,  // Flush at 10K entries
  }
});
```

### Automatic Batching

Client-side batching reduces round trips:

```typescript
const client = createRpcClient({
  batching: {
    maxSize: 100,           // Max entries per batch
    maxDelayMs: 50,         // Max wait before sending
    maxBytes: 1_000_000,    // Max batch size
  }
});

// These get batched into one message
await client.send({ op: 'INSERT', ... });
await client.send({ op: 'INSERT', ... });
await client.send({ op: 'INSERT', ... });
```

### Fallback Storage

If R2 is temporarily unavailable, changes are stored locally:

```typescript
const parent = new LakehouseParentDO({
  fallback: {
    enabled: true,
    maxLocalBytes: 10_000_000,  // 10MB local buffer
    recoveryIntervalMs: 60_000, // Check R2 every minute
  }
});
```

## API Reference

### Client

```typescript
createRpcClient(opts)     // Create RPC client
client.connect()          // Establish WebSocket
client.sendBatch(entries) // Send CDC batch
client.disconnect()       // Close connection
client.getStats()         // Connection statistics
```

### Server

```typescript
LakehouseParentDO        // Parent DO with hibernation
CDCBufferManager         // Buffer management
DeduplicationTracker     // Duplicate detection
FallbackStorage          // Local storage fallback
```

### Protocol

```typescript
encodeMessage(msg)       // Encode to binary
decodeMessage(buffer)    // Decode from binary
type WalEntry            // WAL entry structure
type CDCBatchMessage     // Batch message type
type AckMessage          // Acknowledgment type
```

## Observability

```typescript
const stats = client.getStats();
// {
//   connected: true,
//   messagesSent: 1234,
//   bytesent: 5_000_000,
//   lastAckLsn: 9999n,
//   pendingBatches: 2,
//   reconnects: 0
// }

const bufferStats = parent.getBufferStats();
// {
//   entries: 5000,
//   bytes: 2_500_000,
//   oldestEntryAge: 15000,
//   childConnections: 42
// }
```

## Related Packages

- [@evodb/core](../core) - Columnar encoding
- [@evodb/writer](../writer) - R2 block writing
- [@evodb/lakehouse](../lakehouse) - Manifest management

## License

MIT - Copyright 2026 .do
