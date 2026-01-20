/**
 * IMDB Data Loader and Synthetic Generator
 *
 * Provides utilities for:
 * - Generating synthetic IMDB-like data for benchmarking
 * - Loading and transforming real IMDB TSV files (future)
 * - Converting raw data to denormalized movie documents
 */

import type {
  TitleBasics,
  TitleRatings,
  NameBasics,
  TitlePrincipals,
  TitleType,
  PrincipalCategory,
  ImdbDataSize,
} from './schema.js';
import { IMDB_DATA_SIZES } from './schema.js';
import type {
  DenormalizedMovie,
  CastMember,
  CrewMember,
  MovieRating,
} from './denormalized.js';
import {
  calculateRatingTier,
  calculateWeightedScore,
  calculateRuntimeTier,
  calculateDecadeInfo,
  generateSearchText,
} from './denormalized.js';

// ============================================================================
// Generator Configuration
// ============================================================================

/**
 * Generator configuration options
 */
export interface ImdbGeneratorConfig {
  /** Random seed for reproducibility */
  seed?: number;
  /** Year range for movies [startYear, endYear] */
  yearRange?: [number, number];
  /** Percentage of movies with ratings (0-1) */
  ratedPercentage?: number;
  /** Average cast size per movie */
  avgCastSize?: number;
  /** Average crew size per movie */
  avgCrewSize?: number;
  /** Distribution of title types */
  titleTypeDistribution?: Partial<Record<TitleType, number>>;
}

/**
 * Default generator configuration
 */
const DEFAULT_CONFIG: Required<ImdbGeneratorConfig> = {
  seed: 42,
  yearRange: [1920, 2024],
  ratedPercentage: 0.85,
  avgCastSize: 5,
  avgCrewSize: 4,
  titleTypeDistribution: {
    movie: 0.70,       // 70% feature films
    tvMovie: 0.10,     // 10% TV movies
    short: 0.10,       // 10% short films
    video: 0.05,       // 5% direct-to-video
    tvMiniSeries: 0.05, // 5% mini-series
  },
};

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

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
    this.state = (this.state * 48271) % 2147483647;
    return this.state / 2147483647;
  }

  /** Generate random integer in [min, max] */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Generate random float in [min, max] */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Pick from weighted distribution */
  weighted<T extends string>(dist: Record<T, number>): T {
    const r = this.next();
    let cumulative = 0;
    for (const [key, weight] of Object.entries(dist) as [T, number][]) {
      cumulative += weight;
      if (r < cumulative) return key;
    }
    return Object.keys(dist)[0] as T;
  }

  /** Generate random boolean with probability */
  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  /** Shuffle array in place */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Generate Poisson-distributed random number */
  poisson(lambda: number): number {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
}

// ============================================================================
// Word Lists for Realistic Data
// ============================================================================

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
  'Documentary', 'Drama', 'Family', 'Fantasy', 'Film-Noir', 'History',
  'Horror', 'Music', 'Musical', 'Mystery', 'Romance', 'Sci-Fi',
  'Sport', 'Thriller', 'War', 'Western',
];

const TITLE_WORDS = {
  adjectives: [
    'Dark', 'Lost', 'Last', 'Final', 'Secret', 'Hidden', 'Golden', 'Silver',
    'Broken', 'Silent', 'Eternal', 'Midnight', 'Crimson', 'Savage', 'Wild',
    'Deadly', 'Fatal', 'Perfect', 'Beautiful', 'Dangerous',
  ],
  nouns: [
    'Night', 'Day', 'Dream', 'Heart', 'Mind', 'World', 'City', 'Kingdom',
    'Empire', 'Legacy', 'Journey', 'Quest', 'Path', 'Road', 'Bridge',
    'River', 'Mountain', 'Forest', 'Ocean', 'Storm',
  ],
  verbs: [
    'Rising', 'Falling', 'Running', 'Dancing', 'Fighting', 'Searching',
    'Waiting', 'Dreaming', 'Awakening', 'Becoming',
  ],
  articles: ['The', 'A'],
  prepositions: ['of', 'in', 'to', 'from', 'beyond', 'under', 'over'],
};

