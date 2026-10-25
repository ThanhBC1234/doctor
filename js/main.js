// Điều khiển chính: nối giọng nói, engine, đồng hồ, giao diện. Máy trạng thái ván đấu:
//
//   idle → (máy đi) engine → player ⇄ confirm → engine → … → over
//                         player → peek → player
//                         player ⇄ paused
//
// Quy tắc an toàn: micro chỉ bật khi đến lượt người chơi, TTS im lặng, máy không nghĩ (canListen).

import { VI } from './i18n/vi.js';
import { createStore } from './state.js';
import { createGame } from './game.js';
import { createEngine, createWorkerTransport } from './engine.js';
import { createClock, TIME_CONTROLS, pgnTimeControl } from './clock.js';
import { createHints } from './hints.js';
import { loadSettings, saveSettings, loadGame, saveGame, clearGame } from './storage.js';
import { buildPgn, lichessAnalysisUrl, pgnFileName } from './pgn.js';
import { createTts } from './speech/tts.js';
import { createRecognizer } from './speech/recognition.js';
import { parseUtterance } from './speech/parser.js';
import { speakMove, describeIntent, describePieces } from './speech/speak-move.js';
import { applyI18n, showScreen, announce } from './ui/screens.js';
import { bindSetupForm } from './ui/setup-form.js';
import { createHud } from './ui/play-hud.js';
import { renderBoard, clearBoard } from './ui/board.js';
import { showGameover } from './ui/gameover.js';
import { createAudioCues } from './ui/audio-cues.js';

const TEST_MODE = new URLSearchParams(location.search).has('test');
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const other = (c) => (c === 'w' ? 'b' : 'w');

/** Các khoảng thời gian; chế độ test rút ngắn qua __blindfold.setTiming. */
const timing = {
  engineDelayMs: 600, // độ trễ tối thiểu trước khi máy đọc nước (nghe tự nhiên hơn)
  postTtsMs: 300, // chờ sau khi TTS đọc xong rồi mới mở micro (tránh micro nghe tiếng loa)
  peekMs: 10000,
  listenTimeoutMs: 8000,
};

let settings = loadSettings();
const store = createStore({
  screen: 'setup', phase: 'idle', listening: false, speaking: false, transcript: '',
  moveNumber: 0, hints: { peeksLeft: 1, locatesLeft: 2 }, clock: null,
});

const cues = createAudioCues({ muted: TEST_MODE });
const tts = createTts({ onSpeakingChange: (speaking) => store.set({ speaking }) });
let hud = null;
let form = null;
let engine = null;
let engineReady = false;
let engineReadyPromise = Promise.resolve();

/** Ván hiện tại. null khi ở màn hình cài đặt. */
let G = null;
let tokenCounter = 0;
let busy = 0;
let wakeLock = null;
let clockTimer = null;
let lastPersist = 0;
const forcedEngineMoves = [];
const micStarts = [];
let lastStartWasAuto = false; // micro tự mở (không do chạm): iOS có thể từ chối, không coi là mất quyền

const recognizer = createRecognizer({
  lang: settings.speechLang,
  timeoutMs: timing.listenTimeoutMs,
  onStart: () => store.set({ listening: true }),
  onResult: (alts) => { void handleSpeech(alts); },
  onNoSpeech: () => { void handleNoSpeech(); },
  onError: (code) => { void handleRecognitionError(code); },
  onEnd: () => store.set({ listening: false }),
});

// ---------------------------------------------------------------- tiện ích

const alive = (token) => !!G && G.token === token && !G.over;
const phase = () => store.get().phase;
const setPhase = (p) => {
  if (G?.over && p !== 'over') return; // ván đã kết thúc: tác vụ đang chờ không được đổi trạng thái
  store.set({ phase: p });
};
const speakOpts = () => ({ announceCaptures: settings.announce, fileStyle: settings.fileStyle });

async function withBusy(fn) {
  busy++;
  try {
    return await fn();
  } catch (err) {
    console.error('[main] lỗi xử lý', err);
    return undefined;
  } finally {
    busy--;
  }
}

function say(text) {
  announce(text);
  return tts.speak(text);
}

async function sayError(text) {
  cues.play('error');
  hud?.flashError();
  await say(text);
}

