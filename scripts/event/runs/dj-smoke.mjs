// DJ smoke: open the console with the bot's saved session and print the snapshot.
import { launch, newDj } from "../lib.mjs";

const browser = await launch();
const dj = await newDj(browser);
const opened = await dj.open();
await dj.screenshot("scripts/event/shots/dj-smoke.png");
await browser.close();
console.log(JSON.stringify(opened, null, 2));
