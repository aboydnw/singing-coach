import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

async function bytes(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

describe("encodeWav", () => {
  it("writes a valid 16-bit PCM mono header at the given rate", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const view = await bytes(encodeWav(samples, 48000));

    expect(String.fromCharCode(...new Uint8Array(view.buffer, 0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...new Uint8Array(view.buffer, 8, 4))).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(view.byteLength).toBe(44 + samples.length * 2);
  });

  it("clamps out-of-range samples instead of wrapping", async () => {
    const view = await bytes(encodeWav(new Float32Array([2, -2]), 16000));
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it("round-trips amplitudes within one quantization step", async () => {
    const samples = new Float32Array([0.25, -0.75]);
    const view = await bytes(encodeWav(samples, 16000));
    expect(view.getInt16(44, true) / 0x7fff).toBeCloseTo(0.25, 3);
    expect(view.getInt16(46, true) / 0x8000).toBeCloseTo(-0.75, 3);
  });
});
