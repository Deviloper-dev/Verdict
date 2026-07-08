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
  // anchor: filled in by M4 (fetched from the public GitHub anchor repo).
  return NextResponse.json({ group_id: groupId, records, anchor: null });
}
