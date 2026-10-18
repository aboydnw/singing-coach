import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const PAGE = 100;

/** Permanently delete the signed-in singer: recordings first, then the account and its data.
 *
 * Recordings go first because Storage objects cannot be removed from SQL. If that step fails,
 * nothing else has been deleted and the singer can retry. */
export async function deleteAccount(client: SupabaseClient = supabase()): Promise<void> {
  const { data: auth, error: userError } = await client.auth.getUser();
  if (userError || !auth.user) throw userError ?? new Error("not signed in");
  const uid = auth.user.id;

  const bucket = client.storage.from("recordings");
  for (;;) {
    const { data: files, error: listError } = await bucket.list(uid, { limit: PAGE });
    if (listError) throw listError;
    if (!files || files.length === 0) break;
    const { data: removed, error: removeError } = await bucket.remove(
      files.map((file) => `${uid}/${file.name}`),
    );
    if (removeError) throw removeError;
    if (!removed || removed.length === 0) {
      throw new Error("recordings could not be removed");
    }
  }

  const { error: deleteError } = await client.rpc("delete_own_account");
  if (deleteError) throw deleteError;
  await client.auth.signOut({ scope: "local" });
}
