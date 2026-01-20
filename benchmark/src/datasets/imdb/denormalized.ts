/**
 * Denormalized Movie Schema for EvoDB
 *
 * Movie-centric document model optimized for columnar storage and queries.
 * Embeds all related data (cast, crew, ratings, genres) into a single document.
 *
 * This denormalization strategy enables:
 * - Single-scan queries without joins
 * - Efficient columnar filtering on nested arrays
 * - Optimal compression for repeated genres, professions, etc.
 */

import type { TitleType, PrincipalCategory } from './schema.js';

// ============================================================================
// Embedded Types (denormalized into movie document)
// ============================================================================

/**
 * Embedded cast member (actor/actress)
 */
export interface CastMember {
  /** Person identifier (nconst) */
  id: string;
  /** Person's credited name */
  name: string;
  /** Role category (actor/actress) */
  category: 'actor' | 'actress';
  /** Character name(s) played in this movie */
  characters: string[];
  /** Ordering (billing position) */
  ordering: number;
  /** Birth year (for analytics) */
  birthYear: number | null;
  /** Primary professions */
  professions: string[];
}

/**
 * Embedded crew member (director, writer, etc.)
 */
export interface CrewMember {
  /** Person identifier (nconst) */
  id: string;
  /** Person's credited name */
  name: string;
  /** Job category */
  category: Exclude<PrincipalCategory, 'actor' | 'actress'>;
  /** Specific job title (if applicable) */
  job: string | null;
  /** Ordering (billing position) */
  ordering: number;
  /** Birth year (for analytics) */
  birthYear: number | null;
  /** Primary professions */
  professions: string[];
}

/**
 * Embedded rating information
 */
export interface MovieRating {
  /** Average rating (1-10 scale) */
  average: number;
  /** Number of votes */
  votes: number;
  /** Rating tier (derived: low/medium/high/excellent) */
  tier: 'low' | 'medium' | 'high' | 'excellent';
  /** Weighted score (average * log10(votes)) for ranking */
  weightedScore: number;
}

/**
 * Derived decade information
 */
export interface DecadeInfo {
  /** Decade start year (e.g., 1990, 2000, 2010) */
  decade: number;
  /** Decade label (e.g., "1990s", "2000s") */
  label: string;
  /** Era classification */
  era: 'silent' | 'golden' | 'new_hollywood' | 'blockbuster' | 'digital' | 'streaming';
}

// ============================================================================
// Main Denormalized Movie Document
// ============================================================================

/**
 * Denormalized Movie Document
 *
 * This is the root document type for EvoDB storage. All related data is
 * embedded to enable efficient columnar queries without joins.
 *
 * @example
 * ```typescript
 * // Query: Top sci-fi movies from 2010s with actor "Tom Hanks"
 * movies.filter(m =>
 *   m.genres.includes('Sci-Fi') &&
 *   m.decade.decade === 2010 &&
 *   m.cast.some(c => c.name === 'Tom Hanks')
 * ).sort((a, b) => b.rating.weightedScore - a.rating.weightedScore)
 * ```
 */
export interface DenormalizedMovie {
  // ─────────────────────────────────────────────────────────────────────────
  // Primary Identifiers
  // ─────────────────────────────────────────────────────────────────────────

  /** IMDB title identifier (tconst, e.g., "tt0111161") */
  id: string;

  /** Title type (movie, short, tvMovie, etc.) */
  type: TitleType;

  // ─────────────────────────────────────────────────────────────────────────
  // Title Information
  // ─────────────────────────────────────────────────────────────────────────

  /** Primary promotional title */
  title: string;

  /** Original title in original language */
  originalTitle: string;

  /** Whether titles differ (for localization queries) */
  hasAlternateTitle: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Classification & Metadata
  // ─────────────────────────────────────────────────────────────────────────

  /** Whether the title is adult content */
  isAdult: boolean;

  /** Release year */
  year: number | null;

  /** Runtime in minutes */
  runtimeMinutes: number | null;

  /** Runtime tier (short/medium/long/epic) */
  runtimeTier: 'short' | 'medium' | 'long' | 'epic' | null;

  /** Genres (denormalized array) */
  genres: string[];

  /** Primary genre (first listed) */
  primaryGenre: string | null;

  /** Genre count (for complexity analysis) */
  genreCount: number;

  // ─────────────────────────────────────────────────────────────────────────
  // Temporal Information
  // ─────────────────────────────────────────────────────────────────────────

  /** Decade information (derived from year) */
  decade: DecadeInfo | null;

  /** TV series end year (null for movies) */
  endYear: number | null;

  /** Whether still ongoing (for TV series) */
  isOngoing: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Ratings (embedded from title.ratings)
  // ─────────────────────────────────────────────────────────────────────────

  /** Rating information (null if unrated) */
  rating: MovieRating | null;

  /** Has minimum votes threshold (e.g., 1000+ votes) */
  hasSignificantVotes: boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Cast (embedded from title.principals + name.basics)
  // ─────────────────────────────────────────────────────────────────────────

  /** Cast members (actors/actresses) */
  cast: CastMember[];

  /** Cast size */
  castSize: number;

  /** Lead actor/actress name (first billed) */
  leadActor: string | null;

  /** All cast member names (flattened for search) */
  castNames: string[];

  // ─────────────────────────────────────────────────────────────────────────
  // Crew (embedded from title.principals + title.crew + name.basics)
  // ─────────────────────────────────────────────────────────────────────────

  /** Crew members (directors, writers, etc.) */
  crew: CrewMember[];

