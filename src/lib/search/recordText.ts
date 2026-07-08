interface EmbeddableRecord {
  title: string;
  context: string;
  winning_option_id: string;
  options_snapshot: { id: string; label: string }[];
  participants_snapshot: { member_id: string; name: string }[];
  votes_snapshot: { participant_id: string; option_id: string; opinion: string }[];
}

/**
 * The text that represents a sealed record in embedding space:
 * the question, its context, what was decided, and every opinion —
 * so "what did we decide about splitting rent" matches on meaning.
 */
export function buildRecordText(r: EmbeddableRecord): string {
  const labelOf = new Map(r.options_snapshot.map((o) => [o.id, o.label]));
  const nameOf = new Map(r.participants_snapshot.map((p) => [p.member_id, p.name]));
  const lines = [
    r.title,
    r.context,
    `Decided: ${labelOf.get(r.winning_option_id) ?? ""}`,
    ...r.votes_snapshot.map(
      (v) => `${nameOf.get(v.participant_id) ?? "someone"} voted ${labelOf.get(v.option_id) ?? ""}: ${v.opinion}`
    ),
  ];
  return lines.filter(Boolean).join("\n");
}
