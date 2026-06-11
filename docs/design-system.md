# OntoBuilder Design System

A small, documented token set. The tokens live in
[`frontend/src/tokens.css`](../frontend/src/tokens.css) as CSS custom
properties; the entity-kind palette is mirrored in
[`frontend/src/designTokens.ts`](../frontend/src/designTokens.ts) for the
WebGL graph, and `designTokens.test.ts` fails if the two drift apart.

## Principles

- **Color is meaning.** Entity-kind colors and review-status colors are
  semantic: the same kind or status always renders the same color, in the
  statement text, the composer, the inspector, the graph, and the legend.
- **One source per token.** Never hardcode a hex that has a token. If a new
  surface needs a color, reference the token; if a new meaning needs a color,
  add a token here first.
- **The sentence is the interface.** Statements render in the serif
  `--text-statement` voice; everything around them is quiet Inter UI chrome.

## Type scale

| Token              | Size                          | Use                              |
| ------------------ | ----------------------------- | -------------------------------- |
| `--text-xs`        | 0.72rem                       | kickers, badges, micro-labels    |
| `--text-sm`        | 0.8rem                        | secondary copy, metadata         |
| `--text-base`      | 0.92rem                       | body copy, inputs, buttons       |
| `--text-lg`        | 1.12rem                       | panel headings                   |
| `--text-xl`        | 1.55rem                       | page / domain titles             |
| `--text-statement` | clamp(1.42rem, 1.9vw, 1.86rem) | serif ontology statements        |

Fonts: `--font-ui` (Inter stack) for chrome, `--font-statement` (Georgia
stack) reserved for ontology statements.

## Entity-kind colors

Color encodes the entity kind everywhere an entity appears: statement chips,
composer pickers, inspector links, graph nodes, and the graph legend. Chips
opt in by carrying `data-kind="<entity_type>"`; surfaces derive border,
background, and text tints from the single `--kind` value via `color-mix`.

| Kind                 | Token                       | Value     |
| -------------------- | --------------------------- | --------- |
| class (default)      | `--kind-class`              | `#3568a0` |
| role                 | `--kind-role`               | `#3a93a3` |
| event                | `--kind-event`              | `#9a7d3a` |
| document             | `--kind-document`           | `#7b7dd4` |
| process              | `--kind-process`            | `#4a9a72` |
| state                | `--kind-state`              | `#9a6489` |
| attribute / value    | `--kind-attribute`          | `#948043` |
| external reference   | `--kind-external-reference` | `#6e8296` |

Unknown kinds fall back to the class color.

## Review-status colors

Each review status has a `--status-<name>` accent plus `-bg`, `-text`, and
`-border` companions. They drive the statement-row slivers, the inspector
status pills, the decision buttons (Accept hovers green, Reject hovers red,
Clarify hovers gold), and the dock's emphasized actions.

| Status               | Accent              | Used by                            |
| -------------------- | ------------------- | ---------------------------------- |
| accepted / edited    | `--status-accepted` | slivers, pills, Commit emphasis    |
| rejected             | `--status-rejected` | slivers, pills, Reject button      |
| needs clarification  | `--status-clarify`  | slivers, pills, worklist accents   |
| pending              | `--status-pending`  | pills, Pending button              |

## Button variants

Defined in `tokens.css`; compose with existing layout classes.

| Class          | Meaning                              |
| -------------- | ------------------------------------ |
| `.btn`         | quiet bordered default               |
| `.btn-primary` | the surface's main action (blue)     |
| `.btn-success` | confirming / committing (green)      |
| `.btn-danger`  | destructive / rejecting (red)        |
| `.btn-ghost`   | borderless, lowest emphasis          |

The dock's `dock-primary` emphasis and the inspector's decision grid consume
the same status tokens, so "green means commit-ready" holds everywhere.

## Adding a token

1. Add the custom property to `frontend/src/tokens.css` with a comment.
2. If the graph needs it, mirror it in `frontend/src/designTokens.ts`.
3. Update the table here.
4. `npx vitest run src/designTokens.test.ts` must pass.
