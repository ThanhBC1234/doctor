// Câu nói → lệnh hoặc nước đi. Module thuần.
//
// Nguyên tắc an toàn: không bao giờ tự chọn khi có từ 2 nước khớp trở lên.
// Kết quả "move" luôn trả về toàn bộ danh sách nước khớp để giao diện hỏi lại.

import { cleanText, lex, expandReadings, stripDiacritics } from './normalize.js';

const COMMANDS = [
  ['MY_LAST', ['tôi vừa đi gì', 'tôi vừa đi', 'nước của tôi', 'tôi đi gì', 'tôi đã đi gì', 'my last move', 'what did i play', 'my move']],
  ['HISTORY', ['đọc lại ván', 'đọc ván', 'lịch sử', 'các nước đã đi', 'đọc từ đầu', 'từ đầu', 'đọc lại các nước', 'read the game', 'history', 'moves so far', 'game so far']],
  ['REPEAT', ['nhắc lại', 'nói lại', 'máy đi gì', 'máy vừa đi gì', 'máy vừa đi', 'máy đã đi gì', 'lặp lại', 'đọc lại', 'repeat', 'what did you play', 'say again', 'again']],
  ['PEEK', ['tháo bịt mắt', 'mở bịt mắt', 'bịt mắt', 'xem bàn cờ', 'cho xem', 'bàn cờ', 'show board', 'show the board', 'show me the board', 'peek', 'look at the board']],
  ['LOCATE', ['vị trí quân', 'vị trí các quân', 'vị trí', 'quân ở đâu', 'các quân ở đâu', 'ở đâu', 'đọc vị trí', 'quân chính', 'where are the pieces', 'where are', 'locate', 'pieces']],
  ['TIME', ['thời gian', 'đồng hồ', 'còn bao nhiêu', 'mấy phút', 'mấy giờ', 'time', 'clock']],
  ['RESIGN', ['xin thua', 'tôi thua', 'đầu hàng', 'chịu thua', 'resign', 'i resign', 'give up']],
  ['DRAW', ['cầu hòa', 'đề nghị hòa', 'xin hòa', 'hòa không', 'hòa nhé', 'hòa', 'offer draw', 'offer a draw', 'draw']],
  ['HELP', ['trợ giúp', 'hướng dẫn', 'các lệnh', 'giúp', 'help', 'commands']],
  ['PAUSE', ['tạm dừng', 'dừng lại', 'dừng', 'pause', 'stop']],
  ['RESUME', ['tiếp tục', 'chơi tiếp', 'resume', 'continue']],
];

const YES_WORDS = [
  'đúng', 'đúng rồi', 'ừ', 'ừm', 'ờ', 'ừa', 'vâng', 'dạ', 'ok', 'okay', 'oke', 'okê', 'yes', 'yeah', 'yep', 'yup', 'đi',
  'chuẩn', 'phải', 'correct', 'confirm', 'có', 'được', 'rồi', 'chính xác', 'right', 'sure', 'đồng ý', 'chắc chắn',
];
// Không có 'đừng': bỏ dấu thành "dung" trùng với "đúng" và sẽ thắng nhầm thành "sai".
const NO_WORDS = ['sai', 'không', 'no', 'nope', 'hủy', 'cancel', 'lại', 'wrong', 'chưa', 'thôi', 'khoan', 'not'];
const DONE_WORDS = ['xong', 'đủ rồi', 'đủ', 'che lại', 'che', 'done', 'close', 'ok', 'okay', 'thôi', 'finish', 'enough'];

function containsPhrase(text, phrase) {
  const t = ` ${text} `;
  if (t.includes(` ${phrase} `)) return true;
  const plainPhrase = stripDiacritics(phrase);
  return plainPhrase !== phrase && ` ${stripDiacritics(text)} `.includes(` ${plainPhrase} `) && stripDiacritics(text) === text;
}

function containsAny(text, words) {
  return words.some((w) => containsPhrase(text, w));
}

/** Tìm lệnh trong câu (chế độ nước đi). Trả về tên lệnh hoặc null. */
export function detectCommand(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  for (const [name, phrases] of COMMANDS) {
    if (containsAny(text, phrases)) return name;
  }
  return null;
}

/** "đúng" / "sai" khi đang chờ xác nhận. "không" thắng "đúng" ("không đúng"). */
export function detectConfirm(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  if (containsAny(text, NO_WORDS)) return 'CONFIRM_NO';
  if (containsAny(text, YES_WORDS)) return 'CONFIRM_YES';
  return null;
}

