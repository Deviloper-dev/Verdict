import Link from "next/link";
import PasswordForm from "./PasswordForm";
import { createGroupAction, signOutAction, updateNameAction } from "./actions";
import { requireMember } from "../lib/auth/server";
import { getPool } from "../lib/db/pool";
import { listGroupsForMember } from "../lib/db/queries";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireMember();
  const groups = await listGroupsForMember(getPool(), me.id);
  const { error } = await searchParams;

  return (
    <main>
      <div className="topbar">
        <span className="wordmark">Verdict</span>
        <nav>
          <Link href="/search">Search</Link> ·{" "}
          <details className="name-editor">
            <summary title="Change your display name">{me.name}</summary>
            <form action={updateNameAction} className="card">
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                name="name"
                type="text"
                defaultValue={me.name}
                maxLength={80}
                required
              />
              <button type="submit">Save</button>
            </form>
          </details>{" "}
          ·{" "}
          <PasswordForm />{" "}
          ·{" "}
          <form action={signOutAction} style={{ display: "inline" }}>
            <button className="quiet" style={{ margin: 0, padding: "0.1rem 0.5rem", fontSize: "0.85rem" }}>
              Sign out
            </button>
          </form>
        </nav>
      </div>

      <h1>Your groups</h1>
      {groups.length === 0 && (
        <p className="muted">No groups yet. Start one, then add your friends by email.</p>
      )}
      {groups.map((g) => (
        <div className="card" key={g.id}>
          <h3>
            <Link href={`/g/${g.id}`}>{g.name}</Link>
          </h3>
          <p className="small muted">
            {g.member_count} members ·{" "}
            {g.open_polls > 0 ? (
              <span style={{ color: "var(--orange)" }}>{g.open_polls} open case{g.open_polls > 1 ? "s" : ""}</span>
            ) : (
              "no open cases"
            )}{" "}
            · {g.record_count} sealed verdict{g.record_count === 1 ? "" : "s"}
          </p>
        </div>
      ))}

      <div className="card" style={{ marginTop: "2rem" }}>
        <h3>Start a group</h3>
        <form action={createGroupAction}>
          <label htmlFor="name">Group name</label>
          <input id="name" name="name" type="text" placeholder="College Friends" required />
          <button type="submit">Create group</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
