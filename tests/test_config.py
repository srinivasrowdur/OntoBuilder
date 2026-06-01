import pytest

from ontology_agent.config import load_config


def test_load_config_selects_openai_provider(monkeypatch):
    monkeypatch.setenv("ONTOLOGY_AGENT_PROVIDER", "openai")
    monkeypatch.setenv("ONTOLOGY_AGENT_MODEL", "")
    monkeypatch.setenv("ONTOLOGY_AGENT_OPENAI_MODEL", "openai:gpt-test")

    config = load_config()

    assert config.provider == "openai"
    assert config.model == "openai:gpt-test"


def test_load_config_selects_google_provider(monkeypatch):
    monkeypatch.setenv("ONTOLOGY_AGENT_PROVIDER", "google")
    monkeypatch.setenv("ONTOLOGY_AGENT_MODEL", "")
    monkeypatch.setenv("ONTOLOGY_AGENT_GOOGLE_MODEL", "google:gemini-test")

    config = load_config()

    assert config.provider == "google"
    assert config.model == "google:gemini-test"


def test_load_config_explicit_model_overrides_provider(monkeypatch):
    monkeypatch.setenv("ONTOLOGY_AGENT_PROVIDER", "openai")
    monkeypatch.setenv("ONTOLOGY_AGENT_MODEL", "google:gemini-explicit")

    config = load_config()

    assert config.provider == "openai"
    assert config.model == "google:gemini-explicit"


def test_load_config_rejects_unsupported_provider(monkeypatch):
    monkeypatch.setenv("ONTOLOGY_AGENT_PROVIDER", "anthropic")
    monkeypatch.setenv("ONTOLOGY_AGENT_MODEL", "")

    with pytest.raises(ValueError, match="Unsupported ONTOLOGY_AGENT_PROVIDER"):
        load_config()
