import { NextResponse } from "next/server";
import { buildExport } from "../../../lib/anchor/export";
import { getPool } from "../../../lib/db/pool";

/** Called by the scheduled GitHub Action. Token-protected — the export
 *  contains every group's full history. */
export async function GET(request: Request) {
  const token = process.env.ANCHOR_EXPORT_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await buildExport(getPool()));
}
