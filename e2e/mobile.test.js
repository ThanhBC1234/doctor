// E19: giao diện điện thoại.
import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { registerSuite, startGame, state, waitPlayerReady, waitEngineMoved, waitSpoken } from './helpers/app.js';

const { test } = nodeTest;
const { open } = registerSuite(nodeTest);

const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function noHorizontalScroll(page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(sw <= iw, `tràn ngang: ${sw} > ${iw}`);
}

test('E19: điện thoại 390×844 — không tràn ngang, vùng chạm lớn, chữ to, chạm để nói', async () => {
  const page = await open(MOBILE);
  await noHorizontalScroll(page);
  assert.equal(await page.isVisible('#listen-mode-field'), false, 'ẩn "nghe liên tục" trên điện thoại');

  await startGame(page, { timeControl: '15+10' });
  await waitPlayerReady(page);
  await noHorizontalScroll(page);
  const m = await page.evaluate(() => {
    const talk = document.querySelector('[data-testid=talk]').getBoundingClientRect();
    const status = getComputedStyle(document.querySelector('[data-testid=status]'));
    return { talkH: talk.height, vh: window.innerHeight, font: parseFloat(status.fontSize) };
  });
  assert.ok(m.talkH >= 0.6 * m.vh, `vùng chạm ${m.talkH}px / ${m.vh}px`);
  assert.ok(m.font >= 24, `cỡ chữ trạng thái ${m.font}px`);

  await page.tap('[data-testid=talk]');
  await page.waitForFunction(() => !!window.__fakeRecognition.active);
  assert.equal(await page.getAttribute('#screen-play', 'data-phase'), 'listening');
  await page.evaluate(() => window.__fakeRecognition.emit('e4'));
  await waitEngineMoved(page, 1);

  // Bàn cờ khi tháo bịt mắt vừa màn hình
  await page.evaluate(() => window.__blindfold.setTiming({ peekMs: 3000 }));
  await page.tap('[data-testid=hint-peek]');
  await page.waitForSelector('[data-testid=board]', { state: 'visible' });
  const b = await page.locator('[data-testid=board]').boundingBox();
  assert.ok(b.width <= 390 && b.x >= 0, `bàn cờ rộng ${b.width}`);
  await noHorizontalScroll(page);
  await page.tap('#screen-peek');
  await waitSpoken(page, /^Đã che lại\.$/);

  // Màn kết thúc
  await waitPlayerReady(page);
  await page.evaluate(() => window.__blindfold.setClockTime('player', 500));
  await page.waitForSelector('#screen-gameover', { state: 'visible' });
  await noHorizontalScroll(page);
  assert.equal((await state(page)).over, true);
});

test('E19b: viewport meta và manifest PWA', async () => {
  const page = await open(MOBILE);
  const vp = await page.getAttribute('meta[name=viewport]', 'content');
  assert.match(vp, /width=device-width/);
  const res = await page.request.get(new URL('manifest.webmanifest', page.url()).href);
  assert.equal(res.status(), 200);
  const manifest = await res.json();
  assert.equal(manifest.short_name, 'Cờ mù');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const r = await page.request.get(new URL(icon.src, page.url()).href);
    assert.equal(r.status(), 200, icon.src);
  }
});
