/**
 * O*NET Data Loader
 *
 * Utilities for loading O*NET data from official sources.
 * Supports loading from CSV/TSV files downloaded from onetcenter.org.
 *
 * Note: Real ONET data requires downloading from the official source.
 * For benchmarking without downloading, use the generator module.
 */

import type {
  OnetSocCode,
  Occupation,
  Task,
  Skill,
  Ability,
  Knowledge,
  WorkActivity,
  WorkContext,
  WorkStyle,
  JobZoneData,
  Interest,
  EducationTrainingExperience,
  RawOccupationData,
  RawTaskStatement,
  RawCompetencyRating,
  RawWorkContext,
  RawJobZone,
} from './schema.js';

import type {
  DenormalizedOccupation,
  EmbeddedSkill,
  EmbeddedAbility,
  EmbeddedKnowledge,
  EmbeddedTask,
  EmbeddedWorkActivity,
  EmbeddedWorkContext,
  EmbeddedWorkStyle,
  EmbeddedInterest,
  EmbeddedEducation,
  EmbeddedWorkValue,
} from './denormalized-schema.js';

// ============================================================================
// ONET Download URLs
// ============================================================================

/**
 * Base URL for ONET database downloads
 */
export const ONET_BASE_URL = 'https://www.onetcenter.org/dl_files/database/';

/**
 * Available ONET database files
 */
export const ONET_FILES = {
  OCCUPATION_DATA: 'Occupation Data.txt',
  TASK_STATEMENTS: 'Task Statements.txt',
  TASK_RATINGS: 'Task Ratings.txt',
  SKILLS: 'Skills.txt',
  ABILITIES: 'Abilities.txt',
  KNOWLEDGE: 'Knowledge.txt',
  WORK_ACTIVITIES: 'Work Activities.txt',
  WORK_CONTEXT: 'Work Context.txt',
  WORK_STYLES: 'Work Styles.txt',
  JOB_ZONES: 'Job Zones.txt',
  INTERESTS: 'Interests.txt',
  WORK_VALUES: 'Work Values.txt',
  EDUCATION_TRAINING_EXPERIENCE: 'Education, Training, and Experience.txt',
  ALTERNATE_TITLES: 'Alternate Titles.txt',
  TECHNOLOGY_SKILLS: 'Technology Skills.txt',
} as const;

/**
 * ONET database version
 */
export const ONET_VERSION = '28.0';

// ============================================================================
// CSV/TSV Parsing
// ============================================================================

/**
 * Parse a tab-separated value string into records
 */
export function parseTsv<T extends Record<string, string>>(content: string): T[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split('\t').map(h => h.trim());
  const records: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const record: Record<string, string> = {};

    headers.forEach((header, j) => {
      record[header] = values[j]?.trim() ?? '';
    });

    records.push(record as T);
  }

  return records;
}

/**
 * Group records by O*NET-SOC Code
 */
export function groupByOnetCode<T extends { 'O*NET-SOC Code': string }>(
  records: T[]
): Map<OnetSocCode, T[]> {
  const grouped = new Map<OnetSocCode, T[]>();

  for (const record of records) {
    const code = record['O*NET-SOC Code'];
    if (!grouped.has(code)) {
      grouped.set(code, []);
    }
    const group = grouped.get(code);
    if (group) {
      group.push(record);
    }
  }

  return grouped;
}

// ============================================================================
// Data Transformation
// ============================================================================

/**
 * Parse a raw occupation data record
 */
export function parseOccupation(raw: RawOccupationData): Occupation {
  return {
    onetSocCode: raw['O*NET-SOC Code'],
    title: raw['Title'],
    description: raw['Description'],
  };
}

/**
 * Parse a raw task statement record
 */
export function parseTask(raw: RawTaskStatement): Task {
  return {
    taskId: parseInt(raw['Task ID'], 10),
    task: raw['Task'],
    taskType: raw['Task Type'] as 'Core' | 'Supplemental',
    incumbentsResponding: raw['Incumbents Responding'] ? parseInt(raw['Incumbents Responding'], 10) : undefined,
    date: raw['Date'],
    domainSource: raw['Domain Source'],
  };
}

/**
 * Parse a raw competency rating (generic for skills, abilities, knowledge)
 */
