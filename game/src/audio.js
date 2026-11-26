// Ember Isles Airmail — all sound is synthesised with WebAudio: no audio
// files, no network. Engine drone, wind rush, ring chime, touchdown thud,
// crash burst and the mission jingle.

export function makeAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windSrc = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      started = true;
    } catch (e) {
      return false;
    }
    // Engine: two detuned saws through a low-pass, pitch follows throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55 * 1.5;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    osc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    osc2.start();
    engineOsc._twin = osc2;

    // Wind: looped noise buffer through a band-pass.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 480;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();
    return true;
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  return {
    // Call from the first user gesture.
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(m) {
      muted = m;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
    },
    get muted() {
      return muted;
    },
    // Continuous engine + wind, driven by throttle and speed each frame.
    update(throttle, speed, airborne) {
      if (!ctx || muted) return;
      const target = airborne || throttle > 0.05 ? 0.05 + throttle * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      const f = 42 + throttle * 68 + speed * 0.35;
      engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      engineOsc._twin.frequency.setTargetAtTime(f * 1.5, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + throttle * 700, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.16, speed * 0.0016), ctx.currentTime, 0.15);
    },
    ring() {
      blip(880, 0.35, 'sine', 0.22);
      blip(1318, 0.4, 'sine', 0.18, 0.09);
    },
    land() {
      blip(120, 0.25, 'triangle', 0.3);
      blip(65, 0.3, 'sine', 0.3, 0.03);
    },
    crash() {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      const dur = 0.7;
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      blip(70, 0.6, 'sine', 0.4);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.5, 'triangle', 0.2, i * 0.12));
    },
    click() {
      blip(660, 0.08, 'square', 0.08);
    },
  };
}
