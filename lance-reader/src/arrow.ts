/**
 * Minimal Arrow IPC reader for Lance format
 * NO external dependencies - pure TypeScript implementation
 * Target size: <5KB minified
 *
 * Only implements what's needed for Lance index files:
 * - Schema parsing (for metadata like lance:ivf)
 * - RecordBatch reading (for _rowid and __pq_code columns)
 *
 * @module @evodb/lance-reader/arrow
 */

import type { PartitionData } from './types.js';

// ==========================================
// Arrow IPC Magic & Constants
// ==========================================

/** Arrow IPC magic bytes: ARROW1 */
const ARROW_MAGIC = new Uint8Array([0x41, 0x52, 0x52, 0x4f, 0x57, 0x31]);

/** Arrow IPC continuation marker */
const CONTINUATION_MARKER = 0xFFFFFFFF;

// ==========================================
// FlatBuffer Minimal Reader
// ==========================================

/**
 * Minimal FlatBuffer reader - only implements what Arrow needs
 * FlatBuffers store data as:
 * - Root table offset at position 0
 * - Tables have vtable offset, then fields
 * - vtable: [vtable_size, object_size, field_offsets...]
 */
class FlatBufferReader {
  private view: DataView;
  private bytes: Uint8Array;

  constructor(buffer: ArrayBuffer, offset: number = 0) {
    this.view = new DataView(buffer, offset);
    this.bytes = new Uint8Array(buffer, offset);
  }

  /** Read int32 at offset */
  readInt32(offset: number): number {
    return this.view.getInt32(offset, true);
  }

  /** Read uint32 at offset */
  readUint32(offset: number): number {
    return this.view.getUint32(offset, true);
  }

  /** Read int16 at offset */
  readInt16(offset: number): number {
    return this.view.getInt16(offset, true);
  }

  /** Read int64 as bigint at offset */
  readInt64(offset: number): bigint {
    return this.view.getBigInt64(offset, true);
  }

  /** Read uint64 as bigint at offset */
  readUint64(offset: number): bigint {
    return this.view.getBigUint64(offset, true);
  }

  /** Get bytes slice */
  slice(start: number, end: number): Uint8Array {
    return this.bytes.slice(start, end);
  }

  /** Get underlying buffer */
  get buffer(): ArrayBuffer {
    return this.view.buffer as ArrayBuffer;
  }

  /** Get byte offset */
  get byteOffset(): number {
    return this.view.byteOffset;
  }

