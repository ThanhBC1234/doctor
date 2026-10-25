// E12–E15: kết thúc ván và khôi phục ván khi tải lại trang.
import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  registerSuite, startGame, say, state, waitSpoken, waitEngineMoved, waitPlayerReady,
} from './helpers/app.js';
import { Chess } from '../vendor/chess.js/chess.js';

const { test } = nodeTest;
const { open } = registerSuite(nodeTest);

const waitOver = (page) => page.waitForFunction(() => window.__blindfold.getState().over, null, { timeout: 15000 });

async function checkGameoverScreen(page, { title, moves }) {
  await page.waitForSelector('#screen-gameover', { state: 'visible' });
  assert.equal(await page.textContent('[data-testid=result]'), title);
  assert.equal(await page.locator('[data-testid=board]:visible').count(), 1, 'bàn cờ hiện sau ván');
  const sans = await page.$$eval('[data-testid=movelist] button[data-ply]', (bs) => bs.map((b) => b.textContent));
  assert.deepEqual(sans, moves);
  const s = await state(page);
  assert.equal(s.listening, false, 'micro tắt');
  assert.equal(await page.evaluate(() => !!window.__fakeRecognition.active), false);
}

async function downloadPgn(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=download-pgn]')]);
  assert.match(dl.suggestedFilename(), /^co-mu-\d{4}-\d{2}-\d{2}-\d{4}\.pgn$/);
  const text = await readFile(await dl.path(), 'utf8');
  const c = new Chess();
  c.loadPgn(text); // ném lỗi nếu PGN hỏng
  return { text, chess: c };
}

test('E12: người chơi hết giờ → máy thắng, màn kết thúc hiện, micro tắt', async () => {
  const page = await open();
  await startGame(page, { timeControl: 'custom', customMinutes: 1, customIncrement: 0 });
  await waitPlayerReady(page);
  const s = await state(page);
  assert.ok(s.clocks.player > 55000 && s.clocks.player <= 60000);
  assert.equal(await page.isVisible('[data-testid=clock-player]'), true);
  await page.evaluate(() => window.__blindfold.setClockTime('player', 1000));
  await waitOver(page);
  await waitSpoken(page, /^Bạn hết giờ\. Máy thắng\.$/);
  const end = await state(page);
  assert.equal(end.status.reason, 'timeout');
  assert.equal(end.result, '0-1');
  await checkGameoverScreen(page, { title: 'Máy thắng', moves: [] });
  assert.match(await page.textContent('#result-reason'), /Hết giờ/);
});

test('E12b: cảnh báo âm thanh khi còn 1 phút và 10 giây cuối', async () => {
  const page = await open();
  await startGame(page, { timeControl: 'custom', customMinutes: 2, customIncrement: 0, clockWarnings: true });
  await waitPlayerReady(page);
  await page.evaluate(() => window.__blindfold.setClockTime('player', 60500));
  await waitSpoken(page, /^Còn một phút\.$/, 0, 5000);
  await waitPlayerReady(page);
  await page.evaluate(() => window.__blindfold.setClockTime('player', 9500));
  await page.waitForFunction(() => window.__blindfold.getCueLog().filter((c) => c === 'tick').length >= 2, null, { timeout: 5000 });
  assert.ok((await page.evaluate(() => window.__blindfold.getCueLog())).includes('double'));
});

test('E13: xin thua → xác nhận → kết thúc, PGN Result 0-1', async () => {
  const page = await open();
  await startGame(page, { timeControl: '10+0' });
  await page.evaluate(() => window.__blindfold.forceEngineMove('e7e5'));
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  await say(page, 'xin thua');
  await waitSpoken(page, /^Bạn chắc chắn xin thua\?$/);
  await say(page, 'đúng');
  await waitOver(page);
  await waitSpoken(page, /^Bạn đã xin thua\.$/);
  const pgn = await page.evaluate(() => window.__blindfold.getPgn());
  assert.match(pgn, /\[Result "0-1"\]/);
  assert.match(pgn, /\[TimeControl "600\+0"\]/);
  assert.match(pgn, /1\. e4 e5 0-1$/);
  await checkGameoverScreen(page, { title: 'Máy thắng', moves: ['e4', 'e5'] });
  const { chess } = await downloadPgn(page);
  assert.equal(chess.history().length, 2);
});

test('E13b: xin thua rồi đổi ý "không" → ván tiếp tục', async () => {
  const page = await open();
  await startGame(page);
  await say(page, 'xin thua');
  await waitSpoken(page, /^Bạn chắc chắn xin thua\?$/);
  await say(page, 'không');
  await waitSpoken(page, /^Đã hủy\.$/);
  assert.equal((await state(page)).over, false);
});

