// E9–E11: quyền trợ giúp và các lệnh đọc thông tin.
import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {
  registerSuite, startGame, say, state, spoken, waitSpoken, waitEngineMoved, waitPlayerReady, spokenCount,
} from './helpers/app.js';
import { describePieces } from '../js/speech/speak-move.js';
import { Chess } from '../vendor/chess.js/chess.js';

const { test } = nodeTest;
const { open } = registerSuite(nodeTest);

const boardVisible = (page) => page.locator('[data-testid=board]:visible').count();

test('E9: xem bàn cờ 1 lần, đếm ngược, tự che lại; lần 2 bị từ chối', async () => {
  const page = await open({ timing: { peekMs: 1500 } });
  await startGame(page);
  await say(page, 'tháo bịt mắt');
  await waitSpoken(page, /^Mở bàn cờ trong mười giây\.$/);
  await page.waitForSelector('[data-testid=board]', { state: 'visible' });
  assert.equal((await state(page)).phase, 'peek');
  assert.equal(await page.locator('[data-testid=square-e1]').getAttribute('data-piece'), 'wk');
  assert.match(await page.textContent('[data-testid=peek-countdown]'), /^[12]$/);
  assert.equal((await state(page)).hints.peeksLeft, 0);
  await waitSpoken(page, /^Đã che lại\.$/, 0, 6000);
  assert.equal(await boardVisible(page), 0);
  await waitPlayerReady(page);
  assert.equal(await page.textContent('[data-testid=hint-peek] .count'), '0');
  await say(page, 'xem bàn cờ');
  await waitSpoken(page, /^Bạn đã dùng hết lượt xem bàn cờ\.$/);
  assert.equal(await boardVisible(page), 0);
  const cues = await page.evaluate(() => window.__blindfold.getCueLog());
  assert.ok(cues.filter((c) => c === 'tick').length >= 2, 'có tiếng bíp đếm ngược');
});

test('E9b: nói "xong" để che bàn cờ sớm', async () => {
  const page = await open({ timing: { peekMs: 10000 } });
  await startGame(page);
  await say(page, 'xem bàn cờ');
  await page.waitForSelector('[data-testid=board]', { state: 'visible' });
  await page.waitForFunction(() => !!window.__fakeRecognition.active, null, { timeout: 5000 });
  await page.evaluate(() => window.__fakeRecognition.emit('xong'));
  await waitSpoken(page, /^Đã che lại\.$/, 0, 3000);
  assert.equal(await boardVisible(page), 0);
});

test('E9c: chạm màn hình để che bàn cờ sớm; nút 👁 cũng mở được', async () => {
  const page = await open({ timing: { peekMs: 10000 } });
  await startGame(page);
  await waitPlayerReady(page);
  await page.click('[data-testid=hint-peek]');
  await page.waitForSelector('[data-testid=board]', { state: 'visible' });
  await page.click('#screen-peek');
  await waitSpoken(page, /^Đã che lại\.$/, 0, 3000);
  assert.equal(await boardVisible(page), 0);
});

test('E10: hỏi vị trí 2 lần đọc đúng (không có tốt), lần 3 từ chối', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => window.__blindfold.forceEngineMove('g8f6'));
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  const fen = (await state(page)).fen;
  const expected = describePieces(new Chess(fen).board(), 'w');

  for (let i = 1; i <= 2; i++) {
    const from = await spokenCount(page);
    await say(page, 'quân ở đâu');
    await waitSpoken(page, i === 1 ? /^Còn một lượt hỏi vị trí\.$/ : /^Bạn đã dùng hết lượt hỏi vị trí\.$/, from);
    const lines = (await spoken(page)).slice(from);
    assert.equal(lines[0], expected[0]);
    assert.equal(lines[1], expected[1]);
    assert.ok(lines[0].startsWith('Trắng:'));
    assert.ok(!lines.join(' ').includes('Tốt'));
    assert.ok(lines[1].includes('Mã ép 6'), 'đọc vị trí mới của mã đen');
  }
  assert.equal(await page.textContent('[data-testid=hint-locate] .count'), '0');
  const from = await spokenCount(page);
  await say(page, 'vị trí quân');
  await waitSpoken(page, /^Bạn đã dùng hết lượt hỏi vị trí\.$/, from);
  assert.equal((await spoken(page)).slice(from).length, 1);
});

test('E11: nhắc lại, tôi vừa đi gì, đọc lại ván, trợ giúp, thời gian', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => { window.__blindfold.forceEngineMove('e7e5'); window.__blindfold.forceEngineMove('b8c6'); });
  await say(page, 'nhắc lại');
  await waitSpoken(page, /^Máy chưa đi nước nào\.$/);
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  await say(page, 'mã f3');
  await waitEngineMoved(page, 3);

  await say(page, 'nhắc lại');
  await waitSpoken(page, /^Máy vừa đi: Mã xê 6\.$/);
  await say(page, 'tôi vừa đi gì');
  await waitSpoken(page, /^Bạn vừa đi: Mã ép 3\.$/);
  await say(page, 'đọc lại ván');
  await waitSpoken(page, /^Nước 1\. Tốt e 4; Tốt e 5\.$/);
  await waitSpoken(page, /^Nước 2\. Mã ép 3; Mã xê 6\.$/);
  await say(page, 'trợ giúp');
  await waitSpoken(page, /^Nói nước đi như/);
  await say(page, 'thời gian');
  await waitSpoken(page, /^Ván này không tính giờ\.$/);
  await say(page, 'tạm dừng');
  await waitSpoken(page, /^Ván này không tính giờ nên không cần tạm dừng\.$/);
  // Nút "Nhắc lại" làm điều tương tự
  const from = await spokenCount(page);
  await waitPlayerReady(page);
  await page.click('#btn-repeat');
  await waitSpoken(page, /^Máy vừa đi: Mã xê 6\.$/, from);
});

test('E11b: thời gian, tạm dừng / tiếp tục khi có đồng hồ', async () => {
  const page = await open();
  await startGame(page, { timeControl: '5+0' });
  await say(page, 'thời gian');
  await waitSpoken(page, /^Bạn còn \d+ phút( \d+ giây)?\. Máy còn 5 phút\.$/);
  await say(page, 'tạm dừng');
  await waitSpoken(page, /^Đã tạm dừng\./);
  const t1 = (await state(page)).clocks.player;
  assert.equal((await state(page)).phase, 'paused');
  await page.waitForTimeout(700);
  assert.equal((await state(page)).clocks.player, t1, 'đồng hồ đứng yên khi tạm dừng');
  await say(page, 'e4');
  await waitSpoken(page, /^Đang tạm dừng\. Nói tiếp tục\.$/);
  assert.equal((await state(page)).ply, 0);
  await say(page, 'tiếp tục');
  await waitSpoken(page, /^Tiếp tục\.$/);
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  assert.equal((await state(page)).ply, 2);
});

test('E11c: cầu hòa quá sớm → máy từ chối, không hỏi lại ngay', async () => {
  const page = await open();
  await startGame(page);
  await say(page, 'cầu hòa');
  await waitSpoken(page, /^Máy từ chối hòa\.$/);
  await say(page, 'cầu hòa');
  await waitSpoken(page, /^Bạn vừa cầu hòa\./);
  assert.equal((await state(page)).over, false);
});
