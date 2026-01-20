/**
 * IMDB Benchmark Queries
 *
 * Common query patterns for benchmarking denormalized movie storage.
 * These queries demonstrate the power of denormalization for:
 * - Single-scan filtering without joins
 * - Efficient aggregations on nested data
 * - Full-text-like search on embedded arrays
 */

import type { DenormalizedMovie, DecadeInfo } from './denormalized.js';
import type { ImdbQueryType, ImdbQueryResult, ImdbBenchmarkResult, ImdbDataSize } from './schema.js';
import { IMDB_DATA_SIZES } from './schema.js';
import { generateMovies } from './loader.js';
import { shred, type Column } from '@evodb/core';

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Filter movies by genre and year range
 *
 * Example: Find all Sci-Fi movies from the 2010s
 */
export function filterByGenreAndYear(
  movies: DenormalizedMovie[],
  genre: string,
  startYear: number,
  endYear: number
): DenormalizedMovie[] {
  return movies.filter(movie =>
    movie.year !== null &&
    movie.year >= startYear &&
    movie.year <= endYear &&
    movie.genres.includes(genre)
  );
}

/**
 * Aggregate ratings by decade
 *
 * Returns: Map of decade -> { count, avgRating, totalVotes }
 */
export function aggregateRatingsByDecade(
  movies: DenormalizedMovie[]
): Map<number, { count: number; avgRating: number; totalVotes: number }> {
  const result = new Map<number, { count: number; sumRating: number; totalVotes: number }>();

  for (const movie of movies) {
    if (movie.decade && movie.rating) {
      const existing = result.get(movie.decade.decade);
      if (existing) {
        existing.count++;
        existing.sumRating += movie.rating.average;
        existing.totalVotes += movie.rating.votes;
      } else {
        result.set(movie.decade.decade, {
          count: 1,
          sumRating: movie.rating.average,
          totalVotes: movie.rating.votes,
        });
      }
    }
  }

  // Calculate averages
  const finalResult = new Map<number, { count: number; avgRating: number; totalVotes: number }>();
  for (const [decade, stats] of result) {
    finalResult.set(decade, {
      count: stats.count,
      avgRating: Math.round((stats.sumRating / stats.count) * 100) / 100,
      totalVotes: stats.totalVotes,
    });
  }

  return finalResult;
}

/**
 * Find movies by actor name (partial match)
 *
 * Example: Find all movies with "Tom" in cast
 */
export function findMoviesByActor(
  movies: DenormalizedMovie[],
  actorName: string
): DenormalizedMovie[] {
  const searchName = actorName.toLowerCase();
  return movies.filter(movie =>
    movie.castNames.some(name => name.toLowerCase().includes(searchName))
  );
}

/**
 * Find movies by director name (partial match)
 */
export function findMoviesByDirector(
  movies: DenormalizedMovie[],
  directorName: string
): DenormalizedMovie[] {
  const searchName = directorName.toLowerCase();
  return movies.filter(movie =>
    movie.directors.some(name => name.toLowerCase().includes(searchName))
  );
}

/**
 * Get top-rated movies in a genre
 *
 * Uses weighted score (rating * log10(votes)) for ranking
 */
export function getTopRatedByGenre(
  movies: DenormalizedMovie[],
  genre: string,
  limit = 10,
  minVotes = 1000
): DenormalizedMovie[] {
  return movies
    .filter(movie =>
      movie.genres.includes(genre) &&
      movie.rating !== null &&
      movie.rating.votes >= minVotes
    )
    .sort((a, b) => (b.rating?.weightedScore || 0) - (a.rating?.weightedScore || 0))
    .slice(0, limit);
}

/**
 * Find movies with multiple specific actors (collaboration query)
 *
 * Example: Find movies with both "Tom Hanks" and "Meg Ryan"
 */
export function findActorCollaborations(
  movies: DenormalizedMovie[],
  actorNames: string[]
): DenormalizedMovie[] {
  const searchNames = actorNames.map(n => n.toLowerCase());
  return movies.filter(movie => {
    const movieCastLower = movie.castNames.map(n => n.toLowerCase());
    return searchNames.every(searchName =>
      movieCastLower.some(castName => castName.includes(searchName))
    );
  });
}

/**
 * Get rating statistics per genre
 *
 * Returns: Map of genre -> { count, avgRating, minRating, maxRating }
 */
export function getGenreRatingStats(
  movies: DenormalizedMovie[]
): Map<string, { count: number; avgRating: number; minRating: number; maxRating: number }> {
  const stats = new Map<string, { count: number; sumRating: number; minRating: number; maxRating: number }>();

  for (const movie of movies) {
    if (movie.rating) {
      for (const genre of movie.genres) {
        const existing = stats.get(genre);
        if (existing) {
          existing.count++;
          existing.sumRating += movie.rating.average;
          existing.minRating = Math.min(existing.minRating, movie.rating.average);
          existing.maxRating = Math.max(existing.maxRating, movie.rating.average);
        } else {
          stats.set(genre, {
            count: 1,
            sumRating: movie.rating.average,
            minRating: movie.rating.average,
            maxRating: movie.rating.average,
          });
        }
      }
    }
  }

  // Calculate averages
  const result = new Map<string, { count: number; avgRating: number; minRating: number; maxRating: number }>();
  for (const [genre, stat] of stats) {
    result.set(genre, {
      count: stat.count,
      avgRating: Math.round((stat.sumRating / stat.count) * 100) / 100,
      minRating: stat.minRating,
      maxRating: stat.maxRating,
    });
  }

  return result;
}

