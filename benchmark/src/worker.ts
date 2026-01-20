/**
 * EvoDB Benchmark Worker
 *
 * Cloudflare Worker with /bench endpoint for columnar database benchmarking.
 * Returns jsonbench-compatible format for integration with benchmark-runner.
 */

import { shred, unshred, extractPath, extractPaths, encode, decode, buildPathIndex } from '@evodb/core';
import type { Column } from '@evodb/core';

/**
 * JSONBench-compatible result format
 */
interface BenchResult {
  engine: string;
  dataset: string;
  rows: number;
  timestamp: string;
  duration_ms: number;
  operations: {
    name: string;
    category: string;
    iterations: number;
    latency: {
      min: number;
      max: number;
      mean: number;
      p50: number;
      p95: number;
      p99: number;
    };
    throughput: {
      ops_per_sec: number;
      rows_per_sec: number;
      bytes_per_sec: number;
    };
    metadata?: Record<string, unknown>;
  }[];
  summary: {
    total_operations: number;
    total_time_ms: number;
    avg_latency_ms: number;
    total_rows_processed: number;
    total_bytes_processed: number;
  };
  system: {
    runtime: string;
    memory_limit_mb?: number;
    cpu_time_limit_ms?: number;
  };
}

/**
 * Schema definitions for test data
 */
const SCHEMAS = {
  user_activity: {
    fields: ['id', 'user_id', 'timestamp', 'event_type', 'content', 'target_id', 'region', 'device_type', 'session_duration_ms'],
    eventTypes: ['post', 'like', 'repost', 'follow', 'unfollow', 'reply', 'quote'],
    regions: ['us-east', 'us-west', 'eu-west', 'eu-central', 'ap-south', 'ap-northeast'],
    devices: ['mobile-ios', 'mobile-android', 'web', 'desktop', 'api'],
  },
  ecommerce_events: {
    fields: ['event_id', 'event_time', 'event_type', 'product_id', 'category_id', 'price', 'user_id', 'country', 'device'],
    eventTypes: ['view', 'cart', 'purchase', 'remove_from_cart', 'search'],
    countries: ['US', 'UK', 'DE', 'FR', 'JP', 'BR', 'IN'],
    devices: ['mobile', 'desktop', 'tablet'],
  },
  iot_sensors: {
    fields: ['reading_id', 'timestamp', 'device_id', 'sensor_type', 'value', 'unit', 'location_id', 'building'],
    sensorTypes: ['temperature', 'humidity', 'pressure', 'co2', 'motion', 'light'],
    units: ['celsius', 'percent', 'hpa', 'ppm', 'boolean', 'lux'],
  },
  logs: {
    fields: ['log_id', 'timestamp', 'level', 'service', 'host', 'message', 'duration_ms', 'status_code'],
    levels: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    statusCodes: [200, 201, 204, 400, 401, 403, 404, 500, 502, 503],
  },
  transactions: {
    fields: ['transaction_id', 'timestamp', 'account_id', 'transaction_type', 'amount', 'currency', 'status'],
    types: ['deposit', 'withdrawal', 'transfer', 'payment', 'refund'],
    currencies: ['USD', 'EUR', 'GBP', 'JPY', 'CNY'],
    statuses: ['completed', 'pending', 'failed', 'reversed'],
  },
};

type DatasetName = keyof typeof SCHEMAS;

/**
 * Generate test data for benchmarking
 */
