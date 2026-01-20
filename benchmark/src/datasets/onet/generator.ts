/**
 * O*NET Synthetic Data Generator
 *
 * Generates realistic synthetic ONET-like data for benchmarking.
 * Uses real ONET element names and realistic distributions.
 */

import type {
  OnetSocCode,
  JobZone,
  TaskType,
  RiasecType,
  WorkValueType,
  SkillCategory,
  AbilityCategory,
  AbilitySubcategory,
  KnowledgeCategory,
  WorkStyleCategory,
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
  EmbeddedWorkValue,
  EmbeddedEducation,
  EmbeddedTechnology,
  OnetDataSize,
} from './denormalized-schema.js';

import { ONET_DATA_SIZES } from './denormalized-schema.js';

// ============================================================================
// Seeded Random Number Generator
// ============================================================================

/**
 * Simple LCG random number generator for reproducibility
 */
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

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  pickN<T>(arr: readonly T[], n: number): T[] {
    const shuffled = [...arr].sort(() => this.next() - 0.5);
    return shuffled.slice(0, Math.min(n, arr.length));
  }

  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }

  // Generate value with normal-ish distribution (box-muller approximation)
  normal(mean: number, stdDev: number): number {
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }
}

// ============================================================================
// Reference Data - Real ONET Element Names
// ============================================================================

const SKILL_ELEMENTS: Array<{ id: string; name: string; category: SkillCategory }> = [
  // Basic Skills
  { id: '2.A.1.a', name: 'Reading Comprehension', category: 'Basic Skills' },
  { id: '2.A.1.b', name: 'Active Listening', category: 'Basic Skills' },
  { id: '2.A.1.c', name: 'Writing', category: 'Basic Skills' },
  { id: '2.A.1.d', name: 'Speaking', category: 'Basic Skills' },
  { id: '2.A.1.e', name: 'Mathematics', category: 'Basic Skills' },
  { id: '2.A.1.f', name: 'Science', category: 'Basic Skills' },
  // Complex Problem Solving
  { id: '2.A.2.a', name: 'Critical Thinking', category: 'Complex Problem Solving Skills' },
  { id: '2.A.2.b', name: 'Active Learning', category: 'Complex Problem Solving Skills' },
  { id: '2.A.2.c', name: 'Learning Strategies', category: 'Complex Problem Solving Skills' },
  { id: '2.A.2.d', name: 'Monitoring', category: 'Complex Problem Solving Skills' },
  // Social Skills
  { id: '2.B.1.a', name: 'Social Perceptiveness', category: 'Social Skills' },
  { id: '2.B.1.b', name: 'Coordination', category: 'Social Skills' },
  { id: '2.B.1.c', name: 'Persuasion', category: 'Social Skills' },
  { id: '2.B.1.d', name: 'Negotiation', category: 'Social Skills' },
  { id: '2.B.1.e', name: 'Instructing', category: 'Social Skills' },
  { id: '2.B.1.f', name: 'Service Orientation', category: 'Social Skills' },
  // Technical Skills
  { id: '2.B.2.i', name: 'Complex Problem Solving', category: 'Technical Skills' },
  { id: '2.B.3.a', name: 'Operations Analysis', category: 'Technical Skills' },
  { id: '2.B.3.b', name: 'Technology Design', category: 'Technical Skills' },
  { id: '2.B.3.c', name: 'Equipment Selection', category: 'Technical Skills' },
  { id: '2.B.3.d', name: 'Installation', category: 'Technical Skills' },
  { id: '2.B.3.e', name: 'Programming', category: 'Technical Skills' },
  { id: '2.B.3.g', name: 'Operation Monitoring', category: 'Technical Skills' },
  { id: '2.B.3.h', name: 'Operation and Control', category: 'Technical Skills' },
  // Systems Skills
  { id: '2.B.4.e', name: 'Judgment and Decision Making', category: 'Systems Skills' },
  { id: '2.B.4.g', name: 'Systems Analysis', category: 'Systems Skills' },
  { id: '2.B.4.h', name: 'Systems Evaluation', category: 'Systems Skills' },
  // Resource Management
  { id: '2.B.5.a', name: 'Time Management', category: 'Resource Management Skills' },
  { id: '2.B.5.b', name: 'Management of Financial Resources', category: 'Resource Management Skills' },
  { id: '2.B.5.c', name: 'Management of Material Resources', category: 'Resource Management Skills' },
  { id: '2.B.5.d', name: 'Management of Personnel Resources', category: 'Resource Management Skills' },
];

