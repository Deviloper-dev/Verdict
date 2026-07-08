import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db/pool";
import { OpenAIEmbedder } from "../../../lib/search/embedder";
import { embedPendingRecords } from "../../../lib/search/pipeline";

/** Retry hook for missed embeddings — cron-able (same token as the anchor export). */
export async function GET(request: Request) {
  const token = process.env.ANCHOR_EXPORT_TOKEN;
  if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const embedded = await embedPendingRecords(getPool(), new OpenAIEmbedder());
  return NextResponse.json({ embedded });
}
