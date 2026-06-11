import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ENTITY_KIND_COLORS, entityKindColor } from "./designTokens";

// Read tokens.css from disk: vitest stubs CSS imports (even ?raw), so a
// raw import resolves to an empty string under the test runner.
const tokensCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "tokens.css"),
  "utf-8",
);

function cssToken(name: string): string | null {
  const match = tokensCss.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  return match ? match[1].toLowerCase() : null;
}

describe("entity kind palette", () => {
  it("matches the CSS custom properties in tokens.css", () => {
    const cssNameByKind: Record<string, string> = {
      class: "--kind-class",
      role: "--kind-role",
      event: "--kind-event",
      document: "--kind-document",
      process: "--kind-process",
      state: "--kind-state",
      attribute: "--kind-attribute",
      external_reference: "--kind-external-reference",
    };
    for (const [kind, cssName] of Object.entries(cssNameByKind)) {
      expect(cssToken(cssName), `${cssName} should exist in tokens.css`).not.toBeNull();
      expect(cssToken(cssName)).toBe(ENTITY_KIND_COLORS[kind].toLowerCase());
    }
  });

  it("value shares the attribute color and unknown kinds fall back to class", () => {
    expect(ENTITY_KIND_COLORS.value).toBe(ENTITY_KIND_COLORS.attribute);
    expect(entityKindColor("mystery_kind")).toBe(ENTITY_KIND_COLORS.class);
  });
});
