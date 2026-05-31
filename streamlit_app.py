from __future__ import annotations

from html import escape
import re

import streamlit as st

from ontology_agent.config import ROOT
from ontology_agent.schema import NaturalLanguageStatement, OntologyDraft, Relationship, Rule
from ontology_agent.service import build_draft_from_prompt


EXAMPLE_PATH = ROOT / "examples" / "retirements-ontology-draft.json"


def main() -> None:
    st.set_page_config(
        page_title="Ontology Builder",
        layout="wide",
        initial_sidebar_state="collapsed",
    )
    _inject_css()
    _ensure_state()

    left, right = st.columns([0.76, 0.24], gap="medium")

    with left:
        st.markdown(_render_ontology_panel(st.session_state.current_draft), unsafe_allow_html=True)

    with right:
        _render_chat_panel()


def _ensure_state() -> None:
    if "current_draft" not in st.session_state:
        st.session_state.current_draft = _load_example_draft()
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {
                "role": "assistant",
                "content": "Ask for any domain and I will draft entities, relationships, rules, and statements.",
            }
        ]
    if "last_error" not in st.session_state:
        st.session_state.last_error = None


def _load_example_draft() -> OntologyDraft:
    return OntologyDraft.model_validate_json(EXAMPLE_PATH.read_text())


def _render_chat_panel() -> None:
    st.markdown(
        """
        <section class="chat-panel">
          <div class="chat-heading">
            <span>Ontology chat</span>
            <small>Ask any domain</small>
          </div>
        </section>
        """,
        unsafe_allow_html=True,
    )

    for message in st.session_state.messages[-8:]:
        st.markdown(
            f"""
            <div class="chat-message {escape(message["role"])}">
              {escape(message["content"])}
            </div>
            """,
            unsafe_allow_html=True,
        )

    if st.session_state.last_error:
        st.markdown(
            f'<div class="error-box">{escape(st.session_state.last_error)}</div>',
            unsafe_allow_html=True,
        )

    with st.form("ontology_prompt_form", clear_on_submit=True):
        prompt = st.text_area(
            "Ask for an ontology",
            placeholder="Build an ontology for healthcare referrals focused on prior authorization",
            height=124,
            label_visibility="collapsed",
        )
        submitted = st.form_submit_button("Generate ontology", use_container_width=True)

    col_a, col_b = st.columns(2)
    with col_a:
        reset = st.button("Load sample", use_container_width=True)
    with col_b:
        st.download_button(
            "Download JSON",
            data=st.session_state.current_draft.model_dump_json(indent=2),
            file_name=f"{_slug(st.session_state.current_draft.domain)}-ontology.json",
            mime="application/json",
            use_container_width=True,
        )

    if reset:
        st.session_state.current_draft = _load_example_draft()
        st.session_state.messages.append(
            {"role": "assistant", "content": "Loaded the retirement sample."}
        )
        st.session_state.last_error = None
        st.rerun()

    if submitted and prompt.strip():
        st.session_state.messages.append({"role": "user", "content": prompt.strip()})
        st.session_state.last_error = None
        with st.spinner("Drafting ontology JSON..."):
            try:
                result = build_draft_from_prompt(prompt.strip())
            except Exception as exc:  # pragma: no cover - Streamlit runtime path
                st.session_state.last_error = str(exc)
                st.session_state.messages.append(
                    {"role": "assistant", "content": "I could not generate a valid ontology draft."}
                )
            else:
                st.session_state.current_draft = result.draft
                st.session_state.messages.append(
                    {
                        "role": "assistant",
                        "content": (
                            f"Built {len(result.draft.entities)} entities, "
                            f"{len(result.draft.relationships)} relationships, "
                            f"{len(result.draft.rules)} rules."
                        ),
                    }
                )
        st.rerun()


def _render_ontology_panel(draft: OntologyDraft) -> str:
    readiness, blocking_issues = _readiness(draft)
    statements = "\n".join(_render_statement(statement, draft) for statement in draft.statements)
    return (
        '<section class="ontology-panel">\n'
        '  <div class="status-line">\n'
        f"    <span>Export readiness <strong>{readiness}%</strong></span>\n"
        '    <span class="dot">·</span>\n'
        f'    <span class="issue">{blocking_issues} blocking issues</span>\n'
        "  </div>\n"
        '  <div class="domain-title">\n'
        f"    <span>{escape(draft.domain)}</span>\n"
        f"    <small>{escape(draft.scope or 'general ontology')}</small>\n"
        "  </div>\n"
        '  <div class="statement-list">\n'
        f"{statements}\n"
        "  </div>\n"
        '  <div class="stats-row">\n'
        f"    <span>{len(draft.entities)} entities</span>\n"
        f"    <span>{len(draft.relationships)} relationships</span>\n"
        f"    <span>{len(draft.rules)} rules</span>\n"
        f"    <span>{len(draft.statements)} statements</span>\n"
        "  </div>\n"
        "</section>"
    )