function canListen() {
  if (!G || G.over || busy > 0) return false;
  if (tts.speaking || recognizer.listening) return false;
  if (G.game.turn() !== G.playerColor) return false;
  return ['player', 'confirm', 'paused', 'peek'].includes(phase());
}

function snapshot() {
  const s = store.get();
  return {
    screen: s.screen,
    phase: s.phase,
    listening: recognizer.listening,
    speaking: tts.speaking,
    busy,
    canListen: canListen(),
    engineReady,
    waitingConfirm: s.phase === 'confirm',
    turn: G ? G.game.turn() : null,
    playerColor: G ? G.playerColor : null,
    fen: G ? G.game.fen() : null,
    ply: G ? G.game.plyCount() : 0,
    uciMoves: G ? G.game.uciMoves() : [],
    hints: G ? G.hints.serialize() : null,
    clocks: clockView(),
    over: G ? G.over : false,
    result: G ? G.game.resultCode() : null,
    status: G ? G.game.status() : null,
    elo: G ? G.elo : null,
  };
}

function clockView() {
  if (!G?.clock) return null;
  const c = G.clock;
  const act = c.active === G.playerColor ? 'player' : c.active ? 'engine' : null;
  return { player: c.time(G.playerColor), engine: c.time(G.engineColor), active: act, running: c.running };
}

function updateView() {
  if (!G) return;
  store.set({ moveNumber: G.game.fullmoveNumber(), hints: G.hints.serialize(), clock: clockView() });
}

function resolveTimeControl(s) {
  const tc = TIME_CONTROLS.find((x) => x.id === s.timeControl) || TIME_CONTROLS[0];
  if (tc.id === 'custom') return { id: 'custom', minutes: s.customMinutes, increment: s.customIncrement };
  return { id: tc.id, minutes: tc.minutes, increment: tc.increment };
}

function persist() {
  if (!G || G.over) return;
  lastPersist = performance.now();
  saveGame({
    uciMoves: G.game.uciMoves(),
    playerColor: G.playerColor,
    elo: G.elo,
    timeControl: G.tc,
    clock: G.clock ? G.clock.serialize() : null,
    hints: G.hints.serialize(),
    lastDrawOfferPly: G.lastDrawOfferPly,
  });
}

// ---------------------------------------------------------------- micro

function startListening({ auto = false } = {}) {
  if (!canListen()) return false;
  if (!recognizer.isSupported()) return false;
  lastStartWasAuto = auto;
  micStarts.push({ phase: phase(), turn: G.game.turn(), speaking: tts.speaking, auto });
  cues.play('listen');
  return recognizer.start();
}

/** Tự mở micro khi đang chờ trả lời (xác nhận, xem bàn cờ) hoặc ở chế độ nghe liên tục. */
function maybeAutoListen() {
  if (!G || G.over) return;
  const token = G.token;
  setTimeout(() => {
    if (!alive(token) || !canListen()) return;
    const p = phase();
    if (p === 'peek' && (!G.peek || G.peek.endsAt - performance.now() < 1500)) return;
    const continuous = settings.listenMode === 'continuous' && (p === 'player' || p === 'paused');
    if (p === 'confirm' || p === 'peek' || continuous) startListening({ auto: true });
  }, timing.postTtsMs);
}

function onTap() {
  cues.unlock();
  if (!G || G.over) return;
  if (phase() === 'peek') {
    void withBusy(endPeek).then(maybeAutoListen);
    return;
  }
  if (recognizer.listening) return; // đang nghe: để tự dừng khi người chơi nói xong
  if (!recognizer.isSupported()) {
    $('type-box').open = true;
    $('type-input').focus();
    return;
  }
  if (!canListen()) {
    cues.play('soft');
    return;
  }
  startListening();
}

async function handleSpeech(alts) {
  store.set({ listening: false, transcript: alts[0] || '' });
  cues.play('done');
  if (!G || G.over) return;
  const p = phase();
  await withBusy(async () => {
    if (p === 'confirm') return onConfirmAnswer(parseUtterance(alts, { mode: 'confirm' }));
    if (p === 'peek') {
      if (parseUtterance(alts, { mode: 'peek' }).type === 'command') await endPeek();
      return undefined;
    }
    const r = parseUtterance(alts, { mode: 'move', legalMoves: G.game.legalMoves() });
    if (p === 'paused') {
      if (r.type === 'command' && ['RESUME', 'TIME', 'HELP'].includes(r.name)) return runCommand(r.name);
      return say(VI.say.pausedRefuse);
    }
    if (p !== 'player') return undefined;
    if (r.type === 'command') return runCommand(r.name);
    if (r.type === 'move') return onMoveResult(r);
    return sayError(VI.say.notUnderstood);
  });
  maybeAutoListen();
}