  /** Crew size */
  crewSize: number;

  /** Director name(s) */
  directors: string[];

  /** Writer name(s) */
  writers: string[];

  /** Primary director (first credited) */
  primaryDirector: string | null;

  /** All crew member names (flattened for search) */
  crewNames: string[];

  // ─────────────────────────────────────────────────────────────────────────
  // Derived Analytics Fields
  // ─────────────────────────────────────────────────────────────────────────

  /** Total people involved (cast + crew) */
  totalPeople: number;

  /** Whether this is a "classic" (pre-1970, high rating) */
  isClassic: boolean;

  /** Whether this is a "blockbuster" (high votes + high rating) */
  isBlockbuster: boolean;

  /** Search text (concatenated titles, names for full-text search) */
  searchText: string;
}

// ============================================================================
// Helper Functions for Denormalization
// ============================================================================

/**
 * Calculate rating tier from average rating
 */
export function calculateRatingTier(rating: number): MovieRating['tier'] {
  if (rating >= 8.0) return 'excellent';
  if (rating >= 6.5) return 'high';
  if (rating >= 5.0) return 'medium';
  return 'low';
}

/**
 * Calculate weighted score for ranking
 * Uses IMDB-style weighted rating: average * log10(votes)
 */
export function calculateWeightedScore(average: number, votes: number): number {
  if (votes === 0) return 0;
  return average * Math.log10(votes);
}

/**
 * Calculate runtime tier from minutes
 */
export function calculateRuntimeTier(
  minutes: number | null
): DenormalizedMovie['runtimeTier'] {
  if (minutes === null) return null;
  if (minutes < 40) return 'short';
  if (minutes < 120) return 'medium';
  if (minutes < 180) return 'long';
  return 'epic';
}

/**
 * Calculate decade info from year
 */
export function calculateDecadeInfo(year: number | null): DecadeInfo | null {
  if (year === null) return null;

  const decade = Math.floor(year / 10) * 10;
  const label = `${decade}s`;

  let era: DecadeInfo['era'];
  if (year < 1930) era = 'silent';
  else if (year < 1960) era = 'golden';
  else if (year < 1980) era = 'new_hollywood';
  else if (year < 2000) era = 'blockbuster';
  else if (year < 2015) era = 'digital';
  else era = 'streaming';

  return { decade, label, era };
}

/**
 * Generate search text from movie data
 */
export function generateSearchText(
  title: string,
  originalTitle: string,
  castNames: string[],
  directors: string[]
): string {
  const parts = [title];
  if (originalTitle !== title) {
    parts.push(originalTitle);
  }
  parts.push(...castNames.slice(0, 5)); // Top 5 cast
  parts.push(...directors);
  return parts.join(' ').toLowerCase();
}

// ============================================================================
// Schema Metadata for Columnar Storage
// ============================================================================

/**
 * Column paths for the denormalized movie schema
 * Used for selective column reading and projection pushdown
 */
export const MOVIE_COLUMN_PATHS = {
  // Primary
  id: 'id',
  type: 'type',

  // Titles
  title: 'title',
  originalTitle: 'originalTitle',

  // Classification
  isAdult: 'isAdult',
  year: 'year',
  runtimeMinutes: 'runtimeMinutes',
  genres: 'genres',
  primaryGenre: 'primaryGenre',

  // Decade
  decadeValue: 'decade.decade',
  decadeLabel: 'decade.label',
  decadeEra: 'decade.era',

  // Ratings
  ratingAverage: 'rating.average',
  ratingVotes: 'rating.votes',
  ratingTier: 'rating.tier',
  ratingWeightedScore: 'rating.weightedScore',

  // Cast (array paths)
  castId: 'cast[].id',
  castName: 'cast[].name',
  castCategory: 'cast[].category',
  castCharacters: 'cast[].characters',
  castOrdering: 'cast[].ordering',

  // Crew (array paths)
  crewId: 'crew[].id',
  crewName: 'crew[].name',
  crewCategory: 'crew[].category',
  crewJob: 'crew[].job',

  // Flattened search fields
  castNames: 'castNames',
  directors: 'directors',
  writers: 'writers',
  searchText: 'searchText',

  // Analytics
  castSize: 'castSize',
  crewSize: 'crewSize',
  isClassic: 'isClassic',
  isBlockbuster: 'isBlockbuster',
} as const;

/**
 * Commonly queried column sets for projection optimization
 */
export const MOVIE_PROJECTIONS = {
  /** Minimal: just IDs and titles */
  minimal: ['id', 'title', 'year'],

  /** List view: basic info for movie lists */
  listView: ['id', 'title', 'year', 'primaryGenre', 'rating.average', 'runtimeMinutes'],

  /** Card view: info for movie cards */
  cardView: [
    'id', 'title', 'year', 'genres', 'rating.average', 'rating.votes',
    'runtimeMinutes', 'primaryDirector', 'leadActor',
  ],

  /** Detail view: full movie details */
  detailView: [
    'id', 'type', 'title', 'originalTitle', 'year', 'runtimeMinutes',
    'genres', 'rating', 'cast', 'crew', 'directors', 'writers',
  ],

  /** Analytics: fields for aggregation queries */
  analytics: [
    'id', 'year', 'decade', 'genres', 'primaryGenre',
    'rating.average', 'rating.votes', 'rating.weightedScore',
    'castSize', 'crewSize', 'isClassic', 'isBlockbuster',
  ],

  /** Search: fields for search queries */
  search: ['id', 'title', 'year', 'searchText', 'castNames', 'directors'],
} as const;