export function parseCompetencyRating(raw: RawCompetencyRating): {
  elementId: string;
  elementName: string;
  scaleId: string;
  scaleName: string;
  dataValue: number;
  n?: number;
  standardError?: number;
  lowerCiBound?: number;
  upperCiBound?: number;
  recommendSuppress: boolean;
  notRelevant?: boolean;
  date: string;
  domainSource: string;
} {
  return {
    elementId: raw['Element ID'],
    elementName: raw['Element Name'],
    scaleId: raw['Scale ID'],
    scaleName: raw['Scale Name'],
    dataValue: parseFloat(raw['Data Value']),
    n: raw['N'] ? parseInt(raw['N'], 10) : undefined,
    standardError: raw['Standard Error'] ? parseFloat(raw['Standard Error']) : undefined,
    lowerCiBound: raw['Lower CI Bound'] ? parseFloat(raw['Lower CI Bound']) : undefined,
    upperCiBound: raw['Upper CI Bound'] ? parseFloat(raw['Upper CI Bound']) : undefined,
    recommendSuppress: raw['Recommend Suppress'] === 'Y',
    notRelevant: raw['Not Relevant'] ? raw['Not Relevant'] === 'Y' : undefined,
    date: raw['Date'],
    domainSource: raw['Domain Source'],
  };
}

/**
 * Parse job zone record
 */
export function parseJobZone(raw: RawJobZone): JobZoneData {
  return {
    jobZone: parseInt(raw['Job Zone'], 10) as 1 | 2 | 3 | 4 | 5,
    date: raw['Date'],
    domainSource: raw['Domain Source'],
  };
}

// ============================================================================
// Denormalization
// ============================================================================

/**
 * Convert skills ratings grouped by element to embedded format
 * Combines IM (importance) and LV (level) scales
 */
function denormalizeSkills(ratings: RawCompetencyRating[]): EmbeddedSkill[] {
  const byElement = new Map<string, RawCompetencyRating[]>();

  for (const rating of ratings) {
    const key = rating['Element ID'];
    if (!byElement.has(key)) {
      byElement.set(key, []);
    }
    const group = byElement.get(key);
    if (group) {
      group.push(rating);
    }
  }

  const skills: EmbeddedSkill[] = [];

  for (const [elementId, elementRatings] of byElement) {
    const imRating = elementRatings.find(r => r['Scale ID'] === 'IM');
    const lvRating = elementRatings.find(r => r['Scale ID'] === 'LV');

    if (imRating) {
      const parsed = parseCompetencyRating(imRating);
      skills.push({
        id: elementId,
        name: parsed.elementName,
        importance: parsed.dataValue,
        level: lvRating ? parseFloat(lvRating['Data Value']) : 0,
        standardError: parsed.standardError,
        notRelevant: parsed.notRelevant,
      });
    }
  }

  return skills;
}

/**
 * Convert abilities ratings to embedded format
 */
function denormalizeAbilities(ratings: RawCompetencyRating[]): EmbeddedAbility[] {
  const byElement = new Map<string, RawCompetencyRating[]>();

  for (const rating of ratings) {
    const key = rating['Element ID'];
    if (!byElement.has(key)) {
      byElement.set(key, []);
    }
    const group = byElement.get(key);
    if (group) {
      group.push(rating);
    }
  }

  const abilities: EmbeddedAbility[] = [];

  for (const [elementId, elementRatings] of byElement) {
    const imRating = elementRatings.find(r => r['Scale ID'] === 'IM');
    const lvRating = elementRatings.find(r => r['Scale ID'] === 'LV');

    if (imRating) {
      const parsed = parseCompetencyRating(imRating);
      abilities.push({
        id: elementId,
        name: parsed.elementName,
        importance: parsed.dataValue,
        level: lvRating ? parseFloat(lvRating['Data Value']) : 0,
        standardError: parsed.standardError,
        notRelevant: parsed.notRelevant,
      });
    }
  }

  return abilities;
}

/**
 * Convert knowledge ratings to embedded format
 */
function denormalizeKnowledge(ratings: RawCompetencyRating[]): EmbeddedKnowledge[] {
  const byElement = new Map<string, RawCompetencyRating[]>();

  for (const rating of ratings) {
    const key = rating['Element ID'];
    if (!byElement.has(key)) {
      byElement.set(key, []);
    }
    const group = byElement.get(key);
    if (group) {
      group.push(rating);
    }
  }

  const knowledge: EmbeddedKnowledge[] = [];

  for (const [elementId, elementRatings] of byElement) {
    const imRating = elementRatings.find(r => r['Scale ID'] === 'IM');
    const lvRating = elementRatings.find(r => r['Scale ID'] === 'LV');

    if (imRating) {
      const parsed = parseCompetencyRating(imRating);
      knowledge.push({
        id: elementId,
        name: parsed.elementName,
        importance: parsed.dataValue,
        level: lvRating ? parseFloat(lvRating['Data Value']) : 0,
        standardError: parsed.standardError,
        notRelevant: parsed.notRelevant,
      });
    }
  }

  return knowledge;
}

