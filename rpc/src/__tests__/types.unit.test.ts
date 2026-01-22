/**
 * Types and Utilities Tests
 *
 * Tests for type guards, error classes, and utility functions.
 * Covers:
 * 1. Error classes
 * 2. Type guards
 * 3. Capability encoding/decoding
 * 4. ID generation utilities
 */

import { describe, it, expect } from 'vitest';
import { ErrorCode, EvoDBError, NetworkError } from '@evodb/core';
import {
  // Error classes
  LakehouseRpcError,
  ConnectionError,
  BufferOverflowError,
  FlushError,
  ProtocolError,
  // Type guards
  isCDCBatchMessage,
  isAckMessage,
  isNackMessage,
  isConnectMessage,
  isHeartbeatMessage,
  // Capability encoding
  encodeCapabilities,
  decodeCapabilities,
  CapabilityFlags,
  // ID generation
  generateBatchId,
  generateCorrelationId,
  // Types
  type ClientCapabilities,
  type CDCBatchMessage,
  type AckMessage,
  type NackMessage,
  type ConnectMessage,
  type HeartbeatMessage,
  type FlushRequestMessage,
  type RpcMessage,
  // Constants
  DEFAULT_CLIENT_CAPABILITIES,
  DEFAULT_PARENT_CONFIG,
  DEFAULT_CHILD_CONFIG,
  WalOperationCode,
} from '../types.js';

// =============================================================================
// 1. ERROR CLASSES
// =============================================================================

describe('Error Classes', () => {
  describe('LakehouseRpcError', () => {
    it('should create error with message, code, and retryable flag', () => {
      const error = new LakehouseRpcError('Test error', 'TEST_ERROR', true);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('LakehouseRpcError');
      expect(error).toBeInstanceOf(Error);
    });

    it('should extend EvoDBError via NetworkError', () => {
      const error = new LakehouseRpcError('Test error', ErrorCode.RPC_ERROR);

      expect(error).toBeInstanceOf(EvoDBError);
      expect(error).toBeInstanceOf(NetworkError);
    });

    it('should default retryable to false', () => {
      const error = new LakehouseRpcError('Test', 'TEST');

      expect(error.retryable).toBe(false);
    });
  });

  describe('ConnectionError', () => {
    it('should have RPC_CONNECTION_ERROR code', () => {
      const error = new ConnectionError('Connection failed');

      expect(error.code).toBe(ErrorCode.RPC_CONNECTION_ERROR);
      expect(error.name).toBe('ConnectionError');
    });

    it('should extend EvoDBError', () => {
      const error = new ConnectionError('Connection failed');
      expect(error).toBeInstanceOf(EvoDBError);
    });

    it('should default retryable to true', () => {
      const error = new ConnectionError('Failed');

      expect(error.retryable).toBe(true);
    });

    it('should allow setting retryable to false', () => {
      const error = new ConnectionError('Fatal connection error', false);

      expect(error.retryable).toBe(false);
    });
  });

  describe('BufferOverflowError', () => {
    it('should have BUFFER_OVERFLOW code', () => {
      const error = new BufferOverflowError('Buffer full');

      expect(error.code).toBe(ErrorCode.BUFFER_OVERFLOW);
      expect(error.name).toBe('BufferOverflowError');
    });

    it('should extend EvoDBError', () => {
      const error = new BufferOverflowError('Buffer full');
      expect(error).toBeInstanceOf(EvoDBError);
    });

    it('should always be retryable', () => {
      const error = new BufferOverflowError('Buffer full');

      expect(error.retryable).toBe(true);
    });
  });

  describe('FlushError', () => {
    it('should have FLUSH_ERROR code', () => {
      const error = new FlushError('Flush failed', false);

      expect(error.code).toBe(ErrorCode.FLUSH_ERROR);
      expect(error.name).toBe('FlushError');
    });

    it('should extend EvoDBError', () => {
      const error = new FlushError('Flush failed', false);
      expect(error).toBeInstanceOf(EvoDBError);
    });

    it('should track usedFallback flag', () => {
      const errorNoFallback = new FlushError('R2 failed', false);
      expect(errorNoFallback.usedFallback).toBe(false);

      const errorWithFallback = new FlushError('R2 failed, used fallback', true);
      expect(errorWithFallback.usedFallback).toBe(true);
    });

    it('should always be retryable', () => {
      const error = new FlushError('Flush failed', false);

      expect(error.retryable).toBe(true);
    });
  });

  describe('ProtocolError', () => {
    it('should have PROTOCOL_ERROR code', () => {
      const error = new ProtocolError('Invalid message format');

      expect(error.code).toBe(ErrorCode.PROTOCOL_ERROR);
      expect(error.name).toBe('ProtocolError');
    });

    it('should extend EvoDBError', () => {
      const error = new ProtocolError('Invalid message format');
      expect(error).toBeInstanceOf(EvoDBError);
    });

    it('should never be retryable', () => {
      const error = new ProtocolError('Bad format');

      expect(error.retryable).toBe(false);
    });
  });
});

