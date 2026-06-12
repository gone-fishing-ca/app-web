"use client";

import { use, useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { EmptyState, SectionTitle } from "@/components/ui";
import { PrefsCard } from "@/components/prefs-card";
import {
  api,
  type PackLine,
  type Participant,
  type Segment,
  type Stay,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

function errMsg(e: unknown, fallback: string): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message?: string }).message)
    : fallback;
}

export default function MyPrefsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const { user } = useAuth();
  const [lines, setLines] = useState<PackLine[] | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [selected, setSelected] = useState<string | "">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PackLine[]>(`/trips/${tripId}/pack`).then(setLines).catch((e) => setError(errMsg(e, "Load failed")));
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setParticipants).catch(() => {});
    api.get<Segment[]>(`/trips/${tripId}/segments`).then(setSegments).catch(() => {});
    api.get<Stay[]>(`/trips/${tripId}/stays`).then(setStays).catch(() => {});
  }, [tripId]);

  // Default to the signed-in user's roster row; organizers can view anyone's.
  const me = useMemo(
    () => participants.find((p) => p.user_id && p.user_id === user?.id) ?? null,
    [participants, user],
  );
  const participantId = selected || me?.id || participants[0]?.id || "";
  const participant = participants.find((p) => p.id === participantId) ?? null;
  const prefCount = (lines ?? []).filter((l) => l.item.collect_prefs).length;

  return (
    <div className="p-4 sm:p-7 max-w-[860px] mx-auto">
      <SectionTitle
        right={
          participants.length > 0 && (
            <select
              value={participantId}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-[11px] px-3 py-2 text-[13.5px] font-semibold"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            >
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{me?.id === p.id ? " (you)" : ""}</option>
              ))}
            </select>
          )
        }
      >
        {participant && me?.id !== participant.id ? `${participant.name}'s prefs` : "My prefs"}
      </SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {lines === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : prefCount === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="No prefs to answer yet"
          subtitle="Items marked “Prefs” on the Packing list show up here for everyone to say how many they want." />
      ) : (
        <PrefsCard
          tripId={tripId}
          lines={lines}
          setLines={setLines}
          participantId={participantId}
          segments={segments}
          stays={stays}
          onError={(m) => setError(m)}
        />
      )}
    </div>
  );
}
