// E17 và các tình huống an toàn khác: micro, trình duyệt không hỗ trợ, nghe liên tục, gõ tay.
import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {
  registerSuite, startGame, say, state, spoken, waitSpoken, waitEngineMoved, waitPlayerReady,
  micDisciplineViolations,
} from './helpers/app.js';

const { test } = nodeTest;
const { open, current } = registerSuite(nodeTest);

test('E17: chuỗi dài có lỗi, hỏi lại, xác nhận — micro không bao giờ mở sai lúc', async () => {
  const page = await open();
  await startGame(page, { confirm: true, color: 'b', timeControl: '10+5' });
  await waitEngineMoved(page, 0);
  const script = [
    ['xyz', /Không hiểu/],
    ['hậu h4', /không hợp lệ/],
    ['e5', /Đúng không\?$/],
    ['sai', /^Đã hủy\.$/],
    ['quân ở đâu', /Còn một lượt/],
    ['nhắc lại', /^Máy vừa đi/],
  ];
  for (const [text, expect] of script) {
    const from = (await spoken(page)).length;
    await say(page, text);
    await waitSpoken(page, expect, from);
  }
  await say(page, 'mã f6');
  await waitSpoken(page, /^Mã ép 6\. Đúng không\?$/);
  await say(page, 'đúng');
  await waitEngineMoved(page, 2);
  // Chạm khi máy đang nghĩ / đang đọc thì không mở micro
  await page.evaluate(() => window.__blindfold.setEngineDelay(400));
  await say(page, 'e6');
  await waitSpoken(page, /Đúng không\?$/);
  await say(page, 'đúng');
  await page.waitForFunction(() => window.__blindfold.getState().phase === 'engine');
  await page.click('[data-testid=talk]');
  await page.click('[data-testid=talk]');
  assert.equal(await page.evaluate(() => !!window.__fakeRecognition.active), false);
  await waitEngineMoved(page, 4);
  const v = await micDisciplineViolations(page);
  assert.ok(v.count >= 10, `đã mở micro ${v.count} lần`);
  assert.deepEqual(v.bad, []);
});

test('nút trợ giúp khi máy đang nghĩ → "Chờ máy đi xong", không dùng mất lượt', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => window.__blindfold.setEngineDelay(800));
  await say(page, 'e4');
  await page.waitForFunction(() => window.__blindfold.getState().phase === 'engine');
  await page.click('[data-testid=hint-locate]');
  await waitSpoken(page, /^Chờ máy đi xong\.$/);
  await waitEngineMoved(page, 1);
  assert.equal((await state(page)).hints.locatesLeft, 2);
});

test('trình duyệt không có nhận dạng giọng nói → cảnh báo + gõ nước đi vẫn chơi được', async () => {
  const page = await open({
    extraInit: () => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    },
  });
  assert.match(await page.textContent('#warnings'), /không hỗ trợ nhận dạng giọng nói/);
  await startGame(page);
  await waitPlayerReady(page).catch(() => {});
  await page.waitForFunction(() => window.__blindfold.getState().phase === 'player' && !window.__fakeSynth.speaking);
  assert.equal(await page.getAttribute('#type-box', 'open'), '');
  await page.fill('#type-input', 'Nf3');
  await page.press('#type-input', 'Enter');
  await page.waitForFunction(() => window.__blindfold.getState().ply >= 2);
  assert.equal((await state(page)).uciMoves[0], 'g1f3');
  await page.waitForFunction(() => window.__blindfold.getState().busy === 0 && !window.__fakeSynth.speaking);
  await page.fill('#type-input', 'e2e4');
  await page.press('#type-input', 'Enter');
  await page.waitForFunction(() => window.__blindfold.getState().ply >= 4);
  assert.equal((await state(page)).uciMoves[2], 'e2e4');
  await page.waitForFunction(() => window.__blindfold.getState().busy === 0 && !window.__fakeSynth.speaking);
  await page.fill('#type-input', 'xem bàn cờ');
  await page.press('#type-input', 'Enter');
  await waitSpoken(page, /^Mở bàn cờ trong mười giây\.$/);
});

