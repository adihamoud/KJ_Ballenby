// Smoke: one guest joins T1, searches, requests a duet, reads the queue, cancels.
import { launch, newGuest } from "../lib.mjs";

const browser = await launch();
const g = await newGuest(browser);
const out = {};
out.join = await g.join("DEMO1", "Smoke");
out.session = await g.session();
out.search = await g.search("queen");
out.request = await g.request("I Will Survive", {
  singers: ["Smoke", "Yossi"],
  note: "smoke test",
});
out.queue = await g.queue();
out.cancel = out.queue.mine.length ? await g.cancel(0) : "nothing to cancel";
await g.screenshot("scripts/event/shots/smoke.png");
await browser.close();
console.log(JSON.stringify(out, null, 2));
