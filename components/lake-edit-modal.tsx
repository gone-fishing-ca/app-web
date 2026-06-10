"use client";

import { useEffect, useState } from "react";
import { BedDouble, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Btn, ComboBox, Field, ModalShell } from "@/components/ui";
import {
  api, type Cabin, type CatalogLake, type Outfitter, type Segment, type TripLake,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message?: string }).message) : fallback;
}

// How the outfitter is chosen: an existing one, a brand-new one (name only —
// details live on the Contacts page), or none.
type OutfitterChoice =
  | { kind: "existing"; id: string }
  | { kind: "new"; name: string }
  | { kind: "none" };

type CabinDraft = { id?: string; name: string; capacity: string; notes: string };

/** Edit the lake a week is held at — opened from the Overview week cards.
 *  If the week has no lake yet, starts with a pick-or-create step that links
 *  the lake to the trip and assigns it to the week. */
export function LakeEditModal({
  tripId, segment, onClose, onChanged,
}: {
  tripId: string;
  segment: Segment;
  onClose: () => void;
  onChanged: () => void;  // fired after any successful mutation — caller refetches
}) {
  const { user } = useAuth();
  const [lakeId, setLakeId] = useState<string | null>(segment.lake_id);
  const [tripLakes, setTripLakes] = useState<TripLake[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogLake[]>([]);
  const [outfitters, setOutfitters] = useState<Outfitter[]>([]);
  const [name, setName] = useState("");
  const [outfitter, setOutfitter] = useState<OutfitterChoice>({ kind: "none" });
  const [cabinDraft, setCabinDraft] = useState<CabinDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lake = lakeId ? tripLakes?.find((l) => l.id === lakeId) ?? null : null;
  const owned = !!lake && !!user && lake.owner_id === user.id;

  async function reload() {
    const [tl, cat, outs] = await Promise.all([
      api.get<TripLake[]>(`/trips/${tripId}/lakes`),
      api.get<CatalogLake[]>(`/lakes`),
      api.get<Outfitter[]>(`/outfitters`),
    ]);
    setTripLakes(tl); setCatalog(cat); setOutfitters(outs);
    return tl;
  }

  useEffect(() => {
    reload().catch((e) => setError(msg(e, "Load failed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Seed the form once the lake's current facts arrive.
  useEffect(() => {
    if (!lake) return;
    setName(lake.name);
    setOutfitter(lake.outfitter ? { kind: "existing", id: lake.outfitter.id } : { kind: "none" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lake?.id, tripLakes === null]);

  // ---- TBD step: link an existing or brand-new lake to the trip + week ----
  async function assignLake(catalogLakeId: string | null, newName?: string) {
    setBusy(true); setError(null);
    try {
      let id = catalogLakeId;
      if (!id) {
        const created = await api.post<CatalogLake>(`/lakes`, { name: newName });
        id = created.id;
      }
      const linked = (tripLakes ?? []).some((l) => l.id === id);
      if (!linked) {
        await api.post<TripLake>(`/trips/${tripId}/lakes`, {
          lake_id: id, sort_order: tripLakes?.length ?? 0,
        });
      }
      await api.patch<Segment>(`/trips/${tripId}/segments/${segment.id}`, { lake_id: id });
      await reload();
      setLakeId(id);
      onChanged();
    } catch (e) {
      setError(msg(e, "Couldn’t set the lake"));
    } finally {
      setBusy(false);
    }
  }

  // ---- Edit step: name + outfitter (deferred until Save) ----
  async function save() {
    if (!lake || !name.trim()) return;
    setBusy(true); setError(null);
    try {
      let outfitterId: string | null = null;
      if (outfitter.kind === "existing") outfitterId = outfitter.id;
      if (outfitter.kind === "new") {
        const created = await api.post<Outfitter>(`/outfitters`, { name: outfitter.name.trim() });
        outfitterId = created.id;
      }
      await api.patch<CatalogLake>(`/lakes/${lake.id}`, {
        name: name.trim(), outfitter_id: outfitterId,
      });
      onChanged();
      onClose();
    } catch (e) {
      setError(msg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  // ---- Cabins (saved immediately, like the rest of the catalog) ----
  async function saveCabin() {
    if (!lake || !cabinDraft) return;
    setBusy(true); setError(null);
    const body = {
      name: cabinDraft.name,
      capacity: cabinDraft.capacity ? Number(cabinDraft.capacity) : null,
      notes: cabinDraft.notes || null,
    };
    try {
      if (cabinDraft.id) {
        await api.patch<Cabin>(`/lakes/${lake.id}/cabins/${cabinDraft.id}`, body);
      } else {
        await api.post<Cabin>(`/lakes/${lake.id}/cabins`, { ...body, sort_order: lake.cabins.length });
      }
      await reload();
      setCabinDraft(null);
      onChanged();
    } catch (e) {
      setError(msg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeCabin(cabinId: string) {
    if (!lake) return;
    if (!confirm("Delete this cabin? It's removed from every trip that uses this lake.")) return;
    try {
      await api.del(`/lakes/${lake.id}/cabins/${cabinId}`);
      await reload();
      onChanged();
    } catch (e) {
      setError(msg(e, "Delete failed"));
    }
  }

  const loading = tripLakes === null;
  const picking = !loading && !lake;

  // Picker options: your catalog plus any shared lakes already on the trip.
  const pickerOptions = (() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string; hint?: string }[] = [];
    for (const l of [...catalog, ...(tripLakes ?? [])]) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      opts.push({ value: l.id, label: l.name, hint: l.outfitter?.name });
    }
    return opts;
  })();

  // "New outfitter…" is a standing option — picking it reveals a name field.
  const outfitterOptions = [
    { value: "__new__", label: "New outfitter…" },
    ...outfitters.map((o) => ({ value: o.id, label: o.name, hint: o.contact_person ?? undefined })),
  ];

  return (
    <ModalShell
      title={picking ? `Lake for ${segment.name}` : "Edit lake"}
      subtitle={picking ? undefined : lake?.name}
      onClose={onClose}
      footer={
        picking || loading || !owned ? (
          <Btn kind="ghost" onClick={onClose}>Close</Btn>
        ) : (
          <>
            <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
            <Btn kind="accent" onClick={save}
              disabled={busy || !name.trim() || (outfitter.kind === "new" && !outfitter.name.trim())}>
              {busy ? "Saving…" : "Save"}
            </Btn>
          </>
        )
      }
    >
      {error && (
        <div className="mb-3 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : picking ? (
        <div className="flex flex-col gap-3">
          <ComboBox
            label="Lake"
            value={null}
            options={pickerOptions}
            placeholder="Choose a lake from your catalog…"
            onSelect={(v) => assignLake(v)}
            onCreate={(q) => assignLake(null, q)}
            createLabel={(q) => `Create new lake “${q}”`}
            disabled={busy}
          />
          <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
            New lakes are added to your catalog and can be reused on future trips.
          </div>
        </div>
      ) : !owned ? (
        <div className="flex flex-col gap-3">
          <div className="text-[12.5px] rounded-[10px] px-3 py-2.5"
            style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
            This lake is shared from another trip — its name, outfitter, and cabins are read-only here.
          </div>
          {lake!.outfitter && (
            <div className="text-[13.5px]" style={{ color: "var(--text-2)" }}>
              Outfitter: {lake!.outfitter.name}
            </div>
          )}
          <CabinList lake={lake!} owned={false} cabinDraft={null}
            setCabinDraft={() => {}} onSave={() => {}} onRemove={() => {}} busy={false} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Lake name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Whitefish Lake" />
          <div className="flex flex-col gap-3">
            <ComboBox
              label="Outfitter"
              value={outfitter.kind === "existing" ? outfitter.id : outfitter.kind === "new" ? "__new__" : null}
              options={outfitterOptions}
              placeholder="Choose an outfitter…"
              onSelect={(v) => setOutfitter(v === "__new__"
                ? { kind: "new", name: outfitter.kind === "new" ? outfitter.name : "" }
                : { kind: "existing", id: v })}
              onCreate={(q) => setOutfitter({ kind: "new", name: q })}
              createLabel={(q) => `Create new outfitter “${q}”`}
            />
            {outfitter.kind === "new" && (
              <Field
                label="New outfitter name"
                autoFocus
                value={outfitter.name}
                onChange={(e) => setOutfitter({ kind: "new", name: e.target.value })}
                placeholder="Mattice Lake Outfitters"
              />
            )}
            <div className="text-[12px] -mt-1" style={{ color: "var(--text-3)" }}>
              Phone, email, and other outfitter details live on the Contacts page.
            </div>
          </div>

          <CabinList lake={lake!} owned cabinDraft={cabinDraft} setCabinDraft={setCabinDraft}
            onSave={saveCabin} onRemove={removeCabin} busy={busy} />
        </div>
      )}
    </ModalShell>
  );
}

function CabinList({
  lake, owned, cabinDraft, setCabinDraft, onSave, onRemove, busy,
}: {
  lake: TripLake;
  owned: boolean;
  cabinDraft: CabinDraft | null;
  setCabinDraft: (d: CabinDraft | null) => void;
  onSave: () => void;
  onRemove: (cabinId: string) => void;
  busy: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11.5px] font-bold uppercase inline-flex items-center gap-1.5"
          style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
          <BedDouble size={14} /> Cabins
        </div>
        {owned && !cabinDraft && (
          <Btn kind="subtle" size="sm" icon={Plus}
            onClick={() => setCabinDraft({ name: "", capacity: "", notes: "" })}>
            Add cabin
          </Btn>
        )}
      </div>

      {lake.cabins.length === 0 && !cabinDraft && (
        <div className="text-[13px] py-1" style={{ color: "var(--text-3)" }}>No cabins yet.</div>
      )}

      {lake.cabins.map((c) => (
        cabinDraft?.id === c.id ? (
          <CabinForm key={c.id} draft={cabinDraft} setDraft={setCabinDraft}
            onSave={onSave} onCancel={() => setCabinDraft(null)} busy={busy} />
        ) : (
          <div key={c.id} className="flex items-center justify-between gap-3 py-2"
            style={{ borderTop: "1px solid var(--border)" }}>
            <div className="min-w-0">
              <span className="text-[14px] font-medium" style={{ color: "var(--text)" }}>{c.name}</span>
              {c.notes && <span className="text-[12.5px] ml-2" style={{ color: "var(--text-3)" }}>{c.notes}</span>}
            </div>
            <div className="flex items-center gap-1 flex-none">
              {c.capacity != null && <Badge tone="neutral">{c.capacity} {c.capacity === 1 ? "bed" : "beds"}</Badge>}
              {owned && (
                <IconBtn title="Edit cabin" onClick={() => setCabinDraft({
                  id: c.id, name: c.name, capacity: c.capacity?.toString() ?? "", notes: c.notes ?? "",
                })}><Pencil size={13} /></IconBtn>
              )}
              {owned && <IconBtn title="Delete cabin" onClick={() => onRemove(c.id)}><Trash2 size={13} /></IconBtn>}
            </div>
          </div>
        )
      ))}

      {cabinDraft && !cabinDraft.id && (
        <CabinForm draft={cabinDraft} setDraft={setCabinDraft}
          onSave={onSave} onCancel={() => setCabinDraft(null)} busy={busy} />
      )}
    </div>
  );
}

function CabinForm({ draft, setDraft, onSave, onCancel, busy }: {
  draft: CabinDraft; setDraft: (d: CabinDraft) => void; onSave: () => void; onCancel: () => void; busy: boolean;
}) {
  return (
    <div className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="grid gap-3 grid-cols-[1.5fr_0.7fr]">
        <Field label="Cabin name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Cabin A" />
        <Field label="Beds" type="number" min={0} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} placeholder="4" />
        <div className="col-span-2">
          <Field label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="lakeside, propane heat…" />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <Btn kind="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
        <Btn kind="accent" size="sm" onClick={onSave} disabled={busy || !draft.name.trim()}>
          {busy ? "Saving…" : draft.id ? "Save" : "Add cabin"}
        </Btn>
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
