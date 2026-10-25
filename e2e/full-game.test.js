// Lớp 3: ván đấu tự động đầu-cuối. "Người chơi" chọn nước ngẫu nhiên (có hạt giống),
// nói bằng câu tiếng Việt do speakMove tạo ra, qua đúng đường micro giả → parser → engine → TTS.
import * as nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { registerSuite, startGame, say, state, waitSpoken, waitPlayerReady } from './helpers/app.js';
import { speakMove } from '../js/speech/speak-move.js';
import { Chess } from '../vendor/chess.js/chess.js';
import { rng } from '../tests/helpers.js';

const { test } = nodeTest;
const { open } = registerSuite(nodeTest);

const MAX_PLIES = 150;

/** Nước ngẫu nhiên nhưng tránh nước để đối phương chiếu hết ngay (để ván dài hơn, kiểm được nhiều hơn). */
function pickMove(fen, rand) {
  const c = new Chess(fen);
  const legal = c.moves({ verbose: true });
  const safe = legal.filter((m) => {
    const t = new Chess(fen);
    t.move(m);
    return !t.moves({ verbose: true }).some((r) => r.san.endsWith('#'));
  });
  const pool = safe.length ? safe : legal;
  return pool[Math.floor(rand() * pool.length)];
}

const GAMES = [
  { elo: 1000, color: 'w', fileStyle: 'vi', confirm: false, announce: false, seed: 1 },
  { elo: 1800, color: 'b', fileStyle: 'nato', confirm: true, announce: false, seed: 2 },
  { elo: 2500, color: 'w', fileStyle: 'vi', confirm: false, announce: true, seed: 3 },
];

for (const g of GAMES) {
  test(`ván tự động: Elo ${g.elo}, cầm ${g.color === 'w' ? 'Trắng' : 'Đen'}, đọc cột ${g.fileStyle}, xác nhận ${g.confirm ? 'bật' : 'tắt'}`, { timeout: 600000 }, async () => {
    const page = await open();
    await startGame(page, {
      elo: g.elo, color: g.color, fileStyle: g.fileStyle, confirm: g.confirm, announce: g.announce, timeControl: '30+0',
    });
    const rand = rng(g.seed);
    let playerMoves = 0;
    let slowest = 0;

    for (;;) {
      await page.waitForFunction(() => {
        const s = window.__blindfold.getState();
        return s.over || ((s.canListen || s.listening) && s.turn === s.playerColor && !window.__fakeSynth.speaking);
      }, null, { timeout: 30000 });
      const s = await state(page);
      if (s.over || s.ply >= MAX_PLIES) break;

      const move = pickMove(s.fen, rand);
      const utterance = speakMove(move, { fileStyle: g.fileStyle, announceCaptures: g.announce });
      const t0 = Date.now();
      await say(page, utterance);
      if (g.confirm) {
        await waitSpoken(page, /Đúng không\?$/, 0, 10000);
        await say(page, 'đúng');
      }
      await page.waitForFunction((p) => {
        const st = window.__blindfold.getState();
        return st.over || (st.ply >= p + 2 && st.busy === 0 && !window.__fakeSynth.speaking);
      }, s.ply, { timeout: 15000 });
      const after = await state(page);
      assert.equal(after.uciMoves[s.ply], `${move.from}${move.to}${move.promotion || ''}`, `nước ${playerMoves + 1}: "${utterance}"`);
      slowest = Math.max(slowest, Date.now() - t0);
      playerMoves++;
    }

    const end = await state(page);
    assert.ok(playerMoves >= 10, `đã đi ${playerMoves} nước`);
    assert.ok(slowest < 5000, `nước chậm nhất ${slowest} ms`);
    // Ván ghi nhận hợp lệ: dựng lại từ danh sách UCI cho ra cùng FEN
    const replay = new Chess();
    for (const u of end.uciMoves) replay.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    assert.equal(replay.fen(), end.fen);
    if (end.over) {
      await page.waitForSelector('#screen-gameover', { state: 'visible' });
      const pgn = await page.evaluate(() => window.__blindfold.getPgn());
      const c = new Chess();
      c.loadPgn(pgn);
      assert.equal(c.history().length, end.ply);
      assert.match(pgn, new RegExp(`\\[Result "${end.result.replace('/', '\\/')}"\\]`));
    }
    console.log(`  Elo ${g.elo}: ${end.ply} nửa nước, ${end.over ? `kết thúc (${end.status.reason}, ${end.result})` : 'dừng ở giới hạn'}, nước chậm nhất ${slowest} ms`);
  });
}
