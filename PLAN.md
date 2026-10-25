# PLAN — Trang web chơi cờ mù (Blindfold Chess) với Stockfish

Tài liệu này là **đặc tả đầy đủ để code ngay**, không cần hỏi lại người dùng.
Đọc hết trước khi viết dòng code đầu tiên. Thứ tự triển khai ở mục 12.

---

## 1. Mục tiêu

Một trang web tĩnh, mở trên máy tính hoặc điện thoại, cho người chơi **đánh cờ mù** với máy:

- Người chơi **bịt mắt thật**. Bàn cờ **bị ẩn** trên màn hình trong suốt ván.
- Người chơi **nói nước đi** bằng giọng nói (tiếng Việt hoặc tiếng Anh). Trang web nhận dạng, kiểm tra luật, thực hiện.
- Máy **đọc to** nước đi của nó bằng giọng nói tổng hợp (TTS).
- Đối thủ là **Stockfish** chạy ngay trong trình duyệt, chỉnh sức mạnh **1000–2500 Elo**.
- **3 quyền trợ giúp** mỗi ván: 1 lần "tháo bịt mắt" xem bàn cờ 10 giây; 2 lần hỏi "quân ở đâu" để máy đọc vị trí các quân (không phải tốt).
- Có đồng hồ thi đấu, chọn màu quân, xin thua, cầu hòa, hỏi lại nước đi, đọc lại ván. Sau ván: hiện bàn cờ, danh sách nước đi, tải PGN.

**Ràng buộc kỹ thuật quan trọng nhất:** **không có bước build**. Upload repo lên GitHub, bật GitHub Pages là dùng được. Không npm install, không bundler, không framework. Toàn bộ thư viện bên thứ ba được tải về và nằm sẵn trong thư mục `vendor/`.

---

## 2. Quyết định công nghệ (đã chốt, không đổi)

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Ngôn ngữ | HTML5 + CSS + **JavaScript thuần (ES modules)** | Không cần build; mở file là chạy |
| Luật cờ | **chess.js v1.4.0** (bản ESM `dist/esm/chess.js`), vendor vào `vendor/chess.js/chess.js` | Kiểm tra nước hợp lệ, SAN, FEN, PGN, phát hiện kết thúc ván |
| Engine | **Stockfish 19 Lite, single-threaded** từ npm `stockfish@19.0.1`: `bin/stockfish-19-lite-single.js` + `bin/stockfish-19-lite-single.wasm` (~1,9 MB), vendor vào `vendor/stockfish/` | Chạy trên host tĩnh, không cần header COOP/COEP; đủ mạnh (vượt xa 2500 Elo) |
| Nhận dạng giọng nói | **Web Speech API** (`window.SpeechRecognition \|\| window.webkitSpeechRecognition`) | Miễn phí, không server, không API key. Hoạt động trên Chrome, Edge, Safari (iOS 14.5+), Chrome Android |
| Đọc giọng nói | **Web Speech Synthesis** (`speechSynthesis`) | Có sẵn mọi trình duyệt hiện đại |
| Lưu trữ | `localStorage` | Cài đặt + ván đang chơi |
| Hosting | **GitHub Pages**, deploy từ nhánh, thư mục gốc `/` | HTTPS sẵn (micro cần HTTPS) |
| Test | `node --test` cho các module thuần (parser, elo mapping, formatter). Stockfish cũng chạy được trong Node để test engine | Không cần cài gì thêm |

**Không dùng:** React, Vue, TypeScript, Vite, webpack, Tailwind, npm dependencies lúc chạy, CDN lúc chạy.

**Lý do không dùng CDN cho Stockfish:** `new Worker(url)` không cho phép URL khác domain. Engine phải nằm cùng origin với trang.

**Đã kiểm chứng (25/10/2026):**
- `npm view stockfish version` → `19.0.1`. Tarball: `https://registry.npmjs.org/stockfish/-/stockfish-19.0.1.tgz`
- File lite-single: `stockfish-19-lite-single.js` (28 KB) + `stockfish-19-lite-single.wasm` (1,85 MB). File `.wasm` phải nằm **cùng thư mục** với file `.js`.
- Chạy `uci` trên engine này trả về:
  ```
  id name Stockfish 19 Lite WASM
  option name Threads type spin default 1 min 1 max 1
  option name Skill Level type spin default 20 min 0 max 20
  option name UCI_LimitStrength type check default false
  option name UCI_Elo type spin default 1320 min 1320 max 3190
  ```
  → `UCI_Elo` **không xuống dưới 1320**. Mức 1000–1300 phải mô phỏng bằng `Skill Level` + giới hạn độ sâu (xem mục 6).
- `npm view chess.js version` → `1.4.0`; entry ESM: `dist/esm/chess.js`.

---

## 3. Cấu trúc thư mục

```
/
├── index.html                 # Trang duy nhất (SPA một file HTML)
├── manifest.webmanifest       # PWA tối thiểu (tên, icon, màn hình dọc)
├── .nojekyll                  # Để GitHub Pages không chạy Jekyll
├── README.md                  # Hướng dẫn chơi + deploy (tiếng Việt)
├── CLAUDE.md                  # Quy ước code cho agent
├── PLAN.md                    # File này
├── css/
│   └── style.css
├── js/
│   ├── main.js                # Khởi tạo app, nối các module, state machine ván đấu
│   ├── state.js               # Store trạng thái app + pub/sub đơn giản
│   ├── game.js                # Bọc chess.js: đi nước, undo, lịch sử, kết thúc ván, FEN/PGN
│   ├── engine.js              # Bọc Stockfish Worker (UCI), hàng đợi lệnh, bestmove, eval
│   ├── elo.js                 # Bảng ánh xạ Elo → tham số engine (module thuần, test được)
│   ├── clock.js               # Đồng hồ thi đấu 2 bên, increment, hết giờ
│   ├── hints.js               # Quản lý quyền trợ giúp (peek ×1, locate ×2)
│   ├── speech/
│   │   ├── recognition.js     # Bọc SpeechRecognition: start/stop, push-to-talk, liên tục
│   │   ├── tts.js             # Bọc speechSynthesis: hàng đợi câu nói, chọn giọng vi-VN
│   │   ├── normalize.js       # Chuẩn hóa transcript (module thuần): bỏ dấu, số chữ → số, alias
│   │   ├── parser.js          # Transcript → ứng viên nước đi / lệnh (module thuần)
│   │   └── speak-move.js      # Nước đi (chess.js move) → câu đọc tiếng Việt (module thuần)
│   ├── ui/
│   │   ├── screens.js         # Chuyển màn hình: setup / play / peek / gameover
│   │   ├── board.js           # Vẽ bàn cờ SVG/DOM từ FEN (dùng lúc peek + gameover + replay)
│   │   ├── setup-form.js      # Form cài đặt trước ván
│   │   ├── play-hud.js        # Màn hình chơi: trạng thái nghe, đồng hồ, lượt, quyền còn lại
│   │   ├── gameover.js        # Kết quả, danh sách nước đi, replay, PGN
│   │   └── audio-cues.js      # Tiếng bíp (Web Audio API) báo bắt đầu/kết thúc nghe, lỗi
│   ├── storage.js             # localStorage: settings + saved game
│   ├── pgn.js                 # Xuất PGN có header, link Lichess
│   └── i18n/
│       └── vi.js              # TOÀN BỘ chuỗi hiển thị + chuỗi đọc TTS tiếng Việt
├── vendor/
│   ├── chess.js/
│   │   ├── chess.js           # chess.js 1.4.0 ESM
│   │   └── LICENSE
│   └── stockfish/
│       ├── stockfish-19-lite-single.js
│       ├── stockfish-19-lite-single.wasm
│       └── LICENSE            # GPLv3 (ghi rõ trong README)
├── assets/
│   ├── icon-192.png, icon-512.png   # Icon PWA (tự vẽ SVG → PNG đơn giản, hoặc SVG trực tiếp)
│   └── pieces/                # 12 file SVG quân cờ (dùng bộ "cburnett" của lichess, giấy phép CC BY-SA 3.0, ghi credit)
└── tests/
    ├── normalize.test.js
    ├── parser.test.js         # Table-driven, >100 câu nói VI/EN
    ├── speak-move.test.js
    ├── elo.test.js
    └── engine.test.js         # Chạy Stockfish trong Node, kiểm tra bestmove hợp lệ ở vài mức Elo
```

**Cách lấy vendor files** (làm một lần, commit vào repo):

```bash
# Stockfish
curl -sSL https://registry.npmjs.org/stockfish/-/stockfish-19.0.1.tgz -o /tmp/sf.tgz
tar xzf /tmp/sf.tgz -C /tmp package/bin/stockfish-19-lite-single.js package/bin/stockfish-19-lite-single.wasm package/LICENSE
mkdir -p vendor/stockfish && cp /tmp/package/bin/stockfish-19-lite-single.* /tmp/package/LICENSE vendor/stockfish/

# chess.js
curl -sSL https://registry.npmjs.org/chess.js/-/chess.js-1.4.0.tgz -o /tmp/chess.tgz
tar xzf /tmp/chess.tgz -C /tmp package/dist/esm/chess.js package/LICENSE
mkdir -p vendor/chess.js && cp /tmp/package/dist/esm/chess.js /tmp/package/LICENSE vendor/chess.js/
```