test('E14a: máy chiếu hết người chơi', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => { window.__blindfold.forceEngineMove('e7e5'); window.__blindfold.forceEngineMove('d8h4'); });
  await say(page, 'f3');
  await waitEngineMoved(page, 1);
  await say(page, 'g4');
  await waitOver(page);
  await waitSpoken(page, /^Hậu hát 4\.$/);
  await waitSpoken(page, /^Chiếu hết\. Máy thắng\.$/);
  await checkGameoverScreen(page, { title: 'Máy thắng', moves: ['f3', 'e5', 'g4', 'Qh4#'] });
  const { text } = await downloadPgn(page);
  assert.match(text, /Qh4# 0-1/);
  // Xem lại ván: về đầu rồi bước tới
  await page.click('#nav-first');
  assert.equal(await page.locator('[data-testid=square-e2]').getAttribute('data-piece'), 'wp');
  await page.click('#nav-next');
  assert.equal(await page.locator('[data-testid=square-f3]').getAttribute('data-piece'), 'wp');
  assert.equal(await page.locator('#movelist button.current').textContent(), 'f3');
  assert.match(await page.getAttribute('#btn-lichess', 'href'), /^https:\/\/lichess\.org\/analysis\/pgn\//);
});

test('E14b: người chơi chiếu hết máy', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => {
    for (const m of ['e7e5', 'b8c6', 'g8f6']) window.__blindfold.forceEngineMove(m);
  });
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  await say(page, 'tượng c4');
  await waitEngineMoved(page, 3);
  await say(page, 'hậu h5');
  await waitEngineMoved(page, 5);
  await say(page, 'hậu ăn f7');
  await waitOver(page);
  await waitSpoken(page, /^Chiếu hết\. Bạn thắng\.$/);
  await checkGameoverScreen(page, { title: 'Bạn thắng', moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'] });
  assert.equal((await state(page)).result, '1-0');
  // Chơi lại cùng cài đặt
  await page.click('#btn-rematch');
  await page.waitForFunction(() => window.__blindfold.getState().screen === 'play' && window.__blindfold.getState().ply === 0);
  assert.deepEqual((await state(page)).hints, { peeksLeft: 1, locatesLeft: 2 });
});

test('E14c: hòa do lặp lại ba lần', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => {
    for (const m of ['g8f6', 'f6g8', 'g8f6', 'f6g8']) window.__blindfold.forceEngineMove(m);
  });
  let ply = 0;
  for (const m of ['mã f3', 'mã g1', 'mã f3', 'mã g1']) {
    await say(page, m);
    ply += 1;
    if (ply < 4) await waitEngineMoved(page, ply);
    ply += 1;
  }
  await waitOver(page);
  await waitSpoken(page, /^Hòa do lặp lại ba lần\.$/);
  assert.equal((await state(page)).result, '1/2-1/2');
  await checkGameoverScreen(page, { title: 'Hòa', moves: ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'] });
});

test('E15: tải lại trang giữa ván → tiếp tục đúng thế cờ, đồng hồ, quyền trợ giúp', async () => {
  const page = await open();
  await startGame(page, { timeControl: '15+10' });
  await page.evaluate(() => { window.__blindfold.forceEngineMove('e7e5'); window.__blindfold.forceEngineMove('b8c6'); });
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  await say(page, 'mã f3');
  await waitEngineMoved(page, 3);
  await say(page, 'quân ở đâu');
  await waitSpoken(page, /^Còn một lượt hỏi vị trí\.$/);
  await waitPlayerReady(page);
  const before = await state(page);

  await page.reload();
  await page.waitForFunction(() => window.__blindfold?.getState().engineReady === true, null, { timeout: 30000 });
  await page.evaluate(() => window.__blindfold.setTiming({ engineDelayMs: 0, postTtsMs: 0 }));
  await page.waitForSelector('#resume-banner', { state: 'visible' });
  await page.click('#btn-resume');
  await waitSpoken(page, /^Tiếp tục ván\. Bạn cầm quân Trắng\.$/);
  await waitSpoken(page, /^Máy vừa đi: Mã xê 6\.$/);
  await waitPlayerReady(page);
  const after = await state(page);
  assert.equal(after.fen, before.fen);
  assert.deepEqual(after.uciMoves, before.uciMoves);
  assert.deepEqual(after.hints, { peeksLeft: 1, locatesLeft: 1 });
  assert.ok(Math.abs(after.clocks.player - before.clocks.player) < 2000, `${after.clocks.player} vs ${before.clocks.player}`);
  assert.ok(Math.abs(after.clocks.engine - before.clocks.engine) < 2000);
  // Ván tiếp tục bình thường
  await say(page, 'tượng c4');
  await waitEngineMoved(page, 5);
  assert.equal((await state(page)).ply, 6);
});

test('E15b: bỏ ván cũ thì banner biến mất', async () => {
  const page = await open();
  await startGame(page);
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  await page.reload();
  await page.waitForFunction(() => window.__blindfold?.getState().engineReady === true, null, { timeout: 30000 });
  await page.waitForSelector('#resume-banner', { state: 'visible' });
  await page.click('#btn-discard');
  assert.equal(await page.isVisible('#resume-banner'), false);
});
