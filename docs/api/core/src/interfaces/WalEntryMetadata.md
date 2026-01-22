[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [core/src](../README.md) / WalEntryMetadata

# Interface: WalEntryMetadata

Defined in: [core/src/types.ts:369](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L369)

Metadata associated with a WAL entry for RPC communication.

This interface defines the structure for optional metadata that can be
attached to WAL entries during DO-to-DO CDC streaming.

## Example

```typescript
const metadata: WalEntryMetadata = {
  transactionId: 'tx-12345',
  userId: 'user-abc',
  source: 'api',
  correlationId: 'req-xyz',
};
```

## Indexable

\[`key`: `string`\]: `string` \| `string`[]

Additional custom fields (escape hatch for unforeseen metadata needs)

## Properties

### transactionId?

> `optional` **transactionId**: `string`

Defined in: [core/src/types.ts:371](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L371)

Transaction identifier for grouping related changes

***

### userId?

> `optional` **userId**: `string`

Defined in: [core/src/types.ts:373](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L373)

User identifier who initiated the change

***

### source?

> `optional` **source**: `string`

Defined in: [core/src/types.ts:375](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L375)

Source system or service that produced the entry

***

### correlationId?

> `optional` **correlationId**: `string`

Defined in: [core/src/types.ts:377](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L377)

Correlation ID for request tracing

***

### sessionId?

> `optional` **sessionId**: `string`

Defined in: [core/src/types.ts:379](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L379)

Session identifier

***

### clientIp?

> `optional` **clientIp**: `string`

Defined in: [core/src/types.ts:381](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L381)

Client IP address (for audit logging)

***

### tags?

> `optional` **tags**: `string`[]

Defined in: [core/src/types.ts:383](https://github.com/dot-do/evodb/blob/main/core/src/types.ts#L383)

Custom tags for categorization