export function detectDone(raw) {
  const text = cleanText(raw);
  return text && containsAny(text, DONE_WORDS) ? 'DONE' : null;
}

const PROMOTABLE = new Set(['q', 'r', 'b', 'n']);

/**
 * Một chuỗi token (một cách hiểu) → ý định nước đi, hoặc null nếu sai ngữ pháp.
 * @returns {null | {kind:'castle', side:'k'|'q'|null} | {kind:'move', piece:string|null, from:string|null,
 *   fromFile:string|null, fromRank:number|null, to:string, takes:boolean, captured:string|null, promotion:string|null}}
 */
export function parseIntent(tokens) {
  if (!tokens.length) return null;
  const has = (t) => tokens.some((x) => x.t === t);
  if (has('cs') || has('cl') || has('c')) {
    if (has('file') || has('rank') || has('piece')) return null;
    if (has('cs') && has('cl')) return null;
    return { kind: 'castle', side: has('cs') ? 'k' : has('cl') ? 'q' : null };
  }

  const seq = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const n = tokens[i + 1];
    if (t.t === 'file' && n && n.t === 'rank') {
      seq.push({ t: 'sq', v: `${t.v}${n.v}` });
      i++;
    } else {
      seq.push(t);
    }
  }
  const sqIdx = [];
  seq.forEach((t, i) => { if (t.t === 'sq') sqIdx.push(i); });
  if (sqIdx.length === 0 || sqIdx.length > 2) return null;
  const targetI = sqIdx[sqIdx.length - 1];
  const fromI = sqIdx.length === 2 ? sqIdx[0] : -1;

  const intent = {
    kind: 'move', piece: null, from: fromI >= 0 ? seq[fromI].v : null, fromFile: null, fromRank: null,
    to: seq[targetI].v, takes: false, captured: null, promotion: null,
  };
  let afterTakes = false;
  let afterPromo = false;

  for (let i = 0; i < targetI; i++) {
    if (i === fromI) continue;
    const t = seq[i];
    switch (t.t) {
      case 'piece':
        if (afterPromo) {
          if (intent.promotion) return null;
          intent.promotion = t.v;
        } else if (afterTakes) {
          if (intent.captured) return null;
          intent.captured = t.v;
        } else {
          if (intent.piece) return null;
          intent.piece = t.v;
        }
        break;
      case 'file':
        if (afterTakes || intent.fromFile || intent.from) return null;
        intent.fromFile = t.v;
        break;
      case 'rank':
        if (afterTakes || intent.fromRank || intent.from) return null;
        intent.fromRank = t.v;
        break;
      case 'takes':
        if (afterTakes) return null;
        afterTakes = true;
        intent.takes = true;
        break;
      case 'to':
        break;
      case 'promo':
        afterPromo = true;
        break;
      default:
        return null;
    }
  }
  let promoWord = false;
  let takesAfter = false;
  for (let i = targetI + 1; i < seq.length; i++) {
    const t = seq[i];
    if (t.t === 'to') continue;
    if (t.t === 'promo') { promoWord = true; continue; }
    if (t.t === 'takes') {
      // "mã f3 ăn tốt": nói "ăn" sau ô đến
      if (takesAfter || afterTakes) return null;
      takesAfter = true;
      intent.takes = true;
      continue;
    }
    if (t.t === 'piece') {
      if (takesAfter) {
        if (intent.captured) return null;
        intent.captured = t.v;
        continue;
      }
      const promotionRank = intent.to[1] === '1' || intent.to[1] === '8';
      if (promoWord || (promotionRank && !intent.piece && PROMOTABLE.has(t.v))) {
        if (intent.promotion) return null;
        intent.promotion = t.v;
        // "e8 hậu" thường là phong Hậu, nhưng "e1 xe" có thể là Xe tới e1: matchIntent thử cả hai cách hiểu.
        if (!promoWord) intent.implicitPromotion = true;
      } else {
        // "f3 mã": tên quân nói sau ô đến
        if (intent.piece) return null;
        intent.piece = t.v;
      }
      continue;
    }
    return null;
  }
  if (intent.promotion && !PROMOTABLE.has(intent.promotion)) return null;
  if (intent.captured === 'k') return null;
  return intent;
}

/**
 * Lọc các nước hợp lệ (chess.js verbose) theo ý định.
 * @param {object} intent
 * @param {object[]} legalMoves
 * @returns {object[]}
 */
