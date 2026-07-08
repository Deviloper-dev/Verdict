"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../../lib/auth/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  async function signInWithGoogle() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">Verdict</span>
      </div>
      <h1>Settle it once.</h1>
      <p className="muted">
        The record of what your group actually decided — sealed when everyone required has weighed in,
        provably unchanged forever after. Even the person running it can&rsquo;t rewrite history.
      </p>
      <div className="card" style={{ marginTop: "2rem" }}>
        {sent ? (
          <p className="notice">Magic link sent to {email}. Open it on this device to sign in.</p>
        ) : (
          <form onSubmit={sendMagicLink}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button type="submit">Send magic link</button>
            <button type="button" className="quiet" style={{ marginLeft: "0.6rem" }} onClick={signInWithGoogle}>
              Sign in with Google
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
