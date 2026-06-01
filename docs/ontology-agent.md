# Ontology Agent

This repo now includes a small Agno-oriented ontology-building agent. It turns a domain prompt such as `retirements` into parseable JSON containing entities, relationships, rules, natural-language statements, assumptions, and competency questions.

The agent is intentionally skill-driven internally, but users do not need to know about skills. A user can ask for any domain directly. The base agent orchestrates generic ontology workflow skills and optionally loads domain-specific skills when developers add them.

The design follows the screenshot pattern:

```text
A Member belongs to a Pension Scheme.
A Member makes one or more Contributions.
An Employer sponsors a Pension Scheme.
A Member names a Beneficiary.
A Contribution must have an amount greater than 0.
```

In JSON, relationship statements and rule statements are linked back to structured objects by id, so a UI can render the natural sentence while code can parse the graph safely.

The schema enforces statement coverage: every relationship and every rule must have at least one linked natural-language statement.
The CLI also runs a deterministic repair pass before printing output, so omitted statements are filled in before final schema validation.

## Architecture

- `ontology_agent/schema.py`: Pydantic input and output schemas.
- `ontology_agent/agent.py`: Agno agent construction with memory, history limits, session summaries, compression, tools, optional vector knowledge, and skill loading.
- `ontology_agent/tools.py`: local knowledge search, existing ontology search, draft validation, skill tools, and guarded learning persistence.
- `ontology_agent/repair.py`: deterministic statement coverage repair before final JSON output.
- `ontology_agent/skills/`: extendable skill folders using Agno-style `SKILL.md` files.
- `ontology_agent/cli.py`: command-line runner.

## User Workflow

Ask for any domain:

```sh
python -m ontology_agent.cli ask "Build an ontology for insurance claims"
```

Ask for any domain with a focus:

```sh
python -m ontology_agent.cli ask "Build an ontology for healthcare referrals focused on prior authorization"
```

Or use the structured form:

```sh
python -m ontology_agent.cli build "insurance claims" --scope "policy administration"
```

All commands emit JSON to stdout.

Run the visual UI:

```sh
python -m streamlit run streamlit_app.py
```

The UI renders ontology statements on the left and keeps the chat prompt/history on the right.

Run the React review UI:

```sh
cd frontend
npm install
npm run dev -- --port 5173
```

Open `http://localhost:5173`. This is the richer UI layer for statement review:
the backend remains Python/FastAPI/Agno, while the frontend owns review
selection state, inline entity renaming, statement composition, statement
editing, bulk approval, export, and commit actions.

Run the review API:

```sh
python -m uvicorn ontology_agent.api:app --reload --port 8000
```

The API is the backend boundary for richer frontends. It exposes statement-level
review state so the frontend can let users accept, edit, reject, or flag
statements before committing them into the final ontology.

Core routes:

- `POST /api/ontology/drafts`: run the Agno ontology agent and create a review session.
- `POST /api/ontology/drafts/samples/retirements`: create a sample review session without calling an LLM.
- `GET /api/ontology/drafts/{draft_id}`: read the draft and statement decisions.
- `POST /api/ontology/drafts/{draft_id}/statements`: add a relationship or rule statement, optionally creating new entities.
- `PATCH /api/ontology/drafts/{draft_id}/statements/{statement_id}`: review one statement.
- `PATCH /api/ontology/drafts/{draft_id}/entities/{entity_id}`: rename an entity and refresh affected review statements.
- `POST /api/ontology/drafts/{draft_id}/statements/review`: bulk review statements.
- `POST /api/ontology/drafts/{draft_id}/commit`: build an ontology from accepted/edited statements.
- `GET /api/ontology/drafts/{draft_id}/export`: export accepted or full draft JSON.

## Internal Skill Workflow

The core workflow is split into discrete skills:

- `ontology-scope-control`: keeps the requested domain primary and treats scope as a lens.
- `ontology-domain-discovery`: builds a useful starter ontology for any requested domain, even when no specialist skill exists.
- Domain and overlay skills, such as `retirement-ontology` and `contract-management-ontology`, are loaded after generic domain discovery when their metadata matches the request.
- `ontology-concept-gathering`: identifies and types entities.
- `ontology-relationship-design`: creates relationships, predicates, inverses, and cardinality.
- `ontology-rule-design`: creates constraints, eligibility rules, lifecycle rules, and value rules.
- `ontology-statement-rendering`: renders every relationship and rule as a linked sentence.
- `ontology-consistency-validation`: checks references, domain drift, statement coverage, and cardinality/text consistency.
- `ontology-json-export`: finalizes schema-compliant JSON only.

Domain and overlay skills can be added by developers, but they are optional. If no matching domain skill exists, the agent still uses the generic workflow skills to build an ontology for the requested domain.

## Setup

Create a virtual environment and install the package:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test]"
```

For OpenAI-backed Agno runs:

```sh
python -m pip install -U openai
export OPENAI_API_KEY="..."
```

Optional vector knowledge can be enabled later:

```sh
python -m pip install -e ".[vector]"
export ONTOLOGY_AGENT_VECTOR_DB=chroma
python -m ontology_agent.cli ingest
```

The agent always has local keyword-search tools even when vector knowledge is disabled.

## Developer Usage

Print the output schema:

```sh
python -m ontology_agent.cli schema
```

List installed skills:

```sh
python -m ontology_agent.cli skills
```

Build a draft:

```sh
python -m ontology_agent.cli build retirements --scope "workplace pension schemes"
```

Build a retirement ontology through a contract-management lens:

```sh
python -m ontology_agent.cli build retirements --scope "Contract Management"
```

The `build` command sends JSON to stdout and suppresses routine Agno parser warnings unless `ONTOLOGY_AGENT_DEBUG=true`.

A static example fixture is available at `examples/retirements-ontology-draft.json`.

## Developer Skill Extensions

Only developers need this. Add a new folder under `ontology_agent/skills/` when you want reusable specialist guidance for a domain:

```text
ontology_agent/skills/insurance-ontology/
└── SKILL.md
```

The directory name must match the `name` in YAML frontmatter. Add `metadata.triggers` so the generic planner can discover the skill without Python code changes.

Keep new skills narrow. Prefer adding a focused skill such as `ontology-taxonomy-review` or `insurance-domain-ontology` over expanding the base agent prompt.
