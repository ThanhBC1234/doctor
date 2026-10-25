// E1–E8, E16, E18, E20: luồng chơi cơ bản bằng giọng nói.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setupSuite, openApp, startGame, say, state, spoken, waitSpoken, waitEngineMoved, waitPlayerReady,
  micDisciplineViolations, lastMoveVerbose, spokenCount,
} from './helpers/app.js';
import { speakMove } from '../js/speech/speak-move.js';

let suite;
let current = null;
before(async () => { suite = await setupSuite(); });
after(async () => { await suite.close(); });
afterEach(async () => {
  if (!current) return;
  const v = await micDisciplineViolations(current.page);
  const errs = current.errors;
  await current.context.close();
  current = null;
  assert.deepEqual(v.bad, [], 'E17: micro mở sai lúc');
  assert.deepEqual(errs, [], 'không có lỗi console');
});

async function open(opts) {
  current = await openApp(suite, opts);
  return current.page;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test('E1: mở trang, engine tải xong, nút Bắt đầu bật, không lỗi console', async () => {
  const page = await open();
  assert.equal(await page.isDisabled('[data-testid=start]'), false);
  assert.match(await page.textContent('[data-testid=engine-status]'), /sẵn sàng/);
  assert.equal(await page.title(), 'Cờ mù');
});

test('E2: bắt đầu qua form cài đặt; bàn cờ ẩn hoàn toàn', async () => {
  const page = await open();
  await page.check('input[name=color][value=w]', { force: true });
  await page.selectOption('#timeControl', 'none');
  await page.$eval('#elo', (el) => { el.value = '1400'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.textContent('#elo-value'), '1400');
  await page.click('[data-testid=start]');
  await waitSpoken(page, /^Ván mới\. Bạn cầm quân Trắng\. Máy chơi ở mức 1400\.$/);
  assert.equal(await page.isVisible('#screen-play'), true);
  assert.equal(await page.locator('[data-testid=board]:visible').count(), 0);
  await waitPlayerReady(page);
  assert.equal((await state(page)).phase, 'player');
  assert.equal(await page.locator('[data-testid=board]:visible').count(), 0);
});

test('E3: nói "e4" → xác nhận "đúng" → máy đi và đọc đúng nước', async () => {
  const page = await open();
  await startGame(page, { confirm: true });
  await say(page, 'e4');
  await waitSpoken(page, /^Tốt e 4\. Đúng không\?$/);
  assert.equal((await state(page)).phase, 'confirm');
  await say(page, 'đúng');
  await waitEngineMoved(page, 1);
  const s = await state(page);
  assert.equal(s.uciMoves[0], 'e2e4');
  assert.equal(s.ply, 2);
  const { move } = await lastMoveVerbose(page);
  const log = await spoken(page);
  assert.equal(log[log.length - 1], `${speakMove(move)}.`);
});

test('E4: nói "mã f3" → "sai" → hủy, thế cờ không đổi', async () => {
  const page = await open();
  await startGame(page, { confirm: true });
  await say(page, 'mã f3');
  await waitSpoken(page, /^Mã ép 3\. Đúng không\?$/);
  await say(page, 'sai');
  await waitSpoken(page, /^Đã hủy\.$/);
  await waitPlayerReady(page);
  const s = await state(page);
  assert.equal(s.fen, START_FEN);
  assert.equal(s.phase, 'player');
});

test('E4b: xác nhận không nghe thấy gì hai lần → hủy', async () => {
  const page = await open();
  await startGame(page, { confirm: true });
  await say(page, 'e4');
  await waitSpoken(page, /Đúng không\?$/);
  await page.waitForFunction(() => !!window.__fakeRecognition.active);
  await page.evaluate(() => window.__fakeRecognition.silence());
  await waitSpoken(page, /^Đúng không\? Nói đúng hoặc sai\.$/);
  await page.waitForFunction(() => !!window.__fakeRecognition.active);
  await page.evaluate(() => window.__fakeRecognition.silence());
  await waitSpoken(page, /^Đã hủy\.$/);
  assert.equal((await state(page)).fen, START_FEN);
});

test('E5: nước không hợp lệ → báo lỗi, thế cờ không đổi', async () => {
  const page = await open();
  await startGame(page);
  await say(page, 'hậu h5');
  await waitSpoken(page, /^Nước đi không hợp lệ: Hậu hát 5\. Nói lại\.$/);
  await say(page, 'blah blah');
  await waitSpoken(page, /^Không hiểu\. Nói lại\.$/);
  await waitPlayerReady(page);
  assert.equal((await state(page)).fen, START_FEN);
  assert.ok((await page.evaluate(() => window.__blindfold.getCueLog())).includes('error'));
});

test('E6: nhiều quân tới được → hỏi lại; nói rõ hơn → đi đúng', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => { window.__blindfold.forceEngineMove('g8f6'); window.__blindfold.forceEngineMove('b8c6'); });
  await say(page, 'd4');
  await waitEngineMoved(page, 1);
  await say(page, 'mã f3');
  await waitEngineMoved(page, 3);
  const before = await spokenCount(page);
  await say(page, 'mã d2');
  await waitSpoken(page, /^Có nhiều nước có thể đi: Mã bê, dê 2; Mã ép, dê 2\./, before);
  assert.equal((await state(page)).ply, 4);
  await page.evaluate(() => window.__blindfold.forceEngineMove('e7e5'));
  await say(page, 'mã bê đến dê hai');
  await waitEngineMoved(page, 5);
  assert.equal((await state(page)).uciMoves[4], 'b1d2');
});

