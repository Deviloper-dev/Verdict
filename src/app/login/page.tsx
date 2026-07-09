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

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createSupabaseBrowser();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else location.href = "/";
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) setError(error.message);
      else setNotice(`Check ${email} for a confirmation link to finish signing up.`);
    }
  }

  async function sendMagicLink() {
    setError(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setNotice(`Magic link sent to ${email}. Open it on this device to sign in.`);
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
        {notice ? (
          <p className="notice">{notice}</p>
        ) : (
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
            <button type="submit">{mode === "signin" ? "Sign in" : "Sign up"}</button>
            <button type="button" className="quiet" style={{ marginLeft: "0.6rem" }} onClick={signInWithGoogle}>
              Sign in with Google
            </button>
            <p className="small muted" style={{ marginTop: "0.8rem" }}>
              {mode === "signin" ? (
                <>
                  New here?{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); setError(null); setMode("signup"); }}>
                    Create an account
                  </a>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); setError(null); setMode("signin"); }}>
                    Sign in
                  </a>
                </>
              )}
              {" · "}
              Forgot your password or prefer no password?{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (email) sendMagicLink();
                  else setError("Enter your email first, then request a sign-in link.");
                }}
              >
                Email me a sign-in link instead
              </a>
            </p>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
