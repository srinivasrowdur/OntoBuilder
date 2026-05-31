from __future__ import annotations

from pathlib import Path
from typing import Any

from ontology_agent.config import AgentConfig, ROOT


DEFAULT_KNOWLEDGE_PATHS = (
    ROOT / "README.md",
    ROOT / "contracts-basic-ontology.ttl",
    ROOT / "shapes" / "contracts-core.shapes.ttl",
    ROOT / "examples" / "sample-nda.ttl",
    ROOT / "ontology_agent" / "skills",
)


def build_vector_knowledge(config: AgentConfig) -> tuple[Any | None, str | None]:
    """Build an optional Agno Knowledge backend.

    The local keyword-search tool is always available. This vector backend is optional
    because vector database optional dependencies are environment-sensitive.
    """
    if config.vector_db == "none":
        return None, "Vector knowledge disabled by ONTOLOGY_AGENT_VECTOR_DB=none."

    try:
        from agno.knowledge.knowledge import Knowledge
    except Exception as exc:  # pragma: no cover - environment-specific
        return None, f"Agno Knowledge is unavailable: {exc}"

    if config.vector_db == "chroma":
        try:
            from agno.vectordb.chroma import ChromaDb
        except Exception as exc:  # pragma: no cover - environment-specific
            return None, f"Chroma vector backend unavailable: {exc}"
        vector_db = ChromaDb(
            collection="ontology_agent",
            path=str(config.vector_path),
            persistent_client=True,
        )
    else:
        return None, f"Unsupported vector backend: {config.vector_db}"

    return (
        Knowledge(
            name="Ontology Agent Knowledge",
            description="Project ontology patterns, skill references, and learned modeling insights.",
            vector_db=vector_db,
            max_results=8,
        ),
        None,
    )


def ingest_default_knowledge(
    knowledge: Any, paths: tuple[Path, ...] = DEFAULT_KNOWLEDGE_PATHS
) -> int:
    count = 0
    for path in paths:
        if not path.exists():
            continue
        if hasattr(knowledge, "insert"):
            knowledge.insert(path=str(path), metadata={"source": str(path.relative_to(ROOT))})
        elif hasattr(knowledge, "add_content"):
            knowledge.add_content(path=str(path), metadata={"source": str(path.relative_to(ROOT))})
        else:
            raise RuntimeError("Knowledge backend does not expose insert or add_content")
        count += 1
    return count