export function matchIntent(intent, legalMoves) {
  if (!intent) return [];
  if (intent.kind === 'castle') {
    return legalMoves.filter((m) => (intent.side ? m.flags.includes(intent.side) : /[kq]/.test(m.flags)));
  }
  if (intent.implicitPromotion) {
    // Tên quân nói sau ô ở hàng 1/8 không kèm "phong": ưu tiên phong cấp, không có thì hiểu là quân đó đi tới ô.
    const asPromotion = matchIntent({ ...intent, implicitPromotion: false }, legalMoves);
    if (asPromotion.length) return asPromotion;
    return matchIntent({ ...intent, implicitPromotion: false, promotion: null, piece: intent.promotion }, legalMoves);
  }
  let ms = legalMoves.filter((m) => m.to === intent.to);
  if (intent.from) ms = ms.filter((m) => m.from === intent.from);
  if (intent.fromFile) ms = ms.filter((m) => m.from[0] === intent.fromFile);
  if (intent.fromRank) ms = ms.filter((m) => m.from[1] === String(intent.fromRank));
  if (intent.piece) ms = ms.filter((m) => m.piece === intent.piece);
  if (intent.takes) ms = ms.filter((m) => /[ce]/.test(m.flags));
  if (intent.captured) ms = ms.filter((m) => m.captured === intent.captured);
  if (intent.promotion) ms = ms.filter((m) => m.promotion === intent.promotion);
  else ms = ms.filter((m) => !m.promotion || m.promotion === 'q');

  if (!intent.piece && !intent.from) {
    const pawns = ms.filter((m) => m.piece === 'p');
    if (intent.fromFile) ms = pawns; // "e d5": tốt cột e
    else if (!intent.takes && pawns.length) ms = pawns; // "e4": ưu tiên tốt
  }
  return ms;
}

/** Ý định chỉ có ô đến (không tên quân, không ô/cột/hàng xuất phát). */
const isBareSquare = (intent) => intent.kind === 'move' && !intent.piece && !intent.from && !intent.fromFile && !intent.fromRank;

/** Phân tích một câu nói thành nước đi. */
export function parseMoveText(raw, legalMoves) {
  const { lexemes, unknown } = lex(raw);
  if (!lexemes.length) return { type: 'unknown', transcript: raw };
  let firstIntent = null;
  for (const tokens of expandReadings(lexemes)) {
    const intent = parseIntent(tokens);
    if (!intent) continue;
    // Có từ không hiểu mà câu lại chỉ còn mỗi ô đến ("tương bê ba" → "bê ba"): từ lạ rất có thể là tên quân
    // nghe nhầm. Không được đoán thành tốt đi tới ô đó → bắt nói lại.
    if (unknown.length && isBareSquare(intent)) continue;
    if (!firstIntent) firstIntent = intent;
    const matches = matchIntent(intent, legalMoves);
    if (matches.length) return { type: 'move', matches, intent, transcript: raw };
  }
  if (firstIntent) return { type: 'move', matches: [], intent: firstIntent, transcript: raw };
  return { type: 'unknown', transcript: raw };
}

/**
 * Phân tích các phương án nhận dạng (maxAlternatives) theo thứ tự tin cậy.
 * @param {string|string[]} alternatives
 * @param {{ mode?: 'move'|'confirm'|'peek', legalMoves?: object[] }} ctx
 * @returns {{type:'command', name:string, transcript:string} | {type:'move', matches:object[], intent:object, transcript:string} | {type:'unknown', transcript:string}}
 */
export function parseUtterance(alternatives, ctx = {}) {
  const alts = (Array.isArray(alternatives) ? alternatives : [alternatives])
    .map((a) => String(a ?? '').trim())
    .filter((a) => a.length);
  const mode = ctx.mode || 'move';
  const first = alts[0] ?? '';
  if (!alts.length) return { type: 'unknown', transcript: '' };

  if (mode === 'confirm') {
    for (const a of alts) {
      const name = detectConfirm(a);
      if (name) return { type: 'command', name, transcript: a };
    }
    return { type: 'unknown', transcript: first };
  }
  if (mode === 'peek') {
    for (const a of alts) {
      if (detectDone(a)) return { type: 'command', name: 'DONE', transcript: a };
    }
    return { type: 'unknown', transcript: first };
  }

  const legal = ctx.legalMoves || [];
  let fallback = null;
  for (const a of alts) {
    const name = detectCommand(a);
    if (name) return { type: 'command', name, transcript: a };
    const r = parseMoveText(a, legal);
    if (r.type === 'move' && r.matches.length) return r;
    if (!fallback && r.type === 'move') fallback = r;
  }
  return fallback || { type: 'unknown', transcript: first };
}
