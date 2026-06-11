# OntoBuilder

OntoBuilder is an ontology-building workspace for drafting, reviewing, editing,
revising, and exporting domain ontologies as structured JSON. It combines a
Python/FastAPI backend, an Agno-based ontology agent, and a React/Vite review UI.

The product shape is statement-first: users ask for any domain, review the
generated ontology as plain-English statements, inspect the same model as a
relationship graph, make decisions statement by statement, revise an open
project with controlled grammar, and commit only the accepted ontology elements.

The repository also keeps the earlier contract-intelligence OWL starter assets
under the root ontology files.

## Current Capabilities

- Draft an ontology for any requested domain with entities, relationships,
  rules, assumptions, open questions, and competency questions.
- Stream draft generation progress over Server-Sent Events, including skill
  stages, elapsed time, heartbeats, and final review-session creation.
- Optionally stream entity chips live while the model is drafting, using a cheap
  parser model for the final structured draft.
- Review ontology statements in readable form, such as
  `A Member belongs to a Pension Scheme.`
- Inspect the same ontology through a full-bleed Reagraph relationship view with
  kind colors, legend counts, node sizing, hover focus, and fit-to-view controls.
- Approve, reject, clarify, edit, bulk-accept, and undo statement decisions.
- Rename entities from the inspector with undo support.
- Compose new relationship and rule statements from existing or new entities.
- Revise an opened project in place with deterministic grammar chips for
  rename, add relationship, add rule, and expand entity flows.
- Use keyboard-first triage: move through visible statements and decide them
  without touching the mouse.
- Use a command palette for common workspace actions.
- Save ontologies into local project folders as Markdown plus JSON.
- Commit accepted/edited statements into a clean, exportable ontology JSON.

## Architecture

```text
React/Vite UI
  -> FastAPI review API
    -> Agno ontology agent
    -> Modular ontology skills
    -> Pydantic ontology schema
    -> Deterministic validate/repair layer
    -> Streaming progress pipeline
    -> Review session store
    -> Project folder store
    -> JSON export
```

Key folders and files:

- `frontend/`: React + TypeScript ontology review workspace.
- `frontend/src/components/`: canvas, graph, inspector, drawer, dock, toasts,
  command palette, first-run, and generation-progress UI components.
- `frontend/src/graphModel.ts`: reusable graph node/edge/position derivation.
- `frontend/src/designTokens.ts` and `frontend/src/tokens.css`: shared kind,
  status, typography, and button tokens.
- `ontology_agent/`: Agno agent setup, API, schema, review logic, revision
  grammar, streaming, project storage, and deterministic repair.
- `ontology_agent/skills/`: modular skill folders for scope control, domain
  discovery, concept gathering, relationship design, rule design, statement
  rendering, consistency validation, entity expansion, and JSON export.
- `projects/`: optional local folder-backed knowledge base for saved ontology
  projects.
- `examples/retirements-ontology-draft.json`: sample draft that the UI can load
  without calling an LLM.
- `docs/ontology-agent.md`: deeper backend, skill, and streaming notes.
- `docs/design-system.md`: design token and UI styling reference.
- `tests/`: Python API, agent, config, streaming, schema, and tooling tests.

## Setup

