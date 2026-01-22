/**
 * @evodb/benchmark - Comprehensive Dataset Loaders Tests
 *
 * TDD tests for ONET, ClickBench, Wiktionary, and IMDB data loaders.
 * Tests cover:
 * - Dataset loading functionality
 * - Error handling for missing/invalid datasets
 * - Data generator validation
 * - Performance characteristics
 *
 * Note: ClickBench generation tests with large counts are skipped due to
 * slow Zipf distribution calculations on high cardinality columns.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// ONET Loader Tests
// ============================================================================

import {
  parseTsv,
  groupByOnetCode,
  parseOccupation,
  parseTask,
  parseCompetencyRating,
  parseJobZone,
  loadOnetData,
  ONET_FILES,
  ONET_VERSION,
  ONET_BASE_URL,
  getOnetCurlCommands,
} from '../onet/loader.js';

describe('ONET Loader', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // TSV Parsing Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('parseTsv', () => {
    it('should parse valid TSV content', () => {
      const content = `Header1\tHeader2\tHeader3
Value1\tValue2\tValue3
A\tB\tC`;
      const result = parseTsv(content);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ Header1: 'Value1', Header2: 'Value2', Header3: 'Value3' });
      expect(result[1]).toEqual({ Header1: 'A', Header2: 'B', Header3: 'C' });
    });

    it('should handle empty content', () => {
      const result = parseTsv('');
      expect(result).toEqual([]);
    });

    it('should handle content with only headers', () => {
      const content = 'Header1\tHeader2';
      const result = parseTsv(content);
      expect(result).toEqual([]);
    });

    it('should trim whitespace from headers and values', () => {
      const content = `  Name  \t  Value
  Test  \t  123  `;
      const result = parseTsv(content);

      expect(result[0]).toEqual({ Name: 'Test', Value: '123' });
    });

    it('should handle missing values', () => {
      const content = `Col1\tCol2\tCol3
A\tB`;
      const result = parseTsv(content);

      expect(result[0].Col1).toBe('A');
      expect(result[0].Col2).toBe('B');
      expect(result[0].Col3).toBe('');
    });

    it('should filter out whitespace-only lines', () => {
      // Tab-only lines are filtered out by line.trim() check
      const content = `Col1\tCol2
\t`;
      const result = parseTsv(content);
      // Lines that are only whitespace (including tabs) are filtered
      expect(result).toHaveLength(0);
    });

    it('should handle special characters in values', () => {
      const content = `Name\tDescription
Test\tThis has "quotes" and 'apostrophes'
Another\tSpecial chars: <>&`;
      const result = parseTsv(content);

      expect(result[0].Description).toBe('This has "quotes" and \'apostrophes\'');
      expect(result[1].Description).toBe('Special chars: <>&');
    });

    it('should handle Unicode content', () => {
      const content = `Name\tValue
日本語\t中文
Ελληνικά\tРусский`;
      const result = parseTsv(content);

      expect(result[0].Name).toBe('日本語');
      expect(result[0].Value).toBe('中文');
      expect(result[1].Name).toBe('Ελληνικά');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Grouping Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('groupByOnetCode', () => {
    it('should group records by O*NET-SOC Code', () => {
      const records = [
        { 'O*NET-SOC Code': '15-1251.00', value: 'a' },
        { 'O*NET-SOC Code': '15-1251.00', value: 'b' },
        { 'O*NET-SOC Code': '17-2051.00', value: 'c' },
      ];

      const grouped = groupByOnetCode(records);

      expect(grouped.get('15-1251.00')).toHaveLength(2);
      expect(grouped.get('17-2051.00')).toHaveLength(1);
      expect(grouped.get('unknown')).toBeUndefined();
    });

    it('should handle empty array', () => {
      const grouped = groupByOnetCode([]);
      expect(grouped.size).toBe(0);
    });

    it('should preserve order within groups', () => {
      const records = [
        { 'O*NET-SOC Code': '15-1251.00', order: 1 },
        { 'O*NET-SOC Code': '15-1251.00', order: 2 },
        { 'O*NET-SOC Code': '15-1251.00', order: 3 },
      ];

      const grouped = groupByOnetCode(records);
      const items = grouped.get('15-1251.00')!;

      expect(items[0].order).toBe(1);
      expect(items[1].order).toBe(2);
      expect(items[2].order).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Data Parsing Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('parseOccupation', () => {
    it('should parse occupation data correctly', () => {
      const raw = {
        'O*NET-SOC Code': '15-1251.00',
        Title: 'Computer Programmers',
        Description: 'Create, modify, and test code...',
      };

      const occupation = parseOccupation(raw);

      expect(occupation.onetSocCode).toBe('15-1251.00');
      expect(occupation.title).toBe('Computer Programmers');
      expect(occupation.description).toBe('Create, modify, and test code...');
    });

    it('should handle empty fields', () => {
      const raw = {
        'O*NET-SOC Code': '99-9999.00',
        Title: '',
        Description: '',
      };

      const occupation = parseOccupation(raw);
      expect(occupation.title).toBe('');
      expect(occupation.description).toBe('');
    });
  });

  describe('parseTask', () => {
    it('should parse core task correctly', () => {
      const raw = {
        'Task ID': '12345',
        Task: 'Write programs',
        'Task Type': 'Core',
        'Incumbents Responding': '100',
        Date: '2024-01',
        'Domain Source': 'Analyst',
      };

      const task = parseTask(raw);

      expect(task.taskId).toBe(12345);
      expect(task.task).toBe('Write programs');
      expect(task.taskType).toBe('Core');
      expect(task.incumbentsResponding).toBe(100);
      expect(task.date).toBe('2024-01');
    });

    it('should parse supplemental task correctly', () => {
      const raw = {
        'Task ID': '67890',
        Task: 'Review code',
        'Task Type': 'Supplemental',
        'Incumbents Responding': '',
        Date: '2024-01',
        'Domain Source': 'Analyst',
      };

      const task = parseTask(raw);

      expect(task.taskType).toBe('Supplemental');
      expect(task.incumbentsResponding).toBeUndefined();
    });

    it('should handle NaN task IDs gracefully', () => {
      const raw = {
        'Task ID': 'invalid',
        Task: 'Test',
        'Task Type': 'Core',
        'Incumbents Responding': '',
        Date: '2024-01',
        'Domain Source': 'Analyst',
      };

      const task = parseTask(raw);
      expect(Number.isNaN(task.taskId)).toBe(true);
    });
  });

  describe('parseCompetencyRating', () => {
    it('should parse competency rating with all fields', () => {
      const raw = {
        'Element ID': '1.A.1.a.1',
        'Element Name': 'Oral Comprehension',
        'Scale ID': 'IM',
        'Scale Name': 'Importance',
        'Data Value': '4.25',
        N: '50',
        'Standard Error': '0.15',
        'Lower CI Bound': '4.10',
        'Upper CI Bound': '4.40',
        'Recommend Suppress': 'N',
        'Not Relevant': 'N',
        Date: '2024-01',
        'Domain Source': 'Analyst',
      };

      const rating = parseCompetencyRating(raw);

      expect(rating.elementId).toBe('1.A.1.a.1');
      expect(rating.elementName).toBe('Oral Comprehension');
      expect(rating.scaleId).toBe('IM');
      expect(rating.dataValue).toBe(4.25);
      expect(rating.n).toBe(50);
      expect(rating.standardError).toBe(0.15);
      expect(rating.lowerCiBound).toBe(4.1);
      expect(rating.upperCiBound).toBe(4.4);
      expect(rating.recommendSuppress).toBe(false);
      expect(rating.notRelevant).toBe(false);
    });

    it('should handle suppressed ratings', () => {
      const raw = {
        'Element ID': '1.A.1.a.1',
        'Element Name': 'Test',
        'Scale ID': 'IM',
        'Scale Name': 'Importance',
        'Data Value': '2.0',
        N: '',
        'Standard Error': '',
        'Lower CI Bound': '',
        'Upper CI Bound': '',
        'Recommend Suppress': 'Y',
        'Not Relevant': 'Y',
        Date: '2024-01',
        'Domain Source': 'Analyst',
      };

      const rating = parseCompetencyRating(raw);

      expect(rating.recommendSuppress).toBe(true);
      expect(rating.notRelevant).toBe(true);
      expect(rating.n).toBeUndefined();
    });

    it('should handle invalid numeric values', () => {
      const raw = {
        'Element ID': '1.A.1.a.1',
        'Element Name': 'Test',
        'Scale ID': 'IM',
        'Scale Name': 'Importance',
        'Data Value': 'invalid',
        N: 'abc',
        'Standard Error': '',
        'Lower CI Bound': '',
        'Upper CI Bound': '',
        'Recommend Suppress': 'N',
        'Not Relevant': '',
        Date: '2024-01',
        'Domain Source': 'Analyst',
      };

      const rating = parseCompetencyRating(raw);
      expect(Number.isNaN(rating.dataValue)).toBe(true);
    });
  });

  describe('parseJobZone', () => {
    it('should parse job zone correctly', () => {
      const raw = {
        'Job Zone': '4',
        Date: '2024-01',
        'Domain Source': 'Analyst',
      };

      const jobZone = parseJobZone(raw);

      expect(jobZone.jobZone).toBe(4);
      expect(jobZone.date).toBe('2024-01');
    });

    it('should handle edge case job zones', () => {
      expect(parseJobZone({ 'Job Zone': '1', Date: '2024-01', 'Domain Source': '' }).jobZone).toBe(1);
      expect(parseJobZone({ 'Job Zone': '5', Date: '2024-01', 'Domain Source': '' }).jobZone).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Data Loading Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('loadOnetData', () => {
    it('should load and denormalize occupation data', async () => {
      const mockFiles: Record<string, string> = {
        'Occupation Data.txt': `O*NET-SOC Code\tTitle\tDescription
15-1251.00\tComputer Programmers\tCreate and test code`,
        'Job Zones.txt': `O*NET-SOC Code\tTitle\tJob Zone\tDate\tDomain Source
15-1251.00\tComputer Programmers\t4\t2024-01\tAnalyst`,
        'Task Statements.txt': `O*NET-SOC Code\tTitle\tTask ID\tTask\tTask Type\tIncumbents Responding\tDate\tDomain Source
15-1251.00\tComputer Programmers\t1\tWrite code\tCore\t100\t2024-01\tAnalyst`,
        'Skills.txt': `O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source
15-1251.00\tComputer Programmers\t2.A.1.a\tReading Comprehension\tIM\tImportance\t4.5\t50\t0.1\t4.3\t4.7\tN\tN\t2024-01\tAnalyst`,
        'Abilities.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Knowledge.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Work Activities.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Work Context.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source\tCategory',
        'Work Styles.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Interests.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
      };

      const readFile = async (path: string): Promise<string> => {
        const fileName = path.split('/').pop()!;
        if (!(fileName in mockFiles)) {
          throw new Error(`File not found: ${path}`);
        }
        return mockFiles[fileName];
      };

      const occupations = await loadOnetData({ dataDir: '/mock/data' }, readFile);

      expect(occupations).toHaveLength(1);
      expect(occupations[0].code).toBe('15-1251.00');
      expect(occupations[0].title).toBe('Computer Programmers');
      expect(occupations[0].jobZone).toBe(4);
      expect(occupations[0].tasks).toHaveLength(1);
      expect(occupations[0].tasks[0].description).toBe('Write code');
    });

    it('should handle missing file error', async () => {
      const readFile = async (_path: string): Promise<string> => {
        throw new Error('File not found');
      };

      await expect(loadOnetData({ dataDir: '/invalid' }, readFile)).rejects.toThrow('File not found');
    });

    it('should respect filterCodes option', async () => {
      const mockFiles: Record<string, string> = {
        'Occupation Data.txt': `O*NET-SOC Code\tTitle\tDescription
15-1251.00\tComputer Programmers\tCreate code
17-2051.00\tCivil Engineers\tDesign structures`,
        'Job Zones.txt': `O*NET-SOC Code\tTitle\tJob Zone\tDate\tDomain Source
15-1251.00\tComputer Programmers\t4\t2024-01\tAnalyst
17-2051.00\tCivil Engineers\t4\t2024-01\tAnalyst`,
        'Task Statements.txt': 'O*NET-SOC Code\tTitle\tTask ID\tTask\tTask Type\tIncumbents Responding\tDate\tDomain Source',
        'Skills.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Abilities.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Knowledge.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Work Activities.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Work Context.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source\tCategory',
        'Work Styles.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Interests.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
      };

      const readFile = async (path: string): Promise<string> => {
        const fileName = path.split('/').pop()!;
        return mockFiles[fileName];
      };

      const occupations = await loadOnetData(
        { dataDir: '/mock/data', filterCodes: ['15-1251.00'] },
        readFile
      );

      expect(occupations).toHaveLength(1);
      expect(occupations[0].code).toBe('15-1251.00');
    });

    it('should respect limit option', async () => {
      const mockFiles: Record<string, string> = {
        'Occupation Data.txt': `O*NET-SOC Code\tTitle\tDescription
15-1251.00\tComputer Programmers\tCreate code
17-2051.00\tCivil Engineers\tDesign structures
11-1011.00\tChief Executives\tManage organizations`,
        'Job Zones.txt': `O*NET-SOC Code\tTitle\tJob Zone\tDate\tDomain Source
15-1251.00\tComputer Programmers\t4\t2024-01\tAnalyst
17-2051.00\tCivil Engineers\t4\t2024-01\tAnalyst
11-1011.00\tChief Executives\t5\t2024-01\tAnalyst`,
        'Task Statements.txt': 'O*NET-SOC Code\tTitle\tTask ID\tTask\tTask Type\tIncumbents Responding\tDate\tDomain Source',
        'Skills.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Abilities.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Knowledge.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Work Activities.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Work Context.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source\tCategory',
        'Work Styles.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
        'Interests.txt': 'O*NET-SOC Code\tTitle\tElement ID\tElement Name\tScale ID\tScale Name\tData Value\tN\tStandard Error\tLower CI Bound\tUpper CI Bound\tRecommend Suppress\tNot Relevant\tDate\tDomain Source',
      };

      const readFile = async (path: string): Promise<string> => {
        const fileName = path.split('/').pop()!;
        return mockFiles[fileName];
      };

      const occupations = await loadOnetData({ dataDir: '/mock/data', limit: 2 }, readFile);

      expect(occupations).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Constants Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Constants', () => {
    it('should have valid ONET version', () => {
      expect(ONET_VERSION).toMatch(/^\d+\.\d+$/);
    });

    it('should have valid base URL', () => {
      expect(ONET_BASE_URL).toMatch(/^https:\/\//);
    });

    it('should have required file definitions', () => {
      expect(ONET_FILES.OCCUPATION_DATA).toBeDefined();
      expect(ONET_FILES.SKILLS).toBeDefined();
      expect(ONET_FILES.ABILITIES).toBeDefined();
      expect(ONET_FILES.KNOWLEDGE).toBeDefined();
      expect(ONET_FILES.TASK_STATEMENTS).toBeDefined();
      expect(ONET_FILES.JOB_ZONES).toBeDefined();
      expect(ONET_FILES.WORK_ACTIVITIES).toBeDefined();
      expect(ONET_FILES.WORK_CONTEXT).toBeDefined();
      expect(ONET_FILES.WORK_STYLES).toBeDefined();
      expect(ONET_FILES.INTERESTS).toBeDefined();
    });

    it('should generate curl commands', () => {
      const commands = getOnetCurlCommands();

      expect(commands).toBeInstanceOf(Array);
      expect(commands.length).toBeGreaterThan(0);
      expect(commands.some(cmd => cmd.includes('curl'))).toBe(true);
    });
  });
});

// ============================================================================
// ClickBench Loader Tests
// ============================================================================

// Note: generateHits tests are skipped due to slow Zipf distribution calculation
// on large cardinality values (10M for UserID). The memory estimation functions
// are tested instead.

import {
  estimateMemoryUsage as estimateClickBenchMemory,
  estimateJsonSize as estimateClickBenchJson,
  CLICKBENCH_URLS,
} from '../clickbench/loader.js';

import {
  CLICKBENCH_SIZES,
  CLICKBENCH_COLUMNS,
  CLICKBENCH_CARDINALITY,
  getColumn,
  getNumericColumns,
  getStringColumns,
  shouldUseDictionaryEncoding,
  getRecommendedEncoding,
} from '../clickbench/schema.js';

describe('ClickBench Loader', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Memory Estimation Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Memory estimates', () => {
    it('should estimate memory usage', () => {
      const memoryBytes = estimateClickBenchMemory(1000);
      expect(memoryBytes).toBeGreaterThan(0);
      expect(memoryBytes).toBeLessThan(10_000_000); // Less than 10MB for 1000 records
    });

    it('should estimate JSON size', () => {
      const jsonBytes = estimateClickBenchJson(1000);
      expect(jsonBytes).toBeGreaterThan(0);
      expect(jsonBytes).toBeGreaterThan(estimateClickBenchMemory(1000) * 0.5);
    });

    it('should scale linearly', () => {
      const mem1k = estimateClickBenchMemory(1000);
      const mem10k = estimateClickBenchMemory(10000);
      expect(mem10k).toBe(mem1k * 10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Schema Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Schema', () => {
    it('should have all expected columns', () => {
      expect(CLICKBENCH_COLUMNS.length).toBeGreaterThan(90);

      const columnNames = CLICKBENCH_COLUMNS.map(c => c.name);
      expect(columnNames).toContain('WatchID');
      expect(columnNames).toContain('EventTime');
      expect(columnNames).toContain('UserID');
      expect(columnNames).toContain('URL');
    });

    it('should get column by name', () => {
      const col = getColumn('WatchID');
      expect(col).toBeDefined();
      expect(col!.type).toBe('int64');
      expect(col!.primaryKey).toBe(true);
    });

    it('should get numeric columns', () => {
      const numericCols = getNumericColumns();
      expect(numericCols.length).toBeGreaterThan(50);

      for (const col of numericCols) {
        expect(['int32', 'int64', 'float64']).toContain(col.type);
      }
    });

    it('should get string columns', () => {
      const stringCols = getStringColumns();
      expect(stringCols.length).toBeGreaterThan(10);

      for (const col of stringCols) {
        expect(col.type).toBe('string');
      }
    });

    it('should recommend dictionary encoding for low cardinality', () => {
      expect(shouldUseDictionaryEncoding('GoodEvent', 1_000_000)).toBe(true);
      expect(shouldUseDictionaryEncoding('IsMobile', 1_000_000)).toBe(true);
      expect(shouldUseDictionaryEncoding('WatchID', 1_000_000)).toBe(false);
    });

    it('should recommend appropriate encodings', () => {
      expect(getRecommendedEncoding('GoodEvent', 1_000_000)).toBe('rle');
      expect(getRecommendedEncoding('OS', 1_000_000)).toBe('dict');
      expect(getRecommendedEncoding('WatchID', 1_000_000)).toBe('delta');
      expect(getRecommendedEncoding('URL', 1_000_000)).toBe('plain');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Constants Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Constants', () => {
    it('should have valid download URLs', () => {
      expect(CLICKBENCH_URLS.hits_parquet).toMatch(/^https:\/\//);
      expect(CLICKBENCH_URLS.hits_parquet).toContain('parquet');
    });

    it('should have valid size configurations', () => {
      expect(CLICKBENCH_SIZES.tiny).toBe(10_000);
      expect(CLICKBENCH_SIZES.small).toBe(100_000);
      expect(CLICKBENCH_SIZES.medium).toBe(1_000_000);
      expect(CLICKBENCH_SIZES.large).toBe(10_000_000);
      expect(CLICKBENCH_SIZES.full).toBe(100_000_000);
    });

    it('should have cardinality estimates', () => {
      expect(CLICKBENCH_CARDINALITY.GoodEvent).toBe(2);
      expect(CLICKBENCH_CARDINALITY.UserID).toBe(10_000_000);
      expect(CLICKBENCH_CARDINALITY.WatchID).toBe(100_000_000);
    });
  });
});

// ============================================================================
// Wiktionary Loader Tests
// ============================================================================

import {
  generateEntries,
  generateDataset as generateWiktionaryDataset,
  generateEntriesIterator,
  transformRawEntry,
  parseJsonl,
  parseJsonlStream,
  estimateMemoryUsage as estimateWiktionaryMemory,
  estimateJsonSize as estimateWiktionaryJson,
} from '../wiktionary/loader.js';

import {
  WIKTIONARY_DATA_SIZES,
  type WiktionaryEntry,
} from '../wiktionary/schema.js';

describe('Wiktionary Loader', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Entry Generation Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('generateEntries', () => {
    it('should generate specified number of entries', () => {
      const entries = generateEntries(10);
      expect(entries).toHaveLength(10);
    });

    it('should generate reproducible data with seed', () => {
      const entries1 = generateEntries(5, { seed: 42 });
      const entries2 = generateEntries(5, { seed: 42 });

      expect(entries1[0].word).toBe(entries2[0].word);
      expect(entries1[0].lang).toBe(entries2[0].lang);
    });

    it('should generate entries with required fields', () => {
      const entries = generateEntries(5);

      for (const entry of entries) {
        expect(entry.word).toBeDefined();
        expect(entry.word.length).toBeGreaterThan(0);
        expect(entry.lang).toBeDefined();
        expect(entry.langCode).toBeDefined();
        expect(entry.pos).toBeDefined();
        expect(entry.senses).toBeInstanceOf(Array);
        expect(entry.senses.length).toBeGreaterThan(0);
      }
    });

    it('should generate valid parts of speech', () => {
      const validPos = [
        'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
        'conjunction', 'interjection', 'determiner', 'proper noun', 'phrase', 'abbreviation',
      ];
      const entries = generateEntries(20);

      for (const entry of entries) {
        expect(validPos).toContain(entry.pos);
      }
    });

    it('should generate senses with glosses', () => {
      const entries = generateEntries(10);

      for (const entry of entries) {
        for (const sense of entry.senses) {
          expect(sense.glosses).toBeInstanceOf(Array);
          expect(sense.glosses.length).toBeGreaterThan(0);
          expect(typeof sense.glosses[0]).toBe('string');
        }
      }
    });

    it('should sometimes include optional fields', () => {
      const entries = generateEntries(50);

      const hasSounds = entries.some(e => e.sounds && e.sounds.length > 0);
      const hasForms = entries.some(e => e.forms && e.forms.length > 0);
      const hasTranslations = entries.some(e => e.translations && e.translations.length > 0);
      const hasEtymology = entries.some(e => e.etymologyText);

      expect(hasSounds).toBe(true);
      expect(hasForms).toBe(true);
      expect(hasTranslations).toBe(true);
      expect(hasEtymology).toBe(true);
    });

    it('should generate pronunciation with IPA', () => {
      const entries = generateEntries(100);
      const withIPA = entries.filter(e => e.sounds?.some(s => s.ipa));

      expect(withIPA.length).toBeGreaterThan(0);

      for (const entry of withIPA) {
        const sound = entry.sounds!.find(s => s.ipa);
        expect(sound!.ipa).toMatch(/^\/.*\/$/);
      }
    });

    it('should generate valid language codes', () => {
      const entries = generateEntries(100);
      const langCodes = new Set(entries.map(e => e.langCode));

      expect(langCodes.size).toBeGreaterThan(1);

      for (const code of langCodes) {
        expect(code.length).toBeLessThanOrEqual(4);
      }
    });

    it('should generate translations to multiple languages', () => {
      const entries = generateEntries(100);
      const withTranslations = entries.filter(e => e.translations && e.translations.length > 0);

      expect(withTranslations.length).toBeGreaterThan(0);

      for (const entry of withTranslations) {
        const langCodes = new Set(entry.translations!.map(t => t.code));
        expect(langCodes.size).toBeGreaterThan(0);
      }
    });

    it('should respect language distribution config', () => {
      const entries = generateEntries(1000, {
        languageDistribution: {
          en: 0.9,
          de: 0.1,
        },
      });

      const enCount = entries.filter(e => e.langCode === 'en').length;
      const deCount = entries.filter(e => e.langCode === 'de').length;

      expect(enCount).toBeGreaterThan(800);
      expect(deCount).toBeGreaterThan(50);
      expect(deCount).toBeLessThan(200);
    });
  });

  describe('generateDataset', () => {
    it('should generate tiny dataset', () => {
      const entries = generateWiktionaryDataset('tiny');
      expect(entries).toHaveLength(WIKTIONARY_DATA_SIZES.tiny);
    });

    it('should respect custom config', () => {
      const entries = generateWiktionaryDataset('tiny', {
        seed: 99999,
        avgSensesPerEntry: 5,
      });

      expect(entries).toHaveLength(WIKTIONARY_DATA_SIZES.tiny);
    });
  });

  describe('generateEntriesIterator', () => {
    it('should generate entries in batches', async () => {
      const batches: WiktionaryEntry[][] = [];

      for await (const batch of generateEntriesIterator(250, 100)) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(100);
      expect(batches[1]).toHaveLength(100);
      expect(batches[2]).toHaveLength(50);

      const total = batches.reduce((sum, b) => sum + b.length, 0);
      expect(total).toBe(250);
    });

    it('should be reproducible with seed', async () => {
      const batches1: WiktionaryEntry[][] = [];
      const batches2: WiktionaryEntry[][] = [];

      for await (const batch of generateEntriesIterator(100, 50, { seed: 42 })) {
        batches1.push(batch);
      }

      for await (const batch of generateEntriesIterator(100, 50, { seed: 42 })) {
        batches2.push(batch);
      }

      expect(batches1).toEqual(batches2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Transformation Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('transformRawEntry', () => {
    it('should transform basic raw entry', () => {
      const raw = {
        word: 'test',
        lang: 'English',
        lang_code: 'en',
        pos: 'noun',
        senses: [
          { glosses: ['A trial or examination'] },
        ],
      };

      const entry = transformRawEntry(raw);

      expect(entry.word).toBe('test');
      expect(entry.lang).toBe('English');
      expect(entry.langCode).toBe('en');
      expect(entry.pos).toBe('noun');
      expect(entry.senses).toHaveLength(1);
      expect(entry.senses[0].glosses[0]).toBe('A trial or examination');
    });

    it('should transform entry with sounds', () => {
      const raw = {
        word: 'test',
        lang: 'English',
        lang_code: 'en',
        pos: 'noun',
        senses: [{ glosses: ['Test'] }],
        sounds: [
          { ipa: '/tɛst/', tags: ['UK'] },
          { audio: 'En-us-test.ogg', ogg_url: 'https://example.com/test.ogg' },
        ],
      };

      const entry = transformRawEntry(raw);

      expect(entry.sounds).toHaveLength(2);
      expect(entry.sounds![0].ipa).toBe('/tɛst/');
      expect(entry.sounds![0].tags).toEqual(['UK']);
      expect(entry.sounds![1].audio).toBe('En-us-test.ogg');
    });

    it('should transform entry with etymology', () => {
      const raw = {
        word: 'test',
        lang: 'English',
        lang_code: 'en',
        pos: 'noun',
        senses: [{ glosses: ['Test'] }],
        etymology_text: 'From Latin testum',
        etymology_number: 1,
        etymology_templates: [{ name: 'inh', args: {} }],
      };

      const entry = transformRawEntry(raw);

      expect(entry.etymologyText).toBe('From Latin testum');
      expect(entry.etymologyNumber).toBe(1);
      expect(entry.etymology).toBeDefined();
      expect(entry.etymology!.text).toBe('From Latin testum');
    });

    it('should transform entry with translations', () => {
      const raw = {
        word: 'test',
        lang: 'English',
        lang_code: 'en',
        pos: 'noun',
        senses: [{ glosses: ['Test'] }],
        translations: [
          { code: 'de', lang: 'German', word: 'Test' },
          { code: 'fr', lang: 'French', word: 'test', sense: 'examination' },
        ],
      };

      const entry = transformRawEntry(raw);

      expect(entry.translations).toHaveLength(2);
      expect(entry.translations![0].code).toBe('de');
      expect(entry.translations![0].word).toBe('Test');
      expect(entry.translations![1].sense).toBe('examination');
    });

    it('should handle entry with forms', () => {
      const raw = {
        word: 'test',
        lang: 'English',
        lang_code: 'en',
        pos: 'noun',
        senses: [{ glosses: ['Test'] }],
        forms: [
          { form: 'tests', tags: ['plural'] },
        ],
      };

      const entry = transformRawEntry(raw);

      expect(entry.forms).toHaveLength(1);
      expect(entry.forms![0].form).toBe('tests');
    });

    it('should filter out incomplete translations', () => {
      const raw = {
        word: 'test',
        lang: 'English',
        lang_code: 'en',
        pos: 'noun',
        senses: [{ glosses: ['Test'] }],
        translations: [
          { code: 'de', lang: 'German', word: 'Test' },
          { code: undefined, lang: 'Unknown', word: 'xyz' },
          { code: 'fr', lang: 'French', word: undefined },
        ],
      };

      const entry = transformRawEntry(raw);

      expect(entry.translations).toHaveLength(1);
      expect(entry.translations![0].code).toBe('de');
    });

    it('should handle empty senses array', () => {
      const raw = {
        word: 'test',
        lang: 'English',
        lang_code: 'en',
        pos: 'noun',
        senses: [],
      };

      const entry = transformRawEntry(raw);
      expect(entry.senses).toEqual([]);
    });

    it('should transform sense with semantic relations', () => {
      const raw = {
        word: 'happy',
        lang: 'English',
        lang_code: 'en',
        pos: 'adjective',
        senses: [{
          glosses: ['Feeling pleasure'],
          synonyms: [{ word: 'joyful' }, { word: 'glad' }],
          antonyms: [{ word: 'sad' }],
          hypernyms: [{ word: 'emotion' }],
        }],
      };

      const entry = transformRawEntry(raw);

      expect(entry.senses[0].synonyms).toHaveLength(2);
      expect(entry.senses[0].antonyms).toHaveLength(1);
      expect(entry.senses[0].hypernyms).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // JSONL Parsing Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('parseJsonl', () => {
    it('should parse valid JSONL content', () => {
      const jsonl = `{"word":"test","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["A trial"]}]}
{"word":"example","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["A sample"]}]}`;

      const entries = parseJsonl(jsonl);

      expect(entries).toHaveLength(2);
      expect(entries[0].word).toBe('test');
      expect(entries[1].word).toBe('example');
    });

    it('should handle limit parameter', () => {
      const jsonl = `{"word":"a","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["A"]}]}
{"word":"b","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["B"]}]}
{"word":"c","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["C"]}]}`;

      const entries = parseJsonl(jsonl, 2);

      expect(entries).toHaveLength(2);
    });

    it('should skip malformed lines', () => {
      const jsonl = `{"word":"valid","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["Valid"]}]}
{invalid json
{"word":"also_valid","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["Also valid"]}]}`;

      const entries = parseJsonl(jsonl);

      expect(entries).toHaveLength(2);
    });

    it('should handle empty content', () => {
      const entries = parseJsonl('');
      expect(entries).toEqual([]);
    });

    it('should handle content with blank lines', () => {
      const jsonl = `{"word":"a","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["A"]}]}

{"word":"b","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["B"]}]}

`;

      const entries = parseJsonl(jsonl);
      expect(entries).toHaveLength(2);
    });
  });

  describe('parseJsonlStream', () => {
    it('should parse stream of JSONL lines', async () => {
      async function* lines(): AsyncGenerator<string> {
        yield '{"word":"a","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["A"]}]}';
        yield '{"word":"b","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["B"]}]}';
      }

      const entries: WiktionaryEntry[] = [];
      for await (const entry of parseJsonlStream(lines())) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);
      expect(entries[0].word).toBe('a');
      expect(entries[1].word).toBe('b');
    });

    it('should skip malformed lines in stream', async () => {
      async function* lines(): AsyncGenerator<string> {
        yield '{"word":"valid","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["Valid"]}]}';
        yield '{invalid}';
        yield '{"word":"also_valid","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["Also valid"]}]}';
      }

      const entries: WiktionaryEntry[] = [];
      for await (const entry of parseJsonlStream(lines())) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);
    });

    it('should skip empty lines in stream', async () => {
      async function* lines(): AsyncGenerator<string> {
        yield '{"word":"a","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["A"]}]}';
        yield '';
        yield '   ';
        yield '{"word":"b","lang":"English","lang_code":"en","pos":"noun","senses":[{"glosses":["B"]}]}';
      }

      const entries: WiktionaryEntry[] = [];
      for await (const entry of parseJsonlStream(lines())) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Memory Estimation Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Memory estimates', () => {
    it('should estimate memory usage', () => {
      const memoryBytes = estimateWiktionaryMemory(1000);
      expect(memoryBytes).toBeGreaterThan(0);
    });

    it('should estimate JSON size', () => {
      const jsonBytes = estimateWiktionaryJson(1000);
      expect(jsonBytes).toBeGreaterThan(0);
    });

    it('should scale linearly', () => {
      const mem1k = estimateWiktionaryMemory(1000);
      const mem10k = estimateWiktionaryMemory(10000);
      expect(mem10k).toBe(mem1k * 10);
    });
  });
});

// ============================================================================
// IMDB Loader Tests
// ============================================================================

import {
  generateMovies,
  generateImdbDataset,
  generateMoviesIterator,
  estimateMovieMemoryUsage,
  estimateMovieJsonSize,
} from '../imdb/loader.js';

import {
  calculateRatingTier,
  calculateWeightedScore,
  calculateRuntimeTier,
  calculateDecadeInfo,
  generateSearchText,
} from '../imdb/denormalized.js';

import { IMDB_DATA_SIZES } from '../imdb/schema.js';

import type { DenormalizedMovie } from '../imdb/denormalized.js';

describe('IMDB Loader', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Movie Generation Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('generateMovies', () => {
    it('should generate the requested number of movies', () => {
      const movies = generateMovies(50);
      expect(movies).toHaveLength(50);
    });

    it('should generate valid movie structure', () => {
      const movies = generateMovies(10);

      for (const movie of movies) {
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

        for (const member of movie.cast) {
          expect(member.id).toMatch(/^nm\d{7}$/);
          expect(member.name).toBeDefined();
          expect(['actor', 'actress']).toContain(member.category);
          expect(Array.isArray(member.characters)).toBe(true);
        }

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
        expect(movie.castSize).toBe(movie.cast.length);
        expect(movie.crewSize).toBe(movie.crew.length);
        expect(movie.totalPeople).toBe(movie.castSize + movie.crewSize);
        expect(movie.castNames.length).toBe(movie.cast.length);

        const directorCount = movie.crew.filter(c => c.category === 'director').length;
        expect(movie.directors.length).toBe(directorCount);
      }
    });

    it('should always have at least one director', () => {
      const movies = generateMovies(100);

      for (const movie of movies) {
        expect(movie.directors.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should generate valid title types', () => {
      const validTypes = ['movie', 'tvMovie', 'short', 'video', 'tvMiniSeries'];
      const movies = generateMovies(100);

      for (const movie of movies) {
        expect(validTypes).toContain(movie.type);
      }
    });

    it('should generate search text correctly', () => {
      const movies = generateMovies(50);

      for (const movie of movies) {
        expect(movie.searchText).toBeDefined();
        expect(movie.searchText.toLowerCase()).toContain(movie.title.toLowerCase());

        for (const director of movie.directors) {
          expect(movie.searchText.toLowerCase()).toContain(director.toLowerCase());
        }
      }
    });

    it('should generate valid genres', () => {
      const validGenres = [
        'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
        'Documentary', 'Drama', 'Family', 'Fantasy', 'Film-Noir', 'History',
        'Horror', 'Music', 'Musical', 'Mystery', 'Romance', 'Sci-Fi',
        'Sport', 'Thriller', 'War', 'Western',
      ];
      const movies = generateMovies(100);

      for (const movie of movies) {
        expect(movie.genres.length).toBeGreaterThan(0);
        expect(movie.genres.length).toBeLessThanOrEqual(3);

        for (const genre of movie.genres) {
          expect(validGenres).toContain(genre);
        }
      }
    });
  });

  describe('generateImdbDataset', () => {
    it('should generate tiny dataset', () => {
      const movies = generateImdbDataset('tiny');
      expect(movies).toHaveLength(IMDB_DATA_SIZES.tiny);
    });

    it('should respect size presets', () => {
      const movies = generateImdbDataset('tiny');
      expect(movies).toHaveLength(IMDB_DATA_SIZES.tiny);
    });
  });

  describe('generateMoviesIterator', () => {
    it('should generate movies in batches', async () => {
      const batches: DenormalizedMovie[][] = [];

      for await (const batch of generateMoviesIterator(75, 30)) {
        batches.push(batch);
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(30);
      expect(batches[1]).toHaveLength(30);
      expect(batches[2]).toHaveLength(15);

      const total = batches.reduce((sum, b) => sum + b.length, 0);
      expect(total).toBe(75);
    });

    it('should be reproducible with seed', async () => {
      const batches1: DenormalizedMovie[][] = [];
      const batches2: DenormalizedMovie[][] = [];

      for await (const batch of generateMoviesIterator(50, 25, { seed: 42 })) {
        batches1.push(batch);
      }

      for await (const batch of generateMoviesIterator(50, 25, { seed: 42 })) {
        batches2.push(batch);
      }

      expect(batches1).toEqual(batches2);
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

      it('should handle edge cases', () => {
        expect(calculateRatingTier(10.0)).toBe('excellent');
        expect(calculateRatingTier(1.0)).toBe('low');
        expect(calculateRatingTier(0)).toBe('low');
      });
    });

    describe('calculateWeightedScore', () => {
      it('should calculate weighted scores correctly', () => {
        expect(calculateWeightedScore(8.0, 10000)).toBeCloseTo(8.0 * 4, 2);
        expect(calculateWeightedScore(7.0, 1000)).toBeCloseTo(7.0 * 3, 2);
        expect(calculateWeightedScore(5.0, 0)).toBe(0);
      });

      it('should weight higher vote counts more', () => {
        const lowVotes = calculateWeightedScore(8.0, 100);
        const highVotes = calculateWeightedScore(8.0, 100000);
        expect(highVotes).toBeGreaterThan(lowVotes);
      });

      it('should handle very small vote counts', () => {
        // log10(1) = 0, so score with 1 vote is 0
        const scoreOneVote = calculateWeightedScore(8.0, 1);
        expect(scoreOneVote).toBe(0);

        // log10(10) = 1, so score with 10 votes is 8.0
        const scoreTenVotes = calculateWeightedScore(8.0, 10);
        expect(scoreTenVotes).toBe(8.0);
        expect(scoreTenVotes).toBeGreaterThan(scoreOneVote);
      });
    });

    describe('calculateRuntimeTier', () => {
      it('should categorize runtimes correctly', () => {
        expect(calculateRuntimeTier(null)).toBeNull();
        expect(calculateRuntimeTier(20)).toBe('short');
        expect(calculateRuntimeTier(39)).toBe('short');
        expect(calculateRuntimeTier(40)).toBe('medium');
        expect(calculateRuntimeTier(90)).toBe('medium');
        expect(calculateRuntimeTier(119)).toBe('medium');
        expect(calculateRuntimeTier(120)).toBe('long');
        expect(calculateRuntimeTier(150)).toBe('long');
        expect(calculateRuntimeTier(179)).toBe('long');
        expect(calculateRuntimeTier(180)).toBe('epic');
        expect(calculateRuntimeTier(200)).toBe('epic');
      });
    });

    describe('calculateDecadeInfo', () => {
      it('should calculate decade info correctly', () => {
        expect(calculateDecadeInfo(null)).toBeNull();

        // 2015 is 'streaming' era (>= 2015)
        const d2015 = calculateDecadeInfo(2015);
        expect(d2015?.decade).toBe(2010);
        expect(d2015?.label).toBe('2010s');
        expect(d2015?.era).toBe('streaming');

        // 2014 is 'digital' era (2000-2014)
        const d2014 = calculateDecadeInfo(2014);
        expect(d2014?.decade).toBe(2010);
        expect(d2014?.era).toBe('digital');

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

      it('should handle early years', () => {
        const d1920 = calculateDecadeInfo(1925);
        expect(d1920?.decade).toBe(1920);
        expect(d1920?.label).toBe('1920s');
        expect(d1920?.era).toBe('silent');
      });
    });

    describe('generateSearchText', () => {
      it('should combine title, originalTitle, cast, and directors', () => {
        const searchText = generateSearchText(
          'The Movie',
          'Original Title',
          ['John Doe', 'Jane Smith'],
          ['Director One']
        );

        expect(searchText).toContain('the movie');
        expect(searchText).toContain('original title');
        expect(searchText).toContain('john doe');
        expect(searchText).toContain('jane smith');
        expect(searchText).toContain('director one');
      });

      it('should handle same title and originalTitle', () => {
        const searchText = generateSearchText(
          'The Movie',
          'The Movie',
          [],
          []
        );

        expect(searchText.toLowerCase()).toBe('the movie');
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
    });

    it('should estimate JSON size', () => {
      const tiny = estimateMovieJsonSize(100);
      const small = estimateMovieJsonSize(1000);

      expect(small).toBeGreaterThan(tiny);
      expect(tiny).toBeGreaterThan(0);
    });

    it('should scale linearly', () => {
      const mem1x = estimateMovieMemoryUsage(100);
      const mem10x = estimateMovieMemoryUsage(1000);
      expect(mem10x).toBe(mem1x * 10);
    });
  });
});

// ============================================================================
// Performance Characteristics Tests
// ============================================================================

describe('Performance Characteristics', () => {
  describe('Data Generation Performance', () => {
    it('should generate ONET data efficiently', async () => {
      const largeContent = Array.from({ length: 1000 }, (_, i) =>
        `${i}\tValue${i}\tDescription${i}`
      ).join('\n');
      const content = `Col1\tCol2\tCol3\n${largeContent}`;

      const start = performance.now();
      const result = parseTsv(content);
      const elapsed = performance.now() - start;

      expect(result).toHaveLength(1000);
      expect(elapsed).toBeLessThan(100);
    });

    it('should generate Wiktionary entries efficiently', () => {
      const start = performance.now();
      const entries = generateEntries(1000);
      const elapsed = performance.now() - start;

      expect(entries).toHaveLength(1000);
      expect(elapsed).toBeLessThan(1000);
    });

    it('should generate IMDB movies efficiently', () => {
      const start = performance.now();
      const movies = generateMovies(1000);
      const elapsed = performance.now() - start;

      expect(movies).toHaveLength(1000);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('Memory Estimation Accuracy', () => {
    it('should estimate Wiktionary memory within reasonable bounds', () => {
      const entries = generateEntries(100);
      const estimated = estimateWiktionaryMemory(100);

      const actualSize = JSON.stringify(entries).length;

      expect(estimated).toBeGreaterThan(actualSize * 0.5);
      expect(estimated).toBeLessThan(actualSize * 3);
    });

    it('should estimate IMDB memory within reasonable bounds', () => {
      const movies = generateMovies(100);
      const estimated = estimateMovieMemoryUsage(100);

      const actualSize = JSON.stringify(movies).length;

      expect(estimated).toBeGreaterThan(actualSize * 0.5);
      expect(estimated).toBeLessThan(actualSize * 3);
    });
  });

  describe('Reproducibility', () => {
    it('should produce identical results across multiple runs', () => {
      const seed = 42;

      const entries1 = generateEntries(50, { seed });
      const movies1 = generateMovies(50, { seed });

      const entries2 = generateEntries(50, { seed });
      const movies2 = generateMovies(50, { seed });

      expect(entries1).toEqual(entries2);
      expect(movies1).toEqual(movies2);
    });

    it('should produce different results with different seeds', () => {
      const entries1 = generateEntries(50, { seed: 1 });
      const entries2 = generateEntries(50, { seed: 2 });

      expect(entries1).not.toEqual(entries2);
    });
  });
});
