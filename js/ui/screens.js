// Chuyển màn hình và gắn chữ từ VI vào HTML (data-i18n).

import { VI } from '../i18n/vi.js';

/** Tra khóa "setup.strength" trong VI. */
export function t(key) {
  const v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), VI);
  if (typeof v !== 'string') {
    console.error('[i18n] thiếu chuỗi', key);
    return key;
  }
  return v;
}

/** Điền chữ cho mọi phần tử có data-i18n, data-i18n-placeholder, data-i18n-aria. */
export function applyI18n(root = document) {
  document.title = VI.appTitle;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
    el.title = t(el.dataset.i18nAria);
  }
}

const SCREENS = ['setup', 'play', 'peek', 'gameover'];

/**
 * Hiện một màn hình. "peek" phủ lên "play" nên play vẫn giữ nguyên bên dưới.
 * @param {'setup'|'play'|'peek'|'gameover'} name
 */
export function showScreen(name) {
  for (const s of SCREENS) {
    const el = document.getElementById(`screen-${s}`);
    if (!el) continue;
    const visible = s === name || (name === 'peek' && s === 'play');
    el.hidden = !visible;
  }
  window.scrollTo(0, 0);
}

/** Thông báo cho trình đọc màn hình. */
export function announce(text) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  // đổi nội dung ở frame sau để trình đọc màn hình chắc chắn đọc lại
  requestAnimationFrame(() => { live.textContent = text; });
}
