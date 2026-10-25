import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHints } from '../js/hints.js';

test('1 lần xem bàn cờ', () => {
  const h = createHints();
  assert.equal(h.peeksLeft, 1);
  assert.equal(h.usePeek(), true);
  assert.equal(h.peeksLeft, 0);
  assert.equal(h.usePeek(), false);
  assert.equal(h.peeksLeft, 0);
});

test('2 lần hỏi vị trí', () => {
  const h = createHints();
  assert.equal(h.useLocate(), true);
  assert.equal(h.useLocate(), true);
  assert.equal(h.useLocate(), false);
  assert.equal(h.locatesLeft, 0);
});

test('reset cho ván mới', () => {
  const h = createHints();
  h.usePeek();
  h.useLocate();
  h.reset();
  assert.deepEqual(h.serialize(), { peeksLeft: 1, locatesLeft: 2 });
});

test('lưu và khôi phục', () => {
  const h = createHints();
  h.useLocate();
  const h2 = createHints(h.serialize());
  assert.equal(h2.peeksLeft, 1);
  assert.equal(h2.locatesLeft, 1);
});

test('dữ liệu lưu sai thì kẹp lại trong giới hạn', () => {
  const h = createHints({ peeksLeft: 99, locatesLeft: -3 });
  assert.equal(h.peeksLeft, 1);
  assert.equal(h.locatesLeft, 0);
  const h2 = createHints({ peeksLeft: 'x' });
  assert.equal(h2.peeksLeft, 1);
});
