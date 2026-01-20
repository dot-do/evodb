/**
 * O*NET Denormalized Schema
 *
 * Flattened document structure optimized for columnar storage and queries.
 * Each occupation becomes a single document with all related data embedded.
 *
 * Denormalization Strategy:
 * - Occupation is the root document
 * - All competencies (skills, abilities, knowledge, etc.) are embedded arrays
 * - Statistical metadata preserved for each rating
 * - Enables efficient columnar shredding and analytics
 */

import type {
  OnetSocCode,
  ElementId,
  TaskType,
  JobZone,
  RiasecType,
  WorkValueType,
  SkillCategory,
  AbilityCategory,
  AbilitySubcategory,
  KnowledgeCategory,
  WorkActivityType,
  WorkContextCategory,
  WorkStyleCategory,
  EducationLevel,
} from './schema.js';

// ============================================================================
// Embedded Rating Types (Simplified for denormalization)
// ============================================================================

/**
 * Simplified rating with importance and level scores
 * Most ONET data uses IM (importance) and LV (level) scales
 */
export interface EmbeddedRating {
  /** Element ID */
  id: ElementId;
  /** Element name */
  name: string;
  /** Importance score (0-5 scale, IM) */
  importance: number;
  /** Level score (0-7 scale, LV) */
  level: number;
  /** Standard error (averaged across scales) */
  standardError?: number;
  /** Not relevant flag */
  notRelevant?: boolean;
}

/**
 * Embedded skill with category
 */
export interface EmbeddedSkill extends EmbeddedRating {
  category?: SkillCategory;
}

/**
 * Embedded ability with category hierarchy
 */
export interface EmbeddedAbility extends EmbeddedRating {
  category?: AbilityCategory;
  subcategory?: AbilitySubcategory;
}

/**
 * Embedded knowledge domain
 */
export interface EmbeddedKnowledge extends EmbeddedRating {
  category?: KnowledgeCategory;
}

/**
 * Embedded work activity
 */
export interface EmbeddedWorkActivity extends EmbeddedRating {
  activityType?: WorkActivityType;
}

/**
 * Embedded work context item
 */
export interface EmbeddedWorkContext {
  id: ElementId;
  name: string;
  category?: WorkContextCategory;
  /** Context value (varies by element) */
  value: number;
  /** Frequency or percentage depending on scale */
  frequency?: number;
}

/**
 * Embedded work style
 */
export interface EmbeddedWorkStyle extends Omit<EmbeddedRating, 'notRelevant'> {
  styleCategory?: WorkStyleCategory;
}

/**
 * Embedded task
 */
export interface EmbeddedTask {
  id: number;
  description: string;
  type: TaskType;
  /** Importance rating (FT scale) */
  importance?: number;
  /** Frequency rating */
  frequency?: number;
  /** Relevance rating */
  relevance?: number;
}

/**
 * Embedded interest (RIASEC)
 */
export interface EmbeddedInterest {
  type: RiasecType;
  /** Occupational interest score */
  score: number;
  /** High-point indicator */
  isHighPoint: boolean;
}

/**
 * Embedded work value
 */
export interface EmbeddedWorkValue {
  type: WorkValueType;
  /** Extent score */
  extent: number;
  /** Achievement score */
  achievement?: number;
}

/**
 * Embedded education/experience requirement
 */
export interface EmbeddedEducation {
  /** Required education level */
  level: EducationLevel;
  /** Percentage of incumbents at this level */
  percentage: number;
}

/**
 * Embedded experience requirement
 */
export interface EmbeddedExperience {
  /** Experience category (e.g., "None", "Over 1 year") */
  category: string;
  /** Percentage of incumbents */
  percentage: number;
}

/**
 * Embedded technology skill
 */
export interface EmbeddedTechnology {
  /** Tool/software category */
  category: string;
  /** Specific examples */
  examples: string[];
  /** Hot technology flag */
  isHotTechnology: boolean;
}

// ============================================================================
// Denormalized Occupation Document
// ============================================================================

