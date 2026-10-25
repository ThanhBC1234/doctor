// Nước đi → câu tiếng Việt để TTS đọc. Module thuần.
//
// Chữ cột luôn được viết thành từ đầy đủ ("bê", "dê"…) vì giọng vi-VN đọc chữ đơn không nhất quán.
// Dấu phẩy chỉ để TTS ngắt hơi.

import { VI } from '../i18n/vi.js';

const ORDER = ['k', 'q', 'r', 'b', 'n'];

/** @param {'vi'|'nato'} style */
export function spellFile(file, style = 'vi') {
  const table = VI.files[style] || VI.files.vi;
  return table[file] ?? file;
}

/** "e4" → "e 4" (kiểu vi) hoặc "echo 4" (NATO). */
export function spellSquare(square, style = 'vi') {
  return `${spellFile(square[0], style)} ${square[1]}`;
}

function spellDisambiguation(d, style) {
  if (!d) return '';
  if (/^[a-h][1-8]$/.test(d)) return spellSquare(d, style);
  if (/^[a-h]$/.test(d)) return spellFile(d, style);
  return d;
}

/** Phần phân biệt trong SAN: "Nbd2" → "b", "R1e1" → "1", "Qh4e1" → "h4". */
export function sanDisambiguation(san) {
  const m = /^[KQRBN]([a-h]?[1-8]?)x?[a-h][1-8]/.exec(san);
  return m ? m[1] : '';
}

/**
 * @param {{piece:string, from:string, to:string, san:string, flags:string, promotion?:string, captured?:string}} move
 * @param {{ announceCaptures?: boolean, fileStyle?: 'vi'|'nato' }} opts
 * @returns {string}
 */
export function speakMove(move, opts = {}) {
  const announce = !!opts.announceCaptures;
  const style = opts.fileStyle || 'vi';
  const P = VI.pieces;
  const M = VI.move;
  const isCapture = /[ce]/.test(move.flags);
  const isEp = move.flags.includes('e');
  let text;

  if (move.flags.includes('k')) text = M.castleShort;
  else if (move.flags.includes('q')) text = M.castleLong;
  else if (move.piece === 'p') {
    const to = spellSquare(move.to, style);
    const fromFile = spellFile(move.from[0], style);
    if (!isCapture) text = `${P.p} ${to}`;
    else if (!announce) text = `${P.p} ${fromFile}, ${to}`;
    else if (isEp) text = `${P.p} ${fromFile} ${M.capture} ${to}, ${M.enPassant}`;
    else text = `${P.p} ${fromFile} ${M.capture} ${P[move.captured]} ${to}`;
    if (move.promotion) text += `, ${M.promote(P[move.promotion])}`;
  } else {
    const name = P[move.piece];
    const d = spellDisambiguation(sanDisambiguation(move.san), style);
    const to = spellSquare(move.to, style);
    if (announce && isCapture) text = `${name}${d ? ` ${d}` : ''} ${M.capture} ${P[move.captured]} ${to}`;
    else text = d ? `${name} ${d}, ${to}` : `${name} ${to}`;
  }

  if (announce) {
    if (move.san.includes('#')) text += `, ${M.mate}`;
    else if (move.san.includes('+')) text += `, ${M.check}`;
  }
  return text;
}

/** Mô tả lại điều máy hiểu được (khi nước đi không hợp lệ). */
export function describeIntent(intent, opts = {}) {
  const style = opts.fileStyle || 'vi';
  if (!intent) return '';
  if (intent.kind === 'castle') {
    if (intent.side === 'k') return VI.move.castleShort;
    if (intent.side === 'q') return VI.move.castleLong;
    return VI.move.castleEither;
  }
  const parts = [];
  if (intent.piece) parts.push(VI.pieces[intent.piece]);
  if (intent.from) parts.push(spellSquare(intent.from, style), VI.move.to);
  if (intent.fromFile) parts.push(spellFile(intent.fromFile, style));
  if (intent.fromRank) parts.push(String(intent.fromRank));
  if (intent.takes) parts.push(VI.move.capture);
  if (intent.captured) parts.push(VI.pieces[intent.captured]);
  parts.push(spellSquare(intent.to, style));
  let text = parts.join(' ');
  if (intent.promotion) text += `, ${VI.move.promote(VI.pieces[intent.promotion])}`;
  return text;
}

const squareOrder = (sq) => (sq.charCodeAt(0) - 97) * 8 + Number(sq[1]);

/**
 * Liệt kê quân không phải tốt của một bên, theo thứ tự Vua, Hậu, Xe, Tượng, Mã.
 * @param {(null|{type:string,color:string,square:string})[][]} board chess.board()
 * @param {'w'|'b'} color
 * @returns {{type:string, squares:string[]}[]}
 */
export function listMajorPieces(board, color) {
  const by = {};
  for (const row of board) {
    for (const cell of row) {
      if (!cell || cell.color !== color || cell.type === 'p') continue;
      (by[cell.type] ||= []).push(cell.square);
    }
  }
  return ORDER.filter((t) => by[t]).map((t) => ({ type: t, squares: by[t].sort((a, b) => squareOrder(a) - squareOrder(b)) }));
}

/**
 * Câu đọc vị trí quân của cả hai bên, bên người chơi trước.
 * @returns {string[]} các câu ngắn (mỗi bên một câu) để TTS đọc lần lượt
 */
export function describePieces(board, firstColor, opts = {}) {
  const style = opts.fileStyle || 'vi';
  const colors = firstColor === 'b' ? ['b', 'w'] : ['w', 'b'];
  return colors.map((c) => {
    const groups = listMajorPieces(board, c).map(({ type, squares }) =>
      squares.map((sq) => `${VI.pieces[type]} ${spellSquare(sq, style)}`).join(', '));
    return `${VI.say.sideHeader(VI.colors[c])} ${groups.join('. ')}.`;
  });
}
