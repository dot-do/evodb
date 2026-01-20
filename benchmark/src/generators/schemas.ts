/**
 * @evodb/benchmark - Predefined Schemas
 *
 * Standard benchmark schemas including JSONBench-like data patterns.
 */

import type { DataSchema, ColumnDef } from '../types.js';

/**
 * JSONBench-inspired user activity schema
 * Based on realistic JSON document patterns (Bluesky-like social data)
 */
export const USER_ACTIVITY_SCHEMA: DataSchema = {
  name: 'user_activity',
  columns: [
    {
      name: 'id',
      type: 'uuid',
      nullable: false,
      primaryKey: true,
      generator: { type: 'sequential' },
    },
    {
      name: 'user_id',
      type: 'string',
      nullable: false,
      generator: { type: 'sequential', prefix: 'user_', cardinality: 100000 },
    },
    {
      name: 'timestamp',
      type: 'timestamp',
      nullable: false,
      partitionKey: true,
      generator: {
        type: 'sequential',
        min: Date.now() - 365 * 24 * 60 * 60 * 1000, // 1 year ago
        max: Date.now(),
      },
    },
    {
      name: 'event_type',
      type: 'string',
      nullable: false,
      generator: {
        type: 'zipf',
        values: ['post', 'like', 'repost', 'follow', 'unfollow', 'reply', 'quote', 'block', 'mute'],
        zipfSkew: 1.2,
      },
    },
    {
      name: 'content',
      type: 'string',
      nullable: true,
      generator: { type: 'random', lengthRange: [0, 300] },
    },
    {
      name: 'target_id',
      type: 'string',
      nullable: true,
      generator: { type: 'random', prefix: 'target_', cardinality: 500000 },
    },
    {
      name: 'metadata',
      type: 'json',
      nullable: true,
      generator: { type: 'random' },
    },
    {
      name: 'region',
      type: 'string',
      nullable: false,
      generator: {
        type: 'zipf',
        values: ['us-east', 'us-west', 'eu-west', 'eu-central', 'ap-south', 'ap-northeast'],
        zipfSkew: 0.8,
      },
    },
    {
      name: 'device_type',
      type: 'string',
      nullable: false,
      generator: {
        type: 'enum',
        values: ['mobile-ios', 'mobile-android', 'web', 'desktop', 'api'],
      },
    },
    {
      name: 'session_duration_ms',
      type: 'int64',
      nullable: true,
      generator: { type: 'gaussian', mean: 300000, stdDev: 150000 },
    },
  ],
};

/**
 * E-commerce events schema (ClickBench-inspired)
 */
export const ECOMMERCE_EVENTS_SCHEMA: DataSchema = {
  name: 'ecommerce_events',
  columns: [
    {
      name: 'event_id',
      type: 'uuid',
      nullable: false,
      primaryKey: true,
    },
    {
      name: 'event_time',
      type: 'timestamp',
      nullable: false,
      partitionKey: true,
    },
    {
      name: 'event_type',
      type: 'string',
      nullable: false,
      generator: {
        type: 'zipf',
        values: ['view', 'cart', 'purchase', 'remove_from_cart', 'search', 'wishlist'],
        zipfSkew: 1.5,
      },
    },
    {
      name: 'product_id',
      type: 'int64',
      nullable: false,
      generator: { type: 'zipf', min: 1, max: 1000000, zipfSkew: 1.0 },
    },
    {
      name: 'category_id',
      type: 'int64',
      nullable: false,
      generator: { type: 'uniform', min: 1, max: 1000 },
    },
    {
      name: 'brand',
      type: 'string',
      nullable: true,
      generator: { type: 'zipf', cardinality: 5000, zipfSkew: 1.2 },
    },
    {
      name: 'price',
      type: 'float64',
      nullable: false,
      generator: { type: 'gaussian', mean: 50, stdDev: 100 },
    },
    {
      name: 'user_id',
      type: 'int64',
      nullable: false,
      generator: { type: 'zipf', min: 1, max: 10000000, zipfSkew: 0.8 },
    },
    {
      name: 'user_session',
      type: 'string',
      nullable: false,
      generator: { type: 'random', lengthRange: [32, 32] },
    },
    {
      name: 'country',
      type: 'string',
      nullable: false,
      generator: {
        type: 'zipf',
        values: ['US', 'UK', 'DE', 'FR', 'JP', 'BR', 'IN', 'AU', 'CA', 'MX'],
        zipfSkew: 1.0,
      },
    },
    {
      name: 'city',
      type: 'string',
      nullable: true,
      generator: { type: 'zipf', cardinality: 10000, zipfSkew: 1.5 },
    },
    {
      name: 'device',
      type: 'string',
      nullable: false,
      generator: {
        type: 'enum',
        values: ['mobile', 'desktop', 'tablet'],
      },
    },
    {
      name: 'referrer',
      type: 'string',
      nullable: true,
      generator: {
        type: 'zipf',
        values: ['google', 'facebook', 'direct', 'email', 'affiliate', 'twitter', 'instagram'],
        zipfSkew: 1.3,
      },
    },
  ],
};

