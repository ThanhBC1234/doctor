// Giao diện và tương thích trình duyệt: lỗi do nhóm rà soát UI phát hiện.
import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {
  registerSuite, startGame, say, state, spoken, waitSpoken, waitEngineMoved, waitPlayerReady,
} from './helpers/app.js';

const { test } = nodeTest;
const { open, current } = registerSuite(nodeTest);

test('phím tắt bỏ qua Ctrl/Cmd/Alt: Ctrl+L, Cmd+P không tiêu quyền trợ giúp', async () => {
  const page = await open();
  await startGame(page);
  await waitPlayerReady(page);
  const before = (await spoken(page)).length;
  await page.keyboard.press('Control+l');
  await page.keyboard.press('Meta+p');
  await page.keyboard.press('Alt+r');
  await page.waitForTimeout(300);
  const s = await state(page);
  assert.deepEqual(s.hints, { peeksLeft: 1, locatesLeft: 2 });
  assert.equal((await spoken(page)).length, before);
  assert.equal(await page.locator('[data-testid=board]:visible').count(), 0);
  await page.keyboard.press('l');
  await waitSpoken(page, /^Còn một lượt hỏi vị trí\.$/);
});

test('trình duyệt không có <dialog>.showModal: nút Đóng không tải lại trang, form ẩn khi đóng', async () => {
  const page = await open({
    extraInit: () => {
      delete HTMLDialogElement.prototype.showModal;
      delete HTMLDialogElement.prototype.close;
    },
  });
  await startGame(page);
  await say(page, 'e4');
  await waitEngineMoved(page, 1);
  const url = page.url();
  assert.equal(await page.isVisible('#settings-dialog'), false, 'form cài đặt không hiện khi chưa mở');
  await page.click('#btn-settings');
  assert.equal(await page.isVisible('#settings-dialog'), true);
  await page.click('#settings-dialog button[type=submit]');
  await page.waitForTimeout(300);
  assert.equal(page.url(), url, 'không điều hướng');
  assert.equal((await state(page)).ply, 2, 'ván không bị tải lại');
  assert.equal(await page.isVisible('#settings-dialog'), false);
});

test('sao chép PGN không có clipboard API: dùng cách cũ hoặc báo rõ, không im lặng', async () => {
  const page = await open({ extraInit: () => { Object.defineProperty(navigator, 'clipboard', { value: undefined }); } });
  await startGame(page);
  await say(page, 'xin thua');
  await waitSpoken(page, /xin thua\?$/);
  await say(page, 'đúng');
  await page.waitForSelector('#screen-gameover', { state: 'visible' });
  await page.click('#btn-copy');
  await page.waitForFunction(() => document.getElementById('btn-copy').textContent !== 'Sao chép PGN');
  const text = await page.textContent('#btn-copy');
  assert.ok(text === 'Đã sao chép.' || text === 'Không sao chép được', text);
  if (text === 'Không sao chép được') assert.ok((await page.evaluate(() => window.__blindfold.getCueLog())).includes('error'));
});

test('điện thoại nằm ngang 740×360: bàn cờ khi xem và dòng đếm ngược nằm trọn trong màn hình', async () => {
  const page = await open({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true, timing: { peekMs: 10000 } });
  await startGame(page);
  await waitPlayerReady(page);
  await page.tap('[data-testid=hint-peek]');
  await page.waitForSelector('[data-testid=board]', { state: 'visible' });
  const b = await page.locator('[data-testid=board]').boundingBox();
  const c = await page.locator('[data-testid=peek-countdown]').boundingBox();
  assert.ok(b.y >= 0 && b.y + b.height <= 360, `bàn cờ y=${b.y} h=${b.height}`);
  assert.ok(c.y >= 0 && c.y + c.height <= 360, `đếm ngược y=${c.y} h=${c.height}`);
  await page.tap('#screen-peek');
  await waitSpoken(page, /^Đã che lại\.$/);
});

