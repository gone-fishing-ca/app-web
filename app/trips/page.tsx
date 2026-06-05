"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, LogOut, MapPin, Plus, Tent } from "lucide-react";
import { Btn, Card, Eyebrow, EmptyState, Wordmark } from "@/components/ui";
import { api, type Trip } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtRange } from "@/lib/format";

export default function TripsPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<Trip[]>("/trips").then(setTrips).catch((e) => setError(e.message ?? "Failed to load trips"));
  }, [authLoading, user, router]);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header
        className="flex items-center px-8 py-5"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <Wordmark size={18} glyph mode="light" />
        <div className="ml-auto flex items-center gap-3">
          <div className="text-[13px]" style={{ color: "var(--text-2)" }}>{user.email}</div>
          <Btn kind="ghost" size="sm" icon={LogOut} onClick={signOut}>Sign out</Btn>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-8 py-10">
        <div className="flex items-end justify-between mb-7">
          <div>
            <Eyebrow>Your trips</Eyebrow>
            <h1
              className="mt-2"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: "var(--display-weight)" as unknown as number,
                letterSpacing: "var(--display-tracking)",
                fontSize: 36,
                color: "var(--text)",
              }}
            >
              Pick a trip — or plan a new one.
            </h1>
          </div>
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
          <EmptyState
            icon={Tent}
            title="No trips yet"
            subtitle="Spin up the first one — you can always clone it next year."
            action={<Link href="/trips/new"><Btn kind="accent" icon={Plus}>New trip</Btn></Link>}
          />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {trips.map((t) => <TripCard key={t.id} trip={t} />)}
          </div>
        )}
      </main>
    </div>
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
          {(trip.start_date || trip.end_date) && (
            <div className="inline-flex items-center gap-2"><Calendar size={14} />{fmtRange(trip.start_date, trip.end_date)}</div>
          )}
        </div>
      </Card>
    </Link>
  );
}