const ABILITY_ELEMENTS: Array<{ id: string; name: string; category: AbilityCategory; subcategory: AbilitySubcategory }> = [
  // Cognitive - Verbal
  { id: '1.A.1.a.1', name: 'Oral Comprehension', category: 'Cognitive Abilities', subcategory: 'Verbal Abilities' },
  { id: '1.A.1.a.2', name: 'Written Comprehension', category: 'Cognitive Abilities', subcategory: 'Verbal Abilities' },
  { id: '1.A.1.a.3', name: 'Oral Expression', category: 'Cognitive Abilities', subcategory: 'Verbal Abilities' },
  { id: '1.A.1.a.4', name: 'Written Expression', category: 'Cognitive Abilities', subcategory: 'Verbal Abilities' },
  // Cognitive - Idea Generation
  { id: '1.A.1.b.1', name: 'Fluency of Ideas', category: 'Cognitive Abilities', subcategory: 'Idea Generation and Reasoning Abilities' },
  { id: '1.A.1.b.2', name: 'Originality', category: 'Cognitive Abilities', subcategory: 'Idea Generation and Reasoning Abilities' },
  { id: '1.A.1.b.3', name: 'Problem Sensitivity', category: 'Cognitive Abilities', subcategory: 'Idea Generation and Reasoning Abilities' },
  { id: '1.A.1.b.4', name: 'Deductive Reasoning', category: 'Cognitive Abilities', subcategory: 'Idea Generation and Reasoning Abilities' },
  { id: '1.A.1.b.5', name: 'Inductive Reasoning', category: 'Cognitive Abilities', subcategory: 'Idea Generation and Reasoning Abilities' },
  { id: '1.A.1.b.6', name: 'Information Ordering', category: 'Cognitive Abilities', subcategory: 'Idea Generation and Reasoning Abilities' },
  { id: '1.A.1.b.7', name: 'Category Flexibility', category: 'Cognitive Abilities', subcategory: 'Idea Generation and Reasoning Abilities' },
  // Cognitive - Quantitative
  { id: '1.A.1.c.1', name: 'Mathematical Reasoning', category: 'Cognitive Abilities', subcategory: 'Quantitative Abilities' },
  { id: '1.A.1.c.2', name: 'Number Facility', category: 'Cognitive Abilities', subcategory: 'Quantitative Abilities' },
  // Cognitive - Memory
  { id: '1.A.1.d.1', name: 'Memorization', category: 'Cognitive Abilities', subcategory: 'Memory' },
  // Cognitive - Perceptual
  { id: '1.A.1.e.1', name: 'Speed of Closure', category: 'Cognitive Abilities', subcategory: 'Perceptual Abilities' },
  { id: '1.A.1.e.2', name: 'Flexibility of Closure', category: 'Cognitive Abilities', subcategory: 'Perceptual Abilities' },
  { id: '1.A.1.e.3', name: 'Perceptual Speed', category: 'Cognitive Abilities', subcategory: 'Perceptual Abilities' },
  // Cognitive - Spatial
  { id: '1.A.1.f.1', name: 'Spatial Orientation', category: 'Cognitive Abilities', subcategory: 'Spatial Abilities' },
  { id: '1.A.1.f.2', name: 'Visualization', category: 'Cognitive Abilities', subcategory: 'Spatial Abilities' },
  // Cognitive - Attentiveness
  { id: '1.A.1.g.1', name: 'Selective Attention', category: 'Cognitive Abilities', subcategory: 'Attentiveness' },
  { id: '1.A.1.g.2', name: 'Time Sharing', category: 'Cognitive Abilities', subcategory: 'Attentiveness' },
  // Psychomotor
  { id: '1.A.2.a.1', name: 'Arm-Hand Steadiness', category: 'Psychomotor Abilities', subcategory: 'Fine Manipulative Abilities' },
  { id: '1.A.2.a.2', name: 'Manual Dexterity', category: 'Psychomotor Abilities', subcategory: 'Fine Manipulative Abilities' },
  { id: '1.A.2.a.3', name: 'Finger Dexterity', category: 'Psychomotor Abilities', subcategory: 'Fine Manipulative Abilities' },
  { id: '1.A.2.b.1', name: 'Control Precision', category: 'Psychomotor Abilities', subcategory: 'Control Movement Abilities' },
  { id: '1.A.2.b.2', name: 'Multilimb Coordination', category: 'Psychomotor Abilities', subcategory: 'Control Movement Abilities' },
  { id: '1.A.2.b.3', name: 'Response Orientation', category: 'Psychomotor Abilities', subcategory: 'Control Movement Abilities' },
  { id: '1.A.2.b.4', name: 'Rate Control', category: 'Psychomotor Abilities', subcategory: 'Control Movement Abilities' },
  { id: '1.A.2.c.1', name: 'Reaction Time', category: 'Psychomotor Abilities', subcategory: 'Reaction Time and Speed Abilities' },
  { id: '1.A.2.c.2', name: 'Wrist-Finger Speed', category: 'Psychomotor Abilities', subcategory: 'Reaction Time and Speed Abilities' },
  { id: '1.A.2.c.3', name: 'Speed of Limb Movement', category: 'Psychomotor Abilities', subcategory: 'Reaction Time and Speed Abilities' },
  // Physical
  { id: '1.A.3.a.1', name: 'Static Strength', category: 'Physical Abilities', subcategory: 'Physical Strength Abilities' },
  { id: '1.A.3.a.2', name: 'Explosive Strength', category: 'Physical Abilities', subcategory: 'Physical Strength Abilities' },
  { id: '1.A.3.a.3', name: 'Dynamic Strength', category: 'Physical Abilities', subcategory: 'Physical Strength Abilities' },
  { id: '1.A.3.a.4', name: 'Trunk Strength', category: 'Physical Abilities', subcategory: 'Physical Strength Abilities' },
  { id: '1.A.3.b.1', name: 'Stamina', category: 'Physical Abilities', subcategory: 'Endurance' },
  { id: '1.A.3.c.1', name: 'Extent Flexibility', category: 'Physical Abilities', subcategory: 'Flexibility, Balance, and Coordination' },
  { id: '1.A.3.c.2', name: 'Dynamic Flexibility', category: 'Physical Abilities', subcategory: 'Flexibility, Balance, and Coordination' },
  { id: '1.A.3.c.3', name: 'Gross Body Coordination', category: 'Physical Abilities', subcategory: 'Flexibility, Balance, and Coordination' },
  { id: '1.A.3.c.4', name: 'Gross Body Equilibrium', category: 'Physical Abilities', subcategory: 'Flexibility, Balance, and Coordination' },
  // Sensory
  { id: '1.A.4.a.1', name: 'Near Vision', category: 'Sensory Abilities', subcategory: 'Visual Abilities' },
  { id: '1.A.4.a.2', name: 'Far Vision', category: 'Sensory Abilities', subcategory: 'Visual Abilities' },
  { id: '1.A.4.a.3', name: 'Visual Color Discrimination', category: 'Sensory Abilities', subcategory: 'Visual Abilities' },
  { id: '1.A.4.a.4', name: 'Night Vision', category: 'Sensory Abilities', subcategory: 'Visual Abilities' },
  { id: '1.A.4.a.5', name: 'Peripheral Vision', category: 'Sensory Abilities', subcategory: 'Visual Abilities' },
  { id: '1.A.4.a.6', name: 'Depth Perception', category: 'Sensory Abilities', subcategory: 'Visual Abilities' },
  { id: '1.A.4.a.7', name: 'Glare Sensitivity', category: 'Sensory Abilities', subcategory: 'Visual Abilities' },
  { id: '1.A.4.b.1', name: 'Hearing Sensitivity', category: 'Sensory Abilities', subcategory: 'Auditory and Speech Abilities' },
  { id: '1.A.4.b.2', name: 'Auditory Attention', category: 'Sensory Abilities', subcategory: 'Auditory and Speech Abilities' },
  { id: '1.A.4.b.3', name: 'Sound Localization', category: 'Sensory Abilities', subcategory: 'Auditory and Speech Abilities' },
  { id: '1.A.4.b.4', name: 'Speech Recognition', category: 'Sensory Abilities', subcategory: 'Auditory and Speech Abilities' },
  { id: '1.A.4.b.5', name: 'Speech Clarity', category: 'Sensory Abilities', subcategory: 'Auditory and Speech Abilities' },
];

