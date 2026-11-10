import { describe, it, expect, vi } from "vitest";
import { createPracticeService } from "./practice";
import { createJournal } from "./journal";
import { parsePublicConfig } from "./config";
const uid = "11111111-1111-4111-8111-111111111111";
const pid = "22222222-2222-4222-8222-222222222222";
const jid = "33333333-3333-4333-8333-333333333333";
const metadata = {
  reason: "Practice",
  activity_id: null,
  activity_version: null,
  transposition_semitones: null,
  reference_fallback: true,
};
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
}
function fixture() {
  const store = storage(),
    responses: unknown[] = [];
  const query: any = {
    then: (resolve: any) =>
      Promise.resolve({ data: responses.shift(), error: null }).then(resolve),
  };
  for (const key of [
    "select",
    "eq",
    "order",
    "limit",
    "maybeSingle",
    "single",
    "insert",
    "update",
  ])
    query[key] = vi.fn(() => query);
  const upload = vi.fn(async () => ({ error: null }));
  const client: any = {
    auth: {
      getUser: async () => ({ data: { user: { id: uid } }, error: null }),
      getSession: async () => ({
        data: { session: { user: { id: uid }, access_token: "test" } },
        error: null,
      }),
    },
    from: vi.fn(() => query),
    storage: { from: () => ({ upload, remove: async () => ({ error: null }) }) },
  };
  const fetcher = vi.fn();
  const api = createPracticeService(client, "https://example.test", {
    storage: store,
    randomUUID: () => jid,
    fetch: fetcher,
  });
  return { api, store, responses, query, upload, fetcher };
}
const practice = {
  id: pid,
  user_id: uid,
  status: "in_progress",
  started_at: "now",
  ended_at: null,
  starting_direction: "free_sing",
  learning_contract_json: null,
  summary_json: null,
  created_at: "now",
  updated_at: "now",
};
const request = {
  practice_session_id: pid,
  audio_key: uid + "/" + jid + ".wav",
  exercise_spec: null,
  proposal_metadata: metadata,
  parent_attempt_id: null,
  attempt_kind: "initial" as const,
};
const job = {
  id: jid,
  user_id: uid,
  practice_session_id: pid,
  audio_key: request.audio_key,
  status: "failed",
  exercise_spec_json: null,
  proposal_metadata_json: null,
  parent_attempt_id: null,
  attempt_kind: "initial",
  attempt_id: null,
  measurements_json: null,
  contour_json: null,
  workflow_run_id: null,
  error_code: null,
  error_message: null,
  created_at: "now",
  updated_at: "now",
  completed_at: null,
};
function wav() {
  const value = new Uint8Array(44);
  value.set([82, 73, 70, 70]);
  value.set([87, 65, 86, 69], 8);
  return value.buffer;
}
describe("native data safety", () => {
  it("fails closed without public config and rejects service JWTs", () => {
    expect(() => parsePublicConfig({})).toThrow();
    expect(() =>
      parsePublicConfig({ EXPO_PUBLIC_SUPABASE_ANON_KEY: "eyJservice-role" }),
    ).toThrow();
    const config = parsePublicConfig({
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
      EXPO_PUBLIC_SUPABASE_URL: "https://project.example",
      EXPO_PUBLIC_API_BASE_URL: "https://example.test",
    });
    expect(config.googleEnabled).toBe(false);
  });
  it("keeps journals account-scoped", async () => {
    const j = createJournal(storage(), "test");
    await j.write({ userId: uid, request, phase: "handoff_unknown", createdAt: "now" });
    expect(await j.read(pid)).toBeNull();
    expect((await j.read(uid))?.request.audio_key).toBe(request.audio_key);
  });
  it("never reposts an unknown handoff after restart", async () => {
    const f = fixture();
    await createJournal(f.store, "example.test").write({
      userId: uid,
      request,
      phase: "handoff_unknown",
      createdAt: "now",
    });
    f.responses.push(null, null);
    expect((await f.api.recoverSend()).pending?.phase).toBe("handoff_unknown");
    await expect(f.api.resumeHandoff()).rejects.toThrow("uncertain");
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("recovers a persisted durable job without uploading or posting", async () => {
    const f = fixture();
    await createJournal(f.store, "example.test").write({
      userId: uid,
      request,
      phase: "handoff_unknown",
      createdAt: "now",
    });
    f.responses.push(job);
    expect((await f.api.recoverSend()).job?.id).toBe(jid);
    expect((await f.api.recoverSend()).pending).toBeNull();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("preserves unknown acknowledgement and blocks duplicate Send", async () => {
    const f = fixture();
    f.responses.push(practice, [], [], null);
    f.fetcher.mockRejectedValue(new Error("network"));
    await expect(
      f.api.sendTake({ practiceId: pid, wav: wav(), spec: null, metadata }),
    ).rejects.toThrow("network");
    await expect(
      f.api.sendTake({ practiceId: pid, wav: wav(), spec: null, metadata }),
    ).rejects.toThrow("previous");
    expect(f.upload).toHaveBeenCalledTimes(1);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect((await createJournal(f.store, "example.test").read(uid))?.phase).toBe(
      "handoff_unknown",
    );
  });
  it("only announces durable after matching server acknowledgement", async () => {
    const f = fixture();
    f.responses.push(practice, [], []);
    f.fetcher.mockResolvedValue(new Response(JSON.stringify(job), { status: 202 }));
    const stage = vi.fn();
    await f.api.sendTake({ practiceId: pid, wav: wav(), spec: null, metadata }, stage);
    expect(stage.mock.calls.map((c) => c[0])).toEqual([
      "uploading",
      "handing_off",
      "durable",
    ]);
    expect(await createJournal(f.store, "example.test").read(uid)).toBeNull();
  });
  it("blocks ended practices before upload", async () => {
    const f = fixture();
    f.responses.push({ ...practice, status: "ended" }, [], []);
    await expect(
      f.api.sendTake({ practiceId: pid, wav: wav(), spec: null, metadata }),
    ).rejects.toThrow("Resolve");
    expect(f.upload).not.toHaveBeenCalled();
  });
});
