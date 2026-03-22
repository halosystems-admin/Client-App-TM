export type ScoringCriterionType = 'binary' | 'multi' | 'numeric';

export interface ScoringOption {
  id: string;
  label: string;
  /** Inclusive minimum value for numeric ranges (if applicable). */
  minValue?: number;
  /** Inclusive maximum value for numeric ranges (if applicable). */
  maxValue?: number;
  /** Points contributed to the total score when this option is selected. */
  points: number;
}

export interface ScoringCriterionBase {
  id: string;
  label: string;
  /** Optional helper text / examples for the clinician. */
  helperText?: string;
  /** Whether this field is required to compute a score. */
  required?: boolean;
}

export interface BinaryCriterion extends ScoringCriterionBase {
  type: 'binary';
  /** Points awarded when toggled "on" / "yes". */
  points: number;
}

export interface MultiCriterion extends ScoringCriterionBase {
  type: 'multi';
  /** Mutually exclusive choices (e.g. age ranges). */
  options: ScoringOption[];
}

export interface NumericCriterion extends ScoringCriterionBase {
  type: 'numeric';
  /** Display placeholder / unit (e.g. "years", "mmHg"). */
  unit?: string;
  /**
   * For numeric criteria we still translate the raw number into
   * points using discrete bands defined here (e.g. <65 (0), 65–74 (1)).
   */
  ranges: ScoringOption[];
}

export type ScoringCriterion = BinaryCriterion | MultiCriterion | NumericCriterion;

export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Very High';

export interface ScoringResultBand {
  minScore: number;
  maxScore: number;
  riskLevel: RiskLevel;
  /** Tailwind-friendly color token, e.g. "emerald", "amber", "rose". */
  colorCode: string;
  clinicalRecommendation: string;
}

export interface ScoringSystem {
  id: string;
  title: string;
  category: string;
  description: string;
  /** Optional external reference / guideline URL. */
  referenceUrl?: string;
  criteria: ScoringCriterion[];
  results: ScoringResultBand[];
}

export interface ScoringConfig {
  systems: ScoringSystem[];
}

