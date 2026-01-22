/**
 * @evodb/core - Full-Text Search Module
 *
 * Provides full-text search capabilities with:
 * - Inverted index for efficient term lookup
 * - Text tokenization and normalization
 * - Stemming and stopword removal
 * - Query parsing with boolean operators (AND, OR, NOT, phrase, prefix)
 * - TF-IDF score-based ranking
 * - Fuzzy matching with edit distance
 * - Highlighting of matched terms
 *
 * @see TDD issue evodb-71gn
 */

import { assertNever } from './types.js';
import { hasInFilter } from './type-guards.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Configuration for creating a text index
 */
export interface TextIndexConfig {
  /** Language for stemming and stopwords (default: 'english') */
  language?: SupportedLanguage;
  /** Enable stemming (default: true) */
  stemming?: boolean;
  /** Custom stopwords to add (merged with default language stopwords) */
  customStopwords?: string[];
  /** Disable default stopwords */
  disableStopwords?: boolean;
  /** Minimum token length to index (default: 2) */
  minTokenLength?: number;
  /** Maximum token length to index (default: 100) */
  maxTokenLength?: number;
}

/**
 * Field weight configuration for multi-field indexing
 */
export interface FieldWeight {
  /** Weight multiplier for this field (default: 1) */
  weight: number;
}

/**
 * Text index definition
 */
export interface TextIndexDefinition {
  /** Index name */
  name: string;
  /** Collection/table name */
  collection: string;
  /** Indexed fields */
  fields: string[];
  /** Field weights */
  weights: Record<string, number>;
  /** Language for text processing */
  language: SupportedLanguage;
  /** Whether stemming is enabled */
  stemming: boolean;
  /** Index type */
  type: 'text';
}

/**
 * Search options for FTS queries
 */
export interface FTSSearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
  /** Fuzzy matching options */
  fuzzy?: FuzzyOptions;
  /** Override stemming setting */
  stemming?: boolean;
  /** Highlighting options */
  highlight?: HighlightOptions | boolean;
  /** Additional filter predicates */
  filter?: Record<string, unknown>;
  /** Fields to return facet counts for */
  facets?: string[];
  /** Boost factor for exact matches */
  exactMatchBoost?: number;
  /** Custom scoring function */
  scoringFunction?: ScoringFunction;
}

/**
 * Fuzzy matching options
 */
export interface FuzzyOptions {
  /** Maximum edit distance (default: 1) */
  maxEdits: number;
  /** Minimum prefix length before fuzzy matching applies */
  prefixLength?: number;
}

/**
 * Highlighting options
 */
export interface HighlightOptions {
  /** Opening tag for highlights (default: '<mark>') */
  preTag?: string;
  /** Closing tag for highlights (default: '</mark>') */
  postTag?: string;
  /** Maximum snippet length (characters around match) */
  snippetLength?: number;
}

/**
 * Custom scoring function signature
 */
export type ScoringFunction = (
  doc: Record<string, unknown>,
  termFreq: number,
  docFreq: number,
  totalDocs: number
) => number;

/**
 * Search result with score and optional highlights
 */
export interface FTSSearchResult {
  /** Document key/ID */
  key: string;
  /** Relevance score */
  score: number;
  /** Full document data */
  document: Record<string, unknown>;
  /** Highlighted field snippets (if highlighting enabled) */
  highlights?: Record<string, string>;
}

/**
 * Search results with optional facets
 */
export interface FTSSearchResults {
  /** Search results */
  results: FTSSearchResult[];
  /** Facet counts (if facets requested) */
  facets?: Record<string, Record<string, number>>;
  /** Total count before pagination */
  totalCount?: number;
}

/**
 * Text index statistics
 */
export interface TextIndexStats {
  /** Number of indexed documents */
  documentCount: number;
  /** Number of unique terms */
  termCount: number;
  /** Total number of tokens */
  totalTokens: number;
  /** Average document length */
  avgDocumentLength: number;
  /** Index memory estimate (bytes) */
  memorySizeEstimate: number;
}

/**
 * Supported languages for stemming and stopwords
 */
export type SupportedLanguage = 'english' | 'spanish' | 'french' | 'german' | 'italian' | 'portuguese' | 'none';

// =============================================================================
// Query Parser Types
// =============================================================================

/**
 * Parsed query token types
 */
export type QueryTokenType = 'term' | 'phrase' | 'prefix' | 'field' | 'operator';

/**
 * Query operator types
 */
export type QueryOperator = 'AND' | 'OR' | 'NOT';

/**
 * Parsed query token
 */
export interface QueryToken {
  type: QueryTokenType;
  value: string;
  /** For field-specific search */
  field?: string;
  /** For operators */
  operator?: QueryOperator;
  /** Whether to negate this token */
  negated?: boolean;
  /** Original token before processing */
  raw?: string;
}

/**
 * Parsed query structure
 */
export interface ParsedQuery {
  tokens: QueryToken[];
  /** Default operator between terms */
  defaultOperator: QueryOperator;
}

// =============================================================================
// Stopwords by Language
// =============================================================================