test('gõ tay nhiều nước liên tiếp (SAN)', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => {
    for (const m of ['d7d5', 'g8f6', 'e7e6']) window.__blindfold.forceEngineMove(m);
  });
  for (const [mv, ply] of [['d4', 2], ['c4', 4], ['Nc3', 6]]) {
    await page.click('#type-box summary');
    await page.fill('#type-input', mv);
    await page.press('#type-input', 'Enter');
    await page.waitForFunction((p) => window.__blindfold.getState().ply >= p && window.__blindfold.getState().busy === 0, ply);
    await page.click('#type-box summary');
  }
  assert.deepEqual((await state(page)).uciMoves.filter((_, i) => i % 2 === 0), ['d2d4', 'c2c4', 'b1c3']);
});

test('chế độ nghe liên tục: micro tự mở lại sau mỗi lượt, không nói "không nghe thấy"', async () => {
  const page = await open();
  await startGame(page, { listenMode: 'continuous' });
  await page.waitForFunction(() => !!window.__fakeRecognition.active, null, { timeout: 10000 });
  await page.evaluate(() => window.__fakeRecognition.emit('e4'));
  await waitEngineMoved(page, 1);
  await page.waitForFunction(() => !!window.__fakeRecognition.active, null, { timeout: 10000 });
  await page.evaluate(() => window.__fakeRecognition.silence());
  await page.waitForFunction(() => !!window.__fakeRecognition.active, null, { timeout: 10000 });
  assert.equal((await spoken(page)).some((t) => t.includes('Không nghe thấy')), false);
  await page.evaluate(() => window.__fakeRecognition.emit('mã f3'));
  await waitEngineMoved(page, 3);
  assert.equal((await state(page)).uciMoves[2], 'g1f3');
});

test('chạm để nói: im lặng → "Không nghe thấy gì", micro không tự mở lại', async () => {
  const page = await open();
  await startGame(page);
  await waitPlayerReady(page);
  await page.click('[data-testid=talk]');
  await page.waitForFunction(() => !!window.__fakeRecognition.active);
  await page.evaluate(() => window.__fakeRecognition.silence());
  await waitSpoken(page, /^Không nghe thấy gì\.$/);
  await waitPlayerReady(page);
  assert.equal(await page.evaluate(() => !!window.__fakeRecognition.active), false);
});

test('micro bị từ chối quyền → cảnh báo và báo bằng giọng', async () => {
  const page = await open({
    extraInit: () => {
      const Orig = window.SpeechRecognition;
      class Denied extends Orig {
        start() {
          super.start();
          window.__fakeRecognition.active = null;
          setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 0);
        }
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: Denied, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: Denied, configurable: true });
    },
  });
  await startGame(page);
  await waitPlayerReady(page);
  await page.click('[data-testid=talk]');
  await waitSpoken(page, /^Không dùng được micro\.$/);
  assert.match(await page.textContent('#warnings'), /quyền dùng micro/);
  // Lỗi này là lỗi được mong đợi trong kịch bản: kiểm tra rồi bỏ khỏi danh sách lỗi console.
  const errs = current().errors;
  assert.ok(errs.every((e) => e.includes('not-allowed')), errs.join('\n'));
  errs.length = 0;
});

