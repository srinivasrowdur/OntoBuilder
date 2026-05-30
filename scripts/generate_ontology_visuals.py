#!/usr/bin/env python3
from __future__ import annotations

import html
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TTL_PATH = ROOT / "contracts-basic-ontology.ttl"
EXAMPLE_PATH = ROOT / "examples" / "sample-nda.ttl"
OUT_DIR = ROOT / "visualizations"


CORE_CLASS_ROOTS = {
    "Contract",
    "ContractComponent",
    "Party",
    "ContractEvent",
    "Resource",
    "LifecycleState",
    "ReviewFinding",
    "Risk",
    "Approval",
    "ContractDocument",
    "ContractFamily",
    "Jurisdiction",
}

SAMPLE_NDA_NODES = {
    "SampleNDA",
    "SampleNDAFamily",
    "SampleNDADocument",
    "AcmeLtd",
    "BetaLtd",
    "EnglandAndWales",
    "ActiveStateExample",
    "SampleConfidentialityClause",
    "SampleGoverningLawClause",
    "SampleNoticeClause",
    "SampleConfidentialityObligation",
    "SampleNoticeObligation",
    "SampleConfidentialInformation",
    "SampleEffectiveDateTerm",
    "SampleExecutionEvent",
    "SampleMaterialBreachCondition",
    "SampleTerminationRight",
    "SampleTerminationRemedy",
    "SampleConfidentialityFinding",
    "SampleConfidentialityRisk",
}


