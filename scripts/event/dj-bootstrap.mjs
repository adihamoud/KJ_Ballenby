// Create the DJ bot's identity: an anonymous guest session (joined at the bar table) whose
// storage state is saved for the DJ console runs. Prints the user id so the venue owner can
// grant it the `dj` role with one SQL statement. Run again any time to refresh the session.
import path from "node:path";
import { launch, newGuest, STATE_DIR } from "./lib.mjs";

const browser = await launch();
const bot = await newGuest(browser, { mobile: false });
const joined = await bot.join("DEMOB", "DJ-BOT");
const session = await bot.session();
const file = path.join(STATE_DIR, "dj.json");
await bot.saveState(file);
await browser.close();

console.log(
  JSON.stringify(
    {
      joined: joined.ok,
      table: joined.table,
      userId: session?.userId ?? null,
      isAnonymous: session?.isAnonymous ?? null,
      stateFile: file,
      grantSql: session
        ? `insert into public.venue_members (venue_id, user_id, role) values ('00000000-0000-0000-0000-000000000001', '${session.userId}', 'dj') on conflict (venue_id, user_id) do update set role = excluded.role returning *;`
        : null,
    },
    null,
    2,
  ),
);