/**
 * Analyze movies and ratings by decade (comprehensive)
 */
export function analyzeByDecade(
  movies: DenormalizedMovie[]
): {
  decade: number;
  label: string;
  era: string;
  movieCount: number;
  avgRating: number;
  avgRuntime: number;
  topGenres: string[];
  blockbusterCount: number;
}[] {
  const decadeData = new Map<number, {
    info: DecadeInfo;
    movies: DenormalizedMovie[];
    ratingSum: number;
    ratingCount: number;
    runtimeSum: number;
    runtimeCount: number;
    genreCounts: Map<string, number>;
    blockbusters: number;
  }>();

  for (const movie of movies) {
    if (!movie.decade) continue;

    let data = decadeData.get(movie.decade.decade);
    if (!data) {
      data = {
        info: movie.decade,
        movies: [],
        ratingSum: 0,
        ratingCount: 0,
        runtimeSum: 0,
        runtimeCount: 0,
        genreCounts: new Map(),
        blockbusters: 0,
      };
      decadeData.set(movie.decade.decade, data);
    }

    data.movies.push(movie);

    if (movie.rating) {
      data.ratingSum += movie.rating.average;
      data.ratingCount++;
    }

    if (movie.runtimeMinutes) {
      data.runtimeSum += movie.runtimeMinutes;
      data.runtimeCount++;
    }

    for (const genre of movie.genres) {
      data.genreCounts.set(genre, (data.genreCounts.get(genre) || 0) + 1);
    }

    if (movie.isBlockbuster) {
      data.blockbusters++;
    }
  }

  return Array.from(decadeData.entries())
    .sort(([a], [b]) => a - b)
    .map(([decade, data]) => {
      const topGenres = Array.from(data.genreCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([genre]) => genre);

      return {
        decade,
        label: data.info.label,
        era: data.info.era,
        movieCount: data.movies.length,
        avgRating: data.ratingCount > 0
          ? Math.round((data.ratingSum / data.ratingCount) * 100) / 100
          : 0,
        avgRuntime: data.runtimeCount > 0
          ? Math.round(data.runtimeSum / data.runtimeCount)
          : 0,
        topGenres,
        blockbusterCount: data.blockbusters,
      };
    });
}

/**
 * Full-text search across movie data
 */
export function searchMovies(
  movies: DenormalizedMovie[],
  query: string
): DenormalizedMovie[] {
  const searchTerms = query.toLowerCase().split(/\s+/);
  return movies.filter(movie =>
    searchTerms.every(term => movie.searchText.includes(term))
  );
}

// ============================================================================
// Benchmark Execution
// ============================================================================

/**
 * Benchmark a single query
 */
function benchmarkQuery<T>(
  movies: DenormalizedMovie[],
  queryType: ImdbQueryType,
  queryFn: () => T[],
): ImdbQueryResult {
  const start = performance.now();
  const results = queryFn();
  const executionTimeMs = performance.now() - start;

  return {
    queryType,
    moviesScanned: movies.length,
    resultsCount: results.length,
    executionTimeMs,
    throughput: movies.length / (executionTimeMs / 1000),
  };
}

/**
 * Run all benchmark queries against a dataset
 */
export function runQueryBenchmarks(
  movies: DenormalizedMovie[]
): ImdbQueryResult[] {
  const results: ImdbQueryResult[] = [];

  // Filter by genre and year
  results.push(benchmarkQuery(movies, 'filter_genre_year', () =>
    filterByGenreAndYear(movies, 'Drama', 2000, 2020)
  ));

  // Aggregate ratings by decade
  results.push(benchmarkQuery(movies, 'aggregate_ratings', () =>
    Array.from(aggregateRatingsByDecade(movies).entries())
  ));

  // Find movies by actor
  results.push(benchmarkQuery(movies, 'find_by_actor', () =>
    findMoviesByActor(movies, 'John')
  ));

  // Find movies by director
  results.push(benchmarkQuery(movies, 'find_by_director', () =>
    findMoviesByDirector(movies, 'Smith')
  ));

  // Top rated by genre
  results.push(benchmarkQuery(movies, 'top_rated_genre', () =>
    getTopRatedByGenre(movies, 'Action', 20, 100)
  ));

  // Actor collaboration
  results.push(benchmarkQuery(movies, 'actor_collaboration', () =>
    findActorCollaborations(movies, ['John', 'Mary'])
  ));

  // Genre rating stats
  results.push(benchmarkQuery(movies, 'genre_rating_stats', () =>
    Array.from(getGenreRatingStats(movies).entries())
  ));

  // Decade analysis
  results.push(benchmarkQuery(movies, 'decade_analysis', () =>
    analyzeByDecade(movies)
  ));

  return results;
}

