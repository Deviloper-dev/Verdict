export interface RecordOption {
  id: string;
  label: string;
}

export interface RecordParticipant {
  member_id: string;
  name: string;
  added_at: string; // ISO 8601 UTC
}

export interface RecordVote {
  participant_id: string;
  option_id: string;
  opinion: string;
  voted_at: string; // ISO 8601 UTC
}

/** The 13 hashed fields — the exact contract from PRD §6.3. */
export interface RecordFields {
  seq: number;
  group_id: string;
  poll_id: string;
  title: string;
  context: string;
  options: RecordOption[];
  participants: RecordParticipant[];
  votes: RecordVote[];
  winning_option_id: string;
  quorum_percent: number;
  finalized_at: string; // ISO 8601 UTC
  prev_hash: string;
  hash_version: number;
}

export type StoredRecord = RecordFields & { this_hash: string };

export interface AnchorPoint {
  seq: number;
  this_hash: string;
}

export type ChainFailure =
  | { kind: "hash_mismatch"; seq: number }
  | { kind: "link_broken"; seq: number }
  | { kind: "bad_genesis"; seq: number }
  | { kind: "seq_gap"; expected: number; found: number }
  | { kind: "unsupported_hash_version"; seq: number }
  | { kind: "anchor_mismatch"; seq: number }
  | { kind: "truncated"; anchorSeq: number; headSeq: number };

export interface VerifyResult {
  valid: boolean;
  checked: number;
  failures: ChainFailure[];
}
