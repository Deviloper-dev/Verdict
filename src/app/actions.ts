"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "../lib/auth/server";
import { addGroupMember, createGroup } from "../lib/db/groups";
import { updateMemberName } from "../lib/db/members";
import { getPool } from "../lib/db/pool";
import { addParticipant, createPoll, removeParticipant, withdrawPoll } from "../lib/db/polls";
import { isGroupMember } from "../lib/db/queries";
import { castVote } from "../lib/db/votes";

function message(err: unknown): string {
  return err instanceof Error ? err.message : "something went wrong";
}

function backWithError(path: string, err: unknown): never {
  redirect(`${path}?error=${encodeURIComponent(message(err))}`);
}

export async function createGroupAction(formData: FormData): Promise<void> {
  const me = await requireMember();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) backWithError("/", new Error("give the group a name"));
  let groupId: string;
  try {
    groupId = (await createGroup(getPool(), { name, created_by: me.id })).id;
  } catch (err) {
    backWithError("/", err);
  }
  redirect(`/g/${groupId}`);
}

export async function addMemberByEmailAction(groupId: string, formData: FormData): Promise<void> {
  const me = await requireMember();
  const path = `/g/${groupId}`;
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  try {
    if (!(await isGroupMember(getPool(), groupId, me.id))) throw new Error("not your group");
    const found = await getPool().query("select id from members where lower(email) = $1", [email]);
    if (found.rows.length === 0) {
      throw new Error(`${email} hasn't signed in to Verdict yet — ask them to sign in once first`);
    }
    await addGroupMember(getPool(), { group_id: groupId, member_id: found.rows[0].id });
  } catch (err) {
    backWithError(path, err);
  }
  revalidatePath(path);
  redirect(path);
}

export async function createPollAction(groupId: string, formData: FormData): Promise<void> {
  const me = await requireMember();
  const newPath = `/g/${groupId}/polls/new`;
  const title = String(formData.get("title") ?? "").trim();
  const context = String(formData.get("context") ?? "").trim();
  const quorum = Number(formData.get("quorum_percent"));
  const optionLabels = String(formData.get("options") ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const participantIds = formData.getAll("participants").map(String);

  let pollId: string;
  try {
    if (!title) throw new Error("the debate needs a title");
    const poll = await createPoll(getPool(), {
      group_id: groupId,
      created_by: me.id,
      title,
      context,
      quorum_percent: quorum,
      option_labels: optionLabels,
      participant_member_ids: participantIds.length > 0 ? participantIds : undefined,
    });
    pollId = poll.id;
  } catch (err) {
    backWithError(newPath, err);
  }
  redirect(`/g/${groupId}/p/${pollId}`);
}

export async function castVoteAction(groupId: string, pollId: string, formData: FormData): Promise<void> {
  const me = await requireMember();
  const path = `/g/${groupId}/p/${pollId}`;
  const optionId = String(formData.get("option_id") ?? "");
  const opinion = String(formData.get("opinion") ?? "");
  let sealedSeq: number | undefined;
  try {
    if (!optionId) throw new Error("pick an option");
    const result = await castVote(getPool(), {
      poll_id: pollId,
      member_id: me.id,
      option_id: optionId,
      opinion,
    });
    if (result.finalized) {
      sealedSeq = result.record!.seq;
      // Fire-and-forget: sealing never waits on the embedding provider.
      const { embedPendingRecords } = await import("../lib/search/pipeline");
      const { OpenAIEmbedder } = await import("../lib/search/embedder");
      void embedPendingRecords(getPool(), new OpenAIEmbedder()).catch(() => {});
    }
  } catch (err) {
    backWithError(path, err);
  }
  revalidatePath(path);
  if (sealedSeq !== undefined) redirect(`/g/${groupId}/records/${sealedSeq}`);
  redirect(path);
}

export async function addParticipantAction(
  groupId: string,
  pollId: string,
  formData: FormData
): Promise<void> {
  const me = await requireMember();
  const path = `/g/${groupId}/p/${pollId}`;
  try {
    await addParticipant(getPool(), {
      poll_id: pollId,
      member_id: String(formData.get("member_id") ?? ""),
      actor_id: me.id,
    });
  } catch (err) {
    backWithError(path, err);
  }
  revalidatePath(path);
  redirect(path);
}

export async function removeParticipantAction(
  groupId: string,
  pollId: string,
  formData: FormData
): Promise<void> {
  const me = await requireMember();
  const path = `/g/${groupId}/p/${pollId}`;
  try {
    await removeParticipant(getPool(), {
      poll_id: pollId,
      member_id: String(formData.get("member_id") ?? ""),
      actor_id: me.id,
    });
  } catch (err) {
    backWithError(path, err);
  }
  revalidatePath(path);
  redirect(path);
}

export async function withdrawPollAction(groupId: string, pollId: string): Promise<void> {
  const me = await requireMember();
  try {
    await withdrawPoll(getPool(), { poll_id: pollId, actor_id: me.id });
  } catch (err) {
    backWithError(`/g/${groupId}/p/${pollId}`, err);
  }
  redirect(`/g/${groupId}`);
}

export async function updateNameAction(formData: FormData): Promise<void> {
  const me = await requireMember();
  const name = String(formData.get("name") ?? "");
  try {
    await updateMemberName(getPool(), me.id, name);
  } catch (err) {
    backWithError("/", err);
  }
  revalidatePath("/");
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const { createSupabaseServer } = await import("../lib/auth/server");
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
