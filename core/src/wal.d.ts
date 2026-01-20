import { type WalEntry, WalOp } from './types.js';
/** Create WAL entry from document */
export declare function createWalEntry(doc: unknown, lsn: bigint, op?: WalOp): WalEntry;
/** Serialize WAL entry to bytes */
export declare function serializeWalEntry(entry: WalEntry): Uint8Array;
/** Deserialize WAL entry from bytes */
export declare function deserializeWalEntry(data: Uint8Array): WalEntry;
/** Batch multiple WAL entries */
export declare function batchWalEntries(entries: WalEntry[]): Uint8Array;
/** Unbatch WAL entries */
export declare function unbatchWalEntries(data: Uint8Array): WalEntry[];
/** Get LSN range from batched entries */
export declare function getWalRange(data: Uint8Array): {
    minLsn: bigint;
    maxLsn: bigint;
    count: number;
};
//# sourceMappingURL=wal.d.ts.map