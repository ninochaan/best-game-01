// Procedural sound effects: every noise Neon Swarm makes is synthesized with WebAudio
// oscillators and filtered noise — there are no audio files. The context is created lazily on
// the first user gesture (browsers refuse sound before one), every effect is short and quiet,
// and M mutes the master gain. In screenshot mode nothing here is ever unlocked, so the
// stills stay silent and deterministic.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let lastShoot = 0;
  let lastLance = 0;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function ready() {
    return ctx !== null && !muted;
  }

  /** One oscillator blip: type, start/end frequency, duration, volume, optional delay. */
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (!ready()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** One burst of filtered white noise (explosions, impacts). */
  function noise(dur, vol, cutoff, delay = 0) {
    if (!ready()) return;
    const t0 = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(60, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    source.connect(filter).connect(gain).connect(master);
    source.start(t0);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.32;
      return muted;
    },
    /** The player's gun: throttled so a held trigger is a purr, not a buzz. */
    shoot() {
      if (!ready()) return;
      const now = performance.now();
      if (now - lastShoot < 55) return;
      lastShoot = now;
      tone('square', 880, 320, 0.07, 0.05);
    },
    hit() {
      tone('triangle', 300, 140, 0.05, 0.06);
    },
    /** The lance: a tearing zap, throttled like the gun. */
    lance() {
      if (!ready()) return;
      const now = performance.now();
      if (now - lastLance < 70) return;
      lastLance = now;
      tone('sawtooth', 1500, 180, 0.09, 0.06);
      tone('square', 2400, 300, 0.05, 0.03);
    },
    /** The nova ring going off: a bright two-note bloom with a breath of noise. */
    nova() {
      tone('triangle', 520, 990, 0.16, 0.1);
      tone('triangle', 780, 1320, 0.14, 0.07, 0.05);
      noise(0.12, 0.06, 2600);
    },
    /** A sniper's charged shot cracking past. */
    snipe() {
      tone('square', 1250, 240, 0.09, 0.07);
    },
    /** The Dreadnought enraging: a low roar under a rising snarl. */
    enrage() {
      tone('sawtooth', 82, 55, 0.7, 0.3);
      tone('sawtooth', 130, 260, 0.5, 0.16, 0.12);
      noise(0.5, 0.22, 500);
    },
    explosion(big = false) {
      noise(big ? 0.55 : 0.28, big ? 0.5 : 0.28, big ? 900 : 1400);
      tone('sine', big ? 160 : 220, 40, big ? 0.5 : 0.25, 0.3);
    },
    hurt() {
      tone('sawtooth', 220, 55, 0.3, 0.3);
      noise(0.2, 0.25, 700);
    },
    power() {
      tone('square', 520, 520, 0.07, 0.12);
      tone('square', 660, 660, 0.07, 0.12, 0.07);
      tone('square', 880, 880, 0.12, 0.12, 0.14);
    },
    bomb() {
      noise(0.8, 0.6, 500);
      tone('sine', 90, 28, 0.8, 0.5);
    },
    bossWarn() {
      tone('sawtooth', 140, 140, 0.16, 0.2);
      tone('sawtooth', 140, 140, 0.16, 0.2, 0.22);
      tone('sawtooth', 196, 196, 0.3, 0.2, 0.44);
    },
    ui() {
      tone('square', 700, 900, 0.06, 0.08);
    },
    /** The draft opening: a soft rising triad, the sound of a choice arriving. */
    draft() {
      tone('triangle', 440, 440, 0.12, 0.12);
      tone('triangle', 554, 554, 0.12, 0.12, 0.09);
      tone('triangle', 659, 659, 0.2, 0.12, 0.18);
    },
    over() {
      tone('triangle', 392, 392, 0.22, 0.2);
      tone('triangle', 311, 311, 0.22, 0.2, 0.22);
      tone('triangle', 233, 220, 0.55, 0.22, 0.44);
    },
  };
}
