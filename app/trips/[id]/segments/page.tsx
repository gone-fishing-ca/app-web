"use client";

import { use, useEffect, useState } from "react";
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { Btn, Card, EmptyState, Field, SectionTitle } from "@/components/ui";
import { api, type Segment } from "@/lib/api";
import { fmtRange } from "@/lib/format";

type Draft = { id?: string; name: string; start_date: string; end_date: string };
const EMPTY: Draft = { name: "", start_date: "", end_date: "" };

export default function SegmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [items, setItems] = useState<Segment[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Segment[]>(`/trips/${tripId}/segments`).then(setItems).catch((e) => setError(e.message ?? "Load failed"));
  }, [tripId]);

  function msg(e: unknown, fallback: string) {
    return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(null);
    const body = { name: draft.name, start_date: draft.start_date || null, end_date: draft.end_date || null };
    try {
      if (draft.id) {
        const updated = await api.patch<Segment>(`/trips/${tripId}/segments/${draft.id}`, body);
        setItems((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
      } else {
        const created = await api.post<Segment>(`/trips/${tripId}/segments`, { ...body, sort_order: items?.length ?? 0 });
        setItems((prev) => (prev ? [...prev, created] : [created]));
      }
      setDraft(null);
    } catch (e) {
      setError(msg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this week? Stays that adopted its dates keep those dates (they just become custom).")) return;
    try {
      await api.del(`/trips/${tripId}/segments/${id}`);
      setItems((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      setError(msg(e, "Delete failed"));
    }
  }

  return (
    <div className="p-7 max-w-[820px] mx-auto">
      <SectionTitle right={<Btn kind="accent" icon={Plus} onClick={() => setDraft({ ...EMPTY })}>Add week</Btn>}>
        Schedule
      </SectionTitle>

      <p className="text-[13px] -mt-1 mb-4" style={{ color: "var(--text-3)" }}>
        Define the weeks of your trip (e.g. “Week 1”, “Week 2”, “Both Weeks”). Assign them to people in Lodging to autofill their dates. Weeks can overlap.
      </p>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {items === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : items.length === 0 && !draft ? (
        <EmptyState icon={CalendarRange} title="No weeks yet"
          subtitle="Lay out your trip’s weeks once, then reuse them when assigning stays."
          action={<Btn kind="accent" icon={Plus} onClick={() => setDraft({ ...EMPTY })}>Add week</Btn>} />
      ) : (
        <Card>
          <div className="grid items-center px-5 py-3 text-[11.5px] font-bold uppercase"
            style={{ gridTemplateColumns: "1.4fr 1.6fr 100px", letterSpacing: ".05em", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            <span>Name</span><span>Dates</span><span></span>
          </div>
          {items.map((s, i) => (
            <div key={s.id} className="grid items-center px-5 py-3"
              style={{ gridTemplateColumns: "1.4fr 1.6fr 100px", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{s.name}</span>
              <span className="text-[13px]" style={{ color: "var(--text-2)" }}>{fmtRange(s.start_date, s.end_date) || "—"}</span>
              <div className="flex items-center justify-end gap-1">
                <IconBtn title="Edit" onClick={() => setDraft({ id: s.id, name: s.name, start_date: s.start_date ?? "", end_date: s.end_date ?? "" })}><Pencil size={14} /></IconBtn>
                <IconBtn title="Delete" onClick={() => remove(s.id)}><Trash2 size={14} /></IconBtn>
              </div>
            </div>
          ))}
        </Card>
      )}

      {draft && (
        <Card pad={20} className="mt-5">
          <div className="text-[13px] font-bold uppercase mb-3" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
            {draft.id ? "Edit week" : "New week"}
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
            <Field label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Week 1" />
            <Field label="Start" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            <Field label="End" type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn kind="ghost" onClick={() => setDraft(null)}>Cancel</Btn>
            <Btn kind="accent" onClick={save} disabled={busy || !draft.name.trim()}>{busy ? "Saving…" : draft.id ? "Save changes" : "Add"}</Btn>
          </div>
        </Card>
      )}
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
