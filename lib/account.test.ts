import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { deleteAccount } from "@/lib/account";

type FakeOptions = {
  files?: string[];
  removeFails?: boolean;
  removeIgnored?: boolean;
  rpcFails?: boolean;
  signedOut?: boolean;
};

function fakeClient(options: FakeOptions = {}) {
  const stored = new Set(options.files ?? []);
  const calls: string[] = [];
  const client = {
    auth: {
      getUser: async () =>
        options.signedOut
          ? { data: { user: null }, error: null }
          : { data: { user: { id: "user-1" } }, error: null },
      signOut: async () => {
        calls.push("signOut");
        return { error: null };
      },
    },
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string, { limit }: { limit: number }) => {
          calls.push(`list:${bucket}:${prefix}`);
          return {
            data: [...stored].slice(0, limit).map((name) => ({ name })),
            error: null,
          };
        },
        remove: async (paths: string[]) => {
          calls.push(`remove:${paths.length}`);
          if (options.removeFails) return { data: null, error: new Error("denied") };
          if (options.removeIgnored) return { data: [], error: null };
          paths.forEach((path) => stored.delete(path.split("/")[1]));
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
    rpc: async (name: string) => {
      calls.push(`rpc:${name}`);
      return { error: options.rpcFails ? new Error("rpc failed") : null };
    },
  };
  return { client: client as unknown as SupabaseClient, calls, stored };
}

describe("deleteAccount", () => {
  it("removes every recording in pages, then deletes the account and signs out", async () => {
    const files = Array.from({ length: 150 }, (_, index) => `${index}.wav`);
    const { client, calls, stored } = fakeClient({ files });

    await deleteAccount(client);

    expect(stored.size).toBe(0);
    expect(calls.filter((call) => call.startsWith("remove:"))).toEqual([
      "remove:100",
      "remove:50",
    ]);
    expect(calls.at(0)).toBe("list:recordings:user-1");
    expect(calls.slice(-2)).toEqual(["rpc:delete_own_account", "signOut"]);
  });

  it("deletes an account that has no recordings", async () => {
    const { client, calls } = fakeClient();
    await deleteAccount(client);
    expect(calls).toEqual([
      "list:recordings:user-1",
      "rpc:delete_own_account",
      "signOut",
    ]);
  });

  it("stops before touching the account when recordings cannot be removed", async () => {
    const { client, calls } = fakeClient({ files: ["a.wav"], removeFails: true });
    await expect(deleteAccount(client)).rejects.toThrow();
    expect(calls).not.toContain("rpc:delete_own_account");
  });

  it("does not loop forever when storage silently keeps the files", async () => {
    const { client, calls } = fakeClient({ files: ["a.wav"], removeIgnored: true });
    await expect(deleteAccount(client)).rejects.toThrow();
    expect(calls).not.toContain("rpc:delete_own_account");
  });

  it("stays signed in when the account deletion fails", async () => {
    const { client, calls } = fakeClient({ rpcFails: true });
    await expect(deleteAccount(client)).rejects.toThrow();
    expect(calls).not.toContain("signOut");
  });

  it("refuses when nobody is signed in", async () => {
    const { client, calls } = fakeClient({ signedOut: true });
    await expect(deleteAccount(client)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
