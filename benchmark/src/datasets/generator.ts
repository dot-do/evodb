/**
 * Synthetic Bluesky Event Generator
 *
 * Generates realistic test data matching the JSONBench Bluesky schema.
 * Useful for benchmarking without downloading the full dataset.
 */

import type {
  BlueskyEventJson,
  BlueskyEventKind,
  CommitOperation,
  DataSize,
} from './types.js';
import { DATA_SIZES } from './types.js';

/**
 * Generator configuration
 */
export interface GeneratorConfig {
  /** Starting timestamp in microseconds */
  startTimeUs?: number;
  /** Average interval between events in microseconds */
  intervalUs?: number;
  /** Random seed for reproducibility (simple LCG) */
  seed?: number;
  /** Distribution of event kinds */
  kindDistribution?: {
    commit: number;
    identity: number;
    account: number;
  };
  /** Distribution of commit operations */
  operationDistribution?: {
    create: number;
    update: number;
    delete: number;
  };
  /** Distribution of collection types (for commits) */
  collectionDistribution?: {
    post: number;
    like: number;
    repost: number;
    follow: number;
    profile: number;
  };
}

/**
 * Default configuration matching real Bluesky firehose patterns
 */
const DEFAULT_CONFIG: Required<GeneratorConfig> = {
  startTimeUs: 1700000000000000, // Nov 2023
  intervalUs: 1000, // 1ms between events
  seed: 42,
  kindDistribution: {
    commit: 0.95,   // 95% commits
    identity: 0.03, // 3% identity
    account: 0.02,  // 2% account
  },
  operationDistribution: {
    create: 0.85,  // 85% creates
    update: 0.10,  // 10% updates
    delete: 0.05,  // 5% deletes
  },
  collectionDistribution: {
    post: 0.25,    // 25% posts
    like: 0.45,    // 45% likes (most common)
    repost: 0.10,  // 10% reposts
    follow: 0.15,  // 15% follows
    profile: 0.05, // 5% profile updates
  },
};