const KNOWLEDGE_ELEMENTS: Array<{ id: string; name: string; category: KnowledgeCategory }> = [
  { id: '2.C.1.a', name: 'Administration and Management', category: 'Business and Management' },
  { id: '2.C.1.b', name: 'Clerical', category: 'Business and Management' },
  { id: '2.C.1.c', name: 'Economics and Accounting', category: 'Business and Management' },
  { id: '2.C.1.d', name: 'Sales and Marketing', category: 'Business and Management' },
  { id: '2.C.1.e', name: 'Customer and Personal Service', category: 'Business and Management' },
  { id: '2.C.1.f', name: 'Personnel and Human Resources', category: 'Business and Management' },
  { id: '2.C.2.a', name: 'Production and Processing', category: 'Manufacturing and Production' },
  { id: '2.C.2.b', name: 'Food Production', category: 'Manufacturing and Production' },
  { id: '2.C.3.a', name: 'Computers and Electronics', category: 'Engineering and Technology' },
  { id: '2.C.3.b', name: 'Engineering and Technology', category: 'Engineering and Technology' },
  { id: '2.C.3.c', name: 'Design', category: 'Engineering and Technology' },
  { id: '2.C.3.d', name: 'Building and Construction', category: 'Engineering and Technology' },
  { id: '2.C.3.e', name: 'Mechanical', category: 'Engineering and Technology' },
  { id: '2.C.4.a', name: 'Mathematics', category: 'Mathematics and Science' },
  { id: '2.C.4.b', name: 'Physics', category: 'Mathematics and Science' },
  { id: '2.C.4.c', name: 'Chemistry', category: 'Mathematics and Science' },
  { id: '2.C.4.d', name: 'Biology', category: 'Mathematics and Science' },
  { id: '2.C.4.e', name: 'Psychology', category: 'Mathematics and Science' },
  { id: '2.C.4.f', name: 'Sociology and Anthropology', category: 'Mathematics and Science' },
  { id: '2.C.4.g', name: 'Geography', category: 'Mathematics and Science' },
  { id: '2.C.5.a', name: 'Medicine and Dentistry', category: 'Health Services' },
  { id: '2.C.5.b', name: 'Therapy and Counseling', category: 'Health Services' },
  { id: '2.C.6.a', name: 'Education and Training', category: 'Education and Training' },
  { id: '2.C.7.a', name: 'English Language', category: 'Arts and Humanities' },
  { id: '2.C.7.b', name: 'Foreign Language', category: 'Arts and Humanities' },
  { id: '2.C.7.c', name: 'Fine Arts', category: 'Arts and Humanities' },
  { id: '2.C.7.d', name: 'History and Archeology', category: 'Arts and Humanities' },
  { id: '2.C.7.e', name: 'Philosophy and Theology', category: 'Arts and Humanities' },
  { id: '2.C.8.a', name: 'Public Safety and Security', category: 'Law and Public Safety' },
  { id: '2.C.8.b', name: 'Law and Government', category: 'Law and Public Safety' },
  { id: '2.C.9.a', name: 'Telecommunications', category: 'Communications' },
  { id: '2.C.9.b', name: 'Communications and Media', category: 'Communications' },
  { id: '2.C.10.a', name: 'Transportation', category: 'Transportation' },
];

const WORK_STYLE_ELEMENTS: Array<{ id: string; name: string; category: WorkStyleCategory }> = [
  { id: '1.C.1.a', name: 'Achievement/Effort', category: 'Achievement Orientation' },
  { id: '1.C.1.b', name: 'Persistence', category: 'Achievement Orientation' },
  { id: '1.C.1.c', name: 'Initiative', category: 'Achievement Orientation' },
  { id: '1.C.2.a', name: 'Leadership', category: 'Social Influence' },
  { id: '1.C.2.b', name: 'Social Orientation', category: 'Social Influence' },
  { id: '1.C.3.a', name: 'Cooperation', category: 'Interpersonal Orientation' },
  { id: '1.C.3.b', name: 'Concern for Others', category: 'Interpersonal Orientation' },
  { id: '1.C.4.a', name: 'Self-Control', category: 'Adjustment' },
  { id: '1.C.4.b', name: 'Stress Tolerance', category: 'Adjustment' },
  { id: '1.C.4.c', name: 'Adaptability/Flexibility', category: 'Adjustment' },
  { id: '1.C.5.a', name: 'Dependability', category: 'Conscientiousness' },
  { id: '1.C.5.b', name: 'Attention to Detail', category: 'Conscientiousness' },
  { id: '1.C.5.c', name: 'Integrity', category: 'Conscientiousness' },
  { id: '1.C.6.a', name: 'Independence', category: 'Independence' },
  { id: '1.C.7.a', name: 'Innovation', category: 'Practical Intelligence' },
  { id: '1.C.7.b', name: 'Analytical Thinking', category: 'Practical Intelligence' },
];

