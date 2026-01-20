/**
 * Protocol Codec Tests
 *
 * Tests for the binary and JSON encoding/decoding of RPC messages.
 * Covers:
 * 1. CDC batch message encoding/decoding
 * 2. ACK/NACK message encoding/decoding
 * 3. JSON fallback encoding
 * 4. CRC32 checksum validation
 * 5. Error handling for malformed data
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProtocolCodec,
  getCodec,
  encodeMessage,
  decodeMessage,
  isBinaryEncoded,
  encodeFrame,
  decodeFrame,
  encodeBatch,
  type CDCEvent,
} from '../protocol.js';
import type {
  CDCBatchMessage,
  AckMessage,
  NackMessage,
  WalEntry,
  ConnectMessage,
  HeartbeatMessage,
  FlushRequestMessage,
  StatusMessage,
} from '../types.js';

// =============================================================================
// Helper Functions
// =============================================================================

function createWalEntry(sequence: number, operation: 'INSERT' | 'UPDATE' | 'DELETE' = 'INSERT'): WalEntry {
  return {
    sequence,
    timestamp: Date.now(),
    operation,
    table: 'test_table',
    rowId: `row-${sequence}`,
    before: operation !== 'INSERT' ? { id: `row-${sequence}`, value: 'old' } : undefined,
    after: operation !== 'DELETE' ? { id: `row-${sequence}`, value: 'new' } : undefined,
  };
}

function createCDCBatchMessage(entries: WalEntry[], sequenceNumber: number = 1): CDCBatchMessage {
  return {
    type: 'cdc_batch',
    timestamp: Date.now(),
    correlationId: 'corr-123',
    sourceDoId: 'source-do-abc123',
    sourceShardName: 'shard-1',
    entries,
    sequenceNumber,
    firstEntrySequence: entries.length > 0 ? entries[0].sequence : 0,
    lastEntrySequence: entries.length > 0 ? entries[entries.length - 1].sequence : 0,
    sizeBytes: 1024,
    isRetry: false,
    retryCount: 0,
  };
}

// =============================================================================
// 1. PROTOCOL CODEC CLASS TESTS
// =============================================================================

describe('ProtocolCodec', () => {
  let codec: ProtocolCodec;

  beforeEach(() => {
    codec = new ProtocolCodec();
  });

  describe('JSON Encoding', () => {
    it('should encode a CDC batch message to JSON', () => {
      const message = createCDCBatchMessage([createWalEntry(1)]);
      const json = codec.encodeJson(message);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.type).toBe('cdc_batch');
      expect(parsed.sourceDoId).toBe('source-do-abc123');
    });

    it('should decode a CDC batch message from JSON', () => {
      const message = createCDCBatchMessage([createWalEntry(1)]);
      const json = codec.encodeJson(message);
      const decoded = codec.decodeJson(json);

      expect(decoded.type).toBe('cdc_batch');
      expect((decoded as CDCBatchMessage).sourceDoId).toBe('source-do-abc123');
    });

    it('should throw on invalid JSON message without type field', () => {
      expect(() => codec.decodeJson('{"foo": "bar"}')).toThrow(/missing type field/i);
    });

    it('should throw on non-object JSON', () => {
      expect(() => codec.decodeJson('"just a string"')).toThrow(/missing type field/i);
    });

    it('should throw on null JSON', () => {
      expect(() => codec.decodeJson('null')).toThrow(/missing type field/i);
    });
  });

  describe('Binary CDC Batch Encoding', () => {
    it('should encode a CDC batch message to binary', () => {
      const entries = [createWalEntry(1), createWalEntry(2)];
      const message = createCDCBatchMessage(entries);

      const buffer = codec.encodeCDCBatch(message);

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(40); // Header is 40 bytes
    });

    it('should encode CDC batch with INSERT operations', () => {
      const entries = [createWalEntry(1, 'INSERT')];
      const message = createCDCBatchMessage(entries);
      const buffer = codec.encodeCDCBatch(message);

      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it('should encode CDC batch with UPDATE operations', () => {
      const entries = [createWalEntry(1, 'UPDATE')];
      const message = createCDCBatchMessage(entries);
      const buffer = codec.encodeCDCBatch(message);

      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it('should encode CDC batch with DELETE operations', () => {
      const entries = [createWalEntry(1, 'DELETE')];
      const message = createCDCBatchMessage(entries);
      const buffer = codec.encodeCDCBatch(message);

      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it('should encode and decode CDC batch with empty entries', () => {
      const message = createCDCBatchMessage([]);
      const buffer = codec.encodeCDCBatch(message);
      const decoded = codec.decode(buffer) as CDCBatchMessage;

      expect(decoded.type).toBe('cdc_batch');
      expect(decoded.entries).toHaveLength(0);
    });

    it('should encode CDC batch with retry flag', () => {
      const message: CDCBatchMessage = {
        ...createCDCBatchMessage([createWalEntry(1)]),
        isRetry: true,
        retryCount: 3,
      };

      const buffer = codec.encodeCDCBatch(message);
      const decoded = codec.decode(buffer) as CDCBatchMessage;

      expect(decoded.isRetry).toBe(true);
    });

    it('should encode CDC batch without correlation ID', () => {
      const message = createCDCBatchMessage([createWalEntry(1)]);
      delete message.correlationId;

      const buffer = codec.encodeCDCBatch(message);
      const decoded = codec.decode(buffer) as CDCBatchMessage;

      expect(decoded.correlationId).toBeUndefined();
    });

    it('should reject messages exceeding max size', () => {
      // Create a huge payload
      const hugeData = 'x'.repeat(17 * 1024 * 1024);
      const entries: WalEntry[] = [{
        sequence: 1,
        timestamp: Date.now(),
        operation: 'INSERT',
        table: 'test',
        rowId: 'row-1',
        after: { data: hugeData },
      }];
      const message = createCDCBatchMessage(entries);

      expect(() => codec.encodeCDCBatch(message)).toThrow(/exceeds maximum/i);
    });
  });

  describe('Binary ACK Encoding', () => {
    it('should encode ACK message', () => {
      const message: AckMessage = {
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 42,
        status: 'ok',
      };

      const buffer = codec.encodeAck(message);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(25);
    });

    it('should encode ACK message with correlation ID', () => {
      const message: AckMessage = {
        type: 'ack',
        timestamp: Date.now(),
        correlationId: 'corr-456',
        sequenceNumber: 42,
        status: 'buffered',
      };

      const buffer = codec.encodeAck(message);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(27 + 8); // 27 base + 'corr-456'.length
    });
  });

  describe('Binary NACK Encoding', () => {
    it('should encode NACK with different reasons (without correlation ID)', () => {
      const reasons: NackMessage['reason'][] = [
        'buffer_full',
        'rate_limited',
        'invalid_sequence',
        'invalid_format',
        'internal_error',
        'shutting_down',
      ];

      for (const reason of reasons) {
        const message: NackMessage = {
          type: 'nack',
          timestamp: Date.now(),
          sequenceNumber: 1,
          reason,
          errorMessage: `Error: ${reason}`,
          shouldRetry: reason !== 'invalid_format',
        };

        const buffer = codec.encodeNack(message);
        const decoded = codec.decode(buffer) as NackMessage;

        expect(decoded.reason).toBe(reason);
      }
    });

    it('should encode NACK without retry delay', () => {
      const message: NackMessage = {
        type: 'nack',
        timestamp: Date.now(),
        sequenceNumber: 1,
        reason: 'internal_error',
        errorMessage: 'Something went wrong',
        shouldRetry: false,
      };

      const buffer = codec.encodeNack(message);
      const decoded = codec.decode(buffer) as NackMessage;

      expect(decoded.retryDelayMs).toBeUndefined();
    });
  });

  describe('Binary Decoding Errors', () => {
    it('should reject buffer with wrong magic number', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, 0xDEAD, true); // Wrong magic

      expect(() => codec.decode(buffer)).toThrow(/invalid magic/i);
    });

    it('should reject buffer with unsupported version', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, 0xCDC2, true); // Correct magic
      view.setUint8(2, 255); // Invalid version

      expect(() => codec.decode(buffer)).toThrow(/unsupported.*version/i);
    });

    it('should reject buffer with unknown message type', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, 0xCDC2, true); // Correct magic
      view.setUint8(2, 1); // Version 1
      view.setUint8(3, 0xFF); // Unknown message type

      expect(() => codec.decode(buffer)).toThrow(/unknown message type/i);
    });
  });
});

// =============================================================================
// 2. SHARED CODEC AND CONVENIENCE FUNCTIONS
// =============================================================================

describe('Shared Codec Functions', () => {
  describe('getCodec', () => {
    it('should return a shared codec instance', () => {
      const codec1 = getCodec();
      const codec2 = getCodec();

      expect(codec1).toBe(codec2);
      expect(codec1).toBeInstanceOf(ProtocolCodec);
    });
  });

  describe('encodeMessage', () => {
    it('should encode CDC batch to binary by default', () => {
      const message = createCDCBatchMessage([createWalEntry(1)]);
      const encoded = encodeMessage(message);

      expect(encoded).toBeInstanceOf(ArrayBuffer);
    });

    it('should encode CDC batch to JSON when binary=false', () => {
      const message = createCDCBatchMessage([createWalEntry(1)]);
      const encoded = encodeMessage(message, false);

      expect(typeof encoded).toBe('string');
    });

    it('should encode ACK to binary', () => {
      const message: AckMessage = {
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 1,
        status: 'persisted',
      };
      const encoded = encodeMessage(message);

      expect(encoded).toBeInstanceOf(ArrayBuffer);
    });

    it('should encode NACK to binary', () => {
      const message: NackMessage = {
        type: 'nack',
        timestamp: Date.now(),
        sequenceNumber: 1,
        reason: 'buffer_full',
        errorMessage: 'Buffer full',
        shouldRetry: true,
      };
      const encoded = encodeMessage(message);

      expect(encoded).toBeInstanceOf(ArrayBuffer);
    });

    it('should fallback to JSON for connect messages', () => {
      const message: ConnectMessage = {
        type: 'connect',
        timestamp: Date.now(),
        sourceDoId: 'source-1',
        lastAckSequence: 0,
        protocolVersion: 1,
        capabilities: {
          binaryProtocol: true,
          compression: false,
          batching: true,
          maxBatchSize: 1000,
          maxMessageSize: 4 * 1024 * 1024,
        },
      };
      const encoded = encodeMessage(message);

      // Connect messages fall back to JSON
      expect(typeof encoded).toBe('string');
    });

    it('should fallback to JSON for heartbeat messages', () => {
      const message: HeartbeatMessage = {
        type: 'heartbeat',
        timestamp: Date.now(),
        sourceDoId: 'source-1',
        lastAckSequence: 42,
        pendingEntries: 10,
      };
      const encoded = encodeMessage(message);

      expect(typeof encoded).toBe('string');
    });

    it('should fallback to JSON for flush request messages', () => {
      const message: FlushRequestMessage = {
        type: 'flush_request',
        timestamp: Date.now(),
        sourceDoId: 'source-1',
        reason: 'manual',
      };
      const encoded = encodeMessage(message);

      expect(typeof encoded).toBe('string');
    });
  });

  describe('decodeMessage', () => {
    it('should decode binary CDC batch message', () => {
      const original = createCDCBatchMessage([createWalEntry(1)]);
      const encoded = encodeMessage(original) as ArrayBuffer;
      const decoded = decodeMessage(encoded);

      expect(decoded.type).toBe('cdc_batch');
    });

    it('should decode JSON string message', () => {
      const message: StatusMessage = {
        type: 'status',
        timestamp: Date.now(),
        state: 'idle',
        buffer: {
          batchCount: 0,
          entryCount: 0,
          totalSizeBytes: 0,
          utilization: 0,
        },
        connectedChildren: 0,
      };
      const json = JSON.stringify(message);
      const decoded = decodeMessage(json);

      expect(decoded.type).toBe('status');
    });

    it('should decode ArrayBuffer containing JSON', () => {
      const message = { type: 'status', timestamp: Date.now() };
      const json = JSON.stringify(message);
      const encoder = new TextEncoder();
      const buffer = encoder.encode(json).buffer;

      const decoded = decodeMessage(buffer);
      expect(decoded.type).toBe('status');
    });
  });

  describe('isBinaryEncoded', () => {
    it('should return false for string data', () => {
      expect(isBinaryEncoded('{"type": "test"}')).toBe(false);
    });

    it('should return false for small ArrayBuffer', () => {
      const buffer = new ArrayBuffer(1);
      expect(isBinaryEncoded(buffer)).toBe(false);
    });

    it('should return true for binary encoded message', () => {
      const message = createCDCBatchMessage([createWalEntry(1)]);
      const encoded = encodeMessage(message) as ArrayBuffer;
      expect(isBinaryEncoded(encoded)).toBe(true);
    });

    it('should return false for JSON ArrayBuffer', () => {
      const json = '{"type": "test"}';
      const encoder = new TextEncoder();
      const buffer = encoder.encode(json).buffer;
      expect(isBinaryEncoded(buffer)).toBe(false);
    });
  });
});

// =============================================================================
// 3. CDC EVENT FRAME FUNCTIONS
// =============================================================================

describe('CDC Event Frames', () => {
  describe('encodeFrame', () => {
    it('should encode CDC event to binary frame', () => {
      const event: CDCEvent = {
        type: 'cdc_event',
        operation: 'INSERT',
        table: 'users',
        rowId: 'user-1',
        timestamp: Date.now(),
        sequence: 1,
        after: { id: 'user-1', name: 'Alice' },
      };

      const frame = encodeFrame(event);

      expect(frame).toBeInstanceOf(ArrayBuffer);
      expect(frame.byteLength).toBeGreaterThan(16); // Header is 16 bytes
    });

    it('should include EvoDB magic number', () => {
      const event: CDCEvent = {
        type: 'cdc_event',
        operation: 'INSERT',
        table: 'test',
        rowId: 'row-1',
        timestamp: Date.now(),
        sequence: 1,
      };

      const frame = encodeFrame(event);
      const view = new DataView(frame);
      expect(view.getUint16(0, true)).toBe(0xEDB0);
    });

    it('should reject events exceeding 16MB', () => {
      const event: CDCEvent = {
        type: 'cdc_event',
        operation: 'INSERT',
        table: 'test',
        rowId: 'row-1',
        timestamp: Date.now(),
        sequence: 1,
        after: { data: 'x'.repeat(17 * 1024 * 1024) },
      };

      expect(() => encodeFrame(event)).toThrow(/exceeds.*maximum/i);
    });
  });

  describe('decodeFrame', () => {
    it('should decode frame back to CDC event', () => {
      const original: CDCEvent = {
        type: 'cdc_event',
        operation: 'UPDATE',
        table: 'products',
        rowId: 'prod-123',
        timestamp: Date.now(),
        sequence: 42,
        before: { price: 100 },
        after: { price: 150 },
      };

      const frame = encodeFrame(original);
      const decoded = decodeFrame(frame);

      expect(decoded.operation).toBe(original.operation);
      expect(decoded.table).toBe(original.table);
      expect(decoded.rowId).toBe(original.rowId);
      expect(decoded.sequence).toBe(original.sequence);
      expect(decoded.before).toEqual(original.before);
      expect(decoded.after).toEqual(original.after);
    });

    it('should reject frame that is too small', () => {
      const buffer = new ArrayBuffer(10);
      expect(() => decodeFrame(buffer)).toThrow(/too small/i);
    });

    it('should reject frame with invalid magic', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, 0xDEAD, true);

      expect(() => decodeFrame(buffer)).toThrow(/invalid.*magic/i);
    });

    it('should reject frame with unsupported version', () => {
      const buffer = new ArrayBuffer(64);
      const view = new DataView(buffer);
      view.setUint16(0, 0xEDB0, true);
      view.setUint8(2, 255);

      expect(() => decodeFrame(buffer)).toThrow(/unsupported.*version/i);
    });

    it('should reject truncated frame', () => {
      const event: CDCEvent = {
        type: 'cdc_event',
        operation: 'INSERT',
        table: 'test',
        rowId: 'row-1',
        timestamp: Date.now(),
        sequence: 1,
        after: { data: 'some data here' },
      };

      const frame = encodeFrame(event);
      // Truncate the frame
      const truncated = frame.slice(0, 20);

      expect(() => decodeFrame(truncated)).toThrow(/truncated/i);
    });

    it('should reject frame with corrupted checksum', () => {
      const event: CDCEvent = {
        type: 'cdc_event',
        operation: 'INSERT',
        table: 'test',
        rowId: 'row-1',
        timestamp: Date.now(),
        sequence: 1,
        after: { data: 'test' },
      };

      const frame = encodeFrame(event);
      const uint8 = new Uint8Array(frame);
      // Corrupt some data
      uint8[20] = uint8[20] ^ 0xFF;

      expect(() => decodeFrame(frame)).toThrow(/checksum/i);
    });
  });

  describe('encodeBatch', () => {
    it('should encode batch of events', () => {
      const events: CDCEvent[] = Array.from({ length: 10 }, (_, i) => ({
        type: 'cdc_event',
        operation: 'INSERT',
        table: 'events',
        rowId: `event-${i}`,
        timestamp: Date.now(),
        sequence: i,
        after: { id: `event-${i}` },
      }));

      const frame = encodeBatch(events);

      expect(frame).toBeInstanceOf(ArrayBuffer);
      const view = new DataView(frame);
      expect(view.getUint16(0, true)).toBe(0xEDB0);
      expect(view.getUint32(8, true)).toBe(10); // Entry count
    });

    it('should encode empty batch', () => {
      const frame = encodeBatch([]);

      expect(frame).toBeInstanceOf(ArrayBuffer);
      const view = new DataView(frame);
      expect(view.getUint32(8, true)).toBe(0);
    });

    it('should reject batch exceeding 16MB', () => {
      const events: CDCEvent[] = [{
        type: 'cdc_event',
        operation: 'INSERT',
        table: 'test',
        rowId: 'row-1',
        timestamp: Date.now(),
        sequence: 1,
        after: { data: 'x'.repeat(17 * 1024 * 1024) },
      }];

      expect(() => encodeBatch(events)).toThrow(/exceeds.*maximum/i);
    });
  });
});

// =============================================================================
// 4. ROUNDTRIP TESTS
// =============================================================================

describe('Roundtrip Encoding', () => {
  let codec: ProtocolCodec;

  beforeEach(() => {
    codec = new ProtocolCodec();
  });

  it('should roundtrip CDC batch with multiple entries', () => {
    const entries = [
      createWalEntry(1, 'INSERT'),
      createWalEntry(2, 'UPDATE'),
      createWalEntry(3, 'DELETE'),
    ];
    const original = createCDCBatchMessage(entries, 100);

    const buffer = codec.encodeCDCBatch(original);
    const decoded = codec.decode(buffer) as CDCBatchMessage;

    expect(decoded.type).toBe(original.type);
    expect(decoded.sourceDoId).toBe(original.sourceDoId);
    expect(decoded.sequenceNumber).toBe(original.sequenceNumber);
    expect(decoded.entries).toHaveLength(original.entries.length);

    for (let i = 0; i < decoded.entries.length; i++) {
      expect(decoded.entries[i].sequence).toBe(original.entries[i].sequence);
      expect(decoded.entries[i].operation).toBe(original.entries[i].operation);
      expect(decoded.entries[i].table).toBe(original.entries[i].table);
      expect(decoded.entries[i].rowId).toBe(original.entries[i].rowId);
    }
  });

  it('should roundtrip ACK message', () => {
    const original: AckMessage = {
      type: 'ack',
      timestamp: Date.now(),
      sequenceNumber: 50,
      status: 'buffered',
    };

    const buffer = codec.encodeAck(original);
    const decoded = codec.decode(buffer) as AckMessage;

    expect(decoded.type).toBe(original.type);
    expect(decoded.sequenceNumber).toBe(original.sequenceNumber);
    expect(decoded.status).toBe(original.status);
  });

  it('should roundtrip ACK message with correlation ID', () => {
    const original: AckMessage = {
      type: 'ack',
      timestamp: Date.now(),
      correlationId: 'test-corr-id',
      sequenceNumber: 75,
      status: 'persisted',
    };

    const buffer = codec.encodeAck(original);
    const decoded = codec.decode(buffer) as AckMessage;

    expect(decoded.type).toBe(original.type);
    expect(decoded.correlationId).toBe(original.correlationId);
    expect(decoded.sequenceNumber).toBe(original.sequenceNumber);
    expect(decoded.status).toBe(original.status);
  });

  it('should roundtrip NACK message without correlation ID', () => {
    const original: NackMessage = {
      type: 'nack',
      timestamp: Date.now(),
      sequenceNumber: 100,
      reason: 'internal_error',
      errorMessage: 'Server error',
      shouldRetry: false,
    };

    const buffer = codec.encodeNack(original);
    const decoded = codec.decode(buffer) as NackMessage;

    expect(decoded.type).toBe(original.type);
    expect(decoded.sequenceNumber).toBe(original.sequenceNumber);
    expect(decoded.reason).toBe(original.reason);
    expect(decoded.errorMessage).toBe(original.errorMessage);
    expect(decoded.shouldRetry).toBe(original.shouldRetry);
  });

  it('should roundtrip CDC event frame', () => {
    const original: CDCEvent = {
      type: 'cdc_event',
      operation: 'UPDATE',
      table: 'complex_table',
      rowId: 'complex-row-id-with-special-chars-\u4e2d\u6587',
      timestamp: Date.now(),
      sequence: 12345,
      before: { nested: { deep: { value: 'old' } } },
      after: { nested: { deep: { value: 'new' } }, array: [1, 2, 3] },
    };

    const frame = encodeFrame(original);
    const decoded = decodeFrame(frame);

    expect(decoded.type).toBe(original.type);
    expect(decoded.operation).toBe(original.operation);
    expect(decoded.table).toBe(original.table);
    expect(decoded.rowId).toBe(original.rowId);
    expect(decoded.sequence).toBe(original.sequence);
    expect(decoded.before).toEqual(original.before);
    expect(decoded.after).toEqual(original.after);
  });
});