/**
 * Simple LCG random number generator for reproducibility
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Generate random number in [0, 1) */
  next(): number {
    // LCG parameters (same as MINSTD)
    this.state = (this.state * 48271) % 2147483647;
    return this.state / 2147483647;
  }

  /** Generate random integer in [min, max] */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick from weighted distribution */
  weighted<T extends string>(dist: Record<T, number>): T {
    const r = this.next();
    let cumulative = 0;
    for (const [key, weight] of Object.entries(dist) as [T, number][]) {
      cumulative += weight;
      if (r < cumulative) return key;
    }
    // Fallback to first key
    return Object.keys(dist)[0] as T;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Generate random boolean with probability */
  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

/**
 * Word lists for generating realistic content
 */
const WORDS = {
  nouns: ['post', 'photo', 'video', 'link', 'update', 'news', 'thought', 'idea', 'story', 'event'],
  verbs: ['love', 'check', 'see', 'read', 'watch', 'share', 'enjoy', 'create', 'build', 'learn'],
  adjectives: ['amazing', 'great', 'new', 'interesting', 'cool', 'beautiful', 'awesome', 'incredible', 'perfect', 'lovely'],
  topics: ['tech', 'art', 'music', 'food', 'travel', 'sports', 'coding', 'design', 'photography', 'gaming'],
  emojis: ['', '', '', '', '', '', '', '', '', ''],
};

const LANGUAGES = ['en', 'ja', 'pt', 'es', 'de', 'fr', 'ko', 'zh', 'it', 'nl'];

const HANDLES = [
  'alice', 'bob', 'charlie', 'david', 'emma', 'frank', 'grace', 'henry', 'iris', 'jack',
  'kate', 'leo', 'mia', 'noah', 'olivia', 'peter', 'quinn', 'ruby', 'sam', 'tina',
];

/**
 * Generate a random DID
 */
function generateDid(rng: SeededRandom): string {
  const chars = '234567abcdefghijklmnopqrstuvwxyz';
  let plc = '';
  for (let i = 0; i < 24; i++) {
    plc += chars[rng.int(0, chars.length - 1)];
  }
  return `did:plc:${plc}`;
}

/**
 * Generate a random CID
 */
function generateCid(rng: SeededRandom): string {
  const chars = '234567abcdefghijklmnopqrstuvwxyz';
  let cid = 'bafyrei';
  for (let i = 0; i < 52; i++) {
    cid += chars[rng.int(0, chars.length - 1)];
  }
  return cid;
}

/**
 * Generate a random rkey (record key)
 */
function generateRkey(rng: SeededRandom): string {
  const chars = '234567abcdefghijklmnopqrstuvwxyz';
  let rkey = '';
  for (let i = 0; i < 13; i++) {
    rkey += chars[rng.int(0, chars.length - 1)];
  }
  return rkey;
}

/**
 * Generate a random AT URI
 */
function generateUri(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`;
}

/**
 * Generate random post text
 */
function generatePostText(rng: SeededRandom): string {
  const parts: string[] = [];

  // Sometimes start with a verb
  if (rng.bool(0.3)) {
    parts.push(rng.pick(WORDS.verbs));
  }

  // Add adjective + noun
  if (rng.bool(0.5)) {
    parts.push(rng.pick(WORDS.adjectives));
  }
  parts.push(rng.pick(WORDS.nouns));

  // Sometimes add topic
  if (rng.bool(0.4)) {
    parts.push('about');
    parts.push(rng.pick(WORDS.topics));
  }

  // Sometimes add emoji
  if (rng.bool(0.3)) {
    parts.push(rng.pick(WORDS.emojis));
  }

  // Capitalize first letter
  const text = parts.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Generate a post record
 */
function generatePostRecord(rng: SeededRandom, createdAt: string): BlueskyEventJson['commit'] {
  const text = generatePostText(rng);

  const record: NonNullable<BlueskyEventJson['commit']>['record'] = {
    text,
    createdAt,
  };

  // Add languages (70% chance)
  if (rng.bool(0.7)) {
    const langCount = rng.int(1, 3);
    record.langs = [];
    for (let i = 0; i < langCount; i++) {
      const lang = rng.pick(LANGUAGES);
      if (!record.langs.includes(lang)) {
        record.langs.push(lang);
      }
    }
  }

  // Add reply (20% chance)
  if (rng.bool(0.2)) {
    const parentDid = generateDid(rng);
    const rootDid = rng.bool(0.7) ? parentDid : generateDid(rng);
    record.reply = {
      parent: {
        uri: generateUri(parentDid, 'app.bsky.feed.post', generateRkey(rng)),
        cid: generateCid(rng),
      },
      root: {
        uri: generateUri(rootDid, 'app.bsky.feed.post', generateRkey(rng)),
        cid: generateCid(rng),
      },
    };
  }

  // Add embed (30% chance)
  if (rng.bool(0.3)) {
    if (rng.bool(0.5)) {
      // External link
      record.embed = {
        $type: 'app.bsky.embed.external',
        external: {
          uri: `https://example.com/${rng.pick(WORDS.topics)}/${rng.int(1, 1000)}`,
          title: `${rng.pick(WORDS.adjectives)} ${rng.pick(WORDS.nouns)}`,
          description: generatePostText(rng),
        },
      };
    } else {
      // Quote post
      record.embed = {
        $type: 'app.bsky.embed.record',
        record: {
          uri: generateUri(generateDid(rng), 'app.bsky.feed.post', generateRkey(rng)),
          cid: generateCid(rng),
        },
      };
    }
  }

  return {
    operation: 'create',
    collection: 'app.bsky.feed.post',
    rkey: generateRkey(rng),
    cid: generateCid(rng),
    record,
  };
}

/**
 * Generate a like record
 */
function generateLikeRecord(rng: SeededRandom, createdAt: string): BlueskyEventJson['commit'] {
  return {
    operation: 'create',
    collection: 'app.bsky.feed.like',
    rkey: generateRkey(rng),
    cid: generateCid(rng),
    record: {
      createdAt,
    },
  };
}

/**
 * Generate a repost record
 */
function generateRepostRecord(rng: SeededRandom, createdAt: string): BlueskyEventJson['commit'] {
  return {
    operation: 'create',
    collection: 'app.bsky.feed.repost',
    rkey: generateRkey(rng),
    cid: generateCid(rng),
    record: {
      createdAt,
    },
  };
}

/**
 * Generate a follow record
 */
function generateFollowRecord(rng: SeededRandom, createdAt: string): BlueskyEventJson['commit'] {
  return {
    operation: 'create',
    collection: 'app.bsky.graph.follow',
    rkey: generateRkey(rng),
    cid: generateCid(rng),
    record: {
      createdAt,
    },
  };
}

/**
 * Generate a profile record
 */
function generateProfileRecord(rng: SeededRandom, createdAt: string): BlueskyEventJson['commit'] {
  return {
    operation: rng.bool(0.3) ? 'update' : 'create',
    collection: 'app.bsky.actor.profile',
    rkey: 'self',
    cid: generateCid(rng),
    record: {
      createdAt,
    },
  };
}

/**
 * Generate a single Bluesky event
 */
