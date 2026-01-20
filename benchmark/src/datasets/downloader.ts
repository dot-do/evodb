/**
 * JSONBench Dataset Downloader
 *
 * Downloads Bluesky firehose data from the ClickHouse JSONBench repository.
 * Supports various formats (JSON, NDJSON, Parquet) and sizes.
 *
 * @see https://github.com/ClickHouse/JSONBench
 */

import { createWriteStream } from 'node:fs';
import { mkdir, stat, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { join, dirname } from 'node:path';
import type { BlueskyEventJson, DataSize } from './types.js';
import { DATA_SIZES } from './types.js';

/**
 * JSONBench dataset URLs
 *
 * The JSONBench repository provides various sizes of the Bluesky dataset.
 * Files are gzip compressed NDJSON (newline-delimited JSON).
 */
const JSONBENCH_BASE_URL = 'https://github.com/ClickHouse/JSONBench/releases/download/v1.0.0';

/**
 * Available dataset files with approximate sizes
 */
export const DATASET_FILES = {
  // Sample dataset (~1K events, ~500KB compressed)
  sample: {
    url: `${JSONBENCH_BASE_URL}/bluesky_sample.json.gz`,
    events: 1000,
    compressedSize: 500_000,
    uncompressedSize: 2_000_000,
  },
  // Small dataset (~100K events, ~50MB compressed)
  small: {
    url: `${JSONBENCH_BASE_URL}/bluesky_100k.json.gz`,
    events: 100_000,
    compressedSize: 50_000_000,
    uncompressedSize: 200_000_000,
  },
  // Medium dataset (~1M events, ~500MB compressed)
  medium: {
    url: `${JSONBENCH_BASE_URL}/bluesky_1m.json.gz`,
    events: 1_000_000,
    compressedSize: 500_000_000,
    uncompressedSize: 2_000_000_000,
  },
  // Large dataset (~10M events, ~5GB compressed)
  large: {
    url: `${JSONBENCH_BASE_URL}/bluesky_10m.json.gz`,
    events: 10_000_000,
    compressedSize: 5_000_000_000,
    uncompressedSize: 20_000_000_000,
  },
} as const;

/**
 * Download configuration
 */
export interface DownloadConfig {
  /** Directory to store downloaded files */
  cacheDir?: string;
  /** Whether to use cached files if available */
  useCache?: boolean;
  /** Maximum number of events to load (for partial loading) */
  maxEvents?: number;
  /** Progress callback */
  onProgress?: (downloaded: number, total: number) => void;
}

const DEFAULT_CACHE_DIR = join(process.cwd(), '.cache', 'jsonbench');

/**
 * Download a file with progress tracking
 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  // Ensure directory exists
  await mkdir(dirname(destPath), { recursive: true });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  const writer = createWriteStream(destPath);

  if (!response.body) {
    throw new Error('Response body is null');
  }

  let downloaded = 0;
  const reader = response.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      writer.write(Buffer.from(value));
      downloaded += value.length;

      if (onProgress) {
        onProgress(downloaded, contentLength);
      }
    }
  } finally {
    writer.close();
    reader.releaseLock();
  }
}

/**
 * Check if a cached file exists and is valid
 */
async function isCached(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

/**
 * Get the cache path for a dataset
 */
function getCachePath(cacheDir: string, datasetName: string): string {
  return join(cacheDir, `bluesky_${datasetName}.json.gz`);
}

/**
 * Download JSONBench dataset
 *
 * @param size Dataset size to download
 * @param config Download configuration
 * @returns Path to the downloaded (compressed) file
 */
export async function downloadDataset(
  size: DataSize,
  config: DownloadConfig = {}
): Promise<string> {
  const {
    cacheDir = DEFAULT_CACHE_DIR,
    useCache = true,
    onProgress,
  } = config;

  // Map size to dataset file
  const datasetKey = size === 'tiny' ? 'sample' : size;
  const dataset = DATASET_FILES[datasetKey as keyof typeof DATASET_FILES];

  if (!dataset) {
    throw new Error(`Unknown dataset size: ${size}`);
  }

  const cachePath = getCachePath(cacheDir, datasetKey);

  // Check cache
  if (useCache && await isCached(cachePath)) {
    return cachePath;
  }

  // Download
  await downloadFile(dataset.url, cachePath, onProgress);

  return cachePath;
}

/**
 * Load events from a compressed NDJSON file
 *
 * @param filePath Path to the .json.gz file
 * @param maxEvents Maximum number of events to load
 * @returns Array of Bluesky events
 */
export async function loadFromFile(
  filePath: string,
  maxEvents?: number
): Promise<BlueskyEventJson[]> {
  const events: BlueskyEventJson[] = [];

  const gunzip = createGunzip();
  const fileStream = createReadStream(filePath);

  await pipeline(
    fileStream,
    gunzip,
    async function* (source) {
      const rl = createInterface({
        input: source as NodeJS.ReadableStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (maxEvents && events.length >= maxEvents) {
          rl.close();
          break;
        }

        if (line.trim()) {
          try {
            const event = JSON.parse(line) as BlueskyEventJson;
            events.push(event);
            yield event;
          } catch (e) {
            // Skip malformed lines
            console.warn(`Skipping malformed JSON line: ${(e as Error).message}`);
          }
        }
      }
    }
  ).catch(() => {
    // Pipeline may error when we close early, that's ok
  });

  return events;
}

/**
 * Stream events from a compressed NDJSON file
 *
 * @param filePath Path to the .json.gz file
 * @param batchSize Number of events per batch
 */
export async function* streamFromFile(
  filePath: string,
  batchSize = 10000
): AsyncGenerator<BlueskyEventJson[], void, unknown> {
  const gunzip = createGunzip();
  const fileStream = createReadStream(filePath);

  let batch: BlueskyEventJson[] = [];

  const rl = createInterface({
    input: fileStream.pipe(gunzip),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const event = JSON.parse(line) as BlueskyEventJson;
        batch.push(event);

        if (batch.length >= batchSize) {
          yield batch;
          batch = [];
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  }

  // Yield remaining events
  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * Download and load JSONBench dataset
 *
 * @param size Dataset size
 * @param config Download configuration
 * @returns Array of Bluesky events
 */
export async function loadDataset(
  size: DataSize,
  config: DownloadConfig = {}
): Promise<BlueskyEventJson[]> {
  const filePath = await downloadDataset(size, config);
  return loadFromFile(filePath, config.maxEvents ?? DATA_SIZES[size]);
}

/**
 * Download and stream JSONBench dataset
 *
 * @param size Dataset size
 * @param batchSize Number of events per batch
 * @param config Download configuration
 */
export async function* streamDataset(
  size: DataSize,
  batchSize = 10000,
  config: DownloadConfig = {}
): AsyncGenerator<BlueskyEventJson[], void, unknown> {
  const filePath = await downloadDataset(size, config);
  yield* streamFromFile(filePath, batchSize);
}

/**
 * Clear the download cache
 */
export async function clearCache(cacheDir = DEFAULT_CACHE_DIR): Promise<void> {
  try {
    await rm(cacheDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if directory doesn't exist
  }
}

/**
 * Get cache status
 */
export async function getCacheStatus(
  cacheDir = DEFAULT_CACHE_DIR
): Promise<Record<string, { cached: boolean; size: number }>> {
  const status: Record<string, { cached: boolean; size: number }> = {};

  for (const key of Object.keys(DATASET_FILES)) {
    const cachePath = getCachePath(cacheDir, key);
    try {
      const stats = await stat(cachePath);
      status[key] = { cached: true, size: stats.size };
    } catch {
      status[key] = { cached: false, size: 0 };
    }
  }

  return status;
}

/**
 * Generate curl command to download a dataset
 *
 * Useful for manual downloads or scripting.
 *
 * @param size Dataset size
 * @param outputPath Output file path
 * @returns Curl command string
 */
export function getCurlCommand(size: DataSize, outputPath?: string): string {
  const datasetKey = size === 'tiny' ? 'sample' : size;
  const dataset = DATASET_FILES[datasetKey as keyof typeof DATASET_FILES];

  if (!dataset) {
    throw new Error(`Unknown dataset size: ${size}`);
  }

  const output = outputPath || `bluesky_${datasetKey}.json.gz`;
  return `curl -L -o ${output} ${dataset.url}`;
}

/**
 * Print download instructions for all datasets
 */
export function printDownloadInstructions(): string {
  const lines: string[] = [
    '# JSONBench Bluesky Dataset Download Commands',
    '',
    '# Sample dataset (~1K events, ~500KB)',
    getCurlCommand('tiny'),
    '',
    '# Small dataset (~100K events, ~50MB)',
    getCurlCommand('small'),
    '',
    '# Medium dataset (~1M events, ~500MB)',
    getCurlCommand('medium'),
    '',
    '# Large dataset (~10M events, ~5GB)',
    getCurlCommand('large'),
    '',
    '# To decompress:',
    '# gunzip -k bluesky_sample.json.gz',
    '',
    '# Note: Files are in NDJSON format (one JSON object per line)',
  ];

  return lines.join('\n');
}
