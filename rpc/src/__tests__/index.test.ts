/**
 * Index Exports Tests
 *
 * Tests that all exports from the main index module are accessible.
 */

import { describe, it, expect } from 'vitest';
import {
  // Types
  WalOperationCode,
  DEFAULT_PARENT_CONFIG,
  DEFAULT_CHILD_CONFIG,
  DEFAULT_CLIENT_CAPABILITIES,
  CapabilityFlags,
  encodeCapabilities,
  decodeCapabilities,

  // Errors
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
  generateBatchId,
  generateCorrelationId,

  // Protocol
  ProtocolCodec,
  getCodec,
  encodeMessage,
  decodeMessage,
  isBinaryEncoded,

  // Buffer
  CDCBufferManager,
  DEFAULT_DEDUP_CONFIG,

  // Client
  LakehouseRpcClient,
  createRpcClient,

  // Fallback
  FallbackStorage,
  FallbackRecoveryManager,
  DEFAULT_RECOVERY_CONFIG,
} from '../index.js';

describe('Index Exports', () => {
  describe('Types and Constants', () => {
    it('should export WalOperationCode', () => {
      expect(WalOperationCode).toBeDefined();
      expect(typeof WalOperationCode.INSERT).toBe('number');
    });

    it('should export default configs', () => {
      expect(DEFAULT_PARENT_CONFIG).toBeDefined();
      expect(DEFAULT_PARENT_CONFIG.flushThresholdEntries).toBeGreaterThan(0);

      expect(DEFAULT_CHILD_CONFIG).toBeDefined();
      expect(DEFAULT_CHILD_CONFIG.maxBatchSize).toBeGreaterThan(0);

      expect(DEFAULT_CLIENT_CAPABILITIES).toBeDefined();
      expect(DEFAULT_CLIENT_CAPABILITIES.binaryProtocol).toBe(true);
    });

    it('should export capability functions', () => {
      expect(CapabilityFlags).toBeDefined();
      expect(encodeCapabilities).toBeDefined();
      expect(decodeCapabilities).toBeDefined();
    });
  });

  describe('Error Classes', () => {
    it('should export all error classes', () => {
      expect(LakehouseRpcError).toBeDefined();
      expect(ConnectionError).toBeDefined();
      expect(BufferOverflowError).toBeDefined();
      expect(FlushError).toBeDefined();
      expect(ProtocolError).toBeDefined();
    });

    it('should be constructable error classes', () => {
      const error = new LakehouseRpcError('test', 'TEST');
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('TEST');
    });
  });

  describe('Type Guards', () => {
    it('should export all type guards', () => {
      expect(isCDCBatchMessage).toBeDefined();
      expect(isAckMessage).toBeDefined();
      expect(isNackMessage).toBeDefined();
      expect(isConnectMessage).toBeDefined();
      expect(isHeartbeatMessage).toBeDefined();
    });

    it('should export ID generation utilities', () => {
      expect(generateBatchId).toBeDefined();
      expect(generateCorrelationId).toBeDefined();

      const batchId = generateBatchId('source', 1);
      expect(typeof batchId).toBe('string');

      const corrId = generateCorrelationId();
      expect(typeof corrId).toBe('string');
    });
  });

  describe('Protocol', () => {
    it('should export ProtocolCodec', () => {
      expect(ProtocolCodec).toBeDefined();
      const codec = new ProtocolCodec();
      expect(codec).toBeInstanceOf(ProtocolCodec);
    });

    it('should export protocol utilities', () => {
      expect(getCodec).toBeDefined();
      expect(encodeMessage).toBeDefined();
      expect(decodeMessage).toBeDefined();
      expect(isBinaryEncoded).toBeDefined();
    });
  });

  describe('Buffer', () => {
    it('should export CDCBufferManager', () => {
      expect(CDCBufferManager).toBeDefined();
      const buffer = new CDCBufferManager();
      expect(buffer).toBeInstanceOf(CDCBufferManager);
    });

    it('should export dedup config', () => {
      expect(DEFAULT_DEDUP_CONFIG).toBeDefined();
      expect(DEFAULT_DEDUP_CONFIG.windowMs).toBeGreaterThan(0);
    });
  });

  describe('Client', () => {
    it('should export LakehouseRpcClient', () => {
      expect(LakehouseRpcClient).toBeDefined();
    });

    it('should export createRpcClient factory', () => {
      expect(createRpcClient).toBeDefined();
    });
  });

  describe('Fallback', () => {
    it('should export FallbackStorage', () => {
      expect(FallbackStorage).toBeDefined();
    });

    it('should export FallbackRecoveryManager', () => {
      expect(FallbackRecoveryManager).toBeDefined();
    });

    it('should export recovery config', () => {
      expect(DEFAULT_RECOVERY_CONFIG).toBeDefined();
      expect(DEFAULT_RECOVERY_CONFIG.maxRetries).toBeGreaterThan(0);
    });
  });
});
