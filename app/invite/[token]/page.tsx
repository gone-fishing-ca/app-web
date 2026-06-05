"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, MapPin } from "lucide-react";
import { Btn, Wordmark } from "@/components/ui";
import { api, type InvitePublic } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid place-items-center min-h-screen p-4" style={{ background: "var(--bg-sunk)" }}>
      <div className="w-full max-w-[420px] flex flex-col gap-5">
        <div className="text-center flex flex-col items-center gap-3">
          <img src="/walleye/walleye-icon.png" alt="" style={{ width: 64, height: 64, borderRadius: 16 }} />
          <Wordmark size={20} />
        </div>
        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Note({ tone, children }: { tone: "danger" | "info" | "warning"; children: React.ReactNode }) {
  const bg = tone === "danger" ? "var(--danger-bg)" : tone === "warning" ? "var(--warning-bg)" : "var(--info-bg)";
  const fg = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--info)";
  return (
    <div className="rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: bg, color: fg }}>
      {children}
    </div>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [invite, setInvite] = useState<InvitePublic | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<InvitePublic>(`/invitations/${token}`)
      .then(setInvite)
      .catch((e) =>
        setLoadError(
          e?.status === 404
            ? "This invitation link is invalid or has been removed."
            : e?.message ?? "Could not load this invitation.",
        ),
      );
  }, [token]);

  async function accept() {
    setAccepting(true);
    setAcceptError(null);
    try {
      const { trip_id } = await api.post<{ trip_id: string }>(`/invitations/${token}/accept`);
      router.push(`/trips/${trip_id}`);
    } catch (e) {
      setAcceptError(
        e && typeof e === "object" && "message" in e
          ? String((e as { message?: string }).message)
          : "Could not accept the invitation.",
      );
      setAccepting(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <Note tone="danger">{loadError}</Note>
        <Link href="/" style={{ color: "var(--accent-600)", fontWeight: 600, fontSize: 13, textAlign: "center" }}>
          Go to Gone Fishing
        </Link>
      </Shell>
    );
  }

  if (!invite) {
    return (
      <Shell>
        <div className="text-[14px] text-center" style={{ color: "var(--text-3)" }}>Loading invitation…</div>
      </Shell>
    );
  }

  const tripHref = `/trips/${invite.trip_id}`;
  const nextPath = `/invite/${token}`;
  const emailMatches = !!user && user.email.toLowerCase() === invite.email.toLowerCase();

  // Header common to every state: who invited you, to what.
  const header = (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12.5px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-3)" }}>
        {invite.inviter_name ? `${invite.inviter_name} invited you` : "You're invited"}
      </div>
      <div className="text-[22px] font-bold leading-tight" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
        {invite.trip_name}
      </div>
      {invite.destination && (
        <div className="flex items-center gap-1.5 text-[13.5px]" style={{ color: "var(--text-2)" }}>
          <MapPin size={15} /> {invite.destination}
        </div>
      )}
    </div>
  );

  let body: React.ReactNode;

  if (invite.status === "revoked") {
    body = <Note tone="warning">This invitation has been revoked. Ask the organizer to send you a new one.</Note>;
  } else if (invite.status === "accepted") {
    body = (
      <>
        <Note tone="info">This invitation has already been accepted.</Note>
        {user && (
          <Btn kind="accent" iconRight={ArrowRight} full onClick={() => router.push(tripHref)}>
            Go to the trip
          </Btn>
        )}
      </>
    );
  } else if (invite.expired) {
    body = <Note tone="warning">This invitation has expired. Ask the organizer to resend it.</Note>;
  } else if (authLoading) {
    body = <div className="text-[14px] text-center" style={{ color: "var(--text-3)" }}>Checking your session…</div>;
  } else if (!user) {
    body = (
      <>
        <p className="text-[14px]" style={{ color: "var(--text-2)" }}>
          Sign in or create an account with <strong>{invite.email}</strong> to join.
        </p>
        <Btn
          kind="accent"
          iconRight={ArrowRight}
          full
          onClick={() =>
            router.push(`/signup?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(invite.email)}`)
          }
        >
          Create an account
        </Btn>
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          className="text-[13px] text-center"
          style={{ color: "var(--accent-600)", fontWeight: 600 }}
        >
          I already have an account — sign in
        </Link>
      </>
    );
  } else if (!emailMatches) {
    body = (
      <>
        <Note tone="warning">
          This invitation was sent to <strong>{invite.email}</strong>, but you’re signed in as{" "}
          <strong>{user.email}</strong>. Sign in with the invited address to accept.
        </Note>
        <Btn kind="ghost" full onClick={() => signOut()}>
          Sign out
        </Btn>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-[14px]" style={{ color: "var(--text-2)" }}>
          You’re signed in as <strong>{user.email}</strong>. Accept to join the trip.
        </p>
        {acceptError && <Note tone="danger">{acceptError}</Note>}
        <Btn kind="accent" icon={Check} full onClick={accept} disabled={accepting}>
          {accepting ? "Joining…" : "Accept invitation"}
        </Btn>
      </>
    );
  }

  return (
    <Shell>
      {header}
      {body}
    </Shell>
  );
}
