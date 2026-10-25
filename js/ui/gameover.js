// Màn hình kết thúc: kết quả, bàn cờ, danh sách nước, xem lại, PGN.

import { VI } from '../i18n/vi.js';
import { renderBoard } from './board.js';

const $ = (id) => document.getElementById(id);
const PGN_MIME = 'application/x-chess-pgn';

/** Sao chép: clipboard API, không có thì execCommand('copy'); trả về true nếu thành công. */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.error('[gameover] clipboard API thất bại, thử cách cũ', err);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch (err) {
    console.error('[gameover] không sao chép được', err);
    return false;
  }
}

/** Tải PGN: trên điện thoại ưu tiên bảng chia sẻ (tải file từ web app iOS không ổn định). */
async function savePgn(pgn, fileName) {
  try {
    if (navigator.canShare && typeof File === 'function') {
      const file = new File([pgn], fileName, { type: PGN_MIME });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return;
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError') return; // người dùng đóng bảng chia sẻ
    console.error('[gameover] chia sẻ thất bại, tải xuống thay thế', err);
  }
  const blob = new Blob([pgn], { type: PGN_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Firefox / Safari chỉ lấy dữ liệu sau khi người dùng xác nhận hộp thoại: giữ URL đủ lâu.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * @param {{ title:string, reason:string, history:object[], fenAt:(ply:number)=>string, orientation:'w'|'b',
 *   pgn:string, lichessUrl:string, fileName:string }} data
 * @param {{ onRematch:()=>void, onNew:()=>void, onCopyFailed?:()=>void }} handlers
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
    const cur = list.querySelector('button.current');
    if (cur) cur.scrollIntoView?.({ block: 'nearest' });
    else list.scrollTop = 0; // về đầu ván: không có nước nào được tô

    $('nav-first').disabled = ply === 0;
    $('nav-prev').disabled = ply === 0;
    $('nav-next').disabled = ply === total;
    $('nav-last').disabled = ply === total;
  }

  const items = [];
  for (let i = 0; i < total; i += 2) {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = `${i / 2 + 1}.`;
    li.appendChild(num);
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
  list.replaceChildren(...items);

  $('nav-first').onclick = () => { ply = 0; draw(); };
  $('nav-prev').onclick = () => { ply = Math.max(0, ply - 1); draw(); };
  $('nav-next').onclick = () => { ply = Math.min(total, ply + 1); draw(); };
  $('nav-last').onclick = () => { ply = total; draw(); };

  $('btn-download').onclick = () => { void savePgn(data.pgn, data.fileName); };
  const copyBtn = $('btn-copy');
  copyBtn.onclick = async () => {
    const ok = await copyText(data.pgn);
    copyBtn.textContent = ok ? VI.result.copied : VI.result.copyFailed;
    if (!ok) handlers.onCopyFailed?.();
    setTimeout(() => { copyBtn.textContent = VI.result.copyPgn; }, 2500);
  };
  $('btn-lichess').href = data.lichessUrl;
  $('btn-rematch').onclick = handlers.onRematch;
  $('btn-new').onclick = handlers.onNew;

  draw();
}
