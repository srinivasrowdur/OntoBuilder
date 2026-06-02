from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROVIDER = "google"
DEFAULT_MODELS = {
    "google": "google:gemini-2.5-flash",
    "openai": "openai:gpt-5.2",
}
MODEL_ENV_BY_PROVIDER = {
    "google": "ONTOLOGY_AGENT_GOOGLE_MODEL",
    "openai": "ONTOLOGY_AGENT_OPENAI_MODEL",
}


@dataclass(frozen=True)
class AgentConfig:
    root: Path = ROOT
    db_path: Path = ROOT / "tmp" / "ontology-agent.db"
    vector_path: Path = ROOT / "tmp" / "ontology-agent-vectors"
    review_path: Path = ROOT / "tmp" / "ontology-review-sessions"
    projects_path: Path = ROOT / "projects"
    skills_dir: Path = ROOT / "ontology_agent" / "skills"
    provider: str = DEFAULT_PROVIDER
    model: str = DEFAULT_MODELS[DEFAULT_PROVIDER]
    vector_db: str = "none"
    user_id: str = "local-user"
    session_id: str = "ontology-builder"
    num_history_runs: int = 3
    num_history_messages: int = 20
    max_tool_calls_from_history: int = 3
    telemetry: bool = False
    debug: bool = False


def load_config() -> AgentConfig:
    load_dotenv(ROOT / ".env")
    provider = _resolve_provider()
    db_path = Path(os.getenv("ONTOLOGY_AGENT_DB_PATH", str(ROOT / "tmp" / "ontology-agent.db")))
    vector_path = Path(
        os.getenv("ONTOLOGY_AGENT_VECTOR_PATH", str(ROOT / "tmp" / "ontology-agent-vectors"))
    )
    review_path = Path(
        os.getenv("ONTOLOGY_AGENT_REVIEW_PATH", str(ROOT / "tmp" / "ontology-review-sessions"))
    )
    projects_path = Path(os.getenv("ONTOLOGY_AGENT_PROJECTS_PATH", str(ROOT / "projects")))
    return AgentConfig(
        db_path=db_path,
        vector_path=vector_path,
        review_path=review_path,
        projects_path=projects_path,
        provider=provider,
        model=_resolve_model(provider),
        vector_db=os.getenv("ONTOLOGY_AGENT_VECTOR_DB", "none").lower(),
        user_id=os.getenv("ONTOLOGY_AGENT_USER_ID", "local-user"),
        session_id=os.getenv("ONTOLOGY_AGENT_SESSION_ID", "ontology-builder"),
        telemetry=os.getenv("ONTOLOGY_AGENT_TELEMETRY", "false").lower() == "true",
        debug=os.getenv("ONTOLOGY_AGENT_DEBUG", "false").lower() == "true",
    )


def _resolve_provider() -> str:
    provider = (os.getenv("ONTOLOGY_AGENT_PROVIDER") or DEFAULT_PROVIDER).strip().lower()
    if provider not in DEFAULT_MODELS:
        supported = ", ".join(sorted(DEFAULT_MODELS))
        raise ValueError(f"Unsupported ONTOLOGY_AGENT_PROVIDER={provider!r}. Use one of: {supported}.")
    return provider


def _resolve_model(provider: str) -> str:
    explicit_model = os.getenv("ONTOLOGY_AGENT_MODEL", "").strip()
    if explicit_model:
        return explicit_model

    provider_model = os.getenv(MODEL_ENV_BY_PROVIDER[provider], "").strip()
    return provider_model or DEFAULT_MODELS[provider]