test('Safari iOS: micro tự mở bị từ chối → im lặng, chạm để trả lời vẫn được', async () => {
  const page = await open({
    extraInit: () => {
      // Giả lập iOS: chỉ cho mở micro khi do người chơi chạm (không phải tự mở).
      const Orig = window.SpeechRecognition;
      class IosLike extends Orig {
        start() {
          if (window.__blindfold?.getState().lastStartAuto) {
            window.__fakeRecognition.starts.push({ at: performance.now(), state: window.__blindfold.getState(), ttsBusy: false, denied: true });
            setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 0);
            return;
          }
          super.start();
        }
      }
      Object.defineProperty(window, 'SpeechRecognition', { value: IosLike, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: IosLike, configurable: true });
    },
  });
  await startGame(page, { confirm: true });
  await say(page, 'e4');
  await waitSpoken(page, /^Tốt e 4\. Đúng không\?$/);
  await page.waitForFunction(() => window.__fakeRecognition.starts.some((s) => s.denied));
  await waitPlayerReady(page);
  assert.equal((await state(page)).phase, 'confirm');
  assert.match(await page.textContent('#mic-hint'), /Chạm để trả lời/);
  await say(page, 'đúng');
  await waitEngineMoved(page, 1);
  assert.equal((await spoken(page)).some((t) => t.includes('Không dùng được micro')), false);
  assert.equal(await page.textContent('#warnings'), '');
  const errs = current().errors;
  assert.ok(errs.every((e) => e.includes('not-allowed')), errs.join('\n'));
  errs.length = 0;
});

test('phím cách khi focus đang ở nút khác: mở micro, không bấm nút đó', async () => {
  const page = await open();
  await startGame(page);
  await waitPlayerReady(page);
  await page.focus('#btn-repeat');
  const before = (await spoken(page)).length;
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !!window.__fakeRecognition.active);
  await page.evaluate(() => window.__fakeRecognition.emit('e4'));
  await waitEngineMoved(page, 1);
  assert.equal((await spoken(page)).slice(before).some((t) => t.startsWith('Máy vừa đi')), false, 'nút Nhắc lại không bị bấm');
  assert.equal((await state(page)).uciMoves[0], 'e2e4');
});

test('chạm vào vùng đồng hồ / ngoài nút cũng mở micro', async () => {
  const page = await open();
  await startGame(page, { timeControl: '5+0' });
  await waitPlayerReady(page);
  await page.click('[data-testid=clock-engine]');
  await page.waitForFunction(() => !!window.__fakeRecognition.active);
  await page.evaluate(() => window.__fakeRecognition.emit('e4'));
  await waitEngineMoved(page, 1);
  assert.equal((await state(page)).ply, 2);
});

test('xác nhận: nhắc lại đúng nước → đồng ý; nói nước khác → đổi nước và hỏi lại', async () => {
  const page = await open();
  await startGame(page, { confirm: true });
  await page.evaluate(() => { window.__blindfold.forceEngineMove('e7e5'); window.__blindfold.forceEngineMove('b8c6'); });
  await say(page, 'e4');
  await waitSpoken(page, /^Tốt e 4\. Đúng không\?$/);
  await say(page, 'mã f3');
  await waitSpoken(page, /^Mã ép 3\. Đúng không\?$/);
  assert.equal((await state(page)).ply, 0, 'chưa đi khi chưa đồng ý');
  await say(page, 'mã f3');
  await waitEngineMoved(page, 1);
  assert.equal((await state(page)).uciMoves[0], 'g1f3');
  // "không" kèm nước đang chờ → hủy
  await say(page, 'e4');
  await waitSpoken(page, /^Tốt e 4\. Đúng không\?$/, 3);
  await say(page, 'không e4');
  await waitSpoken(page, /^Đã hủy\.$/);
  assert.equal((await state(page)).ply, 2);
});

test('gõ tay khi đang tạm dừng và khi đang chờ xác nhận', async () => {
  const page = await open();
  await startGame(page, { timeControl: '5+0', confirm: true });
  await say(page, 'tạm dừng');
  await waitSpoken(page, /^Đã tạm dừng\./);
  await page.click('#type-box summary');
  await page.fill('#type-input', 'e4');
  await page.press('#type-input', 'Enter');
  await waitSpoken(page, /^Đang tạm dừng\. Nói tiếp tục\.$/);
  await page.waitForFunction(() => window.__blindfold.getState().busy === 0 && !window.__fakeSynth.speaking);
  await page.fill('#type-input', 'tiếp tục');
  await page.press('#type-input', 'Enter');
  await waitSpoken(page, /^Tiếp tục\.$/);
  await page.waitForFunction(() => window.__blindfold.getState().phase === 'player' && window.__blindfold.getState().clocks.running);
  await say(page, 'e4');
  await waitSpoken(page, /^Tốt e 4\. Đúng không\?$/);
  await page.waitForFunction(() => window.__blindfold.getState().busy === 0 && !window.__fakeSynth.speaking);
  await page.fill('#type-input', 'đúng');
  await page.press('#type-input', 'Enter');
  await waitEngineMoved(page, 1);
  assert.equal((await state(page)).uciMoves[0], 'e2e4');
});

