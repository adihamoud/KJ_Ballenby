#!/usr/bin/env node
// Accessibility checks on the lines a branch adds to apps/web/src, for what ESLint (jsx-a11y)
// and axe do not see: zoom blocking, positive tabindex, removed focus outlines, tiny text,
// colours outside the checked tokens, modal dialogs without the focus hook. Errors fail CI;
// warnings show as annotations on the PR. See docs/ACCESSIBILITY.md, "Automated checks".
//
//   node scripts/check-a11y-diff.mjs              # against origin/main
//   node scripts/check-a11y-diff.mjs origin/main  # explicit base
//
// A line (or the line above it) containing `a11y-ignore: <reason>` is skipped.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** @typedef {{ level: "error" | "warning", rule: string, message: string }} Finding */

/** @type {{ rule: string, level: "error" | "warning", files: RegExp, test: (line: string) => boolean, message: string }[]} */
export const RULES = [
  {
    rule: "zoom-blocked",
    level: "error",
    files: /\.(tsx?|css)$/,
    test: (l) => /user-?scalable\s*[:=]\s*["']?(no|0|false)|maximum-?scale|maximumScale/i.test(l),
    message:
      "Do not limit zoom (maximumScale / user-scalable=no): low-vision users pinch to read (WCAG 1.4.4).",
  },
  {
    rule: "positive-tabindex",
    level: "error",
    files: /\.tsx$/,
    test: (l) => /tabIndex=\{\s*[1-9]|tabindex=["'][1-9]/.test(l),
    message:
      "Positive tabIndex reorders keyboard focus away from the visual order (WCAG 2.4.3). Use 0 or -1.",
  },
  {
    rule: "focus-outline-removed",
    level: "error",
    files: /\.tsx$/,
    test: (l) =>
      /\b(outline-none|outline-0)\b/.test(l) &&
      !/focus(-visible)?:(ring|outline|border|shadow)/.test(l),
    message:
      "outline-none without a focus-visible replacement hides keyboard focus (WCAG 2.4.7). Keep the global :focus-visible ring or add focus-visible:ring-*.",
  },
  {
    rule: "focus-outline-removed",
    level: "warning",
    files: /\.css$/,
    test: (l) => /outline\s*:\s*(none|0)\b/.test(l),
    message:
      "outline: none in CSS: make sure the rule gives focus another visible style (WCAG 2.4.7).",
  },
  {
    rule: "aria-hidden-focusable",
    level: "error",
    files: /\.tsx$/,
    test: (l) => /aria-hidden(=\{true\}|="true"|\s|>|$)/.test(l) && /\b(onClick|href)=/.test(l),
    message:
      "aria-hidden on something clickable: it stays focusable but screen readers cannot name it (WCAG 4.1.2).",
  },
  {
    rule: "tiny-text",
    level: "warning",
    files: /\.tsx$/,
    test: (l) => /text-\[(0?\.[0-6]\d*rem|([0-9]|1[01])px)\]/.test(l),
    message: "Text below 12px is hard to read in a dark bar; prefer text-xs (12px) or larger.",
  },
  {
    rule: "colour-outside-tokens",
    level: "warning",
    files: /\.tsx$/,
    test: (l) => /\b(text|bg|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/.test(l),
    message:
      "Arbitrary colour: use a token from globals.css so src/lib/a11y/contrast.test.ts checks its contrast.",
  },
  {
    rule: "video-autoplay",
    level: "warning",
    files: /\.tsx$/,
    test: (l) => /\bautoPlay\b/.test(l) && !/\bmuted\b/.test(l),
    message:
      "Autoplaying media with sound needs a pause/mute control within 3 seconds (WCAG 1.4.2).",
  },
];

/**
 * Check one added line. `previous` is the added line just above it (for `a11y-ignore`), and
 * `fileText` the whole new file, for rules that look beyond the line.
 * @returns {Finding[]}
 */
export function checkLine(file, line, previous = "", fileText = "") {
  if (/a11y-ignore:/.test(line) || /a11y-ignore:/.test(previous)) return [];
  const findings = RULES.filter((r) => r.files.test(file) && r.test(line)).map(
    ({ level, rule, message }) => ({ level, rule, message }),
  );
  if (
    /\.tsx$/.test(file) &&
    /role=["']dialog["']/.test(line) &&
    /aria-modal/.test(fileText) &&
    !/useModalDialog/.test(fileText)
  ) {
    findings.push({
      level: "warning",
      rule: "modal-without-focus-hook",
      message:
        "Modal dialog without useModalDialog: focus must move in, stay trapped, close on Escape and return (src/lib/a11y/useModalDialog.ts).",
    });
  }
  return findings;
}

/** Parse `git diff --unified=0` output into added lines with their new line numbers. */
export function addedLines(diff) {
  /** @type {{ file: string, line: number, text: string, previous: string }[]} */
  const out = [];
  let file = "";
  let lineNo = 0;
  let previous = "";
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.slice(4).replace(/^b\//, "");
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNo = Number(hunk[1]);
      previous = "";
      continue;
    }
    if (raw.startsWith("+") && file && file !== "/dev/null") {
      out.push({ file, line: lineNo, text: raw.slice(1), previous });
      previous = raw.slice(1);
      lineNo++;
    }
  }
  return out;
}

function main() {
  const base = process.argv[2] ?? process.env.A11Y_BASE ?? "origin/main";
  // Against the merge base and the working tree, so a local run also sees uncommitted edits.
  const mergeBase = execFileSync("git", ["merge-base", base, "HEAD"], { encoding: "utf8" }).trim();
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", mergeBase, "--", "apps/web/src"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const fileCache = new Map();
  const readNew = (file) => {
    if (!fileCache.has(file)) {
      try {
        fileCache.set(file, readFileSync(file, "utf8"));
      } catch {
        fileCache.set(file, "");
      }
    }
    return fileCache.get(file);
  };

  let errors = 0;
  let warnings = 0;
  const annotate = !!process.env.GITHUB_ACTIONS;
  for (const { file, line, text, previous } of addedLines(diff)) {
    for (const f of checkLine(file, text, previous, readNew(file))) {
      if (f.level === "error") errors++;
      else warnings++;
      if (annotate) {
        console.log(`::${f.level} file=${file},line=${line},title=a11y/${f.rule}::${f.message}`);
      } else {
        console.log(`${f.level.toUpperCase()} ${file}:${line} [${f.rule}] ${f.message}`);
      }
    }
  }
  console.log(
    `Accessibility diff check against ${base}: ${errors} error(s), ${warnings} warning(s).`,
  );
  if (errors > 0) {
    console.log(
      "Fix them, or mark a deliberate exception with `a11y-ignore: <reason>` on the line.",
    );
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
