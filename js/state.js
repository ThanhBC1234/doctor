// Store trạng thái đơn giản kiểu pub/sub: set() gộp thay đổi rồi báo cho người nghe.

/**
 * @template T
 * @param {T} initial
 */
export function createStore(initial) {
  let state = { ...initial };
  const subs = new Set();
  let scheduled = false;

  function notify() {
    scheduled = false;
    for (const fn of subs) {
      try { fn(state); } catch (err) { console.error('[state] lỗi khi cập nhật giao diện', err); }
    }
  }

  return {
    /** @returns {T} */
    get: () => state,
    /** @param {Partial<T>} patch */
    set(patch) {
      state = { ...state, ...patch };
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(notify);
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
