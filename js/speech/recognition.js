// Bọc Web Speech API (SpeechRecognition). Mỗi lần nghe tạo một phiên mới: ổn định hơn dùng lại.
// Truy cập API qua một điểm duy nhất (getRecognitionCtor) để test thay bằng bản giả.

export function getRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * @param {{
 *   lang?: string,
 *   timeoutMs?: number,
 *   onStart?: () => void,
 *   onResult: (alternatives: string[]) => void,
 *   onNoSpeech?: () => void,
 *   onError?: (code: string) => void,
 *   onEnd?: () => void,
 * }} opts
 */
export function createRecognizer(opts) {
  let lang = opts.lang || 'vi-VN';
  const timeoutMs = opts.timeoutMs || 8000;
  let current = null;

  function cleanup(session) {
    clearTimeout(session.timer);
    if (current === session) current = null;
  }

  return {
    isSupported: () => !!getRecognitionCtor(),
    get listening() { return !!current; },
    setLang(l) { lang = l; },

    /**
     * Bắt đầu nghe. Trên iOS phải gọi trực tiếp trong handler chạm/click (không sau await).
     * @returns {boolean} true nếu đã bắt đầu
     */
    start() {
      const Ctor = getRecognitionCtor();
      if (!Ctor || current) return false;
      const rec = new Ctor();
      const session = { rec, gotResult: false, aborted: false, failed: false, noSpeech: false, timer: null };
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 3;

      rec.onresult = (e) => {
        if (session.aborted) return;
        const res = e.results[e.results.length - 1];
        if (!res) return;
        const alts = [];
        for (let i = 0; i < res.length; i++) if (res[i]?.transcript) alts.push(res[i].transcript);
        if (!alts.length || session.gotResult) return;
        session.gotResult = true;
        opts.onResult(alts);
      };
      rec.onerror = (e) => {
        const code = e?.error || 'unknown';
        if (code === 'aborted') return;
        if (code === 'no-speech') { session.noSpeech = true; return; }
        session.failed = true;
        console.error('[recognition] lỗi', code);
        opts.onError?.(code);
      };
      rec.onend = () => {
        cleanup(session);
        if (!session.gotResult && !session.aborted && !session.failed) opts.onNoSpeech?.();
        opts.onEnd?.();
      };

      current = session;
      try {
        rec.start();
      } catch (err) {
        console.error('[recognition] không bắt đầu được', err);
        cleanup(session);
        opts.onError?.('start-failed');
        return false;
      }
      session.timer = setTimeout(() => {
        try { rec.stop(); } catch { /* bỏ qua */ }
      }, timeoutMs);
      opts.onStart?.();
      return true;
    },

    /** Dừng và xử lý những gì đã nghe được. */
    stop() {
      if (!current) return;
      try { current.rec.stop(); } catch { /* bỏ qua */ }
    },

    /** Hủy, bỏ qua kết quả. */
    abort() {
      if (!current) return;
      const s = current;
      s.aborted = true;
      try { s.rec.abort(); } catch { /* bỏ qua */ }
      // Một số trình duyệt không bắn onend sau abort: tự dọn.
      setTimeout(() => {
        if (current === s) {
          cleanup(s);
          opts.onEnd?.();
        }
      }, 500);
    },
  };
}
