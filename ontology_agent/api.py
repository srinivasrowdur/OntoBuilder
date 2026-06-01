from __future__ import annotations

from collections.abc import Callable
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from ontology_agent.config import ROOT, load_config
from ontology_agent.review import (
    BulkStatementDecisionRequest,
    CommitResponse,
    DraftReviewSession,
    EntityUpdateRequest,
    ReviewStore,
    StatementCreateRequest,
    StatementDecisionRequest,
    StatementReview,
)
from ontology_agent.schema import OntologyDraft
from ontology_agent.service import OntologyRunResult, build_draft_from_prompt


class DraftBuildRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(..., min_length=2)
    scope: str | None = None
    jurisdiction: str | None = None
    user_id: str | None = None
    session_id: str | None = None


class DraftImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    draft: OntologyDraft
    source_prompt: str = Field(default="Imported ontology draft", min_length=1)


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"]
    service: str


BuildDraftCallable = Callable[..., OntologyRunResult]


def create_app(
    *,
    store: ReviewStore | None = None,
    build_draft: BuildDraftCallable = build_draft_from_prompt,
) -> FastAPI:
    config = load_config()
    review_store = store or ReviewStore(config.review_path)
    app = FastAPI(
        title="Ontology Review API",
        description=(
            "API for drafting ontologies with Agno and reviewing human-readable "
            "statements before committing entities, relationships, and rules."
        ),
        version="0.1.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8501",
            "http://127.0.0.1:8501",
        ],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        return HealthResponse(status="ok", service="ontology-review-api")

    @app.post(
        "/api/ontology/drafts",
        response_model=DraftReviewSession,
        tags=["drafts"],
    )
    def create_draft(request: DraftBuildRequest) -> DraftReviewSession:
        try:
            result = build_draft(
                request.prompt,
                scope=request.scope,
                jurisdiction=request.jurisdiction,
                user_id=request.user_id,
                session_id=request.session_id,
                config=config,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return review_store.create_session(result.draft, source_prompt=request.prompt)

    @app.post(
        "/api/ontology/drafts/import",
        response_model=DraftReviewSession,
        tags=["drafts"],
    )
    def import_draft(request: DraftImportRequest) -> DraftReviewSession:
        return review_store.create_session(request.draft, source_prompt=request.source_prompt)

    @app.post(
        "/api/ontology/drafts/samples/{sample_name}",
        response_model=DraftReviewSession,
        tags=["drafts"],
    )
    def create_sample_draft(sample_name: Literal["retirements"]) -> DraftReviewSession:
        sample_paths = {
            "retirements": ROOT / "examples" / "retirements-ontology-draft.json",
        }
        draft = OntologyDraft.model_validate_json(sample_paths[sample_name].read_text())
        return review_store.create_session(draft, source_prompt=f"Sample {sample_name} draft")

    @app.get(
        "/api/ontology/drafts/{draft_id}",
        response_model=DraftReviewSession,
        tags=["drafts"],
    )
    def get_draft(draft_id: str) -> DraftReviewSession:
        return _get_session_or_404(review_store, draft_id)

    @app.patch(
        "/api/ontology/drafts/{draft_id}/statements/{statement_id}",
        response_model=StatementReview,
        tags=["review"],
    )
    def review_statement(
        draft_id: str,
        statement_id: str,
        decision: StatementDecisionRequest,
    ) -> StatementReview:
        _get_session_or_404(review_store, draft_id)
        try:
            return review_store.update_statement(draft_id, statement_id, decision)
        except KeyError as exc:
            raise HTTPException(
                status_code=404, detail=f"Statement not found: {statement_id}"
            ) from exc

    @app.post(
        "/api/ontology/drafts/{draft_id}/statements",
        response_model=DraftReviewSession,
        tags=["review"],
    )
    def create_statement(
        draft_id: str,
        request: StatementCreateRequest,
    ) -> DraftReviewSession:
        _get_session_or_404(review_store, draft_id)
        try:
            return review_store.add_statement(draft_id, request)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post(
        "/api/ontology/drafts/{draft_id}/statements/review",
        response_model=DraftReviewSession,
        tags=["review"],
    )
    def review_statements(
        draft_id: str,
        decision: BulkStatementDecisionRequest,
    ) -> DraftReviewSession:
        _get_session_or_404(review_store, draft_id)
        try:
            return review_store.bulk_update(draft_id, decision)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.patch(
        "/api/ontology/drafts/{draft_id}/entities/{entity_id}",
        response_model=DraftReviewSession,
        tags=["review"],
    )
    def update_entity(
        draft_id: str,
        entity_id: str,
        request: EntityUpdateRequest,
    ) -> DraftReviewSession:
        _get_session_or_404(review_store, draft_id)
        try:
            return review_store.update_entity(draft_id, entity_id, request)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=f"Entity not found: {entity_id}") from exc

    @app.post(
        "/api/ontology/drafts/{draft_id}/commit",
        response_model=CommitResponse,
        tags=["commit"],
    )
    def commit_draft(draft_id: str) -> CommitResponse:
        _get_session_or_404(review_store, draft_id)
        try:
            return review_store.commit(draft_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get(
        "/api/ontology/drafts/{draft_id}/export",
        response_model=OntologyDraft,
        tags=["commit"],
    )
    def export_draft(
        draft_id: str,
        status: Literal["accepted", "all"] = Query(default="accepted"),
    ) -> OntologyDraft:
        session = _get_session_or_404(review_store, draft_id)
        if status == "all":
            return session.draft
        try:
            return review_store.commit(draft_id).ontology
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return app


def _get_session_or_404(store: ReviewStore, draft_id: str) -> DraftReviewSession:
    try:
        return store.get(draft_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Draft not found: {draft_id}") from exc


app = create_app()
