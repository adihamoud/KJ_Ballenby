import type { ResolvedTableRow } from "@kj/db";

/**
 * The demo venue served when Supabase is not configured. Mirrors `supabase/seed.sql`; the QR
 * tokens are fixed so e2e can hit `/j/<token>`. No server-only imports: the DJ console (client)
 * and the guest resolver (server) both read from here.
 */

export const DEMO_VENUE_ID = "00000000-0000-0000-0000-000000000001";
/** The demo night is always on: the DJ console and the guest flow share it (`lib/demo`). */
export const DEMO_NIGHT_ID = "demo-night";

const DEMO_VENUE = {
  venue_id: DEMO_VENUE_ID,
  venue_name: "Demo Karaoke Bar",
  venue_slug: "demo-bar",
  night_id: DEMO_NIGHT_ID,
  night_open: true,
} as const;

export const DEMO_TABLES: readonly ResolvedTableRow[] = [
  {
    ...DEMO_VENUE,
    table_id: "00000000-0000-4000-8000-00000000d001",
    table_label: "T1",
    join_code: "DEMO1",
  },
  {
    ...DEMO_VENUE,
    table_id: "00000000-0000-4000-8000-00000000d002",
    table_label: "T2",
    join_code: "DEMO2",
  },
  {
    ...DEMO_VENUE,
    table_id: "00000000-0000-4000-8000-00000000d003",
    table_label: "T3",
    join_code: "DEMO3",
  },
  {
    ...DEMO_VENUE,
    table_id: "00000000-0000-4000-8000-00000000d00b",
    table_label: "Bar",
    join_code: "DEMOB",
  },
];
