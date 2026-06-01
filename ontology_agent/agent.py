from __future__ import annotations

import inspect
from typing import Any

from ontology_agent.config import AgentConfig, load_config
from ontology_agent.knowledge import build_vector_knowledge
from ontology_agent.schema import OntologyDraft, OntologyRequest
from ontology_agent.skills import build_skill_index
from ontology_agent.tools import (
    make_save_learning_tool,
    make_skill_tools,
    make_identifier,
    repair_ontology_draft_json,
    search_existing_contract_ontology,
    search_project_knowledge,
    validate_ontology_draft_json,
)


BASE_INSTRUCTIONS = [
    "You are an ontology skill orchestrator.",
    "Before drafting, call plan_ontology_skill_sequence with the user's domain and scope.",
    "Load and follow each skill in the returned skill_sequence.",
    "If ontology skill context is supplied as a dependency, treat it as the governing workflow.",
    "If the request includes request_text, use it to understand the user's intent while keeping the extracted domain as the output domain.",
    "Treat the domain as primary and the scope as a lens or boundary.",
    "Return only the structured output requested by the output schema.",
]


def build_ontology_agent(config: AgentConfig | None = None) -> Any:
    config = config or load_config()
    config.db_path.parent.mkdir(parents=True, exist_ok=True)
    config.vector_path.mkdir(parents=True, exist_ok=True)

    from agno.agent import Agent
    from agno.db.sqlite import SqliteDb

    agent_params = inspect.signature(Agent).parameters
    knowledge, knowledge_warning = build_vector_knowledge(config)

    tools = [
        make_identifier,
        search_project_knowledge,
        search_existing_contract_ontology,
        validate_ontology_draft_json,
        repair_ontology_draft_json,
        make_save_learning_tool(knowledge),
    ]
    tools.extend(make_skill_tools(config.skills_dir))

    agent_kwargs: dict[str, Any] = {
        "name": "Ontology Builder",
        "id": "ontology-builder",
        "model": config.model,
        "db": SqliteDb(db_file=str(config.db_path)),
        "tools": tools,
        "description": "Builds domain ontologies as entities, relationships, rules, and statements.",
        "instructions": BASE_INSTRUCTIONS,
        "input_schema": OntologyRequest,
        "output_schema": OntologyDraft,
        "add_history_to_context": True,
        "num_history_runs": config.num_history_runs,
        "max_tool_calls_from_history": config.max_tool_calls_from_history,
        "compress_tool_results": True,
        "enable_session_summaries": True,
        "add_session_summary_to_context": True,
        "tool_call_limit": 20,
        "markdown": False,
        "telemetry": config.telemetry,
        "debug_mode": config.debug,
    }

    if "update_memory_on_run" in agent_params:
        agent_kwargs["update_memory_on_run"] = True
    elif "enable_user_memories" in agent_params:
        agent_kwargs["enable_user_memories"] = True

    if "add_memories_to_context" in agent_params:
        agent_kwargs["add_memories_to_context"] = True

    if knowledge is not None:
        agent_kwargs["knowledge"] = knowledge
        agent_kwargs["search_knowledge"] = True
    else:
        agent_kwargs["search_knowledge"] = False

    additional_context = [
        build_skill_index(config.skills_dir),
        "Use list_ontology_skills and load_ontology_skill if native Agno Skills are not available.",
    ]
    if knowledge_warning:
        additional_context.append(knowledge_warning)

    if "skills" in agent_params:
        try:  # pragma: no cover - depends on installed Agno version
            from agno.skills import LocalSkills, Skills

            agent_kwargs["skills"] = Skills(loaders=[LocalSkills(str(config.skills_dir))])
        except Exception as exc:
            additional_context.append(f"Native Agno Skills unavailable: {exc}")

    agent_kwargs["additional_context"] = "\n\n".join(additional_context)

    _validate_model_runtime(config.model)

    return Agent(**{key: value for key, value in agent_kwargs.items() if key in agent_params})


def _validate_model_runtime(model: str) -> None:
    if model.startswith("google:"):
        try:
            import google.genai  # noqa: F401
        except Exception as exc:
            raise RuntimeError(
                "Agno's Google Gemini model provider requires the google-genai package. "
                "Run `python -m pip install -e '.[test]'` inside this project environment."
            ) from exc
        return

    if model.startswith("openai:"):
        try:
            from openai import APIConnectionError  # noqa: F401
        except Exception as exc:
            raise RuntimeError(
                "Agno's OpenAI model provider requires a current OpenAI Python client. "
                "Run `python -m pip install -U openai` inside the environment used for this agent."
            ) from exc
