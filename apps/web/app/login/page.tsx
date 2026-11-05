"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not configured");
  }
  return createBrowserClient(url, key);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const githubConfigured = process.env.NEXT_PUBLIC_GITHUB_OAUTH === "1";
  // #7: never send an empty or malformed address to the auth provider.
  const emailOk = EMAIL_RE.test(email.trim());

  async function magicLink() {
    if (!emailOk) {
      setNote("请输入有效的邮箱地址");
      return;
    }
    const normalized = email.trim();
    const { error } = await client().auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setNote(error ? error.message : `check your inbox: ${normalized}`);
  }

  async function github() {
    const { error } = await client().auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setNote(error.message);
    else router.push("/");
  }

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", maxWidth: 420, margin: "80px auto" }}>
      <h1>issue-pilot · sign in</h1>
      {githubConfigured && (
        <button type="button" onClick={github} style={{ margin: "8px 0", display: "block" }}>
          Continue with GitHub
        </button>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: 6 }}
        />
        <button type="button" onClick={magicLink} disabled={!emailOk}>
          Email magic link
        </button>
      </div>
      {note && <p style={{ color: "var(--muted)" }}>{note}</p>}
    </main>
  );
}
