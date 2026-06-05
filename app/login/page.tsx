"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { Btn, Field, Wordmark } from "@/components/ui";
import { SsoButtons, SsoDivider } from "@/components/sso";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/trips");
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/trips");
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "Sign in failed";
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
        </div>

        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <SsoButtons />

          <SsoDivider>or with email</SsoDivider>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field
              label="Email"
              type="email"
              icon={Mail}
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <Field
              label="Password"
              type="password"
              icon={Lock}
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
            />

            {error && (
              <div
                className="rounded-[10px] text-[13px] px-3 py-2.5"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              >
                {error}
              </div>
            )}

            <Btn type="submit" size="lg" iconRight={ArrowRight} full disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Btn>
          </form>
        </div>

        <div className="text-[13px] text-center" style={{ color: "var(--text-2)" }}>
          New here?{" "}
          <Link href="/signup" style={{ color: "var(--accent-600)", fontWeight: 600 }}>
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
