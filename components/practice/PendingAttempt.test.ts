import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PendingAttempt } from "@/components/practice/PendingAttempt";
import type { AttemptJobRow } from "@/lib/attemptJobs";
import { initialContract } from "@/lib/practice";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function job(status: AttemptJobRow["status"]): AttemptJobRow {
  return {
    id: "job-1",
    user_id: "user-1",
    practice_session_id: "practice-1",
    audio_key: "user-1/take.wav",
    status,
    exercise_spec_json: null,
    proposal_metadata_json: '{"reason":"Hum the pattern once."}',
    parent_attempt_id: null,
    attempt_kind: "initial",
    attempt_id: null,
    measurements_json: null,
    contour_json: null,
    workflow_run_id: "run-1",
    error_code: status === "failed" ? "processing_failed" : null,
    error_message: status === "failed" ? "Analysis could not finish." : null,
    created_at: "2026-10-26T12:00:00Z",
    updated_at: "2026-10-26T12:00:00Z",
    completed_at: null,
  };
}

function render(status: AttemptJobRow["status"]) {
  return renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      { value: system },
      React.createElement(PendingAttempt, {
        job: job(status),
        contract: initialContract("coach_pick"),
        onRetry: () => undefined,
      }),
    ),
  );
}

describe("PendingAttempt", () => {
  it("says leaving is safe once a durable job is queued", () => {
    const markup = render("queued");
    expect(markup).toContain("Recording uploaded");
    expect(markup).toContain("You can leave this page");
    expect(markup).toContain("While you wait");
  });

  it("names the persisted processing stages", () => {
    expect(render("analyzing")).toContain("Listening to your take");
    expect(render("coaching")).toContain("Preparing your coaching");
  });

  it("offers recovery after terminal failure", () => {
    const markup = render("failed");
    expect(markup).toContain("This attempt needs another try");
    expect(markup).toContain("Retry processing");
  });
});
