[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / PartitionMode

# Type Alias: PartitionMode

> **PartitionMode** = `"do-sqlite"` \| `"edge-cache"` \| `"enterprise"`

Defined in: [writer/src/types.ts:41](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L41)

Partition size modes for different use cases:
- 'do-sqlite': 2MB blocks for DO SQLite blob storage
- 'edge-cache': 500MB blocks for standard edge cache
- 'enterprise': 5GB blocks for enterprise edge cache
