"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../lib/auth/client";

/**
 * Sets or changes the signed-in user's password via Supabase Auth.
 * Lets magic-link/Google accounts adopt a password so future sign-ins
 * don't consume a rate-limited email.
 */
export default function PasswordForm() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else {
      setPassword("");
      setStatus("Password saved. You can now sign in with it.");
    }
  }

  return (
    <details className="name-editor">
      <summary title="Set or change your password">Password</summary>
      <form onSubmit={save} className="card">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 6 characters"
        />
        <button type="submit">Save</button>
        {status && <p className="notice">{status}</p>}
        {error && <p className="error">{error}</p>}
      </form>
    </details>
  );
}
