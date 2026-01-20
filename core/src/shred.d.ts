import { type Column, Type } from './types.js';
/** Shred options */
export interface ShredOptions {
    columns?: string[];
}
/** Shred JSON documents into columnar format */
export declare function shred(docs: unknown[], options?: ShredOptions): Column[];
/** Reconstruct JSON documents from columns */
export declare function unshred(columns: Column[], rowCount?: number): unknown[];
/** Extract values at a single path from columns */
export declare function extractPath(columns: Column[], path: string): unknown[];
/** Extract values at multiple paths from columns */
export declare function extractPaths(columns: Column[], paths: string[]): Record<string, unknown[]>;
/** Coerce value to target type */
export declare function coerceToType(value: unknown, toType: Type): unknown;
/** Append rows to existing columns */
export declare function appendRows(columns: Column[], docs: unknown[]): Column[];
/** Build path index for O(1) column lookup */
export declare function buildPathIndex(columns: Column[]): Map<string, Column>;
//# sourceMappingURL=shred.d.ts.map