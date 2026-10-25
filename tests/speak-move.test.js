import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speakMove, spellSquare, describeIntent, describePieces, listMajorPieces, sanDisambiguation } from '../js/speech/speak-move.js';
import { position } from './helpers.js';

const norm = (s) => s.replace(/,/g, '').replace(/\s+/g, ' ').trim();

/** Tìm nước có SAN cho trước trong thế cờ, trả về object verbose. */
function moveIn(pos, san) {
  const c = position(pos);
  const m = c.moves({ verbose: true }).find((x) => x.san === san);
  assert.ok(m, `không có nước ${san}`);
  return m;
}

// [thế cờ, SAN, kỳ vọng (không thông báo), kỳ vọng (có thông báo)]
const CASES = [
  [{}, 'e4', 'Tốt e 4', 'Tốt e 4'],
  [{}, 'Nf3', 'Mã ép 3', 'Mã ép 3'],
  [{ fen: '4k3/8/8/4p3/8/8/1B6/4K3 w - - 0 1' }, 'Bxe5', 'Tượng e 5', 'Tượng ăn Tốt e 5'],
  [{ moves: 'e4 d5' }, 'exd5', 'Tốt e, dê 5', 'Tốt e ăn Tốt dê 5'],
  [{ fen: 'rnbqkbnr/pppppppp/8/8/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 1' }, 'Nbd2', 'Mã bê, dê 2', 'Mã bê, dê 2'],
  [{ fen: '6k1/8/8/R7/8/8/6K1/R7 w - - 0 1' }, 'R1a3', 'Xe 1, a 3', 'Xe 1, a 3'],
  [{ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' }, 'O-O', 'Nhập thành gần', 'Nhập thành gần'],
  [{ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' }, 'O-O-O', 'Nhập thành xa', 'Nhập thành xa'],
  [{ fen: 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1' }, 'e8=Q+', 'Tốt e 8, phong Hậu', 'Tốt e 8, phong Hậu, chiếu'],
  [{ fen: 'k1n5/3P4/8/8/8/8/8/4K3 w - - 0 1' }, 'dxc8=N', 'Tốt dê, xê 8, phong Mã', 'Tốt dê ăn Mã xê 8, phong Mã'],
  [{ moves: 'e4 e5 Bc4 Nc6 Qh5 Nf6' }, 'Qxf7#', 'Hậu ép 7', 'Hậu ăn Tốt ép 7, chiếu hết'],
  [{ moves: 'f3 e5 g4' }, 'Qh4#', 'Hậu hát 4', 'Hậu hát 4, chiếu hết'],
  [{ fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1' }, 'exd6', 'Tốt e, dê 6', 'Tốt e ăn dê 6, bắt tốt qua đường'],
  [{ fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1' }, 'Rh8+', 'Xe hát 8', 'Xe hát 8, chiếu'],
];

for (const [pos, san, quiet, loud] of CASES) {
  test(`đọc ${san}`, () => {
    const m = moveIn(pos, san);
    assert.equal(norm(speakMove(m)), norm(quiet));
    assert.equal(norm(speakMove(m, { announceCaptures: false })), norm(quiet));
    assert.equal(norm(speakMove(m, { announceCaptures: true })), norm(loud));
  });
}

test('mặc định không đọc "ăn", "chiếu"', () => {
  const m = moveIn({ moves: 'e4 e5 Bc4 Nc6 Qh5 Nf6' }, 'Qxf7#');
  const s = speakMove(m);
  assert.ok(!s.includes('ăn') && !s.includes('chiếu'));
});

test('cách đọc NATO', () => {
  assert.equal(spellSquare('e4', 'nato'), 'echo 4');
  assert.equal(norm(speakMove(moveIn({}, 'Nf3'), { fileStyle: 'nato' })), 'Mã foxtrot 3');
  assert.equal(norm(speakMove(moveIn({ moves: 'e4 d5' }, 'exd5'), { fileStyle: 'nato' })), 'Tốt echo delta 5');
});

test('đọc ô kiểu Việt', () => {
  assert.equal(spellSquare('b2'), 'bê 2');
  assert.equal(spellSquare('h8'), 'hát 8');
});

test('phần phân biệt trong SAN', () => {
  assert.equal(sanDisambiguation('Nbd2'), 'b');
  assert.equal(sanDisambiguation('R1e1'), '1');
  assert.equal(sanDisambiguation('Qh4xe1+'), 'h4');
  assert.equal(sanDisambiguation('Nf3'), '');
  assert.equal(sanDisambiguation('e4'), '');
});

test('mô tả ý định khi nước không hợp lệ', () => {
  assert.equal(describeIntent({ kind: 'move', piece: 'q', to: 'h5' }), 'Hậu hát 5');
  assert.equal(describeIntent({ kind: 'move', piece: null, from: 'e2', to: 'e5' }), 'e 2 đến e 5');
  assert.equal(describeIntent({ kind: 'castle', side: 'q' }), 'Nhập thành xa');
  assert.equal(describeIntent({ kind: 'move', piece: 'n', takes: true, to: 'd4' }), 'Mã ăn dê 4');
});

test('đọc vị trí quân: không có tốt, thứ tự Vua Hậu Xe Tượng Mã, bên người chơi trước', () => {
  const c = position({});
  const white = listMajorPieces(c.board(), 'w');
  assert.deepEqual(white, [
    { type: 'k', squares: ['e1'] },
    { type: 'q', squares: ['d1'] },
    { type: 'r', squares: ['a1', 'h1'] },
    { type: 'b', squares: ['c1', 'f1'] },
    { type: 'n', squares: ['b1', 'g1'] },
  ]);
  const lines = describePieces(c.board(), 'b');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith('Đen:'));
  assert.ok(lines[1].startsWith('Trắng:'));
  assert.equal(norm(lines[1]), 'Trắng: Vua e 1. Hậu dê 1. Xe a 1 Xe hát 1. Tượng xê 1 Tượng ép 1. Mã bê 1 Mã gờ 1.');
  assert.ok(!lines.join(' ').includes('Tốt'));
});

test('đọc vị trí khi chỉ còn vua', () => {
  const c = position({ fen: '4k3/pppp4/8/8/8/8/8/4K3 w - - 0 1' });
  const lines = describePieces(c.board(), 'w');
  assert.equal(norm(lines[0]), 'Trắng: Vua e 1.');
  assert.equal(norm(lines[1]), 'Đen: Vua e 8.');
});
