[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [writer/src](../README.md) / BlockIndexEvictionPolicy

# Type Alias: BlockIndexEvictionPolicy

> **BlockIndexEvictionPolicy** = `"lru"` \| `"none"`

Defined in: [writer/src/types.ts:48](https://github.com/dot-do/evodb/blob/main/writer/src/types.ts#L48)

Block index eviction policy when limit is reached:
- 'lru': Evict oldest entries (least recently used)
- 'none': Throw BlockIndexLimitError when limit is exceeded
