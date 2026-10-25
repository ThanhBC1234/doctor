// Bọc speechSynthesis: hàng đợi câu nói, mỗi câu trả về Promise xong khi đọc xong.
// Truy cập API trình duyệt qua một điểm duy nhất (getSynth) để test thay bằng bản giả.

const MAX_CHUNK = 140; // Chrome cắt câu dài (> ~15 giây) với giọng online: chia nhỏ
const START_WATCHDOG_MS = 5000;

export function getSynth() {
  return typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
}

function getUtteranceCtor() {
  return typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : null;
}

/** Chia câu dài thành đoạn ≤ 200 ký tự theo dấu chấm/chấm phẩy/phẩy, vì Chrome hay cắt câu dài. */
export function chunkText(text, max = MAX_CHUNK) {
  const s = String(text || '').trim();
  if (s.length <= max) return s ? [s] : [];
  const out = [];
  let rest = s;
  while (rest.length > max) {
    let cut = -1;
    for (const sep of ['. ', '; ', ', ', ' ']) {
      const i = rest.lastIndexOf(sep, max);
      if (i > 0) { cut = i + sep.length - 1; break; }
    }
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * @param {{ onSpeakingChange?: (speaking:boolean) => void, lang?: string }} [opts]
 */
export function createTts(opts = {}) {
  const synth = getSynth();
  const Utterance = getUtteranceCtor();
  const lang = opts.lang || 'vi-VN';
  const startWatchdogMs = opts.startWatchdogMs || START_WATCHDOG_MS;
  let voice = null;
  let rate = 1;
  let pending = 0;
  let chain = Promise.resolve();
  let generation = 0; // tăng khi cancel(): các câu đang chờ bị bỏ
  const log = [];
  const resolvers = new Set();
  const live = new Set(); // utterance đang đọc (xem speakChunk)

  function setSpeaking(delta) {
    const before = pending > 0;
    pending = Math.max(0, pending + delta);
    const after = pending > 0;
    if (before !== after) opts.onSpeakingChange?.(after);
  }

  function speakChunk(text, gen) {
    return new Promise((resolve) => {
      if (gen !== generation || !synth || !Utterance) { resolve(); return; }
      let done = false;
      let timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolvers.delete(finish);
        resolve();
      };
      resolvers.add(finish);
      let u;
      try {
        u = new Utterance(text);
        u.lang = voice?.lang || lang;
        u.rate = rate;
        if (voice) u.voice = voice;
      } catch (err) {
        // Giọng không hợp lệ: vẫn đọc bằng giọng mặc định theo ngôn ngữ, không làm hỏng ván.
        console.warn('[tts] không đặt được giọng', err);
        if (!u) { finish(); return; }
      }
      // Giữ tham chiếu tới utterance tới khi đọc xong: Chrome có thể dọn rác nó sớm và không bao giờ bắn onend.
      live.add(u);
      const done2 = () => { live.delete(u); finish(); };
      u.onend = done2;
      u.onerror = (e) => {
        if (e?.error && e.error !== 'interrupted' && e.error !== 'canceled') console.error('[tts] lỗi đọc', e.error);
        done2();
      };
      // Chrome đôi khi không bắn onend: chờ theo độ dài câu rồi tự xong. Chỉ tính giờ từ lúc THẬT SỰ bắt đầu
      // đọc (giọng online/Android có thể khởi động chậm 1–3 giây); nếu không bao giờ bắt đầu thì bỏ qua sau 5 giây.
      const durationMs = (text.length * 90) / rate + 1500;
      timer = setTimeout(() => {
        console.error('[tts] câu không bắt đầu đọc được', text.slice(0, 40));
        done2();
      }, startWatchdogMs);
      u.onstart = () => {
        clearTimeout(timer);
        timer = setTimeout(done2, durationMs);
      };
      try {
        // Chrome có thể kẹt ở trạng thái "paused" sau khi tab bị ẩn: resume() trước khi đọc là vô hại.
        if (typeof synth.resume === 'function') synth.resume();
        synth.speak(u);
      } catch (err) {
        console.error('[tts] speak thất bại', err);
        done2();
      }
    });
  }

  return {
    get supported() { return !!(synth && Utterance); },
    get speaking() { return pending > 0; },
    get log() { return log; },

    /**
     * Đọc một câu (xếp hàng sau các câu trước).
     * @returns {Promise<void>} xong khi đọc xong hoặc bị hủy
     */
    speak(text) {
      const t = String(text || '').trim();
      if (!t) return Promise.resolve();
      log.push(t);
      const gen = generation;
      setSpeaking(+1);
      const job = chain.then(async () => {
        for (const c of chunkText(t)) {
          if (gen !== generation) break;
          await speakChunk(c, gen);
        }
      });
      chain = job.catch(() => {});
      return job.finally(() => setSpeaking(-1));
    },

    /** Dừng ngay mọi câu đang đọc và đang chờ. */
    cancel() {
      generation++;
      try { synth?.cancel(); } catch { /* bỏ qua */ }
      for (const r of [...resolvers]) r();
      live.clear();
      // Chrome hay nuốt câu speak() ngay sau cancel(): câu kế tiếp chờ một nhịp ngắn.
      chain = new Promise((resolve) => setTimeout(resolve, 150));
    },

    /** Chrome Android / iOS cần một lần speak trong thao tác người dùng để mở khóa. */
    unlock() {
      if (!synth || !Utterance) return;
      try {
        synth.speak(new Utterance('')); // câu rỗng: kết thúc ngay, chỉ để trình duyệt ghi nhận thao tác người dùng
      } catch { /* bỏ qua */ }
    },

    setRate(r) { rate = Math.min(2, Math.max(0.5, Number(r) || 1)); },

    /** Danh sách giọng, giọng tiếng Việt lên trước. */
    getVoices() {
      if (!synth) return [];
      const voices = synth.getVoices() || [];
      const vi = voices.filter((v) => /^vi/i.test(v.lang));
      return [...vi, ...voices.filter((v) => !/^vi/i.test(v.lang))];
    },

    hasVietnameseVoice() {
      return this.getVoices().some((v) => /^vi/i.test(v.lang));
    },

    /** Chọn giọng theo voiceURI; rỗng = giọng tiếng Việt đầu tiên nếu có. */
    setVoice(uri) {
      const voices = this.getVoices();
      voice = voices.find((v) => v.voiceURI === uri) || voices.find((v) => /^vi/i.test(v.lang)) || null;
      return voice;
    },

    onVoicesChanged(fn) {
      if (!synth) return;
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', fn);
      else synth.onvoiceschanged = fn;
    },
  };
}
