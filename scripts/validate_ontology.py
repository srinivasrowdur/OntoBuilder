#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys

from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import DCTERMS, OWL, RDF, XSD


ROOT = Path(__file__).resolve().parents[1]
CORE_PATH = ROOT / "contracts-basic-ontology.ttl"
EXAMPLE_PATH = ROOT / "examples" / "sample-nda.ttl"
SHAPES_PATH = ROOT / "shapes" / "contracts-core.shapes.ttl"
CATALOG_PATH = ROOT / "catalog-v001.xml"

CONTRACT = Namespace("https://rowdur.com/ontology/contracts#")
ONTOLOGY_IRI = URIRef("https://rowdur.com/ontology/contracts")
FORBIDDEN_TEXT = "example.org"
SAMPLE_LOCAL_NAMES = {
    "AcmeLtd",
    "ActiveStateExample",
    "BetaLtd",
    "CourierNotice",
    "EmailNotice",
    "EnglandAndWales",
    "SampleConfidentialInformation",
    "SampleConfidentialityClause",
    "SampleConfidentialityFinding",
    "SampleConfidentialityObligation",
    "SampleConfidentialityRisk",
    "SampleEffectiveDateTerm",
    "SampleExecutionEvent",
    "SampleGoverningLawClause",
    "SampleMaterialBreachCondition",
    "SampleNDA",
    "SampleNDADocument",
    "SampleNDAFamily",
    "SampleNoticeClause",
    "SampleNoticeObligation",
    "SampleTerminationRemedy",
    "SampleTerminationRight",
}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def parse_graph(path: Path, errors: list[str]) -> Graph:
    graph = Graph()
    try:
        graph.parse(path, format="turtle")
    except Exception as exc:  # pragma: no cover - command-line diagnostic path
        fail(errors, f"{path.relative_to(ROOT)} does not parse as Turtle: {exc}")
    return graph


def check_no_forbidden_text(path: Path, errors: list[str]) -> None:
    text = path.read_text()
    if FORBIDDEN_TEXT in text:
        fail(errors, f"{path.relative_to(ROOT)} still contains {FORBIDDEN_TEXT}")


def check_required_metadata(graph: Graph, errors: list[str]) -> None:
    required = {
        RDF.type: "owl:Ontology type",
        DCTERMS.creator: "dcterms:creator",
        DCTERMS.publisher: "dcterms:publisher",
        DCTERMS.license: "dcterms:license",
        DCTERMS.rights: "dcterms:rights",
        DCTERMS.modified: "dcterms:modified",
        OWL.versionIRI: "owl:versionIRI",
        OWL.versionInfo: "owl:versionInfo",
    }
    for predicate, label in required.items():
        if not list(graph.objects(ONTOLOGY_IRI, predicate)):
            fail(errors, f"Missing ontology metadata: {label}")


def check_no_xsd_date(graph: Graph, label: str, errors: list[str]) -> None:
    for subject, predicate, obj in graph:
        if obj == XSD.date:
            fail(errors, f"{label} uses xsd:date in {subject} {predicate}")
        if isinstance(obj, Literal) and obj.datatype == XSD.date:
            fail(errors, f"{label} has xsd:date literal at {subject} {predicate}")


def check_examples_not_in_core(graph: Graph, errors: list[str]) -> None:
    for subject in graph.subjects():
        if not isinstance(subject, URIRef):
            continue
        iri = str(subject)
        if not iri.startswith(str(CONTRACT)):
            continue
        local_name = iri.removeprefix(str(CONTRACT))
        if local_name in SAMPLE_LOCAL_NAMES:
            fail(errors, f"Example individual remains in core ontology: {local_name}")


def main() -> int:
    errors: list[str] = []
    for path in (CORE_PATH, EXAMPLE_PATH, SHAPES_PATH, CATALOG_PATH):
        check_no_forbidden_text(path, errors)

    core = parse_graph(CORE_PATH, errors)
    example = parse_graph(EXAMPLE_PATH, errors)
    shapes = parse_graph(SHAPES_PATH, errors)

    check_required_metadata(core, errors)
    check_no_xsd_date(core, "core ontology", errors)
    check_no_xsd_date(example, "sample NDA example", errors)
    check_no_xsd_date(shapes, "SHACL shapes", errors)
    check_examples_not_in_core(core, errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("Ontology validation passed.")
    print(f"Core triples: {len(core)}")
    print(f"Example triples: {len(example)}")
    print(f"Shape triples: {len(shapes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
