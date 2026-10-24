"use server";

import { loadTonightBoard } from "./tonight-load";
import type { TonightBoardResult } from "./tonight-load";

/** Fresh "Tables tonight" board (realtime hint handler and polling on the admin page). */
export async function refreshTonightBoard(): Promise<TonightBoardResult> {
  return loadTonightBoard();
}
