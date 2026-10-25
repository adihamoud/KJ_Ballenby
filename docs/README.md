# KJ_Ballenby Documentation

KJ_Ballenby is a multi-venue SaaS for karaoke bars: guests request songs from their phones, a rules engine orders a fair queue, and the DJ ("host") runs the night from a live dashboard.

| Document                                 | What it covers                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [PRD.md](./PRD.md)                       | Product requirements: problem, personas, user stories with acceptance criteria, non-functional requirements, out of scope.    |
| [ARCHITECTURE.md](./ARCHITECTURE.md)     | System overview, monorepo layout, key request flows, realtime strategy, auth flows, environments, security, observability.    |
| [DATA_MODEL.md](./DATA_MODEL.md)         | Every table with columns, types, relationships, indexes, RLS policy summary, and an ER diagram.                               |
| [QUEUE_RULES.md](./QUEUE_RULES.md)       | Specification of the pure-TypeScript queue rules engine: inputs/outputs, rules, reason codes, worked example, host overrides. |
| [ROADMAP.md](./ROADMAP.md)               | The five delivery phases with goals, deliverables, and "done when" criteria.                                                  |
| [SETUP_ACCOUNTS.md](./SETUP_ACCOUNTS.md) | Step-by-step owner guide for Supabase, Google OAuth, Microsoft (Azure) OAuth, Twilio phone OTP, and Vercel.                   |
| [PRIVACY.md](./PRIVACY.md)               | Cookie and storage register, third parties, personal data inventory, retention, rights flows, privacy backlog and agents.     |
| [DECISIONS.md](./DECISIONS.md)           | Architecture Decision Records (ADR-001 onwards).                                                                              |

## Conventions

- Documents are written in English; the product UI is Hebrew (RTL) first with English as a second locale.
- Dates are ISO 8601 (`2026-10-19`).
- The data model in `DATA_MODEL.md` and the engine spec in `QUEUE_RULES.md` are contracts: code must match them, and changes go through a new ADR in `DECISIONS.md`.
