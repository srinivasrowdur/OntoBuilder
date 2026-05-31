from __future__ import annotations

import argparse
import json
import sys

from ontology_agent.config import load_config
from ontology_agent.knowledge import build_vector_knowledge, ingest_default_knowledge
from ontology_agent.schema import OntologyDraft
from ontology_agent.service import (
    build_draft_from_prompt,
    parse_freeform_request,
    response_to_draft,
)
from ontology_agent.skills import build_skill_index


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
            parsed_request = parse_freeform_request(args.request)
            domain = parsed_request["domain"]
            scope = args.scope or parsed_request["scope"]
            request_text = args.request
        else:
            domain = args.domain
            scope = args.scope
            request_text = None

        try:
            result = build_draft_from_prompt(
                request_text or f"Build an ontology for {domain}",
                scope=scope,
                jurisdiction=args.jurisdiction,
                user_id=args.user_id,
                session_id=args.session_id,
                config=config,
            )
            draft = result.draft
        except RuntimeError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        except Exception as exc:
            print(str(exc), file=sys.stderr)
            return 1
        if config.debug and result.logs:
            print(result.logs, file=sys.stderr)
        data = draft.model_dump(mode="json")
        print(json.dumps(data, indent=None if args.compact else 2))
        return 0

    parser.print_help()
    return 2


_parse_freeform_request = parse_freeform_request


def _response_to_jsonable(content):
    return response_to_draft(content).model_dump(mode="json")


if __name__ == "__main__":
    raise SystemExit(main())
