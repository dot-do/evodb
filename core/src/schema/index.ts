/**
 * @evodb/core/schema - Schema operations
 *
 * This submodule exports schema inference, evolution, and migration
 * functionality.
 *
 * @module schema
 */

export {
  inferSchema,
  serializeSchema,
  deserializeSchema,
  isCompatible,
  migrateColumns,
  schemaDiff,
  type SchemaDiff,
} from '../schema.js';
