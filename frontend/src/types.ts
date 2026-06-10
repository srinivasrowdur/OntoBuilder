export type Identifier = string;

export type ReviewStatus = "pending" | "accepted" | "rejected" | "needs_clarification" | "edited";

export interface Entity {
  id: Identifier;
  label: string;
  entity_type: string;
  description: string;
  aliases: string[];
  parent_entity_id?: Identifier | null;
  examples: string[];
  confidence: number;
}

export interface Cardinality {
  min_count?: number | null;
  max_count?: number | null;
  text?: string | null;
}

export interface Relationship {
  id: Identifier;
  subject_entity_id: Identifier;
  predicate: Identifier;
  label: string;
  object_entity_id: Identifier;
  relationship_type: string;
  cardinality?: Cardinality | null;
  inverse_label?: string | null;
  description: string;
  confidence: number;
}

export interface Rule {
  id: Identifier;
  applies_to_entity_id: Identifier;
  rule_type: string;
  severity: "must" | "should" | "may";
  predicate: Identifier;
  operator: string;
  value?: string | number | boolean | string[] | null;
  value_entity_id?: Identifier | null;
  value_datatype?: string | null;
  text: string;
  rationale: string;
  implementation_hint?: string | null;
  confidence: number;
}

export interface NaturalLanguageStatement {
  id: Identifier;
  kind: "relationship" | "rule";
  text: string;
  subject_entity_id: Identifier;
  predicate: string;
  object_entity_id?: Identifier | null;
  relationship_id?: Identifier | null;
  rule_id?: Identifier | null;
}

export interface OntologyDraft {
  domain: string;
  scope?: string | null;
  namespace_suggestion: string;
  summary: string;
  entities: Entity[];
  relationships: Relationship[];
  rules: Rule[];
  statements: NaturalLanguageStatement[];
  competency_questions: unknown[];
  assumptions: string[];
  open_questions: string[];
  extension_points: string[];
}

export interface ImpactReference {
  id: Identifier;
  label: string;
  type: "entity" | "relationship" | "rule";
}

export interface StatementImpact {
  entities: ImpactReference[];
  relationships: ImpactReference[];
  rules: ImpactReference[];
}

export interface StatementReview {
  statement: NaturalLanguageStatement;
  status: ReviewStatus;
  edited_text?: string | null;
  comment?: string | null;
  impact: StatementImpact;
}

export interface DraftReviewSession {
  id: string;
  source_prompt: string;
  draft: OntologyDraft;
  statements: StatementReview[];
  created_at: string;
  updated_at: string;
}

export interface DraftStreamEvent {
  type: "stage" | "skill" | "entity" | "counts" | "heartbeat" | "complete" | "error";
  stage?: string;
  message?: string;
  skill?: string;
  label?: string;
  entity_type?: string | null;
  entities?: number;
  relationships?: number;
  rules?: number;
  elapsed?: number;
  session?: DraftReviewSession;
}

export interface GenerationCounts {
  entities: number;
  relationships: number;
  rules: number;
}

export interface GenerationStep {
  key: string;
  label: string;
  status: "active" | "done";
}

export interface CommitResponse {
  draft_id: string;
  included_statement_ids: Identifier[];
  ontology: OntologyDraft;
}

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  path: string;
  created_at: string;
  updated_at: string;
  draft_id?: string | null;
  domain?: string | null;
  scope?: string | null;
  saved_at?: string | null;
  entity_count: number;
  relationship_count: number;
  rule_count: number;
  statement_count: number;
}

export interface ProjectSaveResponse {
  project: ProjectSummary;
}

export interface MentionReference {
  id?: Identifier | null;
  label?: string | null;
  token?: string | null;
}

export interface ProjectRevisionResponse {
  session: DraftReviewSession;
  project: ProjectSummary;
  intent: "rename_entity" | "add_relationship" | "add_rule" | "expand_entity";
  message: string;
}

export type EntityType =
  | "class"
  | "role"
  | "document"
  | "event"
  | "process"
  | "state"
  | "attribute"
  | "value"
  | "external_reference";

export interface EntityReferencePayload {
  id?: Identifier;
  label?: string;
  entity_type?: EntityType;
  description?: string;
}

export type StatementCreatePayload =
  | {
      kind: "relationship";
      subject: EntityReferencePayload;
      predicate_label: string;
      object: EntityReferencePayload;
      relationship_type?: string;
      cardinality?: Cardinality | null;
      statement_text?: string | null;
    }
  | {
      kind: "rule";
      applies_to: EntityReferencePayload;
      rule_type?: string;
      severity: "must" | "should" | "may";
      predicate_label: string;
      operator:
        | "exists"
        | "eq"
        | "neq"
        | "gt"
        | "gte"
        | "lt"
        | "lte"
        | "in"
        | "not_in"
        | "min_count"
        | "max_count"
        | "pattern";
      value?: string | number | boolean | string[] | null;
      value_entity?: EntityReferencePayload | null;
      value_datatype?: string | null;
      statement_text?: string | null;
    };
