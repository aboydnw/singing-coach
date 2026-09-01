import { describe, expect, it } from "vitest";
import { isRecorderBusy } from "@/components/Recorder";

describe("isRecorderBusy", () => {
  it("keeps navigation locked while a recording is being produced", () => {
    expect(isRecorderBusy({ phase: "requesting" })).toBe(true);
    expect(isRecorderBusy({ phase: "recording" })).toBe(true);
    expect(isRecorderBusy({ phase: "encoding" })).toBe(true);
    expect(isRecorderBusy({ phase: "uploading", fraction: 0.5 })).toBe(true);
  });

  it("releases navigation after idle, completion, or error", () => {
    expect(isRecorderBusy({ phase: "idle" })).toBe(false);
    expect(isRecorderBusy({ phase: "done", storageKey: "recording.wav" })).toBe(false);
    expect(isRecorderBusy({ phase: "error", message: "failed" })).toBe(false);
  });
});
