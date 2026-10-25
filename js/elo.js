// Ánh xạ Elo hiển thị → tham số Stockfish. Module thuần, không đụng trình duyệt.
//
// Stockfish 19 lite chỉ nhận UCI_Elo từ 1320. Dưới mức đó ta mô phỏng bằng
// Skill Level 0 + thỉnh thoảng thay bằng một nước kém hơn (xem ELO_LOW_TABLE).

export const ELO_MIN = 1000;
export const ELO_MAX = 2500;
export const ELO_STEP = 50;
export const ENGINE_ELO_MIN = 1320;

/**
 * Bảng mức thấp (dưới 1320). Tinh chỉnh tại đây.
 *
 * Stockfish coi UCI_Elo 1320 ≈ Skill Level 0 (chọn ngẫu nhiên có trọng số trong ít nhất 4 nước đầu).
 * Mức thấp hơn được làm yếu thêm theo hai cách, đều chỉ có thể làm nước đi tệ đi:
 *  - multiPV lớn hơn: Skill 0 chọn trong nhiều ứng viên hơn;
 *  - với xác suất `probability`, thay nước Stockfish chọn bằng một nước KÉM HƠN nó,
 *    nhưng không kém nước tốt nhất quá `windowCp` (để không đi nước vô lý).
 */
export const ELO_LOW_TABLE = [
  { elo: 1000, multiPV: 8, probability: 0.5, windowCp: 400 },
  { elo: 1050, multiPV: 8, probability: 0.43, windowCp: 350 },
  { elo: 1100, multiPV: 7, probability: 0.36, windowCp: 300 },
  { elo: 1150, multiPV: 7, probability: 0.3, windowCp: 250 },
  { elo: 1200, multiPV: 6, probability: 0.24, windowCp: 200 },
  { elo: 1250, multiPV: 6, probability: 0.18, windowCp: 150 },
  { elo: 1300, multiPV: 5, probability: 0.12, windowCp: 120 },
];

/** Độ sâu tìm kiếm ở mức thấp (Skill 0 chọn nước ở độ sâu 1; độ sâu này chỉ để chấm điểm ứng viên). */
export const LOW_DEPTH = 3;

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
        'Skill Level': 0,
        MultiPV: row.multiPV,
      },
      goCommand: `go depth ${LOW_DEPTH}`,
      randomize: { probability: row.probability, windowCp: row.windowCp },
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