const FIRST_NAMES = [
  // Male names
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
  'Thomas', 'Christopher', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark',
  'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian',
  'George', 'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan',
  // Female names
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan',
  'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra',
  'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Dorothy', 'Carol',
  'Amanda', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Sharon', 'Laura',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen',
  'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera',
];

const CHARACTER_PREFIXES = [
  'Detective', 'Dr.', 'Agent', 'Captain', 'Professor', 'Sheriff', 'King',
  'Queen', 'Prince', 'Princess', 'Lord', 'Lady', 'Sir', 'Officer', 'General',
];

const PROFESSIONS = [
  'actor', 'actress', 'director', 'writer', 'producer', 'composer',
  'cinematographer', 'editor', 'production_designer',
];

// ============================================================================
// Synthetic Data Generators
// ============================================================================

/**
 * Generate a random movie title
 */
function generateTitle(rng: SeededRandom): string {
  const patterns = [
    // "The Adjective Noun"
    () => `${rng.pick(TITLE_WORDS.articles)} ${rng.pick(TITLE_WORDS.adjectives)} ${rng.pick(TITLE_WORDS.nouns)}`,
    // "Noun of the Noun"
    () => `${rng.pick(TITLE_WORDS.nouns)} ${rng.pick(TITLE_WORDS.prepositions)} the ${rng.pick(TITLE_WORDS.nouns)}`,
    // "The Verb"
    () => `The ${rng.pick(TITLE_WORDS.verbs)}`,
    // "Adjective Noun"
    () => `${rng.pick(TITLE_WORDS.adjectives)} ${rng.pick(TITLE_WORDS.nouns)}`,
    // Single word
    () => rng.pick(TITLE_WORDS.nouns),
  ];

  return rng.pick(patterns)();
}

/**
 * Generate a random person name
 */
function generatePersonName(rng: SeededRandom): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

/**
 * Generate a random character name
 */
