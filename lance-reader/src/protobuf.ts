/**
 * Minimal protobuf decoder for Lance format
 * NO external dependencies - pure TypeScript implementation
 * Target size: <4KB minified
 *
 * @module @evodb/lance-reader/protobuf
 */

import type {
  LanceManifest,
  LanceField,
  LanceFragment,
  LanceDataFile,
  LanceDeletionFile,
  LanceIndexMetadata,
  LanceLogicalType,
  WriterVersion,
  IvfStructure,
  PqCodebook,
  Tensor,
  TensorDataType,
  DistanceType,
} from './types.js';

// ==========================================
// Wire Types
// ==========================================

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

// ==========================================
// ProtobufReader Class
// ==========================================

/**
 * Minimal protobuf reader for parsing Lance format messages
 * Implements just enough protobuf decoding for Lance manifest, IVF, and PQ structures
 */
export class ProtobufReader {
  private view: DataView;
  private offset: number = 0;
  private length: number;

  constructor(buffer: ArrayBuffer, byteOffset: number = 0, byteLength?: number) {
    this.view = new DataView(buffer, byteOffset, byteLength);
    this.length = byteLength ?? buffer.byteLength - byteOffset;
  }

  /** Check if there's more data to read */
  hasMore(): boolean {
    return this.offset < this.length;
  }

  /** Get current position */
  position(): number {
    return this.offset;
  }

  /** Skip n bytes */
  skip(n: number): void {
    this.offset += n;
  }

  /** Read a varint (up to 64-bit) */
  readVarint(): bigint {
    let result = 0n;
    let shift = 0n;
    while (true) {
      if (this.offset >= this.length) {
        throw new Error('Unexpected end of buffer reading varint');
      }
      const byte = this.view.getUint8(this.offset++);
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7n;
    }
    return result;
  }

  /** Read a varint as number (for smaller values) */
  readVarintNumber(): number {
    return Number(this.readVarint());
  }

  /** Read signed varint using zigzag encoding */
  readSVarint(): bigint {
    const n = this.readVarint();
    return (n >> 1n) ^ -(n & 1n);
  }

  /** Read signed varint as number */
  readSVarintNumber(): number {
    return Number(this.readSVarint());
  }

  /** Read fixed 64-bit value */
  readFixed64(): bigint {
    if (this.offset + 8 > this.length) {
      throw new Error('Unexpected end of buffer reading fixed64');
    }
    const value = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return value;
  }

