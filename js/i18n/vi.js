// Mọi chuỗi hiển thị và mọi câu đọc (TTS) bằng tiếng Việt nằm ở đây.
// Không viết chuỗi tiếng Việt ở module khác.

/** Tên quân, khóa là ký hiệu chess.js (chữ thường). */
const PIECES = { k: 'Vua', q: 'Hậu', r: 'Xe', b: 'Tượng', n: 'Mã', p: 'Tốt' };

/** Cách đọc chữ cột. "vi" để TTS tiếng Việt đọc rõ, "nato" cho người quen bảng chữ quốc tế. */
const FILES = {
  vi: { a: 'a', b: 'bê', c: 'xê', d: 'dê', e: 'e', f: 'ép', g: 'gờ', h: 'hát' },
  nato: { a: 'alpha', b: 'bravo', c: 'charlie', d: 'delta', e: 'echo', f: 'foxtrot', g: 'golf', h: 'hotel' },
};

const COLORS = { w: 'Trắng', b: 'Đen' };

function minutesSeconds(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} giây`;
  if (s === 0) return `${m} phút`;
  return `${m} phút ${s} giây`;
}

export const VI = {
  appTitle: 'Cờ mù',
  appSubtitle: 'Chơi cờ bịt mắt bằng giọng nói với Stockfish',
  pieces: PIECES,
  files: FILES,
  colors: COLORS,

  // ---- Đọc nước đi ----
  move: {
    castleShort: 'Nhập thành gần',
    castleLong: 'Nhập thành xa',
    castleEither: 'Nhập thành',
    capture: 'ăn',
    check: 'chiếu',
    mate: 'chiếu hết',
    enPassant: 'bắt tốt qua đường',
    promote: (pieceName) => `phong ${pieceName}`,
    to: 'đến',
  },

  // ---- Màn hình cài đặt ----
  setup: {
    heading: 'Cài đặt ván đấu',
    strength: 'Sức mạnh máy',
    strengthNote: 'Mức dưới 1320 là ước lượng.',
    eloLabels: {
      beginner: 'Mới chơi',
      intermediate: 'Trung bình',
      good: 'Khá',
      strong: 'Giỏi',
      expert: 'Chuyên gia',
    },
    color: 'Màu quân của bạn',
    colorWhite: 'Trắng',
    colorBlack: 'Đen',
    colorRandom: 'Ngẫu nhiên',
    clock: 'Đồng hồ',
    clockNone: 'Không giới hạn',
    clockCustom: 'Tùy chỉnh',
    clockMinutes: 'Phút',
    clockIncrement: 'Giây cộng mỗi nước',
    speechLang: 'Ngôn ngữ nói',
    langVi: 'Tiếng Việt',
    langEn: 'English',
    confirm: 'Xác nhận trước khi đi',
    confirmHint: 'Máy đọc lại nước bạn nói, bạn trả lời "đúng" hoặc "sai".',
    announce: 'Thông báo ăn quân, chiếu',
    fileStyle: 'Cách đọc cột',
    fileStyleVi: 'a, bê, xê, dê, e, ép, gờ, hát',
    fileStyleNato: 'alpha, bravo, charlie… (NATO)',
    rate: 'Tốc độ đọc',
    voice: 'Giọng đọc',
    voiceDefault: 'Mặc định của trình duyệt',
    listenMode: 'Cách nghe',
    listenTap: 'Chạm để nói',
    listenContinuous: 'Nghe liên tục',
    clockWarnings: 'Cảnh báo âm thanh khi sắp hết giờ',
    start: 'Bắt đầu ván đấu',
    loadingEngine: 'Đang tải Stockfish…',
    engineReady: 'Stockfish đã sẵn sàng.',
    engineFailed: 'Không tải được Stockfish. Hãy tải lại trang.',
    resumeBanner: 'Bạn có một ván đang chơi dở.',
    resume: 'Tiếp tục',
    discard: 'Bỏ ván cũ',
    noSpeech: 'Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome, Edge hoặc Safari. Bạn vẫn có thể gõ nước đi.',
    noTts: 'Trình duyệt này không đọc được giọng nói. Bạn sẽ không nghe được nước đi của máy.',
    fileProtocol: 'Hãy mở trang qua HTTP(S), ví dụ GitHub Pages hoặc "python3 -m http.server". Mở trực tiếp file sẽ không chạy được.',
    micDenied: 'Chưa có quyền dùng micro. Hãy cho phép micro trong cài đặt trình duyệt rồi thử lại.',
    noVietnameseVoice: 'Máy bạn chưa có giọng đọc tiếng Việt. Hãy cài giọng tiếng Việt trong cài đặt hệ điều hành để nghe rõ hơn.',
    iosStandalone: 'Nếu micro không hoạt động khi mở từ biểu tượng màn hình chính, hãy mở trang này bằng Safari.',
    howTo: 'Cách chơi',
    howToBody: [
      'Bàn cờ sẽ bị ẩn. Chạm vào bất kỳ đâu trên màn hình (hoặc nhấn phím cách) rồi nói nước đi.',
      'Ví dụ: "e4", "mã f3", "tốt ăn d5", "mã bê đến dê hai", "nhập thành gần", "e2 e4", "knight f3".',
      'Lệnh: "xem bàn cờ" (1 lần), "vị trí quân" (2 lần), "nhắc lại", "đọc lại ván", "thời gian", "trợ giúp", "cầu hòa", "xin thua".',
    ],
  },

  // ---- Màn hình chơi ----
  play: {
    yourTurn: 'LƯỢT CỦA BẠN',
    engineThinking: 'MÁY ĐANG NGHĨ…',
    paused: 'ĐANG TẠM DỪNG',
    waitingConfirm: 'ĐÚNG KHÔNG?',
    moveNumber: (n) => `Nước ${n}`,
    tapToSpeak: 'Chạm bất kỳ đâu để nói',
    tapToAnswer: 'Chạm để trả lời “đúng” hoặc “sai”',
    tapToResume: 'Chạm rồi nói “tiếp tục”',
    listening: 'Đang nghe…',
    heard: (t) => `Nghe được: “${t}”`,
    you: 'Bạn',
    engine: 'Máy',
    peekButton: 'Xem bàn cờ',
    locateButton: 'Hỏi vị trí',
    repeatButton: 'Nhắc lại',
    resignButton: 'Xin thua',
    settingsButton: 'Cài đặt',
    typeMove: 'Gõ nước đi (ví dụ Nf3, e2e4, mã f3)',
    typeMoveSubmit: 'Đi',
    typeToggle: 'Gõ nước đi',
    settingsTitle: 'Cài đặt trong ván',
    close: 'Đóng',
    exitGame: 'Lưu và thoát về màn hình chính',
    peekCountdown: (s) => `${s}`,
    peekHint: 'Chạm để che lại',
  },

  // ---- Câu đọc (TTS) ----
  say: {
    newGame: (colorName, elo) => `Ván mới. Bạn cầm quân ${colorName}. Máy chơi ở mức ${elo}.`,
    tapToSpeak: 'Chạm vào màn hình rồi nói nước đi.',
    resumeGame: (colorName) => `Tiếp tục ván. Bạn cầm quân ${colorName}.`,
    yourTurn: 'Lượt của bạn.',
    engineMove: (text) => `${text}.`,
    lastEngineMove: (text) => `Máy vừa đi: ${text}.`,
    noEngineMove: 'Máy chưa đi nước nào.',
    lastPlayerMove: (text) => `Bạn vừa đi: ${text}.`,
    noPlayerMove: 'Bạn chưa đi nước nào.',
    notUnderstood: 'Không hiểu. Nói lại.',
    noSpeechHeard: 'Không nghe thấy gì.',
    illegal: (text) => `Nước đi không hợp lệ: ${text}. Nói lại.`,
    ambiguous: (options) => `Có nhiều nước có thể đi: ${options}. Nói rõ hơn, ví dụ: mã bê đến dê 2.`,
    confirmQuestion: (text) => `${text}. Đúng không?`,
    confirmAgain: 'Đúng không? Nói đúng hoặc sai.',
    cancelled: 'Đã hủy.',
    notYourTurn: 'Chờ máy đi xong.',
    peekStart: 'Mở bàn cờ trong mười giây.',
    peekEnd: 'Đã che lại.',
    peekNone: 'Bạn đã dùng hết lượt xem bàn cờ.',
    locateNone: 'Bạn đã dùng hết lượt hỏi vị trí.',
    locateLeft: (n) => (n > 0 ? 'Còn một lượt hỏi vị trí.' : 'Bạn đã dùng hết lượt hỏi vị trí.'),
    sideHeader: (colorName) => `${colorName}:`,
    historyRecent: (n) => `Đọc ${n} nước gần nhất.`,
    historyEmpty: 'Chưa có nước đi nào.',
    historyMove: (n, white, black) => (black ? `Nước ${n}. ${white}; ${black}.` : `Nước ${n}. ${white}.`),
    historyMoveBlackOnly: (n, black) => `Nước ${n}. Trắng đã đi; ${black}.`,
    time: (mine, theirs) => `Bạn còn ${minutesSeconds(mine)}. Máy còn ${minutesSeconds(theirs)}.`,
    noClock: 'Ván này không tính giờ.',
    oneMinute: 'Còn một phút.',
    help: 'Nói nước đi như: e4, mã f3, tốt ăn d5, mã bê đến dê 2, nhập thành gần, hoặc e2 e4. Lệnh: xem bàn cờ, vị trí quân, nhắc lại, đọc lại ván, thời gian, tạm dừng, cầu hòa, xin thua.',
    resignConfirm: 'Bạn chắc chắn xin thua?',
    drawDeclined: 'Máy từ chối hòa.',
    drawTooSoon: 'Bạn vừa cầu hòa. Hãy chờ thêm vài nước.',
    drawAccepted: 'Máy đồng ý hòa.',
    paused: 'Đã tạm dừng. Nói tiếp tục khi sẵn sàng.',
    resumed: 'Tiếp tục.',
    pausedRefuse: 'Đang tạm dừng. Nói tiếp tục.',
    pauseNoClock: 'Ván này không tính giờ nên không cần tạm dừng.',
    networkError: 'Lỗi mạng nhận dạng giọng nói.',
    micError: 'Không dùng được micro.',
    engineError: 'Máy gặp lỗi. Hãy tải lại trang.',
  },

  // ---- Kết thúc ván ----
  result: {
    heading: 'Kết thúc ván',
    youWin: 'Bạn thắng',
    youLose: 'Máy thắng',
    draw: 'Hòa',
    reasons: {
      checkmate: 'Chiếu hết',
      stalemate: 'Hòa do hết nước đi (pat)',
      threefold: 'Hòa do lặp lại ba lần',
      fifty: 'Hòa do luật 50 nước',
      insufficient: 'Hòa do không đủ lực chiếu hết',
      timeout: 'Hết giờ',
      resign: 'Xin thua',
      agreement: 'Hòa theo thỏa thuận',
    },
    say: {
      checkmateWin: 'Chiếu hết. Bạn thắng.',
      checkmateLose: 'Chiếu hết. Máy thắng.',
      stalemate: 'Hòa do hết nước đi, pat.',
      threefold: 'Hòa do lặp lại ba lần.',
      fifty: 'Hòa do luật năm mươi nước.',
      insufficient: 'Hòa do không đủ lực chiếu hết.',
      timeoutLose: 'Bạn hết giờ. Máy thắng.',
      timeoutDraw: 'Bạn hết giờ, nhưng máy không đủ lực chiếu hết. Hòa.',
      timeoutWin: 'Máy hết giờ. Bạn thắng.',
      timeoutDrawEngine: 'Máy hết giờ, nhưng bạn không đủ lực chiếu hết. Hòa.',
      resign: 'Bạn đã xin thua.',
      agreement: 'Hòa theo thỏa thuận.',
    },
    moves: 'Các nước đi',
    downloadPgn: 'Tải PGN',
    copyPgn: 'Sao chép PGN',
    copied: 'Đã sao chép.',
    lichess: 'Phân tích trên Lichess',
    newGame: 'Ván mới',
    rematch: 'Chơi lại cùng cài đặt',
    prev: 'Nước trước',
    next: 'Nước sau',
    first: 'Về đầu',
    last: 'Về cuối',
    pgnEvent: 'Cờ mù',
    pgnPlayer: 'Người chơi',
    pgnEngine: (elo) => `Stockfish (${elo})`,
  },

  // ---- Thông báo ngắn trên màn hình (aria-live) ----
  status: {
    ready: 'Sẵn sàng',
    speaking: 'Đang đọc…',
  },
};

export { minutesSeconds };
