import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ duplicate: false }));
vi.mock("@/lib/serverAuth", () => ({
  authenticateRequest: async () => ({ userId: "owner", token: "synthetic" }),
}));
vi.mock("@/lib/costGuard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/costGuard")>()),
  consumeCostOperation: vi.fn(async () => undefined),
}));
vi.mock("@/lib/exerciseThreads", () => ({
  groupExerciseThreads: () => [
    { attemptIds: ["11111111-1111-4111-8111-111111111111"], attempts: [] },
  ],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const key of ["select", "eq", "in", "neq", "order", "limit", "update"])
        query[key] = () => query;
      query.single = async () => ({
        data: { id: "22222222-2222-4222-8222-222222222222", status: "in_progress" },
        error: null,
      });
      query.maybeSingle = async () => ({
        data: { id: "11111111-1111-4111-8111-111111111111" },
        error: null,
      });
      query.insert = async () => ({ error: state.duplicate ? { code: "23505" } : null });
      query.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: [], error: null });
      return query;
    },
  }),
}));
import { POST } from "@/app/api/practice/chat/route";
import { consumeCostOperation, CostLimitError } from "./costGuard";
const request = () =>
  new Request("https://test/api/practice/chat", {
    method: "POST",
    body: JSON.stringify({
      practice_session_id: "22222222-2222-4222-8222-222222222222",
      attempt_id: "11111111-1111-4111-8111-111111111111",
      user_message_id: "33333333-3333-4333-8333-333333333333",
      client_request_id: "44444444-4444-4444-8444-444444444444",
      message: "What should I focus on?",
    }),
  });
beforeEach(() => {
  state.duplicate = false;
  vi.stubEnv("OPENROUTER_API_KEY", "synthetic");
  vi.stubEnv("COACH_MODEL", "synthetic");
  vi.mocked(consumeCostOperation).mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("streaming chat admission", () => {
  it("does not contact the provider on duplicate request", async () => {
    state.duplicate = true;
    expect((await POST(request())).status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
    expect(consumeCostOperation).not.toHaveBeenCalled();
  });
  it.each([429, 503] as const)(
    "does not dispatch when quota gate returns %s",
    async (status) => {
      vi.mocked(consumeCostOperation).mockRejectedValueOnce(new CostLimitError(status));
      expect((await POST(request())).status).toBe(status);
      expect(consumeCostOperation).toHaveBeenCalledWith("owner", "chat");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("sets a provider output cap before streaming", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        'data: {"choices":[{"delta":{"content":"Focus"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
    const response = await POST(request());
    expect(await response.text()).toBe("Focus");
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.max_tokens).toBe(1024);
    expect(body.provider).toEqual({ require_parameters: true });
    expect(consumeCostOperation).toHaveBeenCalledOnce();
  });
});