async function handleNoSpeech() {
  store.set({ listening: false });
  if (!G || G.over) return;
  const p = phase();
  if (p === 'peek') { maybeAutoListen(); return; }
  cues.play('done');
  if (p === 'confirm') {
    await withBusy(() => onConfirmAnswer({ type: 'unknown' }));
  } else if (settings.listenMode !== 'continuous' && p === 'player') {
    await withBusy(() => say(VI.say.noSpeechHeard));
  }
  maybeAutoListen();
}

async function handleRecognitionError(code) {
  store.set({ listening: false });
  if (!G || G.over) return;
  const p = phase();
  const permissionLike = ['not-allowed', 'service-not-allowed', 'start-failed'].includes(code);
  if (lastStartWasAuto && permissionLike) {
    // Safari iOS chỉ cho mở micro trong cú chạm: im lặng, người chơi chạm để nói/trả lời.
    return;
  }
  await withBusy(async () => {
    if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
      showWarning(VI.setup.micDenied);
      await sayError(VI.say.micError);
    } else if (code === 'network') {
      await sayError(VI.say.networkError);
    }
    if (p === 'confirm') await onConfirmAnswer({ type: 'unknown' });
  });
}

// ---------------------------------------------------------------- nước đi người chơi

async function onMoveResult(r) {
  if (!r.matches.length) {
    await sayError(VI.say.illegal(describeIntent(r.intent, speakOpts())));
    return;
  }
  if (r.matches.length > 1) {
    const options = [...r.matches]
      .sort((a, b) => a.from.localeCompare(b.from) || (a.promotion || '').localeCompare(b.promotion || ''))
      .slice(0, 3)
      .map((m) => speakMove(m, speakOpts()))
      .join('; ');
    await sayError(VI.say.ambiguous(options));
    return;
  }
  const move = r.matches[0];
  if (settings.confirm) {
    G.pendingConfirm = { kind: 'move', move };
    G.confirmAttempts = 0;
    setPhase('confirm');
    await say(VI.say.confirmQuestion(speakMove(move, speakOpts())));
    return;
  }
  await commitPlayerMove(move);
}

async function onConfirmAnswer(r) {
  const S = G;
  const pending = S.pendingConfirm;
  if (!pending) { setPhase('player'); return; }
  if (r.type === 'command' && r.name === 'CONFIRM_YES') {
    S.pendingConfirm = null;
    setPhase('player');
    if (pending.kind === 'move') await commitPlayerMove(pending.move);
    else if (pending.kind === 'resign') {
      S.game.resign(S.playerColor);
      await endGame();
    }
    return;
  }
  if (r.type !== 'command' || r.name !== 'CONFIRM_NO') {
    if (S.confirmAttempts < 1) {
      S.confirmAttempts++;
      await say(VI.say.confirmAgain);
      return;
    }
  }
  S.pendingConfirm = null;
  setPhase('player');
  await say(VI.say.cancelled);
}

async function commitPlayerMove(move) {
  const S = G;
  const played = S.game.move({ from: move.from, to: move.to, promotion: move.promotion });
  if (!played) {
    await sayError(VI.say.illegal(speakMove(move, speakOpts())));
    return;
  }
  S.lastPlayerMoveText = speakMove(played, speakOpts());
  S.clock?.press();
  persist();
  updateView();
  if (S.game.status().over) {
    await endGame();
    return;
  }
  await engineTurn();
}

// ---------------------------------------------------------------- nước đi của máy

