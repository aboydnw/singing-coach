import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  jobs: [] as Record<string, unknown>[],
  authenticated: true,
}));
vi.mock("@/lib/serverAuth", () => ({
  authenticateRequest: vi.fn(async () =>
    state.authenticated ? { userId: "user", token: "test" } : null,
  ),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: { id: "11111111-1111-4111-8111-111111111111", status: "in_progress" },
          error: null,
        }),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/serverSupabase", () => ({
  serviceSupabase: vi.fn(() => ({
    from: () => {
      let inserted: Record<string, unknown> | undefined;
      let update: Record<string, unknown> = {};
      const filters: [string, unknown][] = [];
      const result = async () => {
        if (inserted) {
          state.jobs.push(inserted);
          return { data: { ...inserted }, error: null };
        }
        const row = state.jobs.find((job) =>
          filters.every(([key, value]) => job[key] === value),
        );
        if (row) Object.assign(row, update);
        return { data: row ? { ...row } : null, error: null };
      };
      const query = {
        insert: (row: Record<string, unknown>) => {
          inserted = row;
          return query;
        },
        update: (fields: Record<string, unknown>) => {
          update = fields;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        select: () => query,
        single: result,
        maybeSingle: result,
      };
      return query;
    },
  })),
}));
vi.mock("workflow/api", () => ({ start: vi.fn(async () => ({ runId: "run-1" })) }));
vi.mock("@/workflows/processPracticeAttempt", () => ({
  processPracticeAttempt: vi.fn(),
}));

import { POST as create } from "@/app/api/practice/attempt-jobs/route";
import { POST as retry } from "@/app/api/practice/attempt-jobs/[id]/retry/route";
import { serviceSupabase } from "@/lib/serverSupabase";
import { start } from "workflow/api";

const payload = {
  practice_session_id: "11111111-1111-4111-8111-111111111111",
  audio_key: "user/original.wav",
  exercise_spec: null,
  proposal_metadata: {
    reason: "Free sing",
    activity_id: null,
    activity_version: null,
    transposition_semitones: null,
    reference_fallback: false,
  },
  parent_attempt_id: null,
  attempt_kind: "initial",
};
const request = () =>
  new Request("https://example.test", { method: "POST", body: JSON.stringify(payload) });
const retryRequest = (id: string) =>
  retry(request(), { params: Promise.resolve({ id }) });
const SECRET = "test-only-signing-secret-at-least-32-bytes";

beforeEach(() => {
  state.jobs = [];
  state.authenticated = true;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("attempt configuration recovery", () => {
  for (const secret of ["", "too-short"]) {
    it(
      "preserves uploaded audio through refresh and repaired retry: " + secret,
      async () => {
        vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", secret);
        const response = await create(request());
        expect(response.status).toBe(202);
        const created = await response.json();
        expect(created).toMatchObject({
          status: "failed",
          audio_key: payload.audio_key,
          error_code: "analysis_configuration_unavailable",
        });
        expect(start).not.toHaveBeenCalled();

        // A page reload obtains this job from the ledger, not component state.
        const restored = JSON.parse(JSON.stringify(state.jobs[0]));
        expect(restored.id).toBe(created.id);
        const beforeRetry = { ...restored };
        const blocked = await retryRequest(restored.id);
        expect(blocked.status).toBe(503);
        expect(state.jobs[0]).toEqual(beforeRetry);

        vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", SECRET);
        const resumed = await retryRequest(restored.id);
        expect(resumed.status).toBe(202);
        expect(await resumed.json()).toMatchObject({
          id: created.id,
          audio_key: payload.audio_key,
          status: "queued",
          workflow_run_id: "run-1",
          error_code: null,
          error_message: null,
        });
        expect(state.jobs).toHaveLength(1);
        expect(start).toHaveBeenCalledOnce();
        expect(start).toHaveBeenCalledWith(expect.any(Function), [created.id]);
      },
    );
  }
  it("starts normally with valid configuration", async () => {
    vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", SECRET);
    const response = await create(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      status: "queued",
      workflow_run_id: "run-1",
    });
    expect(state.jobs).toHaveLength(1);
    expect(start).toHaveBeenCalledOnce();
  });
  it("preserves analysis checkpoints when retrying an existing failed job", async () => {
    vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", SECRET);
    state.jobs.push({
      id: "old-job",
      user_id: "user",
      status: "failed",
      audio_key: payload.audio_key,
      attempt_id: "attempt",
      measurements_json: "{}",
    });
    const response = await retryRequest("old-job");
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      id: "old-job",
      attempt_id: "attempt",
      measurements_json: "{}",
      audio_key: payload.audio_key,
    });
    expect(state.jobs).toHaveLength(1);
  });
  it("keeps authentication ahead of configuration checks", async () => {
    state.authenticated = false;
    expect((await create(request())).status).toBe(401);
    expect(serviceSupabase).not.toHaveBeenCalled();
  });
  it("does not persist invalid requests", async () => {
    vi.stubEnv("ATTEMPT_JOB_SIGNING_SECRET", "");
    const response = await create(
      new Request("https://example.test", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
    expect(state.jobs).toHaveLength(0);
  });
});
