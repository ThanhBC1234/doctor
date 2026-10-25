import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, lex, stripDiacritics, expandReadings, normalizeToneMarks } from '../js/speech/normalize.js';

const primaries = (text) => lex(text).lexemes.map((l) => {
  const r = l.readings[0];
  return r.v !== undefined ? `${r.t}:${r.v}` : r.t;
});

test('bỏ dấu tiếng Việt', () => {
  assert.equal(stripDiacritics('mã đến ép'), 'ma den ep');
  assert.equal(stripDiacritics('Đen'), 'Den');
});

test('chuẩn hóa vị trí dấu thanh kiểu cũ', () => {
  assert.equal(normalizeToneMarks('hoà'), 'hòa');
  assert.equal(normalizeToneMarks('huỷ'), 'hủy');
  assert.equal(normalizeToneMarks('hòa'), 'hòa');
});

test('cleanText: chữ thường, bỏ dấu câu, đổi ký hiệu nhập thành', () => {
  assert.equal(cleanText('Mã F3!'), 'mã f3');
  assert.equal(cleanText('O-O'), 'castleshort');
  assert.equal(cleanText('0-0-0'), 'castlelong');
  assert.equal(cleanText('nhập thành gần'), 'castleshort');
  assert.equal(cleanText('Nhập thành cánh hậu.'), 'castlelong');
  assert.equal(cleanText('e8=Q'), 'e8 = q');
  assert.equal(cleanText('  e2,  e4 '), 'e2 e4');
  assert.equal(cleanText('Tốt e ăn d6, bắt tốt qua đường'), 'tốt e ăn d6');
  assert.equal(cleanText('hoàng hậu e7'), 'hậu e7');
  assert.equal(cleanText(null), '');
});

test('tách cụm dính', () => {
  assert.deepEqual(primaries('nf3'), ['piece:n', 'file:f', 'rank:3']);
  assert.deepEqual(primaries('e2e4'), ['file:e', 'rank:2', 'file:e', 'rank:4']);
  assert.deepEqual(primaries('exd5'), ['file:e', 'takes', 'file:d', 'rank:5']);
  assert.deepEqual(primaries('e8q'), ['file:e', 'rank:8', 'piece:q']);
  assert.deepEqual(primaries('bê4'), ['file:b', 'rank:4']);
});

test('không tách từ không có chữ số', () => {
  assert.deepEqual(primaries('ba'), ['rank:3']);
  assert.deepEqual(primaries('bê'), ['file:b']);
});

test('alias cột tiếng Việt / NATO', () => {
  assert.deepEqual(primaries('a bê xê dê e ép gờ hát'), ['file:a', 'file:b', 'file:c', 'file:d', 'file:e', 'file:f', 'file:g', 'file:h']);
  assert.deepEqual(primaries('alpha bravo charlie delta echo foxtrot golf hotel'),
    ['file:a', 'file:b', 'file:c', 'file:d', 'file:e', 'file:f', 'file:g', 'file:h']);
  assert.deepEqual(primaries('ép phờ'), ['file:f']);
});

test('alias hàng', () => {
  assert.deepEqual(primaries('một hai ba bốn năm sáu bảy tám'), [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `rank:${n}`));
  assert.deepEqual(primaries('mốt tư lăm'), ['rank:1', 'rank:4', 'rank:5']);
  assert.deepEqual(primaries('one two three four five six seven eight'), [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `rank:${n}`));
});

test('alias quân', () => {
  assert.deepEqual(primaries('vua hậu xe tượng mã tốt'), ['piece:k', 'piece:q', 'piece:r', 'piece:b', 'piece:n', 'piece:p']);
  assert.deepEqual(primaries('king queen rook bishop knight pawn'), ['piece:k', 'piece:q', 'piece:r', 'piece:b', 'piece:n', 'piece:p']);
  assert.deepEqual(primaries('ngựa tướng chốt'), ['piece:n', 'piece:k', 'piece:p']);
});

test('không dấu vẫn hiểu khi không trùng nghĩa', () => {
  assert.deepEqual(primaries('ma f3'), ['piece:n', 'file:f', 'rank:3']);
  assert.deepEqual(primaries('hau c4'), ['piece:q', 'file:c', 'rank:4']);
  // "tuong" vừa là tượng vừa là tướng: bỏ, không đoán
  assert.deepEqual(primaries('tuong c4'), ['file:c', 'rank:4']);
});

test('xung đột "xe": quân Xe hay cột c', () => {
  assert.deepEqual(primaries('xe e1'), ['piece:r', 'file:e', 'rank:1']);
  assert.deepEqual(primaries('mã xe ba'), ['piece:n', 'file:c', 'rank:3']);
  assert.deepEqual(primaries('xe xe ba'), ['piece:r', 'file:c', 'rank:3']);
  assert.deepEqual(primaries('xe 1 e1'), ['piece:r', 'rank:1', 'file:e', 'rank:1']);
  assert.deepEqual(primaries('ăn xe 5'), ['takes', 'file:c', 'rank:5']);
});

test('"b": cột b hay Tượng', () => {
  assert.deepEqual(primaries('b4'), ['file:b', 'rank:4']);
  assert.deepEqual(primaries('bc4'), ['piece:b', 'file:c', 'rank:4']);
});

test('"to"/"two" trong tiếng Anh', () => {
  assert.deepEqual(primaries('e to e4'), ['file:e', 'rank:2', 'file:e', 'rank:4']);
  assert.deepEqual(primaries('knight to f3'), ['piece:n', 'to', 'file:f', 'rank:3']);
  assert.deepEqual(primaries('e2 to e4'), ['file:e', 'rank:2', 'to', 'file:e', 'rank:4']);
});

test('từ không biết bị bỏ qua và được ghi lại', () => {
  const r = lex('con chuối mã f3');
  assert.deepEqual(r.unknown, ['chuối']);
  // từ đệm quen thuộc không bị coi là lạ
  assert.deepEqual(lex('ừm e4 luôn nhé').unknown, []);
});

test('expandReadings: cách hiểu mặc định đứng đầu, bỏ token ignore', () => {
  const { lexemes } = lex('xe a e1');
  const readings = expandReadings(lexemes);
  assert.deepEqual(readings[0].map((t) => t.t), ['piece', 'file', 'file', 'rank']);
  assert.ok(readings.length >= 3);
  assert.ok(readings.every((r) => r.every((t) => t.t !== 'ignore')));
});
