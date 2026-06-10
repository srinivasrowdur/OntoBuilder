import { describe, expect, it } from "vitest";
import { buildGraphRenderKey, buildOntologyGraphData } from "./graphModel";
import type { OntologyDraft } from "./types";

const draft: OntologyDraft = {
  assumptions: [],
  competency_questions: [],
  domain: "retirements",
  entities: [
    {
      aliases: [],
      confidence: 0.94,
      description: "A retirement plan member.",
      entity_type: "role",
      examples: [],
      id: "member",
      label: "Member",
    },
    {
      aliases: [],
      confidence: 0.91,
      description: "An employer plan.",
      entity_type: "class",
      examples: [],
      id: "pension_scheme",
      label: "Pension Scheme",
    },
  ],
  extension_points: [],
  namespace_suggestion: "https://example.com/retirements#",
  open_questions: [],
  relationships: [
    {
      cardinality: { text: "one" },
      confidence: 0.9,
      description: "A member belongs to a scheme.",
      id: "member_belongs_to_scheme",
      label: "belongs to",
      object_entity_id: "pension_scheme",
      predicate: "belongs_to",
      relationship_type: "membership",
      subject_entity_id: "member",
    },
    {
      cardinality: { text: "optional" },
      confidence: 0.82,
      description: "A member may name a beneficiary.",
      id: "member_names_beneficiary",
      label: "names",
      object_entity_id: "beneficiary",
      predicate: "names",
      relationship_type: "designation",
      subject_entity_id: "member",
    },
  ],
  rules: [],
  scope: "workplace pension schemes",
  statements: [],
  summary: "Retirement ontology.",
};

describe("buildOntologyGraphData", () => {
  it("builds stable graph data and injects missing relationship endpoints", () => {
    const graph = buildOntologyGraphData(draft);

    expect(graph.nodes.map((node) => node.id)).toEqual(["beneficiary", "member", "pension_scheme"]);
    expect(graph.edges.map((edge) => edge.id)).toEqual([
      "member_belongs_to_scheme",
      "member_names_beneficiary",
    ]);
    expect(graph.degreeByEntityId.get("member")).toBe(2);
    expect(graph.degreeByEntityId.get("beneficiary")).toBe(1);
    expect(graph.positionsByEntityId.get("member")).toEqual({ x: 0, y: 0, z: 0 });
    expect(graph.nodes.find((node) => node.id === "beneficiary")).toMatchObject({
      label: "beneficiary",
      subLabel: "entity",
    });
    expect(buildGraphRenderKey(graph)).toBe(
      "beneficiary|member|pension_scheme::member_belongs_to_scheme|member_names_beneficiary",
    );
  });
});
