"use client";

import { use, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Badge, Btn, Card, EmptyState, Field, SectionTitle } from "@/components/ui";
import { api, type Participant } from "@/lib/api";
import { fmtRange } from "@/lib/format";

type Draft = {
  id?: string;
  name: string;
  cell: string;
  email: string;
  start_date: string;
  end_date: string;
  car_group: string;
};

const EMPTY: Draft = { name: "", cell: "", email: "", start_date: "", end_date: "", car_group: "" };

export default function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [items, setItems] = useState<Participant[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setItems).catch((e) => setError(e.message ?? "Load failed"));
  }, [tripId]);

  function startNew() { setDraft({ ...EMPTY }); }
  function startEdit(p: Participant) {
    setDraft({
      id: p.id, name: p.name, cell: p.cell ?? "", email: p.email ?? "",
      start_date: p.start_date ?? "", end_date: p.end_date ?? "", car_group: p.car_group ?? "",
    });
  }
  function cancel() { setDraft(null); setError(null); }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(null);
    const body = {
      name: draft.name,
      cell: draft.cell || null,
      email: draft.email || null,
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
      car_group: draft.car_group || null,
    };
    try {
      if (draft.id) {
        const updated = await api.patch<Participant>(`/trips/${tripId}/participants/${draft.id}`, body);
        setItems((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? null);
      } else {
        const created = await api.post<Participant>(`/trips/${tripId}/participants`, body);
        setItems((prev) => (prev ? [...prev, created] : [created]));
      }
      setDraft(null);
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this participant?")) return;
    try {
      await api.del(`/trips/${tripId}/participants/${id}`);
      setItems((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (e) {
      const m = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Delete failed";
      setError(m);
    }
  }

  return (
    <div className="p-7 max-w-[1180px] mx-auto">
      <SectionTitle right={<Btn kind="accent" icon={Plus} onClick={startNew}>Add participant</Btn>}>
        Participants
      </SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {items === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : items.length === 0 && !draft ? (
        <EmptyState icon={Users} title="No participants yet"
          subtitle="Add the first angler — you can stub the rest now and fill in details later."
          action={<Btn kind="accent" icon={Plus} onClick={startNew}>Add participant</Btn>} />
      ) : (
        <Card>
          {/* header row */}
          <div className="grid items-center px-5 py-3 text-[11.5px] font-bold uppercase"
            style={{
              gridTemplateColumns: "1.4fr 1fr 1.6fr 1.6fr 0.8fr 100px",
              letterSpacing: ".05em",
              color: "var(--text-3)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span>Name</span><span>Cell</span><span>Email</span><span>Dates</span><span>Car</span><span></span>
          </div>

          {items.map((p, i) => (
            <div key={p.id} className="grid items-center px-5 py-3"
              style={{
                gridTemplateColumns: "1.4fr 1fr 1.6fr 1.6fr 0.8fr 100px",
                borderTop: i ? "1px solid var(--border)" : "none",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[14px] font-semibold truncate" style={{ color: "var(--text)" }}>{p.name}</span>
                {p.user_id && <Badge tone="accent">In the app</Badge>}
              </div>
              <div className="gf-mono text-[13px]" style={{ color: "var(--text-2)" }}>{p.cell || "—"}</div>
              <div className="text-[13px] truncate" style={{ color: "var(--text-2)" }}>{p.email || "—"}</div>
              <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
                {p.start_date || p.end_date ? fmtRange(p.start_date, p.end_date) : "—"}
              </div>
              <div>{p.car_group ? <Badge tone="neutral">{p.car_group}</Badge> : <span style={{ color: "var(--text-3)" }}>—</span>}</div>
              <div className="flex items-center justify-end gap-1">
                <button onClick={() => startEdit(p)}
                  className="grid place-items-center" title="Edit"
                  style={{
                    width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)",
                    border: "1px solid var(--border)", color: "var(--text-2)",
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button onClick={() => remove(p.id)}
                  className="grid place-items-center" title="Delete"
                  style={{
                    width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)",
                    border: "1px solid var(--border)", color: "var(--text-2)",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {draft && (
        <Card pad={20} className="mt-5">
          <div className="text-[13px] font-bold uppercase mb-3" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
            {draft.id ? "Edit participant" : "New participant"}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Marcus Townsend" />
            <Field label="Car / travel group" value={draft.car_group} onChange={(e) => setDraft({ ...draft, car_group: e.target.value })} placeholder="A" />
            <Field label="Cell" value={draft.cell} onChange={(e) => setDraft({ ...draft, cell: e.target.value })} placeholder="+1 555 555 5555" />
            <Field label="Email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="you@example.com" />
            <Field label="Trip start" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            <Field label="Trip end" type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn kind="ghost" onClick={cancel}>Cancel</Btn>
            <Btn kind="accent" onClick={save} disabled={busy || !draft.name.trim()}>
              {busy ? "Saving…" : draft.id ? "Save changes" : "Add"}
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