Nếu `curl` bị chặn, dùng `npm pack stockfish@19.0.1` rồi giải nén tương tự. **Không** đưa `node_modules` vào repo.

---

## 4. Luồng người dùng (state machine)

```
[SETUP] ──Bắt đầu──▶ [PLAY] ──(peek)──▶ [PEEK 10s] ──▶ [PLAY]
   ▲                   │
   │                   ├──(kết thúc ván)──▶ [GAMEOVER] ──Ván mới──▶ [SETUP]
   │                   │
   └──────Thoát────────┘
```

### 4.1 Màn hình SETUP (`#screen-setup`)

Form cài đặt, chữ to, dễ bấm trên điện thoại. Các mục:

| Mục | Kiểu | Giá trị | Mặc định |
|---|---|---|---|
| Sức mạnh máy | slider + số | 1000–2500, bước 50. Nhãn phụ: 1000–1200 "Mới chơi", 1250–1500 "Trung bình", 1550–1800 "Khá", 1850–2100 "Giỏi", 2150–2500 "Chuyên gia" | 1400 |
| Màu quân của bạn | 3 nút | Trắng / Đen / Ngẫu nhiên | Trắng |
| Đồng hồ | chọn | Không giới hạn / 5+0 / 10+0 / 15+10 / 30+0 / Tùy chỉnh (phút, giây cộng) | 15+10 |
| Ngôn ngữ nói | chọn | Tiếng Việt (`vi-VN`) / English (`en-US`) | Tiếng Việt |
| Xác nhận trước khi đi | công tắc | bật/tắt | **Bật** |
| Thông báo ăn quân, chiếu | công tắc | bật/tắt | **Tắt** |
| Cách đọc cột | chọn | "a, bê, xê, dê, e, ép, gờ, hát" / NATO "alpha…hotel" | Việt |
| Tốc độ đọc | slider | 0.7–1.4 | 1.0 |
| Giọng đọc | chọn | danh sách `speechSynthesis.getVoices()` lọc `vi` trước, rồi tất cả | giọng vi-VN đầu tiên |
| Cách nghe | chọn | Chạm để nói / Nghe liên tục (chỉ hiện trên desktop) | Chạm để nói |

Nút **"Bắt đầu ván đấu"** lớn ở dưới. Khi bấm:
1. Xin quyền micro (gọi `recognition.start()` rồi `stop()` ngay, hoặc `navigator.mediaDevices.getUserMedia({audio:true})` rồi dừng track).
2. Khởi tạo engine (hiện "Đang tải Stockfish…" nếu chưa sẵn; nên preload engine ngay khi mở trang).
3. Yêu cầu `navigator.wakeLock.request('screen')` nếu có (giữ màn hình sáng).
4. Chuyển sang PLAY. TTS đọc: *"Ván mới. Bạn cầm quân Trắng. Máy chơi ở mức 1400. Chạm vào màn hình rồi nói nước đi."* Nếu người chơi cầm Đen: máy đi trước, đọc nước đi của máy.

Nếu có ván đang lưu trong `localStorage` → hiện banner "Tiếp tục ván đang chơi?" với 2 nút Tiếp tục / Bỏ.

Nếu trình duyệt **không hỗ trợ** SpeechRecognition → hiện cảnh báo rõ: *"Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome, Edge hoặc Safari."* Vẫn cho chơi bằng cách gõ nước đi (ô nhập văn bản).

### 4.2 Màn hình PLAY (`#screen-play`)

**Không có bàn cờ.** Màn hình tối, tương phản cao, chữ rất to. Thiết kế cho **người ngồi cạnh** xem hoặc người chơi tháo bịt mắt trong giây lát:

```
┌──────────────────────────────┐
│  ⏱ Bạn 14:32      Máy 14:58  │  ← đồng hồ 2 bên (ẩn nếu "Không giới hạn")
│                              │
│         Nước 12              │
│      LƯỢT CỦA BẠN            │  ← hoặc "MÁY ĐANG NGHĨ…"
│                              │
│   🎤 Chạm bất kỳ đâu để nói  │  ← đổi thành "Đang nghe…" (nền đổi màu) khi bật mic
│                              │
│   Nghe được: "mã f3"         │  ← transcript cuối + kết quả parse
│                              │
│  👁 Xem bàn cờ: 1   📍 Hỏi vị trí: 2 │  ← quyền còn lại, cũng là nút bấm
│                              │
│  [ Nhắc lại ]  [ Xin thua ]  [ ⚙ ]  │
│  [ Gõ nước đi… ______ ] [Đi] │  ← fallback gõ tay (thu gọn mặc định)
└──────────────────────────────┘
```

**Toàn bộ vùng màn hình là nút push-to-talk** (trừ hàng nút dưới cùng): chạm (touch) hoặc click hoặc phím **Space** → bắt đầu nghe, kèm **tiếng bíp cao**. Nhận dạng tự dừng khi có kết quả (`interimResults=false`, `continuous=false`) hoặc sau 7 giây im lặng → **bíp thấp**. Người bịt mắt chỉ cần vỗ vào màn hình.

Chế độ "Nghe liên tục" (desktop): `continuous=true`, tự khởi động lại khi `onend`, nhưng **tắt mic khi TTS đang đọc** (tránh máy nghe chính nó) và bật lại sau `utterance.onend` + 300 ms.

### 4.3 Vòng lặp một nước đi của người chơi

```
1. Chạm → bíp → nghe → transcript
2. normalize(transcript) → parser.parse(text, {legalMoves, sideToMove})
3. Kết quả:
   a. { type: 'command', name }       → thực hiện lệnh (mục 5.3)
   b. { type: 'move', candidates: [] } → TTS "Không hiểu, nói lại." (bíp lỗi)
   c. candidates khớp 0 nước hợp lệ    → TTS "Nước đi không hợp lệ: <đọc lại cái máy hiểu>. Nói lại."
   d. khớp >1 nước hợp lệ              → TTS "Có nhiều quân có thể đi. Nói rõ hơn, ví dụ: mã b đến d2." (liệt kê tối đa 3 lựa chọn)
   e. khớp đúng 1 nước hợp lệ          → bước 4
4. Nếu "Xác nhận" bật: TTS "<đọc nước đi>. Đúng không?" → nghe lại:
     "đúng / ừ / ok / okay / yes / đi / chuẩn / phải / correct / confirm" → bước 5
     "sai / không / no / hủy / cancel / lại"                              → TTS "Đã hủy." quay về 1
     im lặng 5s hoặc không hiểu                                            → hỏi lại tối đa 1 lần, rồi hủy
   Nếu "Xác nhận" tắt → bước 5 ngay.
5. game.move(move) → cập nhật đồng hồ (cộng increment cho người chơi) → lưu ván → kiểm tra kết thúc
6. Nếu ván chưa kết thúc: engine.go(fen, params) → bestmove → game.move → đồng hồ máy → TTS đọc nước máy
7. Kiểm tra kết thúc ván. Nếu chưa → chờ người chơi (bước 1).
```

**Quan trọng:** Mic phải **tắt** khi máy đang nghĩ và khi TTS đang đọc. Mic chỉ sẵn sàng ở trạng thái "LƯỢT CỦA BẠN" và khi đang chờ xác nhận.

### 4.4 Màn hình PEEK (quyền "tháo bịt mắt")

- Chỉ dùng được **1 lần/ván**, khi đến lượt người chơi (không dùng khi máy nghĩ).
- Kích hoạt bằng lệnh nói *"tháo bịt mắt" / "xem bàn cờ" / "cho xem" / "show board" / "peek"* hoặc bấm nút 👁.
- TTS: *"Mở bàn cờ trong mười giây."* → bíp → **hiện bàn cờ to toàn màn hình** (hướng theo màu người chơi), kèm vòng đếm ngược to 10 → 0. Bíp ngắn ở giây 3, 2, 1. Hết giờ: che lại, TTS *"Đã che lại."*
- Người chơi có thể kết thúc sớm bằng cách nói *"xong" / "đủ rồi" / "done"* hoặc chạm màn hình.
- Đồng hồ người chơi **vẫn chạy** trong lúc xem (đây là trợ giúp, không phải tạm dừng).
- Sau khi dùng: biểu tượng 👁 chuyển thành "0", lệnh nói lại → TTS *"Bạn đã dùng hết lượt xem bàn cờ."*

### 4.5 Quyền "hỏi vị trí quân"

- **2 lần/ván**, chỉ khi đến lượt người chơi.
- Lệnh: *"vị trí quân" / "quân ở đâu" / "các quân đang ở đâu" / "đọc vị trí" / "where are the pieces" / "locate"* hoặc nút 📍.
- TTS đọc **tất cả quân không phải tốt** của **cả hai bên**, bên người chơi trước. Thứ tự: Vua, Hậu, Xe, Tượng, Mã. Ví dụ:
  > *"Trắng: Vua g1. Hậu d1. Xe a1, Xe f1. Tượng c4. Mã f3, Mã c3. Đen: Vua e8. Hậu d8. Xe a8, Xe h8. Tượng c8, Tượng e7. Mã f6."*