test('engine hỏng giữa ván → tự khởi động lại, ván tiếp tục không báo lỗi', async () => {
  const page = await open();
  await startGame(page);
  await page.evaluate(() => window.__blindfold.failEngine(1));
  await say(page, 'e4');
  await waitEngineMoved(page, 1, 60000);
  const s = await state(page);
  assert.equal(s.ply, 2);
  assert.equal(s.engineReady, true);
  assert.equal((await spoken(page)).some((t) => t.includes('Máy gặp lỗi')), false);
  await say(page, 'mã f3');
  await waitEngineMoved(page, 3);
  const errs = current().errors;
  assert.ok(errs.every((e) => e.includes('khởi động lại') || e.includes('giả lập')), errs.join('\n'));
  errs.length = 0;
});

test('cảnh báo "còn một phút" không lặp lại sau mỗi lần cộng giây', async () => {
  const page = await open();
  await startGame(page, { timeControl: '15+10' });
  await waitPlayerReady(page);
  await page.evaluate(() => window.__blindfold.setClockTime('player', 60500));
  await waitSpoken(page, /^Còn một phút\.$/, 0, 5000);
  await waitPlayerReady(page);
  // Cộng 10 giây rồi lại tụt xuống dưới 1 phút: không nhắc lại
  await page.evaluate(() => window.__blindfold.setClockTime('player', 70000));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__blindfold.setClockTime('player', 59000));
  await page.waitForTimeout(800);
  assert.equal((await spoken(page)).filter((t) => t === 'Còn một phút.').length, 1);
});

test('ván lưu bị thiếu dữ liệu đồng hồ vẫn tiếp tục được và kết thúc không lỗi', async () => {
  const page = await open();
  await page.evaluate(() => {
    localStorage.setItem('blindfold.game', JSON.stringify({
      v: 1, uciMoves: ['e2e4', 'e7e5'], playerColor: 'x', elo: '1600', hints: { peeksLeft: 'a' },
      clock: { remaining: { w: 'abc' } }, timeControl: null,
    }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__blindfold?.getState().engineReady === true, null, { timeout: 30000 });
  await page.evaluate(() => window.__blindfold.setTiming({ engineDelayMs: 0, postTtsMs: 0 }));
  await page.click('#btn-resume');
  await waitPlayerReady(page);
  const s = await state(page);
  assert.equal(s.playerColor, 'w');
  assert.equal(s.elo, 1600);
  assert.equal(s.clocks, null);
  assert.deepEqual(s.hints, { peeksLeft: 1, locatesLeft: 2 });
  await say(page, 'xin thua');
  await waitSpoken(page, /xin thua\?$/);
  await say(page, 'đúng');
  await page.waitForFunction(() => window.__blindfold.getState().over);
  await page.waitForSelector('#screen-gameover', { state: 'visible' });
});

test('giọng đọc của trình duyệt bị lỗi (không có giọng) → ván vẫn chạy, không kẹt', async () => {
  const page = await open({ fakes: { realSynth: true } });
  await startGame(page, { confirm: true });
  await say(page, 'e4');
  await waitSpoken(page, /Đúng không\?$/);
  await say(page, 'đúng');
  await waitEngineMoved(page, 1, 30000);
  assert.equal((await state(page)).ply, 2);
  const errs = current().errors;
  assert.ok(errs.every((e) => /\[tts\]/.test(e)), errs.join('\n'));
  errs.length = 0;
});
