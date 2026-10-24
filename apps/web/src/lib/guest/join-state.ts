/** `identity`: the table exists but the anonymous sign-in failed (e.g. Supabase rate limit). */
export type JoinError = "invalidCode" | "nameRequired" | "notFound" | "unavailable" | "identity";

export interface JoinState {
  error: JoinError | null;
  /**
   * What the guest submitted, echoed back on error. The form's inputs are uncontrolled (so
   * text typed before React hydrates survives) and React resets them to their `defaultValue`
   * after every action, so the defaults must carry the last submission.
   */
  code?: string;
  name?: string;
}

export const initialJoinState: JoinState = { error: null };
