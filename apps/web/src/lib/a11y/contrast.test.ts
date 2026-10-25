import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contrastRatio } from "./contrast";

/**
 * The design tokens in globals.css, checked against WCAG 2.2 AA contrast before any page renders
 * them. axe catches a bad pair on a page it scans; this catches a token change everywhere at once.
 * Pairs follow how the tokens are used (docs/ACCESSIBILITY.md, "Colour").
 */
const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

function token(name: string, block = css): string {
  const match = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match?.[1]) throw new Error(`--color-${name} not found in globals.css`);
  return match[1];
}

/** Tokens with the accessibility menu's high-contrast overrides applied. */
const highContrastBlock = css.match(/html\[data-a11y-contrast="high"\]\s*\{([^}]*)\}/)?.[1] ?? "";
function highContrastToken(name: string): string {
  return highContrastBlock.includes(`--color-${name}:`)
    ? token(name, highContrastBlock)
    : token(name);
}

const SURFACES = ["bg", "surface", "surface-2"];
const TEXT = [
  "text",
  "muted",
  "faint",
  "brand",
  "brand-2",
  "accent",
  "success",
  "warning",
  "danger",
];
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe("colour tokens meet WCAG 2.2 AA", () => {
  it("computes contrast like the WCAG formula", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  for (const fg of TEXT) {
    for (const bg of SURFACES) {
      it(`text-${fg} on bg-${bg} is at least ${AA_TEXT}:1`, () => {
        expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  for (const fill of ["brand-fill", "brand-2-fill"]) {
    it(`white text on bg-${fill} is at least ${AA_TEXT}:1`, () => {
      expect(contrastRatio("#ffffff", token(fill))).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  describe("with the high-contrast setting", () => {
    it("overrides the secondary text and border tokens", () => {
      expect(highContrastBlock).toContain("--color-muted");
      expect(highContrastBlock).toContain("--color-border-strong");
    });

    for (const fg of TEXT) {
      for (const bg of SURFACES) {
        // AAA (7:1) for the greys it lifts; every other pair keeps at least AA.
        const min = ["text", "muted", "faint"].includes(fg) ? 7 : AA_TEXT;
        it(`text-${fg} on bg-${bg} is at least ${min}:1`, () => {
          expect(
            contrastRatio(highContrastToken(fg), highContrastToken(bg)),
          ).toBeGreaterThanOrEqual(min);
        });
      }
    }

    it(`field borders (border-strong) on bg-surface-2 are at least ${AA_NON_TEXT}:1`, () => {
      expect(
        contrastRatio(highContrastToken("border-strong"), highContrastToken("surface-2")),
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
  });

  for (const bg of SURFACES) {
    it(`the focus ring (brand-2) on bg-${bg} is at least ${AA_NON_TEXT}:1`, () => {
      expect(contrastRatio(token("brand-2"), token(bg))).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
  }
});
