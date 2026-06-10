"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Compass, Copy, MapPin, PlaneTakeoff } from "lucide-react";
import { Btn, Card, Eyebrow, Field } from "@/components/ui";
import { api, type CatalogLake, type Trip } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const NEW_LAKE = "__new__";

type WeekDraft = { start: string; end: string; lakeChoice: string; lakeName: string };
const EMPTY_WEEK: WeekDraft = { start: "", end: "", lakeChoice: "", lakeName: "" };

export default function NewTripPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [split, setSplit] = useState(false);
  const [week1, setWeek1] = useState<WeekDraft>({ ...EMPTY_WEEK });
  const [week2, setWeek2] = useState<WeekDraft>({ ...EMPTY_WEEK });
  const [sameLake, setSameLake] = useState(true); // week 2 at week 1's lake (the usual)
  const [cloneFrom, setCloneFrom] = useState<string>("");
  const [existing, setExisting] = useState<Trip[]>([]);
  const [catalog, setCatalog] = useState<CatalogLake[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<Trip[]>("/trips").then(setExisting).catch(() => {});
    api.get<CatalogLake[]>("/lakes").then(setCatalog).catch(() => {});
  }, [loading, user, router]);

  if (loading || !user) return null;

  function weekBody(n: string, w: WeekDraft) {
    return {
      name: n,
      start_date: w.start || null,
      end_date: w.end || null,
      lake_id: w.lakeChoice && w.lakeChoice !== NEW_LAKE ? w.lakeChoice : null,
      lake_name: w.lakeChoice === NEW_LAKE ? (w.lakeName.trim() || null) : null,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const w2 = sameLake ? { ...week2, lakeChoice: week1.lakeChoice, lakeName: week1.lakeName } : week2;
      const weeks = cloneFrom
        ? []
        : split
          ? [weekBody("Week 1", week1), weekBody("Week 2", w2)]
          : (week1.start || week1.end || week1.lakeChoice ? [weekBody("Week 1", week1)] : []);
      const trip = await api.post<Trip>("/trips", {
        name,
        destination: destination || null,
        weeks,
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
              <Field label="Destination" icon={MapPin} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Northern Ontario" hint="A high-level label — each week picks its own lake below." />
            </div>
          </Card>

          {!cloneFrom && (
            <Card pad={24}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                    <PlaneTakeoff size={15} /> Weeks
                  </div>
                  <div className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>
                    Group members join one or more weeks; dates and lakes can change later on the Schedule page.
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-[13.5px] flex-none" style={{ color: "var(--text)" }}>
                  <input type="checkbox" checked={split} onChange={(e) => {
                    setSplit(e.target.checked);
                    // Week 2 usually starts the day week 1 flies out (the swap day).
                    if (e.target.checked && week1.end && !week2.start) setWeek2({ ...week2, start: week1.end });
                  }} />
                  Split into two weeks
                </label>
              </div>

              <div className="mt-4 flex flex-col gap-5">
                <div>
                  {split && <div className="text-[12.5px] font-bold uppercase mb-2" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>Week 1</div>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Fly-in" type="date" value={week1.start} onChange={(e) => setWeek1({ ...week1, start: e.target.value })} />
                    <Field label="Fly-out" type="date" value={week1.end} onChange={(e) => {
                      setWeek1({ ...week1, end: e.target.value });
                      if (split && (!week2.start || week2.start === week1.end)) setWeek2({ ...week2, start: e.target.value });
                    }} />
                  </div>
                  <div className="mt-3">
                    <LakePicker catalog={catalog} w={week1} onChange={setWeek1} />
                  </div>
                </div>

                {split && (
                  <div>
                    <div className="text-[12.5px] font-bold uppercase mb-2" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>Week 2</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Fly-in" type="date" value={week2.start} onChange={(e) => setWeek2({ ...week2, start: e.target.value })} hint="Usually week 1's fly-out — the swap day." />
                      <Field label="Fly-out" type="date" value={week2.end} onChange={(e) => setWeek2({ ...week2, end: e.target.value })} />
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
                        <input type="checkbox" checked={sameLake} onChange={(e) => setSameLake(e.target.checked)} />
                        Same lake as week 1
                      </label>
                      {!sameLake && <LakePicker catalog={catalog} w={week2} onChange={setWeek2} />}
                    </div>
                  </div>
                )}
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
                      {t.name} <span style={{ color: "var(--text-3)" }}>— copies lakes, cabins, weeks, contacts, pack list, gear, food, beverage templates, and the group (week assignments start fresh)</span>
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

function LakePicker({ catalog, w, onChange }: {
  catalog: CatalogLake[]; w: WeekDraft; onChange: (w: WeekDraft) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>Lake</span>
        <span className="flex items-center rounded-[11px]"
          style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
          <select
            value={w.lakeChoice}
            onChange={(e) => onChange({ ...w, lakeChoice: e.target.value })}
            className="flex-1 min-w-0 bg-transparent outline-none text-[14.5px] py-3 px-3.5"
            style={{ color: "var(--text)", appearance: "none" }}
          >
            <option value="">— Decide later —</option>
            {catalog.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.outfitter ? ` (${l.outfitter.name})` : ""}</option>
            ))}
            <option value={NEW_LAKE}>+ New lake…</option>
          </select>
        </span>
      </label>
      {w.lakeChoice === NEW_LAKE && (
        <Field label="New lake name" value={w.lakeName}
          onChange={(e) => onChange({ ...w, lakeName: e.target.value })} placeholder="Ogoki Reservoir" />
      )}
    </div>
  );
}