async function engineTurn() {
  const S = G;
  const token = S.token;
  setPhase('engine');
  updateView();
  const t0 = performance.now();
  let uci;
  try {
    uci = forcedEngineMoves.length ? forcedEngineMoves.shift() : await engine.bestMove(S.game.fen());
  } catch (err) {
    console.error('[engine] không lấy được nước đi', err);
    if (alive(token)) await sayError(VI.say.engineError);
    return;
  }
  const wait = timing.engineDelayMs - (performance.now() - t0);
  if (wait > 0) await sleep(wait);
  if (!alive(token)) return;
  const move = uci ? S.game.move(uci) : null;
  if (!move) {
    console.error('[engine] nước không hợp lệ', uci, S.game.fen());
    await sayError(VI.say.engineError);
    return;
  }
  S.clock?.press();
  S.lastEngineMoveText = speakMove(move, speakOpts());
  persist();
  const over = S.game.status().over;
  setPhase(over ? 'over' : 'player');
  updateView();
  await say(VI.say.engineMove(S.lastEngineMoveText));
  if (!alive(token)) return;
  if (over) await endGame();
}

// ---------------------------------------------------------------- lệnh

async function runCommand(name) {
  const S = G;
  switch (name) {
    case 'PEEK':
      if (!S.hints.usePeek()) { await say(VI.say.peekNone); return; }
      persist();
      updateView();
      await startPeek();
      return;
    case 'LOCATE': {
      if (!S.hints.useLocate()) { await say(VI.say.locateNone); return; }
      persist();
      updateView();
      for (const line of describePieces(S.game.board(), S.playerColor, speakOpts())) await say(line);
      await say(VI.say.locateLeft(S.hints.locatesLeft));
      return;
    }
    case 'REPEAT':
      await say(S.lastEngineMoveText ? VI.say.lastEngineMove(S.lastEngineMoveText) : VI.say.noEngineMove);
      return;
    case 'MY_LAST':
      await say(S.lastPlayerMoveText ? VI.say.lastPlayerMove(S.lastPlayerMoveText) : VI.say.noPlayerMove);
      return;
    case 'HISTORY':
      await readHistory();
      return;
    case 'TIME':
      if (!S.clock) await say(VI.say.noClock);
      else await say(VI.say.time(S.clock.time(S.playerColor), S.clock.time(S.engineColor)));
      return;
    case 'HELP':
      await say(VI.say.help);
      return;
    case 'RESIGN':
      S.pendingConfirm = { kind: 'resign' };
      S.confirmAttempts = 0;
      setPhase('confirm');
      await say(VI.say.resignConfirm);
      return;
    case 'DRAW':
      await offerDraw();
      return;
    case 'PAUSE':
      if (!S.clock) { await say(VI.say.pauseNoClock); return; }
      S.clock.pause();
      setPhase('paused');
      persist();
      updateView();
      await say(VI.say.paused);
      return;
    case 'RESUME':
      if (phase() !== 'paused') { await say(VI.say.yourTurn); return; }
      setPhase('player');
      await say(VI.say.resumed);
      S.clock?.resume();
      updateView();
      return;
    default:
      await sayError(VI.say.notUnderstood);
  }
}

async function readHistory() {
  const h = G.game.history();
  if (!h.length) { await say(VI.say.historyEmpty); return; }
  const opts = speakOpts();
  const moves = [];
  for (let i = 0; i < h.length; i += 2) {
    moves.push({ n: Math.floor(i / 2) + 1, w: speakMove(h[i], opts), b: h[i + 1] ? speakMove(h[i + 1], opts) : null });
  }
  let list = moves;
  if (moves.length > 20) {
    list = moves.slice(-10);
    await say(VI.say.historyRecent(10));
  }
  for (const m of list) await say(VI.say.historyMove(m.n, m.w, m.b));
}

async function offerDraw() {
  const S = G;
  const ply = S.game.plyCount();
  if (ply - S.lastDrawOfferPly < 20) { await say(VI.say.drawTooSoon); return; }
  S.lastDrawOfferPly = ply;
  persist();
  if (S.game.fullmoveNumber() < 20) { await say(VI.say.drawDeclined); return; }
  setPhase('engine');
  let score = null;
  try {
    score = await engine.evaluate(S.game.fen(), 12);
  } catch (err) {
    console.error('[engine] không đánh giá được', err);
  }
  if (!alive(S.token)) return;
  setPhase('player');
  // Điểm theo góc nhìn người chơi (đang tới lượt). Máy đồng ý khi không hơn quá 1,5 tốt.
  if (score !== null && -score <= 150) {
    await say(VI.say.drawAccepted);
    S.game.agreeDraw();
    await endGame();
    return;
  }
  await say(VI.say.drawDeclined);
}