def q(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def node_id(name: str) -> str:
    return "n_" + re.sub(r"[^A-Za-z0-9_]", "_", name)


def split_blocks(text: str) -> dict[str, str]:
    blocks: dict[str, list[str]] = {}
    current_subject: str | None = None
    current_lines: list[str] = []

    subject_re = re.compile(r"^(:[A-Za-z][A-Za-z0-9_]*|[A-Za-z][A-Za-z0-9_-]*:[A-Za-z][A-Za-z0-9_]*|<[^\s>]+>)\b")

    for line in text.splitlines():
        match = subject_re.match(line)
        if match:
            if current_subject and current_lines:
                blocks[current_subject] = current_lines
            current_subject = match.group(1)
            current_lines = [line]
        elif current_subject:
            current_lines.append(line)

    if current_subject and current_lines:
        blocks[current_subject] = current_lines

    return {subject: "\n".join(lines) for subject, lines in blocks.items()}


def prefixed_name(subject: str) -> str:
    if subject.startswith(":"):
        return subject[1:]
    if ":" in subject and not subject.startswith("<"):
        return subject.split(":", 1)[1]
    return subject


def label_for(subject: str, block: str) -> str:
    label = re.search(r'rdfs:label\s+"([^"]+)"', block)
    return label.group(1) if label else prefixed_name(subject)


def extract_entities(blocks: dict[str, str]) -> tuple[dict[str, str], set[str], set[str], set[str]]:
    labels = {
        prefixed_name(subject): label_for(subject, block)
        for subject, block in blocks.items()
        if not subject.startswith("<")
    }
    classes = {prefixed_name(s) for s, b in blocks.items() if s.startswith(":") and "a owl:Class" in b}
    obj_props = {prefixed_name(s) for s, b in blocks.items() if s.startswith(":") and "a owl:ObjectProperty" in b}
    data_props = {prefixed_name(s) for s, b in blocks.items() if s.startswith(":") and "a owl:DatatypeProperty" in b}
    return labels, classes, obj_props, data_props


def extract_subclass_edges(blocks: dict[str, str], classes: set[str]) -> list[tuple[str, str]]:
    edges: list[tuple[str, str]] = []
    for subject, block in blocks.items():
        if not subject.startswith(":") or "a owl:Class" not in block:
            continue
        child = prefixed_name(subject)
        lines = block.splitlines()
        collecting = False
        bracket_depth = 0
        for line in lines:
            stripped = line.strip()
            if "rdfs:subClassOf" in stripped:
                collecting = True
                stripped = stripped.split("rdfs:subClassOf", 1)[1]
            if collecting:
                bracket_depth += stripped.count("[") - stripped.count("]")
                if bracket_depth == 0:
                    for parent in re.findall(r":([A-Za-z][A-Za-z0-9_]*)", stripped):
                        if parent in classes and parent != child:
                            edges.append((child, parent))
                if "." in stripped or ";" in stripped:
                    collecting = False
                    bracket_depth = 0
    return sorted(set(edges))


def extract_property_edges(blocks: dict[str, str], properties: set[str]) -> list[tuple[str, str, str]]:
    edges: list[tuple[str, str, str]] = []
    for subject, block in blocks.items():
        prop = prefixed_name(subject)
        if prop not in properties:
            continue
        domain = re.search(r"rdfs:domain\s+:([A-Za-z][A-Za-z0-9_]*)", block)
        range_ = re.search(r"rdfs:range\s+:([A-Za-z][A-Za-z0-9_]*)", block)
        if domain and range_:
            edges.append((domain.group(1), range_.group(1), prop))
    return sorted(set(edges))


def extract_sample_edges(blocks: dict[str, str]) -> list[tuple[str, str, str]]:
    edges: list[tuple[str, str, str]] = []
    for subject, block in blocks.items():
        source = prefixed_name(subject)
        if source not in SAMPLE_NDA_NODES:
            continue
        for predicate, targets in re.findall(r"\n\s+(?::|[A-Za-z][A-Za-z0-9_-]*:)([A-Za-z][A-Za-z0-9_]*)\s+([^.;]+)[.;]", block):
            for target in re.findall(r"(?::|[A-Za-z][A-Za-z0-9_-]*:)([A-Za-z][A-Za-z0-9_]*)", targets):
                if target in SAMPLE_NDA_NODES:
                    edges.append((source, target, predicate))
    return sorted(set(edges))


def reachable_core(classes: set[str], subclass_edges: list[tuple[str, str]]) -> set[str]:
    children: dict[str, set[str]] = {}
    for child, parent in subclass_edges:
        children.setdefault(parent, set()).add(child)

    reachable = set(CORE_CLASS_ROOTS & classes)
    frontier = list(reachable)
    while frontier:
        parent = frontier.pop()
        for child in children.get(parent, set()):
            if child not in reachable:
                reachable.add(child)
                frontier.append(child)
    return reachable


def write_dot(path: Path, title: str, nodes: set[str], edges: list[tuple[str, str, str]], labels: dict[str, str], rankdir: str = "TB") -> None:
    lines = [
        f"digraph {node_id(path.stem)} {{",
        "  graph [",
        f"    label={q(title)},",
        '    labelloc="t",',
        '    fontsize="22",',
        f'    rankdir="{rankdir}",',
        '    bgcolor="white",',
        '    pad="0.35",',
        '    nodesep="0.55",',
        '    ranksep="0.7"',
        "  ];",
        '  node [shape=box, style="rounded,filled", fillcolor="#f8fafc", color="#64748b", fontname="Helvetica", fontsize="11", margin="0.08,0.05"];',
        '  edge [color="#64748b", arrowsize="0.75", fontname="Helvetica", fontsize="9"];',
    ]
    for name in sorted(nodes):
        lines.append(f"  {node_id(name)} [label={q(labels.get(name, name))}];")
    for source, target, label in edges:
        if source in nodes and target in nodes:
            attrs = f" [label={q(labels.get(label, label))}]" if label else ""
            lines.append(f"  {node_id(source)} -> {node_id(target)}{attrs};")
    lines.append("}")
    path.write_text("\n".join(lines) + "\n")


def render_svg(dot_path: Path) -> Path:
    svg_path = dot_path.with_suffix(".svg")
    subprocess.run(["dot", "-Tsvg", str(dot_path), "-o", str(svg_path)], check=True)
    return svg_path


def write_index(svg_paths: list[Path]) -> None:
    cards = []
    for svg in svg_paths:
        title = svg.stem.replace("-", " ").title()
        cards.append(
            f"""
            <section>
              <h2>{html.escape(title)}</h2>
              <object data="{html.escape(svg.name)}" type="image/svg+xml"></object>
            </section>
            """
        )
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Contracts Ontology Visualizations</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; }}
    header {{ padding: 24px 32px 12px; background: #ffffff; border-bottom: 1px solid #d9e2ec; }}
    h1 {{ margin: 0 0 8px; font-size: 24px; }}
    p {{ margin: 0; color: #475569; }}
    main {{ padding: 20px 32px 36px; display: grid; gap: 24px; }}
    section {{ background: #ffffff; border: 1px solid #d9e2ec; border-radius: 8px; padding: 16px; overflow: auto; }}
    h2 {{ margin: 0 0 12px; font-size: 18px; }}
    object {{ width: 100%; min-height: 680px; border: 1px solid #e2e8f0; background: white; }}
  </style>
</head>
<body>
  <header>
    <h1>Contracts Ontology Visualizations</h1>
    <p>Generated from contracts-basic-ontology.ttl and examples/sample-nda.ttl. Regenerate with scripts/generate_ontology_visuals.py after ontology edits.</p>
  </header>
  <main>
    {''.join(cards)}
  </main>
</body>
</html>
"""
    (OUT_DIR / "index.html").write_text(html_text)


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    text = TTL_PATH.read_text()
    blocks = split_blocks(text)
    example_blocks = split_blocks(EXAMPLE_PATH.read_text()) if EXAMPLE_PATH.exists() else {}
    labels, classes, obj_props, _data_props = extract_entities(blocks)
    example_labels, _example_classes, _example_obj_props, _example_data_props = extract_entities(example_blocks)
    labels.update(example_labels)
    subclass_edges = extract_subclass_edges(blocks, classes)
    property_edges = extract_property_edges(blocks, obj_props)
    sample_edges = extract_sample_edges(example_blocks)

    core_nodes = reachable_core(classes, subclass_edges)
    core_edges = [(child, parent, "subClassOf") for child, parent in subclass_edges if child in core_nodes and parent in core_nodes]

    property_nodes = set()
    selected_property_edges = []
    for source, target, prop in property_edges:
        if source in CORE_CLASS_ROOTS or target in CORE_CLASS_ROOTS or source in core_nodes or target in core_nodes:
            if prop in {
                "hasParty", "hasCustomer", "hasSupplier", "hasClause", "hasObligation",
                "imposesObligation", "owedBy", "owedTo", "hasRight", "grantsRight",
                "exercisableBy", "hasTerm", "hasCondition", "hasDeliverable", "hasPayment",
                "governedBy", "hasJurisdiction", "hasEvent", "hasRemedy", "hasRisk",
                "hasReviewFinding", "hasDocument", "belongsToFamily", "hasLifecycleState",
            }:
                property_nodes.update([source, target])
                selected_property_edges.append((source, target, prop))

    svg_paths = []
    dot_path = OUT_DIR / "core-class-hierarchy.dot"
    write_dot(dot_path, "Core class hierarchy", core_nodes, core_edges, labels, rankdir="TB")
    svg_paths.append(render_svg(dot_path))

    dot_path = OUT_DIR / "core-property-map.dot"
    write_dot(dot_path, "Core object properties", property_nodes, selected_property_edges, labels, rankdir="LR")
    svg_paths.append(render_svg(dot_path))

    dot_path = OUT_DIR / "sample-nda-graph.dot"
    write_dot(dot_path, "Sample NDA relationship graph", SAMPLE_NDA_NODES, sample_edges, labels, rankdir="LR")
    svg_paths.append(render_svg(dot_path))

    write_index(svg_paths)
    print(f"Wrote {len(svg_paths)} SVG diagrams and {OUT_DIR / 'index.html'}")


if __name__ == "__main__":
    main()
