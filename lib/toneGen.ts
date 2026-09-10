/** Reference tone playback, ported from tone_gen.py onto Web Audio.
 * Same waveform (0.5-amplitude sine per note), no server round trip. */

export function midiToHz(midiNote: number): number {
  return 440.0 * 2 ** ((midiNote - 69) / 12);
}

export function playSequence(
  midiNotes: number[],
  durationPerNoteS: number,
): { done: Promise<void>; stop: () => void } {
  const ctx = new AudioContext();
  void ctx.resume();
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  gain.connect(ctx.destination);

  const start = ctx.currentTime + 0.05;
  const rampS = 0.01;
  midiNotes.forEach((note, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToHz(note);
    const noteGain = ctx.createGain();
    const t0 = start + i * durationPerNoteS;
    const t1 = t0 + durationPerNoteS;
    noteGain.gain.setValueAtTime(0, t0);
    noteGain.gain.linearRampToValueAtTime(1, t0 + rampS);
    noteGain.gain.setValueAtTime(1, t1 - rampS);
    noteGain.gain.linearRampToValueAtTime(0, t1);
    osc.connect(noteGain);
    noteGain.connect(gain);
    osc.start(t0);
    osc.stop(t1);
  });

  let settled = false;
  const finish = async (resolve: () => void) => {
    if (!settled) {
      settled = true;
      await ctx.close();
      resolve();
    }
  };

  let stop: () => void = () => {};
  const totalS = midiNotes.length * durationPerNoteS + 0.1;
  const done = new Promise<void>((resolve) => {
    const timer = setTimeout(() => finish(resolve), totalS * 1000);
    stop = () => {
      clearTimeout(timer);
      void finish(resolve);
    };
  });

  return { done, stop };
}

export function playTimedSequence(
  events: Array<
    | { kind: "note"; midi: number; duration_s: number; dynamic?: number }
    | { kind: "rest"; duration_s: number }
  >,
): { done: Promise<void>; stop: () => void } {
  const ctx = new AudioContext();
  void ctx.resume();
  const output = ctx.createGain();
  output.gain.value = 0.5;
  output.connect(ctx.destination);
  const start = ctx.currentTime + 0.05;
  const rampS = 0.01;
  let offset = 0;
  for (const event of events) {
    if (event.kind === "note") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = midiToHz(event.midi);
      const noteGain = ctx.createGain();
      const t0 = start + offset;
      const t1 = t0 + event.duration_s;
      const level = event.dynamic ?? 1;
      noteGain.gain.setValueAtTime(0, t0);
      noteGain.gain.linearRampToValueAtTime(level, t0 + rampS);
      noteGain.gain.setValueAtTime(level, Math.max(t0 + rampS, t1 - rampS));
      noteGain.gain.linearRampToValueAtTime(0, t1);
      osc.connect(noteGain);
      noteGain.connect(output);
      osc.start(t0);
      osc.stop(t1);
    }
    offset += event.duration_s;
  }

  let settled = false;
  let stop: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    const finish = async () => {
      if (settled) return;
      settled = true;
      await ctx.close();
      resolve();
    };
    const timer = setTimeout(() => void finish(), (offset + 0.1) * 1000);
    stop = () => {
      clearTimeout(timer);
      void finish();
    };
  });
  return { done, stop };
}
