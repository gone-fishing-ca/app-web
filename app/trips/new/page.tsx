"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Compass, Copy, MapPin, PlaneTakeoff, Tent } from "lucide-react";
import { Btn, Card, Eyebrow, Field } from "@/components/ui";
import { api, type Trip } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function NewTripPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [outfitterName, setOutfitterName] = useState("");
  const [outfitterContact, setOutfitterContact] = useState("");
  const [flyIn, setFlyIn] = useState("");
  const [flyOut, setFlyOut] = useState("");
  const [drive, setDrive] = useState("");
  const [num, setNum] = useState<string>("");
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
        outfitter_name: outfitterName || null,
        outfitter_contact: outfitterContact || null,
        fly_in_date: flyIn || null,
        fly_out_date: flyOut || null,
        drive_date: drive || null,
        num_participants: num ? Number(num) : null,
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
        className="px-8 py-5 flex items-center gap-4"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <Link href="/trips" className="inline-flex items-center gap-1.5 text-[13.5px]" style={{ color: "var(--text-2)" }}>
          <ArrowLeft size={16} /> Back to trips
        </Link>
      </header>

      <main className="max-w-[760px] mx-auto px-8 py-10">
        <Eyebrow>New trip</Eyebrow>
        <h1
          className="mt-2 mb-8"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "var(--display-weight)" as unknown as number,
            letterSpacing: "var(--display-tracking)",
            fontSize: 36,
            color: "var(--text)",
          }}
        >
          Set the stage.
        </h1>

        <form onSubmit={submit} className="flex flex-col gap-6">
          <Card pad={24}>
            <div className="flex flex-col gap-4">
              <Field label="Trip name" icon={Compass} value={name} required onChange={(e) => setName(e.target.value)} placeholder="Ogoki 2026" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Destination / lake" icon={MapPin} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Ogoki Reservoir" />
                <Field label="# of anglers" type="number" min={1} value={num} onChange={(e) => setNum(e.target.value)} placeholder="10" />
              </div>
              <Field label="Outfitter" icon={Tent} value={outfitterName} onChange={(e) => setOutfitterName(e.target.value)} placeholder="Mattice Lake Outfitters" />
              <Field label="Outfitter contact" value={outfitterContact} onChange={(e) => setOutfitterContact(e.target.value)} placeholder="phone, email, address…" />
            </div>
          </Card>

          <Card pad={24}>
            <div className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-2)" }}>Key dates</div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Drive / depart" type="date" value={drive} onChange={(e) => setDrive(e.target.value)} />
              <Field label="Fly-in" type="date" icon={PlaneTakeoff} value={flyIn} onChange={(e) => setFlyIn(e.target.value)} />
              <Field label="Fly-out" type="date" value={flyOut} onChange={(e) => setFlyOut(e.target.value)} />
            </div>
          </Card>

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
                      {t.name} <span style={{ color: "var(--text-3)" }}>— copies contacts, pack list, gear, food, beverage templates, and participants</span>
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