- Không đọc tốt. Không đọc đánh giá thế cờ.
- Sau đó TTS: *"Còn một lượt hỏi vị trí."* / *"Bạn đã dùng hết lượt hỏi vị trí."*

### 4.6 Màn hình GAMEOVER

- Dừng đồng hồ, tắt mic, nhả wake lock.
- TTS đọc kết quả: *"Chiếu hết. Bạn thắng."* / *"Chiếu hết. Máy thắng."* / *"Hòa do hết nước đi (pat)."* / *"Hòa do lặp lại ba lần."* / *"Hòa do luật 50 nước."* / *"Hòa do không đủ lực chiếu hết."* / *"Bạn hết giờ. Máy thắng."* / *"Bạn đã xin thua."* / *"Hòa theo thỏa thuận."*
- Hiện **bàn cờ cuối**, kết quả to, danh sách nước đi dạng `1. e4 e5 2. Nf3 Nc6 …` (SAN chuẩn, có `x` `+` `#`), bấm vào một nước → bàn cờ nhảy tới vị trí đó (replay), nút ◀ ▶ để bước.
- Nút: **Tải PGN** (file `.pgn`, tên `cờ-mù-YYYY-MM-DD-HHmm.pgn`), **Sao chép PGN**, **Phân tích trên Lichess** (mở `https://lichess.org/analysis/pgn/` + `encodeURIComponent(pgn)`), **Ván mới** (về SETUP, giữ cài đặt), **Chơi lại cùng cài đặt**.
- Xóa ván đã lưu trong `localStorage`.

---

## 5. Nhận dạng giọng nói và phân tích nước đi

Đây là phần khó nhất và quyết định trải nghiệm. Viết thành **module thuần**, không đụng DOM, test bằng `node --test`.

### 5.1 `speech/normalize.js` — chuẩn hóa transcript

Đầu vào: chuỗi từ SpeechRecognition (có thể có hoa/thường, dấu câu, số dạng chữ hoặc số).
Đầu ra: mảng token đã chuẩn hóa.

Bước xử lý:
1. Hạ chữ thường, bỏ dấu câu `.,!?-`, gộp khoảng trắng.
2. **Giữ dấu tiếng Việt** để phân biệt (ví dụ "mã" vs "ma"), nhưng cũng tạo bản **không dấu** để so khớp dự phòng (dùng `normalize('NFD').replace(/[̀-ͯ]/g,'')` + `đ→d`).
3. Tách token theo khoảng trắng. Tách thêm các cụm dính như `e4` → `e`,`4`; `nf3` → `n`,`f`,`3`; `e2e4` → `e`,`2`,`e`,`4`; `exd5` → `e`,`x`,`d`,`5`.
4. Ánh xạ alias (bảng dưới) → token chuẩn: chữ cột `a–h`, hàng `1–8`, quân `K Q R B N P`, từ khóa `TAKES`, `TO`, `CASTLE_SHORT`, `CASTLE_LONG`, `CASTLE`, `PROMOTE`, `CHECK` (bỏ qua), `MATE` (bỏ qua).

**Bảng alias chữ cột** (tiếng Việt lẫn tiếng Anh, vì recognizer `vi-VN` hay phiên âm chữ cái tiếng Anh thành tiếng Việt):

| Cột | Alias |
|---|---|
| a | `a`, `ây`, `ay`, `alpha`, `anh` (hiếm) |
| b | `b`, `bê`, `be`, `bi`, `bee`, `bravo`, `bờ` |
| c | `c`, `xê`, `xe`⚠, `si`, `see`, `sea`, `cê`, `charlie`, `cờ` |
| d | `d`, `dê`, `de`, `đê`, `đe`, `di`, `dee`, `delta`, `dờ`, `đờ` |
| e | `e`, `ê`, `i`, `ee`, `echo`, `ơ` (hiếm) |
| f | `f`, `ép`, `ep`, `ef`, `eff`, `foxtrot`, `phờ`, `ép phờ` |
| g | `g`, `gờ`, `giê`, `gie`, `ghi`, `gi`, `gee`, `golf`, `gê` |
| h | `h`, `hát`, `hat`, `hắt`, `aitch`, `hotel`, `hờ` |

⚠ **Xung đột "xe"**: "xe" vừa là quân Xe (R) vừa là cách đọc chữ "c". Quy tắc: nếu token "xe" đứng **ngay trước một số 1–8** và **trước nó là một quân cờ** (ví dụ "mã xe ba" = Nc3) → hiểu là cột c. Nếu "xe" đứng đầu hoặc sau nó là cột+hàng (ví dụ "xe e1") → quân Xe. Nếu "xe xe 3"→ R c3. Viết test cho các trường hợp này.

**Bảng alias hàng**: `1 một mốt one`, `2 hai two`, `3 ba three`, `4 bốn tư four`, `5 năm lăm five`, `6 sáu six`, `7 bảy seven`, `8 tám eight`. Cũng nhận "ba" khi recognizer trả về số `3`.

**Bảng alias quân**:

| Quân | Tiếng Việt | Tiếng Anh | Ký hiệu |
|---|---|---|---|
| K | vua, tướng | king | k (chỉ khi đứng trước ô) |
| Q | hậu, hoàng hậu | queen | q |
| R | xe, xa | rook, castle (chỉ khi theo sau là ô) | r |
| B | tượng, tịnh | bishop | b (⚠ cũng là cột b: "b" + ô → ưu tiên cột b nếu tạo được ô, ngược lại là Tượng; "bishop" không nhầm) |
| N | mã, ngựa | knight, night, horse | n |
| P | tốt, chốt, binh | pawn | p |

**Từ khóa**:
- TAKES: `ăn`, `bắt`, `lấy`, `takes`, `take`, `captures`, `capture`, `x`, `times`
- TO: `đến`, `tới`, `lên`, `qua`, `về`, `to`, `sang`, `đi`
- CASTLE_SHORT: `nhập thành gần`, `nhập thành ngắn`, `nhập thành cánh vua`, `castle short`, `short castle`, `castles short`, `kingside castle`, `castle kingside`, `king side`, `o-o`, `0-0`, `oo`
- CASTLE_LONG: `nhập thành xa`, `nhập thành dài`, `nhập thành cánh hậu`, `castle long`, `long castle`, `queenside castle`, `castle queenside`, `queen side`, `o-o-o`, `0-0-0`, `ooo`
- CASTLE (không rõ bên): `nhập thành`, `castle`, `castles`, `castling` → nếu chỉ 1 bên hợp lệ thì đi; nếu cả 2 → hỏi lại
- PROMOTE: `phong`, `phong cấp`, `thành`, `promote`, `promotes`, `promotion`, `equals`, `=` ; theo sau là tên quân (mặc định Hậu nếu không nói)
- Bỏ qua: `chiếu`, `check`, `chiếu hết`, `mate`, `checkmate`, `quân`, `con`, `ô`, `nước`, `the`, `a` (⚠ "a" là cột — chỉ bỏ "a" nếu nó là mạo từ trước piece name tiếng Anh), `please`, `làm ơn`, `nhé`, `nha`, `à`

### 5.2 `speech/parser.js` — token → ứng viên nước đi

Hàm `parseUtterance(tokens, ctx)` với `ctx = { legalMoves: chess.moves({verbose:true}), turn: 'w'|'b' }`.

Trả về một trong:
```js
{ type: 'command', name: 'PEEK' | 'LOCATE' | 'REPEAT' | 'HISTORY' | 'RESIGN' | 'DRAW' | 'TIME' | 'HELP' | 'CONFIRM_YES' | 'CONFIRM_NO' | 'DONE' | 'PAUSE' | 'RESUME' }
{ type: 'move', matches: Move[], spoken: string }   // matches lọc từ legalMoves
{ type: 'unknown', raw: string }
```

Ngữ pháp nước đi được nhận (theo thứ tự thử):

1. **Tọa độ**: `<ô> [TO] <ô> [PROMOTE <quân>]` → `e2 e4`, `e2 đến e4`, `g7 g8 phong hậu`. Khớp `from`+`to` (+`promotion`).
2. **Nhập thành**: CASTLE_SHORT / CASTLE_LONG / CASTLE.
3. **SAN có quân**: `<quân> [<cột>|<hàng>|<ô>] [TAKES] [TO] <ô> [PROMOTE <quân>]`
   - `mã f3` → N→f3; `mã ăn e5` → N×e5; `mã b d2` / `mã b đến d2` / `Nbd2` → N từ cột b → d2; `xe 1 e1` → R từ hàng 1 → e1; `mã g1 f3` → from g1.
   - Khi không có bộ phận phân biệt và có >1 quân cùng loại tới được → trả nhiều matches (UI hỏi lại).
