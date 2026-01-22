[**EvoDB API Reference**](../../README.md)

***

[EvoDB API Reference](../../README.md) / rpc/src

# rpc/src

@dotdo/poc-lakehouse-rpc

DO-to-DO RPC with WebSocket Hibernation for distributed lakehouse CDC aggregation.

This package provides the infrastructure for streaming CDC (Change Data Capture)
events from child Durable Objects to a parent aggregator DO, which buffers and
flushes data to R2 for Iceberg table storage.

Key Features:
- WebSocket Hibernation: 95% cost reduction on idle connections
- Binary Protocol: Efficient encoding for high-throughput CDC streaming
- Automatic Batching: Client-side batching with configurable thresholds
- Buffer Management: Parent-side buffering with configurable flush triggers
- Fallback Storage: Local DO storage fallback when R2 is unavailable
- Deduplication: Prevent duplicate entries from retries

Architecture:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Child DOs (Shards)                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Shard 1 │  │ Shard 2 │  │ Shard 3 │  │ Shard N │  │  ...    │       │
│  │ (JSON)  │  │ (JSON)  │  │ (JSON)  │  │ (JSON)  │  │         │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │            │            │
│       │  WebSocket │ Hibernation│ (95% cost │discount)   │            │
│       ▼            ▼            ▼            ▼            ▼            │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │                     Parent DO (Aggregator)                     │     │
│  │  - Receives CDC batches via WebSocket                          │     │
│  │  - Buffers in memory                                           │     │
│  │  - Flushes to R2 as Parquet/Iceberg                           │     │
│  │  - Falls back to local storage on R2 failure                   │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                              │                                         │
│                              ▼                                         │
│                        ┌──────────┐                                    │
│                        │    R2    │                                    │
│                        │ (Iceberg)│                                    │
│                        └──────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Example

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
import { LakehouseParentDO } from '@dotdo/poc-lakehouse-rpc';

export { LakehouseParentDO };

