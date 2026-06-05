"use client";

import { use, useEffect, useMemo, useState } from "react";
import { BedDouble, ChevronDown, ChevronRight, Pencil, Plus, Send, Trash2, Users } from "lucide-react";
import { Badge, Btn, Card, EmptyState, Field, SectionTitle } from "@/components/ui";
import { StayEditor } from "@/components/stay-editor";
import { api, type Cabin, type Invitation, type Lake, type Participant, type Segment, type Stay } from "@/lib/api";
import { fmtRange } from "@/lib/format";

type Draft = {
  id?: string;
  name: string;
  cell: string;
  email: string;
  car_group: string;
};

const EMPTY: Draft = { name: "", cell: "", email: "", car_group: "" };

const COLS = "1.4fr 0.9fr 1.5fr 0.5fr 0.7fr 196px";

type EditorState = { participantId: string; participantName: string; stay: Stay | null };

export default function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [items, setItems] = useState<Participant[] | null>(null);
  const [lakes, setLakes] = useState<Lake[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setItems).catch((e) => setError(e.message ?? "Load failed"));
    api.get<Lake[]>(`/trips/${tripId}/lakes`).then(setLakes).catch(() => {});
    api.get<Segment[]>(`/trips/${tripId}/segments`).then(setSegments).catch(() => {});
    api.get<Stay[]>(`/trips/${tripId}/stays`).then(setStays).catch(() => {});
    // Organizer-only; non-organizers 403 here — just skip the invite UI then.
    api.get<Invitation[]>(`/trips/${tripId}/invitations`).then(setInvites).catch(() => {});
  }, [tripId]);

  // Latest invitation per email (list is newest-first), for showing invite status.
  const inviteByEmail = useMemo(() => {
    const m = new Map<string, Invitation>();
    for (const inv of invites) { const k = inv.email.toLowerCase(); if (!m.has(k)) m.set(k, inv); }
    return m;
  }, [invites]);

  function pendingInviteFor(p: Participant): Invitation | undefined {
    if (!p.email) return undefined;
    const inv = inviteByEmail.get(p.email.toLowerCase());
    return inv && inv.status === "pending" && new Date(inv.expires_at).getTime() > Date.now() ? inv : undefined;
  }

  const lakeMap = useMemo(() => new Map(lakes.map((l) => [l.id, l])), [lakes]);
  const segMap = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);
  const cabinMap = useMemo(() => {
    const m = new Map<string, Cabin>();
    for (const l of lakes) for (const c of l.cabins) m.set(c.id, c);
    return m;
  }, [lakes]);
  const staysByParticipant = useMemo(() => {
    const m = new Map<string, Stay[]>();
    for (const s of stays) { const a = m.get(s.participant_id) ?? []; a.push(s); m.set(s.participant_id, a); }
    return m;
  }, [stays]);

  function startNew() { setDraft({ ...EMPTY }); }
  function startEdit(p: Participant) {
    setDraft({ id: p.id, name: p.name, cell: p.cell ?? "", email: p.email ?? "", car_group: p.car_group ?? "" });
  }
  function cancel() { setDraft(null); setError(null); }
  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(null); setNotice(null);
    const body = { name: draft.name, cell: draft.cell || null, email: draft.email || null, car_group: draft.car_group || null };
    try {
      const wasLinked = draft.id ? Boolean(items?.find((p) => p.id === draft.id)?.user_id) : false;
      let saved: Participant;
      if (draft.id) {
        saved = await api.patch<Participant>(`/trips/${tripId}/participants/${draft.id}`, body);
        setItems((prev) => prev?.map((p) => (p.id === saved.id ? saved : p)) ?? null);
      } else {
        saved = await api.post<Participant>(`/trips/${tripId}/participants`, body);
        setItems((prev) => (prev ? [...prev, saved] : [saved]));
      }
      // The API auto-links a roster row to a known account when the email belongs
      // to someone who accepted a past invite from this organizer.
      if (saved.user_id && !wasLinked) {
        setNotice(`${saved.name} was already in the app — added directly, no invite needed.`);
      }
      setDraft(null);
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this person?")) return;
    try {
      await api.del(`/trips/${tripId}/participants/${id}`);
      setItems((prev) => prev?.filter((p) => p.id !== id) ?? null);
      setStays((prev) => prev.filter((s) => s.participant_id !== id));
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Delete failed");
    }
  }

  async function invite(p: Participant) {
    if (!p.email) return;
    setInviting(p.id); setError(null); setNotice(null);
    try {
      const created = await api.post<Invitation>(`/trips/${tripId}/invitations`, { email: p.email });
      // A re-invite supersedes prior pending invites to the same address.
      setInvites((prev) => [created, ...prev.filter((i) => !(i.email.toLowerCase() === created.email.toLowerCase() && i.status === "pending"))]);
      setNotice(`Invitation sent to ${created.email}.`);
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Could not send invitation");
    } finally {
      setInviting(null);
    }
  }

  function upsertStay(s: Stay) {
    setStays((prev) => {
      const i = prev.findIndex((x) => x.id === s.id);
      if (i >= 0) { const n = [...prev]; n[i] = s; return n; }
      return [...prev, s];
    });
  }
  function dropStay(id: string) { setStays((prev) => prev.filter((s) => s.id !== id)); }

  function stayChip(s: Stay): string {
    const lake = lakeMap.get(s.lake_id);
    const seg = s.segment_id ? segMap.get(s.segment_id) : null;
    const when = seg ? seg.name : (fmtRange(s.start_date, s.end_date) || "Dates TBD");
    const cabin = s.cabin_id ? cabinMap.get(s.cabin_id)?.name : null;
    return [lake?.name ?? "Lake", when, cabin].filter(Boolean).join(" · ");
  }

  return (
    <div className="p-7 max-w-[1180px] mx-auto">
      <SectionTitle right={<Btn kind="accent" icon={Plus} onClick={startNew}>Add person</Btn>}>
        Group
      </SectionTitle>

      {notice && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--success-bg)", color: "var(--success)" }}>{notice}</div>
      )}
      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {items === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : items.length === 0 && !draft ? (
        <EmptyState icon={Users} title="No one in the group yet"
          subtitle="Add the first angler — you can stub the rest now and fill in details later."
          action={<Btn kind="accent" icon={Plus} onClick={startNew}>Add person</Btn>} />
      ) : (
        <Card pad={0}>
          {/* header row */}
          <div className="grid items-center px-5 py-3 text-[11.5px] font-bold uppercase"
            style={{ gridTemplateColumns: COLS, letterSpacing: ".05em", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            <span>Name</span><span>Cell</span><span>Email</span><span>Car</span><span>Stays</span><span></span>
          </div>

          {items.map((p, i) => {
            const myStays = staysByParticipant.get(p.id) ?? [];
            const open = expanded.has(p.id);
            const pendingInv = pendingInviteFor(p);
            return (
              <div key={p.id} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div className="grid items-center px-5 py-3" style={{ gridTemplateColumns: COLS }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] font-semibold truncate" style={{ color: "var(--text)" }}>{p.name}</span>
                    {p.user_id ? <Badge tone="accent">In the app</Badge> : pendingInv && <Badge tone="warning" dot>Invited</Badge>}
                  </div>
                  <div className="gf-mono text-[13px]" style={{ color: "var(--text-2)" }}>{p.cell || "—"}</div>
                  <div className="text-[13px] truncate" style={{ color: "var(--text-2)" }}>{p.email || "—"}</div>
                  <div>{p.car_group ? <Badge tone="neutral">{p.car_group}</Badge> : <span style={{ color: "var(--text-3)" }}>—</span>}</div>
                  <button onClick={() => toggle(p.id)} className="inline-flex items-center gap-1 text-[13px]"
                    style={{ color: myStays.length ? "var(--accent-600)" : "var(--text-3)" }}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {myStays.length || "0"}
                  </button>
                  <div className="flex items-center justify-end gap-1">
                    {!p.user_id && p.email && (
                      <Btn kind="subtle" size="sm" icon={Send} disabled={inviting === p.id} onClick={() => invite(p)}
                        title={pendingInv ? "Resend the invitation" : "Email an invitation to join"}>
                        {inviting === p.id ? "Sending…" : pendingInv ? "Resend" : "Invite"}
                      </Btn>
                    )}
                    <IconBtn title="Edit" onClick={() => startEdit(p)}><Pencil size={14} /></IconBtn>
                    <IconBtn title="Delete" onClick={() => remove(p.id)}><Trash2 size={14} /></IconBtn>
                  </div>
                </div>

                {open && (
                  <div className="px-5 pb-4 pt-1" style={{ background: "var(--surface-2)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11.5px] font-bold uppercase inline-flex items-center gap-1.5"
                        style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
                        <BedDouble size={14} /> Stays
                      </div>
                      <Btn kind="subtle" size="sm" icon={Plus}
                        disabled={lakes.length === 0}
                        onClick={() => setEditor({ participantId: p.id, participantName: p.name, stay: null })}>
                        Add stay
                      </Btn>
                    </div>
                    {lakes.length === 0 ? (
                      <div className="text-[13px]" style={{ color: "var(--text-3)" }}>Add a lake first to assign stays.</div>
                    ) : myStays.length === 0 ? (
                      <div className="text-[13px]" style={{ color: "var(--text-3)" }}>Not staying anywhere yet.</div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {myStays.map((s) => (
                          <button key={s.id} onClick={() => setEditor({ participantId: p.id, participantName: p.name, stay: s })}
                            className="flex items-center justify-between gap-3 text-left rounded-[10px] px-3 py-2 transition hover:brightness-95"
                            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                            <span className="text-[13.5px]" style={{ color: "var(--text)" }}>{stayChip(s)}</span>
                            <Pencil size={13} style={{ color: "var(--text-3)" }} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {draft && (
        <Card pad={20} className="mt-5">
          <div className="text-[13px] font-bold uppercase mb-3" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
            {draft.id ? "Edit person" : "New person"}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Marcus Townsend" />
            <Field label="Car / travel group" value={draft.car_group} onChange={(e) => setDraft({ ...draft, car_group: e.target.value })} placeholder="A" />
            <Field label="Cell" value={draft.cell} onChange={(e) => setDraft({ ...draft, cell: e.target.value })} placeholder="+1 555 555 5555" />
            <Field label="Email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="you@example.com" />
          </div>
          <div className="text-[12px] mt-3" style={{ color: "var(--text-3)" }}>
            Assign lake stays &amp; dates per person here, or all at once in <span style={{ color: "var(--text-2)" }}>Lodging</span>.
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn kind="ghost" onClick={cancel}>Cancel</Btn>
            <Btn kind="accent" onClick={save} disabled={busy || !draft.name.trim()}>{busy ? "Saving…" : draft.id ? "Save changes" : "Add"}</Btn>
          </div>
        </Card>
      )}

      {editor && (
        <StayEditor
          tripId={tripId}
          participantId={editor.participantId}
          participantName={editor.participantName}
          lakes={lakes}
          segments={segments}
          stay={editor.stay}
          takenLakeIds={(staysByParticipant.get(editor.participantId) ?? []).map((s) => s.lake_id)}
          onSaved={upsertStay}
          onDeleted={dropStay}
          onClose={() => setEditor(null)}
        />
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
