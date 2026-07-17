"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "../lib/auth/client";
import DetailsPopover from "./DetailsPopover";

/**
 * Sets or changes the signed-in user's password via Supabase Auth.
 * Lets magic-link/Google accounts adopt a password so future sign-ins
 * don't consume a rate-limited email.
 */
export default function PasswordForm() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setPassword("");
      setStatus("Password saved. You can now sign in with it.");
    }
  }

  return (
    <DetailsPopover summary="Password" title="Set or change your password">
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
        <button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {status && <p className="notice">{status}</p>}
        {error && <p className="error">{error}</p>}
      </form>
    </DetailsPopover>
  );
}