/**
 * IoT sensor data schema (time-series optimized)
 */
export const IOT_SENSOR_SCHEMA: DataSchema = {
  name: 'iot_sensors',
  columns: [
    {
      name: 'reading_id',
      type: 'uuid',
      nullable: false,
      primaryKey: true,
    },
    {
      name: 'timestamp',
      type: 'timestamp',
      nullable: false,
      partitionKey: true,
      generator: { type: 'sequential' },
    },
    {
      name: 'device_id',
      type: 'string',
      nullable: false,
      generator: { type: 'uniform', prefix: 'device_', cardinality: 10000 },
    },
    {
      name: 'sensor_type',
      type: 'string',
      nullable: false,
      generator: {
        type: 'enum',
        values: ['temperature', 'humidity', 'pressure', 'co2', 'motion', 'light'],
      },
    },
    {
      name: 'value',
      type: 'float64',
      nullable: false,
      generator: { type: 'gaussian', mean: 50, stdDev: 20 },
    },
    {
      name: 'unit',
      type: 'string',
      nullable: false,
      generator: {
        type: 'enum',
        values: ['celsius', 'percent', 'hpa', 'ppm', 'boolean', 'lux'],
      },
    },
    {
      name: 'location_id',
      type: 'string',
      nullable: false,
      generator: { type: 'uniform', prefix: 'loc_', cardinality: 1000 },
    },
    {
      name: 'floor',
      type: 'int32',
      nullable: true,
      generator: { type: 'uniform', min: 1, max: 50 },
    },
    {
      name: 'building',
      type: 'string',
      nullable: false,
      generator: { type: 'uniform', prefix: 'building_', cardinality: 100 },
    },
    {
      name: 'battery_level',
      type: 'float64',
      nullable: true,
      generator: { type: 'uniform', min: 0, max: 100 },
    },
    {
      name: 'signal_strength',
      type: 'int32',
      nullable: true,
      generator: { type: 'gaussian', mean: -70, stdDev: 15 },
    },
    {
      name: 'is_anomaly',
      type: 'bool',
      nullable: false,
      generator: { type: 'random' }, // ~1% anomaly rate
    },
  ],
};

/**
 * Log analytics schema (observability data)
 */
export const LOG_ANALYTICS_SCHEMA: DataSchema = {
  name: 'logs',
  columns: [
    {
      name: 'log_id',
      type: 'uuid',
      nullable: false,
      primaryKey: true,
    },
    {
      name: 'timestamp',
      type: 'timestamp',
      nullable: false,
      partitionKey: true,
    },
    {
      name: 'level',
      type: 'string',
      nullable: false,
      generator: {
        type: 'zipf',
        values: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
        zipfSkew: 2.0, // INFO is most common
      },
    },
    {
      name: 'service',
      type: 'string',
      nullable: false,
      generator: { type: 'uniform', prefix: 'svc-', cardinality: 50 },
    },
    {
      name: 'host',
      type: 'string',
      nullable: false,
      generator: { type: 'uniform', prefix: 'host-', cardinality: 500 },
    },
    {
      name: 'trace_id',
      type: 'string',
      nullable: true,
      generator: { type: 'random', lengthRange: [32, 32] },
    },
    {
      name: 'span_id',
      type: 'string',
      nullable: true,
      generator: { type: 'random', lengthRange: [16, 16] },
    },
    {
      name: 'message',
      type: 'string',
      nullable: false,
      generator: { type: 'random', lengthRange: [20, 500] },
    },
    {
      name: 'duration_ms',
      type: 'float64',
      nullable: true,
      generator: { type: 'gaussian', mean: 100, stdDev: 200 },
    },
    {
      name: 'status_code',
      type: 'int32',
      nullable: true,
      generator: {
        type: 'zipf',
        values: [200, 201, 204, 400, 401, 403, 404, 500, 502, 503],
        zipfSkew: 2.5, // 200 is most common
      },
    },
    {
      name: 'request_path',
      type: 'string',
      nullable: true,
      generator: { type: 'zipf', cardinality: 1000, zipfSkew: 1.5 },
    },
    {
      name: 'user_agent',
      type: 'string',
      nullable: true,
      generator: { type: 'zipf', cardinality: 100, zipfSkew: 1.2 },
    },
    {
      name: 'extra',
      type: 'json',
      nullable: true,
      generator: { type: 'random' },
    },
  ],
};