// ---------------------------------------------------------------- xem bàn cờ

async function startPeek() {
  const S = G;
  setPhase('peek');
  await say(VI.say.peekStart);
  if (!alive(S.token) || phase() !== 'peek') return;
  renderBoard($('peek-board'), S.game.fen(), { orientation: S.playerColor, lastMove: S.game.lastMove() });
  showScreen('peek');
  store.set({ screen: 'peek' });
  cues.play('tick');
  const endsAt = performance.now() + timing.peekMs;
  const beeped = new Set();
  const update = () => {
    if (!S.peek) return;
    const leftMs = S.peek.endsAt - performance.now();
    const left = Math.max(0, Math.ceil(leftMs / 1000));
    $('peek-countdown').textContent = VI.play.peekCountdown(left);
    if (left >= 1 && left <= 3 && !beeped.has(left)) {
      beeped.add(left);
      cues.play('tick');
    }
    if (leftMs <= 0) void withBusy(endPeek).then(maybeAutoListen);
  };
  S.peek = { endsAt, interval: setInterval(update, 100) };
  update();
}

function clearPeek(S) {
  if (!S?.peek) return false;
  clearInterval(S.peek.interval);
  S.peek = null;
  clearBoard($('peek-board'));
  $('peek-countdown').textContent = '';
  return true;
}

async function endPeek() {
  const S = G;
  if (!clearPeek(S)) return;
  recognizer.abort();
  showScreen('play');
  store.set({ screen: 'play' });
  setPhase('player');
  await say(VI.say.peekEnd);
}

// ---------------------------------------------------------------- đồng hồ

function onClockTick() {
  if (!G || G.over || !G.clock) return;
  const S = G;
  const flagged = S.clock.tick();
  store.set({ clock: clockView() });
  if (flagged) {
    S.game.timeout(flagged);
    void endGame();
    return;
  }
  if (performance.now() - lastPersist > 5000) persist();
  if (!settings.clockWarnings || S.clock.active !== S.playerColor || !S.clock.running) return;
  const t = S.clock.time(S.playerColor);
  const w = S.warned;
  for (const k of Object.keys(w)) if (t > Number(k) + 1000) delete w[k];
  if (t <= 60000 && !w[60000] && S.clock.baseMs > 60000) {
    w[60000] = true;
    if (!tts.speaking && !recognizer.listening && busy === 0) void say(VI.say.oneMinute);
    else cues.play('double');
  }
  if (t <= 30000 && !w[30000]) {
    w[30000] = true;
    cues.play('double');
  }
  for (let s = 10; s >= 1; s--) {
    if (t <= s * 1000 && !w[s * 1000]) {
      w[s * 1000] = true;
      cues.play(recognizer.listening ? 'soft' : 'tick');
    }
  }
}

// ---------------------------------------------------------------- vòng đời ván

function describeResult(status, player) {
  const R = VI.result;
  const reason = R.reasons[status.reason] || '';
  if (status.reason === 'checkmate') {
    const win = status.winner === player;
    return { title: win ? R.youWin : R.youLose, reason, speech: win ? R.say.checkmateWin : R.say.checkmateLose };
  }
  if (status.reason === 'resign') return { title: R.youLose, reason, speech: R.say.resign };
  if (status.reason === 'timeout') {
    if (status.flagged === player) {
      if (status.winner) return { title: R.youLose, reason, speech: R.say.timeoutLose };
      return { title: R.draw, reason, speech: R.say.timeoutDraw };
    }
    if (status.winner === player) return { title: R.youWin, reason, speech: R.say.timeoutWin };
    return { title: R.draw, reason, speech: R.say.insufficient };
  }
  return { title: R.draw, reason, speech: R.say[status.reason] || R.draw };
}