function generateTestData(rows: number, datasetName: DatasetName = 'user_activity'): unknown[] {
  const docs: unknown[] = [];
  const schema = SCHEMAS[datasetName];
  const now = Date.now();
  const yearAgo = now - 365 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < rows; i++) {
    switch (datasetName) {
      case 'user_activity':
        docs.push({
          id: `evt_${i}`,
          user_id: `user_${i % 10000}`,
          timestamp: yearAgo + Math.floor(Math.random() * (now - yearAgo)),
          event_type: schema.eventTypes[i % schema.eventTypes.length],
          content: i % 3 === 0 ? `Content for event ${i}` : null,
          target_id: i % 2 === 0 ? `target_${i % 5000}` : null,
          region: schema.regions[i % schema.regions.length],
          device_type: schema.devices[i % schema.devices.length],
          session_duration_ms: Math.floor(Math.random() * 600000),
        });
        break;
      case 'ecommerce_events':
        docs.push({
          event_id: `ecom_${i}`,
          event_time: yearAgo + Math.floor(Math.random() * (now - yearAgo)),
          event_type: schema.eventTypes[i % schema.eventTypes.length],
          product_id: i % 100000,
          category_id: i % 1000,
          price: Math.random() * 500,
          user_id: i % 100000,
          country: schema.countries[i % schema.countries.length],
          device: schema.devices[i % schema.devices.length],
        });
        break;
      case 'iot_sensors':
        docs.push({
          reading_id: `read_${i}`,
          timestamp: yearAgo + Math.floor(Math.random() * (now - yearAgo)),
          device_id: `device_${i % 10000}`,
          sensor_type: schema.sensorTypes[i % schema.sensorTypes.length],
          value: Math.random() * 100,
          unit: schema.units[i % schema.units.length],
          location_id: `loc_${i % 1000}`,
          building: `building_${i % 100}`,
        });
        break;
      case 'logs':
        docs.push({
          log_id: `log_${i}`,
          timestamp: yearAgo + Math.floor(Math.random() * (now - yearAgo)),
          level: schema.levels[Math.min(Math.floor(Math.random() * 10), schema.levels.length - 1)],
          service: `svc-${i % 50}`,
          host: `host-${i % 500}`,
          message: `Log message ${i} with some additional details`,
          duration_ms: Math.random() * 500,
          status_code: schema.statusCodes[i % schema.statusCodes.length],
        });
        break;
      case 'transactions':
        docs.push({
          transaction_id: `tx_${i}`,
          timestamp: yearAgo + Math.floor(Math.random() * (now - yearAgo)),
          account_id: `acct_${i % 100000}`,
          transaction_type: schema.types[i % schema.types.length],
          amount: Math.random() * 10000,
          currency: schema.currencies[i % schema.currencies.length],
          status: schema.statuses[Math.floor(Math.random() * 10) < 8 ? 0 : (i % schema.statuses.length)],
        });
        break;
    }
  }
  return docs;
}

/**
 * Compute latency statistics
 */
function computeStats(samples: number[]) {
  if (samples.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, stdDev: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const mean = samples.reduce((a, b) => a + b, 0) / n;

  const p50 = sorted[Math.floor(n * 0.50)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];

  const variance = samples.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return { min, max, mean, p50, p95, p99, stdDev };
}

/**
 * Run shred benchmark
 */
function benchmarkShred(docs: unknown[], iterations: number): {
  samples: number[];
  columns: Column[];
  bytes: number;
} {
  const samples: number[] = [];
  let columns: Column[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    columns = shred(docs);
    samples.push(performance.now() - start);
  }

  let bytes = 0;
  for (const col of columns) {
    bytes += col.values.length * 8;
    bytes += col.nulls.length;
  }

  return { samples, columns, bytes };
}

/**
 * Run unshred benchmark
 */
function benchmarkUnshred(columns: Column[], iterations: number): {
  samples: number[];
  docs: unknown[];
} {
  const samples: number[] = [];
  let docs: unknown[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    docs = unshred(columns);
    samples.push(performance.now() - start);
  }

  return { samples, docs };
}

/**
 * Run encode benchmark
 */
function benchmarkEncode(columns: Column[], iterations: number): {
  samples: number[];
  encodedBytes: number;
} {
  const samples: number[] = [];
  let encodedBytes = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const encodedCols = encode(columns);
    encodedBytes = 0;
    for (const enc of encodedCols) {
      encodedBytes += enc.data.length + enc.nullBitmap.length;
    }
    samples.push(performance.now() - start);
  }

  return { samples, encodedBytes };
}

/**
 * Run decode benchmark
 */
function benchmarkDecode(columns: Column[], iterations: number): {
  samples: number[];
} {
  const encodedCols = encode(columns);
  const rowCount = columns.length > 0 ? columns[0].values.length : 0;

  const samples: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    for (const enc of encodedCols) {
      decode(enc, rowCount);
    }
    samples.push(performance.now() - start);
  }

  return { samples };
}

/**
 * Run single path extraction benchmark
 */
function benchmarkExtractSinglePath(columns: Column[], path: string, iterations: number): {
  samples: number[];
  resultCount: number;
} {
  const samples: number[] = [];
  let resultCount = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const values = extractPath(columns, path);
    resultCount = values.length;
    samples.push(performance.now() - start);
  }

  return { samples, resultCount };
}

