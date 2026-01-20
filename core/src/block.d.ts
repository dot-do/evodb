import { type BlockHeader, type BlockOptions, type EncodedColumn, type Column } from './types.js';
/** Write columns to block format */
export declare function writeBlock(columns: EncodedColumn[], opts?: BlockOptions & {
    rowCount?: number;
}): Uint8Array;
/** Read block format to columns */
export declare function readBlock(data: Uint8Array): {
    header: BlockHeader;
    columns: Column[];
};
/** Get block statistics without full decode */
export declare function getBlockStats(data: Uint8Array): {
    rowCount: number;
    columnCount: number;
    schemaId: number;
};
//# sourceMappingURL=block.d.ts.map