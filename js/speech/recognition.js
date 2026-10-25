// Bọc Web Speech API (SpeechRecognition). Mỗi lần nghe tạo một phiên mới: ổn định hơn dùng lại.
// Truy cập API qua một điểm duy nhất (getRecognitionCtor) để test thay bằng bản giả.
//
// Phòng thủ với hành vi thật của trình duyệt:
//  - Safari có thể bắn kết quả tạm (isFinal=false) dù interimResults=false: chỉ dùng khi không có kết quả cuối.
//  - onend đôi khi không bao giờ tới (sau stop/abort, hoặc khi tab bị ẩn): có hẹn giờ tự dọn để micro không "kẹt".
//  - Kết quả/lỗi tới muộn sau khi phiên đã đóng bị bỏ qua (không bao giờ được xử lý thành nước đi).
//  - Micro thật bắt đầu thu sau start() 100–500 ms: tiếng bíp "đang nghe" chỉ phát khi trình duyệt bắt đầu thu.

export function getRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * @param {{
 *   lang?: string,
 *   timeoutMs?: number,      // tự dừng nghe sau khoảng này
 *   endGraceMs?: number,     // sau khi dừng, chờ onend tối đa chừng này rồi tự dọn
 *   startGraceMs?: number,   // nếu trình duyệt không báo đã bắt đầu thu, coi như đã bắt đầu sau chừng này
 *   onStart?: () => void,    // micro thật sự đang thu
 *   onResult: (alternatives: string[]) => void,
 *   onNoSpeech?: () => void,
 *   onError?: (code: string) => void,   // kể cả 'no-match' (nghe thấy nhưng không nhận ra chữ) và 'start-failed'
 *   onEnd?: () => void,
 * }} opts
 */
export function createRecognizer(opts) {
  let lang = opts.lang || 'vi-VN';
  const timeoutMs = opts.timeoutMs || 8000;
  const endGraceMs = opts.endGraceMs ?? 2000;
  const startGraceMs = opts.startGraceMs ?? 500;
  let current = null;

  function cleanup(session) {
    clearTimeout(session.timer);
    clearTimeout(session.killTimer);
    clearTimeout(session.startTimer);
    if (current === session) current = null;
  }

  function started(session) {
    if (session.started || session.finished) return;
    session.started = true;
    clearTimeout(session.startTimer);
    opts.onStart?.();
  }

  /** Kết thúc phiên (từ onend thật hoặc hẹn giờ tự dọn): gọi callback đúng một lần. */
  function finish(session) {
    if (session.finished) return;
    session.finished = true;
    cleanup(session);
    if (!session.gotResult && !session.aborted && !session.failed) {
      if (session.interim) {
        session.gotResult = true;
        opts.onResult(session.interim);
      } else if (session.nomatch) {
        opts.onError?.('no-match');
      } else {
        opts.onNoSpeech?.();
      }
    }
    opts.onEnd?.();
  }

  function armKillTimer(session, delay) {
    clearTimeout(session.killTimer);
    session.killTimer = setTimeout(() => finish(session), delay);
  }

  /** Ghép các đoạn đã chốt (một số trình duyệt chia câu thành nhiều kết quả) + các phương án của đoạn cuối. */
  function collectAlternatives(results) {
    const list = Array.from(results || []);
    const finals = list.filter((r) => r && r.isFinal !== false);
    const last = list[list.length - 1];
    if (!last) return { alts: [], final: false };
    const prefix = finals.slice(0, -1).map((r) => r[0]?.transcript?.trim()).filter(Boolean).join(' ');
    const alts = [];
    for (let i = 0; i < last.length; i++) {
      const t = last[i]?.transcript?.trim();
      if (t) alts.push(prefix ? `${prefix} ${t}` : t);
    }
    return { alts, final: last.isFinal !== false };
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
      const session = {
        rec, gotResult: false, aborted: false, failed: false, finished: false, started: false, nomatch: false,
        interim: null, timer: null, killTimer: null, startTimer: null,
      };
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 3;

      rec.onaudiostart = () => started(session);
      rec.onstart = () => started(session);
      rec.onresult = (e) => {
        if (session.finished || session.aborted || session.gotResult) return;
        const { alts, final } = collectAlternatives(e.results);
        if (!alts.length) return;
        if (!final) {
          session.interim = alts;
          return;
        }
        session.gotResult = true;
        opts.onResult(alts);
        // Đã có kết quả: nếu onend không tới, tự đóng phiên để micro có thể mở lại.
        armKillTimer(session, endGraceMs);
      };
      rec.onnomatch = () => { session.nomatch = true; };
      rec.onerror = (e) => {
        if (session.finished || session.aborted) return;
        const code = e?.error || 'unknown';
        if (code === 'aborted') return;
        if (code === 'no-speech') return;
        session.failed = true;
        console.error('[recognition] lỗi', code);
        opts.onError?.(code);
        armKillTimer(session, endGraceMs);
      };
      rec.onend = () => finish(session);

      current = session;
      try {
        rec.start();
      } catch (err) {
        console.error('[recognition] không bắt đầu được', err);
        cleanup(session);
        current = null;
        opts.onError?.('start-failed');
        return false;
      }
      session.timer = setTimeout(() => {
        try { rec.stop(); } catch { /* bỏ qua */ }
        armKillTimer(session, endGraceMs);
      }, timeoutMs);
      session.startTimer = setTimeout(() => started(session), startGraceMs);
      return true;
    },

    /** Dừng và xử lý những gì đã nghe được. */
    stop() {
      if (!current) return;
      const s = current;
      try { s.rec.stop(); } catch { /* bỏ qua */ }
      armKillTimer(s, endGraceMs);
    },

    /** Hủy, bỏ qua kết quả. */
    abort() {
      if (!current) return;
      const s = current;
      s.aborted = true;
      try { s.rec.abort(); } catch { /* bỏ qua */ }
      // Một số trình duyệt không bắn onend sau abort: tự dọn sớm.
      armKillTimer(s, Math.min(500, endGraceMs));
    },
  };
}
