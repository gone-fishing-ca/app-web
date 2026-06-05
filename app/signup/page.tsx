"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Mail, User } from "lucide-react";
import { Btn, Field, Wordmark } from "@/components/ui";
import { SsoButtons, SsoDivider } from "@/components/sso";
import { useAuth } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const { user, signUp, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Where to go after auth, and an optional email to prefill — both arrive on the
  // query string when an invite link routes someone here (?next=…&email=…).
  const [next, setNext] = useState("/trips");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const n = q.get("next");
    if (n) setNext(n);
    const e = q.get("email");
    if (e) setEmail(e);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      const n = new URLSearchParams(window.location.search).get("next") || "/trips";
      router.replace(n);
    }
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signUp(email, password, name || undefined);
      router.replace(next);
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "Sign up failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid place-items-center min-h-screen" style={{ background: "var(--bg-sunk)" }}>
      <div className="w-full max-w-[400px] flex flex-col gap-5">
        <div className="text-center flex flex-col items-center gap-3">
          <img src="/walleye/walleye-icon.png" alt="" style={{ width: 72, height: 72, borderRadius: 18 }} />
          <Wordmark size={22} />
          <div className="text-[14.5px]" style={{ color: "var(--text-2)" }}>
            Create an account — for organizers and trip members alike.
          </div>
        </div>

        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <SsoButtons redirectPath={next} />

          <SsoDivider>or with an email + password</SsoDivider>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="Your name" icon={User} value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Marcus Townsend" autoComplete="name" />
            <Field label="Email" type="email" icon={Mail} value={email} required
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            <Field label="Password" type="password" icon={Lock} value={password} required minLength={8}
              onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />

            {error && (
              <div className="rounded-[10px] text-[13px] px-3 py-2.5"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                {error}
              </div>
            )}

            <Btn type="submit" size="lg" iconRight={ArrowRight} full disabled={submitting}>
              {submitting ? "Creating…" : "Create account"}
            </Btn>
          </form>
        </div>

        <div className="text-[13px] text-center" style={{ color: "var(--text-2)" }}>
          Already on board?{" "}
          <Link
            href={next === "/trips" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
            style={{ color: "var(--accent-600)", fontWeight: 600 }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