const STOPWORDS: Record<SupportedLanguage, Set<string>> = {
  english: new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
    'have', 'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
    'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'can', 'should', 'now', 'i', 'you', 'we', 'your', 'my',
  ]),
  spanish: new Set([
    'a', 'al', 'algo', 'algunas', 'algunos', 'ante', 'antes', 'como', 'con',
    'contra', 'cual', 'cuando', 'de', 'del', 'desde', 'donde', 'durante', 'e',
    'el', 'ella', 'ellas', 'ellos', 'en', 'entre', 'era', 'erais', 'eran',
    'eras', 'eres', 'es', 'esa', 'esas', 'ese', 'eso', 'esos', 'esta', 'estado',
    'estas', 'este', 'esto', 'estos', 'fue', 'fueron', 'ha', 'hacia', 'han',
    'hasta', 'hay', 'la', 'las', 'le', 'les', 'lo', 'los', 'me', 'mi', 'mis',
    'mucho', 'muy', 'nada', 'ni', 'no', 'nos', 'nosotros', 'nuestra', 'nuestras',
    'nuestro', 'nuestros', 'o', 'os', 'otra', 'otras', 'otro', 'otros', 'para',
    'pero', 'poco', 'por', 'porque', 'que', 'quien', 'se', 'ser', 'si', 'sin',
    'sobre', 'somos', 'son', 'soy', 'su', 'sus', 'te', 'ti', 'tiene', 'tienen',
    'toda', 'todas', 'todo', 'todos', 'tu', 'tus', 'un', 'una', 'uno', 'unos',
    'vosotras', 'vosotros', 'vuestra', 'vuestras', 'vuestro', 'vuestros', 'y', 'ya', 'yo',
  ]),
  french: new Set([
    'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'elle', 'en',
    'et', 'eux', 'il', 'je', 'la', 'le', 'les', 'leur', 'lui', 'ma', 'mais',
    'me', 'meme', 'mes', 'moi', 'mon', 'ne', 'nos', 'notre', 'nous', 'on', 'ou',
    'par', 'pas', 'pour', 'qu', 'que', 'qui', 'sa', 'se', 'ses', 'son', 'sur',
    'ta', 'te', 'tes', 'toi', 'ton', 'tu', 'un', 'une', 'vos', 'votre', 'vous',
    'c', 'd', 'j', 'l', 'a', 'm', 'n', 's', 't', 'y', 'ete', 'etee', 'etees',
    'etes', 'etant', 'suis', 'es', 'est', 'sommes', 'etes', 'sont', 'serai',
    'seras', 'sera', 'serons', 'serez', 'seront',
  ]),
  german: new Set([
    'aber', 'alle', 'allem', 'allen', 'aller', 'alles', 'als', 'also', 'am',
    'an', 'ander', 'andere', 'anderem', 'anderen', 'anderer', 'anderes', 'anders',
    'auch', 'auf', 'aus', 'bei', 'bin', 'bis', 'bist', 'da', 'damit', 'dann',
    'der', 'den', 'des', 'dem', 'die', 'das', 'dass', 'dein', 'deine', 'deinem',
    'deinen', 'deiner', 'deines', 'denn', 'derer', 'dessen', 'dich', 'dir', 'du',
    'dies', 'diese', 'dieselbe', 'dieselben', 'diesem', 'diesen', 'dieser',
    'dieses', 'doch', 'dort', 'durch', 'ein', 'eine', 'einem', 'einen', 'einer',
    'eines', 'einig', 'einige', 'einigem', 'einigen', 'einiger', 'einiges', 'einmal',
    'er', 'ihn', 'ihm', 'es', 'etwas', 'euer', 'eure', 'eurem', 'euren', 'eurer',
    'eures', 'fur', 'gegen', 'gewesen', 'hab', 'habe', 'haben', 'hat', 'hatte',
    'hatten', 'hier', 'hin', 'hinter', 'ich', 'mich', 'mir', 'ihr', 'ihre', 'ihrem',
    'ihren', 'ihrer', 'ihres', 'im', 'in', 'indem', 'ins', 'ist', 'jede', 'jedem',
    'jeden', 'jeder', 'jedes', 'jene', 'jenem', 'jenen', 'jener', 'jenes', 'jetzt',
    'kann', 'kein', 'keine', 'keinem', 'keinen', 'keiner', 'keines', 'konnen',
    'konnte', 'machen', 'man', 'manche', 'manchem', 'manchen', 'mancher', 'manches',
    'mein', 'meine', 'meinem', 'meinen', 'meiner', 'meines', 'mit', 'muss', 'musste',
    'nach', 'nicht', 'nichts', 'noch', 'nun', 'nur', 'ob', 'oder', 'ohne', 'sehr',
    'sein', 'seine', 'seinem', 'seinen', 'seiner', 'seines', 'selbst', 'sich', 'sie',
    'ihnen', 'sind', 'so', 'solche', 'solchem', 'solchen', 'solcher', 'solches',
    'soll', 'sollte', 'sondern', 'sonst', 'uber', 'um', 'und', 'uns', 'unsere',
    'unserem', 'unseren', 'unser', 'unseres', 'unter', 'viel', 'vom', 'von', 'vor',
    'wahrend', 'war', 'waren', 'warst', 'was', 'weg', 'weil', 'weiter', 'welche',
    'welchem', 'welchen', 'welcher', 'welches', 'wenn', 'werde', 'werden', 'wie',
    'wieder', 'will', 'wir', 'wird', 'wirst', 'wo', 'wollen', 'wollte', 'wurde',
    'wurden', 'zu', 'zum', 'zur', 'zwar', 'zwischen',
  ]),
  italian: new Set([
    'a', 'abbia', 'abbiamo', 'abbiano', 'abbiate', 'ad', 'agl', 'agli', 'ai', 'al',
    'all', 'alla', 'alle', 'allo', 'anche', 'avemmo', 'avendo', 'avere', 'avesse',
    'avessero', 'avessi', 'avessimo', 'aveste', 'avesti', 'avete', 'aveva', 'avevamo',
    'avevano', 'avevate', 'avevi', 'avevo', 'avra', 'avrai', 'avranno', 'avrebbe',
    'avrebbero', 'avrei', 'avremmo', 'avremo', 'avreste', 'avresti', 'avrete', 'avro',
    'avuta', 'avute', 'avuti', 'avuto', 'c', 'che', 'chi', 'ci', 'coi', 'col', 'come',
    'con', 'contro', 'cui', 'da', 'dagl', 'dagli', 'dai', 'dal', 'dall', 'dalla',
    'dalle', 'dallo', 'degl', 'degli', 'dei', 'del', 'dell', 'della', 'delle', 'dello',
    'di', 'dov', 'dove', 'e', 'ebbe', 'ebbero', 'ebbi', 'ed', 'era', 'erano', 'eravamo',
    'eravate', 'eri', 'ero', 'essendo', 'essere', 'faccia', 'facciamo', 'facciano',
    'facciate', 'faccio', 'facemmo', 'facendo', 'facesse', 'facessero', 'facessi',
    'facessimo', 'faceste', 'facesti', 'faceva', 'facevamo', 'facevano', 'facevate',
    'facevi', 'facevo', 'fai', 'fanno', 'fara', 'farai', 'faranno', 'farebbe',
    'farebbero', 'farei', 'faremmo', 'faremo', 'fareste', 'faresti', 'farete', 'faro',
    'fece', 'fecero', 'feci', 'fosse', 'fossero', 'fossi', 'fossimo', 'foste', 'fosti',
    'fu', 'fui', 'fummo', 'furono', 'gli', 'ha', 'hai', 'hanno', 'ho', 'i', 'il', 'in',
    'io', 'l', 'la', 'le', 'lei', 'li', 'lo', 'loro', 'lui', 'ma', 'me', 'mi', 'mia',
    'mie', 'miei', 'mio', 'ne', 'negl', 'negli', 'nei', 'nel', 'nell', 'nella', 'nelle',
    'nello', 'noi', 'non', 'nostra', 'nostre', 'nostri', 'nostro', 'o', 'per', 'perche',
    'piu', 'quale', 'quanta', 'quante', 'quanti', 'quanto', 'quella', 'quelle', 'quelli',
    'quello', 'questa', 'queste', 'questi', 'questo', 'sara', 'sarai', 'saranno',
    'sarebbe', 'sarebbero', 'sarei', 'saremmo', 'saremo', 'sareste', 'saresti', 'sarete',
    'saro', 'se', 'sei', 'si', 'sia', 'siamo', 'siano', 'siate', 'siete', 'sono', 'sta',
    'stai', 'stando', 'stanno', 'stara', 'starai', 'staranno', 'starebbe', 'starebbero',
    'starei', 'staremmo', 'staremo', 'stareste', 'staresti', 'starete', 'staro', 'stava',
    'stavamo', 'stavano', 'stavate', 'stavi', 'stavo', 'stemmo', 'stesse', 'stessero',
    'stessi', 'stessimo', 'steste', 'stesti', 'stette', 'stettero', 'stetti', 'stia',
    'stiamo', 'stiano', 'stiate', 'sto', 'su', 'sua', 'sue', 'sugl', 'sugli', 'sui',
    'sul', 'sull', 'sulla', 'sulle', 'sullo', 'suo', 'suoi', 'ti', 'tra', 'tu', 'tua',
    'tue', 'tuo', 'tuoi', 'tutti', 'tutto', 'un', 'una', 'uno', 'vi', 'voi', 'vostra',
    'vostre', 'vostri', 'vostro',
  ]),
  portuguese: new Set([
    'a', 'ao', 'aos', 'aquela', 'aquelas', 'aquele', 'aqueles', 'aquilo', 'as', 'ate',
    'com', 'como', 'da', 'das', 'de', 'dela', 'delas', 'dele', 'deles', 'depois', 'do',
    'dos', 'e', 'ela', 'elas', 'ele', 'eles', 'em', 'entre', 'era', 'eram', 'essa',
    'essas', 'esse', 'esses', 'esta', 'estamos', 'estas', 'estava', 'estavam', 'este',
    'esteja', 'estejam', 'estejamos', 'estes', 'esteve', 'estive', 'estivemos', 'estiver',
    'estivera', 'estiveram', 'estiverem', 'estivermos', 'estivesse', 'estivessem',
    'estou', 'eu', 'foi', 'fomos', 'for', 'fora', 'foram', 'forem', 'formos', 'fosse',
    'fossem', 'fui', 'ha', 'havia', 'isso', 'isto', 'ja', 'lhe', 'lhes', 'lo', 'mas',
    'me', 'mesmo', 'meu', 'meus', 'minha', 'minhas', 'muito', 'na', 'nao', 'nas', 'nem',
    'no', 'nos', 'nossa', 'nossas', 'nosso', 'nossos', 'num', 'numa', 'o', 'os', 'ou',
    'para', 'pela', 'pelas', 'pelo', 'pelos', 'por', 'qual', 'quando', 'que', 'quem',
    'sao', 'se', 'seja', 'sejam', 'sejamos', 'sem', 'ser', 'sera', 'serao', 'seria',
    'seriam', 'seu', 'seus', 'so', 'somos', 'sou', 'sua', 'suas', 'tambem', 'te', 'tem',
    'temos', 'tenha', 'tenham', 'tenhamos', 'tenho', 'ter', 'tera', 'terao', 'teria',
    'teriam', 'teu', 'teus', 'teve', 'tinha', 'tinham', 'tive', 'tivemos', 'tiver',
    'tivera', 'tiveram', 'tiverem', 'tivermos', 'tivesse', 'tivessem', 'tu', 'tua',
    'tuas', 'um', 'uma', 'voce', 'voces', 'vos',
  ]),
  none: new Set(),
};

