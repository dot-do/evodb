/**
 * Block Writer Strategy Implementation
 *
 * Adapts R2BlockWriter to the BlockWriter interface for use
 * in the strategy pattern.
 */

import type { WalEntry } from '@evodb/core';
import type { R2Bucket, ResolvedWriterOptions, BlockMetadata } from '../types.js';
import { R2BlockWriter } from '../r2-writer.js';
import type { BlockWriter, BlockWriteResult } from './interfaces.js';

/**
 * Adapter that wraps R2BlockWriter to implement BlockWriter interface
 */
export class R2BlockWriterAdapter implements BlockWriter {
  private readonly r2Writer: R2BlockWriter;

  constructor(r2Bucket: R2Bucket, options: ResolvedWriterOptions) {
    this.r2Writer = R2BlockWriter.fromWriterOptions(r2Bucket, options);
  }

  /**
   * Create from resolved writer options
   */
  static fromWriterOptions(r2Bucket: R2Bucket, options: ResolvedWriterOptions): R2BlockWriterAdapter {
    return new R2BlockWriterAdapter(r2Bucket, options);
  }

  /**
   * Get the underlying R2BlockWriter for advanced operations
   */
  getR2Writer(): R2BlockWriter {
    return this.r2Writer;
  }

  async write(
    entries: WalEntry[],
    minLsn: bigint,
    maxLsn: bigint,
    seq: number
  ): Promise<BlockWriteResult> {
    return this.r2Writer.writeEntries(entries, minLsn, maxLsn, seq);
  }

  async writeRaw(
    r2Key: string,
    data: Uint8Array,
    metadata: { rowCount: number; compacted: boolean; mergedCount?: number }
  ): Promise<void> {
    return this.r2Writer.writeRawBlock(r2Key, data, metadata);
  }

  async read(r2Key: string): Promise<Uint8Array | null> {
    return this.r2Writer.readBlock(r2Key);
  }

  async delete(r2Keys: string[]): Promise<void> {
    return this.r2Writer.deleteBlocks(r2Keys);
  }

  async exists(r2Key: string): Promise<boolean> {
    return this.r2Writer.blockExists(r2Key);
  }
}

/**
 * In-memory block writer for testing
 */
export class InMemoryBlockWriter implements BlockWriter {
  private storage: Map<string, Uint8Array> = new Map();
  private blockMetadata: Map<string, BlockMetadata> = new Map();

  async write(
    entries: WalEntry[],
    minLsn: bigint,
    maxLsn: bigint,
    seq: number
  ): Promise<BlockWriteResult> {
    if (entries.length === 0) {
      return { success: false, error: 'No entries to write' };
    }

    const timestamp = Date.now();
    const blockId = `${timestamp.toString(36)}-${seq.toString(36)}`;
    const r2Key = `test/data/${blockId}.cjlb`;

    // Create simple block data (for testing)
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(entries.map(e => ({
      lsn: e.lsn.toString(),
      timestamp: e.timestamp.toString(),
      op: e.op,
      dataLen: e.data.length,
    }))));

    this.storage.set(r2Key, data);

    const metadata: BlockMetadata = {
      id: blockId,
      r2Key,
      rowCount: entries.length,
      sizeBytes: data.length,
      minLsn,
      maxLsn,
      createdAt: timestamp,
      compacted: false,
      columnStats: [],
    };

    this.blockMetadata.set(blockId, metadata);

    return { success: true, metadata };
  }

  async writeRaw(
    r2Key: string,
    data: Uint8Array,
    _metadata: { rowCount: number; compacted: boolean; mergedCount?: number }
  ): Promise<void> {
    this.storage.set(r2Key, data);
  }

  async read(r2Key: string): Promise<Uint8Array | null> {
    return this.storage.get(r2Key) ?? null;
  }

  async delete(r2Keys: string[]): Promise<void> {
    for (const key of r2Keys) {
      this.storage.delete(key);
    }
  }

  async exists(r2Key: string): Promise<boolean> {
    return this.storage.has(r2Key);
  }

  /**
   * Get all stored blocks (for testing)
   */
  getAllBlocks(): Map<string, Uint8Array> {
    return new Map(this.storage);
  }

  /**
   * Get block metadata (for testing)
   */
  getBlockMetadata(blockId: string): BlockMetadata | undefined {
    return this.blockMetadata.get(blockId);
  }

  /**
   * Clear all storage (for testing)
   */
  clear(): void {
    this.storage.clear();
    this.blockMetadata.clear();
  }
}

/**
 * Factory function to create a block writer
 */
export function createBlockWriter(
  r2Bucket: R2Bucket,
  options: ResolvedWriterOptions
): BlockWriter {
  return R2BlockWriterAdapter.fromWriterOptions(r2Bucket, options);
}
