/**
 * IMDB Dataset Benchmark for EvoDB
 *
 * Movie-centric denormalized storage benchmark demonstrating:
 * - Embedded nested data (cast, crew, ratings, genres)
 * - Efficient columnar queries without joins
 * - Real-world document structure patterns
 *
 * @example
 * ```typescript
 * import {
 *   generateImdbDataset,
 *   runImdbBenchmark,
 *   filterByGenreAndYear,
 *   getTopRatedByGenre,
 * } from '@evodb/benchmark/datasets/imdb';
 *
 * // Generate synthetic IMDB data
 * const movies = generateImdbDataset('small');
 *
 * // Run full benchmark
 * const result = runImdbBenchmark(movies);
 * console.log(formatImdbBenchmarkResult(result));
 *
 * // Execute individual queries
 * const scifiMovies = filterByGenreAndYear(movies, 'Sci-Fi', 2010, 2020);
 * const topAction = getTopRatedByGenre(movies, 'Action', 10);
 * ```
 */

// ============================================================================
// Raw IMDB Schema Types
// ============================================================================

export type {
  TitleBasics,
  TitleRatings,
  NameBasics,
  TitlePrincipals,
  TitleCrew,
  TitleAkas,
  TitleEpisode,
  TitleType,
  PrincipalCategory,
  ImdbDataSize,
  ImdbQueryType,
  ImdbQueryResult,
  ImdbBenchmarkResult,
} from './schema.js';

export { IMDB_DATA_SIZES } from './schema.js';

// ============================================================================
// Denormalized Movie Schema
// ============================================================================

export type {
  DenormalizedMovie,
  CastMember,
  CrewMember,
  MovieRating,
  DecadeInfo,
} from './denormalized.js';

export {
  calculateRatingTier,
  calculateWeightedScore,
  calculateRuntimeTier,
  calculateDecadeInfo,
  generateSearchText,
  MOVIE_COLUMN_PATHS,
  MOVIE_PROJECTIONS,
} from './denormalized.js';

// ============================================================================
// Data Generation
// ============================================================================

export {
  generateMovie,
  generateMovies,
  generateImdbDataset,
  generateMoviesIterator,
  estimateMovieMemoryUsage,
  estimateMovieJsonSize,
  type ImdbGeneratorConfig,
} from './loader.js';

// ============================================================================
// Query Functions
// ============================================================================

export {
  // Filter queries
  filterByGenreAndYear,
  findMoviesByActor,
  findMoviesByDirector,
  findActorCollaborations,
  searchMovies,

  // Ranking queries
  getTopRatedByGenre,

  // Aggregation queries
  aggregateRatingsByDecade,
  getGenreRatingStats,
  analyzeByDecade,

  // Benchmarking
  runQueryBenchmarks,
  runImdbBenchmark,
  runImdbBenchmarks,

  // Schema analysis
  analyzeImdbSchema,

  // Formatting
  formatImdbBenchmarkResult,
} from './queries.js';
