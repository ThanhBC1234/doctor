// Tiện ích chung cho test đầu-cuối.
import { createRequire } from 'node:module';
import { startServer } from './server.js';
import { installFakes } from './fakes.js';

// require (không phải import) để dùng được Playwright cài toàn cục qua NODE_PATH trong môi trường cloud.
const { chromium } = createRequire(import.meta.url)('playwright');

/** Một trình duyệt + server dùng chung cho cả file test. */
export async function setupSuite() {
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
  return {
    server,
    browser,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/**
 * Mở trang ở chế độ test, cài micro/TTS giả, gom lỗi console.
 * @returns {Promise<{page: import('playwright').Page, errors: string[], context: import('playwright').BrowserContext}>}
 */
export async function openApp(suite, opts = {}) {
  const context = await suite.browser.newContext({
    viewport: opts.viewport || { width: 1100, height: 900 },
    hasTouch: !!opts.hasTouch,
    isMobile: !!opts.isMobile,
    acceptDownloads: true,
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript(installFakes);
  if (opts.extraInit) await page.addInitScript(opts.extraInit);
  await page.goto(`${suite.server.url}/${opts.query ?? '?test=1'}`);
  await page.waitForFunction(() => window.__blindfold?.getState().engineReady === true, null, { timeout: 30000 });
  // Test chạy nhanh: bỏ độ trễ giả lập
  await page.evaluate((t) => window.__blindfold.setTiming(t), {
    engineDelayMs: 0, postTtsMs: 0, peekMs: 10000, ...(opts.timing || {}),
  });
  return { page, errors, context };
}

export const state = (page) => page.evaluate(() => window.__blindfold.getState());
export const spoken = (page) => page.evaluate(() => window.__blindfold.getSpokenLog());

/** Chờ điều kiện trên trạng thái app (hàm chạy trong trang). */
export async function waitFor(page, predicate, arg, timeout = 15000) {
  await page.waitForFunction(predicate, arg, { timeout });
}

/** Chờ tới khi người chơi có thể nói (đến lượt, TTS im, máy không nghĩ). */
export async function waitPlayerReady(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const s = window.__blindfold.getState();
    return (s.canListen || s.listening) && !window.__fakeSynth.speaking;
  }, null, { timeout });
}

/**
 * Bắt đầu ván qua giao diện cài đặt.
 * @param {object} settings ghi đè cài đặt (elo, color, timeControl, confirm…)
 */
export async function startGame(page, settings = {}) {
  await page.evaluate((s) => window.__blindfold.setSettings(s), {
    confirm: false, color: 'w', timeControl: 'none', elo: 1400, announce: false, listenMode: 'tap', ...settings,
  });
  await page.click('[data-testid=start]');
  await page.waitForFunction(() => window.__blindfold.getState().screen === 'play');
}

/**
 * Nói một câu: chạm màn hình (nếu micro chưa mở) rồi bắn kết quả nhận dạng giả.
 * @param {string|string[]} alternatives
 */
export async function say(page, alternatives) {
  await waitPlayerReady(page);
  const listening = await page.evaluate(() => !!window.__fakeRecognition.active);
  if (!listening) await page.click('[data-testid=talk]');
  await page.waitForFunction(() => !!window.__fakeRecognition.active, null, { timeout: 5000 });
  await page.evaluate((a) => window.__fakeRecognition.emit(a), alternatives);
}

/** Chờ TTS đọc một câu khớp regex (tính từ vị trí log hiện tại trở đi nếu có from). */
export async function waitSpoken(page, pattern, from = 0, timeout = 20000) {
  await page.waitForFunction(({ src, flags, from: f }) => {
    const re = new RegExp(src, flags);
    return window.__blindfold.getSpokenLog().slice(f).some((t) => re.test(t));
  }, { src: pattern.source, flags: pattern.flags, from }, { timeout });
}

export async function spokenCount(page) {
  return (await spoken(page)).length;
}

/** Chờ máy đi xong và tới lượt người chơi. */
export async function waitEngineMoved(page, plyBefore, timeout = 20000) {
  await page.waitForFunction((p) => {
    const s = window.__blindfold.getState();
    return s.ply > p && (s.over || (s.turn === s.playerColor && !window.__fakeSynth.speaking && s.busy === 0));
  }, plyBefore, { timeout });
}

/**
 * E17: micro không bao giờ mở khi chưa tới lượt người chơi hoặc khi TTS đang đọc.
 * Gọi ở cuối mỗi test.
 */
export async function micDisciplineViolations(page) {
  const starts = await page.evaluate(() => window.__fakeRecognition.starts);
  const bad = [];
  for (const s of starts) {
    const st = s.state;
    if (!st) { bad.push({ reason: 'không có trạng thái', s }); continue; }
    if (s.ttsBusy || st.speaking) bad.push({ reason: 'TTS đang đọc', st });
    if (st.turn !== st.playerColor) bad.push({ reason: 'chưa tới lượt người chơi', st });
    if (!['player', 'confirm', 'paused', 'peek'].includes(st.phase)) bad.push({ reason: `phase ${st.phase}`, st });
    if (st.busy > 0) bad.push({ reason: 'đang xử lý', st });
  }
  return { count: starts.length, bad };
}

/** Thế cờ hiện tại → nước cuối dạng verbose (chess.js) để so với câu máy đọc. */
export async function lastMoveVerbose(page) {
  const { Chess } = await import('../../vendor/chess.js/chess.js');
  const s = await state(page);
  const c = new Chess();
  for (const u of s.uciMoves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  const h = c.history({ verbose: true });
  return { move: h[h.length - 1], chess: c };
}

/**
 * Đăng ký before/after/afterEach chuẩn cho một file test:
 * mỗi test mở trang riêng; cuối test kiểm tra micro (E17) và lỗi console.
 * @returns {{ open: (opts?: object) => Promise<import('playwright').Page>, suite: () => object, current: () => object }}
 */
export function registerSuite(nodeTest) {
  let suite;
  let current = null;
  nodeTest.before(async () => { suite = await setupSuite(); });
  nodeTest.after(async () => { await suite?.close(); });
  nodeTest.afterEach(async () => {
    if (!current) return;
    const { page, errors, context } = current;
    current = null;
    const v = await micDisciplineViolations(page);
    await context.close();
    if (v.bad.length) throw new Error(`E17: micro mở sai lúc: ${JSON.stringify(v.bad).slice(0, 800)}`);
    if (errors.length) throw new Error(`Lỗi console: ${errors.join('\n')}`);
  });
  return {
    async open(opts) {
      current = await openApp(suite, opts);
      return current.page;
    },
    suite: () => suite,
    current: () => current,
  };
}
