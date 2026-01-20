/**
 * ClickBench Data Loader
 *
 * Provides utilities to generate synthetic ClickBench data matching the
 * official schema. This is useful for testing without downloading the
 * full 100M row dataset (~15GB compressed).
 *
 * The synthetic data maintains realistic distributions and cardinalities
 * to ensure meaningful benchmark results.
 *
 * @see https://github.com/ClickHouse/ClickBench
 */

import {
  CLICKBENCH_SIZES,
  CLICKBENCH_CARDINALITY,
  type ClickBenchDataSize,
} from './schema.js';

/**
 * Seeded random number generator for reproducible data generation
 */
class SeededRandom {
  private state: number;

  constructor(seed: number = 42) {
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

  /** Generate random bigint in [min, max] */
  bigInt(min: bigint, max: bigint): bigint {
    const range = max - min;
    const rand = BigInt(Math.floor(this.next() * Number(range)));
    return min + rand;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Generate random boolean with probability */
  bool(probability: number = 0.5): boolean {
    return this.next() < probability;
  }

  /** Zipf distribution for skewed cardinalities */
  zipf(max: number, skew: number = 1.0): number {
    const u = this.next();
    const harmonic = Array.from({ length: max }, (_, i) =>
      1 / Math.pow(i + 1, skew)
    ).reduce((a, b) => a + b, 0);

    let cumulative = 0;
    for (let i = 0; i < max; i++) {
      cumulative += (1 / Math.pow(i + 1, skew)) / harmonic;
      if (u < cumulative) return i;
    }
    return max - 1;
  }
}

/**
 * Hit record matching ClickBench schema
 */
export interface HitRecord {
  WatchID: bigint;
  JavaEnable: number;
  Title: string;
  GoodEvent: number;
  EventTime: Date;
  EventDate: string;
  CounterID: number;
  ClientIP: number;
  RegionID: number;
  UserID: bigint;
  CounterClass: number;
  OS: number;
  UserAgent: number;
  URL: string;
  Referer: string;
  IsRefresh: number;
  RefererCategoryID: number;
  RefererRegionID: number;
  URLCategoryID: number;
  URLRegionID: number;
  ResolutionWidth: number;
  ResolutionHeight: number;
  ResolutionDepth: number;
  FlashMajor: number;
  FlashMinor: number;
  FlashMinor2: string;
  NetMajor: number;
  NetMinor: number;
  UserAgentMajor: number;
  UserAgentMinor: string;
  CookieEnable: number;
  JavascriptEnable: number;
  IsMobile: number;
  MobilePhone: number;
  MobilePhoneModel: string;
  Params: string;
  IPNetworkID: number;
  TraficSourceID: number;
  SearchEngineID: number;
  SearchPhrase: string;
  AdvEngineID: number;
  IsArtifical: number;
  WindowClientWidth: number;
  WindowClientHeight: number;
  ClientTimeZone: number;
  ClientEventTime: Date;
  SilverlightVersion1: number;
  SilverlightVersion2: number;
  SilverlightVersion3: number;
  SilverlightVersion4: number;
  PageCharset: string;
  CodeVersion: number;
  IsLink: number;
  IsDownload: number;
  IsNotBounce: number;
  FUniqID: bigint;
  OriginalURL: string;
  HID: number;
  IsOldCounter: number;
  IsEvent: number;
  IsParameter: number;
  DontCountHits: number;
  WithHash: number;
  HitColor: string;
  LocalEventTime: Date;
  Age: number;
  Sex: number;
  Income: number;
  Interests: number;
  Robotness: number;
  RemoteIP: number;
  WindowName: number;
  OpenerName: number;
  HistoryLength: number;
  BrowserLanguage: string;
  BrowserCountry: string;
  SocialNetwork: string;
  SocialAction: string;
  HTTPError: number;
  SendTiming: number;
  DNSTiming: number;
  ConnectTiming: number;
  ResponseStartTiming: number;
  ResponseEndTiming: number;
  FetchTiming: number;
  SocialSourceNetworkID: number;
  SocialSourcePage: string;
  ParamPrice: bigint;
  ParamOrderID: string;
  ParamCurrency: string;
  ParamCurrencyID: number;
  OpenstatServiceName: string;
  OpenstatCampaignID: string;
  OpenstatAdID: string;
  OpenstatSourceID: string;
  UTMSource: string;
  UTMMedium: string;
  UTMCampaign: string;
  UTMContent: string;
  UTMTerm: string;
  FromTag: string;
  HasGCLID: number;
  RefererHash: bigint;
  URLHash: bigint;
  CLID: number;
}

/**
 * JSON-serializable hit record (bigint -> number for JSON)
 */
export interface HitRecordJson {
  WatchID: number;
  JavaEnable: number;
  Title: string;
  GoodEvent: number;
  EventTime: string;
  EventDate: string;
  CounterID: number;
  ClientIP: number;
  RegionID: number;
  UserID: number;
  CounterClass: number;
  OS: number;
  UserAgent: number;
  URL: string;
  Referer: string;
  IsRefresh: number;
  RefererCategoryID: number;
  RefererRegionID: number;
  URLCategoryID: number;
  URLRegionID: number;
  ResolutionWidth: number;
  ResolutionHeight: number;
  ResolutionDepth: number;
  FlashMajor: number;
  FlashMinor: number;
  FlashMinor2: string;
  NetMajor: number;
  NetMinor: number;
  UserAgentMajor: number;
  UserAgentMinor: string;
  CookieEnable: number;
  JavascriptEnable: number;
  IsMobile: number;
  MobilePhone: number;
  MobilePhoneModel: string;
  Params: string;
  IPNetworkID: number;
  TraficSourceID: number;
  SearchEngineID: number;
  SearchPhrase: string;
  AdvEngineID: number;
  IsArtifical: number;
  WindowClientWidth: number;
  WindowClientHeight: number;
  ClientTimeZone: number;
  ClientEventTime: string;
  SilverlightVersion1: number;
  SilverlightVersion2: number;
  SilverlightVersion3: number;
  SilverlightVersion4: number;
  PageCharset: string;
  CodeVersion: number;
  IsLink: number;
  IsDownload: number;
  IsNotBounce: number;
  FUniqID: number;
  OriginalURL: string;
  HID: number;
  IsOldCounter: number;
  IsEvent: number;
  IsParameter: number;
  DontCountHits: number;
  WithHash: number;
  HitColor: string;
  LocalEventTime: string;
  Age: number;
  Sex: number;
  Income: number;
  Interests: number;
  Robotness: number;
  RemoteIP: number;
  WindowName: number;
  OpenerName: number;
  HistoryLength: number;
  BrowserLanguage: string;
  BrowserCountry: string;
  SocialNetwork: string;
  SocialAction: string;
  HTTPError: number;
  SendTiming: number;
  DNSTiming: number;
  ConnectTiming: number;
  ResponseStartTiming: number;
  ResponseEndTiming: number;
  FetchTiming: number;
  SocialSourceNetworkID: number;
  SocialSourcePage: string;
  ParamPrice: number;
  ParamOrderID: string;
  ParamCurrency: string;
  ParamCurrencyID: number;
  OpenstatServiceName: string;
  OpenstatCampaignID: string;
  OpenstatAdID: string;
  OpenstatSourceID: string;
  UTMSource: string;
  UTMMedium: string;
  UTMCampaign: string;
  UTMContent: string;
  UTMTerm: string;
  FromTag: string;
  HasGCLID: number;
  RefererHash: number;
  URLHash: number;
  CLID: number;
}

/**
 * Generator configuration
 */
export interface LoaderConfig {
  /** Random seed for reproducibility */
  seed?: number;
  /** Base timestamp for event generation (ms since epoch) */
  baseTimestamp?: number;
  /** Time range span in days */
  timeRangeDays?: number;
  /** Distribution of CounterID (zipf skew) */
  counterIdSkew?: number;
  /** Distribution of UserID (zipf skew) */
  userIdSkew?: number;
  /** Probability of having a search phrase */
  searchPhraseProb?: number;
  /** Probability of having marketing parameters */
  marketingProb?: number;
}

/**
 * Default configuration matching realistic ClickBench distributions
 */
const DEFAULT_CONFIG: Required<LoaderConfig> = {
  seed: 42,
  baseTimestamp: new Date('2013-07-01').getTime(), // ClickBench date range
  timeRangeDays: 90, // 3 months of data
  counterIdSkew: 1.2,
  userIdSkew: 0.8,
  searchPhraseProb: 0.15,
  marketingProb: 0.20,
};

// Common value pools for realistic data
const TITLES = [
  '', 'Home', 'Search Results', 'Product Page', 'Category',
  'Cart', 'Checkout', 'Order Confirmation', 'Login', 'Register',
  'About Us', 'Contact', 'FAQ', 'Blog', 'News',
];

const MOBILE_PHONES = [
  '', 'iPhone', 'Samsung', 'Xiaomi', 'Huawei', 'OPPO', 'Vivo',
  'OnePlus', 'Google Pixel', 'Motorola', 'Nokia',
];

const SEARCH_PHRASES = [
  '', 'buy online', 'best price', 'discount', 'sale', 'free shipping',
  'reviews', 'compare prices', 'shop', 'order', 'cheap',
  'new products', 'trending', 'popular', 'recommended',
];

const UTM_SOURCES = [
  '', 'google', 'facebook', 'twitter', 'instagram', 'bing',
  'email', 'direct', 'referral', 'affiliate', 'linkedin',
];

const UTM_MEDIUMS = [
  '', 'cpc', 'organic', 'social', 'email', 'referral',
  'display', 'affiliate', 'video', 'retargeting',
];

const UTM_CAMPAIGNS = [
  '', 'summer_sale', 'black_friday', 'new_year', 'spring_promo',
  'brand_awareness', 'retargeting', 'newsletter', 'product_launch',
];

const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es', 'ja', 'zh', 'pt', 'it', 'nl'];
const COUNTRIES = ['US', 'RU', 'DE', 'FR', 'GB', 'JP', 'CN', 'BR', 'IT', 'NL'];

const RESOLUTIONS = [
  { w: 1920, h: 1080 }, { w: 1366, h: 768 }, { w: 1440, h: 900 },
  { w: 1536, h: 864 }, { w: 1280, h: 720 }, { w: 1600, h: 900 },
  { w: 2560, h: 1440 }, { w: 3840, h: 2160 }, { w: 375, h: 667 },
  { w: 414, h: 896 }, { w: 360, h: 640 }, { w: 768, h: 1024 },
];

const CHARSETS = ['UTF-8', 'UTF-8', 'UTF-8', 'windows-1251', 'ISO-8859-1'];
const HIT_COLORS = ['', '1', '2', '3', '4', '5'];

/**
 * Generate a single hit record
 */
function generateHit(
  rng: SeededRandom,
  config: Required<LoaderConfig>,
  index: number
): HitRecordJson {
  // Generate timestamps
  const eventTimeMs = config.baseTimestamp +
    rng.int(0, config.timeRangeDays * 24 * 60 * 60 * 1000);
  const eventTime = new Date(eventTimeMs);
  const eventDate = eventTime.toISOString().split('T')[0];

  // Generate IDs with proper distributions
  const counterIdBase = rng.zipf(
    CLICKBENCH_CARDINALITY.CounterID ?? 50000,
    config.counterIdSkew
  );
  const counterId = counterIdBase + 1;

  const userIdBase = rng.zipf(
    CLICKBENCH_CARDINALITY.UserID ?? 10_000_000,
    config.userIdSkew
  );
  const userId = userIdBase + 1000000000;

  const watchId = index + 1000000000000;

  // Generate region and IP
  const regionId = rng.int(1, 10000);
  const clientIP = rng.int(1, 0xFFFFFFFF);
  const remoteIP = rng.int(1, 0xFFFFFFFF);

  // Resolution
  const resolution = rng.pick(RESOLUTIONS);

  // Device info
  const isMobile = rng.bool(0.35) ? 1 : 0;
  const mobilePhone = isMobile ? rng.int(1, 200) : 0;
  const mobilePhoneModel = isMobile ? rng.pick(MOBILE_PHONES) : '';

  // OS and browser
  const os = rng.int(1, 50);
  const userAgent = rng.int(1, 500);
  const userAgentMajor = rng.int(1, 100);
  const userAgentMinor = String(rng.int(0, 99));

  // URLs
  const urlPath = `/page/${rng.int(1, 1000)}`;
  const domain = `site${rng.int(1, 100)}.com`;
  const url = `https://${domain}${urlPath}`;
  const urlHash = hashString(url);

  // Referer
  const hasReferer = rng.bool(0.7);
  const referer = hasReferer
    ? `https://referer${rng.int(1, 500)}.com/path/${rng.int(1, 100)}`
    : '';
  const refererHash = hasReferer ? hashString(referer) : 0;

  // Search
  const hasSearch = rng.bool(config.searchPhraseProb);
  const searchEngineId = hasSearch ? rng.int(1, 100) : 0;
  const searchPhrase = hasSearch ? rng.pick(SEARCH_PHRASES) : '';

  // Marketing
  const hasMarketing = rng.bool(config.marketingProb);
  const advEngineId = hasMarketing ? rng.int(1, 30) : 0;

  // UTM parameters
  const hasUTM = rng.bool(0.25);
  const utmSource = hasUTM ? rng.pick(UTM_SOURCES) : '';
  const utmMedium = hasUTM ? rng.pick(UTM_MEDIUMS) : '';
  const utmCampaign = hasUTM ? rng.pick(UTM_CAMPAIGNS) : '';
  const utmContent = hasUTM && rng.bool(0.5) ? `content_${rng.int(1, 100)}` : '';
  const utmTerm = hasUTM && rng.bool(0.3) ? rng.pick(SEARCH_PHRASES) : '';

  // Timing metrics (in ms)
  const dnsTiming = rng.int(0, 200);
  const connectTiming = dnsTiming + rng.int(0, 300);
  const sendTiming = connectTiming + rng.int(0, 100);
  const responseStartTiming = sendTiming + rng.int(100, 500);
  const responseEndTiming = responseStartTiming + rng.int(100, 2000);
  const fetchTiming = responseEndTiming + rng.int(0, 500);

  // Boolean flags
  const isRefresh = rng.bool(0.05) ? 1 : 0;
  const isLink = rng.bool(0.1) ? 1 : 0;
  const isDownload = rng.bool(0.02) ? 1 : 0;
  const isNotBounce = rng.bool(0.6) ? 1 : 0;

  return {
    WatchID: watchId,
    JavaEnable: rng.bool(0.9) ? 1 : 0,
    Title: rng.pick(TITLES),
    GoodEvent: rng.bool(0.98) ? 1 : 0,
    EventTime: eventTime.toISOString(),
    EventDate: eventDate,
    CounterID: counterId,
    ClientIP: clientIP,
    RegionID: regionId,
    UserID: userId,
    CounterClass: rng.int(0, 9),
    OS: os,
    UserAgent: userAgent,
    URL: url,
    Referer: referer,
    IsRefresh: isRefresh,
    RefererCategoryID: hasReferer ? rng.int(1, 1000) : 0,
    RefererRegionID: hasReferer ? rng.int(1, 10000) : 0,
    URLCategoryID: rng.int(1, 1000),
    URLRegionID: rng.int(1, 10000),
    ResolutionWidth: resolution.w,
    ResolutionHeight: resolution.h,
    ResolutionDepth: rng.pick([8, 16, 24, 32]),
    FlashMajor: rng.int(0, 20),
    FlashMinor: rng.int(0, 10),
    FlashMinor2: rng.int(0, 100).toString(),
    NetMajor: rng.int(0, 10),
    NetMinor: rng.int(0, 10),
    UserAgentMajor: userAgentMajor,
    UserAgentMinor: userAgentMinor,
    CookieEnable: rng.bool(0.95) ? 1 : 0,
    JavascriptEnable: rng.bool(0.98) ? 1 : 0,
    IsMobile: isMobile,
    MobilePhone: mobilePhone,
    MobilePhoneModel: mobilePhoneModel,
    Params: '',
    IPNetworkID: rng.int(1, 1000),
    TraficSourceID: rng.int(-1, 10),
    SearchEngineID: searchEngineId,
    SearchPhrase: searchPhrase,
    AdvEngineID: advEngineId,
    IsArtifical: rng.bool(0.01) ? 1 : 0,
    WindowClientWidth: resolution.w - rng.int(0, 100),
    WindowClientHeight: resolution.h - rng.int(0, 200),
    ClientTimeZone: rng.int(-12, 12) * 60,
    ClientEventTime: new Date(eventTimeMs + rng.int(-1000, 1000)).toISOString(),
    SilverlightVersion1: rng.bool(0.3) ? rng.int(1, 5) : 0,
    SilverlightVersion2: rng.int(0, 10),
    SilverlightVersion3: rng.int(0, 100),
    SilverlightVersion4: rng.int(0, 100),
    PageCharset: rng.pick(CHARSETS),
    CodeVersion: rng.int(1, 200),
    IsLink: isLink,
    IsDownload: isDownload,
    IsNotBounce: isNotBounce,
    FUniqID: watchId + rng.int(1, 1000),
    OriginalURL: url,
    HID: rng.int(1, 1000000),
    IsOldCounter: rng.bool(0.1) ? 1 : 0,
    IsEvent: rng.bool(0.1) ? 1 : 0,
    IsParameter: rng.bool(0.05) ? 1 : 0,
    DontCountHits: rng.bool(0.02) ? 1 : 0,
    WithHash: rng.bool(0.3) ? 1 : 0,
    HitColor: rng.pick(HIT_COLORS),
    LocalEventTime: new Date(eventTimeMs + rng.int(-3600000, 3600000)).toISOString(),
    Age: rng.int(0, 100),
    Sex: rng.int(0, 2),
    Income: rng.int(0, 4),
    Interests: rng.int(0, 1000),
    Robotness: rng.int(0, 100),
    RemoteIP: remoteIP,
    WindowName: rng.int(0, 100),
    OpenerName: rng.int(0, 100),
    HistoryLength: rng.int(1, 50),
    BrowserLanguage: rng.pick(LANGUAGES),
    BrowserCountry: rng.pick(COUNTRIES),
    SocialNetwork: rng.bool(0.1) ? `social_${rng.int(1, 10)}` : '',
    SocialAction: rng.bool(0.1) ? `action_${rng.int(1, 5)}` : '',
    HTTPError: rng.bool(0.02) ? rng.pick([400, 404, 500, 502, 503]) : 0,
    SendTiming: sendTiming,
    DNSTiming: dnsTiming,
    ConnectTiming: connectTiming,
    ResponseStartTiming: responseStartTiming,
    ResponseEndTiming: responseEndTiming,
    FetchTiming: fetchTiming,
    SocialSourceNetworkID: rng.bool(0.05) ? rng.int(1, 20) : 0,
    SocialSourcePage: rng.bool(0.05) ? `https://social${rng.int(1, 5)}.com/page` : '',
    ParamPrice: rng.bool(0.1) ? rng.int(100, 100000) : 0,
    ParamOrderID: rng.bool(0.05) ? `order_${rng.int(1, 1000000)}` : '',
    ParamCurrency: rng.bool(0.1) ? rng.pick(['USD', 'EUR', 'RUB', 'GBP']) : '',
    ParamCurrencyID: rng.bool(0.1) ? rng.int(1, 200) : 0,
    OpenstatServiceName: rng.bool(0.05) ? `service_${rng.int(1, 10)}` : '',
    OpenstatCampaignID: rng.bool(0.05) ? `campaign_${rng.int(1, 100)}` : '',
    OpenstatAdID: rng.bool(0.05) ? `ad_${rng.int(1, 1000)}` : '',
    OpenstatSourceID: rng.bool(0.05) ? `source_${rng.int(1, 50)}` : '',
    UTMSource: utmSource,
    UTMMedium: utmMedium,
    UTMCampaign: utmCampaign,
    UTMContent: utmContent,
    UTMTerm: utmTerm,
    FromTag: rng.bool(0.1) ? `tag_${rng.int(1, 100)}` : '',
    HasGCLID: rng.bool(0.15) ? 1 : 0,
    RefererHash: refererHash,
    URLHash: urlHash,
    CLID: rng.bool(0.2) ? rng.int(1, 10000) : 0,
  };
}

/**
 * Simple hash function for URLs
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate synthetic ClickBench hits data
 *
 * @param count Number of records to generate
 * @param config Generator configuration
 * @returns Array of hit records
 */
export function generateHits(
  count: number,
  config: LoaderConfig = {}
): HitRecordJson[] {
  const fullConfig: Required<LoaderConfig> = { ...DEFAULT_CONFIG, ...config };
  const rng = new SeededRandom(fullConfig.seed);
  const hits: HitRecordJson[] = new Array(count);

  for (let i = 0; i < count; i++) {
    hits[i] = generateHit(rng, fullConfig, i);
  }

  return hits;
}

/**
 * Generate hits for a specific size preset
 *
 * @param size Size preset
 * @param config Generator configuration
 * @returns Array of hit records
 */
export function generateHitsForSize(
  size: ClickBenchDataSize,
  config: LoaderConfig = {}
): HitRecordJson[] {
  return generateHits(CLICKBENCH_SIZES[size], config);
}

/**
 * Generate hits as an async iterator for large datasets
 *
 * @param count Total number of records
 * @param batchSize Records per batch
 * @param config Generator configuration
 */
export async function* generateHitsIterator(
  count: number,
  batchSize: number = 10000,
  config: LoaderConfig = {}
): AsyncGenerator<HitRecordJson[], void, unknown> {
  const fullConfig: Required<LoaderConfig> = { ...DEFAULT_CONFIG, ...config };
  const rng = new SeededRandom(fullConfig.seed);
  let remaining = count;
  let offset = 0;

  while (remaining > 0) {
    const batchCount = Math.min(batchSize, remaining);
    const batch: HitRecordJson[] = new Array(batchCount);

    for (let i = 0; i < batchCount; i++) {
      batch[i] = generateHit(rng, fullConfig, offset + i);
    }

    remaining -= batchCount;
    offset += batchCount;
    yield batch;
  }
}

/**
 * Estimate memory usage for generated data
 *
 * @param count Number of records
 * @returns Estimated memory in bytes
 */
export function estimateMemoryUsage(count: number): number {
  // Average record size is approximately 800 bytes in memory
  const avgRecordSize = 800;
  return count * avgRecordSize;
}

/**
 * Estimate JSON size for generated data
 *
 * @param count Number of records
 * @returns Estimated JSON size in bytes
 */
export function estimateJsonSize(count: number): number {
  // Average JSON serialized size is approximately 1200 bytes
  const avgJsonSize = 1200;
  return count * avgJsonSize;
}

/**
 * Data generation statistics
 */
export interface GenerationStats {
  /** Number of records generated */
  recordCount: number;
  /** Time to generate in milliseconds */
  generationTimeMs: number;
  /** Throughput in records per second */
  throughput: number;
  /** Estimated memory usage in bytes */
  memoryBytes: number;
  /** Estimated JSON size in bytes */
  jsonBytes: number;
}

/**
 * Generate hits with statistics
 *
 * @param count Number of records
 * @param config Generator configuration
 * @returns Hits and generation statistics
 */
export function generateHitsWithStats(
  count: number,
  config: LoaderConfig = {}
): { hits: HitRecordJson[]; stats: GenerationStats } {
  const startTime = performance.now();
  const hits = generateHits(count, config);
  const endTime = performance.now();

  const generationTimeMs = endTime - startTime;

  return {
    hits,
    stats: {
      recordCount: count,
      generationTimeMs,
      throughput: count / (generationTimeMs / 1000),
      memoryBytes: estimateMemoryUsage(count),
      jsonBytes: estimateJsonSize(count),
    },
  };
}

/**
 * ClickBench data download URLs (for reference)
 */
export const CLICKBENCH_URLS = {
  hits_parquet: 'https://datasets.clickhouse.com/hits_compatible/hits.parquet',
  hits_tsv_lz4: 'https://datasets.clickhouse.com/hits_compatible/hits.tsv.lz4',
  hits_json_gz: 'https://datasets.clickhouse.com/hits_compatible/hits.json.gz',
  partitioned_parquet: 'https://datasets.clickhouse.com/hits_compatible/athena_partitioned/',
} as const;

/**
 * Print download instructions for full ClickBench dataset
 */
export function printDownloadInstructions(): void {
  console.log(`
ClickBench Dataset Download Instructions
========================================

The full ClickBench dataset contains ~100 million rows (~15GB compressed).

Option 1: Parquet (Recommended for EvoDB)
  curl -O ${CLICKBENCH_URLS.hits_parquet}
  # Size: ~15GB, 99,997,497 rows

Option 2: TSV compressed with LZ4
  curl -O ${CLICKBENCH_URLS.hits_tsv_lz4}
  # Size: ~3GB compressed, ~75GB uncompressed

Option 3: JSON compressed with gzip
  curl -O ${CLICKBENCH_URLS.hits_json_gz}
  # Size: ~10GB compressed

Option 4: Partitioned Parquet (100 files)
  aws s3 sync s3://datasets.clickhouse.com/hits_compatible/athena_partitioned/ ./partitioned/
  # Good for parallel loading

For testing, use the synthetic data generator instead:
  import { generateHitsForSize } from '@evodb/benchmark/datasets/clickbench';
  const hits = generateHitsForSize('medium'); // 1M rows
`);
}
