/**
 * EvoDB RPC Protocol
 *
 * Binary and JSON encoding/decoding for RPC messages.
 * Supports efficient binary format for high-throughput CDC streaming.
 *
 * Binary Format (CDC Batch Message):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ Header (40 bytes)                                                │
 * ├──────────────────────────────────────────────────────────────────┤
 * │ magic (2 bytes, uint16) = 0xEDB0                                │
 * │ version (1 byte, uint8) = 1                                      │
 * │ type (1 byte, uint8) - message type code                         │
 * │ flags (1 byte, uint8) - compression, etc.                        │
 * │ reserved (3 bytes)                                               │
 * │ timestamp (8 bytes, uint64, LE)                                  │
 * │ sequenceNumber (8 bytes, uint64, LE)                             │
 * │ sourceDoIdLength (2 bytes, uint16, LE)                           │
 * │ entryCount (4 bytes, uint32, LE)                                 │
 * │ totalPayloadSize (4 bytes, uint32, LE)                           │
 * │ correlationIdLength (2 bytes, uint16, LE)                        │
 * │ checksum (4 bytes, uint32, CRC32)                                │
 * ├──────────────────────────────────────────────────────────────────┤
 * │ Variable-length data                                             │
 * ├──────────────────────────────────────────────────────────────────┤
 * │ sourceDoId (variable, UTF-8)                                     │
 * │ correlationId (variable, UTF-8, optional)                        │
 * │ entries[] (variable, binary-encoded WAL entries)                 │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * CDC Event Frame Format (for encodeFrame/decodeFrame):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ magic (2 bytes, uint16) = 0xEDB0 (EvoDB magic)                   │
 * │ version (1 byte, uint8) = 1                                      │
 * │ type (1 byte, uint8) - CDC event type                            │
 * │ flags (1 byte, uint8) - compression, etc.                        │
 * │ reserved (3 bytes)                                               │
 * │ entryCount (4 bytes, uint32, LE) - at offset 8                   │
 * │ checksum (4 bytes, uint32, CRC32) - at end of header             │
 * │ payload (variable)                                               │
 * └──────────────────────────────────────────────────────────────────┘
 */

import {
  type AnyRpcMessage,
  type CDCBatchMessage,
  type AckMessage,
  type NackMessage,
  type ConnectMessage,
  type HeartbeatMessage,
  type WalEntry,
  type WalOperation,
  WalOperationCode,
  ProtocolError,
  isCDCBatchMessage,
  isAckMessage,
  isNackMessage,
} from './types.js';

// =============================================================================
// Constants
// =============================================================================

/** Magic number to identify our protocol (internal batch format) */
const MAGIC = 0xcdc2;

/** EvoDB Magic number for CDC event frames (tests expect 0xEDB0) */
const EVODB_MAGIC = 0xedb0;

/** Current protocol version */
const PROTOCOL_VERSION = 1;

/** Header size in bytes */
const HEADER_SIZE = 40;

/** Maximum message size (16MB) */
const MAX_MESSAGE_SIZE = 16 * 1024 * 1024;

/** Message type codes */
const MessageTypeCode = {
  CDC_BATCH: 0x01,
  ACK: 0x02,
  NACK: 0x03,
  CONNECT: 0x04,
  HEARTBEAT: 0x05,
  FLUSH_REQUEST: 0x06,
  STATUS: 0x07,
  DISCONNECT: 0x08,
} as const;

/** Flag bits */
const Flags = {
  COMPRESSED: 0x01,
  HAS_CORRELATION_ID: 0x02,
  IS_RETRY: 0x04,
} as const;

// =============================================================================
// Text Encoder/Decoder (reusable instances)
// =============================================================================

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// =============================================================================
// CRC32 Implementation (for message integrity)
// =============================================================================

const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crc32Table[i] = c;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// =============================================================================
// Protocol Codec
// =============================================================================

/**
 * Protocol codec for encoding/decoding RPC messages
 */
export class ProtocolCodec {
  private readonly encodeBuffer: ArrayBuffer;
  private readonly encodeView: DataView;
  private readonly encodeUint8: Uint8Array;

  constructor(bufferSize: number = MAX_MESSAGE_SIZE) {
    this.encodeBuffer = new ArrayBuffer(bufferSize);
    this.encodeView = new DataView(this.encodeBuffer);
    this.encodeUint8 = new Uint8Array(this.encodeBuffer);
  }

