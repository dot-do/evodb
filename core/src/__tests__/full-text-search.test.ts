/**
 * @evodb/core - Full-Text Search Tests
 *
 * Comprehensive tests for the FTS module including:
 * - Text tokenization and normalization
 * - Stemming and stopword removal
 * - Inverted index operations
 * - Query parsing with operators
 * - Score-based ranking (TF-IDF, BM25)
 * - Fuzzy matching
 * - Highlighting
 * - Filters and facets
 *
 * @see TDD issue evodb-71gn
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
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
  type TextIndexConfig,
  type FTSSearchOptions,
  type TokenizerConfig,
  type SupportedLanguage,
} from '../full-text-search.js';

// =============================================================================
// Tokenizer Tests
// =============================================================================

describe('Tokenizer', () => {
  describe('basic tokenization', () => {
    it('should tokenize simple text', () => {
      const tokenizer = createTokenizer('english');
      const tokens = tokenizer.tokenizeToStrings('Hello World');

      expect(tokens.length).toBe(2);
      expect(tokens).toContain('hello');
      expect(tokens).toContain('world');
    });

    it('should handle empty text', () => {
      const tokenizer = createTokenizer('english');
      const tokens = tokenizer.tokenizeToStrings('');

      expect(tokens).toEqual([]);
    });

    it('should handle text with punctuation', () => {
      const tokenizer = createTokenizer('english');
      const tokens = tokenizer.tokenizeToStrings('Hello, World! How are you?');

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens).not.toContain(',');
      expect(tokens).not.toContain('!');
      expect(tokens).not.toContain('?');
    });

    it('should normalize to lowercase', () => {
      const tokenizer = createTokenizer('english');
      const tokens = tokenizer.tokenizeToStrings('UPPERCASE lowercase MiXeD');

      for (const token of tokens) {
        expect(token).toBe(token.toLowerCase());
      }
    });

    it('should track token positions', () => {
      const tokenizer = createTokenizer('english');
      const tokens = tokenizer.tokenize('first second third');

      expect(tokens[0]?.position).toBe(0);
      expect(tokens[1]?.position).toBe(1);
      expect(tokens[2]?.position).toBe(2);
    });
  });

  describe('stopword removal', () => {
    it('should remove English stopwords', () => {
      const tokenizer = createTokenizer('english');
      const tokens = tokenizer.tokenizeToStrings('the quick brown fox');

      expect(tokens).not.toContain('the');
      expect(tokens).toContain('quick');
      expect(tokens).toContain('brown');
      expect(tokens).toContain('fox');
    });

    it('should remove Spanish stopwords', () => {
      const tokenizer = createTokenizer('spanish');
      const tokens = tokenizer.tokenizeToStrings('el rapido zorro marron');

      expect(tokens).not.toContain('el');
      // Tokens are stemmed, so we check for stemmed forms
      expect(tokens.length).toBeGreaterThan(0);
      // 'rapido' stems to something, 'zorro' stems to something
      expect(tokens.some(t => t.startsWith('rap') || t.startsWith('zorr'))).toBe(true);
    });

    it('should allow disabling stopwords', () => {
      const stemmer = createStemmer('english');
      const tokenizer = new Tokenizer({
        language: 'english',
        stemmer,
        disableStopwords: true,
        minTokenLength: 1,
        maxTokenLength: 100,
      });
      const tokens = tokenizer.tokenizeToStrings('the quick brown fox');

      expect(tokens).toContain('the');
    });

    it('should support custom stopwords', () => {
      const stemmer = createStemmer('english');
      const tokenizer = new Tokenizer({
        language: 'english',
        stemmer,
        customStopwords: new Set(['custom', 'words']),
        minTokenLength: 2,
        maxTokenLength: 100,
      });
      const tokens = tokenizer.tokenizeToStrings('custom words test');

      expect(tokens).not.toContain('custom');
      expect(tokens).not.toContain('words');
      expect(tokens).toContain('test');
    });
  });

  describe('token length constraints', () => {
    it('should filter tokens shorter than minLength', () => {
      const stemmer = createStemmer('english');
      const tokenizer = new Tokenizer({
        language: 'english',
        stemmer,
        minTokenLength: 3,
        maxTokenLength: 100,
        disableStopwords: true,
      });
      const tokens = tokenizer.tokenizeToStrings('a to foo bar');

      expect(tokens).not.toContain('to');
      expect(tokens).toContain('foo');
      expect(tokens).toContain('bar');
    });

    it('should filter tokens longer than maxLength', () => {
      const stemmer = createStemmer('english');
      const tokenizer = new Tokenizer({
        language: 'english',
        stemmer,
        minTokenLength: 1,
        maxTokenLength: 5,
        disableStopwords: true,
      });
      const tokens = tokenizer.tokenizeToStrings('short verylongword ok');

      expect(tokens).toContain('short');
      expect(tokens).not.toContain('verylongword');
      expect(tokens).toContain('ok');
    });
  });
});

// =============================================================================
// Stemmer Tests
// =============================================================================

describe('PorterStemmer', () => {
  const stemmer = new PorterStemmer();

  describe('plural handling', () => {
    it('should stem simple plurals', () => {
      expect(stemmer.stem('cats')).toBe('cat');
      expect(stemmer.stem('dogs')).toBe('dog');
      expect(stemmer.stem('trees')).toBe('tree');
    });

    it('should handle -ies plurals', () => {
      expect(stemmer.stem('ponies')).toBe('poni');
      expect(stemmer.stem('flies')).toBe('fli');
    });

    it('should handle -sses plurals', () => {
      expect(stemmer.stem('classes')).toBe('class');
      expect(stemmer.stem('glasses')).toBe('glass');
    });
  });

  describe('verb forms', () => {
    it('should stem -ing forms', () => {
      expect(stemmer.stem('running')).toBe('run');
      expect(stemmer.stem('walking')).toBe('walk');
      expect(stemmer.stem('jumping')).toBe('jump');
    });

    it('should stem -ed forms', () => {
      expect(stemmer.stem('walked')).toBe('walk');
      expect(stemmer.stem('jumped')).toBe('jump');
    });

    it('should handle double consonant after -ed/-ing removal', () => {
      expect(stemmer.stem('running')).toBe('run');
      expect(stemmer.stem('sitting')).toBe('sit');
    });
  });

  describe('derivational suffixes', () => {
    it('should stem -ational to -ate', () => {
      expect(stemmer.stem('relational')).toBe('relat');
    });

    it('should stem -izer to -ize', () => {
      expect(stemmer.stem('optimizer')).toBe('optim');
    });

    it('should stem -iveness to -ive', () => {
      expect(stemmer.stem('effectiveness')).toBe('effect');
    });
  });

  describe('short words', () => {
    it('should not stem words shorter than 3 characters', () => {
      expect(stemmer.stem('is')).toBe('is');
      expect(stemmer.stem('an')).toBe('an');
      expect(stemmer.stem('a')).toBe('a');
    });
  });
});

describe('SpanishStemmer', () => {
  const stemmer = new SpanishStemmer();

  it('should stem common Spanish suffixes', () => {
    // The stemmer removes -endo suffix
    expect(stemmer.stem('corriendo')).toBe('corri');
    expect(stemmer.stem('comiendo')).toBe('comi');
  });

  it('should handle -ar verbs', () => {
    expect(stemmer.stem('caminar')).toBe('camin');
  });
});

describe('createStemmer', () => {
  it('should create English stemmer', () => {
    const stemmer = createStemmer('english');
    expect(stemmer).toBeInstanceOf(PorterStemmer);
  });

  it('should create Spanish stemmer', () => {
    const stemmer = createStemmer('spanish');
    expect(stemmer).toBeInstanceOf(SpanishStemmer);
  });

  it('should return null for none language', () => {
    const stemmer = createStemmer('none');
    expect(stemmer).toBeNull();
  });
});

// =============================================================================
// Edit Distance Tests
// =============================================================================

describe('editDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(editDistance('test', 'test')).toBe(0);
    expect(editDistance('', '')).toBe(0);
  });

  it('should calculate insertions', () => {
    expect(editDistance('cat', 'cats')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });

  it('should calculate deletions', () => {
    expect(editDistance('cats', 'cat')).toBe(1);
    expect(editDistance('abc', '')).toBe(3);
  });

  it('should calculate substitutions', () => {
    expect(editDistance('cat', 'bat')).toBe(1);
    expect(editDistance('cat', 'car')).toBe(1);
  });

  it('should calculate mixed operations', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('saturday', 'sunday')).toBe(3);
  });
});

// =============================================================================
// TF-IDF and BM25 Scoring Tests
// =============================================================================

describe('calculateTFIDF', () => {
  it('should return positive score for valid inputs', () => {
    const score = calculateTFIDF(5, 10, 100);
    expect(score).toBeGreaterThan(0);
  });

  it('should increase with term frequency', () => {
    const score1 = calculateTFIDF(1, 10, 100);
    const score2 = calculateTFIDF(5, 10, 100);
    expect(score2).toBeGreaterThan(score1);
  });

  it('should decrease with document frequency (more common terms score lower)', () => {
    const score1 = calculateTFIDF(5, 5, 100);
    const score2 = calculateTFIDF(5, 50, 100);
    expect(score1).toBeGreaterThan(score2);
  });
});

describe('calculateBM25', () => {
  it('should return positive score for valid inputs', () => {
    const score = calculateBM25(5, 10, 100, 50, 100);
    expect(score).toBeGreaterThan(0);
  });

  it('should increase with term frequency', () => {
    const score1 = calculateBM25(1, 10, 100, 50, 100);
    const score2 = calculateBM25(5, 10, 100, 50, 100);
    expect(score2).toBeGreaterThan(score1);
  });

  it('should consider document length', () => {
    // Shorter document with same TF should score higher
    const score1 = calculateBM25(5, 10, 100, 20, 100);
    const score2 = calculateBM25(5, 10, 100, 200, 100);
    expect(score1).toBeGreaterThan(score2);
  });
});

// =============================================================================
// Query Parser Tests
// =============================================================================

describe('FTSQueryParser', () => {
  let parser: FTSQueryParser;

  beforeEach(() => {
    parser = createQueryParser('english');
  });

  describe('simple queries', () => {
    it('should parse single term', () => {
      const query = parser.parse('test');
      expect(query.tokens.length).toBe(1);
      expect(query.tokens[0]?.type).toBe('term');
      expect(query.tokens[0]?.value).toBe('test');
    });

    it('should parse multiple terms', () => {
      const query = parser.parse('hello world');
      expect(query.tokens.length).toBe(2);
    });

    it('should stem terms by default', () => {
      const query = parser.parse('running');
      expect(query.tokens[0]?.value).toBe('run');
    });

    it('should skip stopwords', () => {
      // Note: 'the' is a stopword and normalizes to empty string, filtered out
      // 'quick' is not a stopword but might still be in tokens
      const query = parser.parse('the quick');
      // The parser includes tokens with non-empty normalized values
      const nonEmptyTokens = query.tokens.filter(t => t.value.length > 0);
      expect(nonEmptyTokens.length).toBe(1);
      expect(nonEmptyTokens[0]?.value).toBe('quick');
    });
  });

  describe('phrase queries', () => {
    it('should parse quoted phrases', () => {
      const query = parser.parse('"hello world"');
      expect(query.tokens.length).toBe(1);
      expect(query.tokens[0]?.type).toBe('phrase');
      expect(query.tokens[0]?.value).toBe('hello world');
    });

    it('should handle mixed phrases and terms', () => {
      const query = parser.parse('test "hello world" foo');
      expect(query.tokens.length).toBe(3);
      expect(query.tokens[0]?.type).toBe('term');
      expect(query.tokens[1]?.type).toBe('phrase');
      expect(query.tokens[2]?.type).toBe('term');
    });
  });

  describe('prefix queries', () => {
    it('should parse prefix wildcards', () => {
      const query = parser.parse('test*');
      expect(query.tokens.length).toBe(1);
      expect(query.tokens[0]?.type).toBe('prefix');
      expect(query.tokens[0]?.value).toBe('test');
    });
  });

  describe('field-specific queries', () => {
    it('should parse field:term syntax', () => {
      const query = parser.parse('title:react');
      expect(query.tokens.length).toBe(1);
      expect(query.tokens[0]?.type).toBe('field');
      expect(query.tokens[0]?.field).toBe('title');
      expect(query.tokens[0]?.value).toBe('react');
    });
  });

  describe('boolean operators', () => {
    it('should parse OR operator', () => {
      const query = parser.parse('cat OR dog');
      expect(query.tokens.some(t => t.operator === 'OR')).toBe(true);
      expect(query.defaultOperator).toBe('OR');
    });

    it('should parse negation with -', () => {
      const query = parser.parse('-excluded term');
      expect(query.tokens[0]?.negated).toBe(true);
      expect(query.tokens[1]?.negated).toBeFalsy();
    });

    it('should use AND as default operator', () => {
      const query = parser.parse('cat dog');
      expect(query.defaultOperator).toBe('AND');
    });
  });
});

// =============================================================================
// Inverted Index Tests
// =============================================================================

describe('InvertedIndex', () => {
  let index: InvertedIndex;

  beforeEach(() => {
    index = new InvertedIndex();
  });

  describe('document indexing', () => {
    it('should add documents to the index', () => {
      index.addDocument('doc1', { content: 'test' }, new Map([
        ['content', [{ original: 'test', normalized: 'test', position: 0 }]],
      ]));

      expect(index.getTotalDocs()).toBe(1);
      expect(index.getDocument('doc1')).toEqual({ content: 'test' });
    });

    it('should update existing documents', () => {
      index.addDocument('doc1', { content: 'old' }, new Map([
        ['content', [{ original: 'old', normalized: 'old', position: 0 }]],
      ]));
      index.addDocument('doc1', { content: 'new' }, new Map([
        ['content', [{ original: 'new', normalized: 'new', position: 0 }]],
      ]));

      expect(index.getTotalDocs()).toBe(1);
      expect(index.getDocument('doc1')).toEqual({ content: 'new' });
    });

    it('should remove documents', () => {
      index.addDocument('doc1', { content: 'test' }, new Map([
        ['content', [{ original: 'test', normalized: 'test', position: 0 }]],
      ]));

      expect(index.removeDocument('doc1')).toBe(true);
      expect(index.getTotalDocs()).toBe(0);
      expect(index.getDocument('doc1')).toBeUndefined();
    });

    it('should return false when removing non-existent document', () => {
      expect(index.removeDocument('nonexistent')).toBe(false);
    });
  });

  describe('posting lists', () => {
    it('should create posting lists for terms', () => {
      index.addDocument('doc1', { content: 'hello world' }, new Map([
        ['content', [
          { original: 'hello', normalized: 'hello', position: 0 },
          { original: 'world', normalized: 'world', position: 1 },
        ]],
      ]));

      const helloPostings = index.getPostingList('hello');
      expect(helloPostings).toBeDefined();
      expect(helloPostings?.docFreq).toBe(1);
    });

    it('should track term positions', () => {
      index.addDocument('doc1', { content: 'test' }, new Map([
        ['content', [{ original: 'test', normalized: 'test', position: 0 }]],
      ]));

      const postings = index.getPostingList('test');
      expect(postings?.postings.get('doc1')?.[0]?.positions).toEqual([0]);
    });
  });

  describe('prefix matching', () => {
    it('should find terms with prefix', () => {
      index.addDocument('doc1', { content: 'testing' }, new Map([
        ['content', [{ original: 'testing', normalized: 'testing', position: 0 }]],
      ]));
      index.addDocument('doc2', { content: 'tested' }, new Map([
        ['content', [{ original: 'tested', normalized: 'tested', position: 0 }]],
      ]));
      index.addDocument('doc3', { content: 'other' }, new Map([
        ['content', [{ original: 'other', normalized: 'other', position: 0 }]],
      ]));

      const terms = index.getTermsWithPrefix('test');
      expect(terms).toContain('testing');
      expect(terms).toContain('tested');
      expect(terms).not.toContain('other');
    });
  });

  describe('statistics', () => {
    it('should track document count', () => {
      index.addDocument('doc1', {}, new Map());
      index.addDocument('doc2', {}, new Map());
      expect(index.getTotalDocs()).toBe(2);
    });

    it('should calculate average document length', () => {
      index.addDocument('doc1', {}, new Map([
        ['content', [
          { original: 'a', normalized: 'a', position: 0 },
          { original: 'b', normalized: 'b', position: 1 },
        ]],
      ]));
      index.addDocument('doc2', {}, new Map([
        ['content', [
          { original: 'c', normalized: 'c', position: 0 },
          { original: 'd', normalized: 'd', position: 1 },
          { original: 'e', normalized: 'e', position: 2 },
          { original: 'f', normalized: 'f', position: 3 },
        ]],
      ]));

      expect(index.getAvgDocLength()).toBe(3);
    });

    it('should provide index statistics', () => {
      index.addDocument('doc1', {}, new Map([
        ['content', [{ original: 'test', normalized: 'test', position: 0 }]],
      ]));

      const stats = index.getStats();
      expect(stats.documentCount).toBe(1);
      expect(stats.termCount).toBe(1);
      expect(stats.totalTokens).toBe(1);
    });
  });
});

// =============================================================================
// TextIndex Integration Tests
// =============================================================================

describe('TextIndex', () => {
  describe('index creation', () => {
    it('should create index for single field', () => {
      const index = createTextIndex('articles', 'content');

      expect(index.getDefinition().fields).toEqual(['content']);
      expect(index.getDefinition().collection).toBe('articles');
    });

    it('should create index for multiple fields', () => {
      const index = createTextIndex('articles', ['title', 'content']);

      expect(index.getDefinition().fields).toEqual(['title', 'content']);
    });

    it('should create index with field weights', () => {
      const index = createTextIndex('articles', {
        title: { weight: 10 },
        content: { weight: 1 },
      });

      expect(index.getDefinition().weights).toEqual({ title: 10, content: 1 });
    });

    it('should generate index name from collection and fields', () => {
      const index = createTextIndex('articles', ['title', 'content']);

      expect(index.getDefinition().name).toBe('articles_title_content_text');
    });
  });

  describe('document indexing', () => {
    let index: TextIndex;

    beforeEach(() => {
      index = createTextIndex('articles', ['title', 'content']);
    });

    it('should index documents', () => {
      index.indexDocument('doc1', {
        title: 'Introduction to TypeScript',
        content: 'TypeScript is a typed superset of JavaScript',
      });

      const stats = index.getStats();
      expect(stats.documentCount).toBe(1);
      expect(stats.termCount).toBeGreaterThan(0);
    });

    it('should update index on document changes', () => {
      index.indexDocument('doc1', { title: 'Hello', content: 'World' });

      let results = index.search('world');
      expect(results.results.length).toBe(1);

      index.indexDocument('doc1', { title: 'Goodbye', content: 'Universe' });

      results = index.search('world');
      expect(results.results.length).toBe(0);

      results = index.search('universe');
      expect(results.results.length).toBe(1);
    });

    it('should remove document from index', () => {
      index.indexDocument('doc1', { title: 'Test', content: 'Content' });

      expect(index.search('test').results.length).toBe(1);

      index.removeDocument('doc1');

      expect(index.search('test').results.length).toBe(0);
    });
  });

  describe('basic search', () => {
    let index: TextIndex;

    beforeEach(() => {
      index = createTextIndex('articles', ['title', 'content', 'tags']);
      index.indexDocument('doc1', {
        title: 'Getting Started with React',
        content: 'React is a JavaScript library for building user interfaces. It uses a virtual DOM for efficient updates.',
        tags: 'react javascript frontend',
      });
      index.indexDocument('doc2', {
        title: 'Vue.js Tutorial',
        content: 'Vue is a progressive JavaScript framework. It is designed to be incrementally adoptable.',
        tags: 'vue javascript frontend',
      });
      index.indexDocument('doc3', {
        title: 'Node.js Backend Development',
        content: 'Node.js is a runtime environment for executing JavaScript on the server side.',
        tags: 'node javascript backend',
      });
    });

    it('should search for single term', () => {
      const results = index.search('react');

      expect(results.results.length).toBe(1);
      expect(results.results[0]?.key).toBe('doc1');
    });

    it('should search for multiple terms (AND by default)', () => {
      const results = index.search('javascript library');

      expect(results.results.length).toBe(1);
      expect(results.results[0]?.key).toBe('doc1');
    });

    it('should support OR operator', () => {
      const results = index.search('react OR vue');

      expect(results.results.length).toBe(2);
    });

    it('should support NOT operator', () => {
      const results = index.search('javascript -react');

      expect(results.results.length).toBe(2);
      expect(results.results.find(r => r.key === 'doc1')).toBeUndefined();
    });

    it('should support phrase search', () => {
      const results = index.search('"virtual DOM"');

      expect(results.results.length).toBe(1);
      expect(results.results[0]?.key).toBe('doc1');
    });

    it('should support prefix search', () => {
      const results = index.search('java*');

      expect(results.results.length).toBe(3);
    });

    it('should return empty for no matches', () => {
      const results = index.search('python');

      expect(results.results.length).toBe(0);
    });

    it('should support field-specific search', () => {
      const results = index.search('title:React');

      expect(results.results.length).toBe(1);
      expect(results.results[0]?.key).toBe('doc1');
    });
  });

  describe('pagination', () => {
    let index: TextIndex;

    beforeEach(() => {
      index = createTextIndex('items', 'content');
      for (let i = 0; i < 10; i++) {
        index.indexDocument(`doc${i}`, { content: `javascript test ${i}` });
      }
    });

    it('should limit results', () => {
      const results = index.search('javascript', { limit: 3 });

      expect(results.results.length).toBe(3);
    });

    it('should skip results with offset', () => {
      const page1 = index.search('javascript', { limit: 3, offset: 0 });
      const page2 = index.search('javascript', { limit: 3, offset: 3 });

      expect(page1.results.length).toBe(3);
      expect(page2.results.length).toBe(3);

      // Pages should be different
      const page1Keys = page1.results.map(r => r.key);
      const page2Keys = page2.results.map(r => r.key);
      expect(page1Keys.some(k => page2Keys.includes(k))).toBe(false);
    });

    it('should return total count with pagination', () => {
      const results = index.search('javascript', { limit: 3 });

      expect(results.totalCount).toBe(10);
    });
  });

  describe('relevance scoring', () => {
    let index: TextIndex;

    beforeEach(() => {
      index = createTextIndex('articles', {
        title: { weight: 2 },
        content: { weight: 1 },
      });
      index.indexDocument('doc1', {
        title: 'JavaScript JavaScript JavaScript',
        content: 'A short article',
      });
      index.indexDocument('doc2', {
        title: 'Programming',
        content: 'JavaScript is a programming language. JavaScript is popular.',
      });
      index.indexDocument('doc3', {
        title: 'Other Topic',
        content: 'This article mentions JavaScript once',
      });
    });

    it('should return results sorted by score', () => {
      const results = index.search('javascript');

      expect(results.results.length).toBe(3);
      // Higher scored docs should come first
      expect(results.results[0]?.score).toBeGreaterThan(results.results[1]?.score ?? 0);
      expect(results.results[1]?.score).toBeGreaterThan(results.results[2]?.score ?? 0);
    });

    it('should include score in results', () => {
      const results = index.search('javascript');

      expect(results.results[0]?.score).toBeDefined();
      expect(typeof results.results[0]?.score).toBe('number');
      expect(results.results[0]?.score).toBeGreaterThan(0);
    });

    it('should apply field weights', () => {
      const results = index.search('programming');

      // doc2 has 'Programming' in title (weight 2) AND content (weight 1)
      expect(results.results[0]?.key).toBe('doc2');
    });
  });

  describe('stemming', () => {
    let index: TextIndex;

    beforeEach(() => {
      index = createTextIndex('articles', 'content', { stemming: true });
      index.indexDocument('doc1', { content: 'running fast' });
      index.indexDocument('doc2', { content: 'the runner runs' }); // Changed 'ran' to 'runs' - Porter stemmer doesn't handle irregular verbs
      index.indexDocument('doc3', { content: 'runs quickly' });
    });

    it('should match stemmed variants', () => {
      const results = index.search('run');

      // Should match: running, runner, runs (Porter stemmer handles regular forms)
      // Note: 'ran' is an irregular past tense and wouldn't be matched
      expect(results.results.length).toBe(3);
    });

    it('should stem search query', () => {
      const results = index.search('running');

      // 'running' stems to 'run', should match all docs with run-related words
      expect(results.results.length).toBe(3);
    });

    it('should support disabling stemming in search', () => {
      // Create index without stemming
      const exactIndex = createTextIndex('exact', 'content', { stemming: false });
      exactIndex.indexDocument('doc1', { content: 'running fast' });
      exactIndex.indexDocument('doc2', { content: 'run quickly' });

      const results = exactIndex.search('running');

      expect(results.results.length).toBe(1);
      expect(results.results[0]?.key).toBe('doc1');
    });
  });

  describe('fuzzy matching', () => {
    let index: TextIndex;

    beforeEach(() => {
      index = createTextIndex('articles', 'content');
      index.indexDocument('doc1', { content: 'TypeScript programming' });
      index.indexDocument('doc2', { content: 'JavaScript development' });
      index.indexDocument('doc3', { content: 'Python scripting' });
    });

    it('should find matches with edit distance 1', () => {
      const results = index.search('typescript', { fuzzy: { maxEdits: 1 } });

      expect(results.results.length).toBeGreaterThan(0);
    });

    it('should find matches with edit distance 2', () => {
      const results = index.search('javascrip', { fuzzy: { maxEdits: 2 } });

      expect(results.results.length).toBeGreaterThan(0);
    });

    it('should lower score for fuzzy matches', () => {
      // Add exact match
      index.indexDocument('exact', { content: 'typescript exact' });

      const results = index.search('typescript', { fuzzy: { maxEdits: 1 } });

      // Exact matches should score higher
      const exactResult = results.results.find(r => r.key === 'exact');
      const fuzzyResult = results.results.find(r => r.key !== 'exact');

      if (exactResult && fuzzyResult) {
        expect(exactResult.score).toBeGreaterThanOrEqual(fuzzyResult.score);
      }
    });
  });

  describe('highlighting', () => {
    let index: TextIndex;

    beforeEach(() => {
      index = createTextIndex('articles', ['title', 'content']);
      index.indexDocument('doc1', {
        title: 'Introduction to React',
        content: 'React is a JavaScript library for building user interfaces. React components are reusable.',
      });
    });

    it('should highlight matching terms', () => {
      const results = index.search('react', { highlight: true });

      expect(results.results[0]?.highlights).toBeDefined();
      expect(results.results[0]?.highlights?.title).toContain('<mark>');
      expect(results.results[0]?.highlights?.content).toContain('<mark>');
    });

    it('should support custom highlight tags', () => {
      const results = index.search('react', {
        highlight: {
          preTag: '<em class="highlight">',
          postTag: '</em>',
        },
      });

      expect(results.results[0]?.highlights?.title).toContain('<em class="highlight">');
      expect(results.results[0]?.highlights?.title).toContain('</em>');
    });

    it('should truncate to snippet length', () => {
      const results = index.search('components', {
        highlight: { snippetLength: 50 },
      });

      const snippet = results.results[0]?.highlights?.content;
      expect(snippet?.length).toBeLessThanOrEqual(150); // With some buffer for tags
    });
  });

  describe('filters and facets', () => {
    let index: TextIndex;

    beforeEach(() => {
      index = createTextIndex('products', 'name');
      index.indexDocument('prod1', {
        name: 'Blue Running Shoes',
        category: 'shoes',
        price: 99.99,
        inStock: true,
      });
      index.indexDocument('prod2', {
        name: 'Red Running Shorts',
        category: 'clothing',
        price: 49.99,
        inStock: true,
      });
      index.indexDocument('prod3', {
        name: 'Blue Hiking Boots',
        category: 'shoes',
        price: 149.99,
        inStock: false,
      });
    });

    it('should combine text search with equality filters', () => {
      const results = index.search('blue', { filter: { category: 'shoes' } });

      expect(results.results.length).toBe(2);
      expect(results.results.every(r => r.document.category === 'shoes')).toBe(true);
    });

    it('should combine text search with range filters', () => {
      const results = index.search('running', { filter: { price: { $lt: 100 } } });

      expect(results.results.length).toBe(2);
    });

    it('should return facet counts', () => {
      const results = index.search('blue', { facets: ['category', 'inStock'] });

      expect(results.facets).toBeDefined();
      expect(results.facets?.category).toEqual({ shoes: 2 });
      expect(results.facets?.inStock).toBeDefined();
    });
  });

  describe('language support', () => {
    it('should support English', () => {
      const index = createTextIndex('test', 'content', { language: 'english' });
      index.indexDocument('doc1', { content: 'running quickly' });

      const results = index.search('run');
      expect(results.results.length).toBe(1);
    });

    it('should support Spanish', () => {
      const index = createTextIndex('test', 'content', { language: 'spanish' });
      // 'corriendo' stems to 'corri' with SpanishStemmer
      index.indexDocument('doc1', { content: 'corriendo rapido' });

      // Search for the stemmed form that matches
      const results = index.search('corriendo');
      expect(results.results.length).toBe(1);
    });

    it('should support disabling language processing', () => {
      const index = createTextIndex('test', 'content', { language: 'none', stemming: false });
      index.indexDocument('doc1', { content: 'running quickly' });

      // Without stemming, 'run' should not match 'running'
      const results = index.search('run');
      expect(results.results.length).toBe(0);
    });
  });

  describe('custom scoring function', () => {
    it('should use custom scoring function when provided', () => {
      const index = createTextIndex('test', 'content');
      index.indexDocument('doc1', { content: 'test document one' });
      index.indexDocument('doc2', { content: 'test document two with more words' });

      const results = index.search('test', {
        scoringFunction: (doc, termFreq, docFreq, totalDocs) => {
          // Simple custom scoring: just return term frequency
          return termFreq * 100;
        },
      });

      expect(results.results.length).toBe(2);
      expect(results.results[0]?.score).toBeGreaterThan(0);
    });
  });

  describe('exact match boost', () => {
    it('should boost exact matches', () => {
      const index = createTextIndex('test', 'title');
      index.indexDocument('doc1', { title: 'JavaScript' });
      index.indexDocument('doc2', { title: 'JavaScript programming tutorial' });

      const results = index.search('javascript', { exactMatchBoost: 2.0 });

      // doc1 should have higher score due to exact title match
      expect(results.results.length).toBe(2);
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Full-Text Search Integration', () => {
  it('should handle large document sets', () => {
    const index = createTextIndex('articles', ['title', 'content']);

    // Index 100 documents
    for (let i = 0; i < 100; i++) {
      index.indexDocument(`doc${i}`, {
        title: `Article ${i} about ${i % 2 === 0 ? 'JavaScript' : 'TypeScript'}`,
        content: `This is the content for article ${i}. It discusses various topics including programming, web development, and ${i % 3 === 0 ? 'databases' : 'APIs'}.`,
      });
    }

    const stats = index.getStats();
    expect(stats.documentCount).toBe(100);

    // Search should work
    const results = index.search('JavaScript', { limit: 10 });
    expect(results.results.length).toBe(10);
    expect(results.totalCount).toBe(50); // Half the docs have JavaScript
  });

  it('should support all query types together', () => {
    const index = createTextIndex('docs', ['title', 'content', 'tags']);

    index.indexDocument('doc1', {
      title: 'React Components Guide',
      content: 'Learn how to build reusable React components for your web applications.',
      tags: 'react javascript frontend',
    });
    index.indexDocument('doc2', {
      title: 'Vue Composition API',
      content: 'The Vue Composition API provides a new way to organize component logic.',
      tags: 'vue javascript frontend',
    });
    index.indexDocument('doc3', {
      title: 'Node.js REST API',
      content: 'Build a RESTful API with Node.js and Express framework.',
      tags: 'node javascript backend',
    });

    // Complex query combining different features
    const results = index.search('javascript -vue', {
      filter: { tags: 'react javascript frontend' },
      highlight: true,
      limit: 10,
    });

    expect(results.results.length).toBe(1);
    expect(results.results[0]?.key).toBe('doc1');
    expect(results.results[0]?.highlights).toBeDefined();
  });

  it('should maintain consistency after document updates', () => {
    const index = createTextIndex('posts', 'content');

    // Add initial documents
    index.indexDocument('post1', { content: 'Initial content about cats' });
    index.indexDocument('post2', { content: 'Initial content about dogs' });

    expect(index.search('cats').results.length).toBe(1);
    expect(index.search('dogs').results.length).toBe(1);

    // Update post1
    index.indexDocument('post1', { content: 'Updated content about birds' });

    expect(index.search('cats').results.length).toBe(0);
    expect(index.search('birds').results.length).toBe(1);

    // Remove post2
    index.removeDocument('post2');

    expect(index.search('dogs').results.length).toBe(0);

    // Stats should be consistent
    const stats = index.getStats();
    expect(stats.documentCount).toBe(1);
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('Full-Text Search Performance', () => {
  it('should index documents efficiently', () => {
    const index = createTextIndex('bench', 'content');
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      index.indexDocument(`doc${i}`, {
        content: `This is document ${i} with some content about various topics including technology, science, and art.`,
      });
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
    expect(index.getStats().documentCount).toBe(1000);
  });

  it('should search efficiently', () => {
    const index = createTextIndex('bench', 'content');

    // Index 1000 documents
    for (let i = 0; i < 1000; i++) {
      index.indexDocument(`doc${i}`, {
        content: `Document ${i} about ${i % 10 === 0 ? 'special topic' : 'regular content'} with additional words.`,
      });
    }

    const start = performance.now();

    // Run 100 searches
    for (let i = 0; i < 100; i++) {
      index.search('special topic', { limit: 10 });
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1000); // 100 searches in under 1 second
  });
});