test('E7: tắt xác nhận → đi ngay, không hỏi "đúng không"', async () => {
  const page = await open();
  await startGame(page, { confirm: false });
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  assert.equal((await spoken(page)).some((t) => t.includes('Đúng không')), false);
});

test('E7b: đổi cài đặt xác nhận trong ván qua hộp Cài đặt', async () => {
  const page = await open();
  await startGame(page, { confirm: true });
  await page.click('#btn-settings');
  await page.uncheck('#dlg-confirm');
  await page.click('#settings-dialog button[type=submit]');
  assert.equal((await page.evaluate(() => window.__blindfold.getSettings())).confirm, false);
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  assert.equal((await spoken(page)).some((t) => t.includes('Đúng không')), false);
});

test('E8: nhiều phương án nhận dạng, chỉ phương án 2 hợp lệ → nhận đúng', async () => {
  const page = await open();
  await startGame(page);
  await say(page, ['ê năm', 'e bốn', 'mã f3']);
  await waitEngineMoved(page, 1);
  assert.equal((await state(page)).uciMoves[0], 'e2e4');
});

test('E16: cầm Đen → máy đi trước, đọc nước trước khi mở micro', async () => {
  const page = await open();
  await startGame(page, { color: 'b' });
  await waitEngineMoved(page, 0);
  const s = await state(page);
  assert.equal(s.playerColor, 'b');
  assert.equal(s.ply, 1);
  const { move } = await lastMoveVerbose(page);
  await waitSpoken(page, new RegExp(`^${speakMove(move)}\\.$`));
  const starts = await page.evaluate(() => window.__fakeRecognition.starts.length);
  assert.equal(starts, 0, 'chưa mở micro trước nước của máy');
  await say(page, 'e5');
  await waitEngineMoved(page, 2);
  assert.equal((await state(page)).ply, 3);
});

test('E18: bật thông báo ăn quân → máy đọc "ăn", "chiếu hết"', async () => {
  const page = await open();
  await startGame(page, { announce: true });
  await page.evaluate(() => { window.__blindfold.forceEngineMove('d7d5'); window.__blindfold.forceEngineMove('d5e4'); });
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  await say(page, 'mã c3');
  await waitEngineMoved(page, 3);
  await waitSpoken(page, /^Tốt dê ăn Tốt e 4\.$/);

  const page2 = page;
  await page2.click('#btn-settings');
  await page2.click('#btn-exit');
  await startGame(page2, { announce: true });
  await page2.evaluate(() => { window.__blindfold.forceEngineMove('e7e5'); window.__blindfold.forceEngineMove('d8h4'); });
  await say(page2, 'f3');
  await waitEngineMoved(page2, 1);
  await say(page2, 'g4');
  await page2.waitForFunction(() => window.__blindfold.getState().over);
  await waitSpoken(page2, /^Hậu hát 4, chiếu hết\.$/);
});

test('E20: phím Space mở micro trên máy tính', async () => {
  const page = await open();
  await startGame(page);
  await waitPlayerReady(page);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !!window.__fakeRecognition.active);
  await page.evaluate(() => window.__fakeRecognition.emit('e4'));
  await waitEngineMoved(page, 1);
  assert.equal((await state(page)).uciMoves[0], 'e2e4');
});
