"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  MapPin,
  Users,
  Waves,
} from "lucide-react";
import { Avatar, Btn, Card, Eyebrow, Field, ModalShell, SectionTitle, initialsOf } from "@/components/ui";
import { api, type TripLake, type Participant, type Segment, type Stay, type Trip } from "@/lib/api";
import { daysUntil, fmtRange } from "@/lib/format";

type EditDraft = { name: string; destination: string };

export default function TripDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [lakes, setLakes] = useState<TripLake[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);

  // Trip edit modal (name + destination — dates derive from the weeks).
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Trip>(`/trips/${tripId}`).then(setTrip).catch(() => {});
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setParticipants).catch(() => {});
    api.get<TripLake[]>(`/trips/${tripId}/lakes`).then(setLakes).catch(() => {});
    api.get<Segment[]>(`/trips/${tripId}/segments`).then(setSegments).catch(() => {});
    api.get<Stay[]>(`/trips/${tripId}/stays`).then(setStays).catch(() => {});
  }, [tripId]);

  if (!trip) return <div className="p-8" style={{ color: "var(--text-3)" }}>Loading…</div>;

  const daysToStart = daysUntil(trip.start_date);
  const daysToEnd = daysUntil(trip.end_date);
  const isPast = daysToEnd !== null && daysToEnd < 0;
  const isActive = !isPast && daysToStart !== null && daysToStart <= 0;
  const dayNumber = daysToStart !== null ? 1 - daysToStart : null;
  const tripLength = trip.start_date && trip.end_date
    ? Math.round((new Date(`${trip.end_date}T12:00:00`).getTime() - new Date(`${trip.start_date}T12:00:00`).getTime()) / 86_400_000) + 1
    : null;

  const weeks = [...segments].sort(
    (a, b) => (a.sort_order - b.sort_order) || (a.start_date ?? "").localeCompare(b.start_date ?? ""),
  );
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const lakeById = new Map(lakes.map((l) => [l.id, l]));
  const membersOf = (segmentId: string): Participant[] =>
    stays
      .filter((s) => s.segment_id === segmentId)
      .map((s) => participantById.get(s.participant_id))
      .filter((p): p is Participant => Boolean(p))
      .sort((a, b) => a.name.localeCompare(b.name));
  const lakeNameOf = (s: Segment) => (s.lake_id && lakeById.get(s.lake_id)?.name) || "Lake TBD";

  function openEdit() {
    setError(null);
    setDraft({ name: trip!.name, destination: trip!.destination ?? "" });
  }

  async function saveEdit() {
    if (!draft || !draft.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch<Trip>(`/trips/${tripId}`, {
        name: draft.name.trim(),
        destination: draft.destination.trim() || null,
      });
      setTrip(updated);
      // The trip layout header holds its own copy — let it know.
      window.dispatchEvent(new CustomEvent<Trip>("gf:trip-updated", { detail: updated }));
      setDraft(null);
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-7 max-w-[1240px] mx-auto">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl mb-6 px-5 py-5 sm:px-[30px] sm:py-[26px]"
        style={{ background: "var(--primary)", color: "var(--on-primary)", boxShadow: "var(--shadow-md)" }}
      >
        <ContourBg stroke="#fff" opacity={0.1} />
        <div className="relative flex items-end justify-between gap-6 flex-wrap">
          <div>
            {isActive ? (
              <>
                <Eyebrow style={{ color: "rgba(255,255,255,.7)" }}>On the water</Eyebrow>
                <div
                  className="gf-mono mt-2 whitespace-nowrap text-[42px] sm:text-[52px]"
                  style={{ fontWeight: 500, lineHeight: 1, letterSpacing: "-.01em" }}
                >
                  Day {dayNumber}
                  {tripLength !== null && <span style={{ fontSize: 19, opacity: 0.7 }}> / {tripLength}</span>}
                </div>
              </>
            ) : isPast ? (
              <>
                <Eyebrow style={{ color: "rgba(255,255,255,.7)" }}>Trip complete</Eyebrow>
                <div
                  className="mt-2 text-[34px] sm:text-[42px]"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: "var(--display-weight)" as unknown as number,
                    letterSpacing: "var(--display-tracking)",
                    lineHeight: 1.05,
                  }}
                >
                  {trip.name}
                </div>
              </>
            ) : (
              <>
                <Eyebrow style={{ color: "rgba(255,255,255,.7)" }}>Lines in the water</Eyebrow>
                <div
                  className="gf-mono mt-2 whitespace-nowrap text-[42px] sm:text-[52px]"
                  style={{ fontWeight: 500, lineHeight: 1, letterSpacing: "-.01em" }}
                >
                  {daysToStart !== null ? (
                    <>
                      {Math.max(0, daysToStart)}
                      <span style={{ fontSize: 19, opacity: 0.7 }}> days</span>
                    </>
                  ) : <>—</>}
                </div>
              </>
            )}
            <div className="mt-3 flex gap-4 flex-wrap text-[14px]" style={{ opacity: 0.85 }}>
              {trip.destination && (
                <button
                  onClick={openEdit}
                  title="Edit trip"
                  className="inline-flex items-center gap-1.5 hover:underline"
                  style={{ color: "inherit" }}
                >
                  <MapPin size={15} /> {trip.destination}
                </button>
              )}
              <button
                onClick={openEdit}
                title="Edit trip"
                className="inline-flex items-center gap-1.5 hover:underline"
                style={{ color: "inherit" }}
              >
                <Calendar size={15} /> {fmtRange(trip.start_date, trip.end_date) || "Dates TBD"}
              </button>
              <Link
                href={`/trips/${tripId}/participants`}
                className="inline-flex items-center gap-1.5 hover:underline"
                style={{ color: "inherit" }}
              >
                <Users size={15} /> {participants.length} {participants.length === 1 ? "person" : "people"}
              </Link>
            </div>
          </div>
          <img src="/walleye/walleye-cutout.png" alt="" className="hidden sm:block"
            style={{ width: 220, marginBottom: -34, marginRight: -6, filter: "drop-shadow(0 12px 22px rgba(0,0,0,.3))" }} />
        </div>
      </div>

      {/* Weeks */}
      {weeks.length === 0 ? (
        <div>
          <SectionTitle right={
            <Link href={`/trips/${tripId}/participants`} className="text-[13px] font-semibold" style={{ color: "var(--accent-600)" }}>
              Open list
            </Link>
          }>The crew</SectionTitle>
          <Card pad={20}>
            <MemberChips people={participants} emptyLabel="No one in the group yet." />
          </Card>
        </div>
      ) : (
        <div>
          <SectionTitle right={
            <Link href={`/trips/${tripId}/segments`} className="text-[13px] font-semibold" style={{ color: "var(--accent-600)" }}>
              Open schedule
            </Link>
          }>{weeks.length > 1 ? "Weeks" : "The week"}</SectionTitle>
          {weeks.length === 1 ? (
            <Card pad={20}>
              <div
                className="inline-flex items-center gap-2 mb-3.5 text-[17px]"
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: "var(--display-weight)" as unknown as number,
                  letterSpacing: "var(--display-tracking)",
                  color: "var(--text)",
                }}
              >
                <Waves size={17} style={{ color: "var(--text-3)" }} /> {lakeNameOf(weeks[0])}
              </div>
              <MemberChips people={membersOf(weeks[0].id)} emptyLabel="No one signed up yet." />
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {weeks.map((w) => (
                <Card key={w.id} pad={20}>
                  <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                    <div
                      className="text-[17px]"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: "var(--display-weight)" as unknown as number,
                        letterSpacing: "var(--display-tracking)",
                        color: "var(--text)",
                      }}
                    >
                      {w.name}
                    </div>
                    <span className="gf-mono text-[13px]" style={{ color: "var(--text-2)" }}>
                      {fmtRange(w.start_date, w.end_date) || "Dates TBD"}
                    </span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 mb-3.5 text-[13.5px]" style={{ color: "var(--text-2)" }}>
                    <Waves size={15} style={{ color: "var(--text-3)" }} /> {lakeNameOf(w)}
                  </div>
                  <MemberChips people={membersOf(w.id)} emptyLabel="No one signed up yet." />
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trip edit modal */}
      {draft && (
        <ModalShell
          title="Edit trip"
          onClose={() => setDraft(null)}
          footer={
            <>
              <Btn kind="ghost" onClick={() => setDraft(null)}>Cancel</Btn>
              <Btn onClick={saveEdit} disabled={busy || !draft.name.trim()}>
                {busy ? "Saving…" : "Save"}
              </Btn>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field
              label="Trip name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <Field
              label="Destination"
              placeholder="e.g. Ogoki, Ontario"
              value={draft.destination}
              onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
            />
            <div className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
              Dates come from the weeks on the{" "}
              <Link href={`/trips/${tripId}/segments`} className="font-semibold" style={{ color: "var(--accent-600)" }}>
                Schedule
              </Link>{" "}
              page.
            </div>
            {error && <div className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function MemberChips({ people, emptyLabel }: { people: Participant[]; emptyLabel: string }) {
  if (people.length === 0) {
    return <div className="text-[14px]" style={{ color: "var(--text-3)" }}>{emptyLabel}</div>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-[13px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          <Avatar initials={initialsOf(p.name, p.email)} src={p.avatar_url} size={22} />
          {p.name}
        </span>
      ))}
    </div>
  );
}

function ContourBg({ stroke = "#fff", opacity = 0.1 }: { stroke?: string; opacity?: number }) {
  const rings = [];
  for (let i = 0; i < 9; i++) {
    const k = 1 - i * 0.1;
    rings.push(
      <ellipse key={i} cx={300} cy={230} rx={300 * k} ry={150 * k}
        transform={`rotate(${-16 + i * 1.4} 300 230)`} fill="none" stroke={stroke} strokeWidth="1.5" />
    );
  }
  return (
    <svg viewBox="0 0 600 460" preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity }}>
      {rings}
    </svg>
  );
}