def _render_statement(statement: NaturalLanguageStatement, draft: OntologyDraft) -> str:
    entity_labels = {entity.id: entity.label for entity in draft.entities}
    ranges: list[tuple[int, int, str, str]] = []

    if statement.kind == "relationship" and statement.relationship_id:
        relationship = _relationship_by_id(draft, statement.relationship_id)
        if relationship:
            _add_label_range(
                ranges, statement.text, entity_labels[relationship.subject_entity_id], "entity"
            )
            _add_label_range(
                ranges, statement.text, entity_labels[relationship.object_entity_id], "entity"
            )

    if statement.kind == "rule" and statement.rule_id:
        rule = _rule_by_id(draft, statement.rule_id)
        if rule:
            _add_label_range(
                ranges, statement.text, entity_labels[rule.applies_to_entity_id], "entity"
            )
            if rule.value_entity_id and rule.value_entity_id in entity_labels:
                _add_label_range(
                    ranges, statement.text, entity_labels[rule.value_entity_id], "entity"
                )
            value_phrase = _rule_value_phrase(rule)
            if value_phrase:
                _add_literal_range(ranges, statement.text, value_phrase, "constraint")

    rendered = _render_text_with_ranges(statement.text, ranges)
    return f"<p class='statement'>{rendered}</p>"


def _relationship_by_id(draft: OntologyDraft, relationship_id: str) -> Relationship | None:
    return next(
        (
            relationship
            for relationship in draft.relationships
            if relationship.id == relationship_id
        ),
        None,
    )


def _rule_by_id(draft: OntologyDraft, rule_id: str) -> Rule | None:
    return next((rule for rule in draft.rules if rule.id == rule_id), None)


def _add_label_range(
    ranges: list[tuple[int, int, str, str]],
    text: str,
    label: str,
    class_name: str,
) -> None:
    pattern = re.compile(rf"\b{re.escape(label)}s?\b", re.IGNORECASE)
    match = pattern.search(text)
    if match:
        _add_range(ranges, match.start(), match.end(), match.group(0), class_name)


def _add_literal_range(
    ranges: list[tuple[int, int, str, str]],
    text: str,
    phrase: str,
    class_name: str,
) -> None:
    index = text.lower().find(phrase.lower())
    if index >= 0:
        _add_range(
            ranges, index, index + len(phrase), text[index : index + len(phrase)], class_name
        )


def _add_range(
    ranges: list[tuple[int, int, str, str]],
    start: int,
    end: int,
    label: str,
    class_name: str,
) -> None:
    if any(
        not (end <= existing_start or start >= existing_end)
        for existing_start, existing_end, _, _ in ranges
    ):
        return
    ranges.append((start, end, label, class_name))


def _render_text_with_ranges(text: str, ranges: list[tuple[int, int, str, str]]) -> str:
    if not ranges:
        return escape(text)
    ranges.sort(key=lambda item: item[0])
    cursor = 0
    parts: list[str] = []
    for start, end, label, class_name in ranges:
        parts.append(escape(text[cursor:start]))
        parts.append(f'<span class="chip {class_name}">{escape(label)}</span>')
        cursor = end
    parts.append(escape(text[cursor:]))
    return "".join(parts)


def _rule_value_phrase(rule: Rule) -> str | None:
    if rule.value is None:
        return None
    if rule.operator == "gt":
        return f"greater than {rule.value}"
    if rule.operator == "gte":
        return f"greater than or equal to {rule.value}"
    if rule.operator == "lt":
        return f"less than {rule.value}"
    if rule.operator == "lte":
        return f"less than or equal to {rule.value}"
    if rule.operator == "eq":
        return f"equal to {rule.value}"
    return str(rule.value)


