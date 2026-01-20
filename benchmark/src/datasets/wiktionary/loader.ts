/**
 * Wiktionary Dataset Loader
 *
 * Provides utilities to:
 * 1. Generate synthetic Wiktionary-like data for benchmarks
 * 2. Load real data from Kaikki.org JSONL files
 * 3. Transform raw wiktextract data to normalized schema
 *
 * @see https://kaikki.org/dictionary/
 */

import type {
  WiktionaryEntry,
  WiktionaryDataSize,
  RawWiktextractEntry,
  Pronunciation,
  Sense,
  Translation,
  WordForm,
  Etymology,
  RelatedWord,
  PartOfSpeech,
  LanguageCode,
} from './schema.js';
import { WIKTIONARY_DATA_SIZES } from './schema.js';

// ============================================================================
// Generator Configuration
// ============================================================================

/**
 * Configuration for synthetic data generation
 */
export interface GeneratorConfig {
  /** Random seed for reproducibility */
  seed?: number;
  /** Language distribution weights */
  languageDistribution?: Record<string, number>;
  /** Part of speech distribution weights */
  posDistribution?: Record<string, number>;
  /** Average senses per entry */
  avgSensesPerEntry?: number;
  /** Probability of having translations */
  translationProbability?: number;
  /** Probability of having pronunciation */
  pronunciationProbability?: number;
  /** Probability of having etymology */
  etymologyProbability?: number;
}

