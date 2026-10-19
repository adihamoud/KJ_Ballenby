"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { getGroupMembers, type GroupMember } from "@/lib/supabase/queries";

type Connection = "live" | "reconnecting";

/**
 * Member list that follows the group in realtime. Realtime events are treated as a hint
 * to refetch through the normal (RLS-protected) query rather than patched into state.
 */
export function GroupMembers({
  groupId,
  currentUserId,
  initialMembers,
}: {
  groupId: string;
  currentUserId: string;
  initialMembers: GroupMember[];
}) {
  const t = useTranslations("app.members");
  const [members, setMembers] = useState(initialMembers);
  const [connection, setConnection] = useState<Connection>("reconnecting");

  useEffect(() => {
    let supabase: ReturnType<typeof getBrowserSupabase>;
    try {
      supabase = getBrowserSupabase();
    } catch {
      return;
    }
    let cancelled = false;

    const refetch = async () => {
      const next = await getGroupMembers(supabase, groupId);
      if (!cancelled) setMembers(next);
    };

    const channel = supabase
      .channel(`group-members:${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        () => void refetch(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          void refetch();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("reconnecting");
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [groupId]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted flex items-center gap-2 text-xs">
        <span
          aria-hidden="true"
          className={`inline-block size-2 rounded-full ${
            connection === "live" ? "bg-emerald-400" : "bg-accent"
          }`}
        />
        {t("count", { count: members.length })} · {t(connection)}
      </p>
      <ul className="flex flex-col gap-2" data-testid="group-members">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3">
            {m.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.avatarUrl}
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                aria-hidden="true"
                className="bg-surface-2 border-border flex size-8 items-center justify-center rounded-full border text-sm font-semibold"
              >
                {(m.displayName ?? "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span>
              {m.displayName ?? t("unnamed")}
              {m.userId === currentUserId && (
                <span className="text-muted ms-1 text-sm">{t("you")}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