const WORK_ACTIVITY_ELEMENTS = [
  { id: '4.A.1.a.1', name: 'Getting Information' },
  { id: '4.A.1.a.2', name: 'Monitor Processes, Materials, or Surroundings' },
  { id: '4.A.1.b.1', name: 'Identifying Objects, Actions, and Events' },
  { id: '4.A.1.b.2', name: 'Inspecting Equipment, Structures, or Materials' },
  { id: '4.A.1.b.3', name: 'Estimating the Quantifiable Characteristics of Products, Events, or Information' },
  { id: '4.A.2.a.1', name: 'Judging the Qualities of Objects, Services, or People' },
  { id: '4.A.2.a.2', name: 'Processing Information' },
  { id: '4.A.2.a.3', name: 'Evaluating Information to Determine Compliance with Standards' },
  { id: '4.A.2.a.4', name: 'Analyzing Data or Information' },
  { id: '4.A.2.b.1', name: 'Making Decisions and Solving Problems' },
  { id: '4.A.2.b.2', name: 'Thinking Creatively' },
  { id: '4.A.2.b.3', name: 'Updating and Using Relevant Knowledge' },
  { id: '4.A.2.b.4', name: 'Developing Objectives and Strategies' },
  { id: '4.A.2.b.5', name: 'Scheduling Work and Activities' },
  { id: '4.A.2.b.6', name: 'Organizing, Planning, and Prioritizing Work' },
  { id: '4.A.3.a.1', name: 'Performing General Physical Activities' },
  { id: '4.A.3.a.2', name: 'Handling and Moving Objects' },
  { id: '4.A.3.a.3', name: 'Controlling Machines and Processes' },
  { id: '4.A.3.a.4', name: 'Operating Vehicles, Mechanized Devices, or Equipment' },
  { id: '4.A.3.b.1', name: 'Interacting With Computers' },
  { id: '4.A.3.b.2', name: 'Drafting, Laying Out, and Specifying Technical Devices, Parts, and Equipment' },
  { id: '4.A.3.b.4', name: 'Repairing and Maintaining Mechanical Equipment' },
  { id: '4.A.3.b.5', name: 'Repairing and Maintaining Electronic Equipment' },
  { id: '4.A.3.b.6', name: 'Documenting/Recording Information' },
  { id: '4.A.4.a.1', name: 'Interpreting the Meaning of Information for Others' },
  { id: '4.A.4.a.2', name: 'Communicating with Supervisors, Peers, or Subordinates' },
  { id: '4.A.4.a.3', name: 'Communicating with People Outside the Organization' },
  { id: '4.A.4.a.4', name: 'Establishing and Maintaining Interpersonal Relationships' },
  { id: '4.A.4.a.5', name: 'Assisting and Caring for Others' },
  { id: '4.A.4.a.6', name: 'Selling or Influencing Others' },
  { id: '4.A.4.a.7', name: 'Resolving Conflicts and Negotiating with Others' },
  { id: '4.A.4.a.8', name: 'Performing for or Working Directly with the Public' },
  { id: '4.A.4.b.1', name: 'Coordinating the Work and Activities of Others' },
  { id: '4.A.4.b.2', name: 'Developing and Building Teams' },
  { id: '4.A.4.b.3', name: 'Training and Teaching Others' },
  { id: '4.A.4.b.4', name: 'Guiding, Directing, and Motivating Subordinates' },
  { id: '4.A.4.b.5', name: 'Coaching and Developing Others' },
  { id: '4.A.4.b.6', name: 'Provide Consultation and Advice to Others' },
  { id: '4.A.4.c.1', name: 'Performing Administrative Activities' },
  { id: '4.A.4.c.2', name: 'Staffing Organizational Units' },
  { id: '4.A.4.c.3', name: 'Monitoring and Controlling Resources' },
];

