import { describe, expect, it } from "vitest";
import { groupExerciseThreads } from "@/lib/exerciseThreads";
import { initialContract } from "@/lib/practice";
import type { SessionRow } from "@/lib/sessions";
import {
  activeAttemptJob,
  restoredAttemptJob,
  visibleAttemptJob,
  selectedJobExerciseAfterRefresh,
  attemptJobResumePoint,
  jobExerciseId,
  pendingGuidance,
  type AttemptJobRow,
} from "@/lib/attemptJobs";

function job(overrides: Partial<AttemptJobRow> = {}): AttemptJobRow {
  return {
    id: "job-1",
    user_id: "user-1",
    practice_session_id: "practice-1",
    audio_key: "user-1/take.wav",
    status: "queued",
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
    created_at: "2026-10-26T12:00:00Z",
    updated_at: "2026-10-26T12:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

function attempt(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "attempt-1",
    ts: "2026-10-26T11:00:00Z",
    exercise_type: "sustained_note",
    exercise_spec_json: null,
    proposal_metadata_json: null,
    measurements_json: "{}",
    coaching_md: "",
    coaching_json: null,
    audio_key: "user-1/old.wav",
    contour_json: null,
    practice_session_id: "practice-1",
    sequence_number: 1,
    parent_attempt_id: null,
    attempt_kind: "initial",
    ...overrides,
  };
}

describe("attempt jobs", () => {
  it("returns only the newest active job", () => {
    const jobs = [
      job({
        id: "done",
        status: "completed",
        completed_at: "2026-10-26T12:02:00Z",
        attempt_id: "attempt-1",
      }),
      job({ id: "active", status: "coaching", created_at: "2026-10-26T12:03:00Z" }),
    ];
    expect(activeAttemptJob(jobs)?.id).toBe("active");
  });

  it("maps a pending first attempt to its durable job id", () => {
    expect(jobExerciseId(job(), [])).toBe("job-job-1");
  });

  it("maps a retry job to its recorded exercise root", () => {
    const threads = groupExerciseThreads([
      attempt(),
      attempt({ id: "attempt-2", parent_attempt_id: "attempt-1", sequence_number: 2 }),
    ]);
    expect(
      jobExerciseId(
        job({ parent_attempt_id: "attempt-2", attempt_kind: "retry" }),
        threads,
      ),
    ).toBe("attempt-1");
  });

  it("uses a saved cue before proposal copy", () => {
    const contract = {
      ...initialContract("coach_pick"),
      tryCue: "Aim the first note before adding volume.",
    };
    expect(
      pendingGuidance(
        job({ proposal_metadata_json: '{"reason":"Sing softly"}' }),
        contract,
      ),
    ).toBe("Aim the first note before adding volume. Don’t record another attempt yet.");
  });

  it("falls back to proposal guidance and removes line breaks", () => {
    expect(
      pendingGuidance(
        job({ proposal_metadata_json: '{"reason":"Hum the pattern\\njust once."}' }),
        null,
      ),
    ).toBe("Hum the pattern just once. Don’t record another attempt yet.");
  });

  it("resumes failed coaching from its saved analysis checkpoint", () => {
    expect(
      attemptJobResumePoint(
        job({
          status: "failed",
          attempt_id: "attempt-1",
          measurements_json: '{"pitch_median_hz":220}',
          contour_json: '{"times":[]}',
        }),
      ),
    ).toEqual({ stage: "coaching", attemptId: "attempt-1" });
  });

  it("restarts analysis when a failed job has no complete checkpoint", () => {
    expect(attemptJobResumePoint(job({ status: "failed" }))).toEqual({
      stage: "analysis",
    });
  });
});

describe("practice hydration selection", () => {
  it("selects the failed first upload instead of opening a new draft", () => {
    const jobs = [job({ status: "failed" })];
    const threads = groupExerciseThreads([]);
    const restored = restoredAttemptJob(jobs);
    const selected = restored ? jobExerciseId(restored, threads) : null;
    expect(selected).toBe("job-job-1");
    expect(visibleAttemptJob(jobs, threads, selected)).toBe(jobs[0]);
    // Polling must not erase the synthetic job selection while no attempt exists.
    expect(selectedJobExerciseAfterRefresh(selected, jobs, threads)).toBe(selected);
  });

  it("restores failure even when another exercise has recorded attempts", () => {
    const jobs = [job({ status: "failed" })];
    const threads = groupExerciseThreads([attempt()]);
    const restored = restoredAttemptJob(jobs)!;
    expect(visibleAttemptJob(jobs, threads, jobExerciseId(restored, threads))).toBe(
      jobs[0],
    );
  });

  it("prefers active work over older failed jobs and ignores terminal jobs", () => {
    const failed = job({ status: "failed" });
    const queued = job({ id: "queued", status: "queued" });
    expect(restoredAttemptJob([failed, queued])).toBe(queued);
    expect(
      restoredAttemptJob([job({ status: "completed" }), job({ status: "abandoned" })]),
    ).toBeNull();
  });

  it("moves a selected job to its recorded exercise when analysis completes", () => {
    const saved = attempt({ id: "new-attempt", parent_attempt_id: null });
    const threads = groupExerciseThreads([saved]);
    const jobs = [job({ status: "completed", attempt_id: saved.id })];
    const selected = selectedJobExerciseAfterRefresh("job-job-1", jobs, threads);
    expect(selected).toBe(threads[0].id);
    expect(visibleAttemptJob(jobs, threads, selected)).toBeNull();
  });
});