async function endGame() {
  const S = G;
  if (!S || S.over) return;
  S.over = true;
  clearPeek(S);
  recognizer.abort();
  S.clock?.stop();
  releaseWakeLock();
  clearGame();
  setPhase('over');
  const status = S.game.status();
  const result = describeResult(status, S.playerColor);
  const pgn = buildPgn({
    uciMoves: S.game.uciMoves(),
    playerColor: S.playerColor,
    elo: S.elo,
    result: S.game.resultCode(),
    reason: status.reason,
    timeControl: pgnTimeControl(S.tc.minutes, S.tc.increment),
  });
  S.pgn = pgn;
  showScreen('gameover');
  store.set({ screen: 'gameover' });
  showGameover({
    title: result.title,
    reason: result.reason,
    history: S.game.history(),
    fenAt: (ply) => S.game.fenAt(ply),
    orientation: S.playerColor,
    pgn,
    lichessUrl: lichessAnalysisUrl(pgn),
    fileName: pgnFileName(),
  }, {
    onRematch: () => { tts.unlock(); cues.unlock(); void startGame({}); },
    onNew: () => toSetup(),
  });
  await say(result.speech);
}

function stopSession() {
  if (!G) return;
  const S = G;
  S.token = -1; // mọi tác vụ đang chờ của ván này dừng ở lần kiểm tra alive() kế tiếp
  clearPeek(S);
  recognizer.abort();
  S.clock?.stop();
  tts.cancel();
  releaseWakeLock();
  G = null;
}

async function startGame({ saved = null } = {}) {
  stopSession();
  forcedEngineMoves.length = TEST_MODE ? forcedEngineMoves.length : 0;
  const token = ++tokenCounter;
  let game;
  try {
    game = createGame({ uciMoves: saved?.uciMoves || [] });
  } catch (err) {
    console.error('[main] ván đã lưu bị hỏng, bắt đầu ván mới', err);
    clearGame();
    saved = null;
    game = createGame();
  }
  const tc = saved ? saved.timeControl : resolveTimeControl(settings);
  const playerColor = saved ? saved.playerColor
    : settings.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.color;
  const elo = saved ? saved.elo : settings.elo;
  const clock = tc?.minutes
    ? createClock({
      baseMs: tc.minutes * 60000,
      incrementMs: (tc.increment || 0) * 1000,
      now: () => performance.now(),
      remaining: saved?.clock?.remaining,
    })
    : null;
  G = {
    token, game, clock, playerColor, engineColor: other(playerColor), elo, tc,
    hints: createHints(saved?.hints),
    pendingConfirm: null, confirmAttempts: 0,
    lastDrawOfferPly: Number.isInteger(saved?.lastDrawOfferPly) ? saved.lastDrawOfferPly : -999,
    warned: {}, over: false, peek: null,
    lastEngineMoveText: null, lastPlayerMoveText: null,
  };
  const lastEngine = game.lastMoveBy(G.engineColor);
  const lastPlayer = game.lastMoveBy(playerColor);
  if (lastEngine) G.lastEngineMoveText = speakMove(lastEngine, speakOpts());
  if (lastPlayer) G.lastPlayerMoveText = speakMove(lastPlayer, speakOpts());

  clearBoard($('peek-board'));
  clearBoard($('final-board'));
  showScreen('play');
  store.set({ screen: 'play', transcript: '' });
  setPhase('idle');
  updateView();
  requestWakeLock();
  tts.setRate(settings.rate);
  tts.setVoice(settings.voiceURI);
  recognizer.setLang(settings.speechLang);

  await withBusy(async () => {
    await engineReadyPromise;
    if (!engineReady) throw new Error('engine chưa sẵn sàng');
    await engine.setStrength(elo);
    await engine.newGame();
    if (!alive(token)) return;
    persist();
    const colorName = VI.colors[playerColor];
    await say(saved ? VI.say.resumeGame(colorName) : VI.say.newGame(colorName, elo));
    if (!alive(token)) return;
    if (game.status().over) { await endGame(); return; }
    if (game.turn() !== playerColor) {
      clock?.start(game.turn());
      await engineTurn();
      return;
    }
    setPhase('player');
    updateView();
    if (saved && G.lastEngineMoveText) await say(VI.say.lastEngineMove(G.lastEngineMoveText));
    await say(saved ? VI.say.yourTurn : VI.say.tapToSpeak);
    if (alive(token)) clock?.start(playerColor); // giờ bắt đầu chạy sau lời hướng dẫn
  });
  if (alive(token) && !engineReady) {
    await sayError(VI.say.engineError);
    return;
  }
  maybeAutoListen();
}