const WORK_CONTEXT_ELEMENTS = [
  { id: '4.C.1.a.1', name: 'Face-to-Face Discussions' },
  { id: '4.C.1.a.2.a', name: 'Contact With Others' },
  { id: '4.C.1.a.2.b', name: 'Work With Work Group or Team' },
  { id: '4.C.1.a.2.c', name: 'Deal With External Customers' },
  { id: '4.C.1.b.1.a', name: 'Coordinate or Lead Others' },
  { id: '4.C.1.b.1.b', name: 'Responsible for Others\' Health and Safety' },
  { id: '4.C.1.c.1', name: 'Telephone' },
  { id: '4.C.1.c.2', name: 'Electronic Mail' },
  { id: '4.C.1.c.3', name: 'Letters and Memos' },
  { id: '4.C.2.a.1.a', name: 'Indoors, Environmentally Controlled' },
  { id: '4.C.2.a.1.b', name: 'Indoors, Not Environmentally Controlled' },
  { id: '4.C.2.a.1.c', name: 'Outdoors, Exposed to Weather' },
  { id: '4.C.2.a.1.d', name: 'Outdoors, Under Cover' },
  { id: '4.C.2.a.1.e', name: 'In an Open Vehicle or Equipment' },
  { id: '4.C.2.a.1.f', name: 'In an Enclosed Vehicle or Equipment' },
  { id: '4.C.2.b.1.a', name: 'Exposed to High Places' },
  { id: '4.C.2.b.1.b', name: 'Exposed to Hazardous Conditions' },
  { id: '4.C.2.b.1.c', name: 'Exposed to Hazardous Equipment' },
  { id: '4.C.2.b.1.d', name: 'Exposed to Contaminants' },
  { id: '4.C.2.b.1.e', name: 'Sounds, Noise Levels Are Distracting or Uncomfortable' },
  { id: '4.C.2.c.1.b', name: 'Extremely Bright or Inadequate Lighting' },
  { id: '4.C.2.c.1.c', name: 'Cramped Work Space, Awkward Positions' },
  { id: '4.C.2.d.1.a', name: 'Physical Proximity' },
  { id: '4.C.2.e.1.a', name: 'Wear Common Protective or Safety Equipment' },
  { id: '4.C.2.e.1.b', name: 'Wear Specialized Protective or Safety Equipment' },
  { id: '4.C.3.a.1', name: 'Structured versus Unstructured Work' },
  { id: '4.C.3.a.2.a', name: 'Freedom to Make Decisions' },
  { id: '4.C.3.a.2.b', name: 'Impact of Decisions on Co-workers or Company Results' },
  { id: '4.C.3.a.3', name: 'Frequency of Decision Making' },
  { id: '4.C.3.a.4', name: 'Level of Competition' },
  { id: '4.C.3.a.8', name: 'Pace Determined by Speed of Equipment' },
  { id: '4.C.3.b.2', name: 'Importance of Being Exact or Accurate' },
  { id: '4.C.3.b.4', name: 'Importance of Repeating Same Tasks' },
  { id: '4.C.3.b.7', name: 'Consequence of Error' },
  { id: '4.C.3.b.8', name: 'Time Pressure' },
  { id: '4.C.3.d.1', name: 'Duration of Typical Work Week' },
  { id: '4.C.3.d.3', name: 'Spend Time Sitting' },
  { id: '4.C.3.d.4', name: 'Spend Time Standing' },
  { id: '4.C.3.d.5', name: 'Spend Time Walking and Running' },
];

const RIASEC_TYPES: RiasecType[] = ['Realistic', 'Investigative', 'Artistic', 'Social', 'Enterprising', 'Conventional'];

const WORK_VALUE_TYPES: WorkValueType[] = ['Achievement', 'Working Conditions', 'Recognition', 'Relationships', 'Support', 'Independence'];

const EDUCATION_LEVELS = [
  'Less than a High School Diploma',
  'High School Diploma or Equivalent',
  'Post-Secondary Certificate',
  'Some College Courses',
  "Associate's Degree",
  "Bachelor's Degree",
  "Master's Degree",
  'Doctoral Degree',
] as const;

const TECHNOLOGY_CATEGORIES = [
  'Analytical or scientific software',
  'Business intelligence and data analysis software',
  'Cloud-based data access and sharing software',
  'Computer aided design CAD software',
  'Customer relationship management CRM software',
  'Data base management system software',
  'Desktop publishing software',
  'Development environment software',
  'Document management software',
  'Electronic mail software',
  'Enterprise resource planning ERP software',
  'Financial analysis software',
  'Graphics or photo imaging software',
  'Human resources software',
  'Industrial control software',
  'Internet browser software',
  'Medical software',
  'Object or component oriented development software',
  'Office suite software',
  'Operating system software',
  'Presentation software',
  'Project management software',
  'Spreadsheet software',
  'Video creation and editing software',
  'Web page creation and editing software',
  'Word processing software',
];

const TASK_VERBS = [
  'Analyze', 'Assess', 'Assist', 'Build', 'Calculate', 'Check', 'Communicate', 'Compile',
  'Conduct', 'Coordinate', 'Create', 'Design', 'Develop', 'Document', 'Ensure', 'Establish',
  'Evaluate', 'Execute', 'Identify', 'Implement', 'Inspect', 'Install', 'Interpret', 'Lead',
  'Maintain', 'Manage', 'Monitor', 'Operate', 'Organize', 'Oversee', 'Perform', 'Plan',
  'Prepare', 'Present', 'Process', 'Produce', 'Provide', 'Record', 'Report', 'Research',
  'Review', 'Schedule', 'Supervise', 'Support', 'Test', 'Train', 'Update', 'Verify',
];

const TASK_OBJECTS = [
  'activities', 'budgets', 'clients', 'communications', 'compliance', 'contracts',
  'data', 'documents', 'equipment', 'files', 'information', 'inventory', 'materials',
  'meetings', 'operations', 'personnel', 'policies', 'procedures', 'products', 'projects',
  'records', 'reports', 'resources', 'safety', 'schedules', 'services', 'specifications',
  'staff', 'standards', 'strategies', 'supplies', 'systems', 'tasks', 'teams', 'workflows',
];

// Major occupation groups
const MAJOR_GROUPS = [
  { code: '11', name: 'Management' },
  { code: '13', name: 'Business and Financial Operations' },
  { code: '15', name: 'Computer and Mathematical' },
  { code: '17', name: 'Architecture and Engineering' },
  { code: '19', name: 'Life, Physical, and Social Science' },
  { code: '21', name: 'Community and Social Service' },
  { code: '23', name: 'Legal' },
  { code: '25', name: 'Educational Instruction and Library' },
  { code: '27', name: 'Arts, Design, Entertainment, Sports, and Media' },
  { code: '29', name: 'Healthcare Practitioners and Technical' },
  { code: '31', name: 'Healthcare Support' },
  { code: '33', name: 'Protective Service' },
  { code: '35', name: 'Food Preparation and Serving Related' },
  { code: '37', name: 'Building and Grounds Cleaning and Maintenance' },
  { code: '39', name: 'Personal Care and Service' },
  { code: '41', name: 'Sales and Related' },
  { code: '43', name: 'Office and Administrative Support' },
  { code: '45', name: 'Farming, Fishing, and Forestry' },
  { code: '47', name: 'Construction and Extraction' },
  { code: '49', name: 'Installation, Maintenance, and Repair' },
  { code: '51', name: 'Production' },
  { code: '53', name: 'Transportation and Material Moving' },
];