4. **Tốt**: `[tốt] <ô>` → `e4`, `tốt e4`; `[tốt] <cột> TAKES <ô>` → `e ăn d5`, `exd5`; `<cột> <ô>` → `e d5` (tốt cột e tới d5, dùng khi tắt thông báo ăn quân); `<ô> PROMOTE <quân>` → `e8 phong hậu`; `<cột> TAKES <ô> PROMOTE <quân>`.
   - Chỉ `<ô>` một mình (ví dụ "e4"): ưu tiên nước tốt tới ô đó; nếu không có tốt nào tới được nhưng **đúng 1** quân khác tới được → chấp nhận (tiện cho người chơi), nếu nhiều → hỏi lại.
5. **Chỉ TAKES + ô**: `ăn d5`, `takes d5` → mọi nước ăn tới d5; nếu 1 → đi.

Lọc: với mỗi mẫu, build predicate trên `legalMoves` (so `piece`, `from`, `to`, `promotion`, `flags` chứa `c`/`e` khi TAKES). Trả về `matches`.

**Tuyệt đối không tự đoán** nếu ≥2 matches. Người chơi mù cần chắc chắn.

### 5.3 Lệnh bằng giọng nói (có hiệu lực khi đến lượt người chơi, trừ nơi ghi khác)

| Lệnh | Cụm từ nhận | Hành động |
|---|---|---|
| PEEK | tháo bịt mắt, mở bịt mắt, xem bàn cờ, cho xem, cho xem bàn cờ, show board, peek, show me the board | Mục 4.4 |
| LOCATE | vị trí quân, quân ở đâu, các quân ở đâu, đọc vị trí, quân chính, where are the pieces, locate, pieces | Mục 4.5 |
| REPEAT | nhắc lại, nói lại, máy đi gì, máy vừa đi gì, lặp lại, repeat, what did you play, again | TTS đọc lại nước cuối của máy (và của người chơi nếu hỏi "tôi vừa đi gì" → `MY_LAST`) |
| HISTORY | đọc lại ván, lịch sử, các nước đã đi, từ đầu, read the game, history, moves so far | TTS đọc toàn bộ ván dạng "Một. e4, e5. Hai. Mã f3, Mã c6. …". Nếu >20 nước, hỏi "Ván dài, đọc từ nước bao nhiêu?" — đơn giản hóa: đọc 10 nước cuối và nói "Đọc 10 nước gần nhất". |
| TIME | thời gian, còn bao nhiêu thời gian, đồng hồ, time, clock | TTS "Bạn còn 12 phút 30 giây. Máy còn 14 phút." (có hiệu lực cả khi máy nghĩ) |
| RESIGN | xin thua, tôi thua, đầu hàng, resign, i resign | TTS "Bạn chắc chắn xin thua?" → CONFIRM_YES → GAMEOVER |
| DRAW | cầu hòa, đề nghị hòa, hòa không, offer draw, draw | Lấy eval từ engine (`go depth 12`, đọc `score cp` góc nhìn máy). Nếu máy không hơn quá +150 cp **và** ván ≥ 20 nước → chấp nhận, GAMEOVER hòa. Ngược lại TTS "Máy từ chối hòa." Mỗi 10 nước chỉ cầu hòa 1 lần. |
| HELP | trợ giúp, hướng dẫn, các lệnh, help, commands | TTS đọc ngắn: "Nói nước đi như: mã f3, e4, tốt ăn d5, nhập thành gần. Lệnh: xem bàn cờ, vị trí quân, nhắc lại, thời gian, xin thua." |
| CONFIRM_YES / NO | (mục 4.3) | chỉ ở trạng thái chờ xác nhận |
| DONE | xong, đủ rồi, che lại, done, close | chỉ ở PEEK |
| PAUSE / RESUME | tạm dừng, dừng, pause / tiếp tục, resume | Dừng/chạy đồng hồ, mic tắt khi pause trừ lệnh resume. Chỉ áp dụng khi có đồng hồ. |

Lệnh được ưu tiên nhận trước nước đi (kiểm tra cụm từ lệnh ở toàn câu trước khi parse nước đi).

### 5.4 `speech/speak-move.js` — đọc nước đi

Hàm `speakMove(move, opts)` trả về **chuỗi tiếng Việt** để TTS đọc. `move` là object verbose của chess.js (`piece`, `from`, `to`, `san`, `flags`, `promotion`, `captured`).

Quy tắc với `announceCaptures = false` (**mặc định**):
- Quân (không tốt): `"<Tên quân> <ô đến>"` → "Mã f3". Nếu SAN có phân biệt (ví dụ `Nbd2`, `R1e1`) → "Mã b d2", "Xe 1 e1".
- Tốt đi thẳng: `"<ô đến>"` → "e4" (đọc là "e bốn"). Có thể nói "Tốt e4" — chọn **"Tốt e4"** cho rõ.
- Tốt ăn chéo: **phải** đọc cột xuất phát: `"Tốt <cột> <ô đến>"` → "Tốt e d5".
- Phong cấp: `"<…> phong Hậu"` → "Tốt e8 phong Hậu", "Tốt d c8 phong Mã".
- Nhập thành: "Nhập thành gần" / "Nhập thành xa".
- Không đọc "ăn", "chiếu", "chiếu hết". (Kết thúc ván đọc riêng ở GAMEOVER.)

Khi `announceCaptures = true`: thêm "ăn <tên quân bị ăn>" → "Mã ăn Tượng e5"; thêm "chiếu" ở cuối nếu `san` có `+`; "chiếu hết" nếu `#`. Bắt tốt qua đường: "Tốt e ăn d6, bắt tốt qua đường".

**Đọc ô**: chữ cột theo cài đặt: kiểu Việt `a bê xê dê e ép gờ hát` hoặc NATO `alpha bravo charlie delta echo foxtrot golf hotel`; hàng đọc số thường (TTS vi-VN tự đọc "bốn"). Viết hàm `spellSquare('e4', style)` → `"e 4"` hoặc `"echo 4"`. Để TTS đọc rõ, chèn dấu phẩy hoặc khoảng trắng giữa cột và hàng.

**Chú ý TTS tiếng Việt với chữ đơn**: giọng vi-VN đọc "b" có thể thành "bê" hoặc "bờ"; để nhất quán, **luôn thay chữ cột bằng từ đầy đủ** trong chuỗi gửi TTS (đọc "bê bốn", không gửi "b4").

### 5.5 `speech/recognition.js`

```js
export function createRecognizer({ lang, continuous, onResult, onStart, onEnd, onError })
  .start()   // bíp cao trước khi start
  .stop()
  .abort()
  .setLang(lang)
  .isSupported()
```
- `interimResults = false`, `maxAlternatives = 3` → **thử parse lần lượt từng alternative** cho tới khi có kết quả có `matches.length ≥ 1` hoặc là lệnh. Cách này tăng tỉ lệ nhận đúng rõ rệt.
- Xử lý lỗi: `not-allowed` → hiện hướng dẫn cấp quyền micro; `no-speech` → bíp thấp, TTS "Không nghe thấy gì."; `network` → TTS "Lỗi mạng nhận dạng giọng nói."; `aborted` → bỏ qua.
- Trên iOS Safari: `recognition.start()` phải được gọi **trực tiếp trong handler sự kiện chạm**. Không gọi sau `await`.
- Thời gian chờ an toàn 8 giây → tự `stop()`.

### 5.6 `speech/tts.js`

```js
export const tts = { speak(text, {priority}) → Promise<void>, cancel(), setVoice(), setRate(), getVietnameseVoices() }
```
- Hàng đợi: câu sau chờ câu trước `onend`. `speak()` trả Promise resolve khi đọc xong → `main.js` dùng `await tts.speak(...)` rồi mới bật mic.
- Fallback nếu `onend` không bắn (lỗi phổ biến Chrome): timeout = `text.length * 90ms + 1500ms` thì resolve.
- `speechSynthesis.getVoices()` có thể rỗng lúc đầu → lắng nghe `voiceschanged`.
- Chrome Android/iOS: TTS cần được "mở khóa" bằng tương tác người dùng → gọi `speechSynthesis.speak(new SpeechSynthesisUtterance(''))` trong handler nút "Bắt đầu ván đấu".
- Tạm dừng recognizer trước `speak`, tiếp tục sau khi xong (chỉ ở chế độ nghe liên tục).

---

## 6. Engine — `engine.js` + `elo.js`

### 6.1 Giao tiếp UCI qua Worker