/**
 * Fully denormalized occupation document
 *
 * This is the root document type for columnar storage.
 * All related data is embedded, enabling:
 * - Single document per occupation
 * - Efficient columnar shredding
 * - Complex queries without JOINs
 * - Compression of repeated element names
 */
export interface DenormalizedOccupation {
  // --- Core Identity ---
  /** O*NET-SOC Code */
  code: OnetSocCode;
  /** Occupation title */
  title: string;
  /** Full description */
  description: string;

  // --- Classification ---
  /** Job Zone (1-5) */
  jobZone: JobZone;
  /** SOC major group (first 2 digits) */
  majorGroup: string;
  /** SOC minor group (first 4 digits) */
  minorGroup: string;
  /** Bright outlook flag */
  brightOutlook?: boolean;
  /** Green occupation flag */
  greenOccupation?: boolean;

  // --- Tasks ---
  /** Core and supplemental tasks */
  tasks: EmbeddedTask[];
  /** Number of core tasks */
  coreTaskCount: number;
  /** Number of supplemental tasks */
  supplementalTaskCount: number;

  // --- Worker Characteristics ---
  /** Cognitive, psychomotor, physical, sensory abilities */
  abilities: EmbeddedAbility[];
  /** RIASEC interests */
  interests: EmbeddedInterest[];
  /** Work styles (personality traits) */
  workStyles: EmbeddedWorkStyle[];

  // --- Worker Requirements ---
  /** Basic and cross-functional skills */
  skills: EmbeddedSkill[];
  /** Knowledge domains */
  knowledge: EmbeddedKnowledge[];
  /** Education requirements distribution */
  education: EmbeddedEducation[];
  /** Experience requirements */
  experience: EmbeddedExperience[];

  // --- Occupational Requirements ---
  /** Generalized and detailed work activities */
  workActivities: EmbeddedWorkActivity[];
  /** Physical and social work context */
  workContext: EmbeddedWorkContext[];

  // --- Occupation-Specific ---
  /** Technology skills and tools */
  technologies: EmbeddedTechnology[];
  /** Work values */
  workValues: EmbeddedWorkValue[];

  // --- Metadata ---
  /** Alternate titles */
  alternateTitles: string[];
  /** Data version/date */
  dataDate: string;
  /** Last update timestamp */
  updatedAt: string;
}

// ============================================================================
// Aggregation Types
// ============================================================================

/**
 * Summary statistics for a competency across occupations
 */
export interface CompetencySummary {
  id: ElementId;
  name: string;
  /** Average importance across occupations */
  avgImportance: number;
  /** Average level across occupations */
  avgLevel: number;
  /** Min importance */
  minImportance: number;
  /** Max importance */
  maxImportance: number;
  /** Number of occupations with this competency rated */
  occupationCount: number;
}

/**
 * Job Zone summary
 */
export interface JobZoneSummary {
  jobZone: JobZone;
  /** Number of occupations in this zone */
  occupationCount: number;
  /** Average skill importance */
  avgSkillImportance: number;
  /** Average education level */
  avgEducationLevel: number;
  /** Most common skills */
  topSkills: Array<{ name: string; avgImportance: number }>;
  /** Most common abilities */
  topAbilities: Array<{ name: string; avgImportance: number }>;
}

/**
 * Occupation similarity based on competencies
 */
export interface OccupationSimilarity {
  sourceCode: OnetSocCode;
  targetCode: OnetSocCode;
  /** Overall similarity score (0-1) */
  overallSimilarity: number;
  /** Skills similarity */
  skillsSimilarity: number;
  /** Abilities similarity */
  abilitiesSimilarity: number;
  /** Knowledge similarity */
  knowledgeSimilarity: number;
  /** Common top skills */
  sharedTopSkills: string[];
}

// ============================================================================
// Benchmark Data Types
// ============================================================================

/**
 * Data size presets for ONET benchmarking
 */
export type OnetDataSize = 'micro' | 'sample' | 'full';

/**
 * Size configurations (occupation counts)
 */
