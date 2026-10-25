// Script chạy trong trang trước mọi script khác (page.addInitScript):
// thay SpeechRecognition và speechSynthesis bằng bản giả điều khiển được từ test.

export function installFakes() {
  const log = [];

  const fakeRec = {
    instances: [],
    active: null,
    starts: [], // trạng thái app tại mỗi lần start(): dùng để kiểm tra micro không bật sai lúc
    /** Bắn kết quả nhận dạng (nhiều phương án) cho phiên đang nghe. */
    emit(alternatives) {
      const rec = fakeRec.active;
      if (!rec) throw new Error('micro giả không đang nghe');
      const alts = (Array.isArray(alternatives) ? alternatives : [alternatives]).map((t) => ({ transcript: t, confidence: 0.9 }));
      const result = Object.assign(alts, { isFinal: true });
      fakeRec.active = null;
      rec.onresult?.({ results: [result], resultIndex: 0 });
      rec.onend?.();
    },
    /** Im lặng: bắn lỗi no-speech rồi kết thúc. */
    silence() {
      const rec = fakeRec.active;
      if (!rec) throw new Error('micro giả không đang nghe');
      fakeRec.active = null;
      rec.onerror?.({ error: 'no-speech' });
      rec.onend?.();
    },
  };

  class FakeSpeechRecognition {
    constructor() {
      this.lang = 'vi-VN';
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      fakeRec.instances.push(this);
    }
    start() {
      if (fakeRec.active) throw new Error('InvalidStateError: đã đang nghe');
      const state = window.__blindfold?.getState?.() || null;
      const ttsBusy = window.__fakeSynth.speaking;
      fakeRec.starts.push({ at: performance.now(), state, ttsBusy, lang: this.lang, maxAlternatives: this.maxAlternatives });
      fakeRec.active = this;
      setTimeout(() => this.onstart?.(), 0);
    }
    stop() {
      if (fakeRec.active !== this) return;
      fakeRec.active = null;
      setTimeout(() => { this.onerror?.({ error: 'no-speech' }); this.onend?.(); }, 0);
    }
    abort() {
      if (fakeRec.active !== this) return;
      fakeRec.active = null;
      setTimeout(() => { this.onerror?.({ error: 'aborted' }); this.onend?.(); }, 0);
    }
  }

  // speechSynthesis giả: mỗi câu "đọc" mất ~20 ms để lộ lỗi mở micro khi TTS chưa xong.
  const fakeSynth = {
    speaking: false,
    pending: false,
    paused: false,
    queue: [],
    spoken: [],
    _listeners: {},
    getVoices: () => [
      { name: 'Giọng Việt giả', lang: 'vi-VN', voiceURI: 'fake-vi', default: true, localService: true },
      { name: 'Fake English', lang: 'en-US', voiceURI: 'fake-en', default: false, localService: true },
    ],
    speak(u) {
      fakeSynth.queue.push(u);
      if (!fakeSynth.speaking) fakeSynth._next();
    },
    _next() {
      const u = fakeSynth.queue.shift();
      if (!u) { fakeSynth.speaking = false; return; }
      fakeSynth.speaking = true;
      if (u.text.trim()) fakeSynth.spoken.push(u.text);
      setTimeout(() => {
        u.onstart?.();
        setTimeout(() => {
          u.onend?.({});
          fakeSynth._next();
        }, 20);
      }, 0);
    },
    cancel() {
      const q = fakeSynth.queue.splice(0);
      for (const u of q) setTimeout(() => u.onerror?.({ error: 'canceled' }), 0);
    },
    pause() {},
    resume() {},
    addEventListener(type, fn) { (fakeSynth._listeners[type] ||= []).push(fn); },
    removeEventListener() {},
  };

  Object.defineProperty(window, 'SpeechRecognition', { value: FakeSpeechRecognition, configurable: true, writable: true });
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeSpeechRecognition, configurable: true, writable: true });
  Object.defineProperty(window, 'speechSynthesis', { value: fakeSynth, configurable: true, writable: true });
  if (!window.SpeechSynthesisUtterance) {
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  }
  window.__fakeRecognition = fakeRec;
  window.__fakeSynth = fakeSynth;
  window.__consoleErrors = log;
}
