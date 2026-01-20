# EvoDB Migration Guide

Practical guidance for schema evolution, data migration, rollback procedures, and version upgrades.

## Schema Evolution

EvoDB supports safe schema changes through versioned schemas and compatibility checking.

### Supported Changes

#### Adding Columns

```typescript
import { evolveSchema, isCompatible } from '@evodb/lakehouse';

const v2 = evolveSchema(v1, [
  { type: 'add_column', column: { name: 'email', type: 'string', nullable: true } }
]);

// Verify backward compatibility before applying
const check = isCompatible(v1, v2, 'backward');
if (!check.compatible) {
  console.error('Incompatible change:', check.errors);
}
```

**Rules for adding columns:**
- Nullable columns: Always safe (backward compatible)
- Required columns: Must provide `defaultValue` for backward compatibility

```typescript
// Safe: nullable column
{ type: 'add_column', column: { name: 'notes', type: 'string', nullable: true } }

// Safe: required with default
{ type: 'add_column', column: { name: 'status', type: 'string', nullable: false, defaultValue: 'active' } }

// Unsafe: required without default (breaks backward compatibility)
{ type: 'add_column', column: { name: 'required_field', type: 'string', nullable: false } }
```

#### Removing Columns

```typescript
const v2 = evolveSchema(v1, [
  { type: 'drop_column', columnName: 'deprecated_field' }
]);
```

**Warning:** Dropping columns breaks forward compatibility. Old readers cannot read new data.

#### Renaming Columns

```typescript
const v2 = evolveSchema(v1, [
  { type: 'rename_column', oldName: 'old_name', newName: 'new_name' }
]);
```

#### Type Widening

Allowed promotions (safe):
- `int32` -> `int64` or `float64`
- `int64` -> `float64`

```typescript
const v2 = evolveSchema(v1, [
  { type: 'update_type', columnName: 'count', newType: 'int64' }
]);
```

#### Nullability Changes

```typescript
// Safe: required -> nullable
{ type: 'make_nullable', columnName: 'optional_field' }

// Requires default: nullable -> required
{ type: 'make_required', columnName: 'now_required', defaultValue: 'default_value' }
```

### Applying Schema Changes

```typescript
import { addSchema, setCurrentSchema } from '@evodb/lakehouse';

// 1. Evolve the schema
const v2 = evolveSchema(currentSchema, changes);

// 2. Validate compatibility
const result = isCompatible(currentSchema, v2, 'backward');
if (!result.compatible) {
  throw new Error(`Schema incompatible: ${result.errors.join(', ')}`);
}

// 3. Add to manifest and set as current
let manifest = addSchema(manifest, v2);
manifest = setCurrentSchema(manifest, v2.schemaId);
```

## Data Migration Between Versions

### Reading Old Data with New Schema

EvoDB automatically handles schema evolution when reading. The `migrateColumns` function fills missing columns:

```typescript
import { migrateColumns } from '@evodb/core';

// Old data missing 'email' column
const migratedColumns = migrateColumns(oldColumns, oldSchema, newSchema);
// 'email' column filled with defaultValue or null
```

### Batch Migration

For large datasets, migrate partition by partition:

```typescript
import { generateCompactionPlan, compact } from '@evodb/lakehouse';

// 1. Generate compaction plan (also triggers schema migration)
const plan = generateCompactionPlan(snapshot, {
  reason: 'manual',
  partitionFilter: { year: { eq: 2024 } }
});

// 2. Execute migration per group
for (const group of plan.groups) {
  // Read old format, write new format
  const data = await readFiles(group.files);
  const migrated = migrateData(data, oldSchema, newSchema);
  await writeCompacted(migrated, group.partitions);
}

// 3. Commit compaction snapshot
const { manifest, snapshot } = compact(manifest, currentSnapshot, newFiles, oldFiles);
```

### Zero-Downtime Migration Strategy

1. Add new schema version (backward compatible changes only)
2. Deploy readers with new schema support
3. Start writing with new schema
4. Background migration of old partitions
5. Remove old schema support after migration completes

## Rollback Procedures

### Schema Rollback

```typescript
import { setCurrentSchema, getSnapshotHistory } from '@evodb/lakehouse';

// Rollback to previous schema version
const previousSchemaId = manifest.schemas[manifest.schemas.length - 2].schemaId;
manifest = setCurrentSchema(manifest, previousSchemaId);
```

### Data Rollback (Time Travel)

EvoDB supports point-in-time queries via snapshots:

```typescript
import { queryFiles, findSnapshotAsOf } from '@evodb/lakehouse';

// Query data as of specific timestamp
const files = queryFiles(manifest, loadSnapshot, {
  asOfTimestamp: Date.now() - 24 * 60 * 60 * 1000 // 24 hours ago
});

// Or query specific snapshot
const files = queryFiles(manifest, loadSnapshot, {
  snapshotId: 'known-good-snapshot-id'
});
```

### Full Table Rollback

To rollback table state to a previous snapshot:

```typescript
import { createOverwriteSnapshot } from '@evodb/lakehouse';

// 1. Load the target snapshot
const targetSnapshot = loadSnapshot(targetSnapshotId);

// 2. Create overwrite snapshot with old files
const rollbackSnapshot = createOverwriteSnapshot(
  manifest.currentSnapshotId,
  manifest.currentSchemaId,
  targetSnapshot.manifestList,  // old files
  currentSnapshot.manifestList,  // current files
  { reason: 'rollback', target_snapshot: targetSnapshotId }
);

// 3. Update manifest
```

### Snapshot Retention

Configure retention to keep rollback points:

```typescript
import { getExpiredSnapshots } from '@evodb/lakehouse';

const expired = getExpiredSnapshots(manifest, {
  retainLast: 10,                              // Keep last 10 snapshots
  olderThan: Date.now() - 7 * 24 * 60 * 60 * 1000, // Expire after 7 days
  retainIds: ['important-snapshot-id']         // Always keep specific snapshots
});
```

## Breaking Changes Between Versions

### v1.0 Breaking Changes

| Change | Migration |
|--------|-----------|
| Schema `id` -> `schemaId` | Update schema references |
| Column `path` -> `name` | Rename in schema definitions |
| Type enum -> string types | Use string types: `'int32'`, `'string'`, etc. |

### Type Mapping Reference

Core types map to lakehouse types:

| Core Type | Lakehouse Type | Notes |
|-----------|----------------|-------|
| `Type.Null` | `'null'` | |
| `Type.Bool` | `'boolean'` | |
| `Type.Int32` | `'int32'` | |
| `Type.Int64` | `'int64'` | |
| `Type.Float64` | `'float64'` | |
| `Type.String` | `'string'` | |
| `Type.Binary` | `'binary'` | |
| `Type.Timestamp` | `'timestamp'` | ms since epoch |
| `Type.Date` | `'date'` | ISO date string |
| `Type.Array` | `{ type: 'array', elementType }` | |
| `Type.Object` | `'json'` | |

### Compatibility Modes

| Mode | Writers | Readers |
|------|---------|---------|
| `backward` | New schema can read old data | Default, recommended |
| `forward` | Old schema can read new data | Requires no column drops |
| `full` | Both backward and forward | Most restrictive |
| `none` | No compatibility checks | Use with caution |

## Migration Checklist

- [ ] Verify schema compatibility before deployment
- [ ] Test with production data sample
- [ ] Plan rollback strategy
- [ ] Configure snapshot retention
- [ ] Monitor migration progress
- [ ] Validate data integrity post-migration
