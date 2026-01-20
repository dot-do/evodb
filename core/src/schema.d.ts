import { type Column, type Schema } from './types.js';
/** Create schema from columns */
export declare function inferSchema(columns: Column[], id?: number, version?: number): Schema;
/** Serialize schema to bytes */
export declare function serializeSchema(schema: Schema): Uint8Array;
/** Deserialize schema from bytes */
export declare function deserializeSchema(data: Uint8Array): Schema;
/** Check if schema B is compatible with schema A (can read A's data) */
export declare function isCompatible(older: Schema, newer: Schema): boolean;
/** Migrate columns from old schema to new schema */
export declare function migrateColumns(columns: Column[], _oldSchema: Schema, newSchema: Schema): Column[];
/** Schema diff result */
export interface SchemaDiff {
    added: string[];
    removed: string[];
    modified: string[];
}
/** Compare two schemas and return the differences */
export declare function schemaDiff(older: Schema, newer: Schema): SchemaDiff;
//# sourceMappingURL=schema.d.ts.map