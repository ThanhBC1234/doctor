import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUtterance, detectCommand, detectConfirm, parseIntent } from '../js/speech/parser.js';
import { speakMove } from '../js/speech/speak-move.js';
import { Chess } from '../vendor/chess.js/chess.js';
import { position, randomPositions } from './helpers.js';

// Các thế cờ dùng trong bảng test
const P = {
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4, Đen đi
  italian: { moves: 'e4 e5 Nf3 Nc6 Bc4' },
  start: {},
  // Trắng: mã b1 và f3 đều tới được d2
  twoKnights: { fen: 'rnbqkbnr/pppppppp/8/8/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 1' },
  // Trắng: xe a1 và a5 đều tới được a3 (phân biệt bằng hàng)
  rooksFile: { fen: '6k1/8/8/R7/8/8/6K1/R7 w - - 0 1' },
  // Trắng: xe a1 và h1 đều tới được e1 (phân biệt bằng cột)
  rooksRank: { fen: '6k1/8/8/8/8/8/6K1/R6R w - - 0 1' },
  // Trắng: chỉ một xe a1
  oneRook: { fen: '6k1/8/8/8/8/8/6K1/R7 w - - 0 1' },
  // Trắng: xe a3 tới c3, tốt c2 cũng tới c3
  rookOrPawnC3: { fen: '6k1/8/8/8/8/R7/2P3K1/8 w - - 0 1' },
  // 1.e4 d5, Trắng đi: exd5 hoặc Qxd5? (chỉ tốt ăn được)
  scandi: { moves: 'e4 d5' },
  // Trắng: tốt e4 và mã c3 đều ăn được d5
  scandiKnight: { moves: 'e4 d5 Nc3 Nf6' },
  // Nhập thành cả hai bên
  castleBoth: { fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' },
  // Chỉ nhập thành gần
  castleShort: { fen: 'r3k2r/8/8/8/8/8/8/4K2R w Kkq - 0 1' },
  // Đen nhập thành cả hai bên
  castleBlack: { fen: 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1' },
  // Phong cấp e8
  promo: { fen: 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1' },
  // Tốt d7 ăn c8 rồi phong cấp, hoặc đi thẳng d8
  promoCapture: { fen: 'k1n5/3P4/8/8/8/8/8/4K3 w - - 0 1' },
  // Bắt tốt qua đường
  enPassant: { fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1' },
  // Mã ăn được tượng hoặc tốt
  knightCaptures: { fen: '4k3/8/8/3b1p2/8/4N3/8/4K3 w - - 0 1' },
};

function sansFor(text, posKey, mode = 'move') {
  const c = position(P[posKey]);
  const r = parseUtterance(text, { mode, legalMoves: c.moves({ verbose: true }) });
  if (r.type === 'command') return `cmd:${r.name}`;
  if (r.type === 'unknown') return 'unknown';
  return r.matches.map((m) => m.san.replace(/[+#]/g, '')).sort();
}

// [câu nói, thế cờ, kỳ vọng]. Kỳ vọng: mảng SAN, 'cmd:TÊN', hoặc 'unknown', hoặc [] (hiểu nhưng không hợp lệ)
const CASES = [
  // --- Đen đi, sau ván Ý ---
  ['mã f6', 'italian', ['Nf6']],
  ['Mã F6', 'italian', ['Nf6']],
  ['mã ép sáu', 'italian', ['Nf6']],
  ['ngựa ép sáu', 'italian', ['Nf6']],
  ['knight f6', 'italian', ['Nf6']],
  ['Knight F6', 'italian', ['Nf6']],
  ['night f6', 'italian', ['Nf6']],
  ['knight to f6', 'italian', ['Nf6']],
  ['november foxtrot six', 'italian', ['Nf6']],
  ['n foxtrot six', 'italian', ['Nf6']],
  ['Nf6', 'italian', ['Nf6']],
  ['nf6', 'italian', ['Nf6']],
  ['g8 f6', 'italian', ['Nf6']],
  ['g8f6', 'italian', ['Nf6']],
  ['gờ tám đến ép sáu', 'italian', ['Nf6']],
  ['gờ 8 ép 6', 'italian', ['Nf6']],
  ['mã gờ tám ép sáu', 'italian', ['Nf6']],
  ['mã từ g8 đến f6', 'italian', ['Nf6']],
  ['golf eight foxtrot six', 'italian', ['Nf6']],
  ['tượng xê năm', 'italian', ['Bc5']],
  ['tượng c 5', 'italian', ['Bc5']],
  ['tượng c5', 'italian', ['Bc5']],
  ['bishop c5', 'italian', ['Bc5']],
  ['bishop to c5', 'italian', ['Bc5']],
  ['Bc5', 'italian', ['Bc5']],
  ['bc5', 'italian', ['Bc5']],
  ['tượng sê lăm', 'italian', ['Bc5']],
  ['d6', 'italian', ['d6']],
  ['D6', 'italian', ['d6']],
  ['dê sáu', 'italian', ['d6']],
  ['tốt dê sáu', 'italian', ['d6']],
  ['tốt d6', 'italian', ['d6']],
  ['pawn d6', 'italian', ['d6']],
  ['pawn to d6', 'italian', ['d6']],
  ['delta six', 'italian', ['d6']],
  ['d7 d6', 'italian', ['d6']],
  ['d 7 d 6', 'italian', ['d6']],
  ['dê bảy dê sáu', 'italian', ['d6']],
  ['hậu e7', 'italian', ['Qe7']],
  ['hoàng hậu e bảy', 'italian', ['Qe7']],
  ['queen to e7', 'italian', ['Qe7']],
  ['queen e7', 'italian', ['Qe7']],
  ['vua e7', 'italian', ['Ke7']],
  ['king e7', 'italian', ['Ke7']],
  ['mã d4', 'italian', ['Nd4']],
  ['mã ăn d4', 'italian', []],
  ['mã a5', 'italian', ['Na5']],
  ['mã ây năm', 'italian', ['Na5']],
  ['f5', 'italian', ['f5']],
  ['ép năm', 'italian', ['f5']],
  ['f7 f5', 'italian', ['f5']],
  ['h6', 'italian', ['h6']],
  ['hát sáu', 'italian', ['h6']],
  ['hotel six', 'italian', ['h6']],
  ['g6', 'italian', ['g6']],
  ['gờ sáu', 'italian', ['g6']],
  ['giê sáu', 'italian', ['g6']],
  ['b5', 'italian', ['b5']],
  ['bê năm', 'italian', ['b5']],
  ['bravo five', 'italian', ['b5']],
  ['a6', 'italian', ['a6']],
  ['a 6', 'italian', ['a6']],
  ['alpha six', 'italian', ['a6']],
  ['hậu h4', 'italian', ['Qh4']],
  ['hậu ăn h4', 'italian', []],
  ['mã e2', 'italian', []],
  ['e4', 'italian', []],
  ['tượng b4', 'italian', ['Bb4']],
  ['bishop b4', 'italian', ['Bb4']],
  ['b tượng b4', 'italian', []],

  // --- Khai cuộc, Trắng đi ---
  ['e4', 'start', ['e4']],
  ['E4', 'start', ['e4']],
  ['e bốn', 'start', ['e4']],
  ['ê bốn', 'start', ['e4']],
  ['e tư', 'start', ['e4']],
  ['tốt e4', 'start', ['e4']],
  ['echo four', 'start', ['e4']],
  ['e2 e4', 'start', ['e4']],
  ['e2e4', 'start', ['e4']],
  ['e2 đến e4', 'start', ['e4']],
  ['e2 to e4', 'start', ['e4']],
  ['e to e4', 'start', ['e4']],
  ['e3', 'start', ['e3']],
  ['mã f3', 'start', ['Nf3']],
  ['mã ép ba', 'start', ['Nf3']],
  ['mã xe ba', 'start', ['Nc3']],
  ['mã c3', 'start', ['Nc3']],
  ['mã xê ba', 'start', ['Nc3']],
  ['knight c3', 'start', ['Nc3']],
  ['knight see three', 'start', ['Nc3']],
  ['c4', 'start', ['c4']],
  ['xê bốn', 'start', ['c4']],
  ['mã f3 nhé', 'start', ['Nf3']],
  ['làm ơn mã f3', 'start', ['Nf3']],
  ['tôi muốn đi mã f3', 'start', ['Nf3']],
  ['e5', 'start', []],
  ['hậu h5', 'start', []],

  // --- Phân biệt quân ---
  ['mã d2', 'twoKnights', ['Nbd2', 'Nfd2']],
  ['mã b d2', 'twoKnights', ['Nbd2']],
  ['mã bê đến dê hai', 'twoKnights', ['Nbd2']],
  ['mã bê dê hai', 'twoKnights', ['Nbd2']],
  ['knight b d2', 'twoKnights', ['Nbd2']],
  ['knight b to d2', 'twoKnights', ['Nbd2']],
  ['Nbd2', 'twoKnights', ['Nbd2']],
  ['mã f d2', 'twoKnights', ['Nfd2']],
  ['mã ép dê hai', 'twoKnights', ['Nfd2']],
  ['mã b1 d2', 'twoKnights', ['Nbd2']],
  ['mã f3 d2', 'twoKnights', ['Nfd2']],
  ['b1 d2', 'twoKnights', ['Nbd2']],
  ['xe 1 a3', 'rooksFile', ['R1a3']],
  ['xe một a ba', 'rooksFile', ['R1a3']],
  ['xe 5 a3', 'rooksFile', ['R5a3']],
  ['rook 1 a3', 'rooksFile', ['R1a3']],
  ['xe a3', 'rooksFile', ['R1a3', 'R5a3']],
  ['xe a e1', 'rooksRank', ['Rae1']],
  ['xe hát e1', 'rooksRank', ['Rhe1']],
  ['rook h e1', 'rooksRank', ['Rhe1']],
  ['xe e1', 'rooksRank', ['Rae1', 'Rhe1']],
  ['xe e1', 'oneRook', ['Re1']],
  ['xe e một', 'oneRook', ['Re1']],
  ['rook e1', 'oneRook', ['Re1']],
  ['xe xe ba', 'rookOrPawnC3', ['Rc3']],
  ['xe c3', 'rookOrPawnC3', ['Rc3']],
  ['c3', 'rookOrPawnC3', ['c3']],
  ['tốt c3', 'rookOrPawnC3', ['c3']],

  // --- Ăn quân ---
  ['ăn d5', 'scandi', ['exd5']],
  ['tốt ăn d5', 'scandi', ['exd5']],
  ['e ăn d5', 'scandi', ['exd5']],
  ['e takes d5', 'scandi', ['exd5']],
  ['exd5', 'scandi', ['exd5']],
  ['e x d5', 'scandi', ['exd5']],
  ['e d5', 'scandi', ['exd5']],
  ['e dê năm', 'scandi', ['exd5']],
  ['e4 d5', 'scandi', ['exd5']],
  ['e4 ăn d5', 'scandi', ['exd5']],
  ['pawn takes d5', 'scandi', ['exd5']],
  ['ăn d5', 'scandiKnight', ['Nxd5', 'exd5']],
  ['tốt ăn d5', 'scandiKnight', ['exd5']],
  ['mã ăn d5', 'scandiKnight', ['Nxd5']],
  ['knight takes d5', 'scandiKnight', ['Nxd5']],
  ['mã ăn tượng d5', 'knightCaptures', ['Nxd5']],
  ['mã ăn tốt f5', 'knightCaptures', ['Nxf5']],
  ['mã ăn tốt d5', 'knightCaptures', []],
  ['e ăn d6', 'enPassant', ['exd6']],
  ['tốt e ăn dê sáu bắt tốt qua đường', 'enPassant', ['exd6']],
  ['e takes d6 en passant', 'enPassant', ['exd6']],
  ['e d6', 'enPassant', ['exd6']],

  // --- Nhập thành ---
  ['nhập thành gần', 'castleBoth', ['O-O']],
  ['nhập thành ngắn', 'castleBoth', ['O-O']],
  ['nhập thành cánh vua', 'castleBoth', ['O-O']],
  ['castle short', 'castleBoth', ['O-O']],
  ['castles kingside', 'castleBoth', ['O-O']],
  ['kingside castle', 'castleBoth', ['O-O']],
  ['short castle', 'castleBoth', ['O-O']],
  ['O-O', 'castleBoth', ['O-O']],
  ['0-0', 'castleBoth', ['O-O']],
  ['nhập thành xa', 'castleBoth', ['O-O-O']],
  ['nhập thành dài', 'castleBoth', ['O-O-O']],
  ['nhập thành cánh hậu', 'castleBoth', ['O-O-O']],
  ['castle long', 'castleBoth', ['O-O-O']],
  ['queenside', 'castleBoth', ['O-O-O']],
  ['queen side castle', 'castleBoth', ['O-O-O']],
  ['O-O-O', 'castleBoth', ['O-O-O']],
  ['0-0-0', 'castleBoth', ['O-O-O']],
  ['nhập thành', 'castleBoth', ['O-O', 'O-O-O']],
  ['castle', 'castleBoth', ['O-O', 'O-O-O']],
  ['nhập thành', 'castleShort', ['O-O']],
  ['nhập thành xa', 'castleShort', []],
  ['nhap thanh gan', 'castleBoth', ['O-O']],
  ['nhập thành gần', 'castleBlack', ['O-O']],

  // --- Phong cấp ---
  ['e8 phong hậu', 'promo', ['e8=Q']],
  ['e8', 'promo', ['e8=Q']],
  ['e tám', 'promo', ['e8=Q']],
  ['e7 e8 phong mã', 'promo', ['e8=N']],
  ['e8 phong mã', 'promo', ['e8=N']],
  ['e8 phong cấp xe', 'promo', ['e8=R']],
  ['e8 phong tượng', 'promo', ['e8=B']],
  ['tốt e8 phong hậu', 'promo', ['e8=Q']],
  ['e8 equals knight', 'promo', ['e8=N']],
  ['e8=N', 'promo', ['e8=N']],
  ['e8n', 'promo', ['e8=N']],
  ['promote to rook e8', 'promo', ['e8=R']],
  ['e8 queen', 'promo', ['e8=Q']],
  ['e8 phong vua', 'promo', 'unknown'],
  ['d ăn c8 phong mã', 'promoCapture', ['dxc8=N']],
  ['dxc8=N', 'promoCapture', ['dxc8=N']],
  ['d c8', 'promoCapture', ['dxc8=Q']],
  ['d8', 'promoCapture', ['d8=Q']],

  // --- Lệnh ---
  ['tháo bịt mắt', 'start', 'cmd:PEEK'],
  ['cho xem bàn cờ đi', 'start', 'cmd:PEEK'],
  ['xem bàn cờ', 'start', 'cmd:PEEK'],
  ['show me the board', 'start', 'cmd:PEEK'],
  ['peek', 'start', 'cmd:PEEK'],
  ['quân ở đâu', 'start', 'cmd:LOCATE'],
  ['các quân đang ở đâu', 'start', 'cmd:LOCATE'],
  ['vị trí các quân', 'start', 'cmd:LOCATE'],
  ['đọc vị trí', 'start', 'cmd:LOCATE'],
  ['where are the pieces', 'start', 'cmd:LOCATE'],
  ['nhắc lại', 'start', 'cmd:REPEAT'],
  ['máy vừa đi gì', 'start', 'cmd:REPEAT'],
  ['what did you play', 'start', 'cmd:REPEAT'],
  ['tôi vừa đi gì', 'start', 'cmd:MY_LAST'],
  ['đọc lại ván', 'start', 'cmd:HISTORY'],
  ['lịch sử', 'start', 'cmd:HISTORY'],
  ['thời gian', 'start', 'cmd:TIME'],
  ['còn bao nhiêu thời gian', 'start', 'cmd:TIME'],
  ['xin thua', 'start', 'cmd:RESIGN'],
  ['I resign', 'start', 'cmd:RESIGN'],
  ['cầu hòa', 'start', 'cmd:DRAW'],
  ['cầu hoà', 'start', 'cmd:DRAW'],
  ['offer draw', 'start', 'cmd:DRAW'],
  ['trợ giúp', 'start', 'cmd:HELP'],
  ['help', 'start', 'cmd:HELP'],
  ['tạm dừng', 'start', 'cmd:PAUSE'],
  ['tiếp tục', 'start', 'cmd:RESUME'],
  ['xem ban co', 'start', 'cmd:PEEK'],

  // --- Câu rác ---
  ['hello world', 'start', 'unknown'],
  ['', 'start', 'unknown'],
  ['   ', 'start', 'unknown'],
  ['ừm à', 'start', 'unknown'],
  ['mã', 'start', 'unknown'],
  ['e', 'start', 'unknown'],
];

test(`bảng parser có ít nhất 100 câu (hiện có ${CASES.length})`, () => {
  assert.ok(CASES.length >= 100);
});

for (const [text, pos, expected] of CASES) {
  test(`parse "${text}" @${pos}`, () => {
    assert.deepEqual(sansFor(text, pos), Array.isArray(expected) ? [...expected].sort() : expected);
  });
}

// --- Chế độ xác nhận ---
const CONFIRM = [
  ['đúng', 'CONFIRM_YES'], ['đúng rồi', 'CONFIRM_YES'], ['ừ', 'CONFIRM_YES'], ['ok', 'CONFIRM_YES'],
  ['OK', 'CONFIRM_YES'], ['yes', 'CONFIRM_YES'], ['đi', 'CONFIRM_YES'], ['chuẩn', 'CONFIRM_YES'], ['phải', 'CONFIRM_YES'],
  ['correct', 'CONFIRM_YES'], ['sai', 'CONFIRM_NO'], ['không', 'CONFIRM_NO'], ['không phải', 'CONFIRM_NO'],
  ['không đúng', 'CONFIRM_NO'], ['no', 'CONFIRM_NO'], ['hủy', 'CONFIRM_NO'], ['huỷ', 'CONFIRM_NO'], ['cancel', 'CONFIRM_NO'],
  ['chưa đúng', 'CONFIRM_NO'], ['mã f3', null], ['', null],
];
for (const [text, expected] of CONFIRM) {
  test(`xác nhận "${text}"`, () => {
    assert.equal(detectConfirm(text), expected);
    const r = parseUtterance(text, { mode: 'confirm' });
    assert.equal(r.type === 'command' ? r.name : null, expected);
  });
}

test('chế độ peek chỉ nhận "xong"', () => {
  assert.equal(parseUtterance('xong', { mode: 'peek' }).name, 'DONE');
  assert.equal(parseUtterance('đủ rồi', { mode: 'peek' }).name, 'DONE');
  assert.equal(parseUtterance('done', { mode: 'peek' }).name, 'DONE');
  assert.equal(parseUtterance('mã f3', { mode: 'peek' }).type, 'unknown');
});

test('nhiều phương án nhận dạng: dùng phương án đầu tiên có nước hợp lệ', () => {
  const c = position(P.start);
  const r = parseUtterance(['ê năm', 'e bốn', 'mã f3'], { legalMoves: c.moves({ verbose: true }) });
  assert.equal(r.type, 'move');
  assert.deepEqual(r.matches.map((m) => m.san), ['e4']);
});

test('nhiều phương án đều sai: trả về ý định của phương án đầu để báo lỗi', () => {
  const c = position(P.start);
  const r = parseUtterance(['e năm', 'hậu h5'], { legalMoves: c.moves({ verbose: true }) });
  assert.equal(r.type, 'move');
  assert.equal(r.matches.length, 0);
  assert.equal(r.intent.to, 'e5');
});

test('lệnh thắng nước đi trong cùng câu', () => {
  assert.equal(detectCommand('xem bàn cờ'), 'PEEK');
  assert.equal(detectCommand('mã f3'), null);
});

test('parseIntent từ chối ngữ pháp sai', () => {
  assert.equal(parseIntent([]), null);
  assert.equal(parseIntent([{ t: 'piece', v: 'n' }]), null);
});

// --- Kiểm tra vòng: câu máy đọc ra phải được hiểu lại đúng nước đó (và chỉ nước đó) ---
const OPTION_SETS = [
  { announceCaptures: false, fileStyle: 'vi' },
  { announceCaptures: true, fileStyle: 'vi' },
  { announceCaptures: false, fileStyle: 'nato' },
  { announceCaptures: true, fileStyle: 'nato' },
];

const SPECIAL_FENS = [
  P.twoKnights.fen, P.rooksFile.fen, P.rooksRank.fen, P.castleBoth.fen, P.castleBlack.fen, P.promo.fen,
  P.promoCapture.fen, P.enPassant.fen, P.knightCaptures.fen, P.rookOrPawnC3.fen,
  // Ba hậu: cần phân biệt bằng cả ô
  '8/5k2/8/8/Q6Q/8/8/Q3K3 w - - 0 1',
];

for (const opts of OPTION_SETS) {
  test(`vòng speakMove → parser (${opts.fileStyle}, ăn quân=${opts.announceCaptures})`, () => {
    const fens = [...SPECIAL_FENS, ...randomPositions({ games: 12, plies: 90, seed: 11 })];
    let checked = 0;
    for (const fen of fens) {
      const c = new Chess(fen);
      const legal = c.moves({ verbose: true });
      for (const m of legal) {
        const spoken = speakMove(m, opts);
        const r = parseUtterance(spoken, { legalMoves: legal });
        const got = r.type === 'move' ? r.matches.map((x) => x.san) : [r.type];
        assert.deepEqual(got, [m.san], `${fen} | ${m.san} → "${spoken}" → ${JSON.stringify(got)}`);
        checked++;
      }
    }
    assert.ok(checked > 1000, `đã kiểm ${checked} nước`);
  });
}