/**
 * Run full IMDB benchmark including shredding and queries
 */
export function runImdbBenchmark(
  movies: DenormalizedMovie[]
): ImdbBenchmarkResult & { columns: Column[] } {
  const jsonSize = JSON.stringify(movies).length;

  // Shred movies to columnar format
  const shredStart = performance.now();
  const columns = shred(movies as unknown[]);
  const shredTimeMs = performance.now() - shredStart;

  // Estimate column size
  let columnSizeBytes = 0;
  for (const col of columns) {
    columnSizeBytes += col.path.length * 2;
    columnSizeBytes += col.values.length * 8;
    columnSizeBytes += Math.ceil(col.nulls.length / 8);
  }

  // Run query benchmarks
  const queryResults = runQueryBenchmarks(movies);

  // Determine size category
  const size = getSizeCategory(movies.length);

  return {
    size,
    movieCount: movies.length,
    shred: {
      timeMs: shredTimeMs,
      columnCount: columns.length,
      throughput: movies.length / (shredTimeMs / 1000),
      compressionRatio: jsonSize / columnSizeBytes,
    },
    queries: queryResults,
    columns,
  };
}

/**
 * Get size category for movie count
 */
function getSizeCategory(count: number): ImdbDataSize {
  if (count <= IMDB_DATA_SIZES.tiny) return 'tiny';
  if (count <= IMDB_DATA_SIZES.small) return 'small';
  if (count <= IMDB_DATA_SIZES.medium) return 'medium';
  return 'large';
}

/**
 * Run comprehensive benchmarks for multiple sizes
 */
export async function runImdbBenchmarks(
  sizes: ImdbDataSize[] = ['tiny', 'small']
): Promise<Map<ImdbDataSize, ImdbBenchmarkResult>> {
  const results = new Map<ImdbDataSize, ImdbBenchmarkResult>();

  for (const size of sizes) {
    const movieCount = IMDB_DATA_SIZES[size];

    // Skip large benchmarks to avoid memory issues
    if (movieCount > 100_000) {
      console.warn(`Skipping ${size} benchmark (${movieCount} movies) to avoid memory issues`);
      continue;
    }

    console.log(`Generating ${size} IMDB dataset (${movieCount.toLocaleString()} movies)...`);
    const movies = generateMovies(movieCount);

    console.log(`Running ${size} IMDB benchmark...`);
    const result = runImdbBenchmark(movies);

    // Remove columns to avoid memory issues
    const { columns: _, ...benchResult } = result;
    results.set(size, benchResult);

    console.log(`  Shred: ${result.shred.throughput.toLocaleString()} movies/s`);
    console.log(`  Columns: ${result.shred.columnCount}`);
    console.log(`  Compression: ${result.shred.compressionRatio.toFixed(2)}x`);

    for (const query of result.queries) {
      console.log(`  ${query.queryType}: ${query.throughput.toLocaleString()} movies/s (${query.resultsCount} results)`);
    }
  }

  return results;
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format benchmark result as a string
 */
export function formatImdbBenchmarkResult(result: ImdbBenchmarkResult): string {
  const lines: string[] = [
    `=== IMDB ${result.size.toUpperCase()} Benchmark (${result.movieCount.toLocaleString()} movies) ===`,
    '',
    'Shredding:',
    `  Time: ${result.shred.timeMs.toFixed(2)}ms`,
    `  Throughput: ${result.shred.throughput.toLocaleString()} movies/s`,
    `  Columns: ${result.shred.columnCount}`,
    `  Compression: ${result.shred.compressionRatio.toFixed(2)}x`,
    '',
    'Query Benchmarks:',
  ];

  for (const query of result.queries) {
    lines.push(
      `  ${query.queryType}:`,
      `    Time: ${query.executionTimeMs.toFixed(2)}ms`,
      `    Throughput: ${query.throughput.toLocaleString()} movies/s`,
      `    Results: ${query.resultsCount.toLocaleString()}`
    );
  }

  return lines.join('\n');
}

/**
 * Get column analysis for IMDB data
 */
export function analyzeImdbSchema(movies: DenormalizedMovie[]): {
  paths: string[];
  types: Map<string, string>;
  nullability: Map<string, number>;
  cardinality: Map<string, number>;
} {
  const columns = shred(movies as unknown[]);

  const paths = columns.map(c => c.path);
  const types = new Map<string, string>();
  const nullability = new Map<string, number>();
  const cardinality = new Map<string, number>();

  const typeNames = ['Null', 'Bool', 'Int32', 'Int64', 'Float64', 'String', 'Binary', 'Array', 'Object', 'Timestamp', 'Date'];

  for (const col of columns) {
    types.set(col.path, typeNames[col.type] || 'Unknown');

    const nullCount = col.nulls.filter(n => n).length;
    nullability.set(col.path, nullCount / col.nulls.length);

    const distinctSet = new Set(col.values.filter((_, i) => !col.nulls[i]));
    cardinality.set(col.path, distinctSet.size);
  }

  return { paths, types, nullability, cardinality };
}
