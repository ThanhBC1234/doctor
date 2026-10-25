// localStorage: cài đặt và ván đang chơi. Mọi truy cập bọc try/catch (chế độ riêng tư có thể chặn).

const SETTINGS_KEY = 'blindfold.settings';
const GAME_KEY = 'blindfold.game';
export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  elo: 1400,
  color: 'w', // 'w' | 'b' | 'random'
  timeControl: '15+10',
  customMinutes: 10,
  customIncrement: 5,
  speechLang: 'vi-VN',
  confirm: true,
  announce: false,
  fileStyle: 'vi',
  rate: 1,
  voiceURI: '',
  listenMode: 'tap', // 'tap' | 'continuous'
  clockWarnings: true,
};

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[storage] không đọc được', key, err);
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('[storage] không ghi được', key, err);
    return false;
  }
}

export function loadSettings() {
  const saved = read(SETTINGS_KEY);
  if (!saved || saved.v !== SCHEMA_VERSION) return { ...DEFAULT_SETTINGS };
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (k in saved.data && typeof saved.data[k] === typeof DEFAULT_SETTINGS[k]) out[k] = saved.data[k];
  }
  return out;
}

export function saveSettings(settings) {
  return write(SETTINGS_KEY, { v: SCHEMA_VERSION, data: settings });
}

/** @returns {null | object} ván đã lưu, hoặc null nếu không có / sai phiên bản */
export function loadGame() {
  const saved = read(GAME_KEY);
  if (!saved || saved.v !== SCHEMA_VERSION || !Array.isArray(saved.uciMoves)) return null;
  return saved;
}

export function saveGame(data) {
  return write(GAME_KEY, { v: SCHEMA_VERSION, ...data, savedAt: Date.now() });
}

export function clearGame() {
  return write(GAME_KEY, null);
}
