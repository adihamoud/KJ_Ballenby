# KJ Ballenby

Multi-venue karaoke queue SaaS. Guests scan the QR code on their table, pick a song from the
venue's catalog, and a fair-queue engine decides who sings next. DJs run the night from a live
dashboard. Hebrew (RTL) first, English second. Mobile web app, no app store.

|                        |                                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| Status                 | Phase 1: foundation (see `docs/ROADMAP.md`)                            |
| Stack                  | pnpm + Turborepo, Next.js 15, Tailwind v4, next-intl, Supabase, Vercel |
| Docs                   | [`docs/README.md`](docs/README.md)                                     |
| Working with AI agents | [`CLAUDE.md`](CLAUDE.md)                                               |

## Quick start

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in Supabase values, see docs/SETUP_ACCOUNTS.md
pnpm dev                              # http://localhost:3000 → /he
```

Quality gate before any commit:

```bash
pnpm check
```

## Repository layout

```
apps/web               Next.js app: guest PWA, DJ dashboard, venue admin
packages/queue-engine  Pure TypeScript queue rules engine (unit-tested)
packages/db            Database types and Supabase env helpers
packages/i18n          Locales and message catalogs (he, en)
supabase/              Migrations, RLS policies, seed data
docs/                  Product and engineering documentation
.claude/               Agent definitions and skills for autonomous development
```

## License

Private. All rights reserved.
