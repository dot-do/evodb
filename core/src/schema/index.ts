/**
 * @evodb/core/schema - Schema operations
 *
 * This submodule exports schema inference and validation functionality.
 * Serialization/deserialization is handled by the manifest layer.
 *
 * @module schema
 */

export {
  inferSchema,
  isSchemaCompatible,
  isCompatible, // deprecated alias
} from '../schema.js';
