import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReasonCode } from "@kj/queue-engine";
import {
  REJECT_MESSAGE_KEYS,
  REQUEST_NOTE_MAX,
  isReasonCode,
  normalizeNote,
  normalizeSingers,
  rejectMessageKey,
} from "./request-model";

const here = dirname(fileURLToPath(import.meta.url));
const messagesDir = join(here, "..", "..", "..", "..", "..", "packages", "i18n", "messages");

/** Every reason code from docs/QUEUE_RULES.md section 7. */
const REASON_CODES: ReasonCode[] = [
  "MAX_PENDING_USER",
  "MAX_PENDING_TABLE",
  "COOLDOWN",
  "DUPLICATE_SONG",
  "NIGHT_CLOSED",
  "CUTOFF",
  "TOO_MANY_SINGERS",
  "DUETS_DISABLED",
  "SONG_INACTIVE",
];

describe("rejection messages", () => {
  it("map every reason code to a queue.reject key", () => {
    expect(Object.keys(REJECT_MESSAGE_KEYS).sort()).toEqual([...REASON_CODES].sort());
    for (const code of REASON_CODES) {
      expect(rejectMessageKey(code)).toMatch(/^queue\.reject\.[a-z][A-Za-z]+$/);
    }
  });

  it.each(["he", "en"])("exist in the %s catalog", (locale) => {
    const messages = JSON.parse(readFileSync(join(messagesDir, `${locale}.json`), "utf8")) as {
      queue: { reject: Record<string, string> };
    };
    for (const code of REASON_CODES) {
      const key = rejectMessageKey(code).replace("queue.reject.", "");
      expect(messages.queue.reject[key], `${locale}: ${key}`).toBeTruthy();
    }
  });

  it("recognize reason codes coming back from the RPC", () => {
    expect(isReasonCode("MAX_PENDING_USER")).toBe(true);
    expect(isReasonCode("NOT_PARTICIPANT")).toBe(false);
    expect(isReasonCode(null)).toBe(false);
    expect(isReasonCode("toString")).toBe(false);
  });
});

describe("normalizeSingers", () => {
  it("trims, collapses whitespace, drops empties and non-strings", () => {
    expect(normalizeSingers([" דנה ", "", "  ", 42, "Yossi   Cohen"])).toEqual([
      "דנה",
      "Yossi Cohen",
    ]);
    expect(normalizeSingers("דנה")).toEqual([]);
    expect(normalizeSingers(undefined)).toEqual([]);
  });

  it("caps each name but keeps the count so the engine can reject it", () => {
    const long = "x".repeat(80);
    expect(normalizeSingers([long])[0]).toHaveLength(40);
    expect(normalizeSingers(Array.from({ length: 6 }, (_, i) => `s${i}`))).toHaveLength(6);
    expect(normalizeSingers(Array.from({ length: 50 }, (_, i) => `s${i}`))).toHaveLength(20);
  });
});

describe("normalizeNote", () => {
  it("returns null for empty input and caps long notes", () => {
    expect(normalizeNote(undefined)).toBeNull();
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote(" יום  הולדת! ")).toBe("יום הולדת!");
    expect(normalizeNote("n".repeat(500))).toHaveLength(REQUEST_NOTE_MAX);
  });
});