/**
 * Financial transactions schema
 */
export const FINANCIAL_TRANSACTIONS_SCHEMA: DataSchema = {
  name: 'transactions',
  columns: [
    {
      name: 'transaction_id',
      type: 'uuid',
      nullable: false,
      primaryKey: true,
    },
    {
      name: 'timestamp',
      type: 'timestamp',
      nullable: false,
      partitionKey: true,
    },
    {
      name: 'account_id',
      type: 'string',
      nullable: false,
      generator: { type: 'uniform', prefix: 'acct_', cardinality: 1000000 },
    },
    {
      name: 'transaction_type',
      type: 'string',
      nullable: false,
      generator: {
        type: 'zipf',
        values: ['deposit', 'withdrawal', 'transfer', 'payment', 'refund', 'fee'],
        zipfSkew: 1.0,
      },
    },
    {
      name: 'amount',
      type: 'float64',
      nullable: false,
      generator: { type: 'gaussian', mean: 150, stdDev: 500 },
    },
    {
      name: 'currency',
      type: 'string',
      nullable: false,
      generator: {
        type: 'zipf',
        values: ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'BTC', 'ETH'],
        zipfSkew: 1.5,
      },
    },
    {
      name: 'merchant_id',
      type: 'string',
      nullable: true,
      generator: { type: 'zipf', prefix: 'merchant_', cardinality: 50000, zipfSkew: 1.3 },
    },
    {
      name: 'category',
      type: 'string',
      nullable: true,
      generator: {
        type: 'zipf',
        values: ['retail', 'food', 'travel', 'utilities', 'entertainment', 'healthcare', 'other'],
        zipfSkew: 0.8,
      },
    },
    {
      name: 'location',
      type: 'string',
      nullable: true,
      generator: { type: 'zipf', cardinality: 5000, zipfSkew: 1.2 },
    },
    {
      name: 'status',
      type: 'string',
      nullable: false,
      generator: {
        type: 'zipf',
        values: ['completed', 'pending', 'failed', 'reversed'],
        zipfSkew: 3.0, // completed is most common
      },
    },
    {
      name: 'risk_score',
      type: 'float64',
      nullable: true,
      generator: { type: 'gaussian', mean: 0.1, stdDev: 0.2 },
    },
    {
      name: 'is_fraud',
      type: 'bool',
      nullable: false,
      generator: { type: 'random' }, // ~0.1% fraud rate
    },
  ],
};

/**
 * Get schema by name
 */
export function getSchema(name: string): DataSchema | undefined {
  const schemas: Record<string, DataSchema> = {
    user_activity: USER_ACTIVITY_SCHEMA,
    ecommerce_events: ECOMMERCE_EVENTS_SCHEMA,
    iot_sensors: IOT_SENSOR_SCHEMA,
    logs: LOG_ANALYTICS_SCHEMA,
    transactions: FINANCIAL_TRANSACTIONS_SCHEMA,
  };
  return schemas[name];
}

/**
 * List all available schemas
 */
export function listSchemas(): string[] {
  return [
    'user_activity',
    'ecommerce_events',
    'iot_sensors',
    'logs',
    'transactions',
  ];
}
