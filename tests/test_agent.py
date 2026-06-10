from pathlib import Path

import pytest

from ontology_agent.agent import build_ontology_agent
from ontology_agent.config import ROOT, AgentConfig


@pytest.fixture
def config(tmp_path: Path) -> AgentConfig:
    return AgentConfig(
        db_path=tmp_path / "agent.db",
        vector_path=tmp_path / "vectors",
        review_path=tmp_path / "reviews",
        projects_path=tmp_path / "projects",
        skills_dir=ROOT / "ontology_agent" / "skills",
        provider="openai",
        model="openai:gpt-5.2",
    )


def _tool_names(agent) -> set[str]:
    names = set()
    for tool in agent.tools or []:
        names.add(getattr(tool, "__name__", None) or getattr(tool, "name", str(tool)))
    return names


def test_draft_mode_excludes_agent_side_validation_tools(config: AgentConfig) -> None:
    agent = build_ontology_agent(config, draft_mode=True)
    names = _tool_names(agent)
    assert "validate_ontology_draft_json" not in names
    assert "repair_ontology_draft_json" not in names
    assert "save_validated_learning" not in names
    assert "make_identifier" in names
    assert "plan_ontology_skill_sequence" in names


def test_draft_mode_disables_per_run_bookkeeping(config: AgentConfig) -> None:
    agent = build_ontology_agent(config, draft_mode=True)
    assert agent.add_history_to_context is False
    assert agent.enable_session_summaries is False
    assert agent.add_session_summary_to_context is False
    assert agent.compress_tool_results is False
    assert agent.tool_call_limit == 12


def test_default_mode_keeps_validation_tools_and_history(config: AgentConfig) -> None:
    agent = build_ontology_agent(config)
    names = _tool_names(agent)
    assert "validate_ontology_draft_json" in names
    assert "repair_ontology_draft_json" in names
    assert agent.add_history_to_context is True
    assert agent.enable_session_summaries is True
    assert agent.tool_call_limit == 20


def test_live_stream_mode_sets_parser_model_and_outline_grammar(config: AgentConfig) -> None:
    import dataclasses

    streaming_config = dataclasses.replace(config, parser_model="openai:gpt-5.4-mini")
    agent = build_ontology_agent(streaming_config, draft_mode=True, live_stream=True)
    assert agent.parser_model is not None
    assert any("ENTITY:" in instruction for instruction in agent.instructions)


def test_live_stream_without_parser_model_falls_back(config: AgentConfig) -> None:
    import dataclasses

    no_parser_config = dataclasses.replace(config, parser_model="")
    agent = build_ontology_agent(no_parser_config, draft_mode=True, live_stream=True)
    assert agent.parser_model is None
    assert not any("ENTITY:" in instruction for instruction in agent.instructions)


def test_draft_mode_alone_has_no_parser_model(config: AgentConfig) -> None:
    agent = build_ontology_agent(config, draft_mode=True)
    assert agent.parser_model is None
