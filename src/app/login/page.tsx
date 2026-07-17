"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../../lib/auth/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createSupabaseBrowser();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setBusy(false);
      } else {
        location.href = "/";
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
        setBusy(false);
      } else if (data.session) {
        // Email confirmation is disabled — the account is live right now.
        location.href = "/";
      } else {
        // Fallback: "Confirm email" is still enabled server-side.
        setNotice(`Check ${email} for a confirmation link to finish signing up.`);
        setBusy(false);
      }
    }
  }

  async function sendMagicLink() {
    if (!email) {
      setError("Enter your email above first, then request a sign-in link.");
      return;
    }
    setError(null);
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setNotice(`Sign-in link sent to ${email}. Open it on this device.`);
  }

  async function signInWithGoogle() {
    setBusy(true);
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
        {notice ? (
          <>
            <p className="notice">{notice}</p>
            <button type="button" className="quiet" onClick={() => setNotice(null)}>
              ← Back to sign in
            </button>
          </>
        ) : (
          <>
            <form onSubmit={submitPassword}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              />
              <button type="submit" disabled={busy} aria-busy={busy}>
                {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
              <p className="small muted" style={{ marginTop: "0.8rem" }}>
                {mode === "signin" ? (
                  <>
                    New here?{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setError(null);
                        setMode("signup");
                      }}
                    >
                      Create an account
                    </a>{" "}
                    — it&rsquo;s instant, no confirmation email.
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setError(null);
                        setMode("signin");
                      }}
                    >
                      Sign in
                    </a>
                  </>
                )}
              </p>
              {error && <p className="error">{error}</p>}
            </form>
            <div className="divider">or</div>
            <div className="alt-auth">
              <button type="button" className="quiet" onClick={signInWithGoogle} disabled={busy}>
                Sign in with Google
              </button>
              <button type="button" className="quiet" onClick={sendMagicLink} disabled={busy}>
                Email me a sign-in link
              </button>
            </div>
            <p className="small muted" style={{ marginTop: "0.6rem" }}>
              Forgot your password? The sign-in link gets you in — set a new password from the home page.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
