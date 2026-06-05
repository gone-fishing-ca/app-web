"use client";

import { use, useEffect, useState } from "react";
import { BedDouble, Pencil, Plus, Tent, Trash2, Waves } from "lucide-react";
import { Badge, Btn, Card, EmptyState, Field, SectionTitle } from "@/components/ui";
import { api, type Cabin, type Lake } from "@/lib/api";
import { fmtRange } from "@/lib/format";

type LakeDraft = {
  id?: string;
  name: string;
  outfitter_name: string;
  outfitter_contact: string;
  fly_in_date: string;
  fly_out_date: string;
};
const EMPTY_LAKE: LakeDraft = {
  name: "", outfitter_name: "", outfitter_contact: "", fly_in_date: "", fly_out_date: "",
};

type CabinDraft = { id?: string; lake_id: string; name: string; capacity: string; notes: string };

export default function LakesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [lakes, setLakes] = useState<Lake[] | null>(null);
  const [lakeDraft, setLakeDraft] = useState<LakeDraft | null>(null);
  const [cabinDraft, setCabinDraft] = useState<CabinDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Lake[]>(`/trips/${tripId}/lakes`).then(setLakes).catch((e) => setError(e.message ?? "Load failed"));
  }, [tripId]);

  function msg(e: unknown, fallback: string) {
    return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
  }

  // ---- Lakes ----
  async function saveLake() {
    if (!lakeDraft) return;
    setBusy(true); setError(null);
    const body = {
      name: lakeDraft.name,
      outfitter_name: lakeDraft.outfitter_name || null,
      outfitter_contact: lakeDraft.outfitter_contact || null,
      fly_in_date: lakeDraft.fly_in_date || null,
      fly_out_date: lakeDraft.fly_out_date || null,
    };
    try {
      if (lakeDraft.id) {
        const updated = await api.patch<Lake>(`/trips/${tripId}/lakes/${lakeDraft.id}`, body);
        setLakes((prev) => prev?.map((l) => (l.id === updated.id ? updated : l)) ?? null);
      } else {
        const created = await api.post<Lake>(`/trips/${tripId}/lakes`, { ...body, sort_order: lakes?.length ?? 0 });
        setLakes((prev) => (prev ? [...prev, created] : [created]));
      }
      setLakeDraft(null);
    } catch (e) {
      setError(msg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeLake(id: string) {
    if (!confirm("Delete this lake and its cabins? Stays at this lake will also be removed.")) return;
    try {
      await api.del(`/trips/${tripId}/lakes/${id}`);
      setLakes((prev) => prev?.filter((l) => l.id !== id) ?? null);
    } catch (e) {
      setError(msg(e, "Delete failed"));
    }
  }

  // ---- Cabins ----
  async function saveCabin() {
    if (!cabinDraft) return;
    setBusy(true); setError(null);
    const lakeId = cabinDraft.lake_id;
    const body = {
      name: cabinDraft.name,
      capacity: cabinDraft.capacity ? Number(cabinDraft.capacity) : null,
      notes: cabinDraft.notes || null,
    };
    try {
      if (cabinDraft.id) {
        const updated = await api.patch<Cabin>(`/trips/${tripId}/lakes/${lakeId}/cabins/${cabinDraft.id}`, body);
        setLakes((prev) => prev?.map((l) => l.id === lakeId
          ? { ...l, cabins: l.cabins.map((c) => (c.id === updated.id ? updated : c)) } : l) ?? null);
      } else {
        const created = await api.post<Cabin>(`/trips/${tripId}/lakes/${lakeId}/cabins`,
          { ...body, sort_order: lakes?.find((l) => l.id === lakeId)?.cabins.length ?? 0 });
        setLakes((prev) => prev?.map((l) => l.id === lakeId
          ? { ...l, cabins: [...l.cabins, created] } : l) ?? null);
      }
      setCabinDraft(null);
    } catch (e) {
      setError(msg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeCabin(lakeId: string, cabinId: string) {
    if (!confirm("Delete this cabin?")) return;
    try {
      await api.del(`/trips/${tripId}/lakes/${lakeId}/cabins/${cabinId}`);
      setLakes((prev) => prev?.map((l) => l.id === lakeId
        ? { ...l, cabins: l.cabins.filter((c) => c.id !== cabinId) } : l) ?? null);
    } catch (e) {
      setError(msg(e, "Delete failed"));
    }
  }

  return (
    <div className="p-7 max-w-[1000px] mx-auto">
      <SectionTitle right={
        <Btn kind="accent" icon={Plus} onClick={() => { setLakeDraft({ ...EMPTY_LAKE }); setCabinDraft(null); }}>
          Add lake
        </Btn>
      }>
        Lakes &amp; cabins
      </SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {lakeDraft && !lakeDraft.id && (
        <LakeForm draft={lakeDraft} setDraft={setLakeDraft} onSave={saveLake} onCancel={() => setLakeDraft(null)} busy={busy} />
      )}

      {lakes === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : lakes.length === 0 && !lakeDraft ? (
        <EmptyState icon={Waves} title="No lakes yet"
          subtitle="Add the first stop — its outfitter, fly-in/out window, and cabins live here."
          action={<Btn kind="accent" icon={Plus} onClick={() => setLakeDraft({ ...EMPTY_LAKE })}>Add lake</Btn>} />
      ) : (
        <div className="flex flex-col gap-4">
          {lakes.map((lake) => (
            <Card key={lake.id} pad={0}>
              {lakeDraft?.id === lake.id ? (
                <div className="p-5">
                  <LakeForm draft={lakeDraft} setDraft={setLakeDraft} onSave={saveLake} onCancel={() => setLakeDraft(null)} busy={busy} inline />
                </div>
              ) : (
                <div className="px-5 py-4 flex items-start justify-between gap-3"
                  style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Waves size={17} style={{ color: "var(--accent-600)" }} />
                      <span className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>{lake.name}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                      {lake.outfitter_name && (
                        <span className="inline-flex items-center gap-1.5"><Tent size={14} /> {lake.outfitter_name}</span>
                      )}
                      {lake.outfitter_contact && <span style={{ color: "var(--text-3)" }}>{lake.outfitter_contact}</span>}
                      <span>{fmtRange(lake.fly_in_date, lake.fly_out_date) || "Dates TBD"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <IconBtn title="Edit lake" onClick={() => { setLakeDraft(toLakeDraft(lake)); setCabinDraft(null); }}><Pencil size={14} /></IconBtn>
                    <IconBtn title="Delete lake" onClick={() => removeLake(lake.id)}><Trash2 size={14} /></IconBtn>
                  </div>
                </div>
              )}

              {/* Cabins */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="text-[11.5px] font-bold uppercase inline-flex items-center gap-1.5"
                    style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
                    <BedDouble size={14} /> Cabins
                  </div>
                  <Btn kind="subtle" size="sm" icon={Plus}
                    onClick={() => { setCabinDraft({ lake_id: lake.id, name: "", capacity: "", notes: "" }); setLakeDraft(null); }}>
                    Add cabin
                  </Btn>
                </div>

                {lake.cabins.length === 0 && cabinDraft?.lake_id !== lake.id && (
                  <div className="text-[13px] py-1" style={{ color: "var(--text-3)" }}>No cabins yet.</div>
                )}

                {lake.cabins.map((c) => (
                  cabinDraft?.id === c.id ? (
                    <CabinForm key={c.id} draft={cabinDraft} setDraft={setCabinDraft} onSave={saveCabin} onCancel={() => setCabinDraft(null)} busy={busy} />
                  ) : (
                    <div key={c.id} className="flex items-center justify-between gap-3 py-2"
                      style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="min-w-0">
                        <span className="text-[14px] font-medium" style={{ color: "var(--text)" }}>{c.name}</span>
                        {c.notes && <span className="text-[12.5px] ml-2" style={{ color: "var(--text-3)" }}>{c.notes}</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-none">
                        {c.capacity != null && <Badge tone="neutral">{c.capacity} {c.capacity === 1 ? "bed" : "beds"}</Badge>}
                        <IconBtn title="Edit cabin" onClick={() => { setCabinDraft(toCabinDraft(c)); setLakeDraft(null); }}><Pencil size={13} /></IconBtn>
                        <IconBtn title="Delete cabin" onClick={() => removeCabin(lake.id, c.id)}><Trash2 size={13} /></IconBtn>
                      </div>
                    </div>
                  )
                ))}

                {cabinDraft?.lake_id === lake.id && !cabinDraft.id && (
                  <CabinForm draft={cabinDraft} setDraft={setCabinDraft} onSave={saveCabin} onCancel={() => setCabinDraft(null)} busy={busy} />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function toLakeDraft(l: Lake): LakeDraft {
  return {
    id: l.id, name: l.name, outfitter_name: l.outfitter_name ?? "", outfitter_contact: l.outfitter_contact ?? "",
    fly_in_date: l.fly_in_date ?? "", fly_out_date: l.fly_out_date ?? "",
  };
}
function toCabinDraft(c: Cabin): CabinDraft {
  return { id: c.id, lake_id: c.lake_id, name: c.name, capacity: c.capacity?.toString() ?? "", notes: c.notes ?? "" };
}

function LakeForm({ draft, setDraft, onSave, onCancel, busy, inline }: {
  draft: LakeDraft; setDraft: (d: LakeDraft) => void; onSave: () => void; onCancel: () => void; busy: boolean; inline?: boolean;
}) {
  const inner = (
    <>
      <div className="text-[13px] font-bold uppercase mb-3" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
        {draft.id ? "Edit lake" : "New lake"}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lake name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Whitefish Lake" />
        <Field label="Outfitter" value={draft.outfitter_name} onChange={(e) => setDraft({ ...draft, outfitter_name: e.target.value })} placeholder="Mattice Lake Outfitters" />
        <Field label="Fly-in" type="date" value={draft.fly_in_date} onChange={(e) => setDraft({ ...draft, fly_in_date: e.target.value })} />
        <Field label="Fly-out" type="date" value={draft.fly_out_date} onChange={(e) => setDraft({ ...draft, fly_out_date: e.target.value })} />
        <div className="col-span-2">
          <Field label="Outfitter contact" value={draft.outfitter_contact} onChange={(e) => setDraft({ ...draft, outfitter_contact: e.target.value })} placeholder="phone, email, address…" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn kind="accent" onClick={onSave} disabled={busy || !draft.name.trim()}>{busy ? "Saving…" : draft.id ? "Save changes" : "Add lake"}</Btn>
      </div>
    </>
  );
  return inline ? inner : <Card pad={20} className="mb-4">{inner}</Card>;
}

function CabinForm({ draft, setDraft, onSave, onCancel, busy }: {
  draft: CabinDraft; setDraft: (d: CabinDraft) => void; onSave: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "1.5fr 0.7fr 2fr" }}>
        <Field label="Cabin name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Cabin A" />
        <Field label="Beds" type="number" min={0} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder="4" />
        <Field label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="lakeside, propane heat…" />
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <Btn kind="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
        <Btn kind="accent" size="sm" onClick={onSave} disabled={busy || !draft.name.trim()}>{busy ? "Saving…" : draft.id ? "Save" : "Add cabin"}</Btn>
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="grid place-items-center"
      style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      {children}
    </button>
  );
}
