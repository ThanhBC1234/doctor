// Vẽ bàn cờ (chỉ để xem: lúc tháo bịt mắt và sau ván). Không kéo thả.

import { Chess } from '../../vendor/chess.js/chess.js';
import { VI } from '../i18n/vi.js';

const FILES = 'abcdefgh';

/**
 * @param {HTMLElement} container
 * @param {string} fen
 * @param {{ orientation?: 'w'|'b', lastMove?: {from:string,to:string}|null }} [opts]
 */
export function renderBoard(container, fen, opts = {}) {
  const orientation = opts.orientation || 'w';
  const board = new Chess(fen).board(); // board[0] = hàng 8
  const el = document.createElement('div');
  el.className = 'board';
  el.dataset.testid = 'board';
  el.dataset.fen = fen;

  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'w' ? FILES.split('') : FILES.split('').reverse();
  ranks.forEach((rank, ri) => {
    files.forEach((file, fi) => {
      const sqName = `${file}${rank}`;
      const cell = board[8 - rank][FILES.indexOf(file)];
      const sq = document.createElement('div');
      const dark = (FILES.indexOf(file) + rank) % 2 === 1; // a1 là ô tối
      sq.className = `sq ${dark ? 'dark' : 'light'}`;
      sq.dataset.testid = `square-${sqName}`;
      if (opts.lastMove && (opts.lastMove.from === sqName || opts.lastMove.to === sqName)) sq.classList.add('last');
      if (cell) {
        const img = document.createElement('img');
        img.src = new URL(`../../assets/pieces/${cell.color}${cell.type.toUpperCase()}.svg`, import.meta.url).href;
        img.alt = `${VI.pieces[cell.type]} ${VI.colors[cell.color].toLowerCase()}`;
        img.draggable = false;
        sq.dataset.piece = `${cell.color}${cell.type}`;
        sq.appendChild(img);
      }
      if (fi === 0) sq.insertAdjacentHTML('beforeend', `<span class="coord rank">${rank}</span>`);
      if (ri === 7) sq.insertAdjacentHTML('beforeend', `<span class="coord file">${file}</span>`);
      el.appendChild(sq);
    });
  });
  container.replaceChildren(el);
  return el;
}

export function clearBoard(container) {
  container.replaceChildren();
}