// =============================================================================
// Porter Stemmer Implementation
// =============================================================================

/**
 * Stemmer interface
 */
export interface Stemmer {
  stem(word: string): string;
}

/**
 * Porter Stemmer for English - implements the Porter stemming algorithm
 * Reference: https://tartarus.org/martin/PorterStemmer/
 */
export class PorterStemmer implements Stemmer {
  private static readonly STEP2_SUFFIXES: Array<[string, string]> = [
    ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
    ['izer', 'ize'], ['bli', 'ble'], ['alli', 'al'], ['entli', 'ent'],
    ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation', 'ate'],
    ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'],
    ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'],
    ['logi', 'log'],
  ];

  private static readonly STEP3_SUFFIXES: Array<[string, string]> = [
    ['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'],
    ['ical', 'ic'], ['ful', ''], ['ness', ''],
  ];

  private static readonly STEP4_SUFFIXES: string[] = [
    'al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant', 'ement',
    'ment', 'ent', 'ion', 'ou', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize',
  ];

  /**
   * Check if character is a consonant
   */
  private isConsonant(word: string, i: number): boolean {
    const c = word[i];
    if (c === 'a' || c === 'e' || c === 'i' || c === 'o' || c === 'u') return false;
    if (c === 'y') {
      return i === 0 || !this.isConsonant(word, i - 1);
    }
    return true;
  }

  /**
   * Measure the number of consonant sequences in a word
   */
  private measure(word: string): number {
    let m = 0;
    let i = 0;
    const len = word.length;

    // Skip initial consonants
    while (i < len && this.isConsonant(word, i)) i++;

    while (i < len) {
      // Skip vowels
      while (i < len && !this.isConsonant(word, i)) i++;
      if (i >= len) break;
      m++;
      // Skip consonants
      while (i < len && this.isConsonant(word, i)) i++;
    }

    return m;
  }

  /**
   * Check if word contains a vowel
   */
  private containsVowel(word: string): boolean {
    for (let i = 0; i < word.length; i++) {
      if (!this.isConsonant(word, i)) return true;
    }
    return false;
  }

  /**
   * Check if word ends with double consonant
   */
  private endsWithDoubleConsonant(word: string): boolean {
    const len = word.length;
    if (len < 2) return false;
    return word[len - 1] === word[len - 2] && this.isConsonant(word, len - 1);
  }

  /**
   * Check if word ends with consonant-vowel-consonant pattern (not w, x, y)
   */
  private endsCVC(word: string): boolean {
    const len = word.length;
    if (len < 3) return false;
    const c1 = word[len - 1];
    if (c1 === 'w' || c1 === 'x' || c1 === 'y') return false;
    return this.isConsonant(word, len - 1) &&
           !this.isConsonant(word, len - 2) &&
           this.isConsonant(word, len - 3);
  }

  /**
   * Replace suffix if measure > threshold
   */
  private replaceSuffix(
    word: string,
    suffix: string,
    replacement: string,
    minMeasure: number
  ): string {
    if (!word.endsWith(suffix)) return word;
    const stem = word.slice(0, -suffix.length);
    if (this.measure(stem) > minMeasure) {
      return stem + replacement;
    }
    return word;
  }

