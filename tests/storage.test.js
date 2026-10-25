// storage.js dùng window.localStorage: giả lập trong Node.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, loadGame, saveGame, clearGame } from '../js/storage.js';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

beforeEach(() => { globalThis.window = { localStorage: fakeStorage() }; });
afterEach(() => { delete globalThis.window; });

test('không có gì → mặc định; lưu rồi đọc lại giữ nguyên', () => {
  assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  saveSettings({ ...DEFAULT_SETTINGS, elo: 2000, color: 'b', confirm: false });
  const s = loadSettings();
  assert.equal(s.elo, 2000);
  assert.equal(s.color, 'b');
  assert.equal(s.confirm, false);
});

test('bản ghi hỏng không làm app sập: thiếu data, data sai kiểu, giá trị lạ', () => {
  for (const raw of ['{"v":1}', '{"v":1,"data":null}', '{"v":1,"data":"abc"}', 'xxx', '{"v":99,"data":{"elo":2500}}']) {
    window.localStorage.setItem('blindfold.settings', raw);
    assert.deepEqual(loadSettings(), DEFAULT_SETTINGS, raw);
  }
  window.localStorage.setItem('blindfold.settings', JSON.stringify({
    v: 1, data: { color: 'purple', elo: NaN, fileStyle: 'x', listenMode: 'yes', rate: '1', speechLang: 'fr-FR', confirm: 0 },
  }));
  assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
});

test('ván lưu: chỉ nhận bản ghi có uciMoves là mảng và đúng phiên bản', () => {
  assert.equal(loadGame(), null);
  window.localStorage.setItem('blindfold.game', '{"v":1,"uciMoves":"e2e4"}');
  assert.equal(loadGame(), null);
  saveGame({ uciMoves: ['e2e4'], playerColor: 'w', elo: 1400 });
  assert.deepEqual(loadGame().uciMoves, ['e2e4']);
  clearGame();
  assert.equal(loadGame(), null);
});

test('localStorage ném lỗi (chế độ riêng tư) → không sập, trả mặc định', () => {
  globalThis.window = { localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} } };
  assert.deepEqual(loadSettings(), DEFAULT_SETTINGS);
  assert.equal(saveSettings(DEFAULT_SETTINGS), false);
  assert.equal(loadGame(), null);
});