function toSetup() {
  stopSession();
  showScreen('setup');
  store.set({ screen: 'setup', phase: 'idle' });
  refreshResumeBanner();
}

// ---------------------------------------------------------------- màn hình cài đặt

function showWarning(text, soft = false) {
  const box = $('warnings');
  if ([...box.children].some((c) => c.textContent === text)) return;
  const p = document.createElement('p');
  p.className = `warning${soft ? ' soft' : ''}`;
  p.textContent = text;
  box.appendChild(p);
}

function refreshResumeBanner() {
  $('resume-banner').hidden = !loadGame();
}

/** Thao tác cần làm ngay trong cú chạm/click của người dùng (mở khóa âm thanh, xin quyền micro). */
function unlockFromGesture() {
  tts.unlock();
  cues.unlock();
  if (TEST_MODE) return;
  if (navigator.mediaDevices?.getUserMedia && recognizer.isSupported()) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch((err) => {
        console.error('[main] không có quyền micro', err);
        showWarning(VI.setup.micDenied);
      });
  }
}

async function requestWakeLock() {
  try {
    if (navigator.wakeLock && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    }
  } catch {
    wakeLock = null; // không hỗ trợ hoặc bị từ chối: không ảnh hưởng ván đấu
  }
}

function releaseWakeLock() {
  try { wakeLock?.release(); } catch { /* bỏ qua */ }
  wakeLock = null;
}

function initEngine() {
  form.setEngineStatus(VI.setup.loadingEngine);
  try {
    engine = createEngine(createWorkerTransport());
  } catch (err) {
    console.error('[engine] không tạo được worker', err);
    form.setEngineStatus(VI.setup.engineFailed);
    showWarning(VI.setup.engineFailed);
    return;
  }
  engineReadyPromise = engine.init().then(() => {
    engineReady = true;
    form.setEngineStatus(VI.setup.engineReady);
    form.setStartEnabled(true);
  }).catch((err) => {
    console.error('[engine] khởi động thất bại', err);
    form.setEngineStatus(VI.setup.engineFailed);
    showWarning(VI.setup.engineFailed);
  });
}

function refreshVoices() {
  const voices = tts.getVoices();
  form.setVoices(voices, settings.voiceURI);
  if (voices.length && !tts.hasVietnameseVoice()) showWarning(VI.setup.noVietnameseVoice, true);
}

// ---------------------------------------------------------------- nút trong ván

/** Lệnh từ nút bấm / phím tắt: chỉ khi đến lượt người chơi và đang rảnh. */
function commandFromButton(name) {
  cues.unlock();
  if (!G || G.over) return;
  if (phase() === 'engine') { void say(VI.say.notYourTurn); return; }
  if (phase() !== 'player' || busy > 0 || tts.speaking || recognizer.listening) { cues.play('soft'); return; }
  void withBusy(() => runCommand(name)).then(maybeAutoListen);
}

async function handleTyped(text) {
  if (!G || G.over || !text.trim()) return;
  if (phase() !== 'player' || busy > 0) { cues.play('soft'); return; }
  store.set({ transcript: text });
  await withBusy(async () => {
    const san = G.game.trySan(text);
    if (san) return commitPlayerMove(san);
    const r = parseUtterance([text], { mode: 'move', legalMoves: G.game.legalMoves() });
    if (r.type === 'command') return runCommand(r.name);
    if (r.type === 'move' && r.matches.length === 1) return commitPlayerMove(r.matches[0]);
    if (r.type === 'move') return onMoveResult({ ...r, matches: r.matches });
    return sayError(VI.say.notUnderstood);
  });
  maybeAutoListen();
}

