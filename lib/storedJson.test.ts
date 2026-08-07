import { z } from "zod";
import { describe, expect, it } from "vitest";
import { parseStoredJson } from "@/lib/storedJson";

const schema = z.object({ count: z.number() });

describe("parseStoredJson", () => {
  it("returns typed stored data", () => {
    expect(parseStoredJson('{"count":2}', schema)).toEqual({ count: 2 });
  });

  it("rejects malformed and shape-drifted data", () => {
    expect(parseStoredJson("not-json", schema)).toBeNull();
    expect(parseStoredJson('{"count":"two"}', schema)).toBeNull();
  });
});
