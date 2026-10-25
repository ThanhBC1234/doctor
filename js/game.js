// Bọc chess.js: đi nước, lịch sử, kết thúc ván. Module thuần.

import { Chess } from '../vendor/chess.js/chess.js';

/** "e7e8q" → {from:'e7', to:'e8', promotion:'q'} */
export function parseUci(uci) {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(String(uci || '').trim());
  if (!m) return null;
  return m[3] ? { from: m[1], to: m[2], promotion: m[3] } : { from: m[1], to: m[2] };
}

export function toUci(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

/** Bên còn đủ lực để chiếu hết không (dùng khi đối phương hết giờ). */
export function hasMatingMaterial(chess, color) {
  let minors = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color || cell.type === 'k') continue;
      if (cell.type === 'p' || cell.type === 'r' || cell.type === 'q') return true;
      minors++;
    }
  }
  return minors >= 2;
}

const other = (c) => (c === 'w' ? 'b' : 'w');

/**
 * @param {{ uciMoves?: string[] }} [opts]
 */
export function createGame(opts = {}) {
  const chess = new Chess();
  let ended = null; // kết thúc do ngoài luật cờ: hết giờ, xin thua, thỏa thuận hòa

  for (const u of opts.uciMoves || []) {
    const mv = parseUci(u);
    if (!mv) throw new Error(`Nước UCI không hợp lệ: ${u}`);
    chess.move(mv); // ném lỗi nếu không hợp lệ: dữ liệu lưu hỏng thì không khôi phục
  }

  const api = {
    chess,
    fen: () => chess.fen(),
    turn: () => chess.turn(),
    board: () => chess.board(),
    legalMoves: () => chess.moves({ verbose: true }),
    history: () => chess.history({ verbose: true }),
    plyCount: () => chess.history().length,
    fullmoveNumber: () => chess.moveNumber(),
    uciMoves: () => chess.history({ verbose: true }).map(toUci),
    lastMove: () => {
      const h = chess.history({ verbose: true });
      return h[h.length - 1] || null;
    },
    lastMoveBy(color) {
      const h = chess.history({ verbose: true });
      for (let i = h.length - 1; i >= 0; i--) if (h[i].color === color) return h[i];
      return null;
    },

    /**
     * Đi một nước. Nhận object {from,to,promotion}, chuỗi UCI, hoặc chuỗi SAN.
     * @returns {object|null} nước verbose hoặc null nếu không hợp lệ
     */
    move(input) {
      if (ended || chess.isGameOver()) return null;
      let arg = input;
      if (typeof input === 'string') arg = parseUci(input) || input;
      try {
        return chess.move(arg);
      } catch {
        return null;
      }
    },

    /** Thử SAN đúng chuẩn (phân biệt hoa thường), trả về nước verbose hoặc null, không đi. */
    trySan(text) {
      try {
        const probe = new Chess(chess.fen());
        const m = probe.move(String(text).trim());
        return chess.moves({ verbose: true }).find((x) => x.from === m.from && x.to === m.to && x.promotion === m.promotion) || null;
      } catch {
        return null;
      }
    },

    resign(color) {
      ended = { over: true, reason: 'resign', winner: other(color) };
    },
    agreeDraw() {
      ended = { over: true, reason: 'agreement', winner: null };
    },
    timeout(color) {
      const opp = other(color);
      ended = { over: true, reason: 'timeout', winner: hasMatingMaterial(chess, opp) ? opp : null, flagged: color };
    },

    /** @returns {{over:boolean, reason:string|null, winner:'w'|'b'|null, flagged?:string}} */
    status() {
      if (ended) return { ...ended };
      if (chess.isCheckmate()) return { over: true, reason: 'checkmate', winner: other(chess.turn()) };
      if (chess.isStalemate()) return { over: true, reason: 'stalemate', winner: null };
      if (chess.isInsufficientMaterial()) return { over: true, reason: 'insufficient', winner: null };
      if (chess.isThreefoldRepetition()) return { over: true, reason: 'threefold', winner: null };
      if (chess.isDrawByFiftyMoves()) return { over: true, reason: 'fifty', winner: null };
      return { over: false, reason: null, winner: null };
    },

    resultCode() {
      const s = api.status();
      if (!s.over) return '*';
      if (s.winner === 'w') return '1-0';
      if (s.winner === 'b') return '0-1';
      return '1/2-1/2';
    },

    /** FEN sau n nửa nước (0 = thế khởi đầu), dùng cho xem lại ván. */
    fenAt(ply) {
      const h = chess.history({ verbose: true });
      if (ply <= 0) return h.length ? h[0].before : chess.fen();
      if (ply >= h.length) return chess.fen();
      return h[ply - 1].after;
    },
  };
  return api;
}