```js
const worker = new Worker('./vendor/stockfish/stockfish-19-lite-single.js');
worker.postMessage('uci');          // chờ 'uciok'
worker.postMessage('isready');      // chờ 'readyok'
worker.postMessage('ucinewgame');
worker.postMessage(`position fen ${fen}`);   // hoặc 'position startpos moves e2e4 e7e5 ...'
worker.postMessage(`go movetime ${ms}` | `go depth ${d}`);
// lắng nghe 'bestmove e2e4 ponder ...' và 'info ... score cp N ...'
```
- Bọc thành `engine.init()`, `engine.newGame()`, `engine.setStrength(elo)`, `engine.bestMove(fen) → Promise<{from,to,promotion}>`, `engine.evaluate(fen, depth) → Promise<cp>`, `engine.stop()`.
- Preload engine khi trang mở (sau `DOMContentLoaded`), hiển thị tiến trình tải WASM nếu lâu.
- Khởi tạo lỗi (ví dụ WASM không hỗ trợ) → thông báo rõ.
- Chuyển `bestmove` dạng UCI (`e7e8q`) sang chess.js: `game.move({from:'e7', to:'e8', promotion:'q'})`.
- **Thêm độ trễ tối thiểu 600 ms** trước khi máy đọc nước đi (nghe tự nhiên, không bị dồn với TTS trước).
- Thời gian nghĩ của máy **trừ vào đồng hồ máy**; máy luôn nghĩ nhanh nên không bao giờ hết giờ (nhưng vẫn cộng increment cho đúng luật).

### 6.2 Ánh xạ Elo → tham số (`elo.js`, module thuần)

`UCI_Elo` chỉ từ 1320, và Stockfish coi **UCI_Elo 1320 ≈ Skill Level 0** (chọn ngẫu nhiên có trọng số trong ≥ 4 nước đầu, ở độ sâu 1). Vì vậy mức dưới 1320 **không được** dùng Skill > 0 (sẽ mạnh hơn 1320). Bảng thực tế (`ELO_LOW_TABLE` trong `js/elo.js`):

| Elo UI | Cách giới hạn | `go` |
|---|---|---|
| 1000 | Skill 0, `MultiPV 8`, thay bằng nước kém hơn với xác suất 0.50, cửa sổ 400 cp | `go depth 3` |
| 1050 | Skill 0, `MultiPV 8`, 0.43, 350 cp | `go depth 3` |
| 1100 | Skill 0, `MultiPV 7`, 0.36, 300 cp | `go depth 3` |
| 1150 | Skill 0, `MultiPV 7`, 0.30, 250 cp | `go depth 3` |
| 1200 | Skill 0, `MultiPV 6`, 0.24, 200 cp | `go depth 3` |
| 1250 | Skill 0, `MultiPV 6`, 0.18, 150 cp | `go depth 3` |
| 1300 | Skill 0, `MultiPV 5`, 0.12, 120 cp | `go depth 3` |
| 1350–2500 (bước 50) | `UCI_LimitStrength true`, `UCI_Elo <elo>`, `Skill Level 20`, `MultiPV 1` | `go movetime 800` (≤ 1800) / `go movetime 1200` (≥ 1850) |

Hàm `eloToEngineParams(elo) → { options, goCommand, randomize, approximate }`. UI ghi chú: *"Mức dưới 1320 là ước lượng."*

**Làm yếu mức thấp (`pickRandomized` trong `js/engine.js`)** — chỉ có thể làm nước đi tệ đi:
1. `MultiPV` lớn hơn 4 → Skill 0 tự chọn trong nhiều ứng viên hơn.
2. Với xác suất `probability`, thay nước Stockfish đã chọn bằng một ứng viên **có điểm thấp hơn nó** nhưng không kém nước tốt nhất quá `windowCp`. Không bao giờ thay bằng nước tốt hơn.

*(Quyết định khi triển khai: bảng ban đầu dùng Skill 1–5 cho 1100–1300; đo thực tế cho thấy 1300 mạnh hơn 1600 nên đã đổi. Đo bằng `node tools/measure-strength.mjs`, 100 thế cờ, mất điểm trung bình/nước: 1000 ≈ 133 cp, 1150 ≈ 129, 1300 ≈ 80, 1350 ≈ 88, 1800 ≈ 75, 2500 ≈ 50. Số đo có nhiễu ±15 cp.)*

### 6.3 Test engine trong Node (`tests/engine.test.js`)

Stockfish lite-single chạy được trong Node 18+ (đã kiểm chứng với Node 22):
```js
const engine = await require('../vendor/stockfish/stockfish-19-lite-single.js')();
engine.listener = (line) => {...};
engine.processCommand('uci');
```
(Trong Node, API là `processCommand` + `listener`, không phải `postMessage`.) Test: với FEN khai cuộc, mức 1000 và 2500 đều trả `bestmove` 4–5 ký tự hợp lệ trong < 10 giây; nước đó nằm trong `chess.moves({verbose:true})`.

---

## 7. Đồng hồ — `clock.js`

- Hai bộ đếm ms, `start(side)`, `switchTo(side)`, `pause()`, `resume()`, `addIncrement(side)`, `onTick`, `onFlag(side)`.
- Dùng `performance.now()` chênh lệch, không dùng `setInterval` cộng dồn (tránh trôi). Tick UI 200 ms.
- Người chơi hết giờ → GAMEOVER "Bạn hết giờ. Máy thắng." (nếu máy không đủ lực chiếu hết → hòa, chess.js không có hàm này → kiểm tra tay: chỉ còn Vua, hoặc Vua + 1 Mã/Tượng → hòa).
- Cảnh báo âm thanh cho người chơi (vì không nhìn được): TTS ngắn "Còn một phút." ở 60 s, bíp đôi ở 30 s, bíp mỗi giây ở 10 s cuối (chỉ khi đến lượt người chơi và mic không đang nghe; nếu đang nghe thì chỉ bíp nhẹ). Có công tắc tắt cảnh báo.
- Khi tab bị ẩn (`visibilitychange`) → đồng hồ vẫn tính đúng theo thời gian thực.

---

## 8. Quyền trợ giúp — `hints.js`

```js
{ peeksLeft: 1, locatesLeft: 2, usePeek(), useLocate(), reset() }
```
- Lưu cùng ván trong `localStorage`.
- Chỉ dùng khi `state === 'PLAYER_TURN'`. Khi máy nghĩ: TTS "Chờ máy đi xong."

---

## 9. Lưu trữ — `storage.js`

- `settings` (tất cả mục ở 4.1 + cảnh báo đồng hồ).
- `savedGame`: `{ fen, pgn (hoặc history UCI), playerColor, elo, clock: {white, black, increment}, hints, startedAt, timeControl }`. Ghi sau **mỗi** nước đi. Khôi phục khi mở lại.
- Phiên bản schema `v: 1`; nếu khác → bỏ qua.

---

## 10. Giao diện & khả năng tiếp cận

- **Mobile-first**, dọc. `viewport-fit=cover`, không zoom (`user-scalable=no` chỉ ở màn PLAY để tránh double-tap zoom khi vỗ màn hình; dùng `touch-action: manipulation`).
- Màn PLAY: nền tối (`#0b0f14`), chữ trắng, kích cỡ chữ `clamp(1.5rem, 6vw, 3rem)`. Khi đang nghe: nền chuyển xanh đậm + viền sáng chuyển động; khi máy nghĩ: nền tím đậm; lỗi: nháy đỏ 300 ms.
- Mọi phản hồi quan trọng **đều có âm thanh** (bíp hoặc TTS); màn hình chỉ phụ.
- Tiếng bíp bằng Web Audio API (`OscillatorNode`), không file âm thanh: nghe = 880 Hz 120 ms; xong = 440 Hz 120 ms; lỗi = 220 Hz 250 ms ×2; đếm ngược = 660 Hz 80 ms.
- Phím tắt desktop: `Space` nói, `P` xem bàn cờ, `L` vị trí, `R` nhắc lại, `Esc` hủy xác nhận.
- Bàn cờ (`ui/board.js`): grid 8×8 CSS, quân SVG từ `assets/pieces/`, tọa độ ở mép, xoay theo màu người chơi, highlight nước cuối. Không cần kéo thả (chỉ xem).
- Vùng `aria-live="polite"` mô tả trạng thái (hỗ trợ screen reader).
- `navigator.wakeLock` giữ màn hình sáng; xin lại khi `visibilitychange` về `visible`.
- PWA tối thiểu: `manifest.webmanifest` (name, short_name "Cờ mù", display standalone, orientation portrait, theme_color, icons). **Không** service worker ở phiên bản đầu (tránh cache cũ khi deploy).

---

## 11. `i18n/vi.js`

Một object `VI` chứa **mọi** chuỗi: nhãn UI, câu TTS (dạng hàm nếu có tham số), tên quân (`K:'Vua', Q:'Hậu', R:'Xe', B:'Tượng', N:'Mã', P:'Tốt'`), cách đọc cột (`FILE_VI`, `FILE_NATO`), câu kết thúc ván, câu lỗi. Không hard-code chuỗi tiếng Việt ở nơi khác. Cấu trúc này giúp sau thêm `en.js` nếu cần.

---

## 12. Thứ tự triển khai (mỗi bước xong → chạy được → commit)

**Bước 0 — Khung + vendor**
- Tạo cấu trúc thư mục, `.nojekyll`, `index.html` trống có 4 `<section>` màn hình, `css/style.css` cơ bản, `js/main.js` log "ok".
- Tải vendor (mục 3). Kiểm tra `import { Chess } from '../vendor/chess.js/chess.js'` chạy trong trình duyệt.
- Server local: `python3 -m http.server 8080` → mở `http://localhost:8080`. (Phải chạy qua HTTP, không mở `file://`, vì ES modules và Worker.)

