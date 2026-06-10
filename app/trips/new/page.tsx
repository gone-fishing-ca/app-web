"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Compass, Copy, MapPin, PlaneTakeoff } from "lucide-react";
import { Btn, Card, Eyebrow, Field } from "@/components/ui";
import { api, type Trip } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function NewTripPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [flyIn, setFlyIn] = useState("");
  const [flyOut, setFlyOut] = useState("");
  const [cloneFrom, setCloneFrom] = useState<string>("");
  const [existing, setExisting] = useState<Trip[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<Trip[]>("/trips").then(setExisting).catch(() => {});
  }, [loading, user, router]);

  if (loading || !user) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const trip = await api.post<Trip>("/trips", {
        name,
        destination: destination || null,
        fly_in_date: flyIn || null,
        fly_out_date: flyOut || null,
        clone_from: cloneFrom || null,
      });
      router.replace(`/trips/${trip.id}`);
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "Could not create trip";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header
        className="px-4 sm:px-8 py-4 sm:py-5 flex items-center gap-4"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <Link href="/trips" className="inline-flex items-center gap-1.5 text-[13.5px]" style={{ color: "var(--text-2)" }}>
          <ArrowLeft size={16} /> Back to trips
        </Link>
      </header>

      <main className="max-w-[760px] mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <Eyebrow>New trip</Eyebrow>
        <h1
          className="mt-2 mb-6 sm:mb-8 text-[28px] sm:text-[36px]"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "var(--display-weight)" as unknown as number,
            letterSpacing: "var(--display-tracking)",
            color: "var(--text)",
          }}
        >
          Set the stage.
        </h1>

        <form onSubmit={submit} className="flex flex-col gap-6">
          <Card pad={24}>
            <div className="flex flex-col gap-4">
              <Field label="Trip name" icon={Compass} value={name} required onChange={(e) => setName(e.target.value)} placeholder="Ogoki 2026" />
              <Field label="Destination" icon={MapPin} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Northern Ontario" hint="A high-level label. Each lake's name, outfitter, and dates are set on the Lakes page." />
            </div>
          </Card>

          {!cloneFrom && (
            <Card pad={24}>
              <div className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>First fly window</div>
              <div className="text-[12px] mt-1 mb-3" style={{ color: "var(--text-3)" }}>
                Optional — seeds your first lake and a “Whole Trip” segment. Add more lakes later.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Fly-in" type="date" icon={PlaneTakeoff} value={flyIn} onChange={(e) => setFlyIn(e.target.value)} />
                <Field label="Fly-out" type="date" value={flyOut} onChange={(e) => setFlyOut(e.target.value)} />
              </div>
            </Card>
          )}

          {existing.length > 0 && (
            <Card pad={24}>
              <div className="text-[13px] font-semibold mb-3 inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                <Copy size={15} /> Clone from a previous trip <span className="text-[11.5px] font-normal" style={{ color: "var(--text-3)" }}>(optional)</span>
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="clone" checked={!cloneFrom} onChange={() => setCloneFrom("")} />
                  <span className="text-[14px]" style={{ color: "var(--text)" }}>Start fresh</span>
                </label>
                {existing.map((t) => (
                  <label key={t.id} className="inline-flex items-center gap-2">
                    <input type="radio" name="clone" checked={cloneFrom === t.id} onChange={() => setCloneFrom(t.id)} />
                    <span className="text-[14px]" style={{ color: "var(--text)" }}>
                      {t.name} <span style={{ color: "var(--text-3)" }}>— copies lakes, cabins, weeks, contacts, pack list, gear, food, beverage templates, and the group (stays start fresh)</span>
                    </span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {error && (
            <div className="rounded-[10px] text-[13px] px-3 py-2.5"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Link href="/trips"><Btn kind="ghost">Cancel</Btn></Link>
            <Btn type="submit" kind="accent" iconRight={ArrowRight} disabled={submitting || !name}>
              {submitting ? "Creating…" : "Create trip"}
            </Btn>
          </div>
        </form>
      </main>
    </div>
  );
}