test('màn hình hẹp 320px: đồng hồ và nút không tràn', async () => {
  const page = await open({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  await startGame(page, { timeControl: '15+10' });
  await waitPlayerReady(page);
  const m = await page.evaluate(() => {
    const clocks = document.getElementById('clocks');
    const over = [...document.querySelectorAll('.clocks, .hints, .actions, .btn')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className);
    return { clocksOverflow: clocks.scrollWidth - clocks.clientWidth, over, sw: document.documentElement.scrollWidth, iw: window.innerWidth };
  });
  assert.ok(m.clocksOverflow <= 0, `đồng hồ tràn ${m.clocksOverflow}px`);
  assert.deepEqual(m.over, []);
  assert.ok(m.sw <= m.iw);
});

test('danh sách nước đi cuộn tới nước đang xem', async () => {
  const page = await open({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
  await startGame(page);
  const engineMoves = ['a7a6', 'a6a5', 'b7b6', 'b6b5', 'c7c6', 'c6c5', 'd7d6', 'h7h6', 'h6h5', 'g7g6', 'g6g5', 'f7f6', 'f6f5', 'e7e6'];
  await page.evaluate((ms) => ms.forEach((m) => window.__blindfold.forceEngineMove(m)), engineMoves);
  const playerMoves = ['a3', 'a4', 'b3', 'b4', 'c3', 'c4', 'd3', 'h3', 'h4', 'g3', 'g4', 'f3', 'f4', 'e3'];
  for (let i = 0; i < playerMoves.length; i++) {
    await say(page, playerMoves[i]);
    await waitEngineMoved(page, 2 * i + 1);
  }
  await say(page, 'xin thua');
  await waitSpoken(page, /xin thua\?$/);
  await say(page, 'đúng');
  await page.waitForSelector('#screen-gameover', { state: 'visible' });
  const inView = await page.evaluate(() => {
    const list = document.getElementById('movelist');
    const cur = list.querySelector('button.current');
    const lr = list.getBoundingClientRect();
    const r = cur.getBoundingClientRect();
    return r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1;
  });
  assert.equal(inView, true, 'nước cuối nằm trong khung cuộn');
  await page.click('#nav-first');
  const firstInView = await page.evaluate(() => {
    const list = document.getElementById('movelist');
    const first = list.querySelector('button[data-ply="1"]');
    const lr = list.getBoundingClientRect();
    const r = first.getBoundingClientRect();
    return r.top >= lr.top - 1;
  });
  assert.equal(firstInView, true);
});

test('Enter trong ô số của đồng hồ tùy chỉnh không bắt đầu ván', async () => {
  const page = await open();
  await page.selectOption('#timeControl', 'custom');
  await page.fill('#customMinutes', '3');
  await page.press('#customMinutes', 'Enter');
  await page.waitForTimeout(300);
  assert.equal((await state(page)).screen, 'setup');
});

test('trình duyệt không có WebAssembly SIMD: báo đúng nguyên nhân, không bảo "tải lại trang"', async () => {
  const page = await open({
    extraInit: () => { WebAssembly.validate = () => false; },
    waitEngine: false,
  });
  await page.waitForFunction(() => /quá cũ/.test(document.getElementById('engine-status').textContent));
  assert.equal(await page.isDisabled('[data-testid=start]'), true);
  assert.match(await page.textContent('#warnings'), /Safari\/iOS 16\.4/);
  assert.ok(!/tải lại trang/.test(await page.textContent('#warnings')));
});

test('không có nhận dạng giọng nói: màn chơi gợi ý gõ nước đi thay vì "chạm để nói"', async () => {
  const page = await open({ extraInit: () => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; } });
  await startGame(page);
  await page.waitForFunction(() => window.__blindfold.getState().phase === 'player' && !window.__fakeSynth.speaking);
  assert.match(await page.textContent('#mic-hint'), /Gõ nước đi/);
});

test('mất quyền micro giữa ván: cảnh báo hiện ngay trên màn chơi', async () => {
  const page = await open({
    extraInit: () => {
      const Orig = window.SpeechRecognition;
      class Denied extends Orig {
        start() { super.start(); window.__fakeRecognition.active = null; setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 0); }
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: Denied, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: Denied, configurable: true });
    },
  });
  await startGame(page);
  await waitPlayerReady(page);
  await page.click('[data-testid=talk]');
  await waitSpoken(page, /^Không dùng được micro\.$/);
  assert.equal(await page.isVisible('#play-alert'), true);
  assert.match(await page.textContent('#play-alert'), /quyền dùng micro/);
  const errs = current().errors;
  assert.ok(errs.every((e) => e.includes('not-allowed')), errs.join('\n'));
  errs.length = 0;
});

test('xác nhận: "đúng" ở phương án 1 không bị phương án 2 (một nước khác) đè', async () => {
  const page = await open();
  await startGame(page, { confirm: true });
  await say(page, 'e4');
  await waitSpoken(page, /^Tốt e 4\. Đúng không\?$/);
  await say(page, ['đúng', 'dê bốn']);
  await waitEngineMoved(page, 1);
  assert.equal((await state(page)).uciMoves[0], 'e2e4');
});
