/** Reject unexpected native output before offering Send; never transcode silently. */
export function assertMonoPcmWav(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, count: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + count));
  if (bytes.length < 44 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE")
    throw new Error("Expected WAV.");
  let format = false;
  let data = false;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const length = view.getUint32(offset + 4, true);
    const end = offset + 8 + length;
    if (end > bytes.length) throw new Error("Incomplete WAV.");
    if (ascii(offset, 4) === "fmt ") {
      if (
        length < 16 ||
        view.getUint16(offset + 8, true) !== 1 ||
        view.getUint16(offset + 10, true) !== 1 ||
        view.getUint16(offset + 22, true) !== 16 ||
        view.getUint16(offset + 20, true) !== 2 ||
        view.getUint32(offset + 12, true) < 8000
      )
        throw new Error("Expected mono PCM16.");
      format = true;
    }
    if (ascii(offset, 4) === "data") data = length > 0 && length % 2 === 0;
    offset = end + (length % 2);
  }
  if (!format || !data) throw new Error("Missing WAV audio.");
}
