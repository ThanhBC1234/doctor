// Xuất PGN có header và link phân tích Lichess. Module thuần.

import { Chess } from '../vendor/chess.js/chess.js';
import { VI } from './i18n/vi.js';

const TERMINATION = {
  timeout: 'time forfeit',
  resign: 'normal',
  agreement: 'normal',
  checkmate: 'normal',
  stalemate: 'normal',
  threefold: 'normal',
  fifty: 'normal',
  insufficient: 'normal',
};

function pad(n) {
  return String(n).padStart(2, '0');
}

export function pgnDate(d = new Date()) {
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/**
 * @param {{ uciMoves:string[], playerColor:'w'|'b', elo:number, result:string, reason?:string|null,
 *   date?:Date, timeControl?:string }} meta
 * @returns {string}
 */
export function buildPgn(meta) {
  const chess = new Chess();
  for (const u of meta.uciMoves) {
    chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  }
  const player = VI.result.pgnPlayer;
  const engine = VI.result.pgnEngine(meta.elo);
  chess.setHeader('Event', VI.result.pgnEvent);
  chess.setHeader('Site', 'Blindfold chess (browser)');
  chess.setHeader('Date', pgnDate(meta.date || new Date()));
  chess.setHeader('Round', '-');
  chess.setHeader('White', meta.playerColor === 'w' ? player : engine);
  chess.setHeader('Black', meta.playerColor === 'b' ? player : engine);
  chess.setHeader('Result', meta.result || '*');
  if (meta.playerColor === 'w') chess.setHeader('BlackElo', String(meta.elo));
  else chess.setHeader('WhiteElo', String(meta.elo));
  chess.setHeader('TimeControl', meta.timeControl || '-');
  if (meta.reason && TERMINATION[meta.reason]) chess.setHeader('Termination', TERMINATION[meta.reason]);
  let pgn = chess.pgn();
  // chess.js chỉ tự ghi kết quả khi ván kết thúc theo luật; xin thua / hết giờ phải tự thêm.
  const result = meta.result || '*';
  if (!pgn.trimEnd().endsWith(result)) pgn = `${pgn.trimEnd()} ${result}`;
  return pgn;
}

export function lichessAnalysisUrl(pgn) {
  return `https://lichess.org/analysis/pgn/${encodeURIComponent(pgn)}`;
}

export function pgnFileName(d = new Date()) {
  return `co-mu-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.pgn`;
}