  /**
   * Read a string from a FlatBuffer offset
   * Strings are stored as: [length:uint32][utf8_bytes]
   */
  readString(offset: number): string {
    const stringOffset = offset + this.readInt32(offset);
    const length = this.readUint32(stringOffset);
    const bytes = this.slice(stringOffset + 4, stringOffset + 4 + length);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Get field offset from vtable
   * Returns 0 if field not present
   */
  getFieldOffset(tableOffset: number, fieldIndex: number): number {
    const vtableOffset = tableOffset - this.readInt32(tableOffset);
    const vtableSize = this.readInt16(vtableOffset);
    const fieldVtableOffset = 4 + fieldIndex * 2;
    if (fieldVtableOffset >= vtableSize) return 0;
    return this.readInt16(vtableOffset + fieldVtableOffset);
  }

  /**
   * Read a field as int32, or return default if not present
   */
  readFieldInt32(tableOffset: number, fieldIndex: number, defaultValue: number = 0): number {
    const fieldOffset = this.getFieldOffset(tableOffset, fieldIndex);
    if (fieldOffset === 0) return defaultValue;
    return this.readInt32(tableOffset + fieldOffset);
  }

  /**
   * Read a field as int64, or return default if not present
   */
  readFieldInt64(tableOffset: number, fieldIndex: number, defaultValue: bigint = 0n): bigint {
    const fieldOffset = this.getFieldOffset(tableOffset, fieldIndex);
    if (fieldOffset === 0) return defaultValue;
    return this.readInt64(tableOffset + fieldOffset);
  }

  /**
   * Read a field as string, or return undefined if not present
   */
  readFieldString(tableOffset: number, fieldIndex: number): string | undefined {
    const fieldOffset = this.getFieldOffset(tableOffset, fieldIndex);
    if (fieldOffset === 0) return undefined;
    return this.readString(tableOffset + fieldOffset);
  }

  /**
   * Read a nested table field
   */
  readFieldTable(tableOffset: number, fieldIndex: number): number | null {
    const fieldOffset = this.getFieldOffset(tableOffset, fieldIndex);
    if (fieldOffset === 0) return null;
    return tableOffset + fieldOffset + this.readInt32(tableOffset + fieldOffset);
  }

  /**
   * Read a vector of tables
   * Returns array of table offsets
   */
  readFieldVector(tableOffset: number, fieldIndex: number): number[] {
    const fieldOffset = this.getFieldOffset(tableOffset, fieldIndex);
    if (fieldOffset === 0) return [];

    const vectorOffset = tableOffset + fieldOffset + this.readInt32(tableOffset + fieldOffset);
    const length = this.readUint32(vectorOffset);
    const offsets: number[] = [];

    for (let i = 0; i < length; i++) {
      const elemOffset = vectorOffset + 4 + i * 4;
      offsets.push(elemOffset + this.readInt32(elemOffset));
    }

    return offsets;
  }

  /**
   * Read a vector of scalars (int32)
   */
  readFieldVectorInt32(tableOffset: number, fieldIndex: number): Int32Array {
    const fieldOffset = this.getFieldOffset(tableOffset, fieldIndex);
    if (fieldOffset === 0) return new Int32Array(0);

    const vectorOffset = tableOffset + fieldOffset + this.readInt32(tableOffset + fieldOffset);
    const length = this.readUint32(vectorOffset);
    const result = new Int32Array(length);

    for (let i = 0; i < length; i++) {
      result[i] = this.readInt32(vectorOffset + 4 + i * 4);
    }

    return result;
  }
}

// ==========================================
// Arrow Schema Types
// ==========================================

/** Arrow field type enumeration (subset we care about) */
export enum ArrowType {
  NONE = 0,
  Int = 2,
  FloatingPoint = 3,
  Binary = 4,
  Utf8 = 5,
  List = 12,
  FixedSizeList = 16,
  LargeUtf8 = 20,
  LargeBinary = 21,
}

/** Arrow field definition */
export interface ArrowField {
  name: string;
  type: ArrowType;
  nullable: boolean;
  /** For Int type */
  bitWidth?: number;
  isSigned?: boolean;
  /** For FixedSizeList */
  listSize?: number;
  /** For List/FixedSizeList - child field */
  children?: ArrowField[];
  /** Custom metadata */
  metadata?: Map<string, string>;
}

/** Arrow schema */
export interface ArrowSchema {
  fields: ArrowField[];
  metadata: Map<string, string>;
}

/** Arrow record batch info */
export interface ArrowRecordBatch {
  length: bigint;
  nodes: Array<{ length: bigint; nullCount: bigint }>;
  buffers: Array<{ offset: bigint; length: bigint }>;
}

// ==========================================
// Arrow IPC Message Types
// ==========================================

/** Message header types */
enum MessageHeader {
  NONE = 0,
  Schema = 1,
  DictionaryBatch = 2,
  RecordBatch = 3,
  Tensor = 4,
  SparseTensor = 5,
}

// ==========================================
// Arrow IPC Reader Class
// ==========================================

/**
 * Minimal Arrow IPC file reader
 * Only implements what's needed for Lance index files
 */
export class ArrowIpcReader {
  private buffer: ArrayBuffer;
  private view: DataView;

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
  }

