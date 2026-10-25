## What

<!-- One or two sentences. Link the roadmap item or issue. -->

## Why

## How to test

- [ ] `pnpm check` is green
- [ ] Checked in `/he` (RTL) and `/en`
- [ ] Checked on a phone-sized viewport
- [ ] UI changes: keyboard-walked, `a11y-audit` agent run, new pages added to `src/lib/a11y/routes.ts`

## Checklist

- [ ] PR title is conventional and reads well as a changelog line (squash merge)
- [ ] New strings added to both `he.json` and `en.json`
- [ ] Schema changes: migration + RLS + `database.types.ts` + `docs/DATA_MODEL.md`
- [ ] Queue rule changes: test + `docs/QUEUE_RULES.md`
- [ ] Architecture decision: ADR in `docs/DECISIONS.md`
