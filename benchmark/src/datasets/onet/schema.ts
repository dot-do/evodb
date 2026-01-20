/**
 * O*NET Database Schema Types
 *
 * TypeScript types representing the O*NET occupational database structure.
 * Based on O*NET 28.0 Data Dictionary specifications.
 *
 * @see https://www.onetcenter.org/dictionary/28.0/excel/
 */

// ============================================================================
// Core Identifiers
// ============================================================================

/**
 * O*NET-SOC Code format: XX-XXXX.XX
 * Example: "11-1011.00" for Chief Executives
 */
export type OnetSocCode = string;

/**
 * Element ID for competencies (e.g., "1.A.1.a.1" for Oral Comprehension)
 */
export type ElementId = string;

/**
 * Scale ID for measurement scales
 */
export type ScaleId = 'IM' | 'LV' | 'OI' | 'IH' | 'CT' | 'CTP' | 'CXP' | 'PT' | 'RW' | 'DW';

// ============================================================================
// Occupation Data
// ============================================================================

/**
 * Core occupation information
 * Source: Occupation Data.xlsx
 */
export interface Occupation {
  /** O*NET-SOC Code (e.g., "11-1011.00") */
  onetSocCode: OnetSocCode;
  /** Occupation title */
  title: string;
  /** Full occupation description */
  description: string;
}

// ============================================================================
// Task Data
// ============================================================================

/** Task type discriminator */
export type TaskType = 'Core' | 'Supplemental';

/**
 * Task statement for an occupation
 * Source: Task Statements.xlsx
 */
export interface Task {
  /** Unique task identifier */
  taskId: number;
  /** Task description text */
  task: string;
  /** Core or Supplemental task type */
  taskType: TaskType;
  /** Number of incumbents responding */
  incumbentsResponding?: number;
  /** Data update date (YYYY-MM format) */
  date: string;
  /** Domain source identifier */
  domainSource: string;
}

/**
 * Task rating scales and values
 * Source: Task Ratings.xlsx
 */
export interface TaskRating {
  /** Task identifier */
  taskId: number;
  /** Scale identifier */
  scaleId: ScaleId;
  /** Scale name */
  scaleName: string;
  /** Category (for categorical scales) */
  category?: number;
  /** Data value */
  dataValue: number;
  /** Sample size */
  n?: number;
  /** Standard error */
  standardError?: number;
  /** Lower confidence interval bound */
  lowerCiBound?: number;
  /** Upper confidence interval bound */
  upperCiBound?: number;
  /** Recommend suppression flag */
  recommendSuppress: boolean;
  /** Not relevant flag */
  notRelevant: boolean;
  /** Data update date */
  date: string;
  /** Domain source */
  domainSource: string;
}

// ============================================================================
// Competency Rating (shared structure for Skills, Abilities, Knowledge)
// ============================================================================

/**
 * Base competency rating structure
 * Used by Skills, Abilities, Knowledge, Work Activities, Work Styles
 */
export interface CompetencyRating {
  /** Element identifier (e.g., "1.A.1.a.1") */
  elementId: ElementId;
  /** Element name (e.g., "Oral Comprehension") */
  elementName: string;
  /** Scale identifier */
  scaleId: ScaleId;
  /** Scale name */
  scaleName: string;
  /** Data value (typically 0-7 scale) */
  dataValue: number;
  /** Sample size */
  n?: number;
  /** Standard error */
  standardError?: number;
  /** Lower confidence interval bound */
  lowerCiBound?: number;
  /** Upper confidence interval bound */
  upperCiBound?: number;
  /** Recommend suppression flag */
  recommendSuppress: boolean;
  /** Not relevant flag */
  notRelevant?: boolean;
  /** Data update date */
  date: string;
  /** Domain source */
  domainSource: string;
}

// ============================================================================
// Skills
// ============================================================================

/**
 * Skill categories
 */
export type SkillCategory =
  | 'Basic Skills'
  | 'Complex Problem Solving Skills'
  | 'Resource Management Skills'
  | 'Social Skills'
  | 'Systems Skills'
  | 'Technical Skills';

/**
 * Skill rating for an occupation
 * Source: Skills.xlsx
 */
export interface Skill extends CompetencyRating {
  /** Skill category */
  category?: SkillCategory;
}

// ============================================================================
// Abilities
// ============================================================================