function bindPlayControls() {
  $('talk').addEventListener('click', onTap);
  $('screen-peek').addEventListener('click', onTap);
  $('btn-peek').addEventListener('click', () => commandFromButton('PEEK'));
  $('btn-locate').addEventListener('click', () => commandFromButton('LOCATE'));
  $('btn-repeat').addEventListener('click', () => commandFromButton('REPEAT'));
  $('btn-resign').addEventListener('click', () => {
    commandFromButton('RESIGN');
  });
  $('type-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('type-input');
    const text = input.value;
    input.value = '';
    void handleTyped(text);
  });

  const dlg = $('settings-dialog');
  $('btn-settings').addEventListener('click', () => {
    $('dlg-confirm').checked = settings.confirm;
    $('dlg-announce').checked = settings.announce;
    $('dlg-clockWarnings').checked = settings.clockWarnings;
    $('dlg-fileStyle').value = settings.fileStyle;
    $('dlg-rate').value = String(settings.rate);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  });
  dlg.addEventListener('change', () => {
    settings = {
      ...settings,
      confirm: $('dlg-confirm').checked,
      announce: $('dlg-announce').checked,
      clockWarnings: $('dlg-clockWarnings').checked,
      fileStyle: $('dlg-fileStyle').value,
      rate: Number($('dlg-rate').value) || 1,
    };
    tts.setRate(settings.rate);
    saveSettings(settings);
    form.write(settings);
  });
  $('btn-exit').addEventListener('click', () => {
    persist();
    dlg.close?.();
    dlg.removeAttribute('open');
    toSetup();
  });

  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || dlg.open) return;
    const s = store.get().screen;
    if (s !== 'play' && s !== 'peek') return;
    if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); onTap(); return; }
    if (e.key === 'p' || e.key === 'P') commandFromButton('PEEK');
    else if (e.key === 'l' || e.key === 'L') commandFromButton('LOCATE');
    else if (e.key === 'r' || e.key === 'R') commandFromButton('REPEAT');
    else if (e.key === 'Escape' && phase() === 'confirm' && busy === 0 && !tts.speaking) {
      recognizer.abort();
      void withBusy(() => onConfirmAnswer({ type: 'command', name: 'CONFIRM_NO' })).then(maybeAutoListen);
    }
  });
}

// ---------------------------------------------------------------- khởi động trang

function init() {
  applyI18n();
  hud = createHud();
  store.subscribe((s) => {
    if (s.screen === 'play' || s.screen === 'peek') hud.render(s);
  });

  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  form = bindSetupForm({
    settings,
    coarsePointer: coarse,
    onChange: (s) => {
      settings = s;
      saveSettings(settings);
      tts.setRate(settings.rate);
      tts.setVoice(settings.voiceURI);
      recognizer.setLang(settings.speechLang);
    },
    onStart: (s) => {
      settings = s;
      saveSettings(settings);
      unlockFromGesture();
      clearGame();
      void startGame({});
    },
  });

  if (location.protocol === 'file:') showWarning(VI.setup.fileProtocol);
  if (!recognizer.isSupported()) {
    showWarning(VI.setup.noSpeech);
    $('type-box').open = true;
  }
  if (!tts.supported) showWarning(VI.setup.noTts);

  refreshVoices();
  tts.onVoicesChanged(refreshVoices);
  refreshResumeBanner();

  $('btn-resume').addEventListener('click', () => {
    const saved = loadGame();
    unlockFromGesture();
    if (saved) void startGame({ saved });
  });
  $('btn-discard').addEventListener('click', () => {
    clearGame();
    refreshResumeBanner();
  });

  bindPlayControls();
  initEngine();
  clockTimer = setInterval(onClockTick, 200);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
    else if (G && !G.over) void requestWakeLock();
  });
  window.addEventListener('pagehide', persist);

  if (TEST_MODE) installTestHooks();
}

function installTestHooks() {
  window.__blindfold = {
    getState: snapshot,
    simulateSpeech: (text) => handleSpeech(Array.isArray(text) ? text : [text]),
    getSpokenLog: () => tts.log.slice(),
    getCueLog: () => cues.log.slice(),
    getMicStarts: () => micStarts.slice(),
    setEngineDelay: (ms) => { timing.engineDelayMs = ms; },
    setTiming: (patch) => Object.assign(timing, patch),
    forceEngineMove: (uci) => { forcedEngineMoves.push(uci); },
    setClockTime: (who, ms) => {
      if (!G?.clock) return false;
      G.clock.setTime(who === 'player' ? G.playerColor : G.engineColor, ms);
      return true;
    },
    getSettings: () => ({ ...settings }),
    setSettings: (patch) => {
      settings = { ...settings, ...patch };
      saveSettings(settings);
      form.write(settings);
    },
    getPgn: () => G?.pgn || null,
    clockTimer: () => clockTimer,
  };
}

init();