const DEFAULT_CONFIG: Required<GeneratorConfig> = {
  seed: 42,
  languageDistribution: {
    en: 0.40,  // English (largest)
    de: 0.10,  // German
    fr: 0.10,  // French
    es: 0.08,  // Spanish
    it: 0.05,  // Italian
    pt: 0.05,  // Portuguese
    ru: 0.05,  // Russian
    ja: 0.05,  // Japanese
    zh: 0.05,  // Chinese
    nl: 0.03,  // Dutch
    pl: 0.02,  // Polish
    sv: 0.02,  // Swedish
  },
  posDistribution: {
    noun: 0.35,
    verb: 0.20,
    adjective: 0.15,
    adverb: 0.08,
    pronoun: 0.03,
    preposition: 0.03,
    conjunction: 0.02,
    interjection: 0.02,
    determiner: 0.02,
    'proper noun': 0.05,
    phrase: 0.03,
    abbreviation: 0.02,
  },
  avgSensesPerEntry: 2.5,
  translationProbability: 0.6,
  pronunciationProbability: 0.7,
  etymologyProbability: 0.4,
};

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  next(): number {
    this.state = (this.state * 48271) % 2147483647;
    return this.state / 2147483647;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  weighted<T extends string>(dist: Record<T, number>): T {
    const r = this.next();
    let cumulative = 0;
    for (const [key, weight] of Object.entries(dist) as [T, number][]) {
      cumulative += weight;
      if (r < cumulative) return key;
    }
    return Object.keys(dist)[0] as T;
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  poisson(lambda: number): number {
    // Simple Poisson sampling
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// ============================================================================
// Word Lists for Generation
// ============================================================================

const WORD_ROOTS = {
  // Common roots for different languages
  en: ['cat', 'dog', 'house', 'tree', 'water', 'fire', 'light', 'dark', 'run', 'walk', 'speak', 'think', 'love', 'hate', 'big', 'small', 'fast', 'slow', 'new', 'old', 'good', 'bad', 'happy', 'sad', 'book', 'word', 'time', 'day', 'night', 'sun', 'moon', 'star', 'earth', 'sky', 'sea', 'mountain', 'river', 'road', 'city', 'town'],
  de: ['Haus', 'Baum', 'Wasser', 'Feuer', 'Licht', 'Tag', 'Nacht', 'Sonne', 'Mond', 'Stern', 'Erde', 'Himmel', 'Berg', 'Fluss', 'Stadt', 'Buch', 'Wort', 'Zeit', 'Leben', 'Mensch'],
  fr: ['maison', 'arbre', 'eau', 'feu', 'lumiere', 'jour', 'nuit', 'soleil', 'lune', 'etoile', 'terre', 'ciel', 'mer', 'montagne', 'ville', 'livre', 'mot', 'temps', 'vie', 'homme'],
  es: ['casa', 'arbol', 'agua', 'fuego', 'luz', 'dia', 'noche', 'sol', 'luna', 'estrella', 'tierra', 'cielo', 'mar', 'monte', 'ciudad', 'libro', 'palabra', 'tiempo', 'vida', 'hombre'],
  it: ['casa', 'albero', 'acqua', 'fuoco', 'luce', 'giorno', 'notte', 'sole', 'luna', 'stella', 'terra', 'cielo', 'mare', 'monte', 'citta', 'libro', 'parola', 'tempo', 'vita', 'uomo'],
  pt: ['casa', 'arvore', 'agua', 'fogo', 'luz', 'dia', 'noite', 'sol', 'lua', 'estrela', 'terra', 'ceu', 'mar', 'monte', 'cidade', 'livro', 'palavra', 'tempo', 'vida', 'homem'],
  ru: ['dom', 'derevo', 'voda', 'ogon', 'svet', 'den', 'noch', 'solntse', 'luna', 'zvezda', 'zemlya', 'nebo', 'more', 'gora', 'gorod', 'kniga', 'slovo', 'vremya', 'zhizn', 'chelovek'],
  ja: ['ie', 'ki', 'mizu', 'hi', 'hikari', 'hi', 'yoru', 'taiyou', 'tsuki', 'hoshi', 'chi', 'sora', 'umi', 'yama', 'machi', 'hon', 'kotoba', 'toki', 'inochi', 'hito'],
  zh: ['jia', 'shu', 'shui', 'huo', 'guang', 'ri', 'ye', 'taiyang', 'yue', 'xing', 'di', 'tian', 'hai', 'shan', 'cheng', 'shu', 'hua', 'shi', 'sheng', 'ren'],
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  la: 'Latin',
  grc: 'Ancient Greek',
  ar: 'Arabic',
  ko: 'Korean',
};

const SEMANTIC_TAGS = [
  'informal', 'formal', 'colloquial', 'slang', 'archaic', 'obsolete',
  'rare', 'literary', 'poetic', 'technical', 'scientific', 'medical',
  'legal', 'nautical', 'military', 'vulgar', 'offensive', 'derogatory',
  'euphemistic', 'figuratively', 'literally', 'by extension',
];

const CATEGORIES = [
  'Animals', 'Plants', 'Food and drink', 'Body parts', 'Emotions',
  'Colors', 'Numbers', 'Time', 'Weather', 'Geography', 'Buildings',
  'Transportation', 'Technology', 'Science', 'Mathematics', 'Music',
  'Art', 'Literature', 'Sports', 'Games', 'Clothing', 'Tools',
];

const TOPICS = [
  'biology', 'chemistry', 'physics', 'mathematics', 'computing',
  'medicine', 'law', 'economics', 'politics', 'history', 'philosophy',
  'religion', 'linguistics', 'music', 'art', 'literature', 'sports',
];

const PREFIXES = ['un', 're', 'pre', 'dis', 'mis', 'over', 'under', 'out', 'sub', 'super', 'anti', 'auto', 'bi', 'co', 'counter', 'de', 'ex', 'extra', 'hyper', 'inter', 'intra', 'macro', 'micro', 'mid', 'mini', 'multi', 'neo', 'non', 'post', 'pro', 'proto', 'pseudo', 'semi', 'trans', 'ultra'];

const SUFFIXES = ['ness', 'ment', 'tion', 'sion', 'able', 'ible', 'ful', 'less', 'ous', 'ive', 'al', 'ial', 'ly', 'er', 'or', 'ist', 'ism', 'ity', 'ty', 'ry', 'ery', 'ary', 'ory', 'dom', 'hood', 'ship', 'ward', 'wise', 'like', 'ish', 'ic', 'ical'];

// ============================================================================
// Synthetic Data Generation
// ============================================================================

/**
 * Generate a random word with optional affixes
 */
function generateWord(rng: SeededRandom, langCode: string): string {
  const roots = WORD_ROOTS[langCode as keyof typeof WORD_ROOTS] || WORD_ROOTS.en;
  let word = rng.pick(roots);

  // Sometimes add prefix (for English-like languages)
  if (langCode === 'en' && rng.bool(0.15)) {
    word = rng.pick(PREFIXES) + word;
  }

  // Sometimes add suffix
  if (langCode === 'en' && rng.bool(0.2)) {
    word = word + rng.pick(SUFFIXES);
  }

  // Sometimes add a number to make unique
  if (rng.bool(0.3)) {
    word = word + rng.int(1, 999);
  }

  return word;
}

/**
 * Generate pronunciation data
 */
function generatePronunciation(rng: SeededRandom, word: string, langCode: string): Pronunciation {
  const pronunciation: Pronunciation = {};

  // Generate IPA-like pronunciation
  if (rng.bool(0.9)) {
    const vowels = ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'au', 'ei', 'ou'];
    const consonants = ['b', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'z'];
    let ipa = '/';
    const syllables = rng.int(1, 4);
    for (let i = 0; i < syllables; i++) {
      if (rng.bool(0.7)) ipa += rng.pick(consonants);
      ipa += rng.pick(vowels);
      if (rng.bool(0.5)) ipa += rng.pick(consonants);
      if (i < syllables - 1 && rng.bool(0.3)) ipa += '.';
    }
    ipa += '/';
    pronunciation.ipa = ipa;
  }

  // Regional tags
  if (rng.bool(0.4)) {
    const tags = [];
    if (langCode === 'en') {
      if (rng.bool(0.5)) tags.push('US');
      if (rng.bool(0.5)) tags.push('UK');
      if (rng.bool(0.2)) tags.push('Australia');
    } else if (langCode === 'de') {
      if (rng.bool(0.5)) tags.push('Germany');
      if (rng.bool(0.3)) tags.push('Austria');
      if (rng.bool(0.2)) tags.push('Switzerland');
    }
    if (tags.length > 0) pronunciation.tags = tags;
  }

  // Audio reference
  if (rng.bool(0.3)) {
    pronunciation.audio = `${langCode}-${word}-pronunciation.ogg`;
    if (rng.bool(0.5)) {
      pronunciation.oggUrl = `https://upload.wikimedia.org/wikipedia/commons/${langCode}/${word}.ogg`;
    }
    if (rng.bool(0.5)) {
      pronunciation.mp3Url = `https://upload.wikimedia.org/wikipedia/commons/${langCode}/${word}.mp3`;
    }
  }

  // Syllable count
  if (rng.bool(0.4)) {
    pronunciation.syllables = rng.int(1, 5);
  }

  // Rhymes
  if (rng.bool(0.2)) {
    pronunciation.rhymes = `-${rng.pick(['at', 'ot', 'it', 'an', 'en', 'in', 'on', 'un', 'ate', 'ite', 'ine', 'ation'])}`;
  }

  // Homophones
  if (rng.bool(0.1)) {
    const homophones = [];
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i++) {
      homophones.push(generateWord(rng, langCode));
    }
    pronunciation.homophones = homophones;
  }

  return pronunciation;
}

/**
 * Generate a definition/gloss
 */
function generateGloss(rng: SeededRandom, pos: PartOfSpeech): string {
  const templates: Record<string, string[]> = {
    noun: [
      'A type of {noun} used for {activity}.',
      'Something that {verb}s or is {adjective}.',
      'A person who {verb}s {noun}s.',
      'The act or state of being {adjective}.',
      'A {adjective} {noun} found in {place}.',
    ],
    verb: [
      'To {verb} something {adverb}.',
      'To cause to become {adjective}.',
      'To move in a {adjective} manner.',
      'To perform the action of {verb}ing.',
      'To {verb} with or using a {noun}.',
    ],
    adjective: [
      'Having the quality of being {adjective}.',
      'Relating to or characterized by {noun}.',
      'Of or pertaining to {noun}s.',
      'Resembling a {noun} in some way.',
      'More {adjective} than usual.',
    ],
    adverb: [
      'In a {adjective} manner.',
      'To a {adjective} degree.',
      'With {noun} or {noun}.',
      'At the time of {noun}.',
      'In the direction of {noun}.',
    ],
    default: [
      'A word meaning {adjective} or {adjective}.',
      'Something related to {noun}.',
      'The concept of {noun} or {verb}ing.',
    ],
  };

  const posTemplates = templates[pos] || templates.default;
  let gloss = rng.pick(posTemplates);

  // Replace placeholders
  const nouns = ['thing', 'object', 'person', 'place', 'time', 'action', 'state', 'quality', 'manner', 'process'];
  const verbs = ['move', 'act', 'make', 'do', 'be', 'have', 'go', 'come', 'take', 'give'];
  const adjectives = ['good', 'bad', 'large', 'small', 'new', 'old', 'high', 'low', 'fast', 'slow'];
  const adverbs = ['quickly', 'slowly', 'carefully', 'easily', 'greatly', 'highly', 'well', 'badly'];
  const places = ['nature', 'cities', 'rural areas', 'water', 'mountains', 'forests'];
  const activities = ['daily activities', 'work', 'recreation', 'communication', 'transportation'];

  gloss = gloss.replace('{noun}', rng.pick(nouns));
  gloss = gloss.replace('{verb}', rng.pick(verbs));
  gloss = gloss.replace('{adjective}', rng.pick(adjectives));
  gloss = gloss.replace('{adverb}', rng.pick(adverbs));
  gloss = gloss.replace('{place}', rng.pick(places));
  gloss = gloss.replace('{activity}', rng.pick(activities));

  return gloss;
}

/**
 * Generate a sense (definition with metadata)
 */
function generateSense(rng: SeededRandom, pos: PartOfSpeech, senseNum: number): Sense {
  const sense: Sense = {
    id: `sense-${senseNum}`,
    glosses: [generateGloss(rng, pos)],
  };

  // Sometimes add sub-gloss
  if (rng.bool(0.2)) {
    sense.glosses.push(generateGloss(rng, pos));
  }

  // Tags
  if (rng.bool(0.3)) {
    const tagCount = rng.int(1, 3);
    sense.tags = rng.shuffle(SEMANTIC_TAGS).slice(0, tagCount);
  }

  // Categories
  if (rng.bool(0.4)) {
    const catCount = rng.int(1, 2);
    sense.categories = rng.shuffle(CATEGORIES).slice(0, catCount);
  }

  // Topics
  if (rng.bool(0.2)) {
    sense.topics = [rng.pick(TOPICS)];
  }

  // Examples
  if (rng.bool(0.5)) {
    const exampleCount = rng.int(1, 3);
    sense.examples = [];
    for (let i = 0; i < exampleCount; i++) {
      sense.examples.push({
        text: `This is an example sentence demonstrating usage ${i + 1}.`,
        ...(rng.bool(0.3) && { ref: `Author Name, "Book Title" (${rng.int(1900, 2024)})` }),
      });
    }
  }

  // Synonyms
  if (rng.bool(0.4)) {
    const synCount = rng.int(1, 4);
    sense.synonyms = [];
    for (let i = 0; i < synCount; i++) {
      sense.synonyms.push({
        word: generateWord(rng, 'en'),
        ...(rng.bool(0.3) && { tags: [rng.pick(SEMANTIC_TAGS)] }),
      });
    }
  }

  // Antonyms
  if (rng.bool(0.2)) {
    const antCount = rng.int(1, 2);
    sense.antonyms = [];
    for (let i = 0; i < antCount; i++) {
      sense.antonyms.push({
        word: generateWord(rng, 'en'),
      });
    }
  }

  // Hypernyms
  if (rng.bool(0.15)) {
    sense.hypernyms = [{
      word: generateWord(rng, 'en'),
    }];
  }

  // Hyponyms
  if (rng.bool(0.15)) {
    const hypCount = rng.int(1, 3);
    sense.hyponyms = [];
    for (let i = 0; i < hypCount; i++) {
      sense.hyponyms.push({
        word: generateWord(rng, 'en'),
      });
    }
  }

  return sense;
}

/**
 * Generate translation entries
 */
function generateTranslations(rng: SeededRandom, sourceLang: LanguageCode, senseCount: number): Translation[] {
  const translations: Translation[] = [];
  const targetLangs = Object.keys(LANGUAGE_NAMES).filter(l => l !== sourceLang);

  // Generate translations to a subset of languages
  const langCount = rng.int(3, Math.min(10, targetLangs.length));
  const selectedLangs = rng.shuffle(targetLangs).slice(0, langCount);

  for (const lang of selectedLangs) {
    const transCount = rng.int(1, 3);
    for (let i = 0; i < transCount; i++) {
      const translation: Translation = {
        code: lang,
        lang: LANGUAGE_NAMES[lang] || lang,
        word: generateWord(rng, lang),
      };

      // Sense reference
      if (senseCount > 1 && rng.bool(0.5)) {
        translation.sense = `definition ${rng.int(1, senseCount)}`;
      }

      // Gender
      if (['de', 'fr', 'es', 'it', 'pt', 'ru'].includes(lang) && rng.bool(0.7)) {
        translation.gender = rng.pick(['masculine', 'feminine', 'neuter']);
      }

      // Romanization for non-Latin scripts
      if (['ja', 'zh', 'ko', 'ru', 'ar'].includes(lang) && rng.bool(0.8)) {
        translation.roman = generateWord(rng, 'en');
      }

      // Tags
      if (rng.bool(0.2)) {
        translation.tags = [rng.pick(SEMANTIC_TAGS)];
      }

      translations.push(translation);
    }
  }

  return translations;
}

/**
 * Generate word forms
 */
function generateForms(rng: SeededRandom, word: string, pos: PartOfSpeech): WordForm[] {
  const forms: WordForm[] = [];

  if (pos === 'noun') {
    // Plural
    forms.push({
      form: word + (word.endsWith('s') ? 'es' : 's'),
      tags: ['plural'],
    });
  } else if (pos === 'verb') {
    // Conjugations
    forms.push(
      { form: word + 's', tags: ['third-person', 'singular', 'present'] },
      { form: word + 'ed', tags: ['past'] },
      { form: word + 'ing', tags: ['present participle'] },
    );
    if (rng.bool(0.3)) {
      forms.push({ form: word + 'er', tags: ['agent noun'] });
    }
  } else if (pos === 'adjective') {
    // Comparative/superlative
    if (word.length < 8) {
      forms.push(
        { form: word + 'er', tags: ['comparative'] },
        { form: word + 'est', tags: ['superlative'] },
      );
    } else {
      forms.push(
        { form: 'more ' + word, tags: ['comparative'] },
        { form: 'most ' + word, tags: ['superlative'] },
      );
    }
  }

  return forms;
}

/**
 * Generate etymology data
 */
function generateEtymology(rng: SeededRandom): Etymology {
  const sourceLangs = ['Latin', 'Ancient Greek', 'Old French', 'Old English', 'Proto-Germanic', 'Proto-Indo-European', 'Arabic', 'Sanskrit'];
  const sourceWords = ['verbum', 'logos', 'parole', 'word', 'wurdam', 'werdh', 'kalima', 'vac'];

  const etymology: Etymology = {};

  if (rng.bool(0.8)) {
    const sourceLang = rng.pick(sourceLangs);
    const sourceWord = rng.pick(sourceWords);
    etymology.sourceLanguage = sourceLang;
    etymology.text = `From ${sourceLang} ${sourceWord}, meaning "something similar".`;
  }

  if (rng.bool(0.3)) {
    etymology.templates = [{
      name: 'inh',
      args: { '1': 'en', '2': 'enm', '3': generateWord(rng, 'en') },
    }];
  }

  return etymology;
}

/**
 * Generate a single Wiktionary entry
 */
function generateEntry(
  rng: SeededRandom,
  config: Required<GeneratorConfig>,
  index: number
): WiktionaryEntry {
  const langCode = rng.weighted(config.languageDistribution);
  const pos = rng.weighted(config.posDistribution) as PartOfSpeech;
  const word = generateWord(rng, langCode);

  // Generate senses
  const senseCount = Math.max(1, rng.poisson(config.avgSensesPerEntry));
  const senses: Sense[] = [];
  for (let i = 0; i < senseCount; i++) {
    senses.push(generateSense(rng, pos, i + 1));
  }

  const entry: WiktionaryEntry = {
    word,
    lang: LANGUAGE_NAMES[langCode] || langCode,
    langCode,
    pos,
    senses,
  };

  // Pronunciation
  if (rng.bool(config.pronunciationProbability)) {
    const pronCount = rng.int(1, 3);
    entry.sounds = [];
    for (let i = 0; i < pronCount; i++) {
      entry.sounds.push(generatePronunciation(rng, word, langCode));
    }
  }

  // Forms
  if (rng.bool(0.6)) {
    entry.forms = generateForms(rng, word, pos);
  }

  // Translations
  if (rng.bool(config.translationProbability)) {
    entry.translations = generateTranslations(rng, langCode, senseCount);
  }

  // Etymology
  if (rng.bool(config.etymologyProbability)) {
    entry.etymology = generateEtymology(rng);
    entry.etymologyText = entry.etymology.text;
    if (rng.bool(0.2)) {
      entry.etymologyNumber = rng.int(1, 3);
    }
  }

  // Categories
  if (rng.bool(0.5)) {
    const catCount = rng.int(1, 3);
    entry.categories = rng.shuffle(CATEGORIES).slice(0, catCount);
  }

  // Derived terms
  if (rng.bool(0.3)) {
    const derivedCount = rng.int(1, 5);
    entry.derived = [];
    for (let i = 0; i < derivedCount; i++) {
      entry.derived.push({
        word: generateWord(rng, langCode),
      });
    }
  }

  // Related terms
  if (rng.bool(0.25)) {
    const relatedCount = rng.int(1, 4);
    entry.related = [];
    for (let i = 0; i < relatedCount; i++) {
      entry.related.push({
        word: generateWord(rng, langCode),
      });
    }
  }

  return entry;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate synthetic Wiktionary entries
 *
 * @param count Number of entries to generate
 * @param config Generator configuration
 * @returns Array of Wiktionary entries
 */
export function generateEntries(
  count: number,
  config: GeneratorConfig = {}
): WiktionaryEntry[] {
  const fullConfig: Required<GeneratorConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = new SeededRandom(fullConfig.seed);
  const entries: WiktionaryEntry[] = new Array(count);

  for (let i = 0; i < count; i++) {
    entries[i] = generateEntry(rng, fullConfig, i);
  }

  return entries;
}

/**
 * Generate entries for a specific data size preset
 *
 * @param size Data size preset
 * @param config Generator configuration
 * @returns Array of Wiktionary entries
 */
export function generateDataset(
  size: WiktionaryDataSize,
  config: GeneratorConfig = {}
): WiktionaryEntry[] {
  return generateEntries(WIKTIONARY_DATA_SIZES[size], config);
}

/**
 * Generate entries as an async iterator (for large datasets)
 *
 * @param count Number of entries to generate
 * @param batchSize Entries per batch
 * @param config Generator configuration
 */
export async function* generateEntriesIterator(
  count: number,
  batchSize = 10000,
  config: GeneratorConfig = {}
): AsyncGenerator<WiktionaryEntry[], void, unknown> {
  const fullConfig: Required<GeneratorConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = new SeededRandom(fullConfig.seed);
  let remaining = count;
  let index = 0;

  while (remaining > 0) {
    const currentBatch = Math.min(batchSize, remaining);
    const batch: WiktionaryEntry[] = new Array(currentBatch);

    for (let i = 0; i < currentBatch; i++) {
      batch[i] = generateEntry(rng, fullConfig, index++);
    }

    remaining -= currentBatch;
    yield batch;
  }
}

/**
 * Estimate memory usage for generated entries
 *
 * @param count Number of entries
 * @returns Estimated memory in bytes
 */
export function estimateMemoryUsage(count: number): number {
  // Average entry size is ~2KB in memory (more complex than Bluesky events)
  const avgEntrySize = 2000;
  return count * avgEntrySize;
}

/**
 * Estimate JSON size for generated entries
 *
 * @param count Number of entries
 * @returns Estimated JSON size in bytes
 */
export function estimateJsonSize(count: number): number {
  // Average JSON serialized size is ~1.5KB
  const avgJsonSize = 1500;
  return count * avgJsonSize;
}

// ============================================================================
// Raw Data Transformation
// ============================================================================

/**
 * Transform raw wiktextract entry to normalized schema
 *
 * @param raw Raw entry from wiktextract JSONL
 * @returns Normalized WiktionaryEntry
 */
export function transformRawEntry(raw: RawWiktextractEntry): WiktionaryEntry {
  const entry: WiktionaryEntry = {
    word: raw.word,
    lang: raw.lang,
    langCode: raw.lang_code,
    pos: raw.pos as PartOfSpeech,
    senses: (raw.senses || []).map(s => ({
      glosses: s.glosses || [],
      ...(s.raw_glosses && { rawGlosses: s.raw_glosses }),
      ...(s.tags && { tags: s.tags }),
      ...(s.categories && { categories: s.categories }),
      ...(s.examples && {
        examples: s.examples.map(e => ({
          text: e.text || '',
          ...(e.translation && { translation: e.translation }),
          ...(e.ref && { ref: e.ref }),
          ...(e.type && { type: e.type }),
        })),
      }),
      ...(s.synonyms && { synonyms: s.synonyms }),
      ...(s.antonyms && { antonyms: s.antonyms }),
      ...(s.hypernyms && { hypernyms: s.hypernyms }),
      ...(s.hyponyms && { hyponyms: s.hyponyms }),
      ...(s.topics && { topics: s.topics }),
      ...(s.form_of && { formOf: s.form_of }),
      ...(s.alt_of && { altOf: s.alt_of }),
      ...(s.wikipedia && { wikipedia: s.wikipedia }),
      ...(s.wikidata && { wikidata: s.wikidata }),
    })),
  };

  // Sounds/Pronunciation
  if (raw.sounds && raw.sounds.length > 0) {
    entry.sounds = raw.sounds.map(s => ({
      ...(s.ipa && { ipa: s.ipa }),
      ...(s.audio && { audio: s.audio }),
      ...(s.ogg_url && { oggUrl: s.ogg_url }),
      ...(s.mp3_url && { mp3Url: s.mp3_url }),
      ...(s.tags && { tags: s.tags }),
      ...(s.rhymes && { rhymes: s.rhymes }),
      ...(s.homophones && { homophones: s.homophones }),
    }));
  }

  // Forms
  if (raw.forms && raw.forms.length > 0) {
    entry.forms = raw.forms;
  }

  // Translations
  if (raw.translations && raw.translations.length > 0) {
    entry.translations = raw.translations
      .filter(t => t.code && t.word)
      .map(t => ({
        code: t.code!,
        lang: t.lang || t.code!,
        word: t.word!,
        ...(t.sense && { sense: t.sense }),
        ...(t.tags && { tags: t.tags }),
        ...(t.roman && { roman: t.roman }),
        ...(t.alt && { alt: t.alt }),
        ...(t.note && { note: t.note }),
      }));
  }

  // Etymology
  if (raw.etymology_text) {
    entry.etymologyText = raw.etymology_text;
    if (raw.etymology_templates && raw.etymology_templates.length > 0) {
      entry.etymology = {
        text: raw.etymology_text,
        templates: raw.etymology_templates,
      };
    }
  }
  if (raw.etymology_number) {
    entry.etymologyNumber = raw.etymology_number;
  }

  // Head templates
  if (raw.head_templates && raw.head_templates.length > 0) {
    entry.headTemplates = raw.head_templates;
  }

  // Categories
  if (raw.categories) {
    entry.categories = raw.categories;
  }

  // Wikipedia/Wikidata
  if (raw.wikipedia) entry.wikipedia = raw.wikipedia;
  if (raw.wikidata) entry.wikidata = raw.wikidata;

  // Related words
  if (raw.derived) entry.derived = raw.derived;
  if (raw.related) entry.related = raw.related;

  // Descendants
  if (raw.descendants && raw.descendants.length > 0) {
    entry.descendants = raw.descendants.map(d => ({
      lang: d.lang,
      langCode: d.lang_code || d.lang,
      word: d.word,
      ...(d.tags && { tags: d.tags }),
    }));
  }

  return entry;
}

/**
 * Parse JSONL string to entries
 *
 * @param jsonl JSONL string content
 * @param limit Maximum entries to parse (0 for unlimited)
 * @returns Array of WiktionaryEntry
 */
export function parseJsonl(jsonl: string, limit = 0): WiktionaryEntry[] {
  const lines = jsonl.split('\n').filter(line => line.trim());
  const maxLines = limit > 0 ? Math.min(limit, lines.length) : lines.length;
  const entries: WiktionaryEntry[] = [];

  for (let i = 0; i < maxLines; i++) {
    try {
      const raw = JSON.parse(lines[i]) as RawWiktextractEntry;
      entries.push(transformRawEntry(raw));
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Stream parse JSONL for large files
 *
 * @param lines Async iterable of JSONL lines
 */
export async function* parseJsonlStream(
  lines: AsyncIterable<string>
): AsyncGenerator<WiktionaryEntry, void, unknown> {
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as RawWiktextractEntry;
      yield transformRawEntry(raw);
    } catch {
      // Skip malformed lines
    }
  }
}
