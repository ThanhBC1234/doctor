// Chạy Stockfish thật trong Node (cùng file engine trang web dùng).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createEngine, parseInfo, pickRandomized } from '../js/engine.js';
import { Chess } from '../vendor/chess.js/chess.js';
import { rng } from './helpers.js';

const require = createRequire(import.meta.url);

async function nodeTransport() {
  const sf = await require('../vendor/stockfish/stockfish-19-lite-single.js')();
  const listeners = [];
  sf.listener = (line) => listeners.forEach((fn) => fn(line));
  return {
    post: (cmd) => sf.processCommand(cmd),
    onLine: (fn) => listeners.push(fn),
    terminate: () => sf.terminate?.(),
  };
}

const FENS = {
  opening: new Chess().fen(),
  middlegame: 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N2N2/PP2BPPP/R2QKB1R w KQ - 0 9',
  endgame: '8/5k2/8/3K4/8/8/5P2/8 w - - 0 1',
  promotion: '8/4P3/8/8/8/2k5/8/4K3 w - - 0 1',
  onlyMove: '7k/8/8/8/8/8/6q1/7K w - - 0 1', // nước duy nhất: Kxg2
};

let engine;
before(async () => {
  engine = createEngine(await nodeTransport(), { random: rng(3), timeoutMs: 20000 });
  await engine.init();
});
after(() => engine?.terminate());

test('engine khởi động', () => {
  assert.equal(engine.ready, true);
});

for (const elo of [1000, 1300, 1400, 2500]) {
  for (const [name, fen] of Object.entries(FENS)) {
    test(`Elo ${elo}: nước hợp lệ cho thế ${name}`, async () => {
      await engine.setStrength(elo);
      await engine.newGame();
      const c = new Chess(fen);
      const legal = c.moves({ verbose: true }).map((m) => m.lan);
      const t0 = Date.now();
      const uci = await engine.bestMove(fen);
      assert.ok(Date.now() - t0 < 10000, 'dưới 10 giây');
      assert.match(uci, /^[a-h][1-8][a-h][1-8][qrbn]?$/);
      assert.ok(legal.includes(uci), `${uci} không có trong ${legal.join(',')}`);
    });
  }
}

test('hết nước (chiếu hết) → null', async () => {
  const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
  assert.equal(await engine.bestMove(mated), null);
});

test('evaluate trả về số và khôi phục mức chơi', async () => {
  await engine.setStrength(1400);
  const fenWhiteUp = '4k3/8/8/8/8/8/8/QQ2K3 w - - 0 1';
  const score = await engine.evaluate(fenWhiteUp, 8);
  assert.equal(typeof score, 'number');
  assert.ok(score > 500, `điểm ${score}`);
  assert.equal(engine.params.elo, 1400);
  const uci = await engine.bestMove(FENS.opening);
  assert.match(uci, /^[a-h][1-8][a-h][1-8]$/);
});

test('mức 2500 tìm được chiếu hết một nước', async () => {
  await engine.setStrength(2500);
  const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
  assert.equal(await engine.bestMove(fen), 'a1a8');
});

test('parseInfo', () => {
  const i = parseInfo('info depth 10 seldepth 12 multipv 2 score cp -35 nodes 1000 pv e7e5 g1f3');
  assert.deepEqual(i, { depth: 10, multipv: 2, score: -35, mate: null, move: 'e7e5' });
  const m = parseInfo('info depth 5 multipv 1 score mate 2 nodes 10 pv a1a8');
  assert.ok(m.score > 99000);
  assert.equal(parseInfo('info string hello'), null);
});

test('pickRandomized: chỉ thay bằng nước kém hơn nước Stockfish chọn, trong cửa sổ điểm', () => {
  const cands = [{ move: 'a', score: 100 }, { move: 'b', score: 50 }, { move: 'c', score: 20 }, { move: 'd', score: -300 }];
  const always = { probability: 1, windowCp: 150 };
  const rand = rng(5);
  for (let i = 0; i < 50; i++) assert.ok(['b', 'c'].includes(pickRandomized(cands, always, rand, 'a')));
  for (let i = 0; i < 50; i++) assert.equal(pickRandomized(cands, always, rand, 'b'), 'c', 'không thay bằng a (tốt hơn)');
  assert.equal(pickRandomized(cands, always, rand, 'c'), 'c', 'không còn nước kém hơn trong cửa sổ: giữ nguyên');
  assert.equal(pickRandomized(cands, { probability: 0, windowCp: 150 }, rand, 'b'), 'b');
  assert.equal(pickRandomized(cands, null, rand, 'b'), 'b');
  assert.equal(pickRandomized(cands, null), 'a');
  assert.equal(pickRandomized([], always), null);
});
