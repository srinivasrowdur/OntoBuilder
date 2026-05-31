from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any
import re

import yaml

CORE_SKILL_SEQUENCE = [
    "ontology-scope-control",
    "ontology-domain-discovery",
    "ontology-concept-gathering",
    "ontology-relationship-design",
    "ontology-rule-design",
    "ontology-statement-rendering",
    "ontology-consistency-validation",
    "ontology-json-export",
]


@dataclass(frozen=True)
class SkillMetadata:
    name: str
    description: str
    path: Path
    tags: tuple[str, ...] = ()
    triggers: tuple[str, ...] = ()


def _split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    if not text.startswith("---\n"):
        return {}, text
    _, rest = text.split("---\n", 1)
    frontmatter, body = rest.split("---\n", 1)
    metadata = yaml.safe_load(frontmatter) or {}
    return metadata, body.strip()


def discover_skills(skills_dir: Path) -> list[SkillMetadata]:
    if not skills_dir.exists():
        return []

    skills: list[SkillMetadata] = []
    for skill_file in sorted(skills_dir.glob("*/SKILL.md")):
        metadata, _ = _split_frontmatter(skill_file.read_text())
        name = str(metadata.get("name") or skill_file.parent.name)
        description = str(metadata.get("description") or "")
        nested_metadata = metadata.get("metadata") or {}
        tags = tuple(str(tag).lower() for tag in nested_metadata.get("tags", []))
        triggers = tuple(str(trigger).lower() for trigger in nested_metadata.get("triggers", []))
        skills.append(
            SkillMetadata(
                name=name,
                description=description,
                path=skill_file.parent,
                tags=tags,
                triggers=triggers,
            )
        )
    return skills


def build_skill_index(skills_dir: Path) -> str:
    skills = discover_skills(skills_dir)
    if not skills:
        return "No local ontology skills are currently installed."
    lines = ["Available ontology skills:"]
    for skill in skills:
        lines.append(f"- {skill.name}: {skill.description}")
    return "\n".join(lines)


def plan_ontology_skills(domain: str, scope: str | None, skills_dir: Path) -> str:
    available_skills = discover_skills(skills_dir)
    available = {skill.name for skill in available_skills}
    extension_skills = _match_extension_skills(domain, scope, available_skills)

    selected: list[str] = []
    for skill_name in CORE_SKILL_SEQUENCE:
        if skill_name not in available:
            continue
        selected.append(skill_name)
        if skill_name == "ontology-domain-discovery":
            selected.extend(
                skill.name
                for skill in extension_skills
                if skill.name in available and skill.name not in selected
            )

    return json.dumps(
        {
            "principle": "The domain is primary. Scope is a lens or boundary, not a replacement for the domain.",
            "skill_sequence": selected,
            "domain": domain,
            "scope": scope,
            "extension_skills": [skill.name for skill in extension_skills],
            "coverage_requirement": (
                "Every relationship must have a relationship statement, and every rule must have "
                "a rule statement."
            ),
        },
        indent=2,
    )


def load_skill_text(skills_dir: Path, skill_name: str) -> str:
    safe_name = skill_name.strip().lower()
    skill_file = skills_dir / safe_name / "SKILL.md"
    if not skill_file.exists():
        available = ", ".join(skill.name for skill in discover_skills(skills_dir)) or "none"
        return f"Skill '{skill_name}' was not found. Available skills: {available}."

    metadata, body = _split_frontmatter(skill_file.read_text())
    title = metadata.get("name", safe_name)
    description = metadata.get("description", "")
    return f"# {title}\n\n{description}\n\n{body}"


def build_skill_context(domain: str, scope: str | None, skills_dir: Path) -> str:
    plan = json.loads(plan_ontology_skills(domain, scope, skills_dir))
    sections = [
        "# Ontology Skill Orchestration Plan",
        json.dumps(plan, indent=2),
        "# Loaded Skills",
    ]
    for skill_name in plan["skill_sequence"]:
        sections.append(load_skill_text(skills_dir, skill_name))
    return "\n\n".join(sections)


def _match_extension_skills(
    domain: str,
    scope: str | None,
    skills: list[SkillMetadata],
) -> list[SkillMetadata]:
    domain_text = domain.lower()
    scope_text = (scope or "").lower()
    requested_terms = set(_tokenize(f"{domain_text} {scope_text}"))
    domain_terms = set(_tokenize(domain_text))
    scope_terms = set(_tokenize(scope_text))
    matches: list[tuple[int, SkillMetadata]] = []

    for skill in skills:
        if skill.name in CORE_SKILL_SEQUENCE or skill.name == "ontology-design":
            continue
        score = 0
        for trigger in skill.triggers:
            trigger_text = trigger.lower()
            if trigger_text and trigger_text in domain_text:
                score += 10
            elif trigger_text and trigger_text in scope_text:
                score += 3
        skill_tags = set(skill.tags)
        skill_name_terms = set(_tokenize(skill.name))
        score += 4 * len(domain_terms & skill_tags)
        score += 2 * len(scope_terms & skill_tags)
        score += 2 * len(domain_terms & skill_name_terms)
        score += len(scope_terms & skill_name_terms)
        score += len(requested_terms & skill_tags)
        if score:
            matches.append((score, skill))

    matches.sort(key=lambda item: (-item[0], item[1].name))
    return [skill for _, skill in matches]


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())
