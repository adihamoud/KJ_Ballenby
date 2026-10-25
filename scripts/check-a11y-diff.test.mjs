// node --test scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import { addedLines, checkLine } from "./check-a11y-diff.mjs";

const rules = (file, line, previous, fileText) =>
  checkLine(file, line, previous, fileText).map((f) => `${f.level}:${f.rule}`);

test("flags zoom blocking, positive tabindex and aria-hidden on clickables as errors", () => {
  assert.deepEqual(rules("a.tsx", "  maximumScale: 1,"), ["error:zoom-blocked"]);
  assert.deepEqual(rules("a.tsx", "<div tabIndex={2}>"), ["error:positive-tabindex"]);
  assert.deepEqual(rules("a.tsx", '<a href="/x" aria-hidden="true">'), [
    "error:aria-hidden-focusable",
  ]);
  assert.deepEqual(rules("a.tsx", '<span aria-hidden="true">✕</span>'), []);
  assert.deepEqual(rules("a.tsx", "<div tabIndex={-1}>"), []);
});

test("an outline removed without a focus-visible replacement is an error in TSX", () => {
  assert.deepEqual(rules("a.tsx", 'className="outline-none"'), ["error:focus-outline-removed"]);
  assert.deepEqual(rules("a.tsx", 'className="outline-none focus-visible:ring-2"'), []);
  assert.deepEqual(rules("a.css", "  outline: none;"), ["warning:focus-outline-removed"]);
});

test("warns on tiny text, arbitrary colours and unmuted autoplay", () => {
  assert.deepEqual(rules("a.tsx", 'className="text-[0.6rem]"'), ["warning:tiny-text"]);
  assert.deepEqual(rules("a.tsx", 'className="text-[11px]"'), ["warning:tiny-text"]);
  assert.deepEqual(rules("a.tsx", 'className="text-[0.75rem]"'), []);
  assert.deepEqual(rules("a.tsx", 'className="bg-[#ff0000]"'), ["warning:colour-outside-tokens"]);
  assert.deepEqual(rules("a.tsx", "<video autoPlay />"), ["warning:video-autoplay"]);
  assert.deepEqual(rules("a.tsx", "<video autoPlay muted />"), []);
});

test("a modal dialog without useModalDialog is a warning", () => {
  const line = '<div role="dialog" aria-modal="true">';
  assert.deepEqual(rules("a.tsx", line, "", line), ["warning:modal-without-focus-hook"]);
  assert.deepEqual(rules("a.tsx", line, "", `useModalDialog(ref, close);\n${line}`), []);
  assert.deepEqual(rules("a.tsx", '<div role="dialog">', "", '<div role="dialog">'), []);
});

test("a11y-ignore on the line or the line above skips it", () => {
  assert.deepEqual(rules("a.tsx", "<div tabIndex={2}> {/* a11y-ignore: demo */}"), []);
  assert.deepEqual(rules("a.tsx", "<div tabIndex={2}>", "// a11y-ignore: demo"), []);
});

test("reads added lines and their numbers from a zero-context diff", () => {
  const diff = [
    "diff --git a/apps/web/src/x.tsx b/apps/web/src/x.tsx",
    "--- a/apps/web/src/x.tsx",
    "+++ b/apps/web/src/x.tsx",
    "@@ -3,0 +4,2 @@",
    "+first",
    "+second",
    "@@ -10 +12 @@",
    "-old",
    "+third",
  ].join("\n");
  assert.deepEqual(
    addedLines(diff).map(({ file, line, text, previous }) => [file, line, text, previous]),
    [
      ["apps/web/src/x.tsx", 4, "first", ""],
      ["apps/web/src/x.tsx", 5, "second", "first"],
      ["apps/web/src/x.tsx", 12, "third", ""],
    ],
  );
});
