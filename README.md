# OntoBuilder

OntoBuilder is an ontology-building workspace for drafting, reviewing, editing,
and exporting domain ontologies as structured JSON. The current app uses a
Python/Agno backend with a React ontology workspace. Users can ask for any
domain, review the generated ontology as plain-English statements or a
relationship graph, inspect entities and statements, add new statements, and
commit only the accepted ontology elements.

The repository also includes an earlier contract-intelligence OWL ontology
starter kit, which remains available under the root ontology files.

## What It Does

- Drafts an ontology for a requested domain with entities, relationships, rules,
  assumptions, open questions, and competency questions.
- Renders ontology structure as readable statements, such as
  `A Member belongs to a Pension Scheme.`
- Shows a relationship graph for the same ontology using the React graph view.
- Lets users approve, reject, clarify, edit, or bulk-accept statements.
- Lets users inspect entities from text chips or graph nodes, then rename them
  from the entity inspector.
- Lets users compose new relationship statements from existing or new entities.
- Lets users compose rule statements with severity, property, operator, and value.
- Commits accepted/edited statements into a clean, exportable ontology JSON.
- Saves ontologies into local project folders as Markdown plus JSON.
- Revises an opened project in-place from the bottom prompt, with `@Entity`
  mentions resolved against the active ontology.
- Keeps the frontend as review-state UI and the backend as the source of truth.

## Architecture

```text
React/Vite UI
  -> FastAPI review API
    -> Agno ontology agent
    -> Pydantic ontology schema
    -> Review session store
    -> Project folder store
    -> JSON export
```

Key folders and files:

- `frontend/`: React + TypeScript review UI.
- `ontology_agent/`: Agno-oriented ontology agent, schemas, tools, API, and review store.
- `projects/`: optional local folder-backed knowledge base for saved ontology projects.
- `ontology_agent/skills/`: modular skills for scope control, concept gathering,
  relationship design, rule design, statement rendering, validation, and JSON export.
- `examples/retirements-ontology-draft.json`: sample draft that the UI can load
  without calling an LLM.
- `docs/ontology-agent.md`: deeper agent and API notes.
- `tests/`: schema, tools, API, and UI-adjacent tests.

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

For real Agno-backed ontology generation, set the API key for the provider you
want to use:

```sh
export OPENAI_API_KEY="..."
export GOOGLE_API_KEY="..."
```

Configure the active provider in `.env`:

```sh
ONTOLOGY_AGENT_PROVIDER=google
ONTOLOGY_AGENT_GOOGLE_MODEL=google:gemini-2.5-flash
ONTOLOGY_AGENT_OPENAI_MODEL=openai:gpt-5.2
```

Use `ONTOLOGY_AGENT_PROVIDER=openai` or `ONTOLOGY_AGENT_PROVIDER=google` to
switch between configured providers. If `ONTOLOGY_AGENT_MODEL` is set, that
exact Agno model string overrides the provider-specific selection.

Project folders are saved to `projects/` by default. To store them somewhere
else, set:

```sh
ONTOLOGY_AGENT_PROJECTS_PATH="/path/to/ontology-projects"
```

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

1. Open the React UI and either ask for a new ontology in the `Create ontology`
   prompt, open an existing project from the hamburger project drawer, or load
   the retirements sample for an offline demo.
2. After a draft exists, use the `Text` view to review readable statements or
   switch to `Graph` to inspect the relationship network.
3. Select a statement row or graph edge to open the statement inspector, then
   approve, reject, clarify, or edit the statement text.
4. Select an entity chip or graph node to open the entity inspector, then rename
   the entity and save or discard the change.
5. Click `+ Statement` to add a new relationship or rule statement.
6. Open the hamburger project drawer to create, open, or save a project.
7. With a project open, use the bottom prompt for scoped edits such as
   `@Member owns one or more @Account` or `rename @Member to Plan Member`.
8. Click `Commit accepted` to build the final ontology from accepted/edited statements.
9. Download the resulting JSON.

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

Once a project is open, the bottom prompt acts on that ontology instead of
starting over. The UI sends `@Entity` mentions with stable entity IDs, and the
backend currently supports deterministic edits for:

- renaming one entity, for example `rename @Member to Plan Member`
- adding a relationship between two entities, for example
  `@Member owns one or more @Account`
- adding a rule for one entity, optionally referencing another entity, for
  example `@Issue must have at least one @Remediation Plan`
- expanding one entity through the ontology expansion agent with additional
  candidate relationships, entities, and rules, for example
  `@Cricket Match Expand on this entity to cover more`
- aiming that same agent at a narrower expansion mode, for example
  `@Cricket Match expand relationships` or `@Cricket Match expand rules`

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
- `POST /api/ontology/drafts/import`
- `POST /api/ontology/drafts/samples/retirements`
- `GET /api/ontology/drafts/{draft_id}`
- `POST /api/ontology/drafts/{draft_id}/statements`
- `PATCH /api/ontology/drafts/{draft_id}/statements/{statement_id}`
- `POST /api/ontology/drafts/{draft_id}/statements/review`
- `PATCH /api/ontology/drafts/{draft_id}/entities/{entity_id}`
- `POST /api/ontology/drafts/{draft_id}/commit`
- `GET /api/ontology/drafts/{draft_id}/export`

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

Build the React frontend:

```sh
cd frontend
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
