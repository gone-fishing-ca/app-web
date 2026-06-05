"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazy Supabase client. Module load never touches Supabase — the real client
 * is created on first access. That means:
 *   - prerender / build-time evaluation can't crash on missing env vars
 *   - runtime usage gets a clear, actionable error if config is missing
 *   - the client is still a singleton in normal use
 */
let _client: SupabaseClient | null = null;

function initClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (or in the " +
        "host's project env config).",
    );
  }
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) _client = initClient();
    const value = Reflect.get(_client, prop);
    // Bind methods so `this` resolves to the real client, not the proxy.
    return typeof value === "function" ? value.bind(_client) : value;
  },
});
