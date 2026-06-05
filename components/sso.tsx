"use client";

import { useState } from "react";
import { useAuth, type OAuthProvider } from "@/lib/auth";

export function SsoButtons() {
  const { signInWithOAuth } = useAuth();
  const [busy, setBusy] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(provider: OAuthProvider) {
    setError(null);
    setBusy(provider);
    try {
      await signInWithOAuth(provider);
      // The browser is redirecting to the provider — no further UI change needed.
    } catch (e) {
      setError(extractMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 w-full">
      <button
        type="button"
        onClick={() => go("google")}
        disabled={busy !== null}
        className="flex items-center justify-center gap-2.5 w-full py-3 rounded-[11px] text-[14.5px] font-semibold transition hover:brightness-95 disabled:opacity-60 disabled:cursor-wait"
        style={{
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <GoogleG />
        {busy === "google" ? "Redirecting…" : "Continue with Google"}
      </button>

      {error && (
        <div
          className="rounded-[10px] text-[13px] px-3 py-2.5"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

export function SsoDivider({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 text-xs font-semibold whitespace-nowrap my-1"
      style={{ color: "var(--text-3)" }}
    >
      <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
      {children}
      <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}

function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flex: "0 0 auto" }}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 .5 24 .5 14.6 .5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 13.8 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.8 38 46.5 31.9 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.4 28.4c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C1 16.3 0 20 0 23.8s1 7.5 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 47.5c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.3-13.6-10.1l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}

function extractMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message?: string }).message);
  }
  return "Sign-in failed";
}
