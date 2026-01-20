/**
 * IMDB Dataset Schema Types
 *
 * TypeScript definitions matching the IMDB Non-Commercial Datasets.
 * @see https://developer.imdb.com/non-commercial-datasets/
 * @see https://datasets.imdbws.com/
 */

// ============================================================================
// Raw IMDB Dataset Types (matching TSV schema)
// ============================================================================

/**
 * title.basics.tsv.gz - Basic title information
 */
export interface TitleBasics {
  /** Alphanumeric unique identifier (e.g., tt0000001) */
  tconst: string;
  /** Type of title (movie, short, tvSeries, tvEpisode, etc.) */
  titleType: TitleType;
  /** Primary title used for promotional materials */
  primaryTitle: string;
  /** Original title in the original language */
  originalTitle: string;
  /** Whether the title is adult content (0 or 1) */
  isAdult: boolean;
  /** Release year or series start year */
  startYear: number | null;
  /** TV series end year (null for movies or ongoing series) */
  endYear: number | null;
  /** Primary runtime in minutes */
  runtimeMinutes: number | null;
  /** Array of genre strings */
  genres: string[];
}

/**
 * Title type enumeration
 */
export type TitleType =
  | 'movie'
  | 'short'
  | 'tvSeries'
  | 'tvEpisode'
  | 'tvMovie'
  | 'tvMiniSeries'
  | 'tvSpecial'
  | 'video'
  | 'videoGame';

/**
 * title.ratings.tsv.gz - IMDb ratings
 */
export interface TitleRatings {
  /** Title identifier */
  tconst: string;
  /** Weighted average of all user ratings (1-10 scale) */
  averageRating: number;
  /** Number of votes the title has received */
  numVotes: number;
}

/**
 * name.basics.tsv.gz - Person information
 */
export interface NameBasics {
  /** Alphanumeric unique identifier (e.g., nm0000001) */
  nconst: string;
  /** Name by which the person is most often credited */
  primaryName: string;
  /** Birth year (null if unknown) */
  birthYear: number | null;
  /** Death year (null if alive or unknown) */
  deathYear: number | null;
  /** Top 3 professions (e.g., ["actor", "producer", "writer"]) */
  primaryProfession: string[];
  /** Titles the person is known for (array of tconst) */
  knownForTitles: string[];
}

/**
 * title.principals.tsv.gz - Principal cast/crew for titles
 */
export interface TitlePrincipals {
  /** Title identifier */
  tconst: string;
  /** Row number to uniquely identify rows for a given tconst */
  ordering: number;
  /** Person identifier */
  nconst: string;
  /** Category of job (actor, actress, director, writer, etc.) */
  category: PrincipalCategory;
  /** Specific job title (null for actors/actresses) */
  job: string | null;
  /** Character name(s) played (for actors/actresses) */
  characters: string[] | null;
}

/**
 * Principal category enumeration
 */
export type PrincipalCategory =
  | 'actor'
  | 'actress'
  | 'director'
  | 'writer'
  | 'producer'
  | 'composer'
  | 'cinematographer'
  | 'editor'
  | 'production_designer'
  | 'self'
  | 'archive_footage'
  | 'archive_sound';

/**
 * title.crew.tsv.gz - Director and writer information
 */
export interface TitleCrew {
  /** Title identifier */
  tconst: string;
  /** Array of director nconst identifiers */
  directors: string[];
  /** Array of writer nconst identifiers */
  writers: string[];
}

/**
 * title.akas.tsv.gz - Alternative titles (localized)
 */
export interface TitleAkas {
  /** Title identifier */
  titleId: string;
  /** Ordering for uniqueness */
  ordering: number;
  /** Localized title */
  title: string;
  /** Region (ISO 3166-1) */
  region: string | null;
  /** Language (ISO 639-1) */
  language: string | null;
  /** Attribute types (e.g., ["dvd", "video"]) */
  types: string[];
  /** Additional attributes */
  attributes: string[];
  /** Whether this is the original title */
  isOriginalTitle: boolean;
}

/**
 * title.episode.tsv.gz - TV episode information
 */
export interface TitleEpisode {
  /** Episode identifier */
  tconst: string;
  /** Parent TV series identifier */
  parentTconst: string;
  /** Season number */
  seasonNumber: number | null;
  /** Episode number within the season */
  episodeNumber: number | null;
}

// ============================================================================
// Data Size Presets for IMDB Benchmarks
// ============================================================================

/**
 * Data size presets for IMDB benchmarks
 */
export type ImdbDataSize = 'tiny' | 'small' | 'medium' | 'large';

/**
 * Size configurations (number of movies)
 */
export const IMDB_DATA_SIZES: Record<ImdbDataSize, number> = {
  tiny: 100,          // 100 movies - unit tests
  small: 1_000,       // 1K movies
  medium: 10_000,     // 10K movies
  large: 100_000,     // 100K movies
} as const;

// ============================================================================
// Benchmark Result Types
// ============================================================================

/**
 * IMDB benchmark query types
 */
export type ImdbQueryType =
  | 'filter_genre_year'       // Filter by genre and year range
  | 'aggregate_ratings'       // Aggregate ratings by decade
  | 'find_by_actor'           // Find movies by actor name
  | 'find_by_director'        // Find movies by director name
  | 'top_rated_genre'         // Top rated movies in a genre
  | 'actor_collaboration'     // Find movies with multiple actors
  | 'genre_rating_stats'      // Rating statistics per genre
  | 'decade_analysis';        // Movies and ratings by decade

/**
 * Query benchmark result
 */
export interface ImdbQueryResult {
  /** Query type executed */
  queryType: ImdbQueryType;
  /** Number of movies scanned */
  moviesScanned: number;
  /** Number of results returned */
  resultsCount: number;
  /** Query execution time in milliseconds */
  executionTimeMs: number;
  /** Throughput in movies/second */
  throughput: number;
}

/**
 * Full IMDB benchmark result
 */
export interface ImdbBenchmarkResult {
  /** Data size used */
  size: ImdbDataSize;
  /** Number of movies in dataset */
  movieCount: number;
  /** Shredding metrics */
  shred: {
    timeMs: number;
    columnCount: number;
    throughput: number;
    compressionRatio: number;
  };
  /** Query results */
  queries: ImdbQueryResult[];
}
