# OntoBuilder

OntoBuilder is an ontology-building workspace for drafting, reviewing, editing,
and exporting domain ontologies as structured JSON. The current app uses a
Python/Agno backend with a React review UI. Users can ask for any domain, review
the generated ontology as plain-English statements, edit entities inline, add
new statements, and commit only the accepted ontology elements.

The repository also includes an earlier contract-intelligence OWL ontology
starter kit, which remains available under the root ontology files.

## What It Does

- Drafts an ontology for a requested domain with entities, relationships, rules,
  assumptions, open questions, and competency questions.
- Renders ontology structure as readable statements, such as
  `A Member belongs to a Pension Scheme.`
- Lets users approve, reject, clarify, edit, or bulk-accept statements.
- Lets users rename entities directly from statement chips.
- Lets users compose new relationship statements from existing or new entities.
- Lets users compose rule statements with severity, property, operator, and value.
- Commits accepted/edited statements into a clean, exportable ontology JSON.
- Keeps the frontend as review-state UI and the backend as the source of truth.

## Architecture

```text
React/Vite UI
  -> FastAPI review API
    -> Agno ontology agent
    -> Pydantic ontology schema
    -> Review session store
    -> JSON export
```

Key folders and files:

- `frontend/`: React + TypeScript review UI.
- `ontology_agent/`: Agno-oriented ontology agent, schemas, tools, API, and review store.
- `ontology_agent/skills/`: modular skills for scope control, concept gathering,
  relationship design, rule design, statement rendering, validation, and JSON export.
- `examples/retirements-ontology-draft.json`: sample draft used by the UI.
- `docs/ontology-agent.md`: deeper agent and API notes.
- `tests/`: schema, tools, API, and UI-adjacent tests.

## Setup

Create and activate a Python virtual environment:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test]"
```

Install the React UI dependencies:

```sh
cd frontend
npm install
cd ..
```

For real Agno/OpenAI-backed ontology generation, set an API key:

```sh
export OPENAI_API_KEY="..."
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

1. Load the sample draft or ask for a new ontology domain.
2. Review statements on the left canvas.
3. Click an entity chip to rename it inline, then save or discard.
4. Click `+ Statement` to add a new relationship or rule statement.
5. Approve, reject, clarify, or edit statements in the right review panel.
6. Click `Commit accepted` to build the final ontology from accepted/edited statements.
7. Download the resulting JSON.

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

## Legacy Streamlit UI

A simple Streamlit UI is still available:

```sh
python -m streamlit run streamlit_app.py
```

The React UI is the preferred interface for richer review and editing.

## Test And Validate

Run Python tests and linting:

```sh
python -m pytest -q
python -m ruff check ontology_agent tests streamlit_app.py
python -m ruff format --check ontology_agent tests streamlit_app.py
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
