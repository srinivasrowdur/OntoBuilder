from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from rdflib import Graph, Literal, URIRef
from rdflib.namespace import RDFS, SKOS

from ontology_agent.config import ROOT
from ontology_agent.repair import repair_ontology_draft_payload
from ontology_agent.schema import OntologyDraft
from ontology_agent.skills import build_skill_index, plan_ontology_skills


PROJECT_KNOWLEDGE_FILES = (
    ROOT / "README.md",
    ROOT / "contracts-basic-ontology.ttl",
    ROOT / "shapes" / "contracts-core.shapes.ttl",
    ROOT / "examples" / "sample-nda.ttl",
)


def make_identifier(label: str) -> str:
    """Return a stable snake_case identifier for an ontology label."""
    text = label.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    if not text:
        return "unnamed"
    if text[0].isdigit():
        text = f"n_{text}"
    return text


def search_project_knowledge(query: str, limit: int = 5) -> str:
    """Search local ontology and skill reference files with simple keyword matching."""
    terms = [term.lower() for term in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]+", query)]
    if not terms:
        return json.dumps({"matches": []})

    matches: list[dict[str, Any]] = []
    for path in PROJECT_KNOWLEDGE_FILES:
        if not path.exists():
            continue
        text = path.read_text(errors="ignore")
        chunks = [chunk.strip() for chunk in re.split(r"\n\s*\n", text) if chunk.strip()]
        for chunk in chunks:
            lower = chunk.lower()
            score = sum(lower.count(term) for term in terms)
            if score:
                matches.append(
                    {
                        "file": str(path.relative_to(ROOT)),
                        "score": score,
                        "snippet": chunk[:1200],
                    }
                )

    matches.sort(key=lambda item: item["score"], reverse=True)
    return json.dumps({"matches": matches[: max(1, min(limit, 20))]}, indent=2)


def search_existing_contract_ontology(query: str, limit: int = 10) -> str:
    """Search existing contract ontology labels and definitions for reuse patterns."""
    ontology_path = ROOT / "contracts-basic-ontology.ttl"
    if not ontology_path.exists():
        return json.dumps({"matches": [], "error": "contracts-basic-ontology.ttl not found"})

    graph = Graph()
    graph.parse(ontology_path, format="turtle")
    terms = [term.lower() for term in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]+", query)]
    results: list[dict[str, Any]] = []

    for subject in set(graph.subjects()):
        if not isinstance(subject, URIRef):
            continue
        label = _first_literal(graph, subject, RDFS.label) or _local_name(subject)
        definition = _first_literal(graph, subject, SKOS.definition)
        custom_definition = _first_literal(
            graph, subject, URIRef("https://rowdur.com/ontology/contracts#definition")
        )
        description = _first_literal(
            graph, subject, URIRef("https://rowdur.com/ontology/contracts#description")
        )
        haystack = " ".join(
            value for value in [label, definition, custom_definition, description] if value
        ).lower()
        score = sum(haystack.count(term) for term in terms)
        if score:
            results.append(
                {
                    "iri": str(subject),
                    "local_name": _local_name(subject),
                    "label": label,
                    "definition": definition or custom_definition,
                    "description": description,
                    "score": score,
                }
            )

    results.sort(key=lambda item: item["score"], reverse=True)
    return json.dumps({"matches": results[: max(1, min(limit, 50))]}, indent=2)


def validate_ontology_draft_json(payload: str) -> str:
    """Validate a JSON ontology draft against the canonical output schema."""
    try:
        draft = OntologyDraft.model_validate_json(payload)
    except Exception as exc:
        return json.dumps({"valid": False, "error": str(exc)}, indent=2)

    return json.dumps(
        {
            "valid": True,
            "domain": draft.domain,
            "entity_count": len(draft.entities),
            "relationship_count": len(draft.relationships),
            "rule_count": len(draft.rules),
            "statement_count": len(draft.statements),
        },
        indent=2,
    )


def repair_ontology_draft_json(payload: str) -> str:
    """Repair missing ontology statements and return schema-valid JSON."""
    try:
        draft = repair_ontology_draft_payload(payload)
    except Exception as exc:
        return json.dumps({"valid": False, "error": str(exc)}, indent=2)

    return draft.model_dump_json(indent=2)


def make_skill_tools(skills_dir: Path):
    def plan_ontology_skill_sequence(domain: str, scope: str | None = None) -> str:
        """Plan the skill sequence to use for an ontology-building request."""
        return plan_ontology_skills(domain, scope, skills_dir)

    def list_ontology_skills() -> str:
        """List local ontology skills available to the agent."""
        return build_skill_index(skills_dir)

    return [plan_ontology_skill_sequence, list_ontology_skills]


def make_save_learning_tool(knowledge: Any | None):
    def save_validated_learning(title: str, insight: str, tags: list[str] | None = None) -> str:
        """Save a durable ontology-design insight after it has been validated."""
        if not knowledge:
            return "Vector knowledge is disabled; learning was not persisted."

        metadata = {"kind": "learned_ontology_insight", "tags": tags or []}
        text_content = f"{title}\n\n{insight}"
        if hasattr(knowledge, "insert"):
            knowledge.insert(name=title, text_content=text_content, metadata=metadata)
        elif hasattr(knowledge, "add_content"):
            knowledge.add_content(name=title, text_content=text_content, metadata=metadata)
        else:
            return "Knowledge backend does not support inserting content."
        return f"Saved learning: {title}"

    return save_validated_learning


def _first_literal(graph: Graph, subject: URIRef, predicate: URIRef) -> str | None:
    for obj in graph.objects(subject, predicate):
        if isinstance(obj, Literal):
            return str(obj)
    return None


def _local_name(iri: URIRef) -> str:
    text = str(iri)
    if "#" in text:
        return text.rsplit("#", 1)[1]
    return text.rstrip("/").rsplit("/", 1)[-1]
