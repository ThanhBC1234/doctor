// Tiếng bíp bằng Web Audio API (không cần file âm thanh).

const CUES = {
  listen: [{ f: 880, ms: 120 }],
  done: [{ f: 440, ms: 120 }],
  error: [{ f: 220, ms: 250 }, { gap: 80 }, { f: 220, ms: 250 }],
  tick: [{ f: 660, ms: 80 }],
  double: [{ f: 660, ms: 100 }, { gap: 80 }, { f: 660, ms: 100 }],
  soft: [{ f: 520, ms: 40, gain: 0.05 }],
};

/**
 * @param {{ muted?: boolean }} [opts] muted: không phát tiếng, chỉ ghi log (chế độ test)
 */
export function createAudioCues(opts = {}) {
  let ctx = null;
  const log = [];

  function context() {
    if (ctx) return ctx;
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { ctx = null; }
    return ctx;
  }

  return {
    log,
    /** Gọi trong thao tác người dùng để trình duyệt cho phát âm thanh. */
    unlock() {
      if (opts.muted) return;
      const c = context();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    /** @param {'listen'|'done'|'error'|'tick'|'double'|'soft'} kind */
    play(kind) {
      log.push(kind);
      if (opts.muted) return;
      const c = context();
      const steps = CUES[kind];
      if (!c || !steps) return;
      let t = c.currentTime + 0.01;
      for (const s of steps) {
        if (s.gap) { t += s.gap / 1000; continue; }
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = s.f;
        gain.gain.setValueAtTime(s.gain ?? 0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + s.ms / 1000);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + s.ms / 1000 + 0.02);
        t += s.ms / 1000;
      }
    },
  };
}
