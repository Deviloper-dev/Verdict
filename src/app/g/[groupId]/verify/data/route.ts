import { NextResponse } from "next/server";
import { requireMember } from "../../../../../lib/auth/server";
import { loadChain } from "../../../../../lib/db/chain";
import { getPool } from "../../../../../lib/db/pool";
import { isGroupMember } from "../../../../../lib/db/queries";

export async function GET(_request: Request, context: { params: Promise<{ groupId: string }> }) {
  const me = await requireMember();
  const { groupId } = await context.params;
  if (!(await isGroupMember(getPool(), groupId, me.id))) {
    return NextResponse.json({ error: "not a member of this group" }, { status: 403 });
  }
  const records = await loadChain(getPool(), groupId);

  // Public anchor (M4): fetched fresh from the GitHub anchor repo when configured,
  // e.g. ANCHOR_RAW_BASE_URL=https://raw.githubusercontent.com/you/verdict/main
  let anchor: { seq: number; this_hash: string; anchored_at?: string } | null = null;
  const base = process.env.ANCHOR_RAW_BASE_URL;
  if (base) {
    try {
      const res = await fetch(`${base}/anchors/${groupId}/latest.json`, { cache: "no-store" });
      if (res.ok) anchor = await res.json();
    } catch {
      // Unreachable anchor host: report "no anchor" rather than failing verification.
    }
  }
  return NextResponse.json({ group_id: groupId, records, anchor });
}
