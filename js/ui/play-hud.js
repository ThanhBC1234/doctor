// Màn hình chơi: trạng thái, đồng hồ, quyền trợ giúp. Không có bàn cờ.

import { VI } from '../i18n/vi.js';

const $ = (id) => document.getElementById(id);

/** 754000 → "12:34"; dưới 20 giây có phần mười: "9.4" */
export function formatClock(ms) {
  const v = Math.max(0, ms);
  if (v < 20000) return (Math.floor(v / 100) / 10).toFixed(1);
  const total = Math.ceil(v / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const STATUS = {
  idle: '',
  player: () => VI.play.yourTurn,
  engine: () => VI.play.engineThinking,
  confirm: () => VI.play.waitingConfirm,
  paused: () => VI.play.paused,
  peek: () => VI.play.yourTurn,
  over: () => '',
};

export function createHud() {
  const section = $('screen-play');
  const clocks = $('clocks');
  const playerClock = section.querySelector('[data-testid="clock-player"]');
  const engineClock = section.querySelector('[data-testid="clock-engine"]');
  let flashTimer = null;

  return {
    /** @param {object} s trạng thái từ store */
    render(s) {
      const phase = s.listening ? 'listening' : s.phase;
      section.dataset.phase = phase;
      $('move-number').textContent = s.moveNumber ? VI.play.moveNumber(s.moveNumber) : '';
      const st = STATUS[s.phase];
      $('status').textContent = typeof st === 'function' ? st() : '';

      let hint = '';
      if (s.listening) hint = VI.play.listening;
      else if (s.phase === 'confirm') hint = VI.play.tapToAnswer;
      else if (s.phase === 'paused') hint = VI.play.tapToResume;
      else if (s.phase === 'player' && !s.speaking) hint = s.speechSupported === false ? VI.play.typeHint : VI.play.tapToSpeak;
      $('mic-hint').textContent = hint;
      $('transcript').textContent = s.transcript ? VI.play.heard(s.transcript) : '';

      const peekBtn = $('btn-peek');
      const locBtn = $('btn-locate');
      peekBtn.querySelector('.count').textContent = String(s.hints.peeksLeft);
      locBtn.querySelector('.count').textContent = String(s.hints.locatesLeft);
      peekBtn.classList.toggle('used', s.hints.peeksLeft === 0);
      locBtn.classList.toggle('used', s.hints.locatesLeft === 0);

      clocks.classList.toggle('none', !s.clock);
      if (s.clock) {
        playerClock.querySelector('.time').textContent = formatClock(s.clock.player);
        engineClock.querySelector('.time').textContent = formatClock(s.clock.engine);
        playerClock.classList.toggle('active', s.clock.active === 'player');
        engineClock.classList.toggle('active', s.clock.active === 'engine');
        playerClock.classList.toggle('low', s.clock.player < 30000);
        engineClock.classList.toggle('low', s.clock.engine < 30000);
      }
    },

    /** Nháy đỏ khi lỗi (kèm tiếng bíp ở nơi gọi). */
    flashError() {
      section.classList.add('flash-error');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => section.classList.remove('flash-error'), 300);
    },
  };
}
