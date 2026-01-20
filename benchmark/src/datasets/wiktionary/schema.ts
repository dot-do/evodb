/**
 * Wiktionary Dataset Schema Types
 *
 * TypeScript types representing Wiktionary dictionary entry structure.
 * Based on wiktextract JSON output format from Kaikki.org.
 *
 * @see https://kaikki.org/dictionary/
 * @see https://github.com/tatuylonen/wiktextract
 */

// ============================================================================
// Core Identifiers
// ============================================================================

/**
 * ISO 639 language code (e.g., "en", "de", "ja")
 */
export type LanguageCode = string;

/**
 * Part of speech values
 */
export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'preposition'
  | 'conjunction'
  | 'interjection'
  | 'determiner'
  | 'article'
  | 'particle'
  | 'numeral'
  | 'prefix'
  | 'suffix'
  | 'infix'
  | 'affix'
  | 'phrase'
  | 'proverb'
  | 'idiom'
  | 'symbol'
  | 'letter'
  | 'abbreviation'
  | 'initialism'
  | 'acronym'
  | 'contraction'
  | 'proper noun'
  | 'name';

// ============================================================================
// Pronunciation
// ============================================================================

/**
 * Pronunciation entry with IPA, audio, and regional tags
 */
export interface Pronunciation {
  /** International Phonetic Alphabet representation */
  ipa?: string;
  /** Audio file reference */
  audio?: string;
  /** Direct URL to OGG audio */
  oggUrl?: string;
  /** Direct URL to MP3 audio */
  mp3Url?: string;
  /** Regional dialect tags (e.g., "US", "UK", "Australia") */
  tags?: string[];
  /** Phonetic transcription (non-IPA) */
  phonetic?: string;
  /** Rhyme pattern */
  rhymes?: string;
  /** Homophones (words that sound the same) */
  homophones?: string[];
  /** Number of syllables */
  syllables?: number;
  /** Enunciation text */
  enpr?: string;
}

// ============================================================================
// Senses (Definitions)
// ============================================================================

/**
 * Example usage of a word sense
 */
export interface Example {
  /** Example sentence text */
  text: string;
  /** Translation of the example (for non-English entries) */
  translation?: string;
  /** Source reference (book, author, etc.) */
  ref?: string;
  /** Type of example (quotation, usage, etc.) */
  type?: string;
}

/**
 * Synonym or related word
 */
export interface RelatedWord {
  /** The related word */
  word: string;
  /** Relationship type tags */
  tags?: string[];
  /** Sense qualifier */
  sense?: string;
  /** Source language for borrowed words */
  source?: string;
}

/**
 * A single sense (meaning/definition) of a word
 */
export interface Sense {
  /** Unique sense identifier (optional) */
  id?: string;
  /** Definition/gloss texts (may have multiple levels) */
  glosses: string[];
  /** Raw glosses before processing */
  rawGlosses?: string[];
  /** Semantic tags (e.g., "informal", "archaic", "vulgar") */
  tags?: string[];
  /** Category labels */
  categories?: string[];
  /** Example usages */
  examples?: Example[];
  /** Synonyms */
  synonyms?: RelatedWord[];
  /** Antonyms */
  antonyms?: RelatedWord[];
  /** Hypernyms (broader terms) */
  hypernyms?: RelatedWord[];
  /** Hyponyms (narrower terms) */
  hyponyms?: RelatedWord[];
  /** Holonyms (whole of which this is a part) */
  holonyms?: RelatedWord[];
  /** Meronyms (parts of this whole) */
  meronyms?: RelatedWord[];
  /** Derived terms */
  derived?: RelatedWord[];
  /** Related terms */
  related?: RelatedWord[];
  /** Coordinate terms (same level in taxonomy) */
  coordinateTerms?: RelatedWord[];
  /** Topic/domain qualifier */
  topics?: string[];
  /** Form of another word (for inflected forms) */
  formOf?: {
    word: string;
    tags?: string[];
  }[];
  /** Wikipedia links */
  wikipedia?: string[];
  /** Wikidata Q-identifier */
  wikidata?: string[];
  /** Sense is qualified as alt form, misspelling, etc. */
  altOf?: {
    word: string;
    tags?: string[];
  }[];
}

// ============================================================================
// Etymology
// ============================================================================

/**
 * Etymology information for a word
 */
export interface Etymology {
  /** Etymology number (when multiple etymologies exist) */
  number?: number;
  /** Etymology text description */
  text?: string;
  /** Language the word was borrowed/derived from */
  sourceLanguage?: string;
  /** Source language code */
  sourceLanguageCode?: LanguageCode;
  /** Templates used in etymology */
  templates?: EtymologyTemplate[];
}

