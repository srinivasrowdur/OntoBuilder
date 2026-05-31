from __future__ import annotations

from html import escape
import json
import os
import re
from typing import Any
from urllib import error, request

import streamlit as st

from ontology_agent.config import ROOT
from ontology_agent.schema import NaturalLanguageStatement, OntologyDraft, Relationship, Rule


EXAMPLE_PATH = ROOT / "examples" / "retirements-ontology-draft.json"
API_BASE_URL = os.getenv("ONTOLOGY_AGENT_API_URL", "http://127.0.0.1:8000").rstrip("/")
REVIEW_STATUSES = {
    "pending": "Pending",
    "accepted": "Accepted",
    "edited": "Edited",
    "rejected": "Rejected",
    "needs_clarification": "Clarify",
}


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
    if "review_session" not in st.session_state:
        st.session_state.review_session = None
    if "selected_statement_id" not in st.session_state:
        st.session_state.selected_statement_id = None
    if "committed_ontology" not in st.session_state:
        st.session_state.committed_ontology = None
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {
                "role": "assistant",
                "content": "Ask for any domain and I will draft reviewable ontology statements.",
            }
        ]
    if "last_error" not in st.session_state:
        st.session_state.last_error = None


def _load_example_draft() -> OntologyDraft:
    return OntologyDraft.model_validate_json(EXAMPLE_PATH.read_text())


def _load_sample_review_session() -> None:
    draft = _load_example_draft()
    st.session_state.last_error = None
    try:
        session = _api_import_draft(draft)
    except Exception as exc:
        st.session_state.current_draft = draft
        st.session_state.review_session = None
        st.session_state.committed_ontology = None
        st.session_state.selected_statement_id = None
        st.session_state.last_error = str(exc)
        st.session_state.messages.append(
            {
                "role": "assistant",
                "content": "Loaded the retirement sample without API review state.",
            }
        )
    else:
        _set_review_session(session)
        st.session_state.messages.append(
            {"role": "assistant", "content": "Loaded the retirement sample for review."}
        )


def _set_review_session(session: dict[str, Any]) -> None:
    st.session_state.review_session = session
    st.session_state.current_draft = _display_draft_from_session(session)
    st.session_state.committed_ontology = None
    statement_ids = [review["statement"]["id"] for review in session["statements"]]
    if st.session_state.selected_statement_id not in statement_ids:
        st.session_state.selected_statement_id = statement_ids[0] if statement_ids else None


def _display_draft_from_session(session: dict[str, Any]) -> OntologyDraft:
    draft_data = dict(session["draft"])
    draft_data["statements"] = [review["statement"] for review in session["statements"]]
    return OntologyDraft.model_validate(draft_data)


def _review_counts(reviews: list[dict[str, Any]]) -> dict[str, int]:
    counts = {status: 0 for status in REVIEW_STATUSES}
    for review in reviews:
        counts[review["status"]] += 1
    return counts


def _selected_statement_id(reviews: list[dict[str, Any]]) -> str | None:
    statement_ids = [review["statement"]["id"] for review in reviews]
    if st.session_state.selected_statement_id in statement_ids:
        return st.session_state.selected_statement_id
    return statement_ids[0] if statement_ids else None


def _review_by_statement_id(
    reviews: list[dict[str, Any]], statement_id: str | None
) -> dict[str, Any] | None:
    return next(
        (review for review in reviews if review["statement"]["id"] == statement_id),
        None,
    )


def _format_statement_option(reviews: list[dict[str, Any]], statement_id: str) -> str:
    review = _review_by_statement_id(reviews, statement_id)
    if not review:
        return statement_id
    status = REVIEW_STATUSES[review["status"]]
    return f"{status}: {review['statement']['text']}"


def _api_create_draft(prompt: str) -> dict[str, Any]:
    return _api_request(
        "POST",
        "/api/ontology/drafts",
        {"prompt": prompt},
        timeout=180,
    )


def _api_import_draft(draft: OntologyDraft) -> dict[str, Any]:
    return _api_request(
        "POST",
        "/api/ontology/drafts/import",
        {
            "draft": draft.model_dump(mode="json"),
            "source_prompt": "Sample retirement draft",
        },
    )


def _api_get_draft(draft_id: str) -> dict[str, Any]:
    return _api_request("GET", f"/api/ontology/drafts/{draft_id}")


def _api_review_statement(
    draft_id: str,
    statement_id: str,
    status: str,
    *,
    text: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"status": status}
    if text is not None:
        payload["text"] = text
    return _api_request(
        "PATCH",
        f"/api/ontology/drafts/{draft_id}/statements/{statement_id}",
        payload,
    )


