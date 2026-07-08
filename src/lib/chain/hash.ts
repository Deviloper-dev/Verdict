import { canonicalJson } from "./canonical";
import type { RecordFields } from "./types";

export const HASH_VERSION = 1;

const HASHED_FIELDS = [
  "seq",
  "group_id",
  "poll_id",
  "title",
  "context",
  "options",
  "participants",
  "votes",
  "winning_option_id",
  "quorum_percent",
  "finalized_at",
  "prev_hash",
  "hash_version",
] as const;

export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function genesisHash(groupId: string): Promise<string> {
  return sha256Hex(`verdict-genesis:${groupId}`);
}

export async function computeRecordHash(fields: RecordFields): Promise<string> {
  if (fields.hash_version !== HASH_VERSION) {
    throw new Error(`Unsupported hash_version ${fields.hash_version}; this build supports ${HASH_VERSION}`);
  }
  const picked: Record<string, unknown> = {};
  for (const key of HASHED_FIELDS) picked[key] = fields[key];
  return sha256Hex(canonicalJson(picked));
}