/**
 * Run multi-path extraction benchmark
 */
function benchmarkExtractMultiPath(columns: Column[], paths: string[], iterations: number): {
  samples: number[];
  resultCount: number;
} {
  const samples: number[] = [];
  let resultCount = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = extractPaths(columns, paths);
    resultCount = Object.keys(result).length;
    samples.push(performance.now() - start);
  }

  return { samples, resultCount };
}

/**
 * Run path index benchmark
 */
function benchmarkPathIndex(columns: Column[], iterations: number): {
  samples: number[];
  lookupCount: number;
} {
  const samples: number[] = [];
  const paths = columns.map(c => c.path);

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const index = buildPathIndex(columns);
    for (const path of paths) {
      index.get(path);
    }
    samples.push(performance.now() - start);
  }

  return { samples, lookupCount: paths.length * iterations };
}

/**
 * Run filter scan benchmark
 */
function benchmarkFilterScan(columns: Column[], iterations: number): {
  samples: number[];
  matchCount: number;
} {
  const samples: number[] = [];
  let matchCount = 0;

  const filterCol = columns.find(c => c.path === 'event_type' || c.path === 'region' || c.path === 'level');
  if (!filterCol) {
    return { samples: [0], matchCount: 0 };
  }

  const filterValue = filterCol.values[0];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    let count = 0;
    for (let j = 0; j < filterCol.values.length; j++) {
      if (!filterCol.nulls[j] && filterCol.values[j] === filterValue) {
        count++;
      }
    }
    matchCount = count;
    samples.push(performance.now() - start);
  }

  return { samples, matchCount };
}

/**
 * Run aggregation benchmark
 */
function benchmarkAggregation(columns: Column[], iterations: number): {
  samples: number[];
  result: number;
} {
  const samples: number[] = [];
  let result = 0;

  const numCol = columns.find(c =>
    c.path === 'session_duration_ms' ||
    c.path === 'price' ||
    c.path === 'value' ||
    c.path === 'amount' ||
    c.path === 'duration_ms'
  );
  if (!numCol) {
    return { samples: [0], result: 0 };
  }

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    let sum = 0;
    for (let j = 0; j < numCol.values.length; j++) {
      if (!numCol.nulls[j] && typeof numCol.values[j] === 'number') {
        sum += numCol.values[j] as number;
      }
    }
    result = sum;
    samples.push(performance.now() - start);
  }

  return { samples, result };
}

/**
 * Run full benchmark suite
 */
