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

      <button
        type="button"
        onClick={() => go("apple")}
        disabled={busy !== null}
        className="flex items-center justify-center gap-2.5 w-full py-3 rounded-[11px] text-[14.5px] font-semibold transition hover:brightness-110 disabled:opacity-60 disabled:cursor-wait"
        style={{ background: "#111", color: "#fff", border: "1px solid #111" }}
      >
        <AppleLogo fill="#fff" />
        {busy === "apple" ? "Redirecting…" : "Continue with Apple"}
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

function AppleLogo({ size = 18, fill = "currentColor" }: { size?: number; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      style={{ flex: "0 0 auto", marginTop: -2 }}
    >
      <path d="M16.36 12.78c.02 2.6 2.28 3.46 2.3 3.47-.02.06-.36 1.24-1.18 2.46-.71 1.05-1.45 2.1-2.62 2.12-1.14.02-1.51-.68-2.82-.68-1.31 0-1.72.66-2.8.7-1.12.04-1.98-1.13-2.7-2.18-1.47-2.14-2.6-6.04-1.08-8.68.75-1.31 2.1-2.14 3.56-2.16 1.1-.02 2.14.74 2.82.74.67 0 1.94-.92 3.27-.78.56.02 2.12.22 3.13 1.7-.08.05-1.87 1.1-1.85 3.27M14.2 4.2c.6-.73 1.01-1.74.9-2.75-.87.03-1.92.58-2.55 1.3-.56.64-1.05 1.67-.92 2.65.97.08 1.96-.49 2.57-1.2" />
    </svg>
  );
}

function extractMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message?: string }).message);
  }
  return "Sign-in failed";
}