// =============================================================================
// 2. TYPE GUARDS
// =============================================================================

describe('Type Guards', () => {
  describe('isCDCBatchMessage', () => {
    it('should return true for CDC batch messages', () => {
      const message: CDCBatchMessage = {
        type: 'cdc_batch',
        timestamp: Date.now(),
        sourceDoId: 'source-1',
        entries: [],
        sequenceNumber: 1,
        firstEntrySequence: 0,
        lastEntrySequence: 0,
        sizeBytes: 0,
        isRetry: false,
        retryCount: 0,
      };

      expect(isCDCBatchMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      const ackMessage: AckMessage = {
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 1,
        status: 'ok',
      };

      expect(isCDCBatchMessage(ackMessage)).toBe(false);
    });
  });

  describe('isAckMessage', () => {
    it('should return true for ACK messages', () => {
      const message: AckMessage = {
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 42,
        status: 'ok',
      };

      expect(isAckMessage(message)).toBe(true);
    });

    it('should return false for non-ACK messages', () => {
      const nackMessage: NackMessage = {
        type: 'nack',
        timestamp: Date.now(),
        sequenceNumber: 1,
        reason: 'buffer_full',
        errorMessage: 'Full',
        shouldRetry: true,
      };

      expect(isAckMessage(nackMessage)).toBe(false);
    });
  });

  describe('isNackMessage', () => {
    it('should return true for NACK messages', () => {
      const message: NackMessage = {
        type: 'nack',
        timestamp: Date.now(),
        sequenceNumber: 1,
        reason: 'internal_error',
        errorMessage: 'Something wrong',
        shouldRetry: false,
      };

      expect(isNackMessage(message)).toBe(true);
    });

    it('should return false for non-NACK messages', () => {
      const ackMessage: AckMessage = {
        type: 'ack',
        timestamp: Date.now(),
        sequenceNumber: 1,
        status: 'ok',
      };

      expect(isNackMessage(ackMessage)).toBe(false);
    });
  });

  describe('isConnectMessage', () => {
    it('should return true for connect messages', () => {
      const message: ConnectMessage = {
        type: 'connect',
        timestamp: Date.now(),
        sourceDoId: 'source-1',
        lastAckSequence: 0,
        protocolVersion: 1,
        capabilities: DEFAULT_CLIENT_CAPABILITIES,
      };

      expect(isConnectMessage(message)).toBe(true);
    });

    it('should return false for non-connect messages', () => {
      const heartbeat: HeartbeatMessage = {
        type: 'heartbeat',
        timestamp: Date.now(),
        sourceDoId: 'source-1',
        lastAckSequence: 0,
        pendingEntries: 0,
      };

      expect(isConnectMessage(heartbeat)).toBe(false);
    });
  });

  describe('isHeartbeatMessage', () => {
    it('should return true for heartbeat messages', () => {
      const message: HeartbeatMessage = {
        type: 'heartbeat',
        timestamp: Date.now(),
        sourceDoId: 'source-1',
        lastAckSequence: 100,
        pendingEntries: 5,
      };

      expect(isHeartbeatMessage(message)).toBe(true);
    });

    it('should return false for non-heartbeat messages', () => {
      const flushRequest: FlushRequestMessage = {
        type: 'flush_request',
        timestamp: Date.now(),
        sourceDoId: 'source-1',
        reason: 'manual',
      };

      expect(isHeartbeatMessage(flushRequest)).toBe(false);
    });
  });
});

// =============================================================================
// 3. CAPABILITY ENCODING
// =============================================================================

describe('Capability Encoding', () => {
  describe('CapabilityFlags', () => {
    it('should have correct flag values', () => {
      expect(CapabilityFlags.BINARY_PROTOCOL).toBe(0x01);
      expect(CapabilityFlags.COMPRESSION).toBe(0x02);
      expect(CapabilityFlags.BATCHING).toBe(0x04);
    });
  });

  describe('encodeCapabilities', () => {
    it('should encode all capabilities enabled', () => {
      const caps: ClientCapabilities = {
        binaryProtocol: true,
        compression: true,
        batching: true,
        maxBatchSize: 1000,
        maxMessageSize: 4 * 1024 * 1024,
      };

      const flags = encodeCapabilities(caps);

      expect(flags & CapabilityFlags.BINARY_PROTOCOL).toBeTruthy();
      expect(flags & CapabilityFlags.COMPRESSION).toBeTruthy();
      expect(flags & CapabilityFlags.BATCHING).toBeTruthy();
      expect(flags).toBe(0x07); // All flags
    });

    it('should encode no capabilities', () => {
      const caps: ClientCapabilities = {
        binaryProtocol: false,
        compression: false,
        batching: false,
        maxBatchSize: 1000,
        maxMessageSize: 4 * 1024 * 1024,
      };

      const flags = encodeCapabilities(caps);

      expect(flags).toBe(0x00);
    });

    it('should encode partial capabilities', () => {
      const caps: ClientCapabilities = {
        binaryProtocol: true,
        compression: false,
        batching: true,
        maxBatchSize: 1000,
        maxMessageSize: 4 * 1024 * 1024,
      };

      const flags = encodeCapabilities(caps);

      expect(flags & CapabilityFlags.BINARY_PROTOCOL).toBeTruthy();
      expect(flags & CapabilityFlags.COMPRESSION).toBeFalsy();
      expect(flags & CapabilityFlags.BATCHING).toBeTruthy();
      expect(flags).toBe(0x05);
    });
  });

  describe('decodeCapabilities', () => {
    it('should decode all flags', () => {
      const decoded = decodeCapabilities(0x07);

      expect(decoded.binaryProtocol).toBe(true);
      expect(decoded.compression).toBe(true);
      expect(decoded.batching).toBe(true);
    });

    it('should decode no flags', () => {
      const decoded = decodeCapabilities(0x00);

      expect(decoded.binaryProtocol).toBe(false);
      expect(decoded.compression).toBe(false);
      expect(decoded.batching).toBe(false);
    });

    it('should decode partial flags', () => {
      const decoded = decodeCapabilities(0x03);

      expect(decoded.binaryProtocol).toBe(true);
      expect(decoded.compression).toBe(true);
      expect(decoded.batching).toBe(false);
    });

    it('should roundtrip encode/decode', () => {
      const original: ClientCapabilities = {
        binaryProtocol: true,
        compression: false,
        batching: true,
        maxBatchSize: 1000,
        maxMessageSize: 4 * 1024 * 1024,
      };

      const flags = encodeCapabilities(original);
      const decoded = decodeCapabilities(flags);

      expect(decoded.binaryProtocol).toBe(original.binaryProtocol);
      expect(decoded.compression).toBe(original.compression);
      expect(decoded.batching).toBe(original.batching);
    });
  });
});

// =============================================================================
// 4. ID GENERATION
// =============================================================================

describe('ID Generation', () => {
  describe('generateBatchId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateBatchId('source-123', 1);
      const id2 = generateBatchId('source-123', 2);

      expect(id1).not.toBe(id2);
    });

    it('should include source DO ID prefix', () => {
      const id = generateBatchId('source-abcdef123456', 42);

      expect(id.startsWith('source-a')).toBe(true);
    });

    it('should include sequence number', () => {
      const id = generateBatchId('source-123', 999);

      expect(id).toContain('999');
    });

    it('should generate string IDs', () => {
      const id = generateBatchId('test', 1);

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('generateCorrelationId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).not.toBe(id2);
    });

    it('should generate string IDs', () => {
      const id = generateCorrelationId();

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should contain underscore separator', () => {
      const id = generateCorrelationId();

      expect(id).toContain('_');
    });
  });
});

