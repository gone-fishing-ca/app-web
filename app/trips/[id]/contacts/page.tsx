"use client";

import { use, useEffect, useMemo, useState } from "react";
import {
  ContactRound, Globe, Mail, MapPin, Pencil, Phone, Plus, Tent, Trash2, Users, X,
} from "lucide-react";
import {
  Avatar, Badge, Btn, Card, ComboBox, EmptyState, Field, SectionTitle, initialsOf,
} from "@/components/ui";
import {
  api, type Contact, type ContactGroup, type Outfitter, type Resource,
  type TripLake, type TripResource,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const GROUP_COLS = "1.5fr 1fr 1fr 1.6fr 76px";

type ContactDraft = {
  id?: string;
  name: string;
  cell: string;
  home_phone: string;
  email: string;
  related_to_id: string | null; // set → this is a relative of that contact
  relationship_label: string;
};

type ResourceDraft = {
  id?: string; // catalog id when editing
  name: string;
  category: string;
  contact_person: string;
  phone: string;
  alt_phone: string;
  email: string;
  website: string;
  address: string;
  notes: string;
};

export default function ContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const { user } = useAuth();
  const [groups, setGroups] = useState<ContactGroup[] | null>(null);
  const [lakes, setLakes] = useState<TripLake[] | null>(null);
  const [tripResources, setTripResources] = useState<TripResource[] | null>(null);
  const [catalog, setCatalog] = useState<Resource[]>([]);
  const [contactDraft, setContactDraft] = useState<ContactDraft | null>(null);
  const [outfitterDraft, setOutfitterDraft] = useState<Outfitter | null>(null);
  const [resourceDraft, setResourceDraft] = useState<ResourceDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadGroups() {
    api.get<ContactGroup[]>(`/trips/${tripId}/contacts`)
      .then(setGroups)
      .catch((e) => setError(e?.message ?? "Load failed"));
  }
  function loadResources() {
    api.get<TripResource[]>(`/trips/${tripId}/resources`).then(setTripResources).catch(() => setTripResources([]));
    api.get<Resource[]>(`/resources`).then(setCatalog).catch(() => {});
  }

  useEffect(() => {
    loadGroups();
    api.get<TripLake[]>(`/trips/${tripId}/lakes`).then(setLakes).catch(() => setLakes([]));
    loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Outfitters of the trip's linked lakes, deduped, each with the lakes it runs.
  const outfitters = useMemo(() => {
    const byId = new Map<string, { outfitter: Outfitter; lakes: string[] }>();
    for (const l of lakes ?? []) {
      if (!l.outfitter) continue;
      const entry = byId.get(l.outfitter.id) ?? { outfitter: l.outfitter, lakes: [] };
      entry.lakes.push(l.name);
      byId.set(l.outfitter.id, entry);
    }
    return [...byId.values()];
  }, [lakes]);

  const linkedIds = useMemo(() => new Set((tripResources ?? []).map((r) => r.id)), [tripResources]);
  const unlinked = useMemo(
    () => catalog.filter((r) => !linkedIds.has(r.id)),
    [catalog, linkedIds],
  );

  async function unlinkResource(tr: TripResource) {
    if (!confirm(`Remove ${tr.name} from this trip? It stays in your catalog for other trips.`)) return;
    try {
      await api.del(`/trips/${tripId}/resources/${tr.trip_resource_id}`);
      setTripResources((prev) => prev?.filter((r) => r.trip_resource_id !== tr.trip_resource_id) ?? null);
    } catch (e) { setError(msg(e, "Remove failed")); }
  }

  async function linkResource(resourceId: string) {
    try {
      const linked = await api.post<TripResource>(`/trips/${tripId}/resources`, {
        resource_id: resourceId, sort_order: tripResources?.length ?? 0,
      });
      setTripResources((prev) => (prev ? [...prev, linked] : [linked]));
    } catch (e) { setError(msg(e, "Could not add resource")); }
  }

  async function deleteRelative(c: Contact) {
    if (!confirm(`Delete ${c.name} from the address book?`)) return;
    try {
      await api.del(`/contacts/${c.id}`);
      loadGroups();
    } catch (e) { setError(msg(e, "Delete failed")); }
  }

  return (
    <div className="p-7 max-w-[1240px] mx-auto">
      <SectionTitle>Contacts</SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {/* ---- Group: roster members + their related contacts ------------------ */}
      <Eyebrow icon={Users}>Group</Eyebrow>
      {groups === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : groups.length === 0 ? (
        <EmptyState icon={Users} title="No one in the group yet"
          subtitle="People you add on the Group page show up here, along with their spouses and emergency contacts." />
      ) : (
        <Card pad={0} className="mb-8">
          <div className="grid items-center px-5 py-3 text-[11.5px] font-bold uppercase"
            style={{ gridTemplateColumns: GROUP_COLS, letterSpacing: ".05em", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            <span>Name</span><span>Cell</span><span>Home</span><span>Email</span><span></span>
          </div>
          {groups.map((g, i) => (
            <div key={g.participant_id} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
              <ContactRow
                contact={g.contact}
                primary
                onEdit={() => setContactDraft(toDraft(g.contact))}
                onAddRelative={() => setContactDraft({
                  name: "", cell: "", home_phone: "", email: "",
                  related_to_id: g.contact.id, relationship_label: "Spouse",
                })}
              />
              {g.relatives.map((r) => (
                <ContactRow key={r.id} contact={r}
                  onEdit={() => setContactDraft(toDraft(r))}
                  onDelete={() => deleteRelative(r)} />
              ))}
            </div>
          ))}
        </Card>
      )}

      {/* ---- Outfitters ------------------------------------------------------- */}
      <Eyebrow icon={Tent}>Outfitters</Eyebrow>
      {lakes === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : outfitters.length === 0 ? (
        <EmptyState icon={Tent} title="No outfitters yet"
          subtitle="Outfitters from the lakes on this trip show up here automatically. Add a lake with an outfitter on the Lakes & cabins page." />
      ) : (
        <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {outfitters.map(({ outfitter: o, lakes: runs }) => (
            <Card key={o.id} pad={18}>
              <div className="flex items-center gap-2">
                <Tent size={16} style={{ color: "var(--accent-600)" }} />
                <span className="text-[15px] font-semibold flex-1 min-w-0 truncate" style={{ color: "var(--text)" }}>{o.name}</span>
                {user?.id === o.owner_id && (
                  <IconBtn title="Edit outfitter" onClick={() => setOutfitterDraft(o)}><Pencil size={14} /></IconBtn>
                )}
              </div>
              {o.contact_person && (
                <div className="text-[13px] mt-0.5" style={{ color: "var(--text-2)" }}>{o.contact_person}</div>
              )}
              <div className="text-[12.5px] mt-1" style={{ color: "var(--text-3)" }}>
                Runs {runs.join(" · ")}
              </div>
              <div className="flex flex-col gap-1.5 mt-3 text-[13px]">
                {o.phone && <InfoRow icon={Phone} href={`tel:${o.phone}`}>{o.phone}</InfoRow>}
                {o.email && <InfoRow icon={Mail} href={`mailto:${o.email}`}>{o.email}</InfoRow>}
                {o.website && <InfoRow icon={Globe} href={o.website}>{prettyUrl(o.website)}</InfoRow>}
                {o.address && <InfoRow icon={MapPin}>{o.address}</InfoRow>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---- Other resources ---------------------------------------------------- */}
      <div className="flex items-end justify-between gap-2 mb-3">
        <Eyebrow icon={MapPin} noMargin>Other resources</Eyebrow>
        <div className="flex items-end gap-2">
          {unlinked.length > 0 && (
            <div className="w-[300px]">
              <ComboBox
                value={null}
                placeholder="Add from your catalog…"
                options={unlinked.map((r) => ({ value: r.id, label: r.name, hint: r.category ?? undefined }))}
                onSelect={linkResource}
                onCreate={(q) => setResourceDraft(blankResource(q))}
                createLabel={(q) => `New resource “${q}”`}
              />
            </div>
          )}
          <Btn kind="accent" icon={Plus} onClick={() => setResourceDraft(blankResource())}>
            New resource
          </Btn>
        </div>
      </div>
      {tripResources === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : tripResources.length === 0 ? (
        <EmptyState icon={ContactRound} title="No resources yet"
          subtitle="The duty-free store, the dry-ice supplier, the bait shop on the way up — link the places this trip leans on."
          action={<Btn kind="accent" icon={Plus} onClick={() => setResourceDraft(blankResource())}>Add a resource</Btn>} />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {tripResources.map((r) => (
            <Card key={r.trip_resource_id} pad={18}>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold flex-1 min-w-0 truncate" style={{ color: "var(--text)" }}>{r.name}</span>
                {r.category && <Badge tone="neutral">{r.category}</Badge>}
                {user?.id === r.owner_id && (
                  <IconBtn title="Edit resource" onClick={() => setResourceDraft({
                    id: r.id, name: r.name, category: r.category ?? "", contact_person: r.contact_person ?? "",
                    phone: r.phone ?? "", alt_phone: r.alt_phone ?? "", email: r.email ?? "",
                    website: r.website ?? "", address: r.address ?? "", notes: r.notes ?? "",
                  })}><Pencil size={14} /></IconBtn>
                )}
                <IconBtn title="Remove from this trip" onClick={() => unlinkResource(r)}><Trash2 size={14} /></IconBtn>
              </div>
              {r.contact_person && (
                <div className="text-[13px] mt-0.5" style={{ color: "var(--text-2)" }}>{r.contact_person}</div>
              )}
              <div className="flex flex-col gap-1.5 mt-3 text-[13px]">
                {r.phone && <InfoRow icon={Phone} href={`tel:${r.phone}`}>{r.phone}</InfoRow>}
                {r.alt_phone && <InfoRow icon={Phone} href={`tel:${r.alt_phone}`}>{r.alt_phone}</InfoRow>}
                {r.email && <InfoRow icon={Mail} href={`mailto:${r.email}`}>{r.email}</InfoRow>}
                {r.website && <InfoRow icon={Globe} href={r.website}>{prettyUrl(r.website)}</InfoRow>}
                {r.address && <InfoRow icon={MapPin}>{r.address}</InfoRow>}
              </div>
              {r.notes && (
                <div className="text-[12.5px] mt-2.5 pt-2.5" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
                  {r.notes}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {contactDraft && (
        <ContactModal
          draft={contactDraft}
          onClose={() => setContactDraft(null)}
          onSaved={() => { setContactDraft(null); loadGroups(); }}
        />
      )}
      {outfitterDraft && (
        <OutfitterModal
          outfitter={outfitterDraft}
          onClose={() => setOutfitterDraft(null)}
          onSaved={() => {
            setOutfitterDraft(null);
            api.get<TripLake[]>(`/trips/${tripId}/lakes`).then(setLakes).catch(() => {});
          }}
        />
      )}
      {resourceDraft && (
        <ResourceModal
          draft={resourceDraft}
          onClose={() => setResourceDraft(null)}
          onSaved={async (saved, isNew) => {
            setResourceDraft(null);
            if (isNew) await linkResource(saved.id);
            loadResources();
          }}
        />
      )}
    </div>
  );
}

/* ---- Group rows ------------------------------------------------------------- */
function ContactRow({
  contact: c, primary, onEdit, onAddRelative, onDelete,
}: {
  contact: Contact;
  primary?: boolean;
  onEdit: () => void;
  onAddRelative?: () => void;
  onDelete?: () => void;
}) {
  return (
    // Relative rows tuck up under their primary: no top padding, slim bottom.
    <div className={`grid items-center px-5 ${primary ? "py-2.5" : "pt-0 pb-2"}`}
      style={{ gridTemplateColumns: GROUP_COLS }}>
      <div className={`flex items-center gap-2.5 min-w-0 ${primary ? "" : "pl-9"}`}>
        {primary && <Avatar initials={initialsOf(c.name, c.email)} src={c.avatar_url} size={28} />}
        <span className={`text-[13.5px] truncate ${primary ? "font-semibold" : ""}`}
          style={{ color: primary ? "var(--text)" : "var(--text-2)" }}>
          {c.name}
        </span>
        {!primary && c.relationship_label && <Badge tone="neutral">{c.relationship_label}</Badge>}
      </div>
      <PhoneCell value={c.cell} />
      <PhoneCell value={c.home_phone} />
      <div className="text-[13px] truncate" style={{ color: "var(--text-2)" }}>
        {c.email ? <a href={`mailto:${c.email}`} className="hover:underline" style={{ color: "var(--accent-600)" }}>{c.email}</a> : "—"}
      </div>
      <div className="flex items-center justify-end gap-1">
        {onAddRelative && <IconBtn title="Add a related contact (spouse, child, …)" onClick={onAddRelative}><Plus size={14} /></IconBtn>}
        <IconBtn title="Edit" onClick={onEdit}><Pencil size={14} /></IconBtn>
        {onDelete && <IconBtn title="Delete" onClick={onDelete}><Trash2 size={14} /></IconBtn>}
      </div>
    </div>
  );
}

function PhoneCell({ value }: { value: string | null }) {
  if (!value) return <div style={{ color: "var(--text-3)" }}>—</div>;
  return (
    <div className="gf-mono text-[13px]">
      <a href={`tel:${value}`} className="hover:underline" style={{ color: "var(--text-2)" }}>{value}</a>
    </div>
  );
}

/* ---- Modals ------------------------------------------------------------------ */
function ContactModal({
  draft, onClose, onSaved,
}: {
  draft: ContactDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRelative = Boolean(d.related_to_id);

  async function save() {
    setBusy(true); setError(null);
    const body = {
      name: d.name.trim(),
      cell: d.cell || null,
      home_phone: d.home_phone || null,
      email: d.email || null,
      ...(isRelative ? { relationship_label: d.relationship_label || null } : {}),
      ...(!d.id && isRelative ? { related_to_id: d.related_to_id } : {}),
    };
    try {
      if (d.id) await api.patch<Contact>(`/contacts/${d.id}`, body);
      else await api.post<Contact>(`/contacts`, body);
      onSaved();
    } catch (e) {
      setError(msg(e, "Save failed"));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={d.id ? "Edit contact" : "Add related contact"}
      subtitle={isRelative ? "Shown under their person in the group list" : undefined}
      onClose={onClose}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="accent" onClick={save} disabled={busy || !d.name.trim()}>
            {busy ? "Saving…" : d.id ? "Save changes" : "Add contact"}
          </Btn>
        </>
      }
      error={error}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Sandy Jacques" />
        {isRelative ? (
          <Field label="Relationship" value={d.relationship_label}
            onChange={(e) => setD({ ...d, relationship_label: e.target.value })} placeholder="Spouse" />
        ) : <div />}
        <Field label="Cell" value={d.cell} onChange={(e) => setD({ ...d, cell: e.target.value })} placeholder="+1 555 555 5555" />
        <Field label="Home" value={d.home_phone} onChange={(e) => setD({ ...d, home_phone: e.target.value })} placeholder="+1 555 555 5555" />
        <div className="col-span-2">
          <Field label="Email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="sandy@example.com" />
        </div>
      </div>
    </Modal>
  );
}

function OutfitterModal({
  outfitter, onClose, onSaved,
}: {
  outfitter: Outfitter;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState({
    name: outfitter.name, contact_person: outfitter.contact_person ?? "",
    phone: outfitter.phone ?? "", email: outfitter.email ?? "",
    website: outfitter.website ?? "", address: outfitter.address ?? "",
    notes: outfitter.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      await api.patch<Outfitter>(`/outfitters/${outfitter.id}`, {
        name: d.name.trim(), contact_person: d.contact_person || null,
        phone: d.phone || null, email: d.email || null, website: d.website || null,
        address: d.address || null, notes: d.notes || null,
      });
      onSaved();
    } catch (e) {
      setError(msg(e, "Save failed"));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Edit outfitter"
      subtitle="Changes apply everywhere this outfitter is used"
      onClose={onClose}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="accent" onClick={save} disabled={busy || !d.name.trim()}>{busy ? "Saving…" : "Save changes"}</Btn>
        </>
      }
      error={error}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <Field label="Contact person" value={d.contact_person} onChange={(e) => setD({ ...d, contact_person: e.target.value })} placeholder="Don & Anette Elliott" />
        <Field label="Phone" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        <Field label="Email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        <div className="col-span-2">
          <Field label="Website" value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} placeholder="https://…" />
        </div>
        <div className="col-span-2">
          <Field label="Address" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Field label="Notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

function ResourceModal({
  draft, onClose, onSaved,
}: {
  draft: ResourceDraft;
  onClose: () => void;
  onSaved: (saved: Resource, isNew: boolean) => void;
}) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    const body = {
      name: d.name.trim(), category: d.category || null, contact_person: d.contact_person || null,
      phone: d.phone || null, alt_phone: d.alt_phone || null, email: d.email || null,
      website: d.website || null, address: d.address || null, notes: d.notes || null,
    };
    try {
      const saved = d.id
        ? await api.patch<Resource>(`/resources/${d.id}`, body)
        : await api.post<Resource>(`/resources`, body);
      onSaved(saved, !d.id);
    } catch (e) {
      setError(msg(e, "Save failed"));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={d.id ? "Edit resource" : "New resource"}
      subtitle={d.id ? "Changes apply on every trip that uses it" : "Added to your catalog and linked to this trip"}
      onClose={onClose}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="accent" onClick={save} disabled={busy || !d.name.trim()}>
            {busy ? "Saving…" : d.id ? "Save changes" : "Add resource"}
          </Btn>
        </>
      }
      error={error}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Rydens Duty Free Store" />
        <Field label="Category" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} placeholder="Bait shop · Dry ice · Hotel …" />
        <Field label="Contact person" value={d.contact_person} onChange={(e) => setD({ ...d, contact_person: e.target.value })} placeholder="Mike" />
        <Field label="Phone" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        <Field label="Alt phone" value={d.alt_phone} onChange={(e) => setD({ ...d, alt_phone: e.target.value })} />
        <Field label="Email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        <div className="col-span-2">
          <Field label="Website" value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} placeholder="https://…" />
        </div>
        <div className="col-span-2">
          <Field label="Address" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Field label="Notes" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Call 30 mins ahead · red canoe on left …" />
        </div>
      </div>
    </Modal>
  );
}

/* ---- Shared bits --------------------------------------------------------------- */
function Modal({
  title, subtitle, error, footer, onClose, children,
}: {
  title: string;
  subtitle?: string;
  error?: string | null;
  footer: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,.45)" }} onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{title}</div>
            {subtitle && <div className="text-[12.5px]" style={{ color: "var(--text-3)" }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} className="grid place-items-center"
            style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            <X size={15} />
          </button>
        </div>
        <div className="px-5 py-4">
          {error && (
            <div className="mb-3 rounded-[10px] px-3 py-2.5 text-[13px]"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
          )}
          {children}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ icon: Icon, noMargin, children }: { icon: typeof Users; noMargin?: boolean; children: React.ReactNode }) {
  return (
    <div className={`text-[11.5px] font-bold uppercase inline-flex items-center gap-1.5 ${noMargin ? "" : "mb-3"}`}
      style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
      <Icon size={14} /> {children}
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="grid place-items-center flex-none"
      style={{ width: 28, height: 28, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
      {children}
    </button>
  );
}

function InfoRow({
  icon: Icon, href, children,
}: {
  icon: typeof Phone; href?: string; children: React.ReactNode;
}) {
  const body = (
    <span className="inline-flex items-center gap-2" style={{ color: href ? "var(--accent-600)" : "var(--text-2)" }}>
      <Icon size={14} style={{ color: "var(--text-3)" }} /> {children}
    </span>
  );
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="hover:underline">
      {body}
    </a>
  ) : <div>{body}</div>;
}

function prettyUrl(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function blankResource(name = ""): ResourceDraft {
  return {
    name, category: "", contact_person: "", phone: "", alt_phone: "",
    email: "", website: "", address: "", notes: "",
  };
}

function toDraft(c: Contact): ContactDraft {
  return {
    id: c.id, name: c.name, cell: c.cell ?? "", home_phone: c.home_phone ?? "",
    email: c.email ?? "", related_to_id: c.related_to_id,
    relationship_label: c.relationship_label ?? "",
  };
}

function msg(e: unknown, fallback: string): string {
  return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
}
