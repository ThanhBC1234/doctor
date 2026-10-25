// Chuẩn hóa câu nói (transcript) thành danh sách "từ vị" (lexeme) có kiểu.
// Module thuần: không đụng DOM, test bằng node --test.
//
// Mỗi lexeme có một hoặc nhiều cách hiểu (reading), xếp theo thứ tự ưu tiên.
// Ví dụ "xe" có thể là quân Xe hoặc chữ cột c; parser thử lần lượt các cách hiểu.

/** Bỏ dấu tiếng Việt: "mã" → "ma", "đến" → "den". */
export function stripDiacritics(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

const R = {
  file: (v) => ({ t: 'file', v }),
  rank: (v) => ({ t: 'rank', v }),
  piece: (v) => ({ t: 'piece', v }),
  takes: { t: 'takes' },
  to: { t: 'to' },
  promo: { t: 'promo' },
  cs: { t: 'cs' },
  cl: { t: 'cl' },
  castle: { t: 'c' },
  ignore: { t: 'ignore' },
};

const FILE_ALIASES = {
  a: ['ây', 'ay', 'alpha', 'alfa'],
  b: ['bê', 'bờ', 'bi', 'bee', 'bravo', 'bế', 'bề', 'bể'],
  c: ['c', 'xê', 'xi', 'si', 'see', 'sea', 'cê', 'charlie', 'sê', 'xế', 'xề', 'cee'],
  d: ['d', 'dê', 'đê', 'đe', 'di', 'dee', 'delta', 'dờ', 'đờ', 'đề', 'dề', 'dế', 'rê', 'yê'],
  e: ['e', 'ê', 'i', 'ee', 'echo', 'ế', 'ề', 'ể'],
  f: ['f', 'ép', 'ep', 'ef', 'eff', 'foxtrot', 'phờ', 'éf', 'ếp', 'ép phờ'],
  g: ['g', 'gờ', 'giê', 'gie', 'ghi', 'gi', 'gee', 'golf', 'gê', 'jee', 'ji', 'giờ'],
  h: ['h', 'hát', 'hắt', 'hat', 'aitch', 'hotel', 'hờ', 'hách', 'hét'],
};

const RANK_ALIASES = {
  1: ['1', 'một', 'mốt', 'one', 'nhất'],
  2: ['2', 'hai', 'two'],
  3: ['3', 'ba', 'three', 'tree', 'free'],
  4: ['4', 'bốn', 'tư', 'four'],
  5: ['5', 'năm', 'lăm', 'five', 'nhăm'],
  6: ['6', 'sáu', 'six'],
  7: ['7', 'bảy', 'bẩy', 'seven'],
  8: ['8', 'tám', 'eight'],
};

const PIECE_ALIASES = {
  k: ['k', 'vua', 'tướng', 'king', 'kilo'],
  q: ['q', 'hậu', 'queen', 'quebec', 'hầu'],
  r: ['r', 'xa', 'rook', 'rock', 'ruk', 'rooks', 'romeo'],
  b: ['tượng', 'tịnh', 'bishop', 'bishops', 'tường', 'tưởng'],
  n: ['n', 'mã', 'mả', 'má', 'ngựa', 'knight', 'night', 'horse', 'nite', 'knights', 'november'],
  p: ['p', 'tốt', 'chốt', 'binh', 'pawn', 'pawns', 'pond', 'pon', 'papa'],
};

const TAKES_WORDS = ['ăn', 'bắt', 'lấy', 'takes', 'take', 'captures', 'capture', 'x', 'times', 'xơi', 'chén'];
const TO_WORDS = ['đến', 'tới', 'lên', 'qua', 'về', 'to', 'sang', 'xuống', 'vào', 'towards', 'goes', 'go', 'moves'];
const PROMO_WORDS = ['phong', 'thành', 'promote', 'promotes', 'promotion', 'promoted', 'equals', 'equal', '=', 'becomes', 'biến'];
const IGNORE_WORDS = [
  'chiếu', 'check', 'quân', 'con', 'ô', 'nước', 'the', 'please', 'nhé', 'nha', 'à', 'ạ', 'từ', 'from',
  'move', 'tôi', 'muốn', 'em', 'anh', 'chị', 'and', 'then', 'nào', 'đó', 'này', 'mate', 'hết', 'của', 'with',
];

/** Từ có nhiều nghĩa: thứ tự mặc định, có thể đổi theo ngữ cảnh (xem reorderByContext). */
const AMBIGUOUS = {
  xe: [R.piece('r'), R.file('c')],
  b: [R.file('b'), R.piece('b')],
  a: [R.file('a'), R.ignore],
  'đi': [R.to, R.file('d')],
  to: [R.to, R.rank(2)],
  too: [R.to, R.rank(2)],
  for: [R.ignore, R.rank(4)],
  ate: [R.ignore, R.rank(8)],
  castle: [R.castle, R.piece('r')],
  castleshort: [R.cs],
  castlelong: [R.cl],
  oo: [R.cs],
  ooo: [R.cl],
};

/** Cụm nhiều chữ, thay trước khi tách từ. Thứ tự không quan trọng: sắp theo độ dài giảm dần. */
const PHRASES = [
  // Nhập thành gần
  ...[
    'nhập thành gần', 'nhập thành ngắn', 'nhập thành cánh vua', 'nhập thành bên vua', 'nhập thành nhỏ', 'nhập thành phía vua',
    'castle kingside', 'castle king side', 'castles kingside', 'castles king side', 'kingside castle', 'king side castle',
    'kingside castling', 'castling kingside', 'castle short', 'castles short', 'short castle', 'short castling',
    'castling short', 'kingside', 'king side',
  ].map((p) => [p, 'castleshort']),
  // Nhập thành xa
  ...[
    'nhập thành xa', 'nhập thành dài', 'nhập thành cánh hậu', 'nhập thành bên hậu', 'nhập thành lớn', 'nhập thành phía hậu',
    'castle queenside', 'castle queen side', 'castles queenside', 'castles queen side', 'queenside castle', 'queen side castle',
    'queenside castling', 'castling queenside', 'castle long', 'castles long', 'long castle', 'long castling',
    'castling long', 'queenside', 'queen side',
  ].map((p) => [p, 'castlelong']),
  ['nhập thành', 'castle'],
  ['castling', 'castle'],
  ['castles', 'castle'],
  // Bỏ các cụm chỉ để thông báo
  ['bắt tốt qua đường', ' '],
  ['ăn tốt qua đường', ' '],
  ['tốt qua đường', ' '],
  ['qua đường', ' '],
  ['en passant', ' '],
  ['chiếu hết', ' '],
  ['check mate', ' '],
  ['checkmate', ' '],
  ['làm ơn', ' '],
  // Đồng nghĩa
  ['hoàng hậu', 'hậu'],
  ['phong cấp', 'phong'],
  ['phong thành', 'phong'],
  ['promote to', 'promote'],
  ['promotes to', 'promote'],
  ['ép phờ', 'ép'],
  ['ếp phờ', 'ép'],
];

function buildTable() {
  const table = new Map();
  const add = (word, reading) => {
    const list = table.get(word) || [];
    if (!list.some((r) => r.t === reading.t && r.v === reading.v)) list.push(reading);
    table.set(word, list);
  };
  for (const [f, words] of Object.entries(FILE_ALIASES)) for (const w of words) add(w, R.file(f));
  for (const [n, words] of Object.entries(RANK_ALIASES)) for (const w of words) add(w, R.rank(Number(n)));
  for (const [p, words] of Object.entries(PIECE_ALIASES)) for (const w of words) add(w, R.piece(p));
  for (const w of TAKES_WORDS) add(w, R.takes);
  for (const w of TO_WORDS) add(w, R.to);
  for (const w of PROMO_WORDS) add(w, R.promo);
  for (const w of IGNORE_WORDS) add(w, R.ignore);
  for (const [w, readings] of Object.entries(AMBIGUOUS)) table.set(w, readings.slice());
  return table;
}

const TABLE = buildTable();

// Bảng không dấu: chỉ dùng khi không khớp nguyên dạng. Từ không dấu trùng nghĩa khác nhau thì bỏ.
const PLAIN_TABLE = (() => {
  const plain = new Map();
  const conflict = new Set();
  for (const [word, readings] of TABLE) {
    const key = stripDiacritics(word);
    if (key === word || conflict.has(key)) continue;
    const prev = plain.get(key);
    if (prev && JSON.stringify(prev) !== JSON.stringify(readings)) {
      plain.delete(key);
      conflict.add(key);
      continue;
    }
    plain.set(key, readings);
  }
  return plain;
})();

// Kiểu bỏ dấu cũ ("hoà", "huỷ") → kiểu mới ("hòa", "hủy") để so khớp một kiểu.
const TONE_FIX = {
  'oà': 'òa', 'oá': 'óa', 'oả': 'ỏa', 'oã': 'õa', 'oạ': 'ọa',
  'oè': 'òe', 'oé': 'óe', 'oẻ': 'ỏe', 'oẽ': 'õe', 'oẹ': 'ọe',
  'uỳ': 'ùy', 'uý': 'úy', 'uỷ': 'ủy', 'uỹ': 'ũy', 'uỵ': 'ụy',
};
const TONE_RE = new RegExp(`(${Object.keys(TONE_FIX).join('|')})(?![\\p{L}])`, 'gu');

/** Chuẩn hóa vị trí dấu thanh ở cuối từ. */
export function normalizeToneMarks(s) {
  return s.replace(TONE_RE, (m) => TONE_FIX[m]);
}

const SORTED_PHRASES = (() => {
  const all = [];
  for (const [p, r] of PHRASES) {
    all.push([p, r]);
    const plain = stripDiacritics(p);
    if (plain !== p) all.push([plain, r]);
  }
  return all.sort((a, b) => b[0].length - a[0].length);
})();

/**
 * Hạ chữ thường, bỏ dấu câu, đổi ký hiệu nhập thành, thay cụm từ.
 * @param {string} raw
 * @returns {string}
 */
export function cleanText(raw) {
  let s = normalizeToneMarks(String(raw ?? '').toLowerCase().normalize('NFC'));
  s = s.replace(/[“”"`’‘()[\]{}]/g, ' ');
  s = s.replace(/(^|[^a-z0-9])[o0]\s*-\s*[o0]\s*-\s*[o0](?![a-z0-9])/g, '$1 castlelong ');
  s = s.replace(/(^|[^a-z0-9])[o0]\s*-\s*[o0](?![a-z0-9])/g, '$1 castleshort ');
  s = s.replace(/=/g, ' = ');
  s = s.replace(/[.,!?;:+#…\-–—_/\\']/g, ' ');
  s = ` ${s.replace(/\s+/g, ' ').trim()} `;
  for (const [phrase, rep] of SORTED_PHRASES) {
    const needle = ` ${phrase} `;
    while (s.includes(needle)) s = s.replace(needle, ` ${rep} `);
  }
  return s.replace(/\s+/g, ' ').trim();
}

function lookup(word) {
  if (TABLE.has(word)) return TABLE.get(word).slice();
  const plain = stripDiacritics(word);
  if (PLAIN_TABLE.has(plain)) return PLAIN_TABLE.get(plain).slice();
  if (TABLE.has(plain)) return TABLE.get(plain).slice();
  return null;
}

/** Tách cụm dính như "nf3", "e2e4", "exd5", "e8q", "bê4". */
function splitCompact(word) {
  const parts = word.match(/\p{L}+|[0-9]+|[^\p{L}0-9]+/gu) || [];
  const out = [];
  for (const part of parts) {
    if (/^[0-9]+$/.test(part)) {
      for (const ch of part) out.push(ch);
    } else if (/^[a-hkqrnpx]{1,4}$/.test(part)) {
      for (const ch of part) out.push(ch);
    } else {
      out.push(part);
    }
  }
  return out;
}

const prim = (lex) => (lex ? lex.readings[0].t : null);

function moveToFront(lex, t) {
  const i = lex.readings.findIndex((r) => r.t === t);
  if (i > 0) lex.readings.unshift(lex.readings.splice(i, 1)[0]);
}

/** Đổi thứ tự cách hiểu theo từ đứng trước/sau. */
function reorderByContext(lexemes) {
  for (let i = 0; i < lexemes.length; i++) {
    const lex = lexemes[i];
    if (lex.readings.length < 2) continue;
    const prevPrim = prim(lexemes[i - 1]);
    const nextPrim = prim(lexemes[i + 1]);
    switch (lex.word) {
      case 'xe': {
        // "mã xe ba" = Nc3; "xe xe ba" = Rc3; nhưng "xe 1 e1" = R1e1.
        const earlierMoveWord = lexemes.slice(0, i).some((x) => ['piece', 'takes', 'to', 'promo'].includes(prim(x)));
        if (nextPrim === 'rank' && earlierMoveWord) moveToFront(lex, 'file');
        break;
      }
      case 'castle':
        if (nextPrim === 'file') moveToFront(lex, 'piece');
        break;
      case 'a':
        if (nextPrim === 'piece') moveToFront(lex, 'ignore');
        break;
      case 'b':
        if (nextPrim === 'file') moveToFront(lex, 'piece');
        break;
      case 'to':
      case 'too':
        if (prevPrim === 'file' && nextPrim !== 'rank') moveToFront(lex, 'rank');
        break;
      case 'for':
      case 'ate':
        if (prevPrim === 'file') moveToFront(lex, 'rank');
        break;
      default:
        if (nextPrim === 'rank') moveToFront(lex, 'file');
    }
  }
  return lexemes;
}

/**
 * @param {string} raw transcript
 * @returns {{ text: string, lexemes: {word:string, readings:{t:string, v?:any}[]}[], unknown: string[] }}
 */
export function lex(raw) {
  const text = cleanText(raw);
  const lexemes = [];
  const unknown = [];
  if (!text) return { text, lexemes, unknown };
  for (const word of text.split(' ')) {
    const direct = /[0-9]/.test(word) ? null : lookup(word);
    if (direct) {
      lexemes.push({ word, readings: direct });
      continue;
    }
    const pieces = /[0-9]/.test(word) ? splitCompact(word) : [word];
    for (const p of pieces) {
      const readings = lookup(p);
      if (readings) lexemes.push({ word: p, readings });
      else unknown.push(p);
    }
  }
  reorderByContext(lexemes);
  return { text, lexemes, unknown };
}

/**
 * Sinh các cách hiểu cho cả câu, xếp theo tổng độ ưu tiên (cách hiểu mặc định trước).
 * Bỏ các token "ignore".
 * @returns {{t:string, v?:any}[][]}
 */
export function expandReadings(lexemes, limit = 32) {
  let combos = [{ tokens: [], cost: 0 }];
  let ambiguousSeen = 0;
  for (const lex of lexemes) {
    let options = lex.readings;
    if (options.length > 1) {
      ambiguousSeen++;
      if (ambiguousSeen > 5) options = options.slice(0, 1);
    }
    const next = [];
    for (const c of combos) {
      options.forEach((r, idx) => {
        next.push({ tokens: r.t === 'ignore' ? c.tokens : [...c.tokens, r], cost: c.cost + idx });
      });
    }
    combos = next;
  }
  // sort ổn định theo cost
  combos = combos.map((c, i) => ({ ...c, i })).sort((a, b) => a.cost - b.cost || a.i - b.i);
  const seen = new Set();
  const out = [];
  for (const c of combos) {
    const key = JSON.stringify(c.tokens);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.tokens);
    if (out.length >= limit) break;
  }
  return out;
}
