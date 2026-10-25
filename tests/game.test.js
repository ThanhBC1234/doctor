import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, parseUci, toUci, hasMatingMaterial } from '../js/game.js';
import { buildPgn, lichessAnalysisUrl, pgnFileName } from '../js/pgn.js';
import { Chess } from '../vendor/chess.js/chess.js';

function play(game, sans) {
  for (const s of sans.split(' ')) assert.ok(game.move(s), `nước ${s}`);
}

test('UCI', () => {
  assert.deepEqual(parseUci('e2e4'), { from: 'e2', to: 'e4' });
  assert.deepEqual(parseUci('e7e8q'), { from: 'e7', to: 'e8', promotion: 'q' });
  assert.equal(parseUci('e9e4'), null);
  assert.equal(toUci({ from: 'e7', to: 'e8', promotion: 'n' }), 'e7e8n');
});

test('đi nước bằng object, UCI, SAN; nước sai trả null', () => {
  const g = createGame();
  assert.ok(g.move({ from: 'e2', to: 'e4' }));
  assert.ok(g.move('e7e5'));
  assert.ok(g.move('Nf3'));
  assert.equal(g.move('Ke5'), null);
  assert.equal(g.turn(), 'b');
  assert.deepEqual(g.uciMoves(), ['e2e4', 'e7e5', 'g1f3']);
});

test('trySan không đi nước, phân biệt hoa thường', () => {
  const g = createGame({ uciMoves: ['e2e4', 'd7d5', 'b1c3', 'g8f6'] });
  assert.equal(g.trySan('Nxd5').san, 'Nxd5');
  assert.equal(g.trySan('Bxd5'), null);
  assert.equal(g.plyCount(), 4);
});

test('chiếu hết', () => {
  const g = createGame();
  play(g, 'f3 e5 g4 Qh4#');
  assert.deepEqual(g.status(), { over: true, reason: 'checkmate', winner: 'b' });
  assert.equal(g.resultCode(), '0-1');
  assert.equal(g.move('e4'), null);
});

test('pat', () => {
  const g = createGame();
  // Thế pat nổi tiếng của Sam Loyd (10 nước)
  play(g, 'e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6');
  assert.equal(g.status().reason, 'stalemate');
  assert.equal(g.resultCode(), '1/2-1/2');
});

test('lặp lại ba lần', () => {
  const g = createGame();
  play(g, 'Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8');
  assert.equal(g.status().reason, 'threefold');
});

test('không đủ lực chiếu hết', () => {
  const g = createGame();
  g.chess.load('4k3/8/8/8/8/8/8/4K2B w - - 0 1');
  assert.equal(g.status().reason, 'insufficient');
});

test('luật 50 nước', () => {
  const g = createGame();
  g.chess.load('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
  g.move('Ra2');
  assert.equal(g.status().reason, 'fifty');
});

test('xin thua, thỏa thuận hòa, hết giờ', () => {
  const g = createGame();
  g.resign('w');
  assert.deepEqual(g.status(), { over: true, reason: 'resign', winner: 'b' });
  assert.equal(g.resultCode(), '0-1');

  const g2 = createGame();
  g2.agreeDraw();
  assert.equal(g2.resultCode(), '1/2-1/2');

  const g3 = createGame();
  g3.timeout('w');
  assert.equal(g3.status().winner, 'b');
  assert.equal(g3.status().reason, 'timeout');
});

test('hết giờ nhưng đối phương chỉ còn vua + 1 quân nhẹ → hòa', () => {
  const g = createGame();
  g.chess.load('4k3/8/8/8/8/8/PPPP4/3NK3 w - - 0 1');
  g.timeout('w');
  assert.equal(g.status().winner, null);
  assert.equal(g.resultCode(), '1/2-1/2');
  const c = new Chess('4k3/8/8/8/8/8/8/2N1K1N1 w - - 0 1');
  assert.equal(hasMatingMaterial(c, 'w'), true);
  assert.equal(hasMatingMaterial(c, 'b'), false);
});

test('khôi phục từ danh sách UCI cho cùng FEN', () => {
  const g = createGame();
  play(g, 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6');
  const g2 = createGame({ uciMoves: g.uciMoves() });
  assert.equal(g2.fen(), g.fen());
  assert.throws(() => createGame({ uciMoves: ['e2e5'] }));
});

test('lastMove, lastMoveBy, fenAt', () => {
  const g = createGame();
  play(g, 'e4 e5 Nf3');
  assert.equal(g.lastMove().san, 'Nf3');
  assert.equal(g.lastMoveBy('b').san, 'e5');
  assert.equal(g.fenAt(0), new Chess().fen());
  assert.equal(g.fenAt(3), g.fen());
  assert.equal(g.fenAt(1), (() => { const c = new Chess(); c.move('e4'); return c.fen(); })());
});

test('PGN có header đúng và đọc lại được', () => {
  const g = createGame();
  play(g, 'e4 e5 Nf3 Nc6');
  g.resign('w');
  const pgn = buildPgn({ uciMoves: g.uciMoves(), playerColor: 'w', elo: 1400, result: g.resultCode(), reason: 'resign', timeControl: '900+10', date: new Date(2026, 9, 25) });
  assert.match(pgn, /\[White "Người chơi"\]/);
  assert.match(pgn, /\[Black "Stockfish \(1400\)"\]/);
  assert.match(pgn, /\[Result "0-1"\]/);
  assert.match(pgn, /\[Date "2026\.10\.25"\]/);
  assert.match(pgn, /\[TimeControl "900\+10"\]/);
  assert.match(pgn, /1\. e4 e5 2\. Nf3 Nc6 0-1$/);
  const c = new Chess();
  c.loadPgn(pgn);
  assert.equal(c.history().length, 4);
});

test('PGN ván chiếu hết', () => {
  const g = createGame();
  play(g, 'f3 e5 g4 Qh4#');
  const pgn = buildPgn({ uciMoves: g.uciMoves(), playerColor: 'b', elo: 2000, result: g.resultCode() });
  assert.match(pgn, /\[White "Stockfish \(2000\)"\]/);
  assert.match(pgn, /Qh4# 0-1$/);
  assert.equal((pgn.match(/0-1/g) || []).length, 2, 'kết quả không bị lặp');
});

test('link Lichess và tên file', () => {
  assert.ok(lichessAnalysisUrl('1. e4 *').startsWith('https://lichess.org/analysis/pgn/1.%20e4'));
  assert.match(pgnFileName(new Date(2026, 0, 2, 3, 4)), /^co-mu-2026-01-02-0304\.pgn$/);
});