  stem(word: string): string {
    // Don't stem short words
    if (word.length < 3) return word;

    let result = word.toLowerCase();

    // Step 1a: Handle plurals and -ed/-ing
    if (result.endsWith('sses')) {
      result = result.slice(0, -2);
    } else if (result.endsWith('ies')) {
      result = result.slice(0, -2);
    } else if (result.endsWith('ss')) {
      // Keep as-is
    } else if (result.endsWith('s')) {
      result = result.slice(0, -1);
    }

    // Step 1b: Handle -eed, -ed, -ing
    if (result.endsWith('eed')) {
      if (this.measure(result.slice(0, -3)) > 0) {
        result = result.slice(0, -1);
      }
    } else if (result.endsWith('ed') && this.containsVowel(result.slice(0, -2))) {
      result = result.slice(0, -2);
      // Handle -at, -bl, -iz
      if (result.endsWith('at') || result.endsWith('bl') || result.endsWith('iz')) {
        result += 'e';
      } else if (this.endsWithDoubleConsonant(result) &&
                 !(result.endsWith('l') || result.endsWith('s') || result.endsWith('z'))) {
        result = result.slice(0, -1);
      } else if (this.measure(result) === 1 && this.endsCVC(result)) {
        result += 'e';
      }
    } else if (result.endsWith('ing') && this.containsVowel(result.slice(0, -3))) {
      result = result.slice(0, -3);
      // Same handling as -ed
      if (result.endsWith('at') || result.endsWith('bl') || result.endsWith('iz')) {
        result += 'e';
      } else if (this.endsWithDoubleConsonant(result) &&
                 !(result.endsWith('l') || result.endsWith('s') || result.endsWith('z'))) {
        result = result.slice(0, -1);
      } else if (this.measure(result) === 1 && this.endsCVC(result)) {
        result += 'e';
      }
    }

    // Step 1c: Replace terminal y with i
    if (result.endsWith('y') && this.containsVowel(result.slice(0, -1))) {
      result = result.slice(0, -1) + 'i';
    }

    // Step 2: Remove derivational suffixes
    for (const [suffix, replacement] of PorterStemmer.STEP2_SUFFIXES) {
      if (result.endsWith(suffix)) {
        const stem = result.slice(0, -suffix.length);
        if (this.measure(stem) > 0) {
          result = stem + replacement;
        }
        break;
      }
    }

    // Step 3: Remove more derivational suffixes
    for (const [suffix, replacement] of PorterStemmer.STEP3_SUFFIXES) {
      if (result.endsWith(suffix)) {
        const stem = result.slice(0, -suffix.length);
        if (this.measure(stem) > 0) {
          result = stem + replacement;
        }
        break;
      }
    }

    // Step 4: Remove additional suffixes
    for (const suffix of PorterStemmer.STEP4_SUFFIXES) {
      if (result.endsWith(suffix)) {
        const stem = result.slice(0, -suffix.length);
        if (suffix === 'ion') {
          // Special case: stem must end in s or t
          if (this.measure(stem) > 1 && (stem.endsWith('s') || stem.endsWith('t'))) {
            result = stem;
          }
        } else if (this.measure(stem) > 1) {
          result = stem;
        }
        break;
      }
    }

    // Step 5a: Remove final e
    if (result.endsWith('e')) {
      const stem = result.slice(0, -1);
      if (this.measure(stem) > 1 || (this.measure(stem) === 1 && !this.endsCVC(stem))) {
        result = stem;
      }
    }

    // Step 5b: Remove double l
    if (result.endsWith('ll') && this.measure(result) > 1) {
      result = result.slice(0, -1);
    }

    return result;
  }
}

/**
 * Spanish Stemmer - simplified implementation
 */
export class SpanishStemmer implements Stemmer {
  private static readonly SUFFIXES = [
    'amientos', 'imientos', 'amiento', 'imiento', 'aciones', 'uciones',
    'adores', 'adoras', 'idades', 'ancias', 'encias', 'mente',
    'adora', 'ador', 'antes', 'ancia', 'encia', 'icas', 'icos',
    'ismos', 'ables', 'ibles', 'istas', 'osas', 'osos', 'iva', 'ivo',
    'ica', 'ico', 'oso', 'osa', 'able', 'ible', 'ista', 'ismo',
    'ando', 'endo', 'aron', 'ieron', 'aban', 'aran', 'ido', 'ado',
    'ar', 'er', 'ir', 'as', 'es', 'is', 'os', 'a', 'e', 'i', 'o',
  ];

  stem(word: string): string {
    if (word.length < 3) return word;
    let result = word.toLowerCase();

    for (const suffix of SpanishStemmer.SUFFIXES) {
      if (result.endsWith(suffix) && result.length - suffix.length >= 2) {
        result = result.slice(0, -suffix.length);
        break;
      }
    }

    return result;
  }
}

/**
 * Create a stemmer for the given language
 */
export function createStemmer(language: SupportedLanguage): Stemmer | null {
  switch (language) {
    case 'english':
      return new PorterStemmer();
    case 'spanish':
      return new SpanishStemmer();
    case 'french':
    case 'german':
    case 'italian':
    case 'portuguese':
      // Use a basic suffix-stripping approach for these languages
      return new PorterStemmer(); // Fallback to English stemmer
    case 'none':
      return null;
    default:
      assertNever(language, `Unsupported language: ${language}`);
  }
}

// =============================================================================
// Tokenizer
// =============================================================================

/**
 * Tokenizer configuration
 */
export interface TokenizerConfig {
  /** Language for stopwords */
  language: SupportedLanguage;
  /** Stemmer instance (optional) */
  stemmer: Stemmer | null;
  /** Custom stopwords to add */
  customStopwords?: Set<string>;
  /** Disable stopword removal */
  disableStopwords?: boolean;
  /** Minimum token length */
  minTokenLength: number;
  /** Maximum token length */
  maxTokenLength: number;
}

/**
 * Tokenized term with position information
 */
export interface TokenizedTerm {
  /** Original term */
  original: string;
  /** Normalized/stemmed term */
  normalized: string;
  /** Position in the source text */
  position: number;
}

/**
 * Text tokenizer with normalization, stemming, and stopword removal
 */
export class Tokenizer {
  private readonly stopwords: Set<string>;
  private readonly stemmer: Stemmer | null;
  private readonly minLength: number;
  private readonly maxLength: number;

  constructor(config: TokenizerConfig) {
    this.stemmer = config.stemmer;
    this.minLength = config.minTokenLength;
    this.maxLength = config.maxTokenLength;

    if (config.disableStopwords) {
      this.stopwords = new Set();
    } else {
      this.stopwords = new Set(STOPWORDS[config.language]);
      if (config.customStopwords) {
        for (const word of config.customStopwords) {
          this.stopwords.add(word.toLowerCase());
        }
      }
    }
  }

