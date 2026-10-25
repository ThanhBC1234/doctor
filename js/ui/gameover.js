// Màn hình kết thúc: kết quả, bàn cờ, danh sách nước, xem lại, PGN.

import { VI } from '../i18n/vi.js';
import { renderBoard } from './board.js';

const $ = (id) => document.getElementById(id);

/**
 * @param {{ title:string, reason:string, history:object[], fenAt:(ply:number)=>string, orientation:'w'|'b',
 *   pgn:string, lichessUrl:string, fileName:string }} data
 * @param {{ onRematch:()=>void, onNew:()=>void }} handlers
 */
export function showGameover(data, handlers) {
  $('result-title').textContent = data.title;
  $('result-reason').textContent = data.reason;
  const list = $('movelist');
  const total = data.history.length;
  let ply = total;

  function draw() {
    const last = ply > 0 ? data.history[ply - 1] : null;
    renderBoard($('final-board'), data.fenAt(ply), { orientation: data.orientation, lastMove: last });
    for (const b of list.querySelectorAll('button')) b.classList.toggle('current', Number(b.dataset.ply) === ply);
    $('nav-first').disabled = ply === 0;
    $('nav-prev').disabled = ply === 0;
    $('nav-next').disabled = ply === total;
    $('nav-last').disabled = ply === total;
  }

  const items = [];
  for (let i = 0; i < total; i += 2) {
    const li = document.createElement('li');
    for (const j of [i, i + 1]) {
      const m = data.history[j];
      const b = document.createElement('button');
      b.type = 'button';
      if (m) {
        b.textContent = m.san;
        b.dataset.ply = String(j + 1);
        b.addEventListener('click', () => { ply = j + 1; draw(); });
      } else {
        b.disabled = true;
      }
      li.appendChild(b);
    }
    items.push(li);
  }
  // Ván Đen đi trước (do khôi phục) vẫn đánh số theo chess.js nên giữ đơn giản: 1 dòng = 2 nửa nước.
  list.replaceChildren(...items);

  $('nav-first').onclick = () => { ply = 0; draw(); };
  $('nav-prev').onclick = () => { ply = Math.max(0, ply - 1); draw(); };
  $('nav-next').onclick = () => { ply = Math.min(total, ply + 1); draw(); };
  $('nav-last').onclick = () => { ply = total; draw(); };

  $('btn-download').onclick = () => {
    const blob = new Blob([data.pgn], { type: 'application/x-chess-pgn' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = data.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('btn-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(data.pgn);
      $('btn-copy').textContent = VI.result.copied;
      setTimeout(() => { $('btn-copy').textContent = VI.result.copyPgn; }, 1500);
    } catch (err) {
      console.error('[gameover] không sao chép được', err);
    }
  };
  $('btn-lichess').href = data.lichessUrl;
  $('btn-rematch').onclick = handlers.onRematch;
  $('btn-new').onclick = handlers.onNew;

  draw();
}
