// Ánh xạ Elo hiển thị → tham số Stockfish. Module thuần, không đụng trình duyệt.
//
// Stockfish 19 lite chỉ nhận UCI_Elo từ 1320. Dưới mức đó ta mô phỏng bằng
// Skill Level thấp + giới hạn độ sâu + chọn ngẫu nhiên trong vài nước gần tốt nhất.

export const ELO_MIN = 1000;
export const ELO_MAX = 2500;
export const ELO_STEP = 50;
export const ENGINE_ELO_MIN = 1320;

/** Bảng mức thấp (dưới 1320). Tinh chỉnh tại đây. */
export const ELO_LOW_TABLE = [
  { elo: 1000, skill: 0, depth: 1 },
  { elo: 1050, skill: 0, depth: 2 },
  { elo: 1100, skill: 1, depth: 2 },
  { elo: 1150, skill: 2, depth: 3 },
  { elo: 1200, skill: 3, depth: 3 },
  { elo: 1250, skill: 4, depth: 4 },
  { elo: 1300, skill: 5, depth: 4 },
];

/** Ngẫu nhiên hóa ở mức thấp: xác suất bỏ nước tốt nhất, và cửa sổ điểm (centipawn). */
export const LOW_RANDOMIZE = { probability: 0.35, windowCp: 80, multiPV: 3 };

/** Đưa Elo về khoảng hợp lệ và làm tròn theo bước 50. */
export function clampElo(elo) {
  const n = Number.isFinite(Number(elo)) ? Number(elo) : 1400;
  const rounded = Math.round(n / ELO_STEP) * ELO_STEP;
  return Math.min(ELO_MAX, Math.max(ELO_MIN, rounded));
}

/**
 * @param {number} elo
 * @returns {{ elo:number, options: Record<string, string|number|boolean>, goCommand: string,
 *   randomize: null | {probability:number, windowCp:number}, approximate: boolean }}
 */
export function eloToEngineParams(elo) {
  const e = clampElo(elo);
  if (e < ENGINE_ELO_MIN) {
    let row = ELO_LOW_TABLE[0];
    for (const r of ELO_LOW_TABLE) {
      if (Math.abs(r.elo - e) < Math.abs(row.elo - e)) row = r;
    }
    return {
      elo: e,
      options: {
        UCI_LimitStrength: false,
        'Skill Level': row.skill,
        MultiPV: LOW_RANDOMIZE.multiPV,
      },
      goCommand: `go depth ${row.depth}`,
      randomize: { probability: LOW_RANDOMIZE.probability, windowCp: LOW_RANDOMIZE.windowCp },
      approximate: true,
    };
  }
  return {
    elo: e,
    options: {
      UCI_LimitStrength: true,
      UCI_Elo: e,
      'Skill Level': 20,
      MultiPV: 1,
    },
    goCommand: e >= 1850 ? 'go movetime 1200' : 'go movetime 800',
    randomize: null,
    approximate: false,
  };
}

/** Tham số dùng khi cần đánh giá chính xác (cầu hòa): không giới hạn sức mạnh. */
export const FULL_STRENGTH_OPTIONS = {
  UCI_LimitStrength: false,
  'Skill Level': 20,
  MultiPV: 1,
};

/** Khóa nhãn mức chơi (tra trong VI.setup.eloLabels). */
export function eloLabelKey(elo) {
  const e = clampElo(elo);
  if (e <= 1200) return 'beginner';
  if (e <= 1500) return 'intermediate';
  if (e <= 1800) return 'good';
  if (e <= 2100) return 'strong';
  return 'expert';
}

/** Danh sách mọi mức Elo người dùng chọn được. */
export function allEloLevels() {
  const out = [];
  for (let e = ELO_MIN; e <= ELO_MAX; e += ELO_STEP) out.push(e);
  return out;
}
