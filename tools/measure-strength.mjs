// Đo sức mạnh từng mức Elo: mức mất điểm trung bình mỗi nước (centipawn) so với Stockfish
// đánh giá ở độ sâu 10, trên 100 thế cờ khai cuộc/trung cuộc. Chạy: node tools/measure-strength.mjs
// Dùng khi tinh chỉnh ELO_LOW_TABLE trong js/elo.js. Mất vài phút.
import { createRequire } from 'node:module';
import { createEngine } from '../js/engine.js';
import { Chess } from '../vendor/chess.js/chess.js';
import { randomPositions } from '../tests/helpers.js';
const require = createRequire(import.meta.url);
async function transport() {
  const sf = await require('../vendor/stockfish/stockfish-19-lite-single.js')();
  const ls = []; sf.listener = (l) => ls.forEach((f) => f(l));
  return { post: (c) => sf.processCommand(c), onLine: (f) => ls.push(f) };
}
const player = createEngine(await transport()); await player.init();
// Một bản engine cho cả hai vai: evaluate() tạm bật sức mạnh tối đa rồi trả lại mức cũ.
const judge = player;
const fens = randomPositions({ games: 100, plies: 16, seed: 99 }).filter((_, i) => i % 16 === 12);
for (const elo of [1000, 1150, 1300, 1350, 1800, 2500]) {
  await player.setStrength(elo);
  let loss = 0, blunders = 0, n = 0;
  for (const fen of fens) {
    const best = await judge.evaluate(fen, 10);
    const uci = await player.bestMove(fen);
    const c = new Chess(fen); c.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] });
    if (c.isGameOver()) { n++; continue; }
    const after = -(await judge.evaluate(c.fen(), 10));
    const l = Math.max(0, Math.min(1000, best - after));
    loss += l; if (l >= 200) blunders++; n++;
  }
  console.log(`Elo ${elo}: mất trung bình ${Math.round(loss / n)} cp/nước, nước hỏng nặng (>=200cp) ${blunders}/${n}`);
}
process.exit(0);
