// Chụp ảnh các màn hình chính vào docs/screenshots/ (dùng micro/TTS giả của bộ test e2e).
// Chạy: node tools/screenshots.mjs
import { setupSuite, openApp, startGame, say, waitEngineMoved, waitPlayerReady } from '../e2e/helpers/app.js';

const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 860 } };

const suite = await setupSuite();
try {
  for (const [name, opts] of [['mobile', MOBILE], ['desktop', DESKTOP]]) {
    const { page, context } = await openApp(suite, { ...opts, timing: { peekMs: 10000 } });
    await page.screenshot({ path: `${OUT}${name}-1-setup.png`, fullPage: name === 'desktop' });

    await startGame(page, { timeControl: '15+10', confirm: true });
    await page.evaluate(() => {
      for (const m of ['e7e5', 'b8c6', 'g8f6']) window.__blindfold.forceEngineMove(m);
    });
    const play = async (text, ply) => {
      await say(page, text);
      await page.waitForFunction(() => window.__blindfold.getState().phase === 'confirm');
      await say(page, 'đúng');
      if (ply !== null) await waitEngineMoved(page, ply);
    };
    await play('e4', 1);
    await play('tượng c4', 3);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}${name}-2-play.png` });

    await page.click('[data-testid=talk]');
    await page.waitForFunction(() => !!window.__fakeRecognition.active);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${name}-3-listening.png` });
    await page.evaluate(() => window.__fakeRecognition.emit('hậu h5'));
    await page.waitForFunction(() => window.__blindfold.getState().phase === 'confirm' && !window.__fakeSynth.speaking);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${name}-4-confirm.png` });
    await say(page, 'đúng');
    await waitEngineMoved(page, 5);

    await waitPlayerReady(page);
    await page.click('[data-testid=hint-peek]');
    await page.waitForSelector('[data-testid=board]', { state: 'visible' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}${name}-5-peek.png` });
    await page.click('#screen-peek');
    await waitPlayerReady(page);

    await play('hậu ăn f7', null);
    await page.waitForSelector('#screen-gameover', { state: 'visible' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}${name}-6-gameover.png`, fullPage: true });
    await context.close();
  }
  console.log('Đã lưu ảnh vào', OUT);
} finally {
  await suite.close();
}