const OCCUPATION_TITLES = [
  'Accountant', 'Administrative Assistant', 'Analyst', 'Architect', 'Attorney',
  'Auditor', 'Chef', 'Clerk', 'Consultant', 'Coordinator', 'Designer', 'Developer',
  'Director', 'Engineer', 'Executive', 'Inspector', 'Manager', 'Nurse', 'Officer',
  'Operator', 'Pharmacist', 'Planner', 'Programmer', 'Representative', 'Researcher',
  'Scientist', 'Specialist', 'Supervisor', 'Teacher', 'Technician', 'Therapist', 'Writer',
];

const OCCUPATION_PREFIXES = [
  'Chief', 'Senior', 'Junior', 'Associate', 'Assistant', 'Lead', 'Principal',
  'Executive', 'Regional', 'General', 'Head', 'Deputy', 'Vice',
];

const OCCUPATION_DOMAINS = [
  'Software', 'Data', 'Financial', 'Human Resources', 'Marketing', 'Sales', 'Operations',
  'Quality', 'Project', 'Product', 'Research', 'Development', 'Clinical', 'Medical',
  'Technical', 'Network', 'Security', 'Systems', 'Business', 'Customer Service',
];

// ============================================================================
// Generator Configuration
// ============================================================================

export interface OnetGeneratorConfig {
  /** Random seed for reproducibility */
  seed?: number;
  /** Number of skills per occupation (min-max) */
  skillsRange?: [number, number];
  /** Number of abilities per occupation (min-max) */
  abilitiesRange?: [number, number];
  /** Number of knowledge areas per occupation (min-max) */
  knowledgeRange?: [number, number];
  /** Number of tasks per occupation (min-max) */
  tasksRange?: [number, number];
  /** Number of work activities per occupation (min-max) */
  workActivitiesRange?: [number, number];
  /** Number of work context items per occupation (min-max) */
  workContextRange?: [number, number];
  /** Number of technologies per occupation (min-max) */
  technologiesRange?: [number, number];
}

const DEFAULT_CONFIG: Required<OnetGeneratorConfig> = {
  seed: 42,
  skillsRange: [20, 35],
  abilitiesRange: [30, 52],
  knowledgeRange: [15, 33],
  tasksRange: [8, 25],
  workActivitiesRange: [25, 41],
  workContextRange: [20, 40],
  technologiesRange: [5, 15],
};

// ============================================================================
// Generator Functions
// ============================================================================

/**
 * Generate a realistic O*NET-SOC code
 */
function generateOnetSocCode(rng: SeededRandom, index: number): OnetSocCode {
  const group = rng.pick(MAJOR_GROUPS);
  const minor = rng.int(1000, 9999).toString().padStart(4, '0');
  const detail = rng.int(0, 99).toString().padStart(2, '0');
  return `${group.code}-${minor}.${detail}`;
}

/**
 * Generate a realistic occupation title
 */
function generateOccupationTitle(rng: SeededRandom): string {
  const parts: string[] = [];

  if (rng.bool(0.3)) {
    parts.push(rng.pick(OCCUPATION_PREFIXES));
  }

  if (rng.bool(0.6)) {
    parts.push(rng.pick(OCCUPATION_DOMAINS));
  }

  parts.push(rng.pick(OCCUPATION_TITLES));

  return parts.join(' ');
}

/**
 * Generate occupation description
 */
function generateDescription(rng: SeededRandom, title: string): string {
  const verbs = rng.pickN(TASK_VERBS, rng.int(3, 5));
  const objects = rng.pickN(TASK_OBJECTS, rng.int(3, 5));

  const activities = verbs.map((verb, i) => {
    const obj = objects[i % objects.length];
    return `${verb.toLowerCase()} ${obj}`;
  });

  return `${title}s ${activities.slice(0, -1).join(', ')}, and ${activities[activities.length - 1]}. ` +
    `This occupation requires specialized knowledge and skills in the relevant domain.`;
}

/**
 * Generate skill ratings with realistic distributions
 */
function generateSkills(rng: SeededRandom, config: Required<OnetGeneratorConfig>, jobZone: JobZone): EmbeddedSkill[] {
  const count = rng.int(config.skillsRange[0], config.skillsRange[1]);
  const selectedSkills = rng.pickN(SKILL_ELEMENTS, count);

  // Higher job zones have higher skill requirements
  const baseMean = 2.5 + (jobZone - 1) * 0.4;

  return selectedSkills.map(skill => ({
    id: skill.id,
    name: skill.name,
    category: skill.category,
    importance: Math.max(0, Math.min(5, rng.normal(baseMean, 0.8))),
    level: Math.max(0, Math.min(7, rng.normal(baseMean + 1, 1.0))),
    standardError: rng.float(0.05, 0.25),
    notRelevant: rng.bool(0.05),
  }));
}

/**
 * Generate ability ratings
 */