  /** Read fixed 32-bit unsigned value */
  readFixed32(): number {
    if (this.offset + 4 > this.length) {
      throw new Error('Unexpected end of buffer reading fixed32');
    }
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  /** Read 32-bit float */
  readFloat32(): number {
    if (this.offset + 4 > this.length) {
      throw new Error('Unexpected end of buffer reading float32');
    }
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  /** Read 64-bit float */
  readFloat64(): number {
    if (this.offset + 8 > this.length) {
      throw new Error('Unexpected end of buffer reading float64');
    }
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  /** Read length-delimited bytes */
  readBytes(): ArrayBuffer {
    const length = this.readVarintNumber();
    if (this.offset + length > this.length) {
      throw new Error(`Unexpected end of buffer reading ${length} bytes`);
    }
    const bytes = this.view.buffer.slice(
      this.view.byteOffset + this.offset,
      this.view.byteOffset + this.offset + length
    ) as ArrayBuffer;
    this.offset += length;
    return bytes;
  }

  /** Read length-delimited bytes without copying */
  readBytesView(): DataView {
    const length = this.readVarintNumber();
    if (this.offset + length > this.length) {
      throw new Error(`Unexpected end of buffer reading ${length} bytes`);
    }
    const view = new DataView(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length
    );
    this.offset += length;
    return view;
  }

  /** Read UTF-8 string */
  readString(): string {
    const bytes = this.readBytes();
    return new TextDecoder().decode(bytes);
  }

  /** Read a field tag */
  readTag(): { field: number; wireType: number } | null {
    if (this.offset >= this.length) return null;
    const tag = this.readVarintNumber();
    return {
      field: tag >>> 3,
      wireType: tag & 0x7,
    };
  }

  /** Skip a field based on wire type */
  skipField(wireType: number): void {
    switch (wireType) {
      case WIRE_VARINT:
        this.readVarint();
        break;
      case WIRE_FIXED64:
        this.skip(8);
        break;
      case WIRE_LENGTH_DELIMITED:
        const len = this.readVarintNumber();
        this.skip(len);
        break;
      case WIRE_FIXED32:
        this.skip(4);
        break;
      default:
        throw new Error(`Unknown wire type: ${wireType}`);
    }
  }

  /** Read packed repeated varint */
  readPackedVarint(): bigint[] {
    const bytes = this.readBytesView();
    const reader = new ProtobufReader(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
    const values: bigint[] = [];
    while (reader.hasMore()) {
      values.push(reader.readVarint());
    }
    return values;
  }

  /** Read packed repeated uint32 */
  readPackedUint32(): Uint32Array {
    const bytes = this.readBytesView();
    const reader = new ProtobufReader(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
    const values: number[] = [];
    while (reader.hasMore()) {
      values.push(reader.readVarintNumber());
    }
    return new Uint32Array(values);
  }

  /** Read packed repeated uint64 */
  readPackedUint64(): BigUint64Array {
    const bytes = this.readBytesView();
    const reader = new ProtobufReader(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
    const values: bigint[] = [];
    while (reader.hasMore()) {
      values.push(reader.readVarint());
    }
    return new BigUint64Array(values);
  }

  /** Read packed repeated float32 */
  readPackedFloat32(): Float32Array {
    const bytes = this.readBytes();
    return new Float32Array(bytes);
  }

  /** Create a sub-reader for a nested message */
  readMessage(): ProtobufReader {
    const bytes = this.readBytesView();
    return new ProtobufReader(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
  }
}

// ==========================================
// Manifest Parsing
// ==========================================

/**
 * Parse a Lance manifest from protobuf bytes
 */
export function parseManifest(buffer: ArrayBuffer): LanceManifest {
  const reader = new ProtobufReader(buffer);
  const manifest: LanceManifest = {
    fields: [],
    fragments: [],
    version: 0n,
    readerFeatureFlags: 0n,
    writerFeatureFlags: 0n,
    dataFormat: 'lance',
  };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // fields
        manifest.fields.push(parseField(reader.readMessage()));
        break;
      case 2: // fragments
        manifest.fragments.push(parseFragment(reader.readMessage()));
        break;
      case 3: // version
        manifest.version = reader.readVarint();
        break;
      case 4: // writer_version
        manifest.writerVersion = parseWriterVersion(reader.readMessage());
        break;
      case 5: // reader_feature_flags
        manifest.readerFeatureFlags = reader.readVarint();
        break;
      case 6: // writer_feature_flags
        manifest.writerFeatureFlags = reader.readVarint();
        break;
      case 7: // index_section
        manifest.indexSection = reader.readVarintNumber();
        break;
      case 8: // data_format
        const format = reader.readVarintNumber();
        manifest.dataFormat = format === 0 ? 'legacy' : 'lance';
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return manifest;
}

/**
 * Parse a field definition
 */
function parseField(reader: ProtobufReader): LanceField {
  const field: LanceField = {
    id: 0,
    parentId: -1,
    name: '',
    logicalType: { type: 'null' },
    nullable: true,
  };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // id
        field.id = reader.readVarintNumber();
        break;
      case 2: // parent_id
        field.parentId = reader.readSVarintNumber();
        break;
      case 3: // name
        field.name = reader.readString();
        break;
      case 4: // logical_type
        field.logicalType = parseLogicalType(reader.readMessage());
        break;
      case 5: // nullable
        field.nullable = reader.readVarintNumber() !== 0;
        break;
      case 6: // encoding
        const enc = reader.readVarintNumber();
        field.encoding = ['plain', 'var_binary', 'dictionary', 'rle', 'miniblock', 'binary'][enc] as LanceField['encoding'];
        break;
      case 7: // metadata
        if (!field.metadata) field.metadata = new Map();
        const meta = parseKeyValue(reader.readMessage());
        field.metadata.set(meta.key, meta.value);
        break;
      case 8: // dictionary
        field.dictionary = parseDictionary(reader.readMessage());
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return field;
}

/**
 * Parse logical type
 */
function parseLogicalType(reader: ProtobufReader): LanceLogicalType {
  let logicalType: LanceLogicalType = { type: 'null' };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // null
        reader.readMessage();
        logicalType = { type: 'null' };
        break;
      case 2: // int
        const intReader = reader.readMessage();
        let bits: 8 | 16 | 32 | 64 = 32;
        let signed = true;
        while (intReader.hasMore()) {
          const intTag = intReader.readTag();
          if (!intTag) break;
          switch (intTag.field) {
            case 1: bits = intReader.readVarintNumber() as 8 | 16 | 32 | 64; break;
            case 2: signed = intReader.readVarintNumber() !== 0; break;
            default: intReader.skipField(intTag.wireType);
          }
        }
        logicalType = { type: 'int', bits, signed };
        break;
      case 3: // float
        const floatReader = reader.readMessage();
        let floatBits: 16 | 32 | 64 = 32;
        while (floatReader.hasMore()) {
          const floatTag = floatReader.readTag();
          if (!floatTag) break;
          if (floatTag.field === 1) floatBits = floatReader.readVarintNumber() as 16 | 32 | 64;
          else floatReader.skipField(floatTag.wireType);
        }
        logicalType = { type: 'float', bits: floatBits };
        break;
      case 4: // binary
        reader.readMessage();
        logicalType = { type: 'binary' };
        break;
      case 5: // utf8
        reader.readMessage();
        logicalType = { type: 'utf8' };
        break;
      case 6: // date
        const dateReader = reader.readMessage();
        let dateUnit = 0;
        while (dateReader.hasMore()) {
          const dateTag = dateReader.readTag();
          if (!dateTag) break;
          if (dateTag.field === 1) dateUnit = dateReader.readVarintNumber();
          else dateReader.skipField(dateTag.wireType);
        }
        logicalType = dateUnit === 0 ? { type: 'date32' } : { type: 'date64' };
        break;
      case 7: // timestamp
        const tsReader = reader.readMessage();
        let tsUnit: 'second' | 'millisecond' | 'microsecond' | 'nanosecond' = 'microsecond';
        let timezone: string | undefined;
        while (tsReader.hasMore()) {
          const tsTag = tsReader.readTag();
          if (!tsTag) break;
          switch (tsTag.field) {
            case 1: {
              const u = tsReader.readVarintNumber();
              tsUnit = ['second', 'millisecond', 'microsecond', 'nanosecond'][u] as typeof tsUnit;
              break;
            }
            case 2: timezone = tsReader.readString(); break;
            default: tsReader.skipField(tsTag.wireType);
          }
        }
        logicalType = { type: 'timestamp', unit: tsUnit, timezone };
        break;
      case 8: // list
        const listReader = reader.readMessage();
        let valueType: LanceLogicalType = { type: 'null' };
        while (listReader.hasMore()) {
          const listTag = listReader.readTag();
          if (!listTag) break;
          if (listTag.field === 1) valueType = parseLogicalType(listReader.readMessage());
          else listReader.skipField(listTag.wireType);
        }
        logicalType = { type: 'list', valueType };
        break;
      case 9: // fixed_size_list
        const fslReader = reader.readMessage();
        let fslValueType: LanceLogicalType = { type: 'null' };
        let dimension = 0;
        while (fslReader.hasMore()) {
          const fslTag = fslReader.readTag();
          if (!fslTag) break;
          switch (fslTag.field) {
            case 1: fslValueType = parseLogicalType(fslReader.readMessage()); break;
            case 2: dimension = fslReader.readVarintNumber(); break;
            default: fslReader.skipField(fslTag.wireType);
          }
        }
        logicalType = { type: 'fixed_size_list', valueType: fslValueType, dimension };
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return logicalType;
}

/**
 * Parse key-value pair
 */
function parseKeyValue(reader: ProtobufReader): { key: string; value: string } {
  let key = '';
  let value = '';
  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;
    switch (tag.field) {
      case 1: key = reader.readString(); break;
      case 2: value = reader.readString(); break;
      default: reader.skipField(tag.wireType);
    }
  }
  return { key, value };
}

/**
 * Parse dictionary info
 */
function parseDictionary(reader: ProtobufReader): LanceField['dictionary'] {
  let offset = 0;
  let length = 0;
  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;
    switch (tag.field) {
      case 1: offset = reader.readVarintNumber(); break;
      case 2: length = reader.readVarintNumber(); break;
      default: reader.skipField(tag.wireType);
    }
  }
  return { offset, length };
}

/**
 * Parse writer version
 */
function parseWriterVersion(reader: ProtobufReader): WriterVersion {
  let library = '';
  let version = '';
  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;
    switch (tag.field) {
      case 1: library = reader.readString(); break;
      case 2: version = reader.readString(); break;
      default: reader.skipField(tag.wireType);
    }
  }
  return { library, version };
}

/**
 * Parse data fragment
 */
function parseFragment(reader: ProtobufReader): LanceFragment {
  const fragment: LanceFragment = {
    id: 0,
    files: [],
    physicalRows: 0n,
  };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // id
        fragment.id = reader.readVarintNumber();
        break;
      case 2: // files
        fragment.files.push(parseDataFile(reader.readMessage()));
        break;
      case 3: // deletion_file
        fragment.deletionFile = parseDeletionFile(reader.readMessage());
        break;
      case 4: // physical_rows
        fragment.physicalRows = reader.readVarint();
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return fragment;
}

/**
 * Parse data file reference
 */
function parseDataFile(reader: ProtobufReader): LanceDataFile {
  const file: LanceDataFile = {
    path: '',
    fields: [],
    columnIndices: [],
  };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // path
        file.path = reader.readString();
        break;
      case 2: // fields (packed repeated)
        if (tag.wireType === WIRE_LENGTH_DELIMITED) {
          file.fields = Array.from(reader.readPackedUint32());
        } else {
          file.fields.push(reader.readVarintNumber());
        }
        break;
      case 3: // column_indices (packed repeated)
        if (tag.wireType === WIRE_LENGTH_DELIMITED) {
          file.columnIndices = Array.from(reader.readPackedUint32());
        } else {
          file.columnIndices.push(reader.readVarintNumber());
        }
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return file;
}

/**
 * Parse deletion file reference
 */
function parseDeletionFile(reader: ProtobufReader): LanceDeletionFile {
  const file: LanceDeletionFile = {
    fileType: 'arrow_array',
    path: '',
    readVersion: 0n,
    numDeletedRows: 0,
  };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // file_type
        file.fileType = reader.readVarintNumber() === 0 ? 'arrow_array' : 'bitmap';
        break;
      case 2: // path
        file.path = reader.readString();
        break;
      case 3: // read_version
        file.readVersion = reader.readVarint();
        break;
      case 4: // num_deleted_rows
        file.numDeletedRows = reader.readVarintNumber();
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return file;
}

// ==========================================
// Index Metadata Parsing
// ==========================================

/**
 * Parse index metadata list from index section
 */
export function parseIndexSection(buffer: ArrayBuffer): LanceIndexMetadata[] {
  const reader = new ProtobufReader(buffer);
  const indices: LanceIndexMetadata[] = [];

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    if (tag.field === 1) {
      indices.push(parseIndexMetadata(reader.readMessage()));
    } else {
      reader.skipField(tag.wireType);
    }
  }

  return indices;
}

/**
 * Parse single index metadata
 */
function parseIndexMetadata(reader: ProtobufReader): LanceIndexMetadata {
  const meta: LanceIndexMetadata = {
    uuid: new Uint8Array(16),
    name: '',
    fields: [],
    datasetVersion: 0n,
    indexDetails: { type: 'ivf_pq', distanceType: 'l2', numPartitions: 0, numSubVectors: 0, numBits: 8 },
  };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // uuid
        meta.uuid = new Uint8Array(reader.readBytes());
        break;
      case 2: // fields
        if (tag.wireType === WIRE_LENGTH_DELIMITED) {
          meta.fields = Array.from(reader.readPackedUint32());
        } else {
          meta.fields.push(reader.readVarintNumber());
        }
        break;
      case 3: // name
        meta.name = reader.readString();
        break;
      case 4: // dataset_version
        meta.datasetVersion = reader.readVarint();
        break;
      case 5: // fragment_bitmap
        meta.fragmentBitmap = new Uint8Array(reader.readBytes());
        break;
      case 6: // index_details (google.protobuf.Any)
        // Parse Any wrapper to extract type URL and value
        const anyReader = reader.readMessage();
        while (anyReader.hasMore()) {
          const anyTag = anyReader.readTag();
          if (!anyTag) break;
          if (anyTag.field === 1) {
            // type_url - skip for now, we'll detect by content
            anyReader.readString();
          } else if (anyTag.field === 2) {
            // value - parse based on content
            meta.indexDetails = parseIndexDetails(anyReader.readMessage());
          } else {
            anyReader.skipField(anyTag.wireType);
          }
        }
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return meta;
}

/**
 * Parse index details based on content
 */
function parseIndexDetails(reader: ProtobufReader): LanceIndexMetadata['indexDetails'] {
  let distanceType: DistanceType = 'l2';
  let numPartitions = 0;
  let numSubVectors = 0;
  let numBits = 8;
  let m = 16;
  let efConstruction = 200;
  let maxLevel = 0;
  let hasSubVectors = false;
  let hasM = false;

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // distance_type
        const dt = reader.readVarintNumber();
        distanceType = ['l2', 'cosine', 'dot'][dt] as DistanceType ?? 'l2';
        break;
      case 2: // num_partitions
        numPartitions = reader.readVarintNumber();
        break;
      case 3: // num_sub_vectors
        numSubVectors = reader.readVarintNumber();
        hasSubVectors = true;
        break;
      case 4: // num_bits
        numBits = reader.readVarintNumber();
        break;
      case 5: // m (HNSW)
        m = reader.readVarintNumber();
        hasM = true;
        break;
      case 6: // ef_construction (HNSW)
        efConstruction = reader.readVarintNumber();
        break;
      case 7: // max_level (HNSW)
        maxLevel = reader.readVarintNumber();
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  if (hasM) {
    return { type: 'hnsw', distanceType, m, efConstruction, maxLevel };
  } else if (hasSubVectors) {
    return { type: 'ivf_pq', distanceType, numPartitions, numSubVectors, numBits };
  } else {
    return { type: 'ivf_flat', distanceType, numPartitions };
  }
}

// ==========================================
// IVF Structure Parsing
// ==========================================

/**
 * Parse IVF (Inverted File) structure from protobuf
 */
export function parseIvf(buffer: ArrayBuffer): IvfStructure {
  const reader = new ProtobufReader(buffer);
  let centroids: Float32Array = new Float32Array(0);
  let offsets: BigUint64Array = new BigUint64Array(0);
  let lengths: Uint32Array = new Uint32Array(0);
  let loss: number | undefined;
  let dimension = 0;

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // centroids_tensor
        const tensor = parseTensor(reader.readMessage());
        if (tensor.dataType === 'float32') {
          centroids = new Float32Array(tensor.data);
          if (tensor.shape.length >= 2) {
            dimension = tensor.shape[1];
          }
        }
        break;
      case 2: // offsets (packed uint64)
        offsets = reader.readPackedUint64();
        break;
      case 3: // lengths (packed uint32)
        lengths = reader.readPackedUint32();
        break;
      case 4: // loss
        loss = reader.readFloat32();
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  const numPartitions = lengths.length;

  return { centroids, offsets, lengths, loss, numPartitions, dimension };
}

/**
 * Parse Tensor from protobuf
 */
function parseTensor(reader: ProtobufReader): Tensor {
  let dataType: TensorDataType = 'float32';
  const shape: number[] = [];
  let data: ArrayBuffer = new ArrayBuffer(0);

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // data_type
        const dt = reader.readVarintNumber();
        dataType = [
          'float16', 'float32', 'float64',
          'int8', 'int16', 'int32', 'int64',
          'uint8', 'uint16', 'uint32', 'uint64'
        ][dt] as TensorDataType ?? 'float32';
        break;
      case 2: // shape (packed uint32)
        if (tag.wireType === WIRE_LENGTH_DELIMITED) {
          shape.push(...reader.readPackedUint32());
        } else {
          shape.push(reader.readVarintNumber());
        }
        break;
      case 3: // data
        data = reader.readBytes();
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return { dataType, shape, data };
}

// ==========================================
// PQ Codebook Parsing
// ==========================================

/**
 * Parse Product Quantizer codebook from protobuf
 */
export function parsePqCodebook(buffer: ArrayBuffer): PqCodebook {
  const reader = new ProtobufReader(buffer);
  let codebook: Float32Array = new Float32Array(0);
  let numSubVectors = 0;
  let numBits = 8;
  let distanceType: DistanceType = 'l2';
  let subDim = 0;

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // codebook tensor
        const tensor = parseTensor(reader.readMessage());
        if (tensor.dataType === 'float32') {
          codebook = new Float32Array(tensor.data);
          // Shape: [256, numSubVectors, subDim]
          if (tensor.shape.length >= 3) {
            numSubVectors = tensor.shape[1];
            subDim = tensor.shape[2];
          }
        }
        break;
      case 2: // num_sub_vectors
        numSubVectors = reader.readVarintNumber();
        break;
      case 3: // num_bits
        numBits = reader.readVarintNumber();
        break;
      case 4: // distance_type
        const dt = reader.readString();
        if (dt === 'l2' || dt === 'cosine' || dt === 'dot') {
          distanceType = dt;
        }
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return { codebook, numSubVectors, numBits, distanceType, subDim };
}

// ==========================================
// Schema Metadata Parsing
// ==========================================

/**
 * Parse schema metadata from Arrow IPC format
 * Returns key-value pairs from schema metadata
 */
export function parseSchemaMetadata(buffer: ArrayBuffer): Map<string, string> {
  const metadata = new Map<string, string>();
  const reader = new ProtobufReader(buffer);

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    if (tag.field === 1) {
      const kv = parseKeyValue(reader.readMessage());
      metadata.set(kv.key, kv.value);
    } else {
      reader.skipField(tag.wireType);
    }
  }

  return metadata;
}

// ==========================================
// Column Statistics Parsing
// ==========================================

/**
 * Column statistics for a data column
 */
export interface ColumnStatistics {
  nullCount: bigint;
  rowCount: bigint;
  minValue: bigint | number | string | null;
  maxValue: bigint | number | string | null;
  distinctCount?: bigint;
}

/**
 * Parse column statistics from protobuf buffer
 * Column statistics include min/max values for query pruning
 */
export function parseColumnStatistics(buffer: ArrayBuffer): ColumnStatistics {
  const reader = new ProtobufReader(buffer);
  const stats: ColumnStatistics = {
    nullCount: 0n,
    rowCount: 0n,
    minValue: null,
    maxValue: null,
  };

  while (reader.hasMore()) {
    const tag = reader.readTag();
    if (!tag) break;

    switch (tag.field) {
      case 1: // null_count
        stats.nullCount = reader.readVarint();
        break;
      case 2: // row_count
        stats.rowCount = reader.readVarint();
        break;
      case 3: // min_value (as bytes, interpretation depends on type)
        {
          const minBytes = reader.readBytes();
          // Default: interpret as int64 if 8 bytes
          if (minBytes.byteLength === 8) {
            stats.minValue = new DataView(minBytes).getBigInt64(0, true);
          } else if (minBytes.byteLength === 4) {
            stats.minValue = new DataView(minBytes).getFloat32(0, true);
          } else {
            // Try to interpret as string
            stats.minValue = new TextDecoder().decode(minBytes);
          }
        }
        break;
      case 4: // max_value (as bytes, interpretation depends on type)
        {
          const maxBytes = reader.readBytes();
          if (maxBytes.byteLength === 8) {
            stats.maxValue = new DataView(maxBytes).getBigInt64(0, true);
          } else if (maxBytes.byteLength === 4) {
            stats.maxValue = new DataView(maxBytes).getFloat32(0, true);
          } else {
            stats.maxValue = new TextDecoder().decode(maxBytes);
          }
        }
        break;
      case 5: // distinct_count
        stats.distinctCount = reader.readVarint();
        break;
      default:
        reader.skipField(tag.wireType);
    }
  }

  return stats;
}

// ==========================================
// Deletion File Reading
// ==========================================

import type { StorageAdapter } from './types.js';

/**
 * Read a deletion file and return set of deleted row IDs
 *
 * @param storage - Storage adapter to read from
 * @param path - Path to the deletion file
 * @param fileType - Type of deletion file ('arrow_array' or 'bitmap')
 * @returns Set of deleted row IDs
 */
export async function readDeletionFile(
  storage: StorageAdapter,
  path: string,
  fileType: 'arrow_array' | 'bitmap'
): Promise<Set<bigint>> {
  const buffer = await storage.get(path);
  if (!buffer) {
    return new Set();
  }

  const deletedRows = new Set<bigint>();

  if (fileType === 'arrow_array') {
    // Arrow array format: array of uint64 row indices
    const view = new DataView(buffer);
    const numRows = Math.floor(buffer.byteLength / 8);

    for (let i = 0; i < numRows; i++) {
      const rowId = view.getBigUint64(i * 8, true);
      deletedRows.add(rowId);
    }
  } else if (fileType === 'bitmap') {
    // Bitmap format (simplified Roaring Bitmap parsing)
    // RoaringBitmap format:
    // - First 4 bytes: cookie (12346 or 12347 for run-encoded)
    // - Then container descriptions and actual data
    //
    // For now, we implement a basic run-length encoded bitmap
    // Real implementation would parse full Roaring format
    const view = new DataView(buffer);

    if (buffer.byteLength < 8) {
      return deletedRows;
    }

    const cookie = view.getUint32(0, true);

    // Simple bitmap: just dense bit array
    if (cookie !== 12346 && cookie !== 12347) {
      // Treat as simple bit array
      const bytes = new Uint8Array(buffer);
      for (let byteIdx = 0; byteIdx < bytes.length; byteIdx++) {
        const byte = bytes[byteIdx];
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (1 << bit)) {
            deletedRows.add(BigInt(byteIdx * 8 + bit));
          }
        }
      }
    } else {
      // Roaring bitmap format
      // Number of containers
      const numContainers = (view.getUint32(4, true) & 0xFFFF) + 1;
      let offset = 8;

      // Read container descriptors (key, cardinality pairs)
      const containers: Array<{ key: number; cardinality: number }> = [];
      for (let i = 0; i < numContainers && offset + 4 <= buffer.byteLength; i++) {
        const key = view.getUint16(offset, true);
        const cardinality = view.getUint16(offset + 2, true) + 1;
        containers.push({ key, cardinality });
        offset += 4;
      }

      // Read container data (simplified: assume array containers)
      for (const container of containers) {
        const baseValue = BigInt(container.key) * 65536n;
        for (let j = 0; j < container.cardinality && offset + 2 <= buffer.byteLength; j++) {
          const value = view.getUint16(offset, true);
          deletedRows.add(baseValue + BigInt(value));
          offset += 2;
        }
      }
    }
  }

  return deletedRows;
}