/**
 * Etymology template reference
 */
export interface EtymologyTemplate {
  /** Template name */
  name: string;
  /** Template arguments */
  args?: Record<string, string>;
  /** Expansion text */
  expansion?: string;
}

// ============================================================================
// Word Forms
// ============================================================================

/**
 * Inflected form of a word
 */
export interface WordForm {
  /** The inflected form text */
  form: string;
  /** Grammatical tags (e.g., "plural", "past", "feminine") */
  tags?: string[];
  /** IPA pronunciation of this form */
  ipa?: string;
  /** Source reference */
  source?: string;
}

// ============================================================================
// Translation
// ============================================================================

/**
 * Translation of a word to another language
 */
export interface Translation {
  /** Target language code */
  code: LanguageCode;
  /** Target language name */
  lang: string;
  /** Translated word/phrase */
  word: string;
  /** Which sense this translation applies to */
  sense?: string;
  /** Grammatical gender (for gendered languages) */
  gender?: string;
  /** Additional tags or qualifiers */
  tags?: string[];
  /** Romanization (for non-Latin scripts) */
  roman?: string;
  /** Alternative translations */
  alt?: string;
  /** Notes or qualifiers */
  note?: string;
}

// ============================================================================
// Head Templates
// ============================================================================

/**
 * Head template information (inflection tables, etc.)
 */
export interface HeadTemplate {
  /** Template name */
  name: string;
  /** Template arguments */
  args?: Record<string, string>;
  /** Expansion text */
  expansion?: string;
}

// ============================================================================
// Main Word Entry
// ============================================================================

/**
 * Complete Wiktionary word entry
 *
 * This is the root document type for dictionary data storage.
 * Word is the primary key with embedded arrays for senses, translations, etc.
 */
export interface WiktionaryEntry {
  /** The headword/lemma */
  word: string;
  /** Language of this entry */
  lang: string;
  /** Language code (ISO 639) */
  langCode: LanguageCode;
  /** Part of speech */
  pos: PartOfSpeech;
  /** Pronunciations */
  sounds?: Pronunciation[];
  /** Senses/definitions */
  senses: Sense[];
  /** Inflected forms */
  forms?: WordForm[];
  /** Translations to other languages */
  translations?: Translation[];
  /** Etymology information */
  etymology?: Etymology;
  /** Etymology text (simple form) */
  etymologyText?: string;
  /** Etymology number when multiple exist */
  etymologyNumber?: number;
  /** Head templates */
  headTemplates?: HeadTemplate[];
  /** Wiktionary categories */
  categories?: string[];
  /** Wikipedia article references */
  wikipedia?: string[];
  /** Wikidata identifiers */
  wikidata?: string[];
  /** Derived terms */
  derived?: RelatedWord[];
  /** Related terms */
  related?: RelatedWord[];
  /** Descendants (words derived in other languages) */
  descendants?: {
    lang: string;
    langCode: LanguageCode;
    word: string;
    tags?: string[];
  }[];
  /** Original entry source (e.g., "enwiktionary") */
  source?: string;
}

// ============================================================================
// Dataset Configuration
// ============================================================================

/**
 * Data size presets for Wiktionary benchmarks
 */
export type WiktionaryDataSize = 'tiny' | 'small' | 'medium' | 'large';

/**
 * Size configurations (number of word entries)
 */
export const WIKTIONARY_DATA_SIZES: Record<WiktionaryDataSize, number> = {
  tiny: 1_000,          // 1K entries - unit tests
  small: 50_000,        // 50K entries - quick benchmarks
  medium: 500_000,      // 500K entries - moderate benchmarks
  large: 5_000_000,     // 5M entries - full benchmarks
} as const;

// ============================================================================
// Benchmark Query Types
// ============================================================================

/**
 * Word lookup query parameters
 */
export interface WordLookupQuery {
  /** Exact word to look up */
  word: string;
  /** Optional language filter */
  langCode?: LanguageCode;
  /** Optional part of speech filter */
  pos?: PartOfSpeech;
}

/**
 * Prefix search query parameters
 */
export interface PrefixSearchQuery {
  /** Word prefix to search */
  prefix: string;
  /** Optional language filter */
  langCode?: LanguageCode;
  /** Maximum results to return */
  limit?: number;
}

/**
 * Filter query parameters
 */