function generateAbilities(rng: SeededRandom, config: Required<OnetGeneratorConfig>, jobZone: JobZone): EmbeddedAbility[] {
  const count = rng.int(config.abilitiesRange[0], config.abilitiesRange[1]);
  const selectedAbilities = rng.pickN(ABILITY_ELEMENTS, count);

  const baseMean = 2.0 + (jobZone - 1) * 0.3;

  return selectedAbilities.map(ability => ({
    id: ability.id,
    name: ability.name,
    category: ability.category,
    subcategory: ability.subcategory,
    importance: Math.max(0, Math.min(5, rng.normal(baseMean, 0.9))),
    level: Math.max(0, Math.min(7, rng.normal(baseMean + 0.5, 1.1))),
    standardError: rng.float(0.05, 0.30),
    notRelevant: rng.bool(0.08),
  }));
}

/**
 * Generate knowledge ratings
 */
function generateKnowledge(rng: SeededRandom, config: Required<OnetGeneratorConfig>, jobZone: JobZone): EmbeddedKnowledge[] {
  const count = rng.int(config.knowledgeRange[0], config.knowledgeRange[1]);
  const selectedKnowledge = rng.pickN(KNOWLEDGE_ELEMENTS, count);

  const baseMean = 2.0 + (jobZone - 1) * 0.5;

  return selectedKnowledge.map(k => ({
    id: k.id,
    name: k.name,
    category: k.category,
    importance: Math.max(0, Math.min(5, rng.normal(baseMean, 1.0))),
    level: Math.max(0, Math.min(7, rng.normal(baseMean + 0.5, 1.2))),
    standardError: rng.float(0.05, 0.28),
    notRelevant: rng.bool(0.1),
  }));
}

/**
 * Generate work style ratings
 */
function generateWorkStyles(rng: SeededRandom): EmbeddedWorkStyle[] {
  return WORK_STYLE_ELEMENTS.map(style => ({
    id: style.id,
    name: style.name,
    styleCategory: style.category,
    importance: Math.max(0, Math.min(5, rng.normal(3.5, 0.7))),
    level: Math.max(0, Math.min(7, rng.normal(4.0, 0.8))),
    standardError: rng.float(0.05, 0.20),
  }));
}

/**
 * Generate work activities
 */
function generateWorkActivities(rng: SeededRandom, config: Required<OnetGeneratorConfig>): EmbeddedWorkActivity[] {
  const count = rng.int(config.workActivitiesRange[0], config.workActivitiesRange[1]);
  const selectedActivities = rng.pickN(WORK_ACTIVITY_ELEMENTS, count);

  return selectedActivities.map(activity => ({
    id: activity.id,
    name: activity.name,
    importance: Math.max(0, Math.min(5, rng.normal(3.0, 1.0))),
    level: Math.max(0, Math.min(7, rng.normal(3.5, 1.2))),
    standardError: rng.float(0.05, 0.25),
    notRelevant: rng.bool(0.05),
  }));
}

/**
 * Generate work context
 */
function generateWorkContext(rng: SeededRandom, config: Required<OnetGeneratorConfig>): EmbeddedWorkContext[] {
  const count = rng.int(config.workContextRange[0], config.workContextRange[1]);
  const selectedContext = rng.pickN(WORK_CONTEXT_ELEMENTS, count);

  return selectedContext.map(ctx => ({
    id: ctx.id,
    name: ctx.name,
    value: Math.max(0, Math.min(5, rng.normal(2.5, 1.0))),
    frequency: rng.bool(0.5) ? Math.max(0, Math.min(100, rng.normal(50, 25))) : undefined,
  }));
}

/**
 * Generate tasks
 */
function generateTasks(rng: SeededRandom, config: Required<OnetGeneratorConfig>): EmbeddedTask[] {
  const count = rng.int(config.tasksRange[0], config.tasksRange[1]);
  const tasks: EmbeddedTask[] = [];

  for (let i = 0; i < count; i++) {
    const verb = rng.pick(TASK_VERBS);
    const obj = rng.pick(TASK_OBJECTS);
    const isCore = i < count * 0.7; // 70% core tasks

    tasks.push({
      id: rng.int(10000, 99999),
      description: `${verb} ${obj} according to established procedures and standards.`,
      type: isCore ? 'Core' : 'Supplemental',
      importance: Math.max(0, Math.min(5, rng.normal(3.5, 0.8))),
      frequency: rng.bool(0.6) ? Math.max(0, Math.min(5, rng.normal(3.0, 1.0))) : undefined,
      relevance: rng.bool(0.4) ? Math.max(0, Math.min(100, rng.normal(75, 15))) : undefined,
    });
  }

  return tasks;
}

/**
 * Generate RIASEC interests
 */
function generateInterests(rng: SeededRandom): EmbeddedInterest[] {
  const scores = RIASEC_TYPES.map(type => ({
    type,
    score: Math.max(0, Math.min(7, rng.normal(3.5, 1.5))),
  }));

  // Sort by score to determine high points
  scores.sort((a, b) => b.score - a.score);

  return scores.map((item, index) => ({
    type: item.type,
    score: item.score,
    isHighPoint: index < 3, // Top 3 are high points
  }));
}

/**
 * Generate work values
 */
function generateWorkValues(rng: SeededRandom): EmbeddedWorkValue[] {
  return WORK_VALUE_TYPES.map(type => ({
    type,
    extent: Math.max(0, Math.min(7, rng.normal(4.0, 1.2))),
    achievement: rng.bool(0.5) ? Math.max(0, Math.min(7, rng.normal(4.0, 1.0))) : undefined,
  }));
}

/**
 * Generate education distribution
 */