/**
 * Convert work activities to embedded format
 */
function denormalizeWorkActivities(ratings: RawCompetencyRating[]): EmbeddedWorkActivity[] {
  const byElement = new Map<string, RawCompetencyRating[]>();

  for (const rating of ratings) {
    const key = rating['Element ID'];
    if (!byElement.has(key)) {
      byElement.set(key, []);
    }
    const group = byElement.get(key);
    if (group) {
      group.push(rating);
    }
  }

  const activities: EmbeddedWorkActivity[] = [];

  for (const [elementId, elementRatings] of byElement) {
    const imRating = elementRatings.find(r => r['Scale ID'] === 'IM');
    const lvRating = elementRatings.find(r => r['Scale ID'] === 'LV');

    if (imRating) {
      const parsed = parseCompetencyRating(imRating);
      activities.push({
        id: elementId,
        name: parsed.elementName,
        importance: parsed.dataValue,
        level: lvRating ? parseFloat(lvRating['Data Value']) : 0,
        standardError: parsed.standardError,
        notRelevant: parsed.notRelevant,
      });
    }
  }

  return activities;
}

/**
 * Convert work context to embedded format
 */
function denormalizeWorkContext(ratings: RawWorkContext[]): EmbeddedWorkContext[] {
  const byElement = new Map<string, RawWorkContext[]>();

  for (const rating of ratings) {
    const key = rating['Element ID'];
    if (!byElement.has(key)) {
      byElement.set(key, []);
    }
    const group = byElement.get(key);
    if (group) {
      group.push(rating);
    }
  }

  const contexts: EmbeddedWorkContext[] = [];

  for (const [elementId, elementRatings] of byElement) {
    // Take the first rating (CX scale typically)
    const first = elementRatings[0];
    if (first) {
      contexts.push({
        id: elementId,
        name: first['Element Name'],
        value: parseFloat(first['Data Value']),
        frequency: first['Category'] ? parseInt(first['Category'], 10) : undefined,
      });
    }
  }

  return contexts;
}

/**
 * Convert work styles to embedded format
 */
function denormalizeWorkStyles(ratings: RawCompetencyRating[]): EmbeddedWorkStyle[] {
  const byElement = new Map<string, RawCompetencyRating[]>();

  for (const rating of ratings) {
    const key = rating['Element ID'];
    if (!byElement.has(key)) {
      byElement.set(key, []);
    }
    const group = byElement.get(key);
    if (group) {
      group.push(rating);
    }
  }

  const styles: EmbeddedWorkStyle[] = [];

  for (const [elementId, elementRatings] of byElement) {
    const imRating = elementRatings.find(r => r['Scale ID'] === 'IM');

    if (imRating) {
      const parsed = parseCompetencyRating(imRating);
      styles.push({
        id: elementId,
        name: parsed.elementName,
        importance: parsed.dataValue,
        level: parsed.dataValue, // Work styles typically only have importance
        standardError: parsed.standardError,
      });
    }
  }

  return styles;
}

/**
 * Convert tasks to embedded format
 */
function denormalizeTasks(tasks: RawTaskStatement[]): EmbeddedTask[] {
  return tasks.map(task => ({
    id: parseInt(task['Task ID'], 10),
    description: task['Task'],
    type: task['Task Type'] as 'Core' | 'Supplemental',
  }));
}

/**
 * Convert interests to embedded format
 */
function denormalizeInterests(ratings: RawCompetencyRating[]): EmbeddedInterest[] {
  const byElement = new Map<string, RawCompetencyRating[]>();

  for (const rating of ratings) {
    const key = rating['Element ID'];
    if (!byElement.has(key)) {
      byElement.set(key, []);
    }
    const group = byElement.get(key);
    if (group) {
      group.push(rating);
    }
  }

  const interests: EmbeddedInterest[] = [];

  for (const [_elementId, elementRatings] of byElement) {
    const oiRating = elementRatings.find(r => r['Scale ID'] === 'OI');
    const ihRating = elementRatings.find(r => r['Scale ID'] === 'IH');

    if (oiRating) {
      interests.push({
        type: oiRating['Element Name'] as any,
        score: parseFloat(oiRating['Data Value']),
        isHighPoint: ihRating ? parseFloat(ihRating['Data Value']) > 0 : false,
      });
    }
  }

  return interests;
}