**Bước 1 — Chơi được bằng gõ tay (chưa có giọng nói)**
- `game.js`, `engine.js`, `elo.js`, `state.js`, `ui/screens.js`, `ui/setup-form.js`, `ui/play-hud.js` với ô gõ nước đi (SAN hoặc tọa độ, dùng `chess.move(text)` thử SAN rồi fallback parser tọa độ).
- Ván đấu hoàn chỉnh: chọn Elo, màu; máy đi; phát hiện kết thúc; màn GAMEOVER với bàn cờ (`ui/board.js`), danh sách nước, PGN (`pgn.js`).
- Test: `tests/elo.test.js`, `tests/engine.test.js`.

**Bước 2 — Giọng nói**
- `speech/normalize.js`, `speech/parser.js`, `speech/speak-move.js` **kèm test table-driven** (viết test trước, ≥ 100 câu: xem Phụ lục A). Chạy `npm test`.
- `speech/tts.js`, `speech/recognition.js`, `ui/audio-cues.js`. Nối vào vòng lặp 4.3, có xác nhận.
- Lệnh REPEAT, HELP, HISTORY, RESIGN.

**Bước 3 — Trợ giúp, đồng hồ, lưu ván**
- `hints.js` + màn PEEK + LOCATE. `clock.js` + cảnh báo âm. `storage.js` + khôi phục ván. DRAW offer với eval. PAUSE/RESUME. TIME.

**Bước 4 — Hoàn thiện**
- Mobile polish, wake lock, PWA manifest, icon, phím tắt, aria-live.
- Replay trên màn GAMEOVER, link Lichess.
- `README.md`: cách chơi, danh sách câu nói mẫu, cách deploy GitHub Pages, giấy phép (Stockfish GPLv3, chess.js BSD-2, quân cờ cburnett CC BY-SA 3.0).

**Bước 5 — Kiểm thử toàn diện (bắt buộc, xem mục 14)**
- Hoàn thiện `window.__blindfold` và recognizer/TTS giả cho Playwright.
- Viết và chạy xanh toàn bộ E1–E20, `full-game.test.js` 3 ván, `npm run test:all`.
- Chụp ảnh màn hình, viết `TEST-REPORT.md`. Chỉ sau bước này mới báo hoàn thành.

Lưu ý: test đơn vị của mỗi module viết **ngay trong bước tạo module đó**, không dồn về Bước 5. Bước 5 là chạy lại toàn bộ + E2E + báo cáo.

---

## 13. Checklist nghiệm thu

Mỗi dòng dưới đây phải được **chứng minh bằng test tự động** ở mục 14 (ghi số test tương ứng vào `TEST-REPORT.md`), trừ những dòng ghi rõ "thủ công".

- [ ] Mở `index.html` qua GitHub Pages: không lỗi console, engine tải < 5 s trên 4G (thủ công sau khi deploy).
- [ ] Không có bước build; không có `package.json` dependencies lúc chạy (chỉ có `package.json` với `"type": "module"` và `scripts`).
- [ ] Chọn 1000 Elo: máy đi nhanh, chơi yếu rõ rệt (để tốt lộ, bỏ quân). Chọn 2500: máy chơi chắc.
- [ ] Nói "e4", "mã f3", "tốt ăn d5", "nhập thành gần", "e2 e4", "knight f3", "echo four" → đều đi đúng.
- [ ] Nói nước không hợp lệ → máy báo và không đổi trạng thái.
- [ ] Nói "mã d2" khi cả 2 mã tới được → máy hỏi lại, nói "mã b d2" → đi đúng.
- [ ] Xác nhận: "mã f3" → "Mã f3, đúng không?" → "sai" → hủy; → "đúng" → đi.
- [ ] Máy đọc nước đi của nó; không đọc "ăn"/"chiếu" khi cài mặc định; tốt ăn chéo đọc kèm cột.
- [ ] "Xem bàn cờ": hiện 10 s, đếm ngược, che lại, lần 2 bị từ chối.
- [ ] "Vị trí quân": đọc đúng mọi quân không phải tốt 2 bên; lần 3 bị từ chối.
- [ ] "Nhắc lại", "đọc lại ván", "thời gian", "trợ giúp" hoạt động.
- [ ] Đồng hồ 15+10: cộng đúng, hết giờ → thua; cảnh báo 1 phút bằng giọng.
- [ ] "Xin thua" → hỏi xác nhận → kết thúc. "Cầu hòa" khi đang thua nặng → máy từ chối.
- [ ] Chiếu hết / pat / lặp 3 lần → GAMEOVER đúng thông điệp, bàn cờ hiện, PGN tải được và mở được trên Lichess.
- [ ] F5 giữa ván → đề nghị tiếp tục → khôi phục đúng FEN, đồng hồ, quyền trợ giúp.
- [ ] Trên điện thoại: vỗ màn hình để nói; màn hình không tắt trong ván; không zoom khi chạm đôi.
- [ ] `npm test` xanh (≥ 100 câu parser).
- [ ] `npm run test:e2e` xanh: E1–E20 + 3 ván tự động ở 1000 / 1800 / 2500 Elo.
- [ ] Mic **không bao giờ** bật khi TTS đang đọc hoặc máy đang nghĩ (E17).
- [ ] `TEST-REPORT.md` có đủ: lệnh, kết quả, ảnh 4 màn hình, danh mục cần người dùng tự kiểm trên điện thoại thật.

---

## 14. KIỂM THỬ BẮT BUỘC SAU KHI CODE — điều kiện để được coi là "xong"

**Không được báo hoàn thành nếu chưa làm đủ 4 lớp dưới đây và tất cả đều xanh.** Mỗi khi sửa lỗi, chạy lại toàn bộ. Kết quả ghi vào `TEST-REPORT.md` (mục 14.5).

### 14.1 Thiết kế để test được (làm ngay từ Bước 1, không để sau)

- Mọi logic (parser, speak-move, elo, clock, hints, game) là **module thuần**, không đụng DOM, không gọi API trình duyệt trực tiếp. DOM và API trình duyệt chỉ ở `main.js`, `ui/*`, `speech/recognition.js`, `speech/tts.js`.
- `recognition.js` và `tts.js` **chỉ** truy cập `window.SpeechRecognition || window.webkitSpeechRecognition` và `window.speechSynthesis` qua **một điểm duy nhất** (ví dụ `getRecognitionCtor()`, `getSynth()`), để test có thể thay bằng bản giả.
- Khi URL có `?test=1`, `main.js` gắn `window.__blindfold` gồm:
  ```js
  {
    simulateSpeech(text),        // như recognizer vừa trả transcript này
    getState(),                  // { screen, turn, fen, pgn, hints, clocks, waitingConfirm, listening }
    getSpokenLog(),              // mảng mọi chuỗi đã gửi TTS, theo thứ tự
    setEngineDelay(ms),          // 0 để test chạy nhanh
    forceEngineMove(uci)         // ép nước đi của máy, tạo tình huống kiểm thử (chiếu hết, phong cấp…)
  }
  ```
  Ở chế độ test, TTS và tiếng bíp **không phát ra loa** nhưng vẫn ghi log; thời gian chờ (600 ms độ trễ máy, 300 ms sau TTS, 10 s peek) có thể rút ngắn qua `setEngineDelay` / `getState().timers`.
- Bàn cờ, đồng hồ, chỉ số quyền trợ giúp có `data-testid` ổn định: `board`, `square-e4`, `clock-player`, `clock-engine`, `hint-peek`, `hint-locate`, `status`, `transcript`, `movelist`, `result`.

### 14.2 Lớp 1 — Test đơn vị (`npm test`)

Bắt buộc có và xanh:
- `normalize.test.js`: alias cột/hàng/quân, tách token dính (`nf3`, `e2e4`, `exd5`), bỏ dấu, xung đột "xe".
- `parser.test.js`: **≥ 100 câu** từ Phụ lục A, bao gồm VI, EN, NATO, tọa độ, phân biệt quân, nhập thành, phong cấp, lệnh, câu rác, câu rỗng, nhiều alternatives.
- `speak-move.test.js`: Phụ lục B, cả hai chế độ `announceCaptures`, cả hai kiểu đọc cột.
- `elo.test.js`: mọi mức 1000→2500 bước 50 trả về tham số hợp lệ; < 1320 không dùng `UCI_Elo`; ≥ 1320 dùng `UCI_Elo` đúng giá trị; không có giá trị ngoài khoảng engine chấp nhận.
- `clock.test.js`: dùng đồng hồ giả (inject `now()`), kiểm tra chuyển bên, increment, pause/resume, hết giờ bắn `onFlag` đúng bên.
- `hints.test.js`: giới hạn 1/2, từ chối khi hết, reset ván mới, serialize/restore.
- `game.test.js`: kết thúc ván các loại (chiếu hết, pat, lặp 3, 50 nước, không đủ lực), PGN có header đúng, khôi phục từ saved state cho ra cùng FEN.
- `engine.test.js`: Stockfish chạy trong Node; mức 1000 và 2500 trả `bestmove` hợp lệ cho 5 FEN khác nhau (khai cuộc, trung cuộc, tàn cuộc, có phong cấp, chỉ 1 nước hợp lệ); `evaluate()` trả số.

