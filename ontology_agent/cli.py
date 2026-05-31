from __future__ import annotations

import argparse
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import re
import sys
from typing import Any

from ontology_agent.agent import build_ontology_agent
from ontology_agent.config import load_config
from ontology_agent.knowledge import build_vector_knowledge, ingest_default_knowledge
from ontology_agent.repair import repair_ontology_draft_payload
from ontology_agent.schema import OntologyDraft, OntologyRequest
from ontology_agent.skills import build_skill_context, build_skill_index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the ontology-building Agno agent.")
    subparsers = parser.add_subparsers(dest="command")

    build_parser = subparsers.add_parser("build", help="Build an ontology draft for a domain.")
    build_parser.add_argument("domain", help="Domain to model, for example retirements.")
    build_parser.add_argument("--scope", default=None, help="Optional scope boundary.")
    build_parser.add_argument("--jurisdiction", default=None, help="Optional jurisdiction.")
    build_parser.add_argument("--user-id", default=None)
    build_parser.add_argument("--session-id", default=None)
    build_parser.add_argument("--compact", action="store_true", help="Print compact JSON.")

    ask_parser = subparsers.add_parser(
        "ask",
        help="Build an ontology draft from a natural-language request.",
    )
    ask_parser.add_argument(
        "request",
        help='Natural-language request, for example "build an ontology for insurance claims".',
    )
    ask_parser.add_argument("--scope", default=None, help="Optional scope override.")
    ask_parser.add_argument("--jurisdiction", default=None, help="Optional jurisdiction.")
    ask_parser.add_argument("--user-id", default=None)
    ask_parser.add_argument("--session-id", default=None)
    ask_parser.add_argument("--compact", action="store_true", help="Print compact JSON.")

    subparsers.add_parser("schema", help="Print the JSON schema used for agent output.")
    subparsers.add_parser("skills", help="List local ontology skills.")
    subparsers.add_parser("ingest", help="Ingest default project docs into vector knowledge.")

    args = parser.parse_args(argv)
    command = args.command or "build"
    config = load_config()

    if command == "schema":
        print(json.dumps(OntologyDraft.model_json_schema(), indent=2))
        return 0

    if command == "skills":
        print(build_skill_index(config.skills_dir))
        return 0

    if command == "ingest":
        knowledge, warning = build_vector_knowledge(config)
        if not knowledge:
            print(warning or "Vector knowledge is unavailable.", file=sys.stderr)
            return 1
        count = ingest_default_knowledge(knowledge)
        print(f"Ingested {count} knowledge paths.")
        return 0

    if command in {"build", "ask"}:
        if command == "ask":
            parsed_request = _parse_freeform_request(args.request)
            domain = parsed_request["domain"]
            scope = args.scope or parsed_request["scope"]
            request_text = args.request
        else:
            domain = args.domain
            scope = args.scope
            request_text = None

        try:
            skill_context = build_skill_context(domain, scope, config.skills_dir)
            runtime_logs = io.StringIO()
            request = OntologyRequest(
                domain=domain,
                scope=scope,
                jurisdiction=args.jurisdiction,
                request_text=request_text,
                skill_context=skill_context,
            )
            with redirect_stdout(runtime_logs), redirect_stderr(runtime_logs):
                agent = build_ontology_agent(config)
                response = agent.run(
                    input=request,
                    user_id=args.user_id or config.user_id,
                    session_id=args.session_id or config.session_id,
                    dependencies={"ontology_skill_context": skill_context},
                    add_dependencies_to_context=True,
                )
        except RuntimeError as exc:
            if "runtime_logs" in locals() and runtime_logs.getvalue():
                print(runtime_logs.getvalue(), file=sys.stderr)
            print(str(exc), file=sys.stderr)
            return 1
        except Exception as exc:
            if "runtime_logs" in locals() and runtime_logs.getvalue():
                print(runtime_logs.getvalue(), file=sys.stderr)
            print(str(exc), file=sys.stderr)
            return 1
        if config.debug and runtime_logs.getvalue():
            print(runtime_logs.getvalue(), file=sys.stderr)
        data = _response_to_jsonable(response.content)
        print(json.dumps(data, indent=None if args.compact else 2))
        return 0

    parser.print_help()
    return 2


def _response_to_jsonable(content: Any) -> dict[str, Any]:
    if isinstance(content, OntologyDraft):
        return content.model_dump(mode="json")
    if hasattr(content, "model_dump"):
        return content.model_dump(mode="json")
    if isinstance(content, str):
        try:
            draft = OntologyDraft.model_validate_json(content)
        except Exception:
            draft = repair_ontology_draft_payload(content)
        return draft.model_dump(mode="json")
    if isinstance(content, dict):
        try:
            draft = OntologyDraft.model_validate(content)
        except Exception:
            draft = repair_ontology_draft_payload(content)
        return draft.model_dump(mode="json")
    raise TypeError(f"Unsupported response content type: {type(content)!r}")


def _parse_freeform_request(request: str) -> dict[str, str | None]:
    text = " ".join(request.strip().split())
    scope = None

    scope_markers = [
        " scoped to ",
        " with scope ",
        " focusing on ",
        " focused on ",
        " around ",
    ]
    for marker in scope_markers:
        if marker in text.lower():
            index = text.lower().index(marker)
            scope = text[index + len(marker) :].strip(" .")
            text = text[:index].strip(" .")
            break

    domain = text
    patterns = [
        r"(?i)^.*?\b(?:ontology|model)\s+(?:for|about|of)\s+(.+)$",
        r"(?i)^.*?\b(?:for|about|of)\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.match(pattern, text)
        if match:
            domain = match.group(1).strip(" .")
            break

    return {"domain": domain, "scope": scope}


if __name__ == "__main__":
    raise SystemExit(main())
