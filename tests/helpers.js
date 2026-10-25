import { Chess } from '../vendor/chess.js/chess.js';

/** Thế cờ từ FEN hoặc từ chuỗi SAN cách nhau bởi dấu cách. */
export function position({ fen, moves } = {}) {
  const c = fen ? new Chess(fen) : new Chess();
  if (moves) for (const m of moves.split(/\s+/).filter(Boolean)) c.move(m);
  return c;
}

/** PRNG có hạt giống để test lặp lại được. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sinh danh sách thế cờ từ các ván ngẫu nhiên. */
export function randomPositions({ games = 20, plies = 80, seed = 7 } = {}) {
  const rand = rng(seed);
  const out = [];
  for (let g = 0; g < games; g++) {
    const c = new Chess();
    for (let p = 0; p < plies && !c.isGameOver(); p++) {
      out.push(c.fen());
      const ms = c.moves();
      c.move(ms[Math.floor(rand() * ms.length)]);
    }
  }
  return out;
}
