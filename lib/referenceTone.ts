export type TimedToneEvent =
  | { kind: "note"; midi: number; duration_s: number; dynamic?: number }
  | { kind: "rest"; duration_s: number };

const HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;
const DEFAULT_SAMPLE_RATE = 44_100;
const PEAK_AMPLITUDE = 0.5;
const RAMP_SECONDS = 0.01;

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function renderSequenceWav(
  notes: number[],
  durationPerNoteS: number,
  sampleRate = DEFAULT_SAMPLE_RATE,
): Blob {
  return renderTimedSequenceWav(
    notes.map((midi) => ({ kind: "note", midi, duration_s: durationPerNoteS })),
    sampleRate,
  );
}

export function renderTimedSequenceWav(
  events: TimedToneEvent[],
  sampleRate = DEFAULT_SAMPLE_RATE,
): Blob {
  validate(events, sampleRate);
  const eventLengths = events.map((event) => Math.round(event.duration_s * sampleRate));
  const sampleCount = eventLengths.reduce((total, length) => total + length, 0);
  const dataBytes = sampleCount * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writeHeader(view, dataBytes, sampleRate);

  let cursor = 0;
  events.forEach((event, eventIndex) => {
    const eventSamples = eventLengths[eventIndex];
    if (event.kind === "note") {
      const frequency = midiToHz(event.midi);
      const level = Math.min(1, Math.max(0, event.dynamic ?? 1));
      const rampSamples = Math.max(
        1,
        Math.min(Math.round(RAMP_SECONDS * sampleRate), Math.floor(eventSamples / 2)),
      );
      for (let local = 0; local < eventSamples; local += 1) {
        const attack = Math.min(1, local / rampSamples);
        const release = Math.min(1, (eventSamples - 1 - local) / rampSamples);
        const envelope = Math.max(0, Math.min(attack, release));
        const phase = (2 * Math.PI * frequency * cursor) / sampleRate;
        const value = Math.sin(phase) * PEAK_AMPLITUDE * level * envelope;
        view.setInt16(
          HEADER_BYTES + cursor * BYTES_PER_SAMPLE,
          Math.round(value * 0x7fff),
          true,
        );
        cursor += 1;
      }
    } else {
      cursor += eventSamples;
    }
  });

  return new Blob([buffer], { type: "audio/wav" });
}

function validate(events: TimedToneEvent[], sampleRate: number): void {
  if (events.length === 0) throw new Error("reference tone needs at least one event");
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error("reference tone sample rate must be an integer from 8000 to 192000");
  }
  for (const event of events) {
    if (!Number.isFinite(event.duration_s) || event.duration_s <= 0) {
      throw new Error("reference tone events need a positive duration");
    }
    if (event.kind === "note" && !Number.isFinite(event.midi)) {
      throw new Error("reference tone events need a finite MIDI note");
    }
  }
}

function writeHeader(view: DataView, dataBytes: number, sampleRate: number): void {
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
