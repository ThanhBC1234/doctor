// Form cài đặt trước ván: đọc / ghi settings.

import { VI } from '../i18n/vi.js';
import { TIME_CONTROLS } from '../clock.js';
import { clampElo, eloLabelKey, ENGINE_ELO_MIN } from '../elo.js';

const $ = (id) => document.getElementById(id);

function timeControlLabel(tc) {
  if (tc.id === 'none') return VI.setup.clockNone;
  if (tc.id === 'custom') return VI.setup.clockCustom;
  return `${tc.minutes} + ${tc.increment}`;
}

/**
 * @param {{ settings: object, onChange: (s: object) => void, onStart: (s: object) => void, coarsePointer: boolean }} opts
 */
export function bindSetupForm(opts) {
  const form = $('setup-form');
  const tcSelect = $('timeControl');
  tcSelect.replaceChildren(...TIME_CONTROLS.map((tc) => {
    const o = document.createElement('option');
    o.value = tc.id;
    o.textContent = timeControlLabel(tc);
    return o;
  }));

  const howto = $('howto-list');
  howto.replaceChildren(...VI.setup.howToBody.map((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    return li;
  }));

  // Nghe liên tục chỉ hợp với máy tính có loa ngoài + micro; ẩn trên điện thoại.
  if (opts.coarsePointer) $('listen-mode-field').hidden = true;

  function write(s) {
    $('elo').value = String(s.elo);
    for (const r of form.querySelectorAll('input[name="color"]')) r.checked = r.value === s.color;
    tcSelect.value = s.timeControl;
    $('customMinutes').value = String(s.customMinutes);
    $('customIncrement').value = String(s.customIncrement);
    $('speechLang').value = s.speechLang;
    $('confirm').checked = s.confirm;
    $('announce').checked = s.announce;
    $('clockWarnings').checked = s.clockWarnings;
    $('fileStyle').value = s.fileStyle;
    $('rate').value = String(s.rate);
    $('listenMode').value = opts.coarsePointer ? 'tap' : s.listenMode;
    refreshDerived();
  }

  function read() {
    const color = form.querySelector('input[name="color"]:checked')?.value || 'w';
    const num = (id, def, min, max) => {
      const n = Math.round(Number($(id).value));
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    };
    return {
      ...opts.settings,
      elo: clampElo($('elo').value),
      color,
      timeControl: tcSelect.value,
      customMinutes: num('customMinutes', 10, 1, 180),
      customIncrement: num('customIncrement', 0, 0, 60),
      speechLang: $('speechLang').value,
      confirm: $('confirm').checked,
      announce: $('announce').checked,
      clockWarnings: $('clockWarnings').checked,
      fileStyle: $('fileStyle').value,
      rate: Number($('rate').value) || 1,
      // Danh sách giọng tải muộn (voiceschanged): chưa có thì giữ giọng đã lưu, không ghi đè bằng ''
      voiceURI: $('voiceURI').options.length > 1 ? $('voiceURI').value : opts.settings.voiceURI,
      listenMode: opts.coarsePointer ? 'tap' : $('listenMode').value,
    };
  }

  function refreshDerived() {
    const elo = clampElo($('elo').value);
    $('elo-value').textContent = String(elo);
    $('elo-label').textContent = VI.setup.eloLabels[eloLabelKey(elo)];
    $('elo-note').hidden = elo >= ENGINE_ELO_MIN;
    $('custom-clock').hidden = tcSelect.value !== 'custom';
  }

  // Enter trong ô số (phút, giây cộng) không được bắt đầu ván (thao tác nặng: xin micro, chuyển màn hình)
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target?.type === 'number') e.preventDefault();
  });
  form.addEventListener('input', () => {
    refreshDerived();
    opts.settings = read();
    opts.onChange(opts.settings);
  });
  form.addEventListener('change', () => {
    opts.settings = read();
    opts.onChange(opts.settings);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    opts.settings = read();
    opts.onStart(opts.settings);
  });

  write(opts.settings);

  return {
    /** Điền danh sách giọng đọc (giọng tiếng Việt lên đầu). */
    setVoices(voices, selected) {
      const sel = $('voiceURI');
      const def = document.createElement('option');
      def.value = '';
      def.textContent = VI.setup.voiceDefault;
      sel.replaceChildren(def, ...voices.map((v) => {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        o.textContent = `${v.name} (${v.lang})`;
        return o;
      }));
      sel.value = voices.some((v) => v.voiceURI === selected) ? selected : '';
    },
    setStartEnabled(enabled) {
      $('btn-start').disabled = !enabled;
    },
    setEngineStatus(text) {
      $('engine-status').textContent = text;
    },
    get settings() { return read(); },
    write,
  };
}
