/**
 * JSONBench Bluesky Event Types
 *
 * Schema definitions for Bluesky AT Protocol firehose events.
 * These types match the JSONBench dataset format for columnar shredding benchmarks.
 *
 * @see https://github.com/ClickHouse/JSONBench
 * @see https://docs.bsky.app/docs/advanced-guides/firehose
 */

/**
 * Data size presets for benchmarking
 */
export type DataSize = 'tiny' | 'small' | 'medium' | 'large';

/**
 * Size configurations
 */
export const DATA_SIZES: Record<DataSize, number> = {
  tiny: 1_000,          // 1K events - unit tests
  small: 100_000,       // 100K events
  medium: 1_000_000,    // 1M events
  large: 10_000_000,    // 10M events
} as const;

/**
 * Bluesky event kinds
 */
export type BlueskyEventKind = 'commit' | 'identity' | 'account';

/**
 * Commit operation types
 */
export type CommitOperation = 'create' | 'update' | 'delete';

/**
 * Reply reference (parent and root posts)
 */
export interface ReplyRef {
  parent: {
    uri: string;
    cid: string;
  };
  root: {
    uri: string;
    cid: string;
  };
}

/**
 * External embed (links)
 */
export interface ExternalEmbed {
  $type: 'app.bsky.embed.external';
  external: {
    uri: string;
    title: string;
    description: string;
    thumb?: {
      $type: 'blob';
      ref: { $link: string };
      mimeType: string;
      size: number;
    };
  };
}

/**
 * Image embed
 */
export interface ImageEmbed {
  $type: 'app.bsky.embed.images';
  images: Array<{
    alt: string;
    image: {
      $type: 'blob';
      ref: { $link: string };
      mimeType: string;
      size: number;
    };
    aspectRatio?: {
      width: number;
      height: number;
    };
  }>;
}

/**
 * Record embed (quote post)
 */
export interface RecordEmbed {
  $type: 'app.bsky.embed.record';
  record: {
    uri: string;
    cid: string;
  };
}

/**
 * Record with media embed (quote post with images)
 */
export interface RecordWithMediaEmbed {
  $type: 'app.bsky.embed.recordWithMedia';
  record: {
    record: {
      uri: string;
      cid: string;
    };
  };
  media: ImageEmbed | ExternalEmbed;
}

/**
 * Union of all embed types
 */
export type Embed = ExternalEmbed | ImageEmbed | RecordEmbed | RecordWithMediaEmbed;

/**
 * Facet (rich text annotation)
 */
export interface Facet {
  index: {
    byteStart: number;
    byteEnd: number;
  };
  features: Array<{
    $type: string;
    uri?: string;
    did?: string;
    tag?: string;
  }>;
}

/**
 * Post record
 */
export interface PostRecord {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
  langs?: string[];
  reply?: ReplyRef;
  embed?: Embed;
  facets?: Facet[];
  labels?: Array<{
    val: string;
    src?: string;
  }>;
}

/**
 * Like record
 */
export interface LikeRecord {
  $type: 'app.bsky.feed.like';
  subject: {
    uri: string;
    cid: string;
  };
  createdAt: string;
}

/**
 * Repost record
 */
export interface RepostRecord {
  $type: 'app.bsky.feed.repost';
  subject: {
    uri: string;
    cid: string;
  };
  createdAt: string;
}

/**
 * Follow record
 */
export interface FollowRecord {
  $type: 'app.bsky.graph.follow';
  subject: string;  // DID
  createdAt: string;
}

/**
 * Profile record
 */
export interface ProfileRecord {
  $type: 'app.bsky.actor.profile';
  displayName?: string;
  description?: string;
  avatar?: {
    $type: 'blob';
    ref: { $link: string };
    mimeType: string;
    size: number;
  };
  banner?: {
    $type: 'blob';
    ref: { $link: string };
    mimeType: string;
    size: number;
  };
  createdAt?: string;
}

/**
 * Union of all record types
 */
export type BlueskyRecord =
  | PostRecord
  | LikeRecord
  | RepostRecord
  | FollowRecord
  | ProfileRecord;

/**
 * Collection types
 */
export type CollectionType =
  | 'app.bsky.feed.post'
  | 'app.bsky.feed.like'
  | 'app.bsky.feed.repost'
  | 'app.bsky.graph.follow'
  | 'app.bsky.actor.profile';

/**
 * Commit event data
 */
export interface CommitData {
  operation: CommitOperation;
  collection: CollectionType | string;
  rkey: string;
  cid?: string;
  record?: BlueskyRecord;
}

/**
 * Identity event data
 */
export interface IdentityData {
  handle?: string;
  seq: number;
}

/**
 * Account event data
 */
export interface AccountData {
  active: boolean;
  seq: number;
  status?: string;
}

/**
 * Bluesky firehose event - main schema for JSONBench
 *
 * This is the primary type used for columnar shredding benchmarks.
 */
export interface BlueskyEvent {
  /** Event type discriminator */
  kind: BlueskyEventKind;

  /** Decentralized identifier (did:plc:xxx or did:web:xxx) */
  did: string;

  /** Timestamp in microseconds since epoch */
  time_us: bigint;

  /** Commit event data (when kind === 'commit') */
  commit?: CommitData;

  /** Identity event data (when kind === 'identity') */
  identity?: IdentityData;

  /** Account event data (when kind === 'account') */
  account?: AccountData;
}

/**
 * Simplified Bluesky event for shredding (JSON-serializable)
 *
 * Uses number instead of bigint for time_us to ensure JSON compatibility.
 */
export interface BlueskyEventJson {
  kind: BlueskyEventKind;
  did: string;
  time_us: number;
  commit?: {
    operation: CommitOperation;
    collection: string;
    rkey: string;
    cid?: string;
    record?: {
      text?: string;
      createdAt: string;
      langs?: string[];
      reply?: {
        parent: { uri: string; cid: string };
        root: { uri: string; cid: string };
      };
      embed?: {
        $type: string;
        [key: string]: unknown;
      };
      facets?: Array<{
        index: { byteStart: number; byteEnd: number };
        features: Array<{ $type: string; [key: string]: unknown }>;
      }>;
    };
  };
  identity?: {
    handle?: string;
    seq: number;
  };
  account?: {
    active: boolean;
    seq: number;
    status?: string;
  };
}

/**
 * Shredding result with timing metrics
 */
export interface ShredResult {
  /** Number of events shredded */
  eventCount: number;
  /** Number of columns generated */
  columnCount: number;
  /** Time to shred in milliseconds */
  shredTimeMs: number;
  /** Throughput in events per second */
  throughput: number;
  /** Total size of column values in bytes (estimated) */
  totalSizeBytes: number;
  /** Compression ratio vs JSON */
  compressionRatio: number;
}

/**
 * Benchmark result for a data size
 */
export interface BenchmarkResult {
  size: DataSize;
  eventCount: number;
  shred: ShredResult;
  encode?: {
    timeMs: number;
    outputSizeBytes: number;
    throughput: number;
  };
  decode?: {
    timeMs: number;
    throughput: number;
  };
}