Create and activate a Python virtual environment:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test]"
```

Install the React UI dependencies. Use Node.js `20.19+` or `22.12+`; the graph
viewer dependency declares that engine range.

```sh
cd frontend
npm install
cd ..
```

Create a local `.env` from `.env.example`, then set the provider keys you need:

```sh
cp .env.example .env
```

Common environment values:

```sh
OPENAI_API_KEY=...
GOOGLE_API_KEY=...
ONTOLOGY_AGENT_PROVIDER=google
ONTOLOGY_AGENT_GOOGLE_MODEL=google:gemini-2.5-flash
ONTOLOGY_AGENT_OPENAI_MODEL=openai:gpt-5.2
ONTOLOGY_AGENT_MODEL=
ONTOLOGY_AGENT_PARSER_MODEL=
ONTOLOGY_AGENT_BASE_IRI=
ONTOLOGY_AGENT_PROJECTS_PATH=projects
```

Provider selection:

- `ONTOLOGY_AGENT_PROVIDER=google` uses `ONTOLOGY_AGENT_GOOGLE_MODEL`.
- `ONTOLOGY_AGENT_PROVIDER=openai` uses `ONTOLOGY_AGENT_OPENAI_MODEL`.
- `ONTOLOGY_AGENT_MODEL` overrides the provider-specific model when set.
- `ONTOLOGY_AGENT_PARSER_MODEL=none` disables live entity streaming and uses
  native structured output instead.
- `ONTOLOGY_AGENT_BASE_IRI` controls generated ontology namespaces. If unset,
  the app uses the configured default instead of `example.*` export IRIs.

The React UI can still load the retirements sample without calling an LLM.

## Run The App

Start the FastAPI backend:

```sh
source .venv/bin/activate
python -m uvicorn ontology_agent.api:app --reload --host 127.0.0.1 --port 8000
```

Start the React UI in another terminal:

```sh
cd frontend
npm run dev -- --port 5173
```

Open:

- React UI: `http://127.0.0.1:5173`
- API docs: `http://127.0.0.1:8000/docs`

## UI Workflow

1. Open the React UI.
2. Create a new ontology from the first-run prompt, choose an example prompt
   card, open an existing project, or load the offline retirements sample.
3. Watch the generation progress card while the backend streams skill stages,
   entity chips, elapsed time, and completion.
4. Use the readiness funnel to work through `Review -> Resolve -> Export`.
5. Review statements in the `Text` view or switch to `Graph` to inspect the
   relationship network.
6. Select a statement row or graph edge to open the statement inspector.
7. Select an entity chip or graph node to open the entity inspector.
8. Decide statements with inspector buttons, row actions, bulk accept, or
   keyboard triage.
9. Use `+ Statement` to add a relationship or rule statement.
10. Open the project drawer to create, open, or save a project.
11. With a project open, use the revise dock grammar chips to make controlled
    edits against stable `@Entity` mentions.
12. Commit accepted/edited statements to build the final ontology.
13. Download the resulting JSON.

## Keyboard And Command Palette

The review workflow is designed for fast triage:

- `j` or ArrowDown: move to the next visible statement.
- `k` or ArrowUp: move to the previous visible statement.
- `a`: accept the selected statement.
- `r`: reject the selected statement.
- `c`: mark the selected statement as needing clarification.
- `p`: return the selected statement to pending.
- `Cmd/Ctrl+K`: open the command palette.
- `Escape`: close overlays such as the command palette, drawer, or mobile
  inspector sheet.

Keyboard handling ignores keystrokes while the user is typing in forms,
composer fields, or prompt inputs.

## Project Folders

Projects are file-first and are intended to work like a local second brain. One
project contains one ontology. A saved project uses Markdown for human-readable
notes and JSON for exact app reloads:

```text
projects/
  vanguard-financial-advisory/
    project.md
    project.json
    ontology.md
    ontology.json
    review-session.json
    statements.md
    accepted-ontology.json
    entities/
      advisory-partner.md
    relationships/
      distributes.md
    rules/
      issue-remediation-rule.md
```

The Markdown files include frontmatter and wiki-style links such as
`[[member]]`, so the folder can be opened in tools like Obsidian or kept under
Git. The JSON files remain the app's exact machine-readable representation.

## Project-Scoped Revisions

Once a project is open, the bottom dock acts on that ontology instead of
starting over. The UI sends `@Entity` mentions with stable entity IDs, and the
backend supports deterministic edits for:

- Rename one entity, for example `rename @Member to Plan Member`.
- Add a relationship between two entities, for example
  `@Member owns one or more @Account`.
- Add a rule for one entity, optionally referencing another entity, for example
  `@Issue must have at least one @Remediation Plan`.
