/**
 * Tests for IMDB Dataset Benchmark
 */

import { describe, it, expect } from 'vitest';
import {
  // Schema types
  IMDB_DATA_SIZES,
  type DenormalizedMovie,
  type ImdbDataSize,

  // Generation
  generateMovies,
  generateImdbDataset,
  generateMoviesIterator,
  estimateMovieMemoryUsage,
  estimateMovieJsonSize,

  // Denormalization helpers
  calculateRatingTier,
  calculateWeightedScore,
  calculateRuntimeTier,
  calculateDecadeInfo,

  // Query functions
  filterByGenreAndYear,
  findMoviesByActor,
  findMoviesByDirector,
  findActorCollaborations,
  searchMovies,
  getTopRatedByGenre,
  aggregateRatingsByDecade,
  getGenreRatingStats,
  analyzeByDecade,

  // Benchmarking
  runQueryBenchmarks,
  runImdbBenchmark,
  analyzeImdbSchema,
} from '../index.js';

describe('IMDB Dataset Benchmark', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Data Generation Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('generateMovies', () => {
    it('should generate the requested number of movies', () => {
      const movies = generateMovies(50);
      expect(movies).toHaveLength(50);
    });

    it('should generate valid movie structure', () => {
      const movies = generateMovies(10);

      for (const movie of movies) {
        // Check required fields
        expect(movie.id).toBeDefined();
        expect(movie.id).toMatch(/^tt\d{7}$/);
        expect(movie.type).toBeDefined();
        expect(movie.title).toBeDefined();
        expect(typeof movie.title).toBe('string');
        expect(movie.genres).toBeDefined();
        expect(Array.isArray(movie.genres)).toBe(true);
      }
    });

    it('should generate movies with cast and crew', () => {
      const movies = generateMovies(20);

      for (const movie of movies) {
        expect(movie.cast).toBeDefined();
        expect(Array.isArray(movie.cast)).toBe(true);
        expect(movie.cast.length).toBeGreaterThan(0);

        expect(movie.crew).toBeDefined();
        expect(Array.isArray(movie.crew)).toBe(true);
        expect(movie.crew.length).toBeGreaterThan(0);

        // Check cast member structure
        for (const member of movie.cast) {
          expect(member.id).toMatch(/^nm\d{7}$/);
          expect(member.name).toBeDefined();
          expect(['actor', 'actress']).toContain(member.category);
          expect(Array.isArray(member.characters)).toBe(true);
        }

        // Check crew member structure
        for (const member of movie.crew) {
          expect(member.id).toMatch(/^nm\d{7}$/);
          expect(member.name).toBeDefined();
          expect(member.category).toBeDefined();
        }
      }
    });

    it('should generate movies with ratings (most of them)', () => {
      const movies = generateMovies(100);
      const moviesWithRatings = movies.filter(m => m.rating !== null);

      // Default config has 85% rated
      expect(moviesWithRatings.length).toBeGreaterThan(70);
      expect(moviesWithRatings.length).toBeLessThan(100);

      for (const movie of moviesWithRatings) {
        expect(movie.rating!.average).toBeGreaterThanOrEqual(1);
        expect(movie.rating!.average).toBeLessThanOrEqual(10);
        expect(movie.rating!.votes).toBeGreaterThan(0);
        expect(['low', 'medium', 'high', 'excellent']).toContain(movie.rating!.tier);
      }
    });

    it('should be reproducible with the same seed', () => {
      const movies1 = generateMovies(20, { seed: 12345 });
      const movies2 = generateMovies(20, { seed: 12345 });

      expect(movies1).toEqual(movies2);
    });

    it('should generate different movies with different seeds', () => {
      const movies1 = generateMovies(20, { seed: 12345 });
      const movies2 = generateMovies(20, { seed: 54321 });

      expect(movies1).not.toEqual(movies2);
    });

    it('should generate movies across the specified year range', () => {
      const movies = generateMovies(100, { yearRange: [2000, 2020] });
      const moviesWithYear = movies.filter(m => m.year !== null);

      for (const movie of moviesWithYear) {
        expect(movie.year).toBeGreaterThanOrEqual(2000);
        expect(movie.year).toBeLessThanOrEqual(2020);
      }
    });

    it('should compute derived fields correctly', () => {
      const movies = generateMovies(50);

      for (const movie of movies) {
        // castSize matches cast array
        expect(movie.castSize).toBe(movie.cast.length);

        // crewSize matches crew array
        expect(movie.crewSize).toBe(movie.crew.length);

        // totalPeople is sum
        expect(movie.totalPeople).toBe(movie.castSize + movie.crewSize);

        // castNames extracted correctly
        expect(movie.castNames.length).toBe(movie.cast.length);

        // directors extracted from crew
        const directorCount = movie.crew.filter(c => c.category === 'director').length;
        expect(movie.directors.length).toBe(directorCount);
      }
    });
  });

  describe('generateImdbDataset', () => {
    it('should generate tiny dataset', () => {
      const movies = generateImdbDataset('tiny');
      expect(movies).toHaveLength(IMDB_DATA_SIZES.tiny);
    });

    it('should respect size presets', () => {
      const sizes: ImdbDataSize[] = ['tiny'];
      for (const size of sizes) {
        const movies = generateImdbDataset(size);
        expect(movies).toHaveLength(IMDB_DATA_SIZES[size]);
      }
    });
  });

  describe('generateMoviesIterator', () => {
    it('should generate movies in batches', async () => {
      const batches: DenormalizedMovie[][] = [];

      for await (const batch of generateMoviesIterator(75, 30)) {
        batches.push(batch);
      }

      // Should have 3 batches: 30, 30, 15
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(30);
      expect(batches[1]).toHaveLength(30);
      expect(batches[2]).toHaveLength(15);

      const total = batches.reduce((sum, b) => sum + b.length, 0);
      expect(total).toBe(75);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Denormalization Helper Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Denormalization Helpers', () => {
    describe('calculateRatingTier', () => {
      it('should categorize ratings correctly', () => {
        expect(calculateRatingTier(9.0)).toBe('excellent');
        expect(calculateRatingTier(8.0)).toBe('excellent');
        expect(calculateRatingTier(7.5)).toBe('high');
        expect(calculateRatingTier(6.5)).toBe('high');
        expect(calculateRatingTier(6.0)).toBe('medium');
        expect(calculateRatingTier(5.0)).toBe('medium');
        expect(calculateRatingTier(4.0)).toBe('low');
        expect(calculateRatingTier(2.0)).toBe('low');
      });
    });

    describe('calculateWeightedScore', () => {
      it('should calculate weighted scores correctly', () => {
        // score = average * log10(votes)
        expect(calculateWeightedScore(8.0, 10000)).toBeCloseTo(8.0 * 4, 2);
        expect(calculateWeightedScore(7.0, 1000)).toBeCloseTo(7.0 * 3, 2);
        expect(calculateWeightedScore(5.0, 0)).toBe(0);
      });

      it('should weight higher vote counts more', () => {
        const lowVotes = calculateWeightedScore(8.0, 100);
        const highVotes = calculateWeightedScore(8.0, 100000);
        expect(highVotes).toBeGreaterThan(lowVotes);
      });
    });

    describe('calculateRuntimeTier', () => {
      it('should categorize runtimes correctly', () => {
        expect(calculateRuntimeTier(null)).toBeNull();
        expect(calculateRuntimeTier(20)).toBe('short');
        expect(calculateRuntimeTier(39)).toBe('short');
        expect(calculateRuntimeTier(90)).toBe('medium');
        expect(calculateRuntimeTier(119)).toBe('medium');
        expect(calculateRuntimeTier(150)).toBe('long');
        expect(calculateRuntimeTier(179)).toBe('long');
        expect(calculateRuntimeTier(200)).toBe('epic');
      });
    });

    describe('calculateDecadeInfo', () => {
      it('should calculate decade info correctly', () => {
        expect(calculateDecadeInfo(null)).toBeNull();

        const d2010 = calculateDecadeInfo(2015);
        expect(d2010?.decade).toBe(2010);
        expect(d2010?.label).toBe('2010s');
        expect(d2010?.era).toBe('digital');

        const d1990 = calculateDecadeInfo(1995);
        expect(d1990?.decade).toBe(1990);
        expect(d1990?.label).toBe('1990s');
        expect(d1990?.era).toBe('blockbuster');

        const d1950 = calculateDecadeInfo(1955);
        expect(d1950?.decade).toBe(1950);
        expect(d1950?.era).toBe('golden');

        const d2020 = calculateDecadeInfo(2022);
        expect(d2020?.era).toBe('streaming');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Query Function Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Query Functions', () => {
    // Generate a consistent test dataset
    const testMovies = generateMovies(200, { seed: 42 });

    describe('filterByGenreAndYear', () => {
      it('should filter by genre and year range', () => {
        const results = filterByGenreAndYear(testMovies, 'Drama', 1990, 2010);

        for (const movie of results) {
          expect(movie.genres).toContain('Drama');
          expect(movie.year).toBeGreaterThanOrEqual(1990);
          expect(movie.year).toBeLessThanOrEqual(2010);
        }
      });

      it('should return empty array when no matches', () => {
        const results = filterByGenreAndYear(testMovies, 'NonExistentGenre', 2000, 2010);
        expect(results).toHaveLength(0);
      });
    });

    describe('findMoviesByActor', () => {
      it('should find movies by partial actor name', () => {
        // Find a known actor name from the dataset
        const firstMovie = testMovies[0];
        const actorName = firstMovie.cast[0]?.name.split(' ')[0] || 'John';

        const results = findMoviesByActor(testMovies, actorName);
        expect(results.length).toBeGreaterThan(0);

        for (const movie of results) {
          const hasMatchingActor = movie.castNames.some(
            name => name.toLowerCase().includes(actorName.toLowerCase())
          );
          expect(hasMatchingActor).toBe(true);
        }
      });

      it('should be case insensitive', () => {
        const results1 = findMoviesByActor(testMovies, 'john');
        const results2 = findMoviesByActor(testMovies, 'JOHN');
        const results3 = findMoviesByActor(testMovies, 'John');

        expect(results1).toEqual(results2);
        expect(results2).toEqual(results3);
      });
    });

    describe('findMoviesByDirector', () => {
      it('should find movies by director name', () => {
        const firstMovie = testMovies.find(m => m.directors.length > 0);
        const directorName = firstMovie?.directors[0]?.split(' ')[1] || 'Smith';

        const results = findMoviesByDirector(testMovies, directorName);
        expect(results.length).toBeGreaterThan(0);

        for (const movie of results) {
          const hasMatchingDirector = movie.directors.some(
            name => name.toLowerCase().includes(directorName.toLowerCase())
          );
          expect(hasMatchingDirector).toBe(true);
        }
      });
    });

    describe('getTopRatedByGenre', () => {
      it('should return top rated movies in genre', () => {
        const results = getTopRatedByGenre(testMovies, 'Drama', 5, 0);

        expect(results.length).toBeLessThanOrEqual(5);

        for (const movie of results) {
          expect(movie.genres).toContain('Drama');
          expect(movie.rating).not.toBeNull();
        }

        // Verify sorted by weighted score descending
        for (let i = 1; i < results.length; i++) {
          expect(results[i - 1].rating!.weightedScore)
            .toBeGreaterThanOrEqual(results[i].rating!.weightedScore);
        }
      });

      it('should respect minVotes threshold', () => {
        const results = getTopRatedByGenre(testMovies, 'Drama', 100, 10000);

        for (const movie of results) {
          expect(movie.rating!.votes).toBeGreaterThanOrEqual(10000);
        }
      });
    });

    describe('aggregateRatingsByDecade', () => {
      it('should aggregate ratings by decade', () => {
        const results = aggregateRatingsByDecade(testMovies);

        expect(results.size).toBeGreaterThan(0);

        for (const [decade, stats] of results) {
          expect(decade % 10).toBe(0);
          expect(stats.count).toBeGreaterThan(0);
          expect(stats.avgRating).toBeGreaterThanOrEqual(1);
          expect(stats.avgRating).toBeLessThanOrEqual(10);
          expect(stats.totalVotes).toBeGreaterThan(0);
        }
      });
    });

    describe('getGenreRatingStats', () => {
      it('should compute rating stats per genre', () => {
        const results = getGenreRatingStats(testMovies);

        expect(results.size).toBeGreaterThan(0);

        for (const [genre, stats] of results) {
          expect(typeof genre).toBe('string');
          expect(stats.count).toBeGreaterThan(0);
          expect(stats.minRating).toBeLessThanOrEqual(stats.avgRating);
          expect(stats.avgRating).toBeLessThanOrEqual(stats.maxRating);
        }
      });
    });

    describe('analyzeByDecade', () => {
      it('should provide comprehensive decade analysis', () => {
        const results = analyzeByDecade(testMovies);

        expect(results.length).toBeGreaterThan(0);

        for (const analysis of results) {
          expect(analysis.decade % 10).toBe(0);
          expect(analysis.label).toMatch(/^\d{4}s$/);
          expect(analysis.movieCount).toBeGreaterThan(0);
          expect(Array.isArray(analysis.topGenres)).toBe(true);
        }

        // Verify sorted by decade
        for (let i = 1; i < results.length; i++) {
          expect(results[i].decade).toBeGreaterThan(results[i - 1].decade);
        }
      });
    });

    describe('searchMovies', () => {
      it('should search across movie data', () => {
        const firstMovie = testMovies[0];
        const searchTerm = firstMovie.title.split(' ')[0].toLowerCase();

        const results = searchMovies(testMovies, searchTerm);
        expect(results.length).toBeGreaterThan(0);

        for (const movie of results) {
          expect(movie.searchText).toContain(searchTerm);
        }
      });

      it('should support multiple search terms', () => {
        const results = searchMovies(testMovies, 'the dark');

        for (const movie of results) {
          expect(movie.searchText).toContain('the');
          expect(movie.searchText).toContain('dark');
        }
      });
    });

    describe('findActorCollaborations', () => {
      it('should find movies with multiple actors', () => {
        // Find two actors from the same movie
        const movieWithMultipleCast = testMovies.find(m => m.cast.length >= 2);
        if (!movieWithMultipleCast) return;

        const actor1 = movieWithMultipleCast.cast[0].name.split(' ')[0];
        const actor2 = movieWithMultipleCast.cast[1].name.split(' ')[0];

        const results = findActorCollaborations(testMovies, [actor1, actor2]);
        expect(results.length).toBeGreaterThan(0);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Benchmark Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Benchmarking', () => {
    const testMovies = generateMovies(100, { seed: 42 });

    describe('runQueryBenchmarks', () => {
      it('should run all query benchmarks', () => {
        const results = runQueryBenchmarks(testMovies);

        // Should have results for all query types
        expect(results.length).toBe(8);

        const queryTypes = results.map(r => r.queryType);
        expect(queryTypes).toContain('filter_genre_year');
        expect(queryTypes).toContain('aggregate_ratings');
        expect(queryTypes).toContain('find_by_actor');
        expect(queryTypes).toContain('find_by_director');
        expect(queryTypes).toContain('top_rated_genre');
        expect(queryTypes).toContain('actor_collaboration');
        expect(queryTypes).toContain('genre_rating_stats');
        expect(queryTypes).toContain('decade_analysis');

        for (const result of results) {
          expect(result.moviesScanned).toBe(100);
          expect(result.executionTimeMs).toBeGreaterThan(0);
          expect(result.throughput).toBeGreaterThan(0);
        }
      });
    });

    describe('runImdbBenchmark', () => {
      it('should run full benchmark including shredding', () => {
        const result = runImdbBenchmark(testMovies);

        expect(result.size).toBe('tiny');
        expect(result.movieCount).toBe(100);

        // Shredding metrics
        expect(result.shred.timeMs).toBeGreaterThan(0);
        expect(result.shred.columnCount).toBeGreaterThan(0);
        expect(result.shred.throughput).toBeGreaterThan(0);
        expect(result.shred.compressionRatio).toBeGreaterThan(0);

        // Query results
        expect(result.queries.length).toBe(8);

        // Columns should be returned
        expect(result.columns.length).toBeGreaterThan(0);
      });
    });

    describe('analyzeImdbSchema', () => {
      it('should analyze schema from movies', () => {
        const analysis = analyzeImdbSchema(testMovies);

        expect(analysis.paths.length).toBeGreaterThan(0);
        expect(analysis.types.size).toBeGreaterThan(0);
        expect(analysis.nullability.size).toBeGreaterThan(0);
        expect(analysis.cardinality.size).toBeGreaterThan(0);

        // Check some expected paths
        expect(analysis.paths).toContain('id');
        expect(analysis.paths).toContain('title');
        expect(analysis.paths).toContain('year');

        // Check types
        expect(analysis.types.get('id')).toBe('String');
        expect(analysis.types.get('year')).toBeDefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Memory Estimation Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Memory Estimation', () => {
    it('should estimate memory usage', () => {
      const tiny = estimateMovieMemoryUsage(100);
      const small = estimateMovieMemoryUsage(1000);

      expect(small).toBeGreaterThan(tiny);
      expect(tiny).toBeGreaterThan(0);

      // ~2KB per movie
      expect(tiny).toBeCloseTo(204800, -4);
    });

    it('should estimate JSON size', () => {
      const tiny = estimateMovieJsonSize(100);
      const small = estimateMovieJsonSize(1000);

      expect(small).toBeGreaterThan(tiny);
      expect(tiny).toBeGreaterThan(0);

      // ~1.5KB per movie
      expect(tiny).toBeCloseTo(153600, -4);
    });
  });
});
