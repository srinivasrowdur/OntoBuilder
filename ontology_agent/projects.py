from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from ontology_agent.review import DraftReviewSession, commit_session
from ontology_agent.schema import NaturalLanguageStatement, OntologyDraft


class ProjectCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1)
    description: str | None = None


class ProjectSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    slug: str
    description: str | None = None
    path: str
    created_at: datetime
    updated_at: datetime
    draft_id: str | None = None
    domain: str | None = None
    scope: str | None = None
    saved_at: datetime | None = None
    entity_count: int = 0
    relationship_count: int = 0
    rule_count: int = 0
    statement_count: int = 0


class ProjectSaveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft_id: str = Field(..., min_length=1)


class ProjectSaveResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: ProjectSummary


class ProjectStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def list_projects(self) -> list[ProjectSummary]:
        projects = [
            self._load_project(project_path)
            for project_path in self.root.iterdir()
            if project_path.is_dir() and (project_path / "project.json").exists()
        ]
        return sorted(projects, key=lambda project: project.updated_at, reverse=True)

    def create_project(self, request: ProjectCreateRequest) -> ProjectSummary:
        now = _now()
        slug = self._unique_slug(request.name)
        project = ProjectSummary(
            id=uuid4().hex,
            name=request.name.strip(),
            slug=slug,
            description=_clean_optional(request.description),
            path=str(self.root / slug),
            created_at=now,
            updated_at=now,
        )
        project_path = self._project_path(project.slug)
        project_path.mkdir(parents=True, exist_ok=True)
        self._write_project(project)
        _write_text(project_path / "project.md", _project_markdown(project))
        return project

    def get_project(self, project_id: str) -> ProjectSummary:
        project_path = self._resolve_project_path(project_id)
        if not project_path:
            raise KeyError(project_id)
        return self._load_project(project_path)

    def save_session(
        self,
        project_id: str,
        session: DraftReviewSession,
    ) -> ProjectSaveResponse:
        project = self.get_project(project_id)
        project_path = self._project_path(project.slug)
        saved_at = _now()
        draft = _draft_from_review_session(session)
        project = project.model_copy(
            update={
                "updated_at": saved_at,
                "draft_id": session.id,
                "domain": draft.domain,
                "scope": draft.scope,
                "saved_at": saved_at,
                "entity_count": len(draft.entities),
                "relationship_count": len(draft.relationships),
                "rule_count": len(draft.rules),
                "statement_count": len(draft.statements),
            }
        )

        self._write_ontology_artifacts(project_path, session, draft, project)
        self._write_project(project)
        _write_text(project_path / "project.md", _project_markdown(project))
        return ProjectSaveResponse(project=project)

    def load_session(self, project_id: str) -> DraftReviewSession:
        project = self.get_project(project_id)
        session_path = self._project_path(project.slug) / "review-session.json"
        if not session_path.exists():
            raise KeyError(project_id)
        return DraftReviewSession.model_validate_json(session_path.read_text())

    def _write_ontology_artifacts(
        self,
        project_path: Path,
        session: DraftReviewSession,
        draft: OntologyDraft,
        project: ProjectSummary,
    ) -> None:
        _write_json(project_path / "ontology.json", draft.model_dump(mode="json"))
        _write_text(project_path / "review-session.json", session.model_dump_json(indent=2))
        _write_text(project_path / "ontology.md", _ontology_markdown(draft, project))
        _write_text(project_path / "statements.md", _statements_markdown(session))

        accepted_path = project_path / "accepted-ontology.json"
        try:
            committed = commit_session(session)
        except ValueError:
            committed = None
        if committed:
            _write_json(accepted_path, committed.ontology.model_dump(mode="json"))
        elif accepted_path.exists():
            accepted_path.unlink()

        _write_entity_files(project_path / "entities", draft)
        _write_relationship_files(project_path / "relationships", draft)
        _write_rule_files(project_path / "rules", draft)

    def _load_project(self, project_path: Path) -> ProjectSummary:
        return ProjectSummary.model_validate_json((project_path / "project.json").read_text())

    def _write_project(self, project: ProjectSummary) -> None:
        project_path = self._project_path(project.slug)
        project_path.mkdir(parents=True, exist_ok=True)
        _write_json(project_path / "project.json", project.model_dump(mode="json"))

    def _project_path(self, slug: str) -> Path:
        return self.root / slug

    def _resolve_project_path(self, project_id: str) -> Path | None:
        if not project_id:
            return None
        slug_path = self._project_path(_slug(project_id))
        if slug_path.exists():
            return slug_path
        for project_path in self.root.iterdir():
            metadata_path = project_path / "project.json"
            if not metadata_path.exists():
                continue
            project = ProjectSummary.model_validate_json(metadata_path.read_text())
            if project.id == project_id:
                return project_path
        return None

    def _unique_slug(self, name: str) -> str:
        base_slug = _slug(name)
        slug = base_slug
        counter = 2
        while self._project_path(slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug


def _draft_from_review_session(session: DraftReviewSession) -> OntologyDraft:
    draft_statement_ids = {statement.id for statement in session.draft.statements}
    statements_by_id = {
        review.statement.id: review.statement
        for review in session.statements
    }
    statements = [
        statements_by_id.get(statement.id, statement)
        for statement in session.draft.statements
    ]
    extra_statements = [
        review.statement
        for review in session.statements
        if review.statement.id not in draft_statement_ids
    ]
    return session.draft.model_copy(update={"statements": [*statements, *extra_statements]})


def _write_entity_files(root: Path, draft: OntologyDraft) -> None:
    _clear_markdown_dir(root)
    for entity in draft.entities:
        _write_text(
            root / f"{_slug(entity.id)}.md",
            "\n".join(
                [
                    _frontmatter(
                        {
                            "id": entity.id,
                            "type": "entity",
                            "label": entity.label,
                            "entity_type": entity.entity_type,
                            "confidence": entity.confidence,
                            "aliases": entity.aliases,
                        }
                    ),
                    f"# {entity.label}",
                    "",
                    entity.description or "No description captured yet.",
                    "",
                    "## Relationships",
                    *[
                        f"- {relationship.label} -> [[{relationship.object_entity_id}]]"
                        for relationship in draft.relationships
                        if relationship.subject_entity_id == entity.id
                    ],
                    *[
                        f"- [[{relationship.subject_entity_id}]] -> {relationship.label}"
                        for relationship in draft.relationships
                        if relationship.object_entity_id == entity.id
                    ],
                ]
            ),
        )


def _write_relationship_files(root: Path, draft: OntologyDraft) -> None:
    _clear_markdown_dir(root)
    for relationship in draft.relationships:
        _write_text(
            root / f"{_slug(relationship.id)}.md",
            "\n".join(
                [
                    _frontmatter(
                        {
                            "id": relationship.id,
                            "type": "relationship",
                            "label": relationship.label,
                            "relationship_type": relationship.relationship_type,
                            "subject": relationship.subject_entity_id,
                            "object": relationship.object_entity_id,
                            "confidence": relationship.confidence,
                        }
                    ),
                    f"# {relationship.label}",
                    "",
                    relationship.description or "No description captured yet.",
                    "",
                    f"- Subject: [[{relationship.subject_entity_id}]]",
                    f"- Object: [[{relationship.object_entity_id}]]",
                    f"- Predicate: `{relationship.predicate}`",
                    f"- Cardinality: {relationship.cardinality.text if relationship.cardinality else 'unspecified'}",
                ]
            ),
        )


def _write_rule_files(root: Path, draft: OntologyDraft) -> None:
    _clear_markdown_dir(root)
    for rule in draft.rules:
        _write_text(
            root / f"{_slug(rule.id)}.md",
            "\n".join(
                [
                    _frontmatter(
                        {
                            "id": rule.id,
                            "type": "rule",
                            "rule_type": rule.rule_type,
                            "severity": rule.severity,
                            "applies_to": rule.applies_to_entity_id,
                            "confidence": rule.confidence,
                        }
                    ),
                    f"# {rule.text}",
                    "",
                    rule.rationale or "No rationale captured yet.",
                    "",
                    f"- Applies to: [[{rule.applies_to_entity_id}]]",
                    f"- Predicate: `{rule.predicate}`",
                    f"- Operator: `{rule.operator}`",
                    f"- Value: {rule.value_entity_id or rule.value or 'exists'}",
                ]
            ),
        )


def _clear_markdown_dir(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    for path in root.glob("*.md"):
        path.unlink()


def _project_markdown(project: ProjectSummary) -> str:
    lines = [
        _frontmatter(
            {
                "id": project.id,
                "type": "project",
                "slug": project.slug,
                "draft_id": project.draft_id,
                "domain": project.domain,
                "created_at": project.created_at.isoformat(),
                "updated_at": project.updated_at.isoformat(),
            }
        ),
        f"# {project.name}",
        "",
        project.description or "No project description yet.",
        "",
        "## Ontology",
    ]
    if project.draft_id:
        lines.extend(
            [
                f"- [[ontology|{project.domain or project.name}]]",
                "- [[statements|Statements]]",
                "- [[entities|Entities]]",
                "- [[relationships|Relationships]]",
                "- [[rules|Rules]]",
            ]
        )
    else:
        lines.append("- No ontology saved yet.")
    return "\n".join(lines) + "\n"


def _ontology_markdown(draft: OntologyDraft, project: ProjectSummary) -> str:
    return "\n".join(
        [
            _frontmatter(
                {
                    "id": project.id,
                    "type": "ontology",
                    "domain": draft.domain,
                    "scope": draft.scope,
                    "saved_at": project.saved_at.isoformat() if project.saved_at else None,
                    "entities": project.entity_count,
                    "relationships": project.relationship_count,
                    "rules": project.rule_count,
                    "statements": project.statement_count,
                }
            ),
            f"# {draft.domain}",
            "",
            draft.summary,
            "",
            "## Map",
            "",
            "- [[statements|Statements]]",
            "- [[entities|Entities]]",
            "- [[relationships|Relationships]]",
            "- [[rules|Rules]]",
            "",
            "## Scope",
            "",
            draft.scope or "General ontology.",
        ]
    ) + "\n"


def _statements_markdown(session: DraftReviewSession) -> str:
    lines = [
        _frontmatter({"type": "statements", "draft_id": session.id}),
        "# Statements",
        "",
    ]
    for review in session.statements:
        statement = review.statement
        lines.extend(
            [
                f"## {statement.id}",
                "",
                f"- Status: `{review.status}`",
                f"- Kind: `{statement.kind}`",
                f"- Subject: [[{statement.subject_entity_id}]]",
                *(_statement_object_lines(statement)),
                "",
                statement.text,
                "",
            ]
        )
    return "\n".join(lines)


def _statement_object_lines(statement: NaturalLanguageStatement) -> list[str]:
    if statement.object_entity_id:
        return [f"- Object: [[{statement.object_entity_id}]]"]
    return []


def _frontmatter(values: dict[str, object]) -> str:
    return "---\n" + "\n".join(_frontmatter_line(key, value) for key, value in values.items()) + "\n---\n"


def _frontmatter_line(key: str, value: object) -> str:
    if isinstance(value, list):
        rendered = ", ".join(str(item) for item in value)
        return f"{key}: [{rendered}]"
    if value is None:
        return f"{key}: null"
    if isinstance(value, str):
        return f"{key}: {json.dumps(value)}"
    return f"{key}: {value}"


def _write_json(path: Path, payload: dict[str, object]) -> None:
    _write_text(path, json.dumps(payload, indent=2))


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(content)
    tmp_path.replace(path)


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "project"


def _now() -> datetime:
    return datetime.now(UTC)