- Expand one entity through the ontology expansion agent, for example
  `@Cricket Match expand relationships`.

The revise dock shows grammar chips for the supported forms. Clicking a chip
inserts the template and places the caret where the next `@Entity` mention
should be selected.

Every successful project revision updates the review session and immediately
rewrites the Markdown/JSON project folder.

## Statement Composer

The statement composer keeps the sentence as the user interface while the API
creates structured ontology objects.

Relationship example:

```text
A [Member] [owns] a [Retirement Account].
```

This creates or reuses:

- subject entity
- object entity
- relationship
- natural-language statement
- pending review item

Rule example:

```text
A [Contribution] [must] have [vesting age] [greater than] [55].
```

This creates:

- target entity reference
- rule object
- natural-language rule statement
- pending review item

## API Surface

Core routes:

- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/{project_id}`
- `POST /api/projects/{project_id}/save`
- `GET /api/projects/{project_id}/session`
- `POST /api/projects/{project_id}/revise`
- `POST /api/ontology/drafts`
- `POST /api/ontology/drafts/stream`
- `POST /api/ontology/drafts/import`
- `POST /api/ontology/drafts/samples/{sample_name}`
- `GET /api/ontology/drafts/{draft_id}`
- `POST /api/ontology/drafts/{draft_id}/statements`
- `PATCH /api/ontology/drafts/{draft_id}/statements/{statement_id}`
- `POST /api/ontology/drafts/{draft_id}/statements/review`
- `PATCH /api/ontology/drafts/{draft_id}/entities/{entity_id}`
- `POST /api/ontology/drafts/{draft_id}/commit`
- `GET /api/ontology/drafts/{draft_id}/export`

The frontend uses the streaming endpoint first for draft creation and falls
back to the blocking endpoint when streaming is unavailable.

## CLI Usage

Ask for any domain:

```sh
python -m ontology_agent.cli ask "Build an ontology for insurance claims"
```

Ask with a focus:

```sh
python -m ontology_agent.cli ask "Build an ontology for healthcare referrals focused on prior authorization"
```

Structured build command:

```sh
python -m ontology_agent.cli build retirements --scope "workplace pension schemes"
```

Useful developer commands:

```sh
python -m ontology_agent.cli schema
python -m ontology_agent.cli skills
```

## Test And Validate

Run Python tests and linting:

```sh
python -m pytest -q
python -m ruff check ontology_agent tests
python -m ruff format --check ontology_agent tests
```

Run frontend tests, linting, formatting, and build:

```sh
cd frontend
npm run test:run
npm run lint
npm run format:check
npm run build
```

Validate the original OWL ontology assets:

```sh
/Users/srinivas/anaconda3/bin/python scripts/validate_ontology.py
```

If ROBOT is installed:

```sh
robot validate-profile --input contracts-basic-ontology.ttl --profile DL
```

Regenerate ontology diagrams:

```sh
/Users/srinivas/anaconda3/bin/python scripts/generate_ontology_visuals.py
```

## Design System

The frontend now has explicit design tokens for:

- entity kind colors
- review status colors
- typography scale
- button variants
- graph colors

The CSS source of truth is `frontend/src/tokens.css`. The TypeScript mirror for
graph and logic usage is `frontend/src/designTokens.ts`, covered by
`frontend/src/designTokens.test.ts`.

See `docs/design-system.md` for the token reference.

## Contract Ontology Assets

The original contract ontology starter assets remain in the repo:

- `contracts-basic-ontology.ttl`
- `examples/sample-nda.ttl`
- `shapes/contracts-core.shapes.ttl`
- `visualizations/index.html`
- `catalog-v001.xml`

Namespace:

```text
https://rowdur.com/ontology/contracts#
```

Ontology IRI:

```text
https://rowdur.com/ontology/contracts
```

## Publication Status

Version `0.1.0-alpha` is a publication candidate, not a final legal taxonomy.
The current license is conservative: all rights reserved until Rowdur selects a
public or commercial license. Confirm the intended license before public
redistribution.
