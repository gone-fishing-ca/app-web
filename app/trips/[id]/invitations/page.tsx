"use client";

import { use, useEffect, useState } from "react";
import { Mail, RotateCw, Send, X } from "lucide-react";
import { Badge, Btn, Card, EmptyState, Field, SectionTitle } from "@/components/ui";
import { api, type Invitation } from "@/lib/api";
import { fmtDate } from "@/lib/format";

function isExpired(inv: Invitation): boolean {
  return inv.status === "pending" && new Date(inv.expires_at).getTime() < Date.now();
}

function statusBadge(inv: Invitation) {
  if (inv.status === "accepted") return <Badge tone="success" dot>Joined</Badge>;
  if (inv.status === "revoked") return <Badge tone="neutral">Revoked</Badge>;
  if (isExpired(inv)) return <Badge tone="danger" dot>Expired</Badge>;
  return <Badge tone="warning" dot>Pending</Badge>;
}

function errMsg(e: unknown, fallback: string): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message?: string }).message)
    : fallback;
}

export default function InvitationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Invitation[]>(`/trips/${tripId}/invitations`)
      .then(setItems)
      .catch((e) => setError(errMsg(e, "Load failed")));
  }, [tripId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await api.post<Invitation>(`/trips/${tripId}/invitations`, {
        email: email.trim(),
      });
      // A re-invite supersedes any prior pending invite to the same address;
      // drop those locally so the list shows one live row per person.
      setItems((prev) => [
        created,
        ...(prev ?? []).filter(
          (i) => !(i.email === created.email && i.status === "pending"),
        ),
      ]);
      setEmail("");
      setNotice(`Invitation sent to ${created.email}.`);
    } catch (e) {
      setError(errMsg(e, "Could not send invitation"));
    } finally {
      setBusy(false);
    }
  }

  async function resend(inv: Invitation) {
    setError(null);
    setNotice(null);
    try {
      const updated = await api.post<Invitation>(
        `/trips/${tripId}/invitations/${inv.id}/resend`,
      );
      setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null);
      setNotice(`Invitation resent to ${updated.email}.`);
    } catch (e) {
      setError(errMsg(e, "Could not resend"));
    }
  }

  async function revoke(inv: Invitation) {
    if (!confirm(`Revoke the invitation for ${inv.email}?`)) return;
    setError(null);
    setNotice(null);
    try {
      await api.del(`/trips/${tripId}/invitations/${inv.id}`);
      setItems((prev) =>
        prev?.map((i) => (i.id === inv.id ? { ...i, status: "revoked" } : i)) ?? null,
      );
    } catch (e) {
      setError(errMsg(e, "Could not revoke"));
    }
  }

  return (
    <div className="p-7 max-w-[1180px] mx-auto">
      <SectionTitle>Invitations</SectionTitle>

      <p className="mb-5 text-[14px]" style={{ color: "var(--text-2)" }}>
        Invite people by email. They’ll get a link to create an account (if needed) and join this trip.
      </p>

      <Card pad={20}>
        <form onSubmit={send} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <Field
              label="Email address"
              type="email"
              icon={Mail}
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="friend@example.com"
              autoComplete="off"
            />
          </div>
          <Btn type="submit" kind="accent" icon={Send} disabled={busy}>
            {busy ? "Sending…" : "Send invite"}
          </Btn>
        </form>
      </Card>

      {notice && (
        <div
          className="mt-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--success-bg)", color: "var(--success)" }}
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          className="mt-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      <div className="mt-6">
        {items === null ? (
          <div className="text-[14px]" style={{ color: "var(--text-3)" }}>Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No invitations yet"
            subtitle="Send an invite above to bring someone onto the trip."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((inv) => {
              const pending = inv.status === "pending" && !isExpired(inv);
              return (
                <Card key={inv.id} pad={14}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-[14.5px] font-semibold" style={{ color: "var(--text)" }}>
                        {inv.email}
                      </div>
                      <div className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
                        {inv.role === "organizer" ? "Organizer · " : ""}
                        {inv.status === "accepted"
                          ? "Joined the trip"
                          : isExpired(inv)
                            ? `Expired ${fmtDate(inv.expires_at)}`
                            : inv.status === "revoked"
                              ? "Invitation revoked"
                              : `Expires ${fmtDate(inv.expires_at)}`}
                      </div>
                    </div>
                    {statusBadge(inv)}
                    {pending && (
                      <div className="flex items-center gap-2">
                        <Btn kind="subtle" size="sm" icon={RotateCw} onClick={() => resend(inv)}>
                          Resend
                        </Btn>
                        <Btn kind="ghost" size="sm" icon={X} onClick={() => revoke(inv)}>
                          Revoke
                        </Btn>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