  /**
   * Tokenize text into normalized terms with positions
   */
  tokenize(text: string): TokenizedTerm[] {
    if (!text) return [];

    const tokens: TokenizedTerm[] = [];
    let position = 0;

    // Split on whitespace and punctuation, keeping track of positions
    const regex = /[a-zA-Z0-9\u00C0-\u024F]+/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const original = match[0];
      const normalized = this.normalize(original);

      if (normalized && this.isValidToken(normalized)) {
        tokens.push({
          original,
          normalized,
          position,
        });
      }
      position++;
    }

    return tokens;
  }

  /**
   * Tokenize to just normalized strings (without positions)
   */
  tokenizeToStrings(text: string): string[] {
    return this.tokenize(text).map(t => t.normalized);
  }

  /**
   * Normalize a single token
   */
  normalize(token: string): string {
    let normalized = token.toLowerCase();

    // Check stopwords before stemming
    if (this.stopwords.has(normalized)) {
      return '';
    }

    // Apply stemming if available
    if (this.stemmer) {
      normalized = this.stemmer.stem(normalized);
    }

    return normalized;
  }

  /**
   * Check if token is valid (length constraints, not a stopword)
   */
  private isValidToken(token: string): boolean {
    return token.length >= this.minLength &&
           token.length <= this.maxLength &&
           !this.stopwords.has(token);
  }

  /**
   * Check if a word is a stopword
   */
  isStopword(word: string): boolean {
    return this.stopwords.has(word.toLowerCase());
  }
}

// =============================================================================
// Query Parser
// =============================================================================

/**
 * Parse FTS query string into structured tokens
 */
export class FTSQueryParser {
  private readonly tokenizer: Tokenizer;

  constructor(tokenizer: Tokenizer) {
    this.tokenizer = tokenizer;
  }

  /**
   * Parse a query string
   */
  parse(query: string, options?: { stemming?: boolean }): ParsedQuery {
    const tokens: QueryToken[] = [];
    let defaultOperator: QueryOperator = 'AND';
    let i = 0;
    const len = query.length;

    while (i < len) {
      // Skip whitespace
      while (i < len && /\s/.test(query[i])) i++;
      if (i >= len) break;

      // Check for phrase (quoted string)
      if (query[i] === '"') {
        const phraseStart = i + 1;
        i++;
        while (i < len && query[i] !== '"') i++;
        const phrase = query.slice(phraseStart, i);
        if (phrase) {
          tokens.push({
            type: 'phrase',
            value: phrase.toLowerCase(),
            raw: `"${phrase}"`,
          });
        }
        i++; // Skip closing quote
        continue;
      }

      // Check for negation
      const negated = query[i] === '-';
      if (negated) i++;

      // Check for operators
      const remaining = query.slice(i);
      if (remaining.startsWith('OR ') || remaining.startsWith('OR\t')) {
        defaultOperator = 'OR';
        tokens.push({ type: 'operator', value: 'OR', operator: 'OR' });
        i += 3;
        continue;
      }
      if (remaining.startsWith('AND ') || remaining.startsWith('AND\t')) {
        tokens.push({ type: 'operator', value: 'AND', operator: 'AND' });
        i += 4;
        continue;
      }
      if (remaining.startsWith('NOT ') || remaining.startsWith('NOT\t')) {
        tokens.push({ type: 'operator', value: 'NOT', operator: 'NOT' });
        i += 4;
        continue;
      }

      // Extract word/term
      const wordMatch = remaining.match(/^[a-zA-Z0-9\u00C0-\u024F_*~]+/);
      if (!wordMatch) {
        i++;
        continue;
      }

      const word = wordMatch[0];
      i += word.length;

      // Check for field-specific search (field:term)
      if (i < len && query[i] === ':') {
        i++;
        const valueMatch = query.slice(i).match(/^[a-zA-Z0-9\u00C0-\u024F_*~]+/);
        if (valueMatch) {
          const value = valueMatch[0];
          i += value.length;
          const normalized = options?.stemming !== false
            ? this.tokenizer.normalize(value) || value.toLowerCase()
            : value.toLowerCase();
          tokens.push({
            type: 'field',
            value: normalized,
            field: word,
            negated,
            raw: `${word}:${value}`,
          });
          continue;
        }
      }

      // Check for prefix search (word*)
      if (word.endsWith('*')) {
        const prefix = word.slice(0, -1).toLowerCase();
        tokens.push({
          type: 'prefix',
          value: prefix,
          negated,
          raw: word,
        });
        continue;
      }

      // Check for fuzzy search (word~)
      if (word.endsWith('~')) {
        const term = word.slice(0, -1).toLowerCase();
        tokens.push({
          type: 'term',
          value: term,
          negated,
          raw: word,
        });
        continue;
      }

      // Regular term - normalize/stem
      let normalized: string;
      if (options?.stemming !== false) {
        normalized = this.tokenizer.normalize(word);
        // Skip stopwords (normalize returns empty string for stopwords)
        if (!normalized) continue;
      } else {
        normalized = word.toLowerCase();
      }

      // Skip empty normalized terms
      if (!normalized) continue;

      tokens.push({
        type: 'term',
        value: normalized,
        negated,
        raw: word,
      });
    }

    return { tokens, defaultOperator };
  }
}

// =============================================================================
// Inverted Index
// =============================================================================

/**
 * Posting entry in the inverted index
 */
export interface Posting {
  /** Document ID */
  docId: string;
  /** Term frequency in this document */
  termFreq: number;
  /** Positions of the term in the document */
  positions: number[];
  /** Field where the term was found */
  field: string;
}

/**
 * Posting list for a term
 */
export interface PostingList {
  /** Document frequency (number of docs containing term) */
  docFreq: number;
  /** Posting entries */
  postings: Map<string, Posting[]>;
}

/**
 * Inverted index for full-text search
 */
export class InvertedIndex {
  /** term -> PostingList */
  private readonly index: Map<string, PostingList> = new Map();
  /** docId -> document length (total tokens) */
  private readonly docLengths: Map<string, number> = new Map();
  /** docId -> original document */
  private readonly documents: Map<string, Record<string, unknown>> = new Map();
  /** Total documents */
  private totalDocs = 0;
  /** Total tokens */
  private totalTokens = 0;

  /**
   * Add a document to the index
   */
  addDocument(
    docId: string,
    document: Record<string, unknown>,
    tokens: Map<string, TokenizedTerm[]>
  ): void {
    // Remove existing document if present
    if (this.documents.has(docId)) {
      this.removeDocument(docId);
    }

    this.documents.set(docId, document);
    this.totalDocs++;

    let docLength = 0;

    // Process tokens for each field
    for (const [field, fieldTokens] of tokens) {
      docLength += fieldTokens.length;

      // Group by normalized term
      const termFreqs = new Map<string, { count: number; positions: number[] }>();
      for (const token of fieldTokens) {
        const existing = termFreqs.get(token.normalized);
        if (existing) {
          existing.count++;
          existing.positions.push(token.position);
        } else {
          termFreqs.set(token.normalized, { count: 1, positions: [token.position] });
        }
      }

      // Add to inverted index
      for (const [term, { count, positions }] of termFreqs) {
        let postingList = this.index.get(term);
        if (!postingList) {
          postingList = { docFreq: 0, postings: new Map() };
          this.index.set(term, postingList);
        }

        let docPostings = postingList.postings.get(docId);
        if (!docPostings) {
          docPostings = [];
          postingList.postings.set(docId, docPostings);
          postingList.docFreq++;
        }

        docPostings.push({
          docId,
          termFreq: count,
          positions,
          field,
        });
      }
    }

    this.docLengths.set(docId, docLength);
    this.totalTokens += docLength;
  }