Lệnh: `npm test` (Node ≥ 18). `package.json` có `"type":"module"` và `"scripts":{"test":"node --test \"tests/**/*.test.js\"","test:e2e":"node --test --test-concurrency=1 \"e2e/**/*.test.js\"","test:all":"npm test && npm run test:e2e"}`. *(Node 22 không nhận thư mục làm tham số của `--test`, phải dùng mẫu glob.)* **Không** có `dependencies`; Playwright chỉ ở `devDependencies` nếu không có sẵn (xem 14.3).

### 14.3 Lớp 2 — Test đầu-cuối trong trình duyệt (Playwright + Chromium)

Môi trường cloud đã có sẵn `playwright` và Chromium (`require('playwright')` chạy từ mọi thư mục, `chromium.launch()` không cần tham số; **không** chạy `playwright install`). Nếu chạy ở nơi khác thì `npm i -D playwright && npx playwright install chromium`.

Khung: thư mục `e2e/`, dùng `node --test` + `playwright` thuần (không cần `@playwright/test`). Mỗi test:
1. Khởi động `python3 -m http.server 8080` (hoặc server tĩnh nhỏ bằng Node trong `e2e/helpers/server.js` để không phụ thuộc Python) ở thư mục gốc repo.
2. `page.addInitScript()` cài **SpeechRecognition giả** (lớp có `start/stop/abort`, thuộc tính `onresult/onend/onerror/lang/continuous/maxAlternatives`; test gọi `window.__fakeRecognition.emit(transcripts[])` để bắn `onresult` với nhiều alternatives) và **speechSynthesis giả** (`speak()` lưu `utterance.text` vào `window.__spoken[]` và gọi `onend` sau 0 ms; `getVoices()` trả 1 giọng `vi-VN` giả; bắn `voiceschanged`).
3. Mở `http://localhost:8080/?test=1`, chờ `window.__blindfold`.

Kịch bản bắt buộc (mỗi cái là 1 test, có thể dùng `forceEngineMove` để tạo tình huống):

| # | Kịch bản | Kiểm tra |
|---|---|---|
| E1 | Mở trang, engine tải xong | Không lỗi console (`page.on('pageerror')`, `console.error` = 0); nút Bắt đầu bật |
| E2 | Setup → Bắt đầu, cầm Trắng, 1400, không đồng hồ | TTS log có câu chào; màn PLAY hiện; **không có** bàn cờ trong DOM (`board` không tồn tại hoặc `hidden`) |
| E3 | Nói "e4" → xác nhận "đúng" | FEN đổi, máy trả nước, TTS đọc nước máy đúng định dạng speak-move |
| E4 | Nói "mã f3" → "sai" | FEN không đổi, TTS "Đã hủy" |
| E5 | Nói nước không hợp lệ ("hậu h5" khi bị chặn) | TTS chứa "không hợp lệ", FEN không đổi |
| E6 | Nhiều ứng viên ("mã d2" với 2 mã) | TTS hỏi lại; nói "mã b d2" → đi đúng |
| E7 | Tắt xác nhận trong cài đặt → "e4" | Đi ngay, không có câu "đúng không" |
| E8 | 3 alternatives, chỉ alternative thứ 2 hợp lệ | Nhận đúng nước |
| E9 | "Xem bàn cờ" | `board` hiện, đếm ngược hiện; sau khi hết (rút ngắn timer) `board` ẩn; `hint-peek` = 0; lần 2 → TTS từ chối |
| E10 | "Quân ở đâu" ×3 | 2 lần đọc đúng (so với FEN: liệt kê mọi quân không phải tốt, không có tốt); lần 3 từ chối |
| E11 | "Nhắc lại", "đọc lại ván", "trợ giúp" | TTS log có nội dung tương ứng |
| E12 | Đồng hồ 1+0 (tùy chỉnh), ép thời gian người chơi còn 1 s rồi chờ | GAMEOVER "hết giờ", kết quả hiện, mic tắt |
| E13 | "Xin thua" → "đúng" | GAMEOVER, PGN có `Result "0-1"` (khi cầm Trắng) |
| E14 | Dùng `forceEngineMove` dẫn tới **chiếu hết** cho mỗi bên | TTS kết quả đúng, bàn cờ hiện, movelist đúng SAN, nút Tải PGN tạo file hợp lệ (parse lại bằng chess.js `loadPgn` không lỗi) |
| E15 | Ván đến giữa → `page.reload()` | Banner tiếp tục; bấm Tiếp tục → FEN, quyền trợ giúp, đồng hồ (±2 s) khôi phục đúng |
| E16 | Cầm Đen | Máy đi trước, TTS đọc nước máy trước khi mic mở |
| E17 | Mic không bao giờ mở sai lúc | Trong toàn bộ E3–E16, ghi log `start()` của recognizer giả: không có lần `start()` nào khi `getState().turn !== player` hoặc khi TTS chưa `onend` |
| E18 | Thông báo ăn quân bật | Nước ăn của máy đọc có "ăn", nước chiếu có "chiếu" |
| E19 | Viewport mobile 390×844 | Không tràn ngang (`document.documentElement.scrollWidth <= innerWidth`), vùng chạm để nói ≥ 60% chiều cao, chữ trạng thái ≥ 24 px |
| E20 | Phím Space trên desktop | Mở mic (recognizer giả nhận `start()`) |

### 14.4 Lớp 3 — Ván đấu tự động đầu-cuối (smoke chơi thật)

Script `e2e/full-game.test.js`: cho **máy chơi với máy** qua giao diện: mỗi lượt người chơi, test lấy `getState().fen`, nhờ một Stockfish thứ hai chạy trong Node (hoặc chọn nước ngẫu nhiên hợp lệ bằng chess.js) chọn nước, chuyển sang câu nói tiếng Việt bằng chính `speak-move`/một hàm `moveToUtterance()` rồi `simulateSpeech()`. Chơi **3 ván**: Elo 1000, 1800, 2500, tới khi kết thúc hoặc 150 nước. Kiểm tra: không lỗi console, không treo (mỗi nước < 5 s với `setEngineDelay(0)`), kết thúc hợp lệ, PGN parse lại được. Đây là bài kiểm tra "mọi thứ nối với nhau chạy ổn".

### 14.5 Lớp 4 — Kiểm thử thủ công + báo cáo

Sau khi 3 lớp trên xanh, chạy `python3 -m http.server 8080`, mở trong Chromium thật (Playwright headed hoặc screenshot) và chụp ảnh 4 màn hình (setup, play, peek, gameover) lưu vào `docs/screenshots/`. Vì không có micro thật trong môi trường tự động, phần nhận dạng thật được xác nhận qua lớp 1–3 và ghi rõ trong báo cáo là **cần người dùng thử trên điện thoại thật**.

Tạo `TEST-REPORT.md` gồm: ngày, phiên bản commit, lệnh đã chạy, số test pass/fail từng lớp, ảnh chụp, danh sách những gì **chưa** kiểm được bằng máy (micro thật, giọng TTS thật trên iOS/Android) kèm hướng dẫn người dùng tự kiểm 5 phút.

### 14.6 Quy tắc khi test đỏ

- Sửa code, không sửa test cho qua, trừ khi test sai so với đặc tả này (ghi lý do vào commit).
- Không skip/disable test.
- Lỗi chập chờn (flaky) phải tìm nguyên nhân (thường là chờ TTS/engine chưa xong) và sửa bằng chờ sự kiện, không bằng `sleep` cố định.

---

## 15. Rủi ro đã biết và cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Recognizer `vi-VN` nhận chữ cái kém ("b/d/e/g") | `maxAlternatives=3`; alias phong phú; khuyến khích nói kiểu "bê bốn"/NATO (ghi trong HELP và README); xác nhận trước khi đi |
| Firefox không có SpeechRecognition | Cảnh báo + fallback gõ tay |
| TTS vi-VN không có trên máy người dùng | Fallback giọng mặc định; vẫn đọc được (phát âm lạ nhưng hiểu). Hiện gợi ý cài giọng tiếng Việt trong hệ điều hành |
| `speechSynthesis` Chrome ngắt câu dài > 15 s | Chia HISTORY/LOCATE thành nhiều utterance ≤ 200 ký tự, nối hàng đợi |
| Máy nghe chính nó (echo) | Mic tắt tuyệt đối khi TTS đọc; chờ 300 ms sau `onend` |
| Người dùng mở `file://` | Hiện thông báo "Hãy chạy qua HTTP(S)" nếu `location.protocol === 'file:'` |
| GitHub Pages cache WASM cũ sau cập nhật | Thêm `?v=<hash>` vào URL worker khi đổi phiên bản engine |
| iOS: `recognition.start()` ngoài gesture bị chặn | Luôn gọi trong handler `touchend`/`click` đồng bộ |