export interface FilterQuery {
  /** Language code filter */
  langCode?: LanguageCode;
  /** Part of speech filter */
  pos?: PartOfSpeech;
  /** Category filter */
  category?: string;
  /** Tag filter (e.g., "archaic", "informal") */
  tag?: string;
  /** Has pronunciation audio */
  hasAudio?: boolean;
  /** Has etymology */
  hasEtymology?: boolean;
  /** Maximum results */
  limit?: number;
}

/**
 * Full-text search query parameters
 */
export interface FullTextQuery {
  /** Search text (searches in definitions) */
  text: string;
  /** Optional language filter */
  langCode?: LanguageCode;
  /** Optional part of speech filter */
  pos?: PartOfSpeech;
  /** Maximum results */
  limit?: number;
}

/**
 * Translation lookup query
 */
export interface TranslationQuery {
  /** Source word */
  word: string;
  /** Source language */
  fromLang: LanguageCode;
  /** Target language */
  toLang: LanguageCode;
}

// ============================================================================
// Benchmark Result Types
// ============================================================================

/**
 * Shredding benchmark result
 */
export interface WiktionaryShredResult {
  /** Number of entries processed */
  entryCount: number;
  /** Number of columns generated */
  columnCount: number;
  /** Time to shred in milliseconds */
  shredTimeMs: number;
  /** Throughput in entries per second */
  throughput: number;
  /** Total size of column values in bytes (estimated) */
  totalSizeBytes: number;
  /** Compression ratio vs JSON */
  compressionRatio: number;
}

/**
 * Query benchmark result
 */
export interface QueryBenchmarkResult {
  /** Query type */
  queryType: string;
  /** Number of iterations */
  iterations: number;
  /** Total time in milliseconds */
  totalTimeMs: number;
  /** Average time per query in milliseconds */
  avgTimeMs: number;
  /** Queries per second */
  throughput: number;
  /** Number of results returned */
  resultCount: number;
}

/**
 * Full benchmark result
 */
export interface WiktionaryBenchmarkResult {
  size: WiktionaryDataSize;
  entryCount: number;
  shred: WiktionaryShredResult;
  queries: QueryBenchmarkResult[];
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

// ============================================================================
// Raw Data Types (for loader)
// ============================================================================

/**
 * Raw Wiktextract JSON entry (from Kaikki.org JSONL files)
 * Field names match the actual wiktextract output
 */
export interface RawWiktextractEntry {
  word: string;
  lang: string;
  lang_code: string;
  pos: string;
  sounds?: Array<{
    ipa?: string;
    audio?: string;
    ogg_url?: string;
    mp3_url?: string;
    tags?: string[];
    rhymes?: string;
    homophones?: string[];
  }>;
  senses?: Array<{
    glosses?: string[];
    raw_glosses?: string[];
    tags?: string[];
    categories?: string[];
    examples?: Array<{
      text?: string;
      translation?: string;
      ref?: string;
      type?: string;
    }>;
    synonyms?: Array<{
      word: string;
      tags?: string[];
      sense?: string;
    }>;
    antonyms?: Array<{
      word: string;
      tags?: string[];
      sense?: string;
    }>;
    hypernyms?: Array<{
      word: string;
      tags?: string[];
    }>;
    hyponyms?: Array<{
      word: string;
      tags?: string[];
    }>;
    topics?: string[];
    form_of?: Array<{
      word: string;
      tags?: string[];
    }>;
    alt_of?: Array<{
      word: string;
      tags?: string[];
    }>;
    wikipedia?: string[];
    wikidata?: string[];
  }>;
  forms?: Array<{
    form: string;
    tags?: string[];
    ipa?: string;
    source?: string;
  }>;
  translations?: Array<{
    code?: string;
    lang?: string;
    word?: string;
    sense?: string;
    tags?: string[];
    roman?: string;
    alt?: string;
    note?: string;
  }>;
  etymology_text?: string;
  etymology_number?: number;
  etymology_templates?: Array<{
    name: string;
    args?: Record<string, string>;
    expansion?: string;
  }>;
  head_templates?: Array<{
    name: string;
    args?: Record<string, string>;
    expansion?: string;
  }>;
  categories?: string[];
  wikipedia?: string[];
  wikidata?: string[];
  derived?: Array<{
    word: string;
    tags?: string[];
  }>;
  related?: Array<{
    word: string;
    tags?: string[];
  }>;
  descendants?: Array<{
    lang: string;
    lang_code?: string;
    word: string;
    tags?: string[];
  }>;
}
