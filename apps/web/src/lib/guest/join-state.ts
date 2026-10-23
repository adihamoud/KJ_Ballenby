export type JoinError = "invalidCode" | "nameRequired" | "notFound" | "unavailable";

export interface JoinState {
  error: JoinError | null;
}

export const initialJoinState: JoinState = { error: null };