export const ONET_DATA_SIZES: Record<OnetDataSize, number> = {
  micro: 50,       // 50 occupations - unit tests
  sample: 200,     // 200 occupations - quick benchmarks
  full: 1016,      // All ~1016 occupations
} as const;

/**
 * Benchmark metrics for ONET data
 */
export interface OnetBenchmarkMetrics {
  /** Number of occupations */
  occupationCount: number;
  /** Total embedded items (tasks + skills + abilities + ...) */
  totalEmbeddedItems: number;
  /** Average items per occupation */
  avgItemsPerOccupation: number;
  /** JSON size in bytes */
  jsonSizeBytes: number;
  /** Shred time in ms */
  shredTimeMs: number;
  /** Number of columns generated */
  columnCount: number;
  /** Throughput (occupations/sec) */
  throughput: number;
  /** Compression ratio vs JSON */
  compressionRatio: number;
}

/**
 * Query benchmark result
 */
export interface OnetQueryBenchmark {
  /** Query name */
  queryName: string;
  /** Query description */
  description: string;
  /** Execution time in ms */
  executionTimeMs: number;
  /** Results count */
  resultCount: number;
  /** Columns accessed */
  columnsAccessed: string[];
}

// ============================================================================
// Column Path Constants
// ============================================================================

/**
 * Well-known column paths for ONET denormalized documents
 * Useful for selective column reading and query optimization
 */
export const ONET_COLUMN_PATHS = {
  // Core identity
  CODE: 'code',
  TITLE: 'title',
  DESCRIPTION: 'description',
  JOB_ZONE: 'jobZone',
  MAJOR_GROUP: 'majorGroup',

  // Arrays (will be shredded to nested paths)
  SKILLS: 'skills',
  SKILLS_NAME: 'skills.name',
  SKILLS_IMPORTANCE: 'skills.importance',
  SKILLS_LEVEL: 'skills.level',

  ABILITIES: 'abilities',
  ABILITIES_NAME: 'abilities.name',
  ABILITIES_IMPORTANCE: 'abilities.importance',
  ABILITIES_CATEGORY: 'abilities.category',

  KNOWLEDGE: 'knowledge',
  KNOWLEDGE_NAME: 'knowledge.name',
  KNOWLEDGE_IMPORTANCE: 'knowledge.importance',

  TASKS: 'tasks',
  TASKS_DESCRIPTION: 'tasks.description',
  TASKS_TYPE: 'tasks.type',
  TASKS_IMPORTANCE: 'tasks.importance',

  WORK_ACTIVITIES: 'workActivities',
  WORK_CONTEXT: 'workContext',
  WORK_STYLES: 'workStyles',

  INTERESTS: 'interests',
  INTERESTS_TYPE: 'interests.type',
  INTERESTS_SCORE: 'interests.score',

  EDUCATION: 'education',
  TECHNOLOGIES: 'technologies',
} as const;

/**
 * Query patterns for benchmarking
 */
export const ONET_QUERY_PATTERNS = {
  // Point lookups
  FIND_BY_CODE: 'Find occupation by O*NET-SOC code',
  FIND_BY_TITLE: 'Find occupation by title (exact match)',

  // Range scans
  FILTER_BY_JOB_ZONE: 'Filter occupations by job zone range',
  FILTER_BY_SKILL_IMPORTANCE: 'Find occupations requiring skill X with importance > Y',

  // Aggregations
  AVG_ABILITIES_BY_JOB_ZONE: 'Average ability scores grouped by job zone',
  TOP_SKILLS_BY_MAJOR_GROUP: 'Top 10 skills for each major occupation group',
  COUNT_BY_EDUCATION_LEVEL: 'Count occupations by required education level',

  // Full-text / substring
  SEARCH_TASK_DESCRIPTIONS: 'Search task descriptions for keyword',
  SEARCH_TITLES: 'Search occupation titles containing term',

  // Complex joins (simulated)
  SIMILAR_OCCUPATIONS: 'Find occupations similar by skills/abilities',
  CAREER_PATHWAYS: 'Find career progression paths by job zone',
} as const;
