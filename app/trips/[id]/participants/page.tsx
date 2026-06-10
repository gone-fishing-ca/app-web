"use client";

import { use, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Send, Trash2, UserPlus, Users } from "lucide-react";
import { Avatar, Badge, Btn, Card, EmptyState, Field, ModalShell, SectionTitle, initialsOf } from "@/components/ui";
import { StayEditor } from "@/components/stay-editor";
import { api, type Cabin, type Contact, type Invitation, type TripLake, type Participant, type Segment, type Stay } from "@/lib/api";
import { effectiveDates } from "@/lib/calendar";
import { deriveSpan, fmtDate, fmtRange } from "@/lib/format";

type Draft = {
  id?: string;
  name: string;
  cell: string;
  home: string;
  email: string;
  segs: string[]; // week (segment) ids this person attends
};

const EMPTY: Omit<Draft, "segs"> = { name: "", cell: "", home: "", email: "" };

// Desktop table columns; below lg the rows wrap into stacked card-style rows.
const COLS = "lg:[grid-template-columns:1.4fr_0.9fr_1.4fr_1.8fr_196px]";

type EditorState = { participantId: string; participantName: string; stay: Stay | null };

export default function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [items, setItems] = useState<Participant[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lakes, setLakes] = useState<TripLake[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setItems).catch((e) => setError(e.message ?? "Load failed"));
    api.get<Contact[]>(`/contacts`).then(setContacts).catch(() => {});
    api.get<TripLake[]>(`/trips/${tripId}/lakes`).then(setLakes).catch(() => {});
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

  // Address-book people not already on this trip, split for the picker:
  // people rostered on other trips up front (the common "same crew next year"
  // case), everyone else (relatives, standalone contacts) tucked behind a toggle.
  const pickable = useMemo(() => {
    const onTrip = new Set((items ?? []).map((p) => p.contact_id).filter(Boolean));
    return contacts.filter((c) => !onTrip.has(c.id));
  }, [contacts, items]);
  const pastTrippers = useMemo(() => pickable.filter((c) => c.trip_names.length > 0), [pickable]);
  const otherContacts = useMemo(() => pickable.filter((c) => c.trip_names.length === 0), [pickable]);

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

  // New people default to every week — the most common case; unchecking is easy.
  function startNew() { setPicking(false); setDraft({ ...EMPTY, segs: segments.map((g) => g.id) }); }
  function startEdit(p: Participant) {
    setDraft({
      id: p.id, name: p.name, cell: p.cell ?? "", home: p.home_phone ?? "", email: p.email ?? "",
      segs: (staysByParticipant.get(p.id) ?? []).map((s) => s.segment_id),
    });
  }
  function cancel() { setDraft(null); setError(null); }
  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  /** Sync the person's week checkboxes to the API (diffed server-side) and fold
   *  the resulting stays back into local state. */
  async function syncSegments(participantId: string, segIds: string[]) {
    const current = (staysByParticipant.get(participantId) ?? []);
    const same =
      current.length === segIds.length && current.every((s) => segIds.includes(s.segment_id));
    if (same) return true;
    const removed = current.filter((s) => !segIds.includes(s.segment_id));
    const risky = removed.filter((s) => s.cabin_id || s.start_date || s.end_date);
    if (risky.length && !confirm(
      "Removing a week also clears that week's cabin assignment and custom dates. Continue?",
    )) return false;
    const updated = await api.put<Stay[]>(
      `/trips/${tripId}/participants/${participantId}/segments`,
      { segment_ids: segIds },
    );
    setStays((prev) => [...prev.filter((s) => s.participant_id !== participantId), ...updated]);
    return true;
  }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(null); setNotice(null);
    const body = {
      name: draft.name, cell: draft.cell || null, home_phone: draft.home || null,
      email: draft.email || null,
    };
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
      const synced = await syncSegments(saved.id, draft.segs);
      // The API auto-links a roster row to a known account when the email belongs
      // to someone who accepted a past invite from this organizer.
      if (saved.user_id && !wasLinked) {
        setNotice(`${saved.name} was already in the app — added directly, no invite needed.`);
      }
      if (synced) setDraft(null);
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function addFromBook(contactIds: string[]) {
    setBusy(true); setError(null); setNotice(null);
    const added: string[] = [];
    const known: string[] = [];
    try {
      for (const contactId of contactIds) {
        const saved = await api.post<Participant>(`/trips/${tripId}/participants`, { contact_id: contactId });
        setItems((prev) => (prev ? [...prev, saved] : [saved]));
        // Returning people default to every week too — adjust per person after.
        await syncSegments(saved.id, segments.map((g) => g.id));
        added.push(saved.name);
        if (saved.user_id) known.push(saved.name);
      }
      const who = added.length === 1 ? added[0] : `${added.length} people`;
      const aside = known.length ? ` ${known.join(", ")} already use${known.length === 1 ? "s" : ""} the app — no invite needed.` : "";
      setNotice(`Added ${who} to the trip.${aside}`);
      setPicking(false);
    } catch (e) {
      const reason = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Add failed";
      setError(added.length ? `Added ${added.join(", ")}, then: ${reason}` : reason);
      setPicking(false);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this person from the trip? They stay in your address book.")) return;
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

  /** Attendance summary for the row badge: which weeks (multi-week trips), or
   *  "Custom" when any stay overrides its week's dates. Null = nothing notable
   *  (no stays, or a single-week trip on the default dates). */
  function attendanceBadge(myStays: Stay[]): string | null {
    if (myStays.length === 0) return null;
    if (myStays.some((s) => s.start_date || s.end_date)) return "Custom";
    if (segments.length <= 1) return null;
    if (myStays.length === segments.length) return segments.length === 2 ? "Both Weeks" : "All weeks";
    const attended = new Set(myStays.map((s) => s.segment_id));
    const names = segments.filter((g) => attended.has(g.id)).map((g) => g.name);
    return names.length <= 2 ? names.join(" + ") : `${names.length} weeks`;
  }

  function stayChip(s: Stay): string {
    const seg = segMap.get(s.segment_id);
    const lake = seg?.lake_id ? lakeMap.get(seg.lake_id) : null;
    // Overridden dates surface on the chip; adopting stays just show the week.
    const custom = s.start_date || s.end_date
      ? fmtRange(s.effective_start_date, s.effective_end_date)
      : null;
    const cabin = s.cabin_id ? cabinMap.get(s.cabin_id)?.name : null;
    return [seg?.name ?? "Week", custom, lake?.name ?? "Lake TBD", cabin].filter(Boolean).join(" · ");
  }

  return (
    <div className="p-4 sm:p-7 max-w-[1240px] mx-auto">
      <SectionTitle right={<Btn kind="accent" icon={Plus} onClick={() => setPicking(true)}>Add people</Btn>}>
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
      ) : items.length === 0 ? (
        <EmptyState icon={Users} title="No one in the group yet"
          subtitle="Add the first angler — you can stub the rest now and fill in details later."
          action={<Btn kind="accent" icon={Plus} onClick={() => setPicking(true)}>Add people</Btn>} />
      ) : (
        <Card pad={0}>
          {/* header row (desktop only — mobile rows are self-labelled) */}
          <div className={`hidden lg:grid items-center px-5 py-3 text-[11.5px] font-bold uppercase ${COLS}`}
            style={{ letterSpacing: ".05em", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            <span>Name</span><span>Cell</span><span>Email</span><span>Fly in – Fly out</span><span></span>
          </div>

          {items.map((p, i) => {
            const myStays = staysByParticipant.get(p.id) ?? [];
            const [flyIn, flyOut] = deriveSpan(myStays.map(effectiveDates));
            const badge = attendanceBadge(myStays);
            const open = expanded.has(p.id);
            const pendingInv = pendingInviteFor(p);
            return (
              <div key={p.id} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 lg:grid lg:gap-0 lg:px-5 ${COLS}`}>
                  <div className="order-1 lg:order-none flex items-center gap-2.5 min-w-0 flex-1">
                    <Avatar initials={initialsOf(p.name, p.email)} src={p.avatar_url} size={30} />
                    <span className="text-[14px] font-semibold truncate" style={{ color: "var(--text)" }}>{p.name}</span>
                    {!p.user_id && pendingInv && <Badge tone="warning" dot>Invited</Badge>}
                  </div>
                  <div className={`order-3 lg:order-none gf-mono text-[13px] ${p.cell ? "" : "hidden lg:block"}`} style={{ color: "var(--text-2)" }}>{p.cell || "—"}</div>
                  <div className={`order-4 lg:order-none min-w-0 text-[13px] truncate ${p.email ? "" : "hidden lg:block"}`} style={{ color: "var(--text-2)" }}>{p.email || "—"}</div>
                  <button onClick={() => toggle(p.id)} className="order-5 lg:order-none inline-flex items-center gap-1.5 text-[13px] min-w-0"
                    title="Show weeks, dates & cabin"
                    style={{ color: flyIn || flyOut ? "var(--accent-600)" : "var(--text-3)" }}>
                    {open ? <ChevronDown size={14} className="flex-none" /> : <ChevronRight size={14} className="flex-none" />}
                    {/* Year-less range — the trip header already carries the year. */}
                    <span className="truncate">
                      {flyIn || flyOut ? [fmtDate(flyIn), fmtDate(flyOut)].filter(Boolean).join(" – ") : "Dates TBD"}
                    </span>
                    {badge && <Badge tone={badge === "Custom" ? "accent" : "neutral"}>{badge}</Badge>}
                  </button>
                  <div className="order-2 lg:order-none flex items-center justify-end gap-1">
                    {!p.user_id && p.email && (
                      <Btn kind="subtle" size="sm" icon={Send} disabled={inviting === p.id} onClick={() => invite(p)}
                        title={pendingInv ? "Resend the invitation" : "Email an invitation to join"}>
                        {inviting === p.id ? "Sending…" : pendingInv ? "Resend" : "Invite"}
                      </Btn>
                    )}
                    <IconBtn title="Edit" onClick={() => startEdit(p)}><Pencil size={14} /></IconBtn>
                    <IconBtn title="Delete" onClick={() => remove(p.id)}><Trash2 size={14} /></IconBtn>
                  </div>
                  {/* Forces the wrap after the actions, so the zero-basis flex-1
                      name block actually gets the rest of the first line. */}
                  <span aria-hidden className="order-2 w-full lg:hidden" />
                </div>

                {open && (
                  <div className="px-4 lg:px-5 pb-3 pt-1" style={{ background: "var(--surface-2)" }}>
                    {segments.length === 0 ? (
                      <div className="text-[13px] py-1" style={{ color: "var(--text-3)" }}>
                        Lay out the trip&rsquo;s weeks on the Schedule page first.
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {myStays.map((s) => (
                          <button key={s.id} onClick={() => setEditor({ participantId: p.id, participantName: p.name, stay: s })}
                            className="inline-flex items-center gap-2 text-left rounded-[10px] px-3 py-1.5 transition hover:brightness-95"
                            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                            <span className="text-[13px]" style={{ color: "var(--text)" }}>{stayChip(s)}</span>
                            <Pencil size={12} style={{ color: "var(--text-3)" }} />
                          </button>
                        ))}
                        {myStays.length < segments.length && (
                          <Btn kind="subtle" size="sm" icon={Plus}
                            onClick={() => setEditor({ participantId: p.id, participantName: p.name, stay: null })}>
                            {myStays.length ? "Add a week" : "Add to a week"}
                          </Btn>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {picking && (
        <AddPeopleModal
          pastTrippers={pastTrippers}
          otherContacts={otherContacts}
          busy={busy}
          onAdd={addFromBook}
          onNewPerson={startNew}
          onClose={() => setPicking(false)}
        />
      )}

      {draft && (
        <ModalShell
          title={draft.id ? "Edit person" : "New person"}
          subtitle={draft.id ? "Contact details apply on every trip this person is on" : "They'll be saved to your address book too"}
          onClose={cancel}
          maxWidth={560}
          footer={
            <>
              <Btn kind="ghost" onClick={cancel}>Cancel</Btn>
              <Btn kind="accent" onClick={save} disabled={busy || !draft.name.trim()}>
                {busy ? "Saving…" : draft.id ? "Save changes" : "Add"}
              </Btn>
            </>
          }
        >
          {error && (
            <div className="mb-3 rounded-[10px] px-3 py-2.5 text-[13px]"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Marcus Townsend" />
            </div>
            <Field label="Cell" value={draft.cell} onChange={(e) => setDraft({ ...draft, cell: e.target.value })} placeholder="+1 555 555 5555" />
            <Field label="Home" value={draft.home} onChange={(e) => setDraft({ ...draft, home: e.target.value })} placeholder="+1 555 555 5555" />
            <div className="sm:col-span-2">
              <Field label="Email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="you@example.com" />
            </div>
          </div>
          {segments.length > 0 && (
            <div className="mt-4">
              <div className="text-[12.5px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>Attending</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                {segments.map((g) => (
                  <label key={g.id} className="inline-flex items-center gap-2 text-[14px]" style={{ color: "var(--text)" }}>
                    <input
                      type="checkbox"
                      checked={draft.segs.includes(g.id)}
                      onChange={(e) => setDraft({
                        ...draft,
                        segs: e.target.checked
                          ? [...draft.segs, g.id]
                          : draft.segs.filter((id) => id !== g.id),
                      })}
                    />
                    <span>{g.name}</span>
                    <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                      {fmtRange(g.start_date, g.end_date) || "dates TBD"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="text-[12px] mt-3" style={{ color: "var(--text-3)" }}>
            Cabins and custom fly dates are set per week — expand a person&rsquo;s row in the list, or use the week cards on <span style={{ color: "var(--text-2)" }}>Overview</span>.
          </div>
        </ModalShell>
      )}

      {editor && (
        <StayEditor
          tripId={tripId}
          participantId={editor.participantId}
          participantName={editor.participantName}
          lakes={lakes}
          segments={segments}
          stay={editor.stay}
          takenSegmentIds={(staysByParticipant.get(editor.participantId) ?? []).map((s) => s.segment_id)}
          onSaved={upsertStay}
          onDeleted={dropStay}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

/** One-click roster building: everyone from the user's other trips who isn't on
 *  this one yet, as a checkbox list — check the crew, hit Add. Address-book
 *  contacts who've never been on a trip (spouses, emergency contacts) hide
 *  behind a toggle; brand-new people go through the New person form. */
function AddPeopleModal({
  pastTrippers, otherContacts, busy, onAdd, onNewPerson, onClose,
}: {
  pastTrippers: Contact[];
  otherContacts: Contact[];
  busy: boolean;
  onAdd: (contactIds: string[]) => void;
  onNewPerson: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [showOthers, setShowOthers] = useState(false);

  function toggle(id: string) {
    setPicked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function row(c: Contact, hint: string | null) {
    return (
      <label key={c.id} className="flex items-center gap-2.5 px-2 py-2 rounded-[10px] cursor-pointer transition hover:brightness-95"
        style={{ background: picked.has(c.id) ? "var(--surface-2)" : "transparent" }}>
        <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
        <Avatar initials={initialsOf(c.name, c.email)} src={c.avatar_url} size={26} />
        <span className="text-[14px] font-medium truncate" style={{ color: "var(--text)" }}>{c.name}</span>
        {hint && <span className="text-[12px] truncate" style={{ color: "var(--text-3)" }}>{hint}</span>}
      </label>
    );
  }

  return (
    <ModalShell
      title="Add people"
      subtitle="Everyone you add starts on every week — fine-tune per person after"
      onClose={onClose}
      maxWidth={560}
      footer={
        <>
          <Btn kind="ghost" icon={UserPlus} className="mr-auto" onClick={onNewPerson}>New person</Btn>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="accent" disabled={busy || picked.size === 0} onClick={() => onAdd([...picked])}>
            {busy ? "Adding…" : picked.size > 1 ? `Add ${picked.size} people` : "Add to trip"}
          </Btn>
        </>
      }
    >
      {pastTrippers.length === 0 ? (
        <div className="text-[13.5px] py-1" style={{ color: "var(--text-3)" }}>
          Everyone from your other trips is already in this group.
          {otherContacts.length === 0 && " Use “New person” to add someone new."}
        </div>
      ) : (
        <div className="flex flex-col">
          {pastTrippers.map((c) => row(c, c.trip_names.join(" · ")))}
        </div>
      )}
      {otherContacts.length > 0 && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={() => setShowOthers((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
            style={{ color: "var(--text-3)" }}>
            {showOthers ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Address book — not on any trip ({otherContacts.length})
          </button>
          {showOthers && (
            <div className="flex flex-col mt-1.5">
              {otherContacts.map((c) => row(c, c.relationship_label ?? c.email))}
            </div>
          )}
        </div>
      )}
    </ModalShell>
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