---

## Phụ lục A — Bộ test parser (trích, cần mở rộng ≥ 100 dòng)

Vị trí test mặc định: sau `1.e4 e5 2.Nf3 Nc6 3.Bc4` (Đen đi) và một số FEN riêng cho nhập thành / phong cấp / phân biệt.

| Câu nói (transcript) | Lượt | Kỳ vọng |
|---|---|---|
| `mã f6` | b | Nf6 |
| `Mã F6` | b | Nf6 |
| `ngựa ép sáu` | b | Nf6 |
| `knight f6` | b | Nf6 |
| `night f6` | b | Nf6 |
| `november foxtrot six` | b | Nf6 |
| `g8 f6` | b | Nf6 |
| `gờ tám đến ép sáu` | b | Nf6 |
| `tượng xê năm` | b | Bc5 |
| `bishop c5` | b | Bc5 |
| `tượng c 5` | b | Bc5 |
| `d6` | b | d6 |
| `tốt dê sáu` | b | d6 |
| `pawn d6` | b | d6 |
| `delta six` | b | d6 |
| `hậu e7` | b | Qe7 |
| `queen to e7` | b | Qe7 |
| `vua e7` | b | Ke7 |
| `mã d4` | b | Nd4 (chỉ Nc6 tới được) |
| `mã ăn d4` | b | unknown→không hợp lệ (d4 trống) |
| (FEN có 2 mã tới d2) `mã d2` | w | 2 matches → hỏi lại |
| `mã b d2` | w | Nbd2 |
| `mã bê đến dê hai` | w | Nbd2 |
| `knight b d2` | w | Nbd2 |
| `mã f d2` | w | Nfd2 |
| (FEN có 2 xe tới e1) `xe 1 e1` | w | R1e1 |
| `xe a e1` | w | Rae1 |
| (FEN tốt e4 ăn d5) `ăn d5` | w | exd5 |
| `tốt ăn d5` | w | exd5 |
| `e ăn d5` | w | exd5 |
| `e takes d5` | w | exd5 |
| `exd5` | w | exd5 |
| `e d5` | w | exd5 |
| `e4 d5` | w | exd5 |
| (FEN nhập thành) `nhập thành gần` | w | O-O |
| `nhập thành cánh vua` | w | O-O |
| `castle short` | w | O-O |
| `kingside castle` | w | O-O |
| `nhập thành xa` | w | O-O-O |
| `queenside` | w | O-O-O |
| `nhập thành` (cả 2 hợp lệ) | w | 2 matches |
| `nhập thành` (chỉ O-O hợp lệ) | w | O-O |
| (FEN tốt e7, Trắng) `e8 phong hậu` | w | e8=Q |
| `e8` | w | e8=Q (mặc định hậu) |
| `e7 e8 phong mã` | w | e8=N |
| `e8 equals knight` | w | e8=N |
| `promote to rook e8` | w | e8=R |
| `tháo bịt mắt` | - | command PEEK |
| `cho xem bàn cờ đi` | - | command PEEK |
| `show me the board` | - | command PEEK |
| `quân ở đâu` | - | command LOCATE |
| `vị trí các quân` | - | command LOCATE |
| `nhắc lại` | - | command REPEAT |
| `máy vừa đi gì` | - | command REPEAT |
| `xin thua` | - | command RESIGN |
| `đúng` / `ừ` / `ok` / `yes` | - | CONFIRM_YES |
| `sai` / `không` / `no` / `hủy` | - | CONFIRM_NO |
| `xe xe ba` (R→c3 hợp lệ) | w | Rc3 |
| `mã xe ba` (N→c3 hợp lệ) | w | Nc3 |
| `xe e1` | w | Re1 |
| `hello world` | - | unknown |
| `` (rỗng) | - | unknown |

## Phụ lục B — Bộ test đọc nước đi (`speak-move`), `announceCaptures=false`, cột kiểu Việt

| SAN | Kỳ vọng chuỗi TTS |
|---|---|
| `e4` | `Tốt e 4` |
| `Nf3` | `Mã ép 3` |
| `Bxe5` | `Tượng e 5` |
| `exd5` | `Tốt e, dê 5` |
| `Nbd2` | `Mã bê, dê 2` |
| `R1e1` | `Xe 1, e 1` |
| `O-O` | `Nhập thành gần` |
| `O-O-O` | `Nhập thành xa` |
| `e8=Q` | `Tốt e 8, phong Hậu` |
| `dxc8=N+` | `Tốt dê, xê 8, phong Mã` |
| `Qh5#` | `Hậu hát 5` |

Với `announceCaptures=true`: `Bxe5` → `Tượng ăn Tốt e 5`; `Qh5#` → `Hậu hát 5, chiếu hết`; `exd6` (en passant) → `Tốt e ăn dê 6, bắt tốt qua đường`.

(Dấu phẩy chỉ để TTS ngắt; test so sánh sau khi bỏ dấu phẩy và gộp khoảng trắng.)

---

## 16. Nhật ký quyết định khi triển khai

Những chỗ đặc tả chưa nói rõ hoặc phải điều chỉnh khi code, theo nguyên tắc "đơn giản hơn, an toàn hơn cho người bịt mắt":

| Chủ đề | Quyết định | Lý do |
|---|---|---|
| Mức Elo < 1320 | Skill 0 + MultiPV lớn + chỉ thay bằng nước kém hơn (mục 6.2) | Bảng cũ (Skill 1–5) làm mức 1300 mạnh hơn 1600 khi đo thực tế |
| Lệnh test | `node --test "tests/**/*.test.js"` (qua `npm test`) | Node 22 không nhận thư mục làm tham số `--test` |
| `vendor/stockfish/package.json` | `{"type":"commonjs"}` | `package.json` gốc có `"type":"module"` làm Node đọc sai file Stockfish; trình duyệt không bị ảnh hưởng |
| URL engine | `stockfish-19-lite-single.js?v=19.0.1#<url .wasm?v=19.0.1>` | stockfish.js đọc đường dẫn `.wasm` từ phần `#`; `?v=` tránh cache cũ |
| Playwright trong e2e | Nạp bằng `createRequire(import.meta.url)('playwright')` | `import` ESM không dùng `NODE_PATH` (nơi Playwright được cài trong môi trường cloud) |
| Tên file PGN | `co-mu-YYYY-MM-DD-HHmm.pgn` (không dấu) | Tên có dấu dễ lỗi khi tải trên một số trình duyệt/hệ điều hành |
| Lệnh "thời gian" khi máy nghĩ | Chỉ dùng được khi tới lượt người chơi | Micro luôn tắt khi máy nghĩ (nguyên tắc an toàn); máy chỉ nghĩ ≤ 1,2 giây |
| Micro tự mở | Tự mở khi chờ "đúng/sai", khi đang xem bàn cờ (để nghe "xong"), và ở chế độ nghe liên tục | Người bịt mắt không cần chạm thêm lần nữa |
| Safari iOS | Nếu micro tự mở bị từ chối (`not-allowed`) thì im lặng, màn hình ghi "Chạm để trả lời" | iOS chỉ cho mở micro trong cú chạm; không được báo nhầm "mất quyền micro" |
| Chạm khi đang nghe | Không làm gì | Nhận dạng tự dừng khi người chơi nói xong; chạm lần hai dễ cắt ngang câu nói |
| Đồng hồ đầu ván | Bắt đầu chạy sau lời hướng dẫn "Chạm vào màn hình rồi nói nước đi" | Không trừ giờ người chơi khi máy đang nói |
| Gõ nước đi | Không hỏi xác nhận; thử SAN đúng chuẩn (phân biệt hoa thường) trước, rồi mới qua parser | Người gõ đã nhìn thấy nước mình gõ |
| Nhiều nước khớp | Đọc tối đa 3 lựa chọn, sắp theo ô xuất phát a→h | Thứ tự ổn định, dễ nghe |
| Từ không dấu | "tuong" bị bỏ (vừa là "tượng" vừa là "tướng") | Không đoán khi không chắc |
| Lệnh thêm | "tôi vừa đi gì" (`MY_LAST`) | Người chơi quên nước của chính mình |
| Cầu hòa | Đánh giá ở sức mạnh tối đa, độ sâu 12, rồi trả lại mức chơi cũ | Mức chơi thấp cho điểm đánh giá không đáng tin |
| Hộp cài đặt trong ván | Đổi xác nhận, thông báo ăn quân, cảnh báo đồng hồ, cách đọc cột, tốc độ đọc; nút "Lưu và thoát" | Không phải thoát ván để đổi cài đặt |
| `window.__blindfold` (chế độ `?test=1`) | Thêm `getCueLog`, `getMicStarts`, `setTiming`, `setClockTime`, `setSettings`, `getSettings`, `getPgn` | Để test điều khiển thời gian, đồng hồ, cài đặt |
| Công cụ | `tools/measure-strength.mjs` (đo độ mạnh), `tools/screenshots.mjs` (chụp màn hình) | Phục vụ tinh chỉnh và báo cáo |
