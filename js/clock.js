// Đồng hồ thi đấu hai bên (Fischer increment). Module thuần: thời gian lấy từ hàm now() truyền vào,
// nên test dùng đồng hồ giả, trình duyệt dùng performance.now().
//
// Tính bằng chênh lệch thời điểm, không cộng dồn theo setInterval, để không bị trôi khi tab ẩn.

/**
 * @param {{ baseMs:number, incrementMs?:number, now?:() => number, remaining?:{w:number,b:number} }} opts
 */
export function createClock(opts) {
  const now = opts.now || (() => Date.now());
  const inc = opts.incrementMs || 0;
  const remaining = { w: opts.baseMs, b: opts.baseMs, ...(opts.remaining || {}) };
  let active = null; // bên đang chạy giờ
  let runningSince = null; // null khi dừng hoặc tạm dừng
  let flagged = null;
  let flagReported = false; // tick() báo hết giờ đúng một lần, kể cả khi press() phát hiện trước

  function settle() {
    if (active && runningSince !== null) {
      const t = now();
      remaining[active] -= t - runningSince;
      runningSince = t;
    }
  }

  const api = {
    get active() { return active; },
    get running() { return runningSince !== null; },
    get flagged() { return flagged; },
    get incrementMs() { return inc; },
    get baseMs() { return opts.baseMs; },

    /** Bắt đầu chạy giờ cho một bên. */
    start(side) {
      settle();
      active = side;
      runningSince = now();
    },

    /** Bên đang đi bấm đồng hồ: cộng giây, chuyển sang bên kia. */
    press() {
      if (!active) return;
      settle();
      if (flagged) return;
      if (remaining[active] <= 0) {
        // Bấm đồng hồ khi đã hết giờ: thua giờ, không được cộng giây
        flagged = active;
        remaining[active] = 0;
        runningSince = null;
        return;
      }
      remaining[active] += inc;
      active = active === 'w' ? 'b' : 'w';
      runningSince = now();
    },

    pause() {
      settle();
      runningSince = null;
    },

    resume() {
      if (active && runningSince === null && !flagged) runningSince = now();
    },

    stop() {
      settle();
      runningSince = null;
      active = null;
    },

    /** Thời gian còn lại (ms, không âm). */
    time(side) {
      settle();
      return Math.max(0, remaining[side]);
    },

    setTime(side, ms) {
      settle();
      remaining[side] = ms;
    },

    /**
     * Gọi định kỳ. Trả về bên vừa hết giờ (một lần duy nhất), hoặc null.
     * @returns {'w'|'b'|null}
     */
    tick() {
      settle();
      if (!flagged && active && remaining[active] <= 0) {
        flagged = active;
        remaining[active] = 0;
        runningSince = null;
      }
      if (flagged && !flagReported) {
        flagReported = true;
        return flagged;
      }
      return null;
    },

    serialize() {
      settle();
      return { baseMs: opts.baseMs, incrementMs: inc, remaining: { ...remaining } };
    },
  };
  return api;
}

/** Danh sách kiểu đồng hồ có sẵn. id "none" là không tính giờ. */
export const TIME_CONTROLS = [
  { id: 'none', minutes: 0, increment: 0 },
  { id: '5+0', minutes: 5, increment: 0 },
  { id: '10+0', minutes: 10, increment: 0 },
  { id: '15+10', minutes: 15, increment: 10 },
  { id: '30+0', minutes: 30, increment: 0 },
  { id: 'custom', minutes: null, increment: null },
];

/** Chuỗi TimeControl cho PGN: "900+10" hoặc "-". */
export function pgnTimeControl(minutes, increment) {
  if (!minutes) return '-';
  return `${Math.round(minutes * 60)}+${increment || 0}`;
}
