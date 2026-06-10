"use client";

import { use, useEffect, useState } from "react";
import { BedDouble, Link2Off, Pencil, Plus, Tent, Trash2, Waves } from "lucide-react";
import {
  Badge, Btn, Card, ComboBox, EmptyState, Field, SectionTitle,
} from "@/components/ui";
import {
  api, type Cabin, type CatalogLake, type Outfitter, type TripLake,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtRange } from "@/lib/format";

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message?: string }).message) : fallback;
}

// ---- Outfitter draft (the "create new outfitter" sub-form) -----------------
type OutfitterDraft = {
  name: string; contact_person: string; phone: string; email: string; website: string; address: string;
};
const EMPTY_OUTFITTER: OutfitterDraft = {
  name: "", contact_person: "", phone: "", email: "", website: "", address: "",
};
// How the outfitter is chosen for a lake: an existing one, a brand-new one, or none.
type OutfitterChoice =
  | { kind: "existing"; id: string }
  | { kind: "new"; draft: OutfitterDraft }
  | { kind: "none" };

export default function LakesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const { user } = useAuth();
  const [lakes, setLakes] = useState<TripLake[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogLake[]>([]);
  const [outfitters, setOutfitters] = useState<Outfitter[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);  // trip_lake_id being edited
  const [cabinDraft, setCabinDraft] = useState<CabinDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [tl, cat, outs] = await Promise.all([
      api.get<TripLake[]>(`/trips/${tripId}/lakes`),
      api.get<CatalogLake[]>(`/lakes`),
      api.get<Outfitter[]>(`/outfitters`),
    ]);
    setLakes(tl); setCatalog(cat); setOutfitters(outs);
  }

  useEffect(() => {
    reload().catch((e) => setError(msg(e, "Load failed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Resolve an OutfitterChoice to an outfitter_id, creating the outfitter first if new.
  async function resolveOutfitter(choice: OutfitterChoice): Promise<string | null> {
    if (choice.kind === "existing") return choice.id;
    if (choice.kind === "new") {
      const created = await api.post<Outfitter>(`/outfitters`, {
        name: choice.draft.name,
        contact_person: choice.draft.contact_person || null,
        phone: choice.draft.phone || null,
        email: choice.draft.email || null,
        website: choice.draft.website || null,
        address: choice.draft.address || null,
      });
      setOutfitters((prev) => [...prev, created]);
      return created.id;
    }
    return null;
  }

  // ---- Add a lake to the trip (existing or brand-new) ----
  async function addLake(form: LakeFormValue) {
    setBusy(true); setError(null);
    try {
      let lakeId = form.existingLakeId;
      if (!lakeId) {
        const outfitterId = await resolveOutfitter(form.outfitter);
        const created = await api.post<CatalogLake>(`/lakes`, {
          name: form.name, outfitter_id: outfitterId,
        });
        lakeId = created.id;
      }
      await api.post<TripLake>(`/trips/${tripId}/lakes`, {
        lake_id: lakeId,
        fly_in_date: form.fly_in_date || null,
        fly_out_date: form.fly_out_date || null,
        sort_order: lakes?.length ?? 0,
      });
      await reload();
      setAdding(false);
    } catch (e) {
      setError(msg(e, "Couldn’t add the lake"));
    } finally {
      setBusy(false);
    }
  }

  // ---- Edit a trip lake: name + outfitter (catalog) and fly window (trip) ----
  async function saveLakeEdits(tl: TripLake, form: LakeFormValue) {
    setBusy(true); setError(null);
    try {
      if (user && tl.owner_id === user.id) {
        const outfitterId = await resolveOutfitter(form.outfitter);
        await api.patch<CatalogLake>(`/lakes/${tl.id}`, {
          name: form.name, outfitter_id: outfitterId,
        });
      }
      await api.patch<TripLake>(`/trips/${tripId}/lakes/${tl.trip_lake_id}`, {
        fly_in_date: form.fly_in_date || null,
        fly_out_date: form.fly_out_date || null,
      });
      await reload();
      setEditingId(null);
    } catch (e) {
      setError(msg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function unlinkLake(tl: TripLake) {
    if (!confirm(`Remove ${tl.name} from this trip? The lake itself stays in your catalog; stays at it on this trip are cleared.`)) return;
    try {
      await api.del(`/trips/${tripId}/lakes/${tl.trip_lake_id}`);
      setLakes((prev) => prev?.filter((l) => l.trip_lake_id !== tl.trip_lake_id) ?? null);
    } catch (e) {
      setError(msg(e, "Couldn’t remove the lake"));
    }
  }

  // ---- Cabins (catalog, keyed by the lake id) ----
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
        await api.patch<Cabin>(`/lakes/${lakeId}/cabins/${cabinDraft.id}`, body);
      } else {
        const count = lakes?.find((l) => l.id === lakeId)?.cabins.length ?? 0;
        await api.post<Cabin>(`/lakes/${lakeId}/cabins`, { ...body, sort_order: count });
      }
      await reload();
      setCabinDraft(null);
    } catch (e) {
      setError(msg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeCabin(lakeId: string, cabinId: string) {
    if (!confirm("Delete this cabin? It's removed from every trip that uses this lake.")) return;
    try {
      await api.del(`/lakes/${lakeId}/cabins/${cabinId}`);
      await reload();
    } catch (e) {
      setError(msg(e, "Delete failed"));
    }
  }

  const linkedIds = new Set(lakes?.map((l) => l.id) ?? []);
  const available = catalog.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="p-4 sm:p-7 max-w-[1240px] mx-auto">
      <SectionTitle right={
        !adding && (
          <Btn kind="accent" icon={Plus} onClick={() => { setAdding(true); setEditingId(null); }}>
            Add lake
          </Btn>
        )
      }>
        Lakes &amp; cabins
      </SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {adding && (
        <LakeForm
          title="Add a lake"
          available={available}
          outfitters={outfitters}
          busy={busy}
          onSubmit={addLake}
          onCancel={() => setAdding(false)}
        />
      )}

      {lakes === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : lakes.length === 0 && !adding ? (
        <EmptyState icon={Waves} title="No lakes on this trip yet"
          subtitle="Pick a lake from your catalog or add a new one — its outfitter and cabins come along, and you set the fly-in/out window per trip."
          action={<Btn kind="accent" icon={Plus} onClick={() => setAdding(true)}>Add lake</Btn>} />
      ) : (
        <div className="flex flex-col gap-4">
          {lakes.map((lake) => {
            const owned = !!user && lake.owner_id === user.id;
            return (
              <Card key={lake.trip_lake_id} pad={0}>
                {editingId === lake.trip_lake_id ? (
                  <div className="p-5">
                    <LakeForm
                      title="Edit lake"
                      tripLake={lake}
                      owned={owned}
                      outfitters={outfitters}
                      busy={busy}
                      onSubmit={(form) => saveLakeEdits(lake, form)}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : (
                  <div className="px-5 py-4 flex items-start justify-between gap-3"
                    style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Waves size={17} style={{ color: "var(--accent-600)" }} />
                        <span className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>{lake.name}</span>
                        {!owned && <Badge tone="neutral">shared</Badge>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]" style={{ color: "var(--text-2)" }}>
                        {lake.outfitter && (
                          <span className="inline-flex items-center gap-1.5"><Tent size={14} /> {lake.outfitter.name}</span>
                        )}
                        {lake.outfitter && outfitterContact(lake.outfitter) && (
                          <span style={{ color: "var(--text-3)" }}>{outfitterContact(lake.outfitter)}</span>
                        )}
                        <span>{fmtRange(lake.fly_in_date, lake.fly_out_date) || "Dates TBD"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-none">
                      <IconBtn title="Edit lake & fly window" onClick={() => { setEditingId(lake.trip_lake_id); setAdding(false); setCabinDraft(null); }}><Pencil size={14} /></IconBtn>
                      <IconBtn title="Remove from trip" onClick={() => unlinkLake(lake)}><Link2Off size={14} /></IconBtn>
                    </div>
                  </div>
                )}

                {/* Cabins */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="text-[11.5px] font-bold uppercase inline-flex items-center gap-1.5"
                      style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
                      <BedDouble size={14} /> Cabins {!owned && <span className="normal-case font-medium" style={{ letterSpacing: 0 }}>· shared, view only</span>}
                    </div>
                    {owned && (
                      <Btn kind="subtle" size="sm" icon={Plus}
                        onClick={() => { setCabinDraft({ lake_id: lake.id, name: "", capacity: "", notes: "" }); setEditingId(null); }}>
                        Add cabin
                      </Btn>
                    )}
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
                          {owned && <IconBtn title="Edit cabin" onClick={() => { setCabinDraft(toCabinDraft(c)); setEditingId(null); }}><Pencil size={13} /></IconBtn>}
                          {owned && <IconBtn title="Delete cabin" onClick={() => removeCabin(lake.id, c.id)}><Trash2 size={13} /></IconBtn>}
                        </div>
                      </div>
                    )
                  ))}

                  {cabinDraft?.lake_id === lake.id && !cabinDraft.id && (
                    <CabinForm draft={cabinDraft} setDraft={setCabinDraft} onSave={saveCabin} onCancel={() => setCabinDraft(null)} busy={busy} />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function outfitterContact(o: Outfitter): string {
  return [o.contact_person, o.phone, o.email].filter(Boolean).join(" · ");
}

// ===== Lake add/edit form ===================================================
type LakeFormValue = {
  existingLakeId: string | null;   // set when linking an existing catalog lake
  name: string;
  outfitter: OutfitterChoice;
  fly_in_date: string;
  fly_out_date: string;
};

function LakeForm({
  title, available, tripLake, owned = true, outfitters, busy, onSubmit, onCancel,
}: {
  title: string;
  available?: CatalogLake[];                 // add-mode: catalog lakes not yet on the trip
  tripLake?: TripLake;                       // edit-mode
  owned?: boolean;
  outfitters: Outfitter[];
  busy: boolean;
  onSubmit: (form: LakeFormValue) => void;
  onCancel: () => void;
}) {
  const editing = !!tripLake;
  // In add-mode, start by picking from the catalog ("create new" branches off the combo).
  const [mode, setMode] = useState<"pick" | "create">(editing ? "create" : "pick");
  const [existingLakeId, setExistingLakeId] = useState<string | null>(null);
  const [name, setName] = useState(tripLake?.name ?? "");
  const [outfitter, setOutfitter] = useState<OutfitterChoice>(
    tripLake?.outfitter ? { kind: "existing", id: tripLake.outfitter.id } : { kind: "none" },
  );
  const [flyIn, setFlyIn] = useState(tripLake?.fly_in_date ?? "");
  const [flyOut, setFlyOut] = useState(tripLake?.fly_out_date ?? "");

  const lakeOptions = (available ?? []).map((l) => ({
    value: l.id, label: l.name, hint: l.outfitter?.name,
  }));

  function submit() {
    onSubmit({
      existingLakeId: !editing && mode === "pick" ? existingLakeId : null,
      name, outfitter, fly_in_date: flyIn, fly_out_date: flyOut,
    });
  }

  const pickingExisting = !editing && mode === "pick";
  const canSubmit = pickingExisting ? !!existingLakeId : name.trim().length > 0;

  const inner = (
    <>
      <div className="text-[13px] font-bold uppercase mb-3" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
        {title}
      </div>

      {!editing && (
        <div className="mb-3">
          <ComboBox
            label="Lake"
            value={existingLakeId}
            options={lakeOptions}
            placeholder="Choose a lake from your catalog…"
            onSelect={(v) => { setExistingLakeId(v); setMode("pick"); }}
            onCreate={(q) => { setMode("create"); setExistingLakeId(null); setName(q); }}
            createLabel={(q) => `Create new lake “${q}”`}
          />
          {mode === "create" && (
            <div className="text-[12px] mt-1.5" style={{ color: "var(--text-3)" }}>
              New lake — it’s added to your catalog and can be reused on future trips.
            </div>
          )}
        </div>
      )}

      {/* New-lake / edit-lake details (name + outfitter). Hidden while picking existing. */}
      {!pickingExisting && (
        <div className="flex flex-col gap-3">
          {!owned ? (
            <div className="text-[12.5px] rounded-[10px] px-3 py-2.5"
              style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
              This lake is shared from another trip — its name, outfitter, and cabins are read-only here. You can still set the fly-in/out window below.
            </div>
          ) : (
            <>
              <Field label="Lake name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Whitefish Lake" />
              <OutfitterPicker outfitters={outfitters} choice={outfitter} setChoice={setOutfitter} />
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fly-in" type="date" value={flyIn} onChange={(e) => setFlyIn(e.target.value)} />
            <Field label="Fly-out" type="date" value={flyOut} onChange={(e) => setFlyOut(e.target.value)} />
          </div>
        </div>
      )}

      {/* When picking an existing lake, still let them set this trip's fly window. */}
      {pickingExisting && existingLakeId && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Fly-in" type="date" value={flyIn} onChange={(e) => setFlyIn(e.target.value)} />
          <Field label="Fly-out" type="date" value={flyOut} onChange={(e) => setFlyOut(e.target.value)} />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Btn kind="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn kind="accent" onClick={submit} disabled={busy || !canSubmit}>
          {busy ? "Saving…" : editing ? "Save changes" : pickingExisting ? "Add to trip" : "Create & add"}
        </Btn>
      </div>
    </>
  );

  return editing ? inner : <Card pad={20} className="mb-4">{inner}</Card>;
}

// ===== Outfitter picker (existing, or reveal a create form) =================
function OutfitterPicker({
  outfitters, choice, setChoice,
}: {
  outfitters: Outfitter[];
  choice: OutfitterChoice;
  setChoice: (c: OutfitterChoice) => void;
}) {
  if (choice.kind === "new") {
    const d = choice.draft;
    const set = (patch: Partial<OutfitterDraft>) => setChoice({ kind: "new", draft: { ...d, ...patch } });
    return (
      <div className="rounded-[11px] p-3.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>New outfitter</span>
          <button type="button" className="text-[12.5px] font-semibold" style={{ color: "var(--accent-600)" }}
            onClick={() => setChoice({ kind: "none" })}>
            Choose existing instead
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mattice Lake Outfitters" />
          <Field label="Run by" value={d.contact_person} onChange={(e) => set({ contact_person: e.target.value })} placeholder="Don & Anette Elliott" />
          <Field label="Phone" value={d.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="807-583-2483" />
          <Field label="Email" value={d.email} onChange={(e) => set({ email: e.target.value })} placeholder="mattice@walleye.ca" />
          <Field label="Website" value={d.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://www.walleye.ca/" />
          <Field label="Address" value={d.address} onChange={(e) => set({ address: e.target.value })} placeholder="Armstrong Station, Ontario" />
        </div>
      </div>
    );
  }
  return (
    <ComboBox
      label="Outfitter"
      value={choice.kind === "existing" ? choice.id : null}
      options={outfitters.map((o) => ({ value: o.id, label: o.name, hint: o.contact_person ?? undefined }))}
      placeholder="Choose an outfitter…"
      onSelect={(v) => setChoice({ kind: "existing", id: v })}
      onCreate={(q) => setChoice({ kind: "new", draft: { ...EMPTY_OUTFITTER, name: q } })}
      createLabel={(q) => `Create new outfitter “${q}”`}
    />
  );
}

// ===== Cabins ===============================================================
type CabinDraft = { id?: string; lake_id: string; name: string; capacity: string; notes: string };
function toCabinDraft(c: Cabin): CabinDraft {
  return { id: c.id, lake_id: c.lake_id, name: c.name, capacity: c.capacity?.toString() ?? "", notes: c.notes ?? "" };
}

function CabinForm({ draft, setDraft, onSave, onCancel, busy }: {
  draft: CabinDraft; setDraft: (d: CabinDraft) => void; onSave: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="grid gap-3 grid-cols-[1.5fr_0.7fr] sm:[grid-template-columns:1.5fr_0.7fr_2fr]">
        <Field label="Cabin name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Cabin A" />
        <Field label="Beds" type="number" min={0} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder="4" />
        <div className="col-span-2 sm:col-span-1">
          <Field label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="lakeside, propane heat…" />
        </div>
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
