from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class AgentConfig:
    root: Path = ROOT
    db_path: Path = ROOT / "tmp" / "ontology-agent.db"
    vector_path: Path = ROOT / "tmp" / "ontology-agent-vectors"
    skills_dir: Path = ROOT / "ontology_agent" / "skills"
    model: str = "openai:gpt-5.2"
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
    db_path = Path(os.getenv("ONTOLOGY_AGENT_DB_PATH", str(ROOT / "tmp" / "ontology-agent.db")))
    vector_path = Path(
        os.getenv("ONTOLOGY_AGENT_VECTOR_PATH", str(ROOT / "tmp" / "ontology-agent-vectors"))
    )
    return AgentConfig(
        db_path=db_path,
        vector_path=vector_path,
        model=os.getenv("ONTOLOGY_AGENT_MODEL", "openai:gpt-5.2"),
        vector_db=os.getenv("ONTOLOGY_AGENT_VECTOR_DB", "none").lower(),
        user_id=os.getenv("ONTOLOGY_AGENT_USER_ID", "local-user"),
        session_id=os.getenv("ONTOLOGY_AGENT_SESSION_ID", "ontology-builder"),
        telemetry=os.getenv("ONTOLOGY_AGENT_TELEMETRY", "false").lower() == "true",
        debug=os.getenv("ONTOLOGY_AGENT_DEBUG", "false").lower() == "true",
    )