// =============================================================================
// 5. CONSTANTS AND DEFAULTS
// =============================================================================

describe('Constants', () => {
  describe('WalOperationCode', () => {
    it('should have correct operation codes', () => {
      expect(WalOperationCode.INSERT).toBe(0);
      expect(WalOperationCode.UPDATE).toBe(1);
      expect(WalOperationCode.DELETE).toBe(2);
    });
  });

  describe('DEFAULT_CLIENT_CAPABILITIES', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CLIENT_CAPABILITIES.binaryProtocol).toBe(true);
      expect(DEFAULT_CLIENT_CAPABILITIES.compression).toBe(false);
      expect(DEFAULT_CLIENT_CAPABILITIES.batching).toBe(true);
      expect(DEFAULT_CLIENT_CAPABILITIES.maxBatchSize).toBe(1000);
      expect(DEFAULT_CLIENT_CAPABILITIES.maxMessageSize).toBe(4 * 1024 * 1024);
    });
  });

  describe('DEFAULT_PARENT_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_PARENT_CONFIG.r2BucketName).toBe('lakehouse-data');
      expect(DEFAULT_PARENT_CONFIG.flushThresholdEntries).toBe(10000);
      expect(DEFAULT_PARENT_CONFIG.flushThresholdBytes).toBe(32 * 1024 * 1024);
      expect(DEFAULT_PARENT_CONFIG.flushThresholdMs).toBe(60000);
      expect(DEFAULT_PARENT_CONFIG.maxBufferSize).toBe(128 * 1024 * 1024);
      expect(DEFAULT_PARENT_CONFIG.enableFallback).toBe(true);
      expect(DEFAULT_PARENT_CONFIG.enableDeduplication).toBe(true);
      expect(DEFAULT_PARENT_CONFIG.deduplicationWindowMs).toBe(300000);
    });
  });

  describe('DEFAULT_CHILD_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CHILD_CONFIG.maxBatchSize).toBe(1000);
      expect(DEFAULT_CHILD_CONFIG.maxBatchBytes).toBe(4 * 1024 * 1024);
      expect(DEFAULT_CHILD_CONFIG.batchTimeoutMs).toBe(1000);
      expect(DEFAULT_CHILD_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_CHILD_CONFIG.autoReconnect).toBe(true);
      expect(DEFAULT_CHILD_CONFIG.heartbeatIntervalMs).toBe(30000);
    });
  });
});