// ============================================================================
// Data Loading Options
// ============================================================================

/**
 * Options for loading ONET data
 */
export interface OnetLoadOptions {
  /** Base directory containing ONET files */
  dataDir: string;
  /** Whether to include tasks */
  includeTasks?: boolean;
  /** Whether to include skills */
  includeSkills?: boolean;
  /** Whether to include abilities */
  includeAbilities?: boolean;
  /** Whether to include knowledge */
  includeKnowledge?: boolean;
  /** Whether to include work activities */
  includeWorkActivities?: boolean;
  /** Whether to include work context */
  includeWorkContext?: boolean;
  /** Whether to include work styles */
  includeWorkStyles?: boolean;
  /** Whether to include interests */
  includeInterests?: boolean;
  /** Whether to include education/experience */
  includeEducation?: boolean;
  /** Filter to specific O*NET-SOC codes */
  filterCodes?: OnetSocCode[];
  /** Maximum occupations to load */
  limit?: number;
}

const DEFAULT_LOAD_OPTIONS: Omit<Required<OnetLoadOptions>, 'dataDir' | 'filterCodes'> & { filterCodes?: OnetSocCode[] } = {
  includeTasks: true,
  includeSkills: true,
  includeAbilities: true,
  includeKnowledge: true,
  includeWorkActivities: true,
  includeWorkContext: true,
  includeWorkStyles: true,
  includeInterests: true,
  includeEducation: true,
  filterCodes: undefined,
  limit: undefined,
};

// ============================================================================
// Main Loader Function
// ============================================================================

/**
 * Load and denormalize ONET data from files
 *
 * @param options Load options
 * @param readFile Function to read file contents (for platform independence)
 * @returns Array of denormalized occupation documents
 */