  /**
   * Remove a document from the index
   */
  removeDocument(docId: string): boolean {
    if (!this.documents.has(docId)) return false;

    const docLength = this.docLengths.get(docId) || 0;

    // Remove from all posting lists
    for (const [term, postingList] of this.index) {
      if (postingList.postings.has(docId)) {
        postingList.postings.delete(docId);
        postingList.docFreq--;

        // Remove empty posting lists
        if (postingList.docFreq === 0) {
          this.index.delete(term);
        }
      }
    }

    this.documents.delete(docId);
    this.docLengths.delete(docId);
    this.totalDocs--;
    this.totalTokens -= docLength;

    return true;
  }

  /**
   * Get posting list for a term
   */
  getPostingList(term: string): PostingList | undefined {
    return this.index.get(term);
  }

  /**
   * Get all terms matching a prefix
   */
  getTermsWithPrefix(prefix: string): string[] {
    const terms: string[] = [];
    for (const term of this.index.keys()) {
      if (term.startsWith(prefix)) {
        terms.push(term);
      }
    }
    return terms;
  }

  /**
   * Get all terms in the index
   */
  getAllTerms(): IterableIterator<string> {
    return this.index.keys();
  }

  /**
   * Get document by ID
   */
  getDocument(docId: string): Record<string, unknown> | undefined {
    return this.documents.get(docId);
  }

  /**
   * Get document length
   */
  getDocLength(docId: string): number {
    return this.docLengths.get(docId) || 0;
  }

  /**
   * Get total documents
   */
  getTotalDocs(): number {
    return this.totalDocs;
  }

  /**
   * Get average document length
   */
  getAvgDocLength(): number {
    return this.totalDocs > 0 ? this.totalTokens / this.totalDocs : 0;
  }

  /**
   * Get index statistics
   */
  getStats(): TextIndexStats {
    const termCount = this.index.size;
    // Estimate memory: rough approximation
    let memorySizeEstimate = 0;
    for (const [term, postingList] of this.index) {
      memorySizeEstimate += term.length * 2; // term string
      memorySizeEstimate += 8; // docFreq number
      for (const postings of postingList.postings.values()) {
        for (const posting of postings) {
          memorySizeEstimate += 50; // base posting object
          memorySizeEstimate += posting.positions.length * 4; // positions
        }
      }
    }

    return {
      documentCount: this.totalDocs,
      termCount,
      totalTokens: this.totalTokens,
      avgDocumentLength: this.getAvgDocLength(),
      memorySizeEstimate,
    };
  }

  /**
   * Get all document IDs
   */
  getAllDocIds(): string[] {
    return Array.from(this.documents.keys());
  }
}

// =============================================================================
// Fuzzy Matching
// =============================================================================

/**
 * Calculate Levenshtein edit distance between two strings
 */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Early termination for empty strings
  if (m === 0) return n;
  if (n === 0) return m;

  // Use single row to save memory
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const current = Math.min(
        row[j] + 1,      // deletion
        prev + 1,        // insertion
        row[j - 1] + cost // substitution
      );
      row[j - 1] = prev;
      prev = current;
    }
    row[n] = prev;
  }

  return row[n];
}

/**
 * Find fuzzy matches for a term in the index
 */
export function findFuzzyMatches(
  index: InvertedIndex,
  term: string,
  maxEdits: number,
  prefixLength = 0
): Array<{ term: string; distance: number }> {
  const matches: Array<{ term: string; distance: number }> = [];
  const prefix = term.slice(0, prefixLength);

  // Get all terms from index and check edit distance
  for (const indexTerm of index.getAllTerms()) {
    // Skip if prefix doesn't match
    if (prefixLength > 0 && !indexTerm.startsWith(prefix)) continue;

    const distance = editDistance(term, indexTerm);
    if (distance <= maxEdits) {
      matches.push({ term: indexTerm, distance });
    }
  }

  return matches.sort((a, b) => a.distance - b.distance);
}

// =============================================================================
// Scoring (TF-IDF and BM25)
// =============================================================================

/**
 * Calculate TF-IDF score
 */
export function calculateTFIDF(
  termFreq: number,
  docFreq: number,
  totalDocs: number
): number {
  // TF: log normalization
  const tf = 1 + Math.log(termFreq);
  // IDF: standard formula with smoothing
  const idf = Math.log((totalDocs + 1) / (docFreq + 1)) + 1;
  return tf * idf;
}

/**
 * Calculate BM25 score
 */
export function calculateBM25(
  termFreq: number,
  docFreq: number,
  totalDocs: number,
  docLength: number,
  avgDocLength: number,
  k1 = 1.2,
  b = 0.75
): number {
  const idf = Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  const tfNorm = (termFreq * (k1 + 1)) /
    (termFreq + k1 * (1 - b + b * docLength / avgDocLength));
  return idf * tfNorm;
}

// =============================================================================
// TextIndex Implementation
// =============================================================================

/**
 * Text index for full-text search
 */
export class TextIndex {
  readonly definition: TextIndexDefinition;
  private readonly tokenizer: Tokenizer;
  private readonly queryParser: FTSQueryParser;
  private readonly invertedIndex: InvertedIndex;
  private readonly stemmer: Stemmer | null;

  constructor(
    collection: string,
    fields: string[] | Record<string, FieldWeight>,
    config: TextIndexConfig = {}
  ) {
    const language = config.language || 'english';
    const stemming = config.stemming !== false;

    // Parse field weights
    let fieldList: string[];
    let weights: Record<string, number>;

    if (Array.isArray(fields)) {
      fieldList = fields;
      weights = {};
      for (const field of fields) {
        weights[field] = 1;
      }
    } else {
      fieldList = Object.keys(fields);
      weights = {};
      for (const [field, config] of Object.entries(fields)) {
        weights[field] = config.weight;
      }
    }

    // Generate index name
    const name = `${collection}_${fieldList.join('_')}_text`;

    this.definition = {
      name,
      collection,
      fields: fieldList,
      weights,
      language,
      stemming,
      type: 'text',
    };

    this.stemmer = stemming ? createStemmer(language) : null;

    this.tokenizer = new Tokenizer({
      language,
      stemmer: this.stemmer,
      customStopwords: config.customStopwords
        ? new Set(config.customStopwords)
        : undefined,
      disableStopwords: config.disableStopwords,
      minTokenLength: config.minTokenLength ?? 2,
      maxTokenLength: config.maxTokenLength ?? 100,
    });

    this.queryParser = new FTSQueryParser(this.tokenizer);
    this.invertedIndex = new InvertedIndex();
  }