export default {
  async fetch(request: Request, env: Env) {
    const id = env.LAKEHOUSE_PARENT.idFromName('aggregator');
    const stub = env.LAKEHOUSE_PARENT.get(id);
    return stub.fetch(request);
  }
};
```

## Enumerations

- [CircuitState](enumerations/CircuitState.md)

## Classes

- [CircuitBreakerError](classes/CircuitBreakerError.md)
- [CircuitBreaker](classes/CircuitBreaker.md)
- [CDCBufferManager](classes/CDCBufferManager.md)
- [CircuitBreakerRpcClient](classes/CircuitBreakerRpcClient.md)
- [LakehouseRpcClient](classes/LakehouseRpcClient.md)
- [FallbackStorage](classes/FallbackStorage.md)
- [FallbackRecoveryManager](classes/FallbackRecoveryManager.md)
- [ProtocolCodec](classes/ProtocolCodec.md)
- [LakehouseParentDO](classes/LakehouseParentDO.md)
- [LakehouseRpcError](classes/LakehouseRpcError.md)
- [ConnectionError](classes/ConnectionError.md)
- [BufferOverflowError](classes/BufferOverflowError.md)
- [FlushError](classes/FlushError.md)
- [ProtocolError](classes/ProtocolError.md)

## Interfaces

- [MonotonicTimeProvider](interfaces/MonotonicTimeProvider.md)
- [CircuitBreakerOptions](interfaces/CircuitBreakerOptions.md)
- [CircuitBreakerStats](interfaces/CircuitBreakerStats.md)
- [DedupConfig](interfaces/DedupConfig.md)
- [DedupStats](interfaces/DedupStats.md)
- [ChildConnectionState](interfaces/ChildConnectionState.md)
- [BufferSnapshot](interfaces/BufferSnapshot.md)
- [RpcSendResult](interfaces/RpcSendResult.md)
- [CircuitBreakerRpcConfig](interfaces/CircuitBreakerRpcConfig.md)
- [CircuitBreakerRpcStats](interfaces/CircuitBreakerRpcStats.md)
- [EventEmitterConfig](interfaces/EventEmitterConfig.md)
- [ClientStats](interfaces/ClientStats.md)
- [DOStorage](interfaces/DOStorage.md)
- [RecoveryConfig](interfaces/RecoveryConfig.md)
- [LakehouseParentEnv](interfaces/LakehouseParentEnv.md)
- [RpcMessage](interfaces/RpcMessage.md)
- [CDCBatchMessage](interfaces/CDCBatchMessage.md)
- [ConnectMessage](interfaces/ConnectMessage.md)
- [HeartbeatMessage](interfaces/HeartbeatMessage.md)
- [FlushRequestMessage](interfaces/FlushRequestMessage.md)
- [AckMessage](interfaces/AckMessage.md)
- [AckDetails](interfaces/AckDetails.md)
- [NackMessage](interfaces/NackMessage.md)
- [StatusMessage](interfaces/StatusMessage.md)
- [ClientCapabilities](interfaces/ClientCapabilities.md)
- [BufferedBatch](interfaces/BufferedBatch.md)
- [BufferStats](interfaces/BufferStats.md)
- [FlushResult](interfaces/FlushResult.md)
- [ParentConfig](interfaces/ParentConfig.md)
- [ChildConfig](interfaces/ChildConfig.md)
- [WebSocketAttachment](interfaces/WebSocketAttachment.md)

## Type Aliases

- [ClientState](type-aliases/ClientState.md)
- [OnHandlerErrorCallback](type-aliases/OnHandlerErrorCallback.md)
- [WalOperation](type-aliases/WalOperation.md)
- [WalEntry](type-aliases/WalEntry.md)
- [RpcMessageType](type-aliases/RpcMessageType.md)
- [AckStatus](type-aliases/AckStatus.md)
- [NackReason](type-aliases/NackReason.md)
- [ParentState](type-aliases/ParentState.md)
- [FlushTrigger](type-aliases/FlushTrigger.md)
- [ClientRpcMessage](type-aliases/ClientRpcMessage.md)
- [ServerRpcMessage](type-aliases/ServerRpcMessage.md)
- [AnyRpcMessage](type-aliases/AnyRpcMessage.md)

## Variables

- [DEFAULT\_DEDUP\_CONFIG](variables/DEFAULT_DEDUP_CONFIG.md)
- [DEFAULT\_RPC\_CIRCUIT\_BREAKER\_OPTIONS](variables/DEFAULT_RPC_CIRCUIT_BREAKER_OPTIONS.md)
- [DEFAULT\_RECOVERY\_CONFIG](variables/DEFAULT_RECOVERY_CONFIG.md)
- [WalOperationCode](variables/WalOperationCode.md)
- [DEFAULT\_CLIENT\_CAPABILITIES](variables/DEFAULT_CLIENT_CAPABILITIES.md)
- [DEFAULT\_PARENT\_CONFIG](variables/DEFAULT_PARENT_CONFIG.md)
- [DEFAULT\_CHILD\_CONFIG](variables/DEFAULT_CHILD_CONFIG.md)
- [CapabilityFlags](variables/CapabilityFlags.md)

## Functions

- [createCircuitBreakerRpcClient](functions/createCircuitBreakerRpcClient.md)
- [createRpcClient](functions/createRpcClient.md)
- [getCodec](functions/getCodec.md)
- [encodeMessage](functions/encodeMessage.md)
- [decodeMessage](functions/decodeMessage.md)
- [isBinaryEncoded](functions/isBinaryEncoded.md)
- [encodeCapabilities](functions/encodeCapabilities.md)
- [decodeCapabilities](functions/decodeCapabilities.md)
- [isCDCBatchMessage](functions/isCDCBatchMessage.md)
- [isAckMessage](functions/isAckMessage.md)
- [isNackMessage](functions/isNackMessage.md)
- [isConnectMessage](functions/isConnectMessage.md)
- [isHeartbeatMessage](functions/isHeartbeatMessage.md)
- [generateBatchId](functions/generateBatchId.md)
- [generateCorrelationId](functions/generateCorrelationId.md)