def _readiness(draft: OntologyDraft) -> tuple[int, int]:
    blocking_issues = min(2, len(draft.open_questions))
    readiness = max(70, 98 - blocking_issues * 3 - max(1, len(draft.assumptions) // 2))
    return readiness, blocking_issues


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "ontology"


def _inject_css() -> None:
    st.markdown(
        """
        <style>
          :root {
            --bg: #070912;
            --panel: #0a0d17;
            --panel-2: #0d1320;
            --text: #f2f3f7;
            --muted: #8b91a3;
            --blue: #5b8fe7;
            --blue-bg: #13294b;
            --blue-text: #c7dbff;
            --gold: #d7a84c;
            --gold-bg: #2f2412;
            --gold-text: #f8d488;
            --line: rgba(255, 255, 255, 0.08);
          }
          .stApp {
            background: var(--bg);
            color: var(--text);
          }
          [data-testid="stHeader"], [data-testid="stToolbar"], #MainMenu, footer {
            display: none;
          }
          .block-container {
            max-width: 100%;
            padding: 0.75rem 1.25rem 1.25rem;
          }
          .ontology-panel {
            min-height: calc(100vh - 2rem);
            border: 1px solid var(--line);
            background:
              radial-gradient(circle at 14% 0%, rgba(74, 132, 224, 0.13), transparent 28%),
              linear-gradient(180deg, #080b15 0%, #060811 100%);
            padding: clamp(1.4rem, 3vw, 3rem);
            overflow: hidden;
          }
          .status-line {
            display: flex;
            justify-content: center;
            align-items: baseline;
            gap: 0.45rem;
            color: var(--muted);
            font: 500 1.15rem/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin-bottom: clamp(2rem, 6vh, 4.4rem);
            letter-spacing: 0;
          }
          .status-line strong,
          .status-line .issue {
            color: var(--gold-text);
            font-weight: 650;
          }
          .domain-title {
            display: flex;
            align-items: baseline;
            gap: 0.75rem;
            margin: 0 auto 2.2rem;
            max-width: 980px;
            color: var(--muted);
            font: 600 0.9rem/1.2 ui-sans-serif, system-ui;
            text-transform: uppercase;
            letter-spacing: 0;
          }
          .domain-title span {
            color: #d9deec;
          }
          .domain-title small {
            color: #72798c;
          }
          .statement-list {
            max-width: 980px;
            margin: 0 auto;
          }
          .ontology-panel .statement {
            margin: 0 0 2.05rem;
            color: var(--text);
            font-family: Georgia, "Times New Roman", serif;
            font-size: 2.05rem;
            font-weight: 500;
            line-height: 1.25;
            letter-spacing: 0;
          }
          .ontology-panel .chip {
            display: inline-flex;
            align-items: center;
            min-height: 1.02em;
            padding: 0.01em 0.42em 0.06em;
            border-radius: 0.38em;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-weight: 760;
            line-height: 1.05;
            white-space: nowrap;
            vertical-align: 0.05em;
          }
          .ontology-panel .chip.entity {
            color: var(--blue-text);
            background: var(--blue-bg);
            border: 1px solid rgba(91, 143, 231, 0.9);
          }
          .ontology-panel .chip.constraint {
            color: var(--gold-text);
            background: var(--gold-bg);
            border: 1px solid rgba(215, 168, 76, 0.85);
          }
          .stats-row {
            max-width: 980px;
            display: flex;
            flex-wrap: wrap;
            gap: 0.55rem;
            margin: 2.75rem auto 0;
          }
          .stats-row span {
            color: #a9b1c4;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 0.45rem;
            padding: 0.48rem 0.7rem;
            font: 650 0.78rem/1 ui-sans-serif, system-ui;
          }
          .chat-panel {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 0.5rem;
            padding: 1.2rem;
            margin-bottom: 0.9rem;
          }
          .chat-heading {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            color: var(--text);
            font: 720 1rem/1.2 ui-sans-serif, system-ui;
          }
          .chat-heading small {
            color: var(--muted);
            font: 600 0.78rem/1 ui-sans-serif, system-ui;
          }
          .chat-message {
            border: 1px solid var(--line);
            border-radius: 0.45rem;
            padding: 0.78rem 0.86rem;
            margin: 0 0 0.72rem;
            font: 500 0.9rem/1.45 ui-sans-serif, system-ui;
          }
          .chat-message.assistant {
            color: #cfd6e8;
            background: rgba(255, 255, 255, 0.035);
          }
          .chat-message.user {
            color: #e7f0ff;
            background: rgba(91, 143, 231, 0.14);
            border-color: rgba(91, 143, 231, 0.35);
          }
          .error-box {
            margin: 0 0 0.8rem;
            padding: 0.7rem 0.8rem;
            border-radius: 0.45rem;
            color: #ffd8d8;
            background: rgba(157, 45, 45, 0.22);
            border: 1px solid rgba(255, 120, 120, 0.25);
            font: 600 0.86rem/1.35 ui-sans-serif, system-ui;
          }
          div[data-testid="stForm"] {
            border: 1px solid var(--line);
            border-radius: 0.5rem;
            background: var(--panel-2);
            padding: 0.75rem;
          }
          textarea {
            color: var(--text) !important;
            background: #070a13 !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            border-radius: 0.4rem !important;
            font: 500 0.92rem/1.4 ui-sans-serif, system-ui !important;
          }
          .stButton > button,
          .stDownloadButton > button,
          .stFormSubmitButton > button {
            border-radius: 0.42rem;
            border: 1px solid rgba(91, 143, 231, 0.55);
            background: #14284a;
            color: #dbe8ff;
            font: 720 0.86rem/1 ui-sans-serif, system-ui;
            min-height: 2.55rem;
          }
          .stButton > button:hover,
          .stDownloadButton > button:hover,
          .stFormSubmitButton > button:hover {
            border-color: rgba(123, 169, 244, 0.95);
            color: white;
            background: #19345f;
          }
          @media (max-width: 900px) {
            .ontology-panel .statement {
              font-size: 1.55rem;
              margin-bottom: 1.55rem;
            }
            .status-line {
              justify-content: flex-start;
              margin-bottom: 2rem;
            }
          }
        </style>
        """,
        unsafe_allow_html=True,
    )


if __name__ == "__main__":
    main()