function generateEvent(
  rng: SeededRandom,
  timeUs: number,
  config: Required<GeneratorConfig>
): BlueskyEventJson {
  const kind = rng.weighted(config.kindDistribution);
  const did = generateDid(rng);
  const createdAt = new Date(timeUs / 1000).toISOString();

  const event: BlueskyEventJson = {
    kind,
    did,
    time_us: timeUs,
  };

  switch (kind) {
    case 'commit': {
      const op = rng.weighted(config.operationDistribution);
      const collectionType = rng.weighted(config.collectionDistribution);

      // For delete operations, just include basic commit info
      if (op === 'delete') {
        const collection = {
          post: 'app.bsky.feed.post',
          like: 'app.bsky.feed.like',
          repost: 'app.bsky.feed.repost',
          follow: 'app.bsky.graph.follow',
          profile: 'app.bsky.actor.profile',
        }[collectionType];

        event.commit = {
          operation: 'delete',
          collection,
          rkey: generateRkey(rng),
        };
        break;
      }

      // Generate record based on collection type
      switch (collectionType) {
        case 'post':
          event.commit = generatePostRecord(rng, createdAt);
          break;
        case 'like':
          event.commit = generateLikeRecord(rng, createdAt);
          break;
        case 'repost':
          event.commit = generateRepostRecord(rng, createdAt);
          break;
        case 'follow':
          event.commit = generateFollowRecord(rng, createdAt);
          break;
        case 'profile':
          event.commit = generateProfileRecord(rng, createdAt);
          break;
      }

      // Override operation for update
      if (op === 'update' && event.commit) {
        event.commit.operation = 'update';
      }
      break;
    }

    case 'identity':
      event.identity = {
        seq: rng.int(1, 1000000),
      };
      // Sometimes include handle
      if (rng.bool(0.8)) {
        const handle = rng.pick(HANDLES);
        const domain = rng.bool(0.7) ? 'bsky.social' : `${rng.pick(WORDS.topics)}.dev`;
        event.identity.handle = `${handle}.${domain}`;
      }
      break;

    case 'account':
      event.account = {
        active: rng.bool(0.95), // 95% active
        seq: rng.int(1, 1000000),
      };
      // Sometimes include status
      if (rng.bool(0.1)) {
        event.account.status = rng.pick(['deactivated', 'suspended', 'takedown']);
      }
      break;
  }

  return event;
}

/**
 * Generate synthetic Bluesky events
 *
 * @param count Number of events to generate
 * @param config Generator configuration
 * @returns Array of Bluesky events
 */
export function generateEvents(
  count: number,
  config: GeneratorConfig = {}
): BlueskyEventJson[] {
  const fullConfig: Required<GeneratorConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = new SeededRandom(fullConfig.seed);
  const events: BlueskyEventJson[] = new Array(count);
  let timeUs = fullConfig.startTimeUs;

  for (let i = 0; i < count; i++) {
    events[i] = generateEvent(rng, timeUs, fullConfig);
    // Add some variance to the interval
    timeUs += fullConfig.intervalUs + rng.int(-500, 500);
  }

  return events;
}

/**
 * Generate events for a specific data size
 *
 * @param size Data size preset
 * @param config Generator configuration
 * @returns Array of Bluesky events
 */
export function generateDataset(
  size: DataSize,
  config: GeneratorConfig = {}
): BlueskyEventJson[] {
  return generateEvents(DATA_SIZES[size], config);
}

/**
 * Generate events as an async iterator (for large datasets)
 *
 * @param count Number of events to generate
 * @param batchSize Number of events per batch
 * @param config Generator configuration
 */
export async function* generateEventsIterator(
  count: number,
  batchSize = 10000,
  config: GeneratorConfig = {}
): AsyncGenerator<BlueskyEventJson[], void, unknown> {
  const fullConfig: Required<GeneratorConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = new SeededRandom(fullConfig.seed);
  let timeUs = fullConfig.startTimeUs;
  let remaining = count;

  while (remaining > 0) {
    const batchCount = Math.min(batchSize, remaining);
    const batch: BlueskyEventJson[] = new Array(batchCount);

    for (let i = 0; i < batchCount; i++) {
      batch[i] = generateEvent(rng, timeUs, fullConfig);
      timeUs += fullConfig.intervalUs + rng.int(-500, 500);
    }

    remaining -= batchCount;
    yield batch;
  }
}

/**
 * Estimate memory usage for generated events
 *
 * @param count Number of events
 * @returns Estimated memory in bytes
 */
export function estimateMemoryUsage(count: number): number {
  // Average event size is ~400 bytes in memory
  const avgEventSize = 400;
  return count * avgEventSize;
}

/**
 * Estimate JSON size for generated events
 *
 * @param count Number of events
 * @returns Estimated JSON size in bytes
 */
export function estimateJsonSize(count: number): number {
  // Average JSON serialized size is ~350 bytes
  const avgJsonSize = 350;
  return count * avgJsonSize;
}
