import { computeRecordHash, genesisHash, HASH_VERSION } from "../../src/lib/chain/hash";
import type { RecordFields, StoredRecord } from "../../src/lib/chain/types";

export async function buildChain(groupId: string, n: number): Promise<StoredRecord[]> {
  const out: StoredRecord[] = [];
  let prev = await genesisHash(groupId);
  for (let seq = 1; seq <= n; seq++) {
    const fields: RecordFields = {
      seq,
      group_id: groupId,
      poll_id: `poll-${seq}`,
      title: `Decision ${seq}`,
      context: "test context",
      options: [
        { id: "o1", label: "Yes" },
        { id: "o2", label: "No" },
      ],
      participants: [{ member_id: "m1", name: "A", added_at: "2026-07-08T00:00:00Z" }],
      votes: [{ participant_id: "pt1", option_id: "o1", opinion: "because", voted_at: "2026-07-08T01:00:00Z" }],
      winning_option_id: "o1",
      quorum_percent: 60,
      finalized_at: "2026-07-08T02:00:00Z",
      prev_hash: prev,
      hash_version: HASH_VERSION,
    };
    const this_hash = await computeRecordHash(fields);
    out.push({ ...fields, this_hash });
    prev = this_hash;
  }
  return out;
}