def _api_bulk_review(
    draft_id: str,
    status: str,
    statement_ids: list[str],
) -> dict[str, Any]:
    return _api_request(
        "POST",
        f"/api/ontology/drafts/{draft_id}/statements/review",
        {"status": status, "statement_ids": statement_ids},
    )


def _api_commit(draft_id: str) -> dict[str, Any]:
    return _api_request("POST", f"/api/ontology/drafts/{draft_id}/commit")


def _api_request(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    *,
    timeout: int = 30,
) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    api_request = request.Request(
        f"{API_BASE_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with request.urlopen(api_request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        raise RuntimeError(_api_error_message(exc)) from exc
    except error.URLError as exc:
        raise RuntimeError(
            f"Review API is unavailable at {API_BASE_URL}. "
            "Run `python -m uvicorn ontology_agent.api:app --port 8000`."
        ) from exc
    return json.loads(body) if body else {}


def _api_error_message(exc: error.HTTPError) -> str:
    body = exc.read().decode("utf-8")
    try:
        detail = json.loads(body).get("detail", body)
    except json.JSONDecodeError:
        detail = body
    return f"API request failed ({exc.code}): {detail}"


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
        download_draft = st.session_state.committed_ontology or st.session_state.current_draft
        st.download_button(
            "Download JSON",
            data=download_draft.model_dump_json(indent=2),
            file_name=f"{_slug(download_draft.domain)}-ontology.json",
            mime="application/json",
            use_container_width=True,
        )

    if reset:
        _load_sample_review_session()
        st.rerun()

    if submitted and prompt.strip():
        st.session_state.messages.append({"role": "user", "content": prompt.strip()})
        st.session_state.last_error = None
        with st.spinner("Drafting ontology JSON through the review API..."):
            try:
                session = _api_create_draft(prompt.strip())
            except Exception as exc:  # pragma: no cover - Streamlit runtime path
                st.session_state.last_error = str(exc)
                st.session_state.messages.append(
                    {"role": "assistant", "content": "I could not generate a valid ontology draft."}
                )
            else:
                _set_review_session(session)
                draft = st.session_state.current_draft
                st.session_state.messages.append(
                    {
                        "role": "assistant",
                        "content": (
                            f"Built {len(draft.entities)} entities, "
                            f"{len(draft.relationships)} relationships, "
                            f"{len(draft.rules)} rules for review."
                        ),
                    }
                )
        st.rerun()

    _render_review_panel()


def _render_review_panel() -> None:
    session = st.session_state.review_session
    st.markdown(
        """
        <section class="review-panel">
          <div class="chat-heading">
            <span>Statement review</span>
            <small>API backed</small>
          </div>
        </section>
        """,
        unsafe_allow_html=True,
    )

    if not session:
        st.markdown(
            '<div class="review-empty">Load a sample or generate a draft to review statements.</div>',
            unsafe_allow_html=True,
        )
        return

    reviews = session["statements"]
    counts = _review_counts(reviews)
    st.markdown(
        f"""
        <div class="review-summary">
          <span>{counts["accepted"] + counts["edited"]} accepted</span>
          <span>{counts["pending"]} pending</span>
          <span>{counts["rejected"]} rejected</span>
        </div>
        """,
        unsafe_allow_html=True,
    )

    if st.button("Accept all pending", use_container_width=True):
        try:
            _set_review_session(
                _api_bulk_review(
                    session["id"],
                    "accepted",
                    [
                        review["statement"]["id"]
                        for review in reviews
                        if review["status"] == "pending"
                    ],
                )
            )
            st.session_state.messages.append(
                {"role": "assistant", "content": "Accepted all pending statements."}
            )
        except Exception as exc:
            st.session_state.last_error = str(exc)
        st.rerun()

    selected_id = _selected_statement_id(reviews)
    selected_review = _review_by_statement_id(reviews, selected_id)
    if selected_review is None:
        return

    statement_options = [review["statement"]["id"] for review in reviews]
    selected_index = statement_options.index(selected_id)
    selected_id = st.selectbox(
        "Statement",
        statement_options,
        index=selected_index,
        format_func=lambda statement_id: _format_statement_option(reviews, statement_id),
        label_visibility="collapsed",
    )
    st.session_state.selected_statement_id = selected_id
    selected_review = _review_by_statement_id(reviews, selected_id)
    if selected_review is None:
        return

    _render_selected_statement_details(selected_review)

    action_a, action_b = st.columns(2)
    with action_a:
        if st.button("Accept", use_container_width=True):
            _apply_statement_decision(session["id"], selected_id, "accepted")
    with action_b:
        if st.button("Reject", use_container_width=True):
            _apply_statement_decision(session["id"], selected_id, "rejected")

    action_c, action_d = st.columns(2)
    with action_c:
        if st.button("Clarify", use_container_width=True):
            _apply_statement_decision(session["id"], selected_id, "needs_clarification")
    with action_d:
        if st.button("Reset", use_container_width=True):
            _apply_statement_decision(session["id"], selected_id, "pending")

    with st.form(f"edit_statement_{selected_id}"):
        edited_text = st.text_area(
            "Edit statement",
            value=selected_review["statement"]["text"],
            height=92,
            label_visibility="collapsed",
        )
        saved = st.form_submit_button("Save edit", use_container_width=True)
        if saved:
            _apply_statement_decision(
                session["id"],
                selected_id,
                "edited",
                text=edited_text.strip(),
            )

    if st.button("Commit accepted", use_container_width=True):
        try:
            committed = _api_commit(session["id"])
            st.session_state.committed_ontology = OntologyDraft.model_validate(
                committed["ontology"]
            )
            st.session_state.messages.append(
                {
                    "role": "assistant",
                    "content": (
                        f"Committed {len(committed['included_statement_ids'])} accepted statements."
                    ),
                }
            )
        except Exception as exc:
            st.session_state.last_error = str(exc)
        st.rerun()


def _render_selected_statement_details(review: dict[str, Any]) -> None:
    statement = review["statement"]
    impact = review["impact"]
    st.markdown(
        f"""
        <div class="selected-statement">
          <span class="status-pill {escape(review["status"])}">
            {escape(REVIEW_STATUSES[review["status"]])}
          </span>
          <p>{escape(statement["text"])}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    impact_items = [
        *[f"Entity: {item['label']}" for item in impact["entities"]],
        *[f"Relationship: {item['label']}" for item in impact["relationships"]],
        *[f"Rule: {item['label']}" for item in impact["rules"]],
    ]
    st.markdown(
        '<div class="impact-list">'
        + "".join(f"<span>{escape(item)}</span>" for item in impact_items)
        + "</div>",
        unsafe_allow_html=True,
    )


def _apply_statement_decision(
    draft_id: str,
    statement_id: str,
    status: str,
    *,
    text: str | None = None,
) -> None:
    if status == "edited" and not text:
        st.session_state.last_error = "Edited statements require text."
        st.rerun()
    try:
        _api_review_statement(draft_id, statement_id, status, text=text)
        _set_review_session(_api_get_draft(draft_id))
        st.session_state.last_error = None
    except Exception as exc:
        st.session_state.last_error = str(exc)
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
          .review-panel {
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 0.5rem;
            padding: 1.2rem;
            margin: 1rem 0 0.9rem;
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
          .review-empty,
          .selected-statement,
          .impact-list {
            border: 1px solid var(--line);
            border-radius: 0.45rem;
            background: rgba(255, 255, 255, 0.035);
            color: #cfd6e8;
            font: 600 0.84rem/1.42 ui-sans-serif, system-ui;
            margin: 0 0 0.75rem;
            padding: 0.78rem 0.86rem;
          }
          .review-summary {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.45rem;
            margin: 0 0 0.75rem;
          }
          .review-summary span {
            border: 1px solid var(--line);
            border-radius: 0.42rem;
            background: rgba(255, 255, 255, 0.04);
            color: #b5bed2;
            padding: 0.52rem 0.48rem;
            text-align: center;
            font: 720 0.76rem/1 ui-sans-serif, system-ui;
          }
          .selected-statement p {
            margin: 0.7rem 0 0;
          }
          .status-pill {
            display: inline-flex;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            padding: 0.25rem 0.52rem;
            font: 800 0.68rem/1 ui-sans-serif, system-ui;
            text-transform: uppercase;
          }
          .status-pill.accepted,
          .status-pill.edited {
            color: #bff5d3;
            background: rgba(50, 150, 92, 0.16);
            border-color: rgba(96, 205, 137, 0.3);
          }
          .status-pill.rejected {
            color: #ffc5c5;
            background: rgba(157, 45, 45, 0.18);
            border-color: rgba(255, 120, 120, 0.25);
          }
          .status-pill.needs_clarification {
            color: var(--gold-text);
            background: rgba(215, 168, 76, 0.12);
            border-color: rgba(215, 168, 76, 0.28);
          }
          .impact-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.42rem;
          }
          .impact-list span {
            border: 1px solid rgba(91, 143, 231, 0.22);
            border-radius: 0.36rem;
            background: rgba(91, 143, 231, 0.08);
            color: #b9c9ea;
            padding: 0.32rem 0.45rem;
            font-size: 0.72rem;
            line-height: 1.1;
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