function generateEducation(rng: SeededRandom, jobZone: JobZone): EmbeddedEducation[] {
  // Education distribution based on job zone
  const distributions: Record<JobZone, number[]> = {
    1: [30, 50, 15, 5, 0, 0, 0, 0],
    2: [10, 40, 30, 15, 5, 0, 0, 0],
    3: [0, 15, 25, 25, 25, 10, 0, 0],
    4: [0, 0, 5, 10, 15, 50, 15, 5],
    5: [0, 0, 0, 0, 5, 25, 40, 30],
  };

  const dist = distributions[jobZone];
  const education: EmbeddedEducation[] = [];

  EDUCATION_LEVELS.forEach((level, i) => {
    const basePercentage = dist[i];
    if (basePercentage > 0) {
      const percentage = Math.max(0, Math.min(100, basePercentage + rng.int(-5, 5)));
      education.push({ level, percentage });
    }
  });

  return education;
}

/**
 * Generate technologies
 */
function generateTechnologies(rng: SeededRandom, config: Required<OnetGeneratorConfig>): EmbeddedTechnology[] {
  const count = rng.int(config.technologiesRange[0], config.technologiesRange[1]);
  const selectedCategories = rng.pickN(TECHNOLOGY_CATEGORIES, count);

  return selectedCategories.map(category => ({
    category,
    examples: [
      `${category.split(' ')[0]} Tool A`,
      `${category.split(' ')[0]} Software B`,
    ],
    isHotTechnology: rng.bool(0.2),
  }));
}

/**
 * Generate a single denormalized occupation document
 */
function generateOccupation(
  rng: SeededRandom,
  index: number,
  config: Required<OnetGeneratorConfig>
): DenormalizedOccupation {
  const code = generateOnetSocCode(rng, index);
  const title = generateOccupationTitle(rng);
  const majorGroup = code.substring(0, 2);
  const minorGroup = code.substring(0, 7);
  const jobZone = (rng.int(1, 5) as JobZone);

  const tasks = generateTasks(rng, config);
  const coreTaskCount = tasks.filter(t => t.type === 'Core').length;

  return {
    code,
    title,
    description: generateDescription(rng, title),
    jobZone,
    majorGroup,
    minorGroup,
    brightOutlook: rng.bool(0.15),
    greenOccupation: rng.bool(0.1),

    tasks,
    coreTaskCount,
    supplementalTaskCount: tasks.length - coreTaskCount,

    abilities: generateAbilities(rng, config, jobZone),
    interests: generateInterests(rng),
    workStyles: generateWorkStyles(rng),

    skills: generateSkills(rng, config, jobZone),
    knowledge: generateKnowledge(rng, config, jobZone),
    education: generateEducation(rng, jobZone),
    experience: [
      { category: 'None', percentage: rng.int(0, 20) },
      { category: 'Up to 1 year', percentage: rng.int(10, 30) },
      { category: 'Over 1 year', percentage: rng.int(20, 40) },
      { category: 'Over 4 years', percentage: rng.int(10, 30) },
    ],

    workActivities: generateWorkActivities(rng, config),
    workContext: generateWorkContext(rng, config),

    technologies: generateTechnologies(rng, config),
    workValues: generateWorkValues(rng),

    alternateTitles: [
      title.replace('Senior ', ''),
      title.replace(' ', ' ') + ' I',
      title.replace(' ', ' ') + ' II',
    ].slice(0, rng.int(1, 3)),

    dataDate: '2024-01',
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate synthetic ONET occupations
 *
 * @param count Number of occupations to generate
 * @param config Generator configuration
 * @returns Array of denormalized occupation documents
 */
export function generateOnetOccupations(
  count: number,
  config: OnetGeneratorConfig = {}
): DenormalizedOccupation[] {
  const fullConfig: Required<OnetGeneratorConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = new SeededRandom(fullConfig.seed ?? 42);
  const occupations: DenormalizedOccupation[] = new Array(count);

  for (let i = 0; i < count; i++) {
    occupations[i] = generateOccupation(rng, i, fullConfig);
  }

  return occupations;
}

/**
 * Generate occupations for a specific data size preset
 *
 * @param size Data size preset
 * @param config Generator configuration
 * @returns Array of denormalized occupation documents
 */
export function generateOnetDataset(
  size: OnetDataSize,
  config: OnetGeneratorConfig = {}
): DenormalizedOccupation[] {
  return generateOnetOccupations(ONET_DATA_SIZES[size], config);
}

/**
 * Generate occupations as an async iterator (for large datasets)
 *
 * @param count Number of occupations to generate
 * @param batchSize Occupations per batch
 * @param config Generator configuration
 */
export async function* generateOnetOccupationsIterator(
  count: number,
  batchSize = 100,
  config: OnetGeneratorConfig = {}
): AsyncGenerator<DenormalizedOccupation[], void, unknown> {
  const fullConfig: Required<OnetGeneratorConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const rng = new SeededRandom(fullConfig.seed ?? 42);
  let remaining = count;
  let index = 0;

  while (remaining > 0) {
    const currentBatch = Math.min(batchSize, remaining);
    const batch: DenormalizedOccupation[] = new Array(currentBatch);

    for (let i = 0; i < currentBatch; i++) {
      batch[i] = generateOccupation(rng, index++, fullConfig);
    }

    remaining -= currentBatch;
    yield batch;
  }
}

/**
 * Estimate memory usage for generated occupations
 *
 * @param count Number of occupations
 * @returns Estimated memory in bytes
 */
export function estimateOnetMemoryUsage(count: number): number {
  // Average occupation size is ~8KB in memory
  const avgOccupationSize = 8000;
  return count * avgOccupationSize;
}

/**
 * Estimate JSON size for generated occupations
 *
 * @param count Number of occupations
 * @returns Estimated JSON size in bytes
 */
export function estimateOnetJsonSize(count: number): number {
  // Average JSON serialized size is ~6KB
  const avgJsonSize = 6000;
  return count * avgJsonSize;
}
