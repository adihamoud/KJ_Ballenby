#!/usr/bin/env node
// Fails when a PR title is not a conventional commit subject. PRs are squash-merged with the title
// as the commit subject, and release-please builds the version bump and CHANGELOG.md from it,
// silently skipping any title it cannot parse.
//
//   node scripts/check-pr-title.mjs "feat(web): show the version in the footer"
const title = (process.argv[2] ?? process.env.PR_TITLE ?? "").trim();
const TYPES = "feat|fix|perf|revert|refactor|docs|style|test|chore|build|ci";
const CONVENTIONAL = new RegExp(String.raw`^(${TYPES})(\([a-z0-9./, -]+\))?!?: \S`);

if (!CONVENTIONAL.test(title)) {
  console.error(`PR title is not conventional: "${title}"`);
  console.error(`Expected "<type>(<scope>)?: <subject>", type one of ${TYPES}.`);
  console.error("It becomes the squash commit subject and the changelog line; edit the PR title.");
  process.exit(1);
}
console.log(`PR title is conventional: "${title}"`);
