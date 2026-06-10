"use client";

import { use, useEffect, useState } from "react";
import { ContactRound, Globe, Mail, MapPin, Phone, Tent } from "lucide-react";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { api, type Outfitter, type TripLake } from "@/lib/api";

export default function ContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [lakes, setLakes] = useState<TripLake[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<TripLake[]>(`/trips/${tripId}/lakes`)
      .then(setLakes)
      .catch((e) => setError(e?.message ?? "Load failed"));
  }, [tripId]);

  // Outfitters of the trip's linked lakes, deduped, each with the lakes it runs.
  const byId = new Map<string, { outfitter: Outfitter; lakes: string[] }>();
  for (const l of lakes ?? []) {
    if (!l.outfitter) continue;
    const entry = byId.get(l.outfitter.id) ?? { outfitter: l.outfitter, lakes: [] };
    entry.lakes.push(l.name);
    byId.set(l.outfitter.id, entry);
  }
  const outfitters = [...byId.values()];

  return (
    <div className="p-7 max-w-[1240px] mx-auto">
      <SectionTitle>Contacts</SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      <div className="text-[11.5px] font-bold uppercase inline-flex items-center gap-1.5 mb-3"
        style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
        <Tent size={14} /> Outfitters
      </div>

      {lakes === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : outfitters.length === 0 ? (
        <EmptyState icon={ContactRound} title="No outfitters yet"
          subtitle="Outfitters from the lakes on this trip show up here automatically. Add a lake with an outfitter on the Lakes & cabins page." />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {outfitters.map(({ outfitter: o, lakes: runs }) => (
            <Card key={o.id} pad={18}>
              <div className="flex items-center gap-2">
                <Tent size={16} style={{ color: "var(--accent-600)" }} />
                <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{o.name}</span>
              </div>
              {o.contact_person && (
                <div className="text-[13px] mt-0.5" style={{ color: "var(--text-2)" }}>{o.contact_person}</div>
              )}
              <div className="text-[12.5px] mt-1" style={{ color: "var(--text-3)" }}>
                Runs {runs.join(" · ")}
              </div>
              <div className="flex flex-col gap-1.5 mt-3 text-[13px]">
                {o.phone && <ContactRow icon={Phone} href={`tel:${o.phone}`}>{o.phone}</ContactRow>}
                {o.email && <ContactRow icon={Mail} href={`mailto:${o.email}`}>{o.email}</ContactRow>}
                {o.website && <ContactRow icon={Globe} href={o.website}>{prettyUrl(o.website)}</ContactRow>}
                {o.address && <ContactRow icon={MapPin}>{o.address}</ContactRow>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function prettyUrl(u: string): string {
  return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function ContactRow({
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
