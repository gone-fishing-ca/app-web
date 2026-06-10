"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, MapPin, Plus, Users } from "lucide-react";
import { Btn, Card, Eyebrow, SectionTitle, Wordmark } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import { api, type Trip } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtRange } from "@/lib/format";

/** Today as a local "YYYY-MM-DD" string, for comparing against ISO trip dates. */
function todayISO(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type Bucket = "active" | "upcoming" | "past";

function bucketFor(trip: Trip, today: string): Bucket {
  // Past: it has ended. Active: spans today. Everything else (future or
  // undated) is upcoming — a trip you're still planning.
  if (trip.end_date && trip.end_date < today) return "past";
  if (trip.start_date && trip.start_date <= today && (!trip.end_date || trip.end_date >= today)) {
    return "active";
  }
  return "upcoming";
}

export default function TripsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<Trip[]>("/trips").then(setTrips).catch((e) => setError(e.message ?? "Failed to load trips"));
  }, [authLoading, user, router]);

  const groups = useMemo(() => {
    const today = todayISO();
    const active: Trip[] = [];
    const upcoming: Trip[] = [];
    const past: Trip[] = [];
    for (const t of trips ?? []) {
      const b = bucketFor(t, today);
      (b === "active" ? active : b === "past" ? past : upcoming).push(t);
    }
    // Active & upcoming: soonest first (undated upcoming sink to the bottom).
    const byStartAsc = (a: Trip, b: Trip) =>
      (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999");
    active.sort(byStartAsc);
    upcoming.sort(byStartAsc);
    // Past: most recent first.
    past.sort((a, b) => (b.end_date ?? "").localeCompare(a.end_date ?? ""));
    return { active, upcoming, past };
  }, [trips]);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header
        className="flex items-center px-8 py-5"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <Wordmark size={18} glyph mode="light" />
        <div className="ml-auto">
          <UserMenu />
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-7">
          <Eyebrow>Your trips</Eyebrow>
          <Link href="/trips/new">
            <Btn kind="accent" icon={Plus} size="lg">New trip</Btn>
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
            style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
            {error}
          </div>
        )}

        {trips === null ? (
          <div style={{ color: "var(--text-3)" }}>Loading…</div>
        ) : trips.length === 0 ? (
          <div className="py-6 text-[14px]" style={{ color: "var(--text-3)" }}>
            No trips yet.
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {groups.active.length > 0 && (
              <TripSection title="Active trips" trips={groups.active} />
            )}
            {groups.upcoming.length > 0 && (
              <TripSection title="Upcoming trips" trips={groups.upcoming} />
            )}
            {groups.past.length > 0 && (
              <TripSection title="Past trips" trips={groups.past} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TripSection({ title, trips }: { title: string; trips: Trip[] }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {trips.map((t) => <TripCard key={t.id} trip={t} />)}
      </div>
    </section>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const days = daysUntil(trip.start_date);
  return (
    <Link href={`/trips/${trip.id}`} className="block group">
      <Card pad={20} className="transition group-hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: "var(--display-weight)" as unknown as number,
              letterSpacing: "var(--display-tracking)",
              fontSize: 20,
              color: "var(--text)",
            }}
          >
            {trip.name}
          </div>
          {days !== null && days >= 0 && (
            <div
              className="gf-mono px-2.5 py-1 rounded-full text-[12px] font-semibold"
              style={{ background: "var(--accent-100)", color: "var(--accent-600)" }}
            >
              {days}d
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 mt-2 text-[13.5px]" style={{ color: "var(--text-2)" }}>
          {trip.destination && (
            <div className="inline-flex items-center gap-2"><MapPin size={14} />{trip.destination}</div>
          )}
          <div className="inline-flex items-center gap-2">
            <Users size={14} />{trip.member_count} {trip.member_count === 1 ? "member" : "members"}
          </div>
          {(trip.start_date || trip.end_date) && (
            <div className="inline-flex items-center gap-2"><Calendar size={14} />{fmtRange(trip.start_date, trip.end_date)}</div>
          )}
        </div>
      </Card>
    </Link>
  );
}