function runBenchmark(rows: number, datasetName: DatasetName, iterations: number = 5): BenchResult {
  const startTime = performance.now();

  const docs = generateTestData(rows, datasetName);

  const shredResult = benchmarkShred(docs, iterations);
  const unshredResult = benchmarkUnshred(shredResult.columns, iterations);
  const encodeResult = benchmarkEncode(shredResult.columns, iterations);
  const decodeResult = benchmarkDecode(shredResult.columns, iterations);

  const paths = shredResult.columns.slice(0, 3).map(c => c.path);
  const singlePathResult = paths.length > 0
    ? benchmarkExtractSinglePath(shredResult.columns, paths[0], iterations)
    : { samples: [0], resultCount: 0 };
  const multiPathResult = paths.length > 0
    ? benchmarkExtractMultiPath(shredResult.columns, paths, iterations)
    : { samples: [0], resultCount: 0 };

  const pathIndexResult = benchmarkPathIndex(shredResult.columns, iterations);
  const filterResult = benchmarkFilterScan(shredResult.columns, iterations);
  const aggResult = benchmarkAggregation(shredResult.columns, iterations);

  const totalTime = performance.now() - startTime;

  const operations: BenchResult['operations'] = [];

  const addOperation = (
    name: string,
    category: string,
    samples: number[],
    rowsProcessed: number,
    bytesProcessed: number,
    metadata?: Record<string, unknown>
  ) => {
    const stats = computeStats(samples);
    const avgTime = stats.mean;
    const opsPerSec = avgTime > 0 ? 1000 / avgTime : 0;
    const rowsPerSec = avgTime > 0 ? (rowsProcessed / avgTime) * 1000 : 0;
    const bytesPerSec = avgTime > 0 ? (bytesProcessed / avgTime) * 1000 : 0;

    operations.push({
      name,
      category,
      iterations: samples.length,
      latency: {
        min: stats.min,
        max: stats.max,
        mean: stats.mean,
        p50: stats.p50,
        p95: stats.p95,
        p99: stats.p99,
      },
      throughput: {
        ops_per_sec: opsPerSec,
        rows_per_sec: rowsPerSec,
        bytes_per_sec: bytesPerSec,
      },
      metadata,
    });
  };

  const jsonBytes = JSON.stringify(docs).length;

  addOperation('shred', 'shredding', shredResult.samples, rows, jsonBytes, {
    columns: shredResult.columns.length,
    output_bytes: shredResult.bytes,
  });

  addOperation('unshred', 'shredding', unshredResult.samples, rows, shredResult.bytes, {
    documents_reconstructed: unshredResult.docs.length,
  });

  addOperation('encode', 'encoding', encodeResult.samples, rows, shredResult.bytes, {
    encoded_bytes: encodeResult.encodedBytes,
    compression_ratio: shredResult.bytes > 0 ? encodeResult.encodedBytes / shredResult.bytes : 1,
  });

  addOperation('decode', 'encoding', decodeResult.samples, rows, encodeResult.encodedBytes);

  addOperation('extract_single_path', 'query', singlePathResult.samples, singlePathResult.resultCount, 0, {
    path: paths[0] ?? 'N/A',
  });

  addOperation('extract_multi_path', 'query', multiPathResult.samples, rows * paths.length, 0, {
    paths: paths,
  });

  addOperation('path_index_lookup', 'query', pathIndexResult.samples, pathIndexResult.lookupCount, 0);

  addOperation('filter_scan', 'query', filterResult.samples, rows, 0, {
    match_count: filterResult.matchCount,
    selectivity: filterResult.matchCount / rows,
  });

  addOperation('aggregation_sum', 'query', aggResult.samples, rows, 0, {
    result: aggResult.result,
  });

  const totalOps = operations.reduce((sum, op) => sum + op.iterations, 0);
  const allLatencies = operations.map(op => op.latency.mean);
  const avgLatency = allLatencies.length > 0
    ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
    : 0;

  return {
    engine: 'evodb',
    dataset: datasetName,
    rows,
    timestamp: new Date().toISOString(),
    duration_ms: totalTime,
    operations,
    summary: {
      total_operations: totalOps,
      total_time_ms: totalTime,
      avg_latency_ms: avgLatency,
      total_rows_processed: rows * operations.length,
      total_bytes_processed: jsonBytes + shredResult.bytes,
    },
    system: {
      runtime: 'cloudflare-workers',
      memory_limit_mb: 128,
      cpu_time_limit_ms: 30000,
    },
  };
}

/**
 * Worker fetch handler
 */
export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/bench') {
      try {
        const datasetParam = url.searchParams.get('dataset') ?? 'user_activity';
        const rows = parseInt(url.searchParams.get('rows') ?? '1000', 10);
        const iterations = parseInt(url.searchParams.get('iterations') ?? '5', 10);

        if (rows < 1 || rows > 100000) {
          return new Response(JSON.stringify({
            error: 'rows must be between 1 and 100000',
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (iterations < 1 || iterations > 20) {
          return new Response(JSON.stringify({
            error: 'iterations must be between 1 and 20',
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const validDatasets = Object.keys(SCHEMAS) as DatasetName[];
        if (!validDatasets.includes(datasetParam as DatasetName)) {
          return new Response(JSON.stringify({
            error: `dataset must be one of: ${validDatasets.join(', ')}`,
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const result = runBenchmark(rows, datasetParam as DatasetName, iterations);

        return new Response(JSON.stringify(result, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'X-Benchmark-Duration': result.duration_ms.toString(),
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        engine: 'evodb',
        version: '0.1.0-rc.1',
        endpoints: ['/bench', '/health'],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      name: 'EvoDB Benchmark Worker',
      version: '0.1.0-rc.1',
      endpoints: {
        '/bench': {
          method: 'GET',
          params: {
            dataset: Object.keys(SCHEMAS).join(' | '),
            rows: '1-100000 (default: 1000)',
            iterations: '1-20 (default: 5)',
          },
          example: '/bench?dataset=user_activity&rows=10000&iterations=5',
        },
        '/health': {
          method: 'GET',
          description: 'Health check endpoint',
        },
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