export async function loadOnetData(
  options: OnetLoadOptions,
  readFile: (path: string) => Promise<string>
): Promise<DenormalizedOccupation[]> {
  const opts = { ...DEFAULT_LOAD_OPTIONS, ...options };
  const { dataDir } = opts;

  // Load occupation base data
  const occupationContent = await readFile(`${dataDir}/${ONET_FILES.OCCUPATION_DATA}`);
  const rawOccupations = parseTsv<RawOccupationData>(occupationContent);

  // Load job zones
  const jobZoneContent = await readFile(`${dataDir}/${ONET_FILES.JOB_ZONES}`);
  const rawJobZones = parseTsv<RawJobZone>(jobZoneContent);
  const jobZonesByCode = new Map(rawJobZones.map(jz => [jz['O*NET-SOC Code'], parseJobZone(jz)]));

  // Load optional data
  let tasksByCode = new Map<OnetSocCode, RawTaskStatement[]>();
  let skillsByCode = new Map<OnetSocCode, RawCompetencyRating[]>();
  let abilitiesByCode = new Map<OnetSocCode, RawCompetencyRating[]>();
  let knowledgeByCode = new Map<OnetSocCode, RawCompetencyRating[]>();
  let workActivitiesByCode = new Map<OnetSocCode, RawCompetencyRating[]>();
  let workContextByCode = new Map<OnetSocCode, RawWorkContext[]>();
  let workStylesByCode = new Map<OnetSocCode, RawCompetencyRating[]>();
  let interestsByCode = new Map<OnetSocCode, RawCompetencyRating[]>();

  if (opts.includeTasks) {
    const content = await readFile(`${dataDir}/${ONET_FILES.TASK_STATEMENTS}`);
    tasksByCode = groupByOnetCode(parseTsv<RawTaskStatement>(content));
  }

  if (opts.includeSkills) {
    const content = await readFile(`${dataDir}/${ONET_FILES.SKILLS}`);
    skillsByCode = groupByOnetCode(parseTsv<RawCompetencyRating>(content));
  }

  if (opts.includeAbilities) {
    const content = await readFile(`${dataDir}/${ONET_FILES.ABILITIES}`);
    abilitiesByCode = groupByOnetCode(parseTsv<RawCompetencyRating>(content));
  }

  if (opts.includeKnowledge) {
    const content = await readFile(`${dataDir}/${ONET_FILES.KNOWLEDGE}`);
    knowledgeByCode = groupByOnetCode(parseTsv<RawCompetencyRating>(content));
  }

  if (opts.includeWorkActivities) {
    const content = await readFile(`${dataDir}/${ONET_FILES.WORK_ACTIVITIES}`);
    workActivitiesByCode = groupByOnetCode(parseTsv<RawCompetencyRating>(content));
  }

  if (opts.includeWorkContext) {
    const content = await readFile(`${dataDir}/${ONET_FILES.WORK_CONTEXT}`);
    workContextByCode = groupByOnetCode(parseTsv<RawWorkContext>(content));
  }

  if (opts.includeWorkStyles) {
    const content = await readFile(`${dataDir}/${ONET_FILES.WORK_STYLES}`);
    workStylesByCode = groupByOnetCode(parseTsv<RawCompetencyRating>(content));
  }

  if (opts.includeInterests) {
    const content = await readFile(`${dataDir}/${ONET_FILES.INTERESTS}`);
    interestsByCode = groupByOnetCode(parseTsv<RawCompetencyRating>(content));
  }

  // Filter and limit occupations
  let occupations = rawOccupations;
  if (opts.filterCodes) {
    const codeSet = new Set(opts.filterCodes);
    occupations = occupations.filter(o => codeSet.has(o['O*NET-SOC Code']));
  }
  if (opts.limit) {
    occupations = occupations.slice(0, opts.limit);
  }

  // Denormalize each occupation
  const denormalized: DenormalizedOccupation[] = [];

  for (const rawOccupation of occupations) {
    const code = rawOccupation['O*NET-SOC Code'];
    const jobZoneData = jobZonesByCode.get(code);

    const tasks = tasksByCode.get(code) ?? [];
    const embeddedTasks = denormalizeTasks(tasks);
    const coreTaskCount = embeddedTasks.filter(t => t.type === 'Core').length;

    denormalized.push({
      code,
      title: rawOccupation['Title'],
      description: rawOccupation['Description'],

      jobZone: jobZoneData?.jobZone ?? 3,
      majorGroup: code.substring(0, 2),
      minorGroup: code.substring(0, 7),

      tasks: embeddedTasks,
      coreTaskCount,
      supplementalTaskCount: embeddedTasks.length - coreTaskCount,

      abilities: denormalizeAbilities(abilitiesByCode.get(code) ?? []),
      interests: denormalizeInterests(interestsByCode.get(code) ?? []),
      workStyles: denormalizeWorkStyles(workStylesByCode.get(code) ?? []),

      skills: denormalizeSkills(skillsByCode.get(code) ?? []),
      knowledge: denormalizeKnowledge(knowledgeByCode.get(code) ?? []),
      education: [],
      experience: [],

      workActivities: denormalizeWorkActivities(workActivitiesByCode.get(code) ?? []),
      workContext: denormalizeWorkContext(workContextByCode.get(code) ?? []),

      technologies: [],
      workValues: [],

      alternateTitles: [],
      dataDate: jobZoneData?.date ?? '2024-01',
      updatedAt: new Date().toISOString(),
    });
  }

  return denormalized;
}

/**
 * Print download instructions for ONET data
 */
export function printOnetDownloadInstructions(): void {
  console.log(`
================================================================================
O*NET Database Download Instructions
================================================================================

To download the O*NET database for loading:

1. Visit: https://www.onetcenter.org/database.html

2. Download the "Database" package (Text format)
   - Current version: ${ONET_VERSION}
   - File: db_${ONET_VERSION.replace('.', '_')}_text.zip

3. Extract to your desired location

4. Use the loader with the extracted directory:

   import { loadOnetData } from '@evodb/benchmark/datasets/onet';

   const occupations = await loadOnetData(
     { dataDir: '/path/to/onet/db_${ONET_VERSION.replace('.', '_')}_text' },
     async (path) => fs.readFile(path, 'utf-8')
   );

================================================================================

For benchmarking without downloading, use the synthetic generator:

   import { generateOnetDataset } from '@evodb/benchmark/datasets/onet';

   const occupations = generateOnetDataset('sample'); // 200 occupations
   const fullSet = generateOnetDataset('full');       // ~1000 occupations

================================================================================
`);
}

/**
 * Get curl commands to download ONET data
 */
export function getOnetCurlCommands(): string[] {
  const baseUrl = `https://www.onetcenter.org/dl_files/database/db_${ONET_VERSION.replace('.', '_')}_text.zip`;
  return [
    `# Download O*NET ${ONET_VERSION} database`,
    `curl -O ${baseUrl}`,
    `unzip db_${ONET_VERSION.replace('.', '_')}_text.zip`,
  ];
}