/**
 * Ability categories
 */
export type AbilityCategory =
  | 'Cognitive Abilities'
  | 'Psychomotor Abilities'
  | 'Physical Abilities'
  | 'Sensory Abilities';

/**
 * Ability subcategories
 */
export type AbilitySubcategory =
  // Cognitive
  | 'Verbal Abilities'
  | 'Idea Generation and Reasoning Abilities'
  | 'Quantitative Abilities'
  | 'Memory'
  | 'Perceptual Abilities'
  | 'Spatial Abilities'
  | 'Attentiveness'
  // Psychomotor
  | 'Fine Manipulative Abilities'
  | 'Control Movement Abilities'
  | 'Reaction Time and Speed Abilities'
  // Physical
  | 'Physical Strength Abilities'
  | 'Endurance'
  | 'Flexibility, Balance, and Coordination'
  // Sensory
  | 'Visual Abilities'
  | 'Auditory and Speech Abilities';

/**
 * Ability rating for an occupation
 * Source: Abilities.xlsx
 */
export interface Ability extends CompetencyRating {
  /** Ability category */
  category?: AbilityCategory;
  /** Ability subcategory */
  subcategory?: AbilitySubcategory;
}

// ============================================================================
// Knowledge
// ============================================================================

/**
 * Knowledge domain categories
 */
export type KnowledgeCategory =
  | 'Business and Management'
  | 'Manufacturing and Production'
  | 'Engineering and Technology'
  | 'Mathematics and Science'
  | 'Health Services'
  | 'Education and Training'
  | 'Arts and Humanities'
  | 'Law and Public Safety'
  | 'Communications'
  | 'Transportation';

/**
 * Knowledge rating for an occupation
 * Source: Knowledge.xlsx
 */
export interface Knowledge extends CompetencyRating {
  /** Knowledge category */
  category?: KnowledgeCategory;
}

// ============================================================================
// Work Activities
// ============================================================================

/**
 * Work activity types
 */
export type WorkActivityType = 'Generalized Work Activity' | 'Intermediate Work Activity' | 'Detailed Work Activity';

/**
 * Work activity rating
 * Source: Work Activities.xlsx
 */
export interface WorkActivity extends CompetencyRating {
  /** Activity type (GWA, IWA, DWA) */
  activityType?: WorkActivityType;
}

// ============================================================================
// Work Context
// ============================================================================

/**
 * Work context categories
 */
export type WorkContextCategory =
  | 'Interpersonal Relationships'
  | 'Physical Work Conditions'
  | 'Structural Job Characteristics';

/**
 * Work context rating
 * Source: Work Context.xlsx
 */
export interface WorkContext extends CompetencyRating {
  /** Category for categorical scales */
  categoryValue?: number;
  /** Context category */
  contextCategory?: WorkContextCategory;
}

// ============================================================================
// Work Styles
// ============================================================================

/**
 * Work style categories
 */
export type WorkStyleCategory =
  | 'Achievement Orientation'
  | 'Social Influence'
  | 'Interpersonal Orientation'
  | 'Adjustment'
  | 'Conscientiousness'
  | 'Independence'
  | 'Practical Intelligence';

/**
 * Work style rating (personality traits)
 * Source: Work Styles.xlsx
 */
export interface WorkStyle extends Omit<CompetencyRating, 'notRelevant'> {
  /** Work style category */
  styleCategory?: WorkStyleCategory;
}

// ============================================================================
// Job Zones & Education
// ============================================================================

/**
 * Job Zone levels (1-5)
 * 1 = Little or no preparation needed
 * 5 = Extensive preparation needed
 */
export type JobZone = 1 | 2 | 3 | 4 | 5;

/**
 * Job zone assignment for an occupation
 * Source: Job Zones.xlsx
 */
export interface JobZoneData {
  /** Job zone level (1-5) */
  jobZone: JobZone;
  /** Data update date */
  date: string;
  /** Domain source */
  domainSource: string;
}

/**
 * Education level categories
 */
export type EducationLevel =
  | 'Less than a High School Diploma'
  | 'High School Diploma or Equivalent'
  | 'Post-Secondary Certificate'
  | 'Some College Courses'
  | "Associate's Degree"
  | "Bachelor's Degree"
  | 'Post-Baccalaureate Certificate'
  | "Master's Degree"
  | 'Post-Master\'s Certificate'
  | 'First Professional Degree'
  | 'Doctoral Degree'
  | 'Post-Doctoral Training';

