[**EvoDB API Reference**](../../../README.md)

***

[EvoDB API Reference](../../../README.md) / [query/src](../README.md) / ZoneMap

# Interface: ZoneMap

Defined in: [query/src/types.ts:834](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L834)

Zone map (min/max statistics per column).

Zone maps enable partition pruning by tracking the min/max values
for each column within a partition. If a predicate's value falls
outside the min/max range, the partition can be skipped entirely.

## Example

```typescript
const zoneMap: ZoneMap = {
  columns: {
    timestamp: { min: 1704067200000, max: 1706745600000, nullCount: 0, allNull: false },
    category: { min: 'A', max: 'Z', nullCount: 100, allNull: false }
  }
};
```

## Properties

### columns

> **columns**: `Record`\<`string`, [`ZoneMapColumn`](ZoneMapColumn.md)\>

Defined in: [query/src/types.ts:836](https://github.com/dot-do/evodb/blob/main/query/src/types.ts#L836)

Column statistics