  /**
   * Verify Arrow magic bytes at start and end of file
   */
  verifyMagic(): boolean {
    const startMagic = new Uint8Array(this.buffer, 0, 6);
    const endMagic = new Uint8Array(this.buffer, this.buffer.byteLength - 6, 6);

    for (let i = 0; i < 6; i++) {
      if (startMagic[i] !== ARROW_MAGIC[i] || endMagic[i] !== ARROW_MAGIC[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Read schema from Arrow IPC file
   */
  readSchema(): ArrowSchema {
    // Skip magic (6 bytes) + padding (2 bytes)
    let offset = 8;

    // Read message: [continuation marker or size][metadata size][flatbuffer]
    let metadataSize = this.view.getInt32(offset, true);
    offset += 4;

    // Check for continuation marker
    if (metadataSize === CONTINUATION_MARKER) {
      metadataSize = this.view.getInt32(offset, true);
      offset += 4;
    }

    if (metadataSize <= 0) {
      throw new Error('Invalid Arrow IPC: no schema message');
    }

    // Parse schema message
    const fb = new FlatBufferReader(this.buffer, offset);
    const rootOffset = fb.readInt32(0);

    // Message table: version (0), header_type (1), header (2), bodyLength (3)
    const headerType = fb.readFieldInt32(rootOffset, 1);
    if (headerType !== MessageHeader.Schema) {
      throw new Error(`Expected Schema message, got type ${headerType}`);
    }

    const schemaOffset = fb.readFieldTable(rootOffset, 2);
    if (schemaOffset === null) {
      throw new Error('Missing schema in message');
    }

    return this.parseSchema(fb, schemaOffset);
  }

  /**
   * Parse schema from FlatBuffer
   */
  private parseSchema(fb: FlatBufferReader, schemaOffset: number): ArrowSchema {
    // Schema table: endianness (0), fields (1), custom_metadata (2)
    const fieldOffsets = fb.readFieldVector(schemaOffset, 1);
    const metadataOffsets = fb.readFieldVector(schemaOffset, 2);

    const fields: ArrowField[] = fieldOffsets.map(offset => this.parseField(fb, offset));
    const metadata = this.parseMetadata(fb, metadataOffsets);

    return { fields, metadata };
  }

  /**
   * Parse field from FlatBuffer
   */
  private parseField(fb: FlatBufferReader, fieldOffset: number): ArrowField {
    // Field table: name (0), nullable (1), type_type (2), type (3), dictionary (4),
    //              children (5), custom_metadata (6)
    const name = fb.readFieldString(fieldOffset, 0) ?? '';
    const nullable = fb.readFieldInt32(fieldOffset, 1, 0) !== 0;
    const typeType = fb.readFieldInt32(fieldOffset, 2, ArrowType.NONE);
    const childOffsets = fb.readFieldVector(fieldOffset, 5);
    const metadataOffsets = fb.readFieldVector(fieldOffset, 6);

    const field: ArrowField = {
      name,
      type: typeType as ArrowType,
      nullable,
      children: childOffsets.map(offset => this.parseField(fb, offset)),
      metadata: this.parseMetadata(fb, metadataOffsets),
    };

    // Parse type-specific details
    const typeOffset = fb.readFieldTable(fieldOffset, 3);
    if (typeOffset !== null) {
      switch (typeType) {
        case ArrowType.Int:
          // Int table: bitWidth (0), is_signed (1)
          field.bitWidth = fb.readFieldInt32(typeOffset, 0, 32);
          field.isSigned = fb.readFieldInt32(typeOffset, 1, 1) !== 0;
          break;
        case ArrowType.FixedSizeList:
          // FixedSizeList table: listSize (0)
          field.listSize = fb.readFieldInt32(typeOffset, 0, 0);
          break;
      }
    }

    return field;
  }

  /**
   * Parse metadata key-value pairs
   */
  private parseMetadata(fb: FlatBufferReader, metadataOffsets: number[]): Map<string, string> {
    const metadata = new Map<string, string>();

    for (const kvOffset of metadataOffsets) {
      // KeyValue table: key (0), value (1)
      const key = fb.readFieldString(kvOffset, 0);
      const value = fb.readFieldString(kvOffset, 1);
      if (key !== undefined && value !== undefined) {
        metadata.set(key, value);
      }
    }

    return metadata;
  }

  /**
   * Find and read record batches from Arrow IPC file
   */
  readRecordBatches(): ArrowRecordBatch[] {
    const batches: ArrowRecordBatch[] = [];

    // Read footer to find record batch locations
    // Footer is at end: [footer flatbuffer][footer size:i32][magic:6]
    const footerSizeOffset = this.buffer.byteLength - 10;
    const footerSize = this.view.getInt32(footerSizeOffset, true);
    const footerOffset = footerSizeOffset - footerSize;

    const fb = new FlatBufferReader(this.buffer, footerOffset);
    const rootOffset = fb.readInt32(0);

    // Footer table: version (0), schema (1), dictionaries (2), recordBatches (3)
    const batchOffsets = fb.readFieldVector(rootOffset, 3);

    for (const blockOffset of batchOffsets) {
      // Block table: offset (0), metaDataLength (1), bodyLength (2)
      const fileOffset = fb.readFieldInt64(blockOffset, 0);
      const metaDataLength = fb.readFieldInt32(blockOffset, 1);
      // const bodyLength = fb.readFieldInt64(blockOffset, 2);

      // Read the record batch message
      const batch = this.readRecordBatchMessage(Number(fileOffset), metaDataLength);
      if (batch) {
        batches.push(batch);
      }
    }

    return batches;
  }

  /**
   * Read a single record batch message
   */
  private readRecordBatchMessage(offset: number, _metaDataLength: number): ArrowRecordBatch | null {
    let msgOffset = offset;

    // Check for continuation marker
    const firstInt = this.view.getInt32(msgOffset, true);
    if (firstInt === CONTINUATION_MARKER) {
      msgOffset += 4;
    }
    msgOffset += 4; // Skip metadata size (we already have it)

    const fb = new FlatBufferReader(this.buffer, msgOffset);
    const rootOffset = fb.readInt32(0);

    // Message table: version (0), header_type (1), header (2), bodyLength (3)
    const headerType = fb.readFieldInt32(rootOffset, 1);
    if (headerType !== MessageHeader.RecordBatch) {
      return null;
    }

    const headerOffset = fb.readFieldTable(rootOffset, 2);
    if (headerOffset === null) {
      return null;
    }

    // RecordBatch table: length (0), nodes (1), buffers (2)
    const length = fb.readFieldInt64(headerOffset, 0);
    const nodeOffsets = fb.readFieldVector(headerOffset, 1);
    const bufferOffsets = fb.readFieldVector(headerOffset, 2);

    const nodes = nodeOffsets.map(nodeOffset => ({
      // FieldNode table: length (0), null_count (1)
      length: fb.readFieldInt64(nodeOffset, 0),
      nullCount: fb.readFieldInt64(nodeOffset, 1),
    }));

    const buffers = bufferOffsets.map(bufferOffset => ({
      // Buffer table: offset (0), length (1)
      offset: fb.readFieldInt64(bufferOffset, 0),
      length: fb.readFieldInt64(bufferOffset, 1),
    }));

    return { length, nodes, buffers };
  }

  /**
   * Get raw buffer data at specified offset and length
   */
  getBuffer(offset: number, length: number): ArrayBuffer {
    return this.buffer.slice(offset, offset + length);
  }
}

// ==========================================
// Lance-Specific Arrow Helpers
// ==========================================

/**
 * Read partition data from a Lance index file
 * Expected schema: _rowid: uint64, __pq_code: list<uint8>[m]
 */
export function readPartitionData(
  buffer: ArrayBuffer,
  numSubVectors: number
): PartitionData {
  const reader = new ArrowIpcReader(buffer);

  // Verify it's an Arrow file
  if (!reader.verifyMagic()) {
    throw new Error('Invalid Arrow IPC file');
  }

  // Read schema to understand column layout
  const schema = reader.readSchema();

  // Find _rowid and __pq_code fields
  let rowIdFieldIndex = -1;
  let pqCodeFieldIndex = -1;

  for (let i = 0; i < schema.fields.length; i++) {
    const field = schema.fields[i];
    if (field.name === '_rowid') {
      rowIdFieldIndex = i;
    } else if (field.name === '__pq_code') {
      pqCodeFieldIndex = i;
    }
  }

  if (rowIdFieldIndex === -1 || pqCodeFieldIndex === -1) {
    throw new Error('Missing _rowid or __pq_code column in partition data');
  }

  // Read record batches
  const batches = reader.readRecordBatches();
  if (batches.length === 0) {
    return {
      rowIds: new BigUint64Array(0),
      pqCodes: new Uint8Array(0),
      numRows: 0,
    };
  }

  // Calculate total rows
  let totalRows = 0;
  for (const batch of batches) {
    totalRows += Number(batch.length);
  }

  // Allocate output arrays
  const rowIds = new BigUint64Array(totalRows);
  const pqCodes = new Uint8Array(totalRows * numSubVectors);

  // Extract data from batches
  // This is simplified - real implementation would need to handle
  // buffer layouts more carefully based on field types
  let rowOffset = 0;
  for (const batch of batches) {
    const numRows = Number(batch.length);

    // For each field, there are typically:
    // - Validity bitmap buffer (if nullable)
    // - Data buffer
    // For lists, there's also an offsets buffer

    // _rowid is a simple uint64, so buffers are [validity?, data]
    // __pq_code is a fixed_size_list<uint8>, so buffers are [validity?, data]

    // Find buffers for each field (simplified indexing)
    // In real Arrow IPC, buffer indices depend on nullability and nesting

    // For now, use heuristic: assume both fields are non-nullable
    // Buffer order: [rowid_data, pqcode_data]
    // This may need adjustment based on actual Lance index file structure

    if (batch.buffers.length >= 2) {
      // Read row IDs
      const rowIdBuffer = batch.buffers[rowIdFieldIndex];
      const rowIdData = reader.getBuffer(
        Number(rowIdBuffer.offset),
        Number(rowIdBuffer.length)
      );
      const rowIdView = new BigUint64Array(rowIdData);
      rowIds.set(rowIdView.subarray(0, numRows), rowOffset);

      // Read PQ codes
      // For fixed_size_list, data is contiguous: [list0_data][list1_data]...
      const pqCodeBuffer = batch.buffers[pqCodeFieldIndex];
      const pqCodeData = reader.getBuffer(
        Number(pqCodeBuffer.offset),
        Number(pqCodeBuffer.length)
      );
      const pqCodeView = new Uint8Array(pqCodeData);
      pqCodes.set(
        pqCodeView.subarray(0, numRows * numSubVectors),
        rowOffset * numSubVectors
      );
    }

    rowOffset += numRows;
  }

  return { rowIds, pqCodes, numRows: totalRows };
}

/**
 * Extract schema metadata from Arrow IPC buffer
 * Used to read lance:ivf, lance:index metadata
 */
export function readSchemaMetadata(buffer: ArrayBuffer): Map<string, string> {
  const reader = new ArrowIpcReader(buffer);

  if (!reader.verifyMagic()) {
    throw new Error('Invalid Arrow IPC file');
  }

  const schema = reader.readSchema();
  return schema.metadata;
}

/**
 * Get the lance:ivf global buffer index from schema metadata
 */
export function getLanceIvfBufferIndex(metadata: Map<string, string>): number | null {
  const ivfValue = metadata.get('lance:ivf');
  if (ivfValue === undefined) return null;
  return parseInt(ivfValue, 10) - 1; // Convert from 1-based to 0-based
}

/**
 * Parse lance:index metadata JSON
 */
export function parseLanceIndexMetadata(metadata: Map<string, string>): {
  type: string;
  distanceType: string;
} | null {
  const indexValue = metadata.get('lance:index');
  if (indexValue === undefined) return null;

  try {
    const parsed = JSON.parse(indexValue);
    return {
      type: parsed.type ?? 'unknown',
      distanceType: parsed.distance_type ?? 'l2',
    };
  } catch {
    return null;
  }
}