  /**
   * Index a document
   */
  indexDocument(docId: string, document: Record<string, unknown>): void {
    const tokensByField = new Map<string, TokenizedTerm[]>();

    for (const field of this.definition.fields) {
      const value = this.getFieldValue(document, field);
      if (value !== null && value !== undefined) {
        const text = String(value);
        const tokens = this.tokenizer.tokenize(text);
        tokensByField.set(field, tokens);
      }
    }

    this.invertedIndex.addDocument(docId, document, tokensByField);
  }

  /**
   * Remove a document from the index
   */
  removeDocument(docId: string): boolean {
    return this.invertedIndex.removeDocument(docId);
  }

  /**
   * Search the index
   */
  search(query: string, options: FTSSearchOptions = {}): FTSSearchResults {
    const parsedQuery = this.queryParser.parse(query, {
      stemming: options.stemming ?? this.definition.stemming,
    });

    // Handle empty query
    if (parsedQuery.tokens.length === 0) {
      return { results: [] };
    }

    // Find matching documents
    const docScores = this.findMatchingDocs(parsedQuery, options);

    // Apply additional filters
    let results = Array.from(docScores.entries())
      .map(([docId, score]) => ({
        key: docId,
        score,
        document: this.invertedIndex.getDocument(docId) || {},
      }));

    // Apply filter predicates
    if (options.filter) {
      results = results.filter(result =>
        this.matchesFilter(result.document, options.filter!)
      );
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Calculate facets before pagination
    let facets: Record<string, Record<string, number>> | undefined;
    if (options.facets) {
      facets = this.calculateFacets(results, options.facets);
    }

    const totalCount = results.length;

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 10;
    results = results.slice(offset, offset + limit);

    // Add highlights if requested
    if (options.highlight) {
      const highlightOpts = typeof options.highlight === 'boolean'
        ? { preTag: '<mark>', postTag: '</mark>' }
        : options.highlight;

      for (const result of results) {
        result.highlights = this.generateHighlights(
          result.document,
          parsedQuery,
          highlightOpts
        );
      }
    }

    return { results, facets, totalCount };
  }

  /**
   * Find documents matching the query and calculate scores
   */
  private findMatchingDocs(
    query: ParsedQuery,
    options: FTSSearchOptions
  ): Map<string, number> {
    const docScores = new Map<string, number>();
    const docTermCounts = new Map<string, number>();
    const requiredDocs = new Set<string>();
    const excludedDocs = new Set<string>();
    const totalDocs = this.invertedIndex.getTotalDocs();
    const avgDocLength = this.invertedIndex.getAvgDocLength();

    let isFirstRequiredTerm = true;

    for (const token of query.tokens) {
      if (token.type === 'operator') continue;

      const matchingTerms = this.getMatchingTerms(token, options);

      for (const { term, boost } of matchingTerms) {
        const postingList = this.invertedIndex.getPostingList(term);
        if (!postingList) continue;

        const matchingDocIds = new Set<string>();

        for (const [docId, postings] of postingList.postings) {
          if (token.negated) {
            excludedDocs.add(docId);
            continue;
          }

          matchingDocIds.add(docId);

          // Calculate score for this term in this document
          let termScore = 0;
          for (const posting of postings) {
            // Skip if field-specific search doesn't match
            if (token.field && posting.field !== token.field) continue;

            const fieldWeight = this.definition.weights[posting.field] || 1;
            const docLength = this.invertedIndex.getDocLength(docId);

            // Use custom scoring function if provided
            if (options.scoringFunction) {
              const doc = this.invertedIndex.getDocument(docId) || {};
              termScore += options.scoringFunction(
                doc,
                posting.termFreq,
                postingList.docFreq,
                totalDocs
              ) * fieldWeight * boost;
            } else {
              // Use BM25 scoring
              termScore += calculateBM25(
                posting.termFreq,
                postingList.docFreq,
                totalDocs,
                docLength,
                avgDocLength
              ) * fieldWeight * boost;
            }
          }

          // Exact match boost
          if (options.exactMatchBoost && token.raw) {
            const doc = this.invertedIndex.getDocument(docId);
            if (doc) {
              for (const field of this.definition.fields) {
                const value = this.getFieldValue(doc, field);
                if (String(value).toLowerCase() === token.raw.toLowerCase()) {
                  termScore *= options.exactMatchBoost;
                }
              }
            }
          }

          const currentScore = docScores.get(docId) || 0;
          docScores.set(docId, currentScore + termScore);
          docTermCounts.set(docId, (docTermCounts.get(docId) || 0) + 1);
        }

        // Track required documents for AND logic
        if (!token.negated) {
          if (query.defaultOperator === 'AND') {
            if (isFirstRequiredTerm) {
              for (const docId of matchingDocIds) {
                requiredDocs.add(docId);
              }
              isFirstRequiredTerm = false;
            } else {
              // Intersect with existing required docs
              for (const docId of requiredDocs) {
                if (!matchingDocIds.has(docId)) {
                  requiredDocs.delete(docId);
                }
              }
            }
          }
        }
      }
    }

    // Filter by required docs for AND queries
    if (query.defaultOperator === 'AND' && !isFirstRequiredTerm) {
      for (const docId of docScores.keys()) {
        if (!requiredDocs.has(docId)) {
          docScores.delete(docId);
        }
      }
    }

    // Remove excluded docs
    for (const docId of excludedDocs) {
      docScores.delete(docId);
    }

    return docScores;
  }

  /**
   * Get terms matching a query token (handles prefix, fuzzy, etc.)
   */
  private getMatchingTerms(
    token: QueryToken,
    options: FTSSearchOptions
  ): Array<{ term: string; boost: number }> {
    const results: Array<{ term: string; boost: number }> = [];

    if (token.type === 'prefix') {
      // Prefix search - find all matching terms
      const terms = this.invertedIndex.getTermsWithPrefix(token.value);
      for (const term of terms) {
        results.push({ term, boost: 1 });
      }
    } else if (token.type === 'phrase') {
      // Phrase search - tokenize and treat as AND
      const phraseTokens = this.tokenizer.tokenizeToStrings(token.value);
      for (const term of phraseTokens) {
        results.push({ term, boost: 1 });
      }
    } else if (options.fuzzy) {
      // Fuzzy search
      const exactMatch = this.invertedIndex.getPostingList(token.value);
      if (exactMatch) {
        results.push({ term: token.value, boost: 1 });
      }

      // Find fuzzy matches
      const fuzzyMatches = this.findFuzzyMatchesForTerm(
        token.value,
        options.fuzzy.maxEdits,
        options.fuzzy.prefixLength
      );
      for (const match of fuzzyMatches) {
        if (match.term !== token.value) {
          // Reduce boost for fuzzy matches based on distance
          const boost = 1 / (match.distance + 1);
          results.push({ term: match.term, boost });
        }
      }
    } else {
      // Exact term match
      results.push({ term: token.value, boost: 1 });
    }

    return results;
  }

  /**
   * Find fuzzy matches for a term
   */
  private findFuzzyMatchesForTerm(
    term: string,
    maxEdits: number,
    prefixLength = 0
  ): Array<{ term: string; distance: number }> {
    const matches: Array<{ term: string; distance: number }> = [];
    const prefix = term.slice(0, prefixLength);

    // Get all terms from the inverted index
    const stats = this.invertedIndex.getStats();
    if (stats.termCount === 0) return matches;

    // Iterate through all indexed terms
    for (const indexTerm of this.getAllIndexedTerms()) {
      // Skip if prefix doesn't match
      if (prefixLength > 0 && !indexTerm.startsWith(prefix)) continue;

      const distance = editDistance(term, indexTerm);
      if (distance <= maxEdits) {
        matches.push({ term: indexTerm, distance });
      }
    }

    return matches.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Get all indexed terms (for fuzzy matching)
   */
  private getAllIndexedTerms(): string[] {
    return Array.from(this.invertedIndex.getAllTerms());
  }

  /**
   * Check if document matches filter predicates
   */
  private matchesFilter(
    document: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      const docValue = this.getFieldValue(document, key);

      if (typeof value === 'object' && value !== null) {
        // Range filter
        const rangeFilter = value as Record<string, unknown>;
        if ('$lt' in rangeFilter && !(docValue < (rangeFilter.$lt as number))) return false;
        if ('$lte' in rangeFilter && !(docValue <= (rangeFilter.$lte as number))) return false;
        if ('$gt' in rangeFilter && !(docValue > (rangeFilter.$gt as number))) return false;
        if ('$gte' in rangeFilter && !(docValue >= (rangeFilter.$gte as number))) return false;
        if ('$ne' in rangeFilter && docValue === rangeFilter.$ne) return false;
        if (hasInFilter(rangeFilter) && !rangeFilter.$in.includes(docValue)) return false;
      } else {
        // Equality filter
        if (docValue !== value) return false;
      }
    }
    return true;
  }

  /**
   * Calculate facet counts
   */
  private calculateFacets(
    results: FTSSearchResult[],
    facetFields: string[]
  ): Record<string, Record<string, number>> {
    const facets: Record<string, Record<string, number>> = {};

    for (const field of facetFields) {
      facets[field] = {};
      for (const result of results) {
        const value = this.getFieldValue(result.document, field);
        if (value !== null && value !== undefined) {
          const key = String(value);
          facets[field][key] = (facets[field][key] || 0) + 1;
        }
      }
    }

    return facets;
  }

  /**
   * Generate highlights for a document
   */
  private generateHighlights(
    document: Record<string, unknown>,
    query: ParsedQuery,
    options: HighlightOptions
  ): Record<string, string> {
    const highlights: Record<string, string> = {};
    const preTag = options.preTag || '<mark>';
    const postTag = options.postTag || '</mark>';

    // Collect all search terms
    const searchTerms: string[] = [];
    for (const token of query.tokens) {
      if (token.type === 'term' || token.type === 'prefix') {
        searchTerms.push(token.value);
      } else if (token.type === 'phrase') {
        searchTerms.push(...this.tokenizer.tokenizeToStrings(token.value));
      }
    }

    for (const field of this.definition.fields) {
      const value = this.getFieldValue(document, field);
      if (value === null || value === undefined) continue;

      let text = String(value);

      // Highlight matching terms
      for (const term of searchTerms) {
        // Create case-insensitive regex that matches word boundaries
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b(${escapedTerm}[a-z]*)\\b`, 'gi');
        text = text.replace(regex, `${preTag}$1${postTag}`);
      }

      // Truncate to snippet if needed
      if (options.snippetLength && text.length > options.snippetLength * 2) {
        const markIndex = text.indexOf(preTag);
        if (markIndex > -1) {
          const start = Math.max(0, markIndex - options.snippetLength);
          const end = Math.min(text.length, markIndex + options.snippetLength);
          text = (start > 0 ? '...' : '') +
                 text.slice(start, end) +
                 (end < text.length ? '...' : '');
        } else {
          text = text.slice(0, options.snippetLength * 2) + '...';
        }
      }

      highlights[field] = text;
    }

    return highlights;
  }

  /**
   * Get field value from document (supports dot notation)
   */
  private getFieldValue(doc: Record<string, unknown>, path: string): unknown {
    // First try direct key access
    if (path in doc) {
      return doc[path];
    }

    // Then try nested path
    const parts = path.split('.');
    let value: unknown = doc;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  /**
   * Get index statistics
   */
  getStats(): TextIndexStats {
    return this.invertedIndex.getStats();
  }

  /**
   * Get index definition
   */
  getDefinition(): TextIndexDefinition {
    return { ...this.definition };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a text index for a collection
 */
export function createTextIndex(
  collection: string,
  fields: string | string[] | Record<string, FieldWeight>,
  config?: TextIndexConfig
): TextIndex {
  const fieldSpec = typeof fields === 'string' ? [fields] : fields;
  return new TextIndex(collection, fieldSpec, config);
}

/**
 * Create a tokenizer
 */
export function createTokenizer(
  language: SupportedLanguage = 'english',
  options?: Partial<TokenizerConfig>
): Tokenizer {
  const stemmer = createStemmer(language);
  return new Tokenizer({
    language,
    stemmer,
    minTokenLength: options?.minTokenLength ?? 2,
    maxTokenLength: options?.maxTokenLength ?? 100,
    customStopwords: options?.customStopwords,
    disableStopwords: options?.disableStopwords,
  });
}

/**
 * Create an FTS query parser
 */
export function createQueryParser(
  language: SupportedLanguage = 'english'
): FTSQueryParser {
  const tokenizer = createTokenizer(language);
  return new FTSQueryParser(tokenizer);
}

// =============================================================================
// Exports
// =============================================================================

export const fullTextSearch = {
  createTextIndex,
  createTokenizer,
  createQueryParser,
  createStemmer,
  editDistance,
  calculateTFIDF,
  calculateBM25,
  PorterStemmer,
  SpanishStemmer,
  Tokenizer,
  TextIndex,
  InvertedIndex,
  FTSQueryParser,
};