function generateCharacterName(rng: SeededRandom): string {
  if (rng.bool(0.3)) {
    return `${rng.pick(CHARACTER_PREFIXES)} ${rng.pick(LAST_NAMES)}`;
  }
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

/**
 * Generate a tconst (title constant) identifier
 */
function generateTconst(index: number): string {
  return `tt${String(index).padStart(7, '0')}`;
}

/**
 * Generate an nconst (name constant) identifier
 */
function generateNconst(index: number): string {
  return `nm${String(index).padStart(7, '0')}`;
}

/**
 * Generate random genres for a movie
 */
function generateGenres(rng: SeededRandom): string[] {
  const count = rng.int(1, 3);
  const shuffled = rng.shuffle([...GENRES]);
  return shuffled.slice(0, count);
}

/**
 * Generate a random rating
 */
function generateRating(rng: SeededRandom, year: number | null): MovieRating | null {
  // Older movies tend to have higher ratings (survivorship bias)
  const yearBonus = year ? Math.max(0, (1970 - year) / 100) : 0;

  // Base rating with slight skew toward higher ratings
  const base = rng.float(4.0, 9.5) + yearBonus;
  const average = Math.min(10, Math.max(1, Math.round(base * 10) / 10));

  // Votes follow a power law distribution
  const voteBase = Math.pow(10, rng.float(1, 6));
  const votes = Math.round(voteBase);

  const tier = calculateRatingTier(average);
  const weightedScore = calculateWeightedScore(average, votes);

  return { average, votes, tier, weightedScore };
}

/**
 * Generate cast members for a movie
 */
function generateCast(
  rng: SeededRandom,
  avgSize: number,
  personCache: Map<string, { name: string; birthYear: number | null; professions: string[] }>
): CastMember[] {
  const size = Math.max(1, rng.poisson(avgSize));
  const cast: CastMember[] = [];

  for (let i = 0; i < size; i++) {
    const id = generateNconst(personCache.size + 1);
    const name = generatePersonName(rng);
    const birthYear = rng.bool(0.9) ? rng.int(1930, 2000) : null;
    const professions = rng.shuffle([...PROFESSIONS]).slice(0, rng.int(1, 3));

    personCache.set(id, { name, birthYear, professions });

    const characterCount = rng.int(1, 2);
    const characters: string[] = [];
    for (let c = 0; c < characterCount; c++) {
      characters.push(generateCharacterName(rng));
    }

    cast.push({
      id,
      name,
      category: rng.bool(0.5) ? 'actor' : 'actress',
      characters,
      ordering: i + 1,
      birthYear,
      professions,
    });
  }

  return cast;
}

/**
 * Generate crew members for a movie
 */
function generateCrew(
  rng: SeededRandom,
  avgSize: number,
  personCache: Map<string, { name: string; birthYear: number | null; professions: string[] }>
): CrewMember[] {
  const size = Math.max(1, rng.poisson(avgSize));
  const crew: CrewMember[] = [];

  const categories: Exclude<PrincipalCategory, 'actor' | 'actress'>[] = [
    'director', 'writer', 'producer', 'composer', 'cinematographer', 'editor',
  ];

  // Always have at least one director
  const directorCount = rng.int(1, 2);
  for (let i = 0; i < directorCount; i++) {
    const id = generateNconst(personCache.size + 1);
    const name = generatePersonName(rng);
    const birthYear = rng.bool(0.9) ? rng.int(1920, 1990) : null;
    const professions = ['director', ...rng.shuffle([...PROFESSIONS]).slice(0, rng.int(0, 2))];

    personCache.set(id, { name, birthYear, professions });

    crew.push({
      id,
      name,
      category: 'director',
      job: null,
      ordering: i + 1,
      birthYear,
      professions,
    });
  }

  // Add other crew members
  for (let i = directorCount; i < size; i++) {
    const id = generateNconst(personCache.size + 1);
    const name = generatePersonName(rng);
    const birthYear = rng.bool(0.9) ? rng.int(1920, 1990) : null;
    const category = rng.pick(categories.filter(c => c !== 'director'));
    const professions = [category, ...rng.shuffle([...PROFESSIONS]).slice(0, rng.int(0, 2))];

    personCache.set(id, { name, birthYear, professions });

    crew.push({
      id,
      name,
      category,
      job: category === 'writer' ? (rng.bool(0.3) ? 'screenplay' : null) : null,
      ordering: i + 1,
      birthYear,
      professions,
    });
  }

  return crew;
}

// ============================================================================
// Main Generator Functions
// ============================================================================

/**
 * Generate a single denormalized movie document
 */
export function generateMovie(
  index: number,
  rng: SeededRandom,
  config: Required<ImdbGeneratorConfig>,
  personCache: Map<string, { name: string; birthYear: number | null; professions: string[] }>
): DenormalizedMovie {
  const id = generateTconst(index);
  const type = rng.weighted(config.titleTypeDistribution as Record<TitleType, number>);
  const title = generateTitle(rng);
  const originalTitle = rng.bool(0.1) ? generateTitle(rng) : title;

  const year = rng.bool(0.95)
    ? rng.int(config.yearRange[0], config.yearRange[1])
    : null;

  const runtimeMinutes = type === 'short'
    ? rng.int(5, 40)
    : type === 'movie'
      ? rng.int(70, 200)
      : rng.int(45, 120);

  const genres = generateGenres(rng);
  const rating = rng.bool(config.ratedPercentage)
    ? generateRating(rng, year)
    : null;

  const cast = generateCast(rng, config.avgCastSize, personCache);
  const crew = generateCrew(rng, config.avgCrewSize, personCache);

  const directors = crew.filter(c => c.category === 'director').map(c => c.name);
  const writers = crew.filter(c => c.category === 'writer').map(c => c.name);
  const castNames = cast.map(c => c.name);
  const crewNames = crew.map(c => c.name);

  const decade = calculateDecadeInfo(year);
  const isClassic = year !== null && year < 1970 && rating !== null && rating.average >= 7.5;
  const isBlockbuster = rating !== null && rating.votes > 100000 && rating.average >= 7.0;

  return {
    id,
    type,
    title,
    originalTitle,
    hasAlternateTitle: title !== originalTitle,
    isAdult: rng.bool(0.02),
    year,
    runtimeMinutes,
    runtimeTier: calculateRuntimeTier(runtimeMinutes),
    genres,
    primaryGenre: genres[0] || null,
    genreCount: genres.length,
    decade,
    endYear: type === 'tvMiniSeries' ? (year ? year + rng.int(0, 3) : null) : null,
    isOngoing: false,
    rating,
    hasSignificantVotes: rating !== null && rating.votes >= 1000,
    cast,
    castSize: cast.length,
    leadActor: cast[0]?.name || null,
    castNames,
    crew,
    crewSize: crew.length,
    directors,
    writers,
    primaryDirector: directors[0] || null,
    crewNames,
    totalPeople: cast.length + crew.length,
    isClassic,
    isBlockbuster,
    searchText: generateSearchText(title, originalTitle, castNames, directors),
  };
}

/**
 * Generate an array of denormalized movie documents
 *
 * @param count Number of movies to generate
 * @param config Generator configuration
 * @returns Array of denormalized movies
 */
export function generateMovies(
  count: number,
  config: ImdbGeneratorConfig = {}
): DenormalizedMovie[] {
  const fullConfig: Required<ImdbGeneratorConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = new SeededRandom(fullConfig.seed);
  const personCache = new Map<string, { name: string; birthYear: number | null; professions: string[] }>();
  const movies: DenormalizedMovie[] = new Array(count);

  for (let i = 0; i < count; i++) {
    movies[i] = generateMovie(i + 1, rng, fullConfig, personCache);
  }

  return movies;
}

/**
 * Generate a dataset of the specified size
 *
 * @param size Data size preset
 * @param config Generator configuration
 * @returns Array of denormalized movies
 */
export function generateImdbDataset(
  size: ImdbDataSize,
  config: ImdbGeneratorConfig = {}
): DenormalizedMovie[] {
  return generateMovies(IMDB_DATA_SIZES[size], config);
}

/**
 * Generate movies as an async iterator (for large datasets)
 *
 * @param count Number of movies to generate
 * @param batchSize Movies per batch
 * @param config Generator configuration
 */
export async function* generateMoviesIterator(
  count: number,
  batchSize = 1000,
  config: ImdbGeneratorConfig = {}
): AsyncGenerator<DenormalizedMovie[], void, unknown> {
  const fullConfig: Required<ImdbGeneratorConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = new SeededRandom(fullConfig.seed);
  const personCache = new Map<string, { name: string; birthYear: number | null; professions: string[] }>();
  let remaining = count;
  let index = 1;

  while (remaining > 0) {
    const batchCount = Math.min(batchSize, remaining);
    const batch: DenormalizedMovie[] = new Array(batchCount);

    for (let i = 0; i < batchCount; i++) {
      batch[i] = generateMovie(index++, rng, fullConfig, personCache);
    }

    remaining -= batchCount;
    yield batch;
  }
}

/**
 * Estimate memory usage for generated movies
 *
 * @param count Number of movies
 * @returns Estimated memory in bytes
 */
export function estimateMovieMemoryUsage(count: number): number {
  // Average movie document is ~2KB in memory (more nested than Bluesky events)
  const avgMovieSize = 2048;
  return count * avgMovieSize;
}

/**
 * Estimate JSON size for generated movies
 *
 * @param count Number of movies
 * @returns Estimated JSON size in bytes
 */
export function estimateMovieJsonSize(count: number): number {
  // Average JSON serialized size is ~1.5KB
  const avgJsonSize = 1536;
  return count * avgJsonSize;
}