  // ===========================================================================
  // JSON Encoding (Simple, for debugging and fallback)
  // ===========================================================================

  /**
   * Encode a message to JSON string
   */
  encodeJson(message: AnyRpcMessage): string {
    return JSON.stringify(message);
  }

  /**
   * Decode a message from JSON string
   */
  decodeJson(json: string): AnyRpcMessage {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !parsed.type) {
      throw new ProtocolError('Invalid JSON message: missing type field');
    }
    return parsed as AnyRpcMessage;
  }

  // ===========================================================================
  // Binary Encoding
  // ===========================================================================

  /**
   * Encode a CDC batch message to binary format
   */
  encodeCDCBatch(message: CDCBatchMessage): ArrayBuffer {
    let offset = HEADER_SIZE;

    // Encode variable-length fields first to calculate sizes
    const sourceDoIdBytes = textEncoder.encode(message.sourceDoId);
    const correlationIdBytes = message.correlationId
      ? textEncoder.encode(message.correlationId)
      : new Uint8Array(0);

    // Encode all entries
    const entriesBuffer = this.encodeEntries(message.entries);
    const entriesBytes = new Uint8Array(entriesBuffer);

    // Calculate total size
    const totalSize =
      HEADER_SIZE +
      sourceDoIdBytes.length +
      correlationIdBytes.length +
      entriesBytes.length;

    if (totalSize > MAX_MESSAGE_SIZE) {
      throw new ProtocolError(
        `Message size ${totalSize} exceeds maximum ${MAX_MESSAGE_SIZE}`
      );
    }

    // Build flags
    let flags = 0;
    if (correlationIdBytes.length > 0) flags |= Flags.HAS_CORRELATION_ID;
    if (message.isRetry) flags |= Flags.IS_RETRY;

    // Write header
    this.encodeView.setUint16(0, MAGIC, true);
    this.encodeView.setUint8(2, PROTOCOL_VERSION);
    this.encodeView.setUint8(3, MessageTypeCode.CDC_BATCH);
    this.encodeView.setUint8(4, flags);
    // Reserved (3 bytes at offset 5-7)
    this.encodeView.setBigUint64(8, BigInt(message.timestamp), true);
    this.encodeView.setBigUint64(16, BigInt(message.sequenceNumber), true);
    this.encodeView.setUint16(24, sourceDoIdBytes.length, true);
    this.encodeView.setUint32(26, message.entries.length, true);
    this.encodeView.setUint32(30, entriesBytes.length, true);
    this.encodeView.setUint16(34, correlationIdBytes.length, true);
    // Checksum placeholder at offset 36

    // Write variable data
    this.encodeUint8.set(sourceDoIdBytes, offset);
    offset += sourceDoIdBytes.length;

    if (correlationIdBytes.length > 0) {
      this.encodeUint8.set(correlationIdBytes, offset);
      offset += correlationIdBytes.length;
    }

    this.encodeUint8.set(entriesBytes, offset);
    offset += entriesBytes.length;

    // Calculate and write checksum (over entire message except checksum field)
    const checksumData = new Uint8Array(this.encodeBuffer, 0, offset);
    const checksum = crc32(checksumData);
    this.encodeView.setUint32(36, checksum, true);

    return this.encodeBuffer.slice(0, offset);
  }

  /**
   * Encode WAL entries to binary format
   */
  private encodeEntries(entries: WalEntry[]): ArrayBuffer {
    // Estimate size: 4 bytes count + entries
    let estimatedSize = 4;
    for (const entry of entries) {
      estimatedSize += 64; // Header estimate
      estimatedSize += textEncoder.encode(entry.table).length;
      estimatedSize += textEncoder.encode(entry.rowId).length;
      if (entry.before)
        estimatedSize += textEncoder.encode(JSON.stringify(entry.before)).length;
      if (entry.after)
        estimatedSize += textEncoder.encode(JSON.stringify(entry.after)).length;
    }

    const buffer = new ArrayBuffer(estimatedSize * 2); // 2x safety margin
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);
    let offset = 0;

    // Entry count
    view.setUint32(offset, entries.length, true);
    offset += 4;

    for (const entry of entries) {
      const tableBytes = textEncoder.encode(entry.table);
      const rowIdBytes = textEncoder.encode(entry.rowId);
      const beforeBytes = entry.before
        ? textEncoder.encode(JSON.stringify(entry.before))
        : new Uint8Array(0);
      const afterBytes = entry.after
        ? textEncoder.encode(JSON.stringify(entry.after))
        : new Uint8Array(0);

      // Entry header
      view.setBigUint64(offset, BigInt(entry.sequence), true);
      offset += 8;
      view.setBigUint64(offset, BigInt(entry.timestamp), true);
      offset += 8;
      view.setUint8(offset, WalOperationCode[entry.operation]);
      offset += 1;
      view.setUint16(offset, tableBytes.length, true);
      offset += 2;
      view.setUint16(offset, rowIdBytes.length, true);
      offset += 2;
      view.setUint32(offset, beforeBytes.length, true);
      offset += 4;
      view.setUint32(offset, afterBytes.length, true);
      offset += 4;

      // Entry data
      uint8.set(tableBytes, offset);
      offset += tableBytes.length;
      uint8.set(rowIdBytes, offset);
      offset += rowIdBytes.length;
      if (beforeBytes.length > 0) {
        uint8.set(beforeBytes, offset);
        offset += beforeBytes.length;
      }
      if (afterBytes.length > 0) {
        uint8.set(afterBytes, offset);
        offset += afterBytes.length;
      }
    }

    return buffer.slice(0, offset);
  }

  /**
   * Encode an ACK message to binary format
   *
   * ACK Binary Format:
   * - magic (2 bytes, offset 0-1)
   * - version (1 byte, offset 2)
   * - type (1 byte, offset 3)
   * - flags (1 byte, offset 4)
   * - reserved (3 bytes, offset 5-7)
   * - timestamp (8 bytes, offset 8-15)
   * - sequenceNumber (8 bytes, offset 16-23)
   * - status (1 byte, offset 24)
   * - [correlationIdLength (2 bytes, offset 25-26)] (if HAS_CORRELATION_ID)
   * - [correlationId (variable, offset 27+)] (if HAS_CORRELATION_ID)
   */
  encodeAck(message: AckMessage): ArrayBuffer {
    const correlationIdBytes = message.correlationId
      ? textEncoder.encode(message.correlationId)
      : new Uint8Array(0);

    const statusCode = this.statusToCode(message.status);
    // Base header is 25 bytes (0-24 inclusive for status byte)
    // With correlation ID: add 2 bytes for length + correlationIdBytes.length
    const totalSize = correlationIdBytes.length > 0
      ? 27 + correlationIdBytes.length
      : 25;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    // Header
    view.setUint16(0, MAGIC, true);
    view.setUint8(2, PROTOCOL_VERSION);
    view.setUint8(3, MessageTypeCode.ACK);
    view.setUint8(4, correlationIdBytes.length > 0 ? Flags.HAS_CORRELATION_ID : 0);
    // Reserved at 5-7
    view.setBigUint64(8, BigInt(message.timestamp), true);
    view.setBigUint64(16, BigInt(message.sequenceNumber), true);
    view.setUint8(24, statusCode);

    if (correlationIdBytes.length > 0) {
      view.setUint16(25, correlationIdBytes.length, true);
      uint8.set(correlationIdBytes, 27);
    }

    return buffer;
  }

  /**
   * Encode a NACK message to binary format
   */
  encodeNack(message: NackMessage): ArrayBuffer {
    const errorMessageBytes = textEncoder.encode(message.errorMessage);
    const correlationIdBytes = message.correlationId
      ? textEncoder.encode(message.correlationId)
      : new Uint8Array(0);

    const totalSize = 32 + errorMessageBytes.length + correlationIdBytes.length;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    view.setUint16(0, MAGIC, true);
    view.setUint8(2, PROTOCOL_VERSION);
    view.setUint8(3, MessageTypeCode.NACK);
    let flags = 0;
    if (correlationIdBytes.length > 0) flags |= Flags.HAS_CORRELATION_ID;
    view.setUint8(4, flags);
    view.setBigUint64(8, BigInt(message.timestamp), true);
    view.setBigUint64(16, BigInt(message.sequenceNumber), true);
    view.setUint8(24, this.nackReasonToCode(message.reason));
    view.setUint8(25, message.shouldRetry ? 1 : 0);
    view.setUint32(26, message.retryDelayMs ?? 0, true);
    view.setUint16(30, errorMessageBytes.length, true);

    let offset = 32;
    uint8.set(errorMessageBytes, offset);
    offset += errorMessageBytes.length;

    if (correlationIdBytes.length > 0) {
      view.setUint16(offset, correlationIdBytes.length, true);
      offset += 2;
      uint8.set(correlationIdBytes, offset);
    }

    return buffer;
  }

  // ===========================================================================
  // Binary Decoding
  // ===========================================================================

  /**
   * Decode a binary message
   */
  decode(buffer: ArrayBuffer): AnyRpcMessage {
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);

    // Verify magic number
    const magic = view.getUint16(0, true);
    if (magic !== MAGIC) {
      throw new ProtocolError(
        `Invalid magic number: 0x${magic.toString(16)}, expected 0x${MAGIC.toString(16)}`
      );
    }

    // Verify version
    const version = view.getUint8(2);
    if (version !== PROTOCOL_VERSION) {
      throw new ProtocolError(
        `Unsupported protocol version: ${version}, expected ${PROTOCOL_VERSION}`
      );
    }

    const messageType = view.getUint8(3);

    switch (messageType) {
      case MessageTypeCode.CDC_BATCH:
        return this.decodeCDCBatch(view, uint8);
      case MessageTypeCode.ACK:
        return this.decodeAck(view, uint8);
      case MessageTypeCode.NACK:
        return this.decodeNack(view, uint8);
      case MessageTypeCode.CONNECT:
        return this.decodeConnect(view, uint8);
      case MessageTypeCode.HEARTBEAT:
        return this.decodeHeartbeat(view, uint8);
      default:
        throw new ProtocolError(`Unknown message type: ${messageType}`);
    }
  }

  /**
   * Decode a CDC batch message from binary
   */
  private decodeCDCBatch(view: DataView, uint8: Uint8Array): CDCBatchMessage {
    const flags = view.getUint8(4);
    const timestamp = Number(view.getBigUint64(8, true));
    const sequenceNumber = Number(view.getBigUint64(16, true));
    const sourceDoIdLength = view.getUint16(24, true);
    const entryCount = view.getUint32(26, true);
    const payloadSize = view.getUint32(30, true);
    const correlationIdLength = view.getUint16(34, true);
    // Checksum at 36 (4 bytes) - could verify here

    let offset = HEADER_SIZE;

    const sourceDoId = textDecoder.decode(
      uint8.subarray(offset, offset + sourceDoIdLength)
    );
    offset += sourceDoIdLength;

    let correlationId: string | undefined;
    if (flags & Flags.HAS_CORRELATION_ID) {
      correlationId = textDecoder.decode(
        uint8.subarray(offset, offset + correlationIdLength)
      );
      offset += correlationIdLength;
    }

    const entriesBuffer = uint8.slice(offset, offset + payloadSize).buffer;
    const entries = this.decodeEntries(entriesBuffer, entryCount);

    const firstEntrySequence = entries.length > 0 ? entries[0].sequence : 0;
    const lastEntrySequence =
      entries.length > 0 ? entries[entries.length - 1].sequence : 0;

    return {
      type: 'cdc_batch',
      timestamp,
      correlationId,
      sourceDoId,
      entries,
      sequenceNumber,
      firstEntrySequence,
      lastEntrySequence,
      sizeBytes: payloadSize,
      isRetry: (flags & Flags.IS_RETRY) !== 0,
      retryCount: 0,
    };
  }

  /**
   * Decode WAL entries from binary
   */
  private decodeEntries(buffer: ArrayBuffer, expectedCount: number): WalEntry[] {
    const view = new DataView(buffer);
    const uint8 = new Uint8Array(buffer);
    const entries: WalEntry[] = [];
    let offset = 0;

    const count = view.getUint32(offset, true);
    offset += 4;

    if (count !== expectedCount) {
      throw new ProtocolError(
        `Entry count mismatch: header says ${expectedCount}, payload has ${count}`
      );
    }

    for (let i = 0; i < count; i++) {
      const sequence = Number(view.getBigUint64(offset, true));
      offset += 8;
      const timestamp = Number(view.getBigUint64(offset, true));
      offset += 8;
      const operationCode = view.getUint8(offset);
      offset += 1;
      const tableLength = view.getUint16(offset, true);
      offset += 2;
      const rowIdLength = view.getUint16(offset, true);
      offset += 2;
      const beforeLength = view.getUint32(offset, true);
      offset += 4;
      const afterLength = view.getUint32(offset, true);
      offset += 4;

      const table = textDecoder.decode(uint8.subarray(offset, offset + tableLength));
      offset += tableLength;
      const rowId = textDecoder.decode(uint8.subarray(offset, offset + rowIdLength));
      offset += rowIdLength;

      let before: unknown | undefined;
      if (beforeLength > 0) {
        const beforeJson = textDecoder.decode(
          uint8.subarray(offset, offset + beforeLength)
        );
        before = JSON.parse(beforeJson);
        offset += beforeLength;
      }

      let after: unknown | undefined;
      if (afterLength > 0) {
        const afterJson = textDecoder.decode(
          uint8.subarray(offset, offset + afterLength)
        );
        after = JSON.parse(afterJson);
        offset += afterLength;
      }

      entries.push({
        sequence,
        timestamp,
        operation: this.codeToOperation(operationCode),
        table,
        rowId,
        before,
        after,
      });
    }

    return entries;
  }

  /**
   * Decode an ACK message from binary
   */
  private decodeAck(view: DataView, uint8: Uint8Array): AckMessage {
    const flags = view.getUint8(4);
    const timestamp = Number(view.getBigUint64(8, true));
    const sequenceNumber = Number(view.getBigUint64(16, true));
    const statusCode = view.getUint8(24);

    let correlationId: string | undefined;
    if (flags & Flags.HAS_CORRELATION_ID) {
      const correlationIdLength = view.getUint16(25, true);
      correlationId = textDecoder.decode(
        uint8.subarray(27, 27 + correlationIdLength)
      );
    }

    return {
      type: 'ack',
      timestamp,
      correlationId,
      sequenceNumber,
      status: this.codeToStatus(statusCode),
    };
  }

  /**
   * Decode a NACK message from binary
   */
  private decodeNack(view: DataView, uint8: Uint8Array): NackMessage {
    const flags = view.getUint8(4);
    const timestamp = Number(view.getBigUint64(8, true));
    const sequenceNumber = Number(view.getBigUint64(16, true));
    const reasonCode = view.getUint8(24);
    const shouldRetry = view.getUint8(25) !== 0;
    const retryDelayMs = view.getUint32(26, true);
    const errorMessageLength = view.getUint16(30, true);

    let offset = 32;
    const errorMessage = textDecoder.decode(
      uint8.subarray(offset, offset + errorMessageLength)
    );
    offset += errorMessageLength;

    let correlationId: string | undefined;
    if (flags & Flags.HAS_CORRELATION_ID) {
      const correlationIdLength = view.getUint16(offset, true);
      offset += 2;
      correlationId = textDecoder.decode(
        uint8.subarray(offset, offset + correlationIdLength)
      );
    }

    return {
      type: 'nack',
      timestamp,
      correlationId,
      sequenceNumber,
      reason: this.codeToNackReason(reasonCode),
      errorMessage,
      shouldRetry,
      retryDelayMs: retryDelayMs > 0 ? retryDelayMs : undefined,
    };
  }

  /**
   * Decode a CONNECT message from binary
   */
  private decodeConnect(view: DataView, _uint8: Uint8Array): ConnectMessage {
    // Simplified - in production would have full binary format
    const timestamp = Number(view.getBigUint64(8, true));
    return {
      type: 'connect',
      timestamp,
      sourceDoId: '',
      lastAckSequence: 0,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        binaryProtocol: true,
        compression: false,
        batching: true,
        maxBatchSize: 1000,
        maxMessageSize: MAX_MESSAGE_SIZE,
      },
    };
  }

  /**
   * Decode a HEARTBEAT message from binary
   */
  private decodeHeartbeat(view: DataView, _uint8: Uint8Array): HeartbeatMessage {
    const timestamp = Number(view.getBigUint64(8, true));
    const lastAckSequence = Number(view.getBigUint64(16, true));
    return {
      type: 'heartbeat',
      timestamp,
      sourceDoId: '',
      lastAckSequence,
      pendingEntries: 0,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private statusToCode(
    status: AckMessage['status']
  ): number {
    const codes: Record<AckMessage['status'], number> = {
      ok: 0,
      buffered: 1,
      persisted: 2,
      duplicate: 3,
      fallback: 4,
    };
    return codes[status] ?? 0;
  }

  private codeToStatus(code: number): AckMessage['status'] {
    const statuses: AckMessage['status'][] = [
      'ok',
      'buffered',
      'persisted',
      'duplicate',
      'fallback',
    ];
    return statuses[code] ?? 'ok';
  }

  private nackReasonToCode(reason: NackMessage['reason']): number {
    const codes: Record<NackMessage['reason'], number> = {
      buffer_full: 0,
      rate_limited: 1,
      invalid_sequence: 2,
      invalid_format: 3,
      internal_error: 4,
      shutting_down: 5,
    };
    return codes[reason] ?? 4;
  }

  private codeToNackReason(code: number): NackMessage['reason'] {
    const reasons: NackMessage['reason'][] = [
      'buffer_full',
      'rate_limited',
      'invalid_sequence',
      'invalid_format',
      'internal_error',
      'shutting_down',
    ];
    return reasons[code] ?? 'internal_error';
  }

  private codeToOperation(code: number): WalOperation {
    switch (code) {
      case WalOperationCode.INSERT:
        return 'INSERT';
      case WalOperationCode.UPDATE:
        return 'UPDATE';
      case WalOperationCode.DELETE:
        return 'DELETE';
      default:
        throw new ProtocolError(`Invalid operation code: ${code}`);
    }
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/** Shared codec instance */
let sharedCodec: ProtocolCodec | null = null;

/**
 * Get the shared protocol codec instance
 */
export function getCodec(): ProtocolCodec {
  if (!sharedCodec) {
    sharedCodec = new ProtocolCodec();
  }
  return sharedCodec;
}

/**
 * Encode a message to binary or JSON based on type
 */
export function encodeMessage(
  message: AnyRpcMessage,
  binary: boolean = true
): ArrayBuffer | string {
  const codec = getCodec();

  if (!binary) {
    return codec.encodeJson(message);
  }

  if (isCDCBatchMessage(message)) {
    return codec.encodeCDCBatch(message);
  }
  if (isAckMessage(message)) {
    return codec.encodeAck(message);
  }
  if (isNackMessage(message)) {
    return codec.encodeNack(message);
  }

  // Fall back to JSON for less common message types
  return codec.encodeJson(message);
}

/**
 * Decode a message from binary or JSON
 */
export function decodeMessage(data: ArrayBuffer | string): AnyRpcMessage {
  const codec = getCodec();

  if (typeof data === 'string') {
    return codec.decodeJson(data);
  }

  // Check if it's binary by looking for magic number
  const view = new DataView(data);
  const magic = view.getUint16(0, true);

  if (magic === MAGIC) {
    return codec.decode(data);
  }

  // Try JSON decode
  const text = textDecoder.decode(data);
  return codec.decodeJson(text);
}

/**
 * Check if data is binary encoded
 */
export function isBinaryEncoded(data: ArrayBuffer | string): boolean {
  if (typeof data === 'string') return false;
  if (data.byteLength < 2) return false;
  const view = new DataView(data);
  return view.getUint16(0, true) === MAGIC;
}

// =============================================================================
// CDC Event Frame Functions (for test compatibility)
// =============================================================================

/** Maximum frame size (16MB) */
const MAX_FRAME_SIZE = 16 * 1024 * 1024;

/** Frame header size */
const FRAME_HEADER_SIZE = 16;

/**
 * CDC Event structure as expected by tests
 */
export interface CDCEvent {
  type: 'cdc_event';
  operation: string;
  table: string;
  rowId: string;
  timestamp: number;
  sequence: number;
  before?: unknown;
  after?: unknown;
}

/**
 * Encode a CDC event to a binary frame
 *
 * Frame format:
 * - magic (2 bytes): 0xEDB0
 * - version (1 byte): 1
 * - reserved (1 byte)
 * - payload length (4 bytes, uint32 LE)
 * - checksum (4 bytes, uint32 CRC32)
 * - reserved (4 bytes)
 * - payload (variable JSON)
 */
export function encodeFrame(event: CDCEvent): ArrayBuffer {
  // Encode payload as JSON
  const payloadJson = JSON.stringify(event);
  const payloadBytes = textEncoder.encode(payloadJson);

  // Check size limit
  const totalSize = FRAME_HEADER_SIZE + payloadBytes.length;
  if (totalSize > MAX_FRAME_SIZE) {
    throw new ProtocolError(
      `Frame size ${totalSize} exceeds maximum size ${MAX_FRAME_SIZE}`
    );
  }

  // Allocate buffer
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  // Write header
  view.setUint16(0, EVODB_MAGIC, true); // magic
  view.setUint8(2, PROTOCOL_VERSION); // version
  view.setUint8(3, 0); // reserved
  view.setUint32(4, payloadBytes.length, true); // payload length
  // checksum at offset 8, computed below
  // reserved at offset 12

  // Write payload
  uint8.set(payloadBytes, FRAME_HEADER_SIZE);

  // Compute and write checksum (over header + payload, excluding checksum field)
  const checksumInput = new Uint8Array(buffer);
  // Zero out checksum field before computing
  view.setUint32(8, 0, true);
  const checksum = crc32(checksumInput);
  view.setUint32(8, checksum, true);

  return buffer;
}

/**
 * Decode a binary frame back to a CDC event
 */
export function decodeFrame(buffer: ArrayBuffer): CDCEvent {
  if (buffer.byteLength < FRAME_HEADER_SIZE) {
    throw new ProtocolError('Frame too small');
  }

  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  // Verify magic
  const magic = view.getUint16(0, true);
  if (magic !== EVODB_MAGIC) {
    throw new ProtocolError(
      `Invalid magic number: 0x${magic.toString(16)}, expected 0x${EVODB_MAGIC.toString(16)}`
    );
  }

  // Verify version
  const version = view.getUint8(2);
  if (version !== PROTOCOL_VERSION) {
    throw new ProtocolError(
      `Unsupported protocol version: ${version}`
    );
  }

  const payloadLength = view.getUint32(4, true);
  const storedChecksum = view.getUint32(8, true);

  // Verify buffer size
  if (buffer.byteLength < FRAME_HEADER_SIZE + payloadLength) {
    throw new ProtocolError('Frame truncated');
  }

  // Verify checksum
  const checksumBuffer = buffer.slice(0);
  const checksumView = new DataView(checksumBuffer);
  checksumView.setUint32(8, 0, true); // Zero checksum field
  const computedChecksum = crc32(new Uint8Array(checksumBuffer));
  if (computedChecksum !== storedChecksum) {
    throw new ProtocolError(
      `Checksum mismatch: expected ${storedChecksum}, got ${computedChecksum}`
    );
  }

  // Decode payload
  const payloadBytes = uint8.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + payloadLength);
  const payloadJson = textDecoder.decode(payloadBytes);
  return JSON.parse(payloadJson) as CDCEvent;
}

/**
 * Encode a batch of CDC events to a single binary frame
 *
 * Batch frame format:
 * - magic (2 bytes): 0xEDB0
 * - version (1 byte): 1
 * - type (1 byte): 0x10 (batch)
 * - reserved (4 bytes)
 * - entry count (4 bytes, uint32 LE) at offset 8
 * - payload length (4 bytes, uint32 LE)
 * - checksum (4 bytes, uint32 CRC32)
 * - payload (variable JSON array)
 */
export function encodeBatch(events: CDCEvent[]): ArrayBuffer {
  const BATCH_HEADER_SIZE = 20;

  // Encode payload as JSON array
  const payloadJson = JSON.stringify(events);
  const payloadBytes = textEncoder.encode(payloadJson);

  // Check size limit
  const totalSize = BATCH_HEADER_SIZE + payloadBytes.length;
  if (totalSize > MAX_FRAME_SIZE) {
    throw new ProtocolError(
      `Batch size ${totalSize} exceeds maximum size ${MAX_FRAME_SIZE}`
    );
  }

  // Allocate buffer
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  // Write header
  view.setUint16(0, EVODB_MAGIC, true); // magic
  view.setUint8(2, PROTOCOL_VERSION); // version
  view.setUint8(3, 0x10); // type: batch
  view.setUint32(4, 0, true); // reserved
  view.setUint32(8, events.length, true); // entry count
  view.setUint32(12, payloadBytes.length, true); // payload length
  // checksum at offset 16

  // Write payload
  uint8.set(payloadBytes, BATCH_HEADER_SIZE);

  // Compute and write checksum
  view.setUint32(16, 0, true);
  const checksum = crc32(new Uint8Array(buffer));
  view.setUint32(16, checksum, true);

  return buffer;
}
