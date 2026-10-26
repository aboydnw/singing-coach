import { describe, expect, it } from "vitest";
import { midiToHz, renderSequenceWav, renderTimedSequenceWav } from "@/lib/referenceTone";

const HEADER_BYTES = 44;

function ascii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(view.getUint8(offset + index)),
  ).join("");
}

async function wavView(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

function samples(view: DataView): number[] {
  return Array.from({ length: (view.byteLength - HEADER_BYTES) / 2 }, (_, index) =>
    view.getInt16(HEADER_BYTES + index * 2, true),
  );
}

function zeroCrossings(values: number[]): number {
  let crossings = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] <= 0 && values[index] > 0) crossings += 1;
  }
  return crossings;
}

describe("reference tone WAV synthesis", () => {
  it("writes a mono PCM16 WAV header with the requested duration", async () => {
    const blob = renderSequenceWav([69], 1, 8_000);
    const view = await wavView(blob);

    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(16_000);
    expect(blob.type).toBe("audio/wav");
  });

  it("renders an enveloped sine wave that starts and ends at silence", async () => {
    const values = samples(await wavView(renderSequenceWav([69], 0.25, 8_000)));

    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(0);
    expect(Math.max(...values)).toBeGreaterThan(10_000);
    expect(Math.min(...values)).toBeLessThan(-10_000);
    expect(midiToHz(69)).toBe(440);
  });

  it("places successive notes in their expected halves", async () => {
    const values = samples(await wavView(renderSequenceWav([69, 81], 0.25, 8_000)));
    const midpoint = values.length / 2;

    expect(zeroCrossings(values.slice(0, midpoint))).toBeCloseTo(110, -1);
    expect(zeroCrossings(values.slice(midpoint))).toBeCloseTo(220, -1);
  });

  it("keeps timed rests silent while preserving their duration", async () => {
    const values = samples(
      await wavView(
        renderTimedSequenceWav(
          [
            { kind: "note", midi: 69, duration_s: 0.1 },
            { kind: "rest", duration_s: 0.1 },
            { kind: "note", midi: 72, duration_s: 0.1 },
          ],
          8_000,
        ),
      ),
    );

    expect(values).toHaveLength(2_400);
    expect(values.slice(800, 1_600).every((sample) => sample === 0)).toBe(true);
  });

  it("rejects invalid notes, durations, and sample rates", () => {
    expect(() => renderSequenceWav([], 1)).toThrow("at least one event");
    expect(() => renderSequenceWav([Number.NaN], 1)).toThrow("finite MIDI note");
    expect(() => renderSequenceWav([60], 0)).toThrow("positive duration");
    expect(() => renderSequenceWav([60], 1, 0)).toThrow("sample rate");
  });
});
