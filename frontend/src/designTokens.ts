/**
 * Entity-kind palette shared by every surface that colors an entity:
 * graph nodes, graph legend, statement chips, composer pickers, and
 * inspector links. The same values live as CSS custom properties in
 * tokens.css (--kind-*); designTokens.test.ts keeps the two in sync.
 */
export const ENTITY_KIND_COLORS: Record<string, string> = {
  class: "#3568a0",
  role: "#3a93a3",
  event: "#9a7d3a",
  document: "#7b7dd4",
  process: "#4a9a72",
  state: "#9a6489",
  attribute: "#948043",
  value: "#948043",
  external_reference: "#6e8296",
};

export const DEFAULT_ENTITY_KIND_COLOR = ENTITY_KIND_COLORS.class;

export function entityKindColor(entityType: string): string {
  return ENTITY_KIND_COLORS[entityType] ?? DEFAULT_ENTITY_KIND_COLOR;
}
