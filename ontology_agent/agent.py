from __future__ import annotations

import inspect
from typing import Any

from ontology_agent.config import AgentConfig, load_config
from ontology_agent.knowledge import build_vector_knowledge
from ontology_agent.schema import OntologyDraft, OntologyRequest
from ontology_agent.skills import build_native_agno_skills
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
    "Use Agno native skills from the local skills folder; skills are loaded with get_skill_instructions.",
    "If the input includes skill_sequence, call get_skill_instructions for each skill in that order before drafting.",
    "If skill_sequence is empty, call plan_ontology_skill_sequence with the user's domain and scope, then call get_skill_instructions for each returned skill.",
    "If the request includes request_text, use it to understand the user's intent while keeping the extracted domain as the output domain.",
    "Treat the domain as primary and the scope as a lens or boundary.",
    "Return only the structured output requested by the output schema.",
]

DRAFT_MODE_INSTRUCTIONS = [
    "Draft the full ontology in a single pass and emit the structured output directly.",
    "Apply the ontology-consistency-validation skill as a checklist while drafting; "
    "deterministic validation and repair run on the server after your response.",
]

LIVE_STREAM_INSTRUCTIONS = [
    "Write your final response as a plain-text outline with exactly one item per line, "
    "using only these line formats:",
    "DOMAIN: <domain>",
    "SUMMARY: <one-sentence summary>",
    "NAMESPACE: <namespace suggestion>",
    "ENTITY: <label> | <entity_type> | <one-line description>",
    "RELATIONSHIP: <subject label> | <predicate> | <object label> | <cardinality phrase>",
    "RULE: <target entity label> | <severity> | <one-line rule statement>",
    "STATEMENT: <natural-language statement sentence>",
    "Emit the DOMAIN, SUMMARY, and NAMESPACE lines first, then every ENTITY line, "
    "then RELATIONSHIP lines, then RULE lines, then STATEMENT lines.",
]

PARSER_MODEL_PROMPT = (
    "Convert the outline into a single OntologyDraft JSON object. "
    "Create snake_case ids from labels. Every relationship and rule must reference "
    "entity ids that exist in the entities array, and every relationship and rule must "
    "have at least one linked natural-language statement in the statements array. "
    "Return only the JSON object."
)


def build_ontology_agent(
    config: AgentConfig | None = None,
    *,
    draft_mode: bool = False,
    live_stream: bool = False,
) -> Any:
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
    ]
    if not draft_mode:
        tools.extend(
            [
                validate_ontology_draft_json,
                repair_ontology_draft_json,
                make_save_learning_tool(knowledge),
            ]
        )
    tools.extend(make_skill_tools(config.skills_dir))

    use_stream_parser = live_stream and bool(config.parser_model)
    instructions = list(BASE_INSTRUCTIONS)
    if draft_mode:
        instructions.extend(DRAFT_MODE_INSTRUCTIONS)
    if use_stream_parser:
        instructions.extend(LIVE_STREAM_INSTRUCTIONS)

    agent_kwargs: dict[str, Any] = {
        "name": "Ontology Builder",
        "id": "ontology-builder",
        "model": config.model,
        "db": SqliteDb(db_file=str(config.db_path)),
        "tools": tools,
        "description": "Builds domain ontologies as entities, relationships, rules, and statements.",
        "instructions": instructions,
        "input_schema": OntologyRequest,
        "output_schema": OntologyDraft,
        "add_history_to_context": not draft_mode,
        "num_history_runs": config.num_history_runs,
        "max_tool_calls_from_history": config.max_tool_calls_from_history,
        "compress_tool_results": not draft_mode,
        "enable_session_summaries": not draft_mode,
        "add_session_summary_to_context": not draft_mode,
        "tool_call_limit": 12 if draft_mode else 20,
        "markdown": False,
        "telemetry": config.telemetry,
        "debug_mode": config.debug,
    }

    if use_stream_parser:
        agent_kwargs["parser_model"] = config.parser_model
        agent_kwargs["parser_model_prompt"] = PARSER_MODEL_PROMPT

    if not draft_mode:
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

    additional_context = []
    if knowledge_warning:
        additional_context.append(knowledge_warning)

    if "skills" not in agent_params:
        raise RuntimeError("Installed Agno Agent does not support native skills.")
    agent_kwargs["skills"] = build_native_agno_skills(config.skills_dir)

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
