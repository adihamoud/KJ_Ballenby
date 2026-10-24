// Run a command with the two public Supabase variables of the main checkout's
// apps/web/.env.local exported (the worktree has no env file of its own).
// Usage: node scripts/event/with-env.mjs <command> [args...]
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const ENV_FILE = "C:/dev/KJ_Ballenby/apps/web/.env.local";
const WANTED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

export function loadPublicEnv() {
  const out = {};
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && WANTED.includes(m[1])) out[m[1]] = m[2].trim();
  }
  return out;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/event/with-env.mjs")) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    console.error("usage: node scripts/event/with-env.mjs <command> [args...]");
    process.exit(2);
  }
  const env = { ...process.env, ...loadPublicEnv() };
  const child = spawn(cmd, args, { stdio: "inherit", shell: true, env });
  child.on("exit", (code) => process.exit(code ?? 1));
}
