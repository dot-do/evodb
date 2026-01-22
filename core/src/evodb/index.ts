/**
 * @evodb/core/evodb - High-level facade
 *
 * This submodule exports the EvoDB high-level API including:
 * - Document insertion with automatic schema evolution
 * - Fluent query building
 * - Schema management
 *
 * @module evodb
 */

export {
  EvoDB,
  QueryBuilder,
  SchemaManager,
  type EvoDBConfig,
  type EvoDBStorageBucket,
  type EvoDBStorageObject,
  type EvoDBPutOptions,
  type EvoDBListOptions,
  type EvoDBObjectList,
  type FieldDefinition,
  type SchemaDefinition,
  type RelationshipOptions,
  type EnforceOptions,
  type InferredSchema,
  type QueryResult,
  type QueryExecutor,
  type UpdateResult,
  type UpdateOptions,
  type DeleteResult,
  type DeleteOptions,
  type FilterObject,
  type UserFilterOperator,
} from '../evodb.js';
