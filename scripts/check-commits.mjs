#!/usr/bin/env node
// Fails when a commit in the range is not a conventional commit. release-please builds the version
// bump and CHANGELOG.md from these subjects, and silently skips any it cannot parse.
//
//   node scripts/check-commits.mjs origin/main..HEAD
import { execFileSync } from "node:child_process";

const range = process.argv[2] ?? "origin/main..HEAD";
const TYPES = "feat|fix|perf|revert|refactor|docs|style|test|chore|build|ci";
const CONVENTIONAL = new RegExp(`^(${TYPES})(\\([a-z0-9./, -]+\\))?!?: \\S`);

const subjects = execFileSync("git", ["log", "--no-merges", "--format=%h %s", range], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

const bad = subjects.filter((line) => !CONVENTIONAL.test(line.slice(line.indexOf(" ") + 1)));

if (bad.length > 0) {
  console.error(
    `Not conventional commits (expected "<type>(<scope>)?: <subject>", type one of ${TYPES}):`,
  );
  for (const line of bad) console.error(`  ${line}`);
  console.error("Reword them (git rebase -i) so they reach the changelog.");
  process.exit(1);
}
console.log(`${subjects.length} commit(s) in ${range} are conventional.`);
