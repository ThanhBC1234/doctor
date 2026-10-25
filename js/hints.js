// Quyền trợ giúp mỗi ván: 1 lần xem bàn cờ, 2 lần hỏi vị trí quân. Module thuần.

export const DEFAULT_HINTS = { peeks: 1, locates: 2 };

/**
 * @param {{ peeksLeft?:number, locatesLeft?:number }} [saved]
 */
export function createHints(saved) {
  saved = saved && typeof saved === 'object' ? saved : {};
  let peeksLeft = Number.isInteger(saved.peeksLeft) ? saved.peeksLeft : DEFAULT_HINTS.peeks;
  let locatesLeft = Number.isInteger(saved.locatesLeft) ? saved.locatesLeft : DEFAULT_HINTS.locates;
  peeksLeft = Math.max(0, Math.min(DEFAULT_HINTS.peeks, peeksLeft));
  locatesLeft = Math.max(0, Math.min(DEFAULT_HINTS.locates, locatesLeft));

  return {
    get peeksLeft() { return peeksLeft; },
    get locatesLeft() { return locatesLeft; },
    /** @returns {boolean} true nếu còn lượt và đã trừ */
    usePeek() {
      if (peeksLeft <= 0) return false;
      peeksLeft--;
      return true;
    },
    useLocate() {
      if (locatesLeft <= 0) return false;
      locatesLeft--;
      return true;
    },
    reset() {
      peeksLeft = DEFAULT_HINTS.peeks;
      locatesLeft = DEFAULT_HINTS.locates;
    },
    serialize() {
      return { peeksLeft, locatesLeft };
    },
  };
}