/**
 * Education, training, and experience data
 * Source: Education, Training, and Experience.xlsx
 */
export interface EducationTrainingExperience extends CompetencyRating {
  /** Category for categorical scales */
  categoryValue?: number;
}

// ============================================================================
// Interests (RIASEC Model)
// ============================================================================

/**
 * Holland RIASEC interest types
 */
export type RiasecType = 'Realistic' | 'Investigative' | 'Artistic' | 'Social' | 'Enterprising' | 'Conventional';

/**
 * Interest rating
 * Source: Interests.xlsx
 */
export interface Interest {
  /** Element identifier */
  elementId: ElementId;
  /** Element name (RIASEC type) */
  elementName: RiasecType;
  /** Scale identifier */
  scaleId: ScaleId;
  /** Scale name */
  scaleName: string;
  /** Data value */
  dataValue: number;
  /** Data update date */
  date: string;
  /** Domain source */
  domainSource: string;
}

// ============================================================================
// Work Values
// ============================================================================

/**
 * Work value types
 */
export type WorkValueType =
  | 'Achievement'
  | 'Working Conditions'
  | 'Recognition'
  | 'Relationships'
  | 'Support'
  | 'Independence';

/**
 * Work value rating
 * Source: Work Values.xlsx
 */
export interface WorkValue {
  /** Element identifier */
  elementId: ElementId;
  /** Element name */
  elementName: WorkValueType;
  /** Scale identifier */
  scaleId: ScaleId;
  /** Scale name */
  scaleName: string;
  /** Data value */
  dataValue: number;
  /** Data update date */
  date: string;
  /** Domain source */
  domainSource: string;
}

// ============================================================================
// Technology Skills
// ============================================================================

/**
 * Technology skill/tool association
 * Source: Technology Skills.xlsx
 */
export interface TechnologySkill {
  /** Commodity code */
  commodityCode?: number;
  /** Commodity title */
  commodityTitle?: string;
  /** Example tool/software */
  example?: string;
  /** Hot technology flag */
  hotTechnology: boolean;
}

// ============================================================================
// Alternate Titles
// ============================================================================

/**
 * Alternate occupation title
 * Source: Alternate Titles.xlsx
 */
export interface AlternateTitle {
  /** Alternate title text */
  alternateTitle: string;
  /** Short title variant */
  shortTitle?: string;
  /** Data source */
  source: string;
}

// ============================================================================
// Related Occupations
// ============================================================================

/**
 * Related occupation association
 * Source: Related Occupations.xlsx
 */
export interface RelatedOccupation {
  /** Related O*NET-SOC Code */
  relatedOnetSocCode: OnetSocCode;
  /** Related occupation title */
  relatedTitle: string;
  /** Relatedness type (e.g., career pathway) */
  relatednessType?: string;
}

// ============================================================================
// Raw ONET Table Types (for loader)
// ============================================================================

/**
 * Raw occupation data row from CSV/Excel
 */
export interface RawOccupationData {
  'O*NET-SOC Code': string;
  'Title': string;
  'Description': string;
}

/**
 * Raw task statement row
 */
export interface RawTaskStatement {
  'O*NET-SOC Code': string;
  'Title': string;
  'Task ID': string;
  'Task': string;
  'Task Type': string;
  'Incumbents Responding'?: string;
  'Date': string;
  'Domain Source': string;
}

/**
 * Raw competency rating row (shared structure)
 */
export interface RawCompetencyRating {
  'O*NET-SOC Code': string;
  'Title': string;
  'Element ID': string;
  'Element Name': string;
  'Scale ID': string;
  'Scale Name': string;
  'Data Value': string;
  'N'?: string;
  'Standard Error'?: string;
  'Lower CI Bound'?: string;
  'Upper CI Bound'?: string;
  'Recommend Suppress': string;
  'Not Relevant'?: string;
  'Date': string;
  'Domain Source': string;
}

/**
 * Raw work context row (with category)
 */
export interface RawWorkContext extends RawCompetencyRating {
  'Category'?: string;
}

/**
 * Raw job zone row
 */
export interface RawJobZone {
  'O*NET-SOC Code': string;
  'Title': string;
  'Job Zone': string;
  'Date': string;
  'Domain Source': string;
}
