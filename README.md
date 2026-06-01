# Rowdur Contracts Ontology

This repository contains a starter OWL ontology for contract intelligence.

- Core ontology: `contracts-basic-ontology.ttl`
- Example data: `examples/sample-nda.ttl`
- SHACL shapes: `shapes/contracts-core.shapes.ttl`
- Visualizations: `visualizations/index.html`
- Local ontology catalog: `catalog-v001.xml`

## Namespace

The ontology namespace is:

```text
https://rowdur.com/ontology/contracts#
```

The ontology IRI is:

```text
https://rowdur.com/ontology/contracts
```

## Publication Status

Version `0.1.0-alpha` is a publication candidate, not a final legal taxonomy. The core ontology uses a Rowdur-owned namespace, includes version metadata, and keeps sample individuals outside the core ontology.

The current license is conservative: all rights reserved until Rowdur selects a public or commercial license. Confirm the intended license before public redistribution.

Date-like values use `xsd:dateTime` rather than `xsd:date` so OWL tooling can validate the ontology profile more reliably. Date-only examples are represented as midnight UTC.

## Validate

Run the local structural validation:

```sh
/Users/srinivas/anaconda3/bin/python scripts/validate_ontology.py
```

If ROBOT is installed, run an OWL profile check:

```sh
robot validate-profile --input contracts-basic-ontology.ttl --profile DL
```

Regenerate diagrams after ontology or example edits:

```sh
/Users/srinivas/anaconda3/bin/python scripts/generate_ontology_visuals.py
```

## Ontology Agent

This repository also includes an Agno-oriented ontology drafting agent scaffold under
`ontology_agent/`. It generates parseable JSON for a domain with entities,
relationships, rules, and natural-language statements.

Users can ask for any domain directly:

```sh
python -m ontology_agent.cli ask "Build an ontology for insurance claims"
```

Run the local Streamlit UI:

```sh
python -m streamlit run streamlit_app.py
```

Run the local FastAPI review API:

```sh
python -m uvicorn ontology_agent.api:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the generated API docs. The API lets a
frontend create an ontology draft, approve or edit individual statements, and
commit only the accepted statements into an exportable ontology JSON payload.

Run the React review UI:

```sh
cd frontend
npm install
npm run dev -- --port 5173
```

Open `http://localhost:5173`. Keep the FastAPI review API running on port 8000
while using the React UI. The React UI supports inline entity renaming directly
from ontology statement chips, statement composition from existing or new
entities, rule creation, statement review, commit, and JSON download.

Internally, the agent is skill-driven: scope control, generic domain discovery,
concept gathering, relationship design, rule design, statement rendering,
consistency validation, and JSON export are separate `SKILL.md` modules under
`ontology_agent/skills/`. Domain-specific skills are optional developer
extensions, not something users need to create.

See `docs/ontology-agent.md` and `examples/retirements-ontology-draft.json`.
