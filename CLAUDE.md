# CLAUDE.md — Quy ước làm việc trong repo này

Dự án: **trang web chơi cờ mù với Stockfish**. Đặc tả đầy đủ ở `PLAN.md`. Đọc `PLAN.md` trước khi làm bất cứ việc gì. Nếu `PLAN.md` và file này mâu thuẫn, `PLAN.md` thắng về tính năng, file này thắng về quy ước code.

## Nguyên tắc cứng

1. **Không có bước build.** Không bundler, không transpiler, không framework, không `node_modules` lúc chạy. Upload repo lên GitHub Pages là chạy. Nếu thấy mình muốn thêm Vite/React/TypeScript: dừng lại, không làm.
2. **JavaScript thuần, ES modules** (`<script type="module">`), chạy trực tiếp trong Chrome/Edge/Safari hiện đại. Không dùng cú pháp cần transpile.
3. **Thư viện bên thứ ba nằm trong `vendor/`**, commit vào repo, kèm LICENSE. Không `import` từ CDN lúc chạy.
4. **Mọi chuỗi tiếng Việt** (UI và câu TTS) nằm trong `js/i18n/vi.js`. Không hard-code chuỗi hiển thị ở nơi khác.
5. **Logic tách khỏi DOM.** Parser, speak-move, elo, clock, hints, game là module thuần, test được bằng `node --test`. DOM và API trình duyệt chỉ ở `js/main.js`, `js/ui/*`, `js/speech/recognition.js`, `js/speech/tts.js`, `js/storage.js`.
6. **An toàn cho người bịt mắt:** mọi phản hồi quan trọng phải có âm thanh (TTS hoặc bíp). Mic không bao giờ bật khi TTS đang đọc hoặc máy đang nghĩ. Không bao giờ tự đoán khi có ≥ 2 nước đi khớp câu nói.
7. **Chưa test xanh thì chưa xong.** Xem `PLAN.md` mục 14. Không skip test, không sửa test để qua, không `sleep` cố định thay cho chờ sự kiện.

## Chạy và kiểm thử

```bash
# Chạy local (bắt buộc qua HTTP, không mở file://)
python3 -m http.server 8080
# → http://localhost:8080        (chơi thật)
# → http://localhost:8080/?test=1 (có window.__blindfold để test)

# Test đơn vị (Node >= 18) — Node 22 không nhận thư mục, phải dùng glob (đã có trong npm script)
npm test                 # = node --test "tests/**/*.test.js"

# Test đầu-cuối (Playwright + Chromium; môi trường cloud đã có sẵn, không chạy `playwright install`)
npm run test:e2e         # = node --test --test-concurrency=1 "e2e/**/*.test.js"  (~2 phút)

# Cả hai
npm run test:all

# Công cụ
node tools/measure-strength.mjs   # đo độ mạnh từng mức Elo (vài phút)
node tools/screenshots.mjs        # chụp lại docs/screenshots/
```

Trước khi commit: `npm test` phải xanh. Trước khi báo hoàn thành một bước lớn: `npm run test:all` phải xanh, rồi cập nhật `TEST-REPORT.md`.

Test e2e dùng micro và giọng đọc giả (`e2e/helpers/fakes.js`); mỗi test tự kiểm tra micro không mở sai lúc và không có lỗi console (`registerSuite` trong `e2e/helpers/app.js`).

## Cấu trúc (xem chi tiết `PLAN.md` mục 3)

- `index.html` — một trang, 4 màn hình `<section>`: setup / play / peek / gameover
- `js/main.js` — state machine ván đấu, nối module
- `js/game.js` `js/engine.js` `js/elo.js` `js/clock.js` `js/hints.js` `js/storage.js` `js/pgn.js` `js/state.js`
- `js/speech/` — `normalize.js` `parser.js` `speak-move.js` (thuần) + `recognition.js` `tts.js` (bọc API trình duyệt)
- `js/ui/` — `screens.js` `board.js` `setup-form.js` `play-hud.js` `gameover.js` `audio-cues.js`
- `js/i18n/vi.js` — mọi chuỗi
- `vendor/chess.js/` `vendor/stockfish/` — thư viện đã tải về
- `tests/` — unit, `e2e/` — Playwright (`e2e/helpers/`: server tĩnh, micro/TTS giả, tiện ích)
- `tools/` — đo độ mạnh Elo, chụp màn hình
- `TEST-REPORT.md` — báo cáo kiểm thử, cập nhật mỗi lần chạy lại toàn bộ

## Phong cách code

- Tên biến/hàm/file tiếng Anh, `camelCase`; file `kebab-case.js`.
- Mỗi module `export` rõ ràng, có JSDoc ngắn cho hàm public.
- Không class khi hàm + closure đủ dùng. Không thư viện tiện ích.
- Comment giải thích **vì sao**, không kể lại code. Comment bằng tiếng Việt hoặc tiếng Anh đều được, nhất quán trong một file.
- CSS: biến trong `:root`, mobile-first, không preprocessor.
- Lỗi phải hiện cho người dùng bằng tiếng Việt dễ hiểu và có âm thanh; không nuốt lỗi im lặng; `console.error` kèm context.

## Git

- Làm việc trên nhánh được chỉ định trong phiên; không push nhánh khác.
- Commit nhỏ theo từng bước ở `PLAN.md` mục 12; message mô tả việc làm được (ví dụ `Thêm parser nước đi tiếng Việt + 120 test`).
- Không commit `node_modules`, file tạm, ảnh chụp ngoài `docs/screenshots/`.
- Không tạo pull request nếu người dùng không yêu cầu.

## Những điều đã kiểm chứng (đừng kiểm lại, đừng đổi)

- `stockfish@19.0.1` → dùng `bin/stockfish-19-lite-single.js` + `.wasm` (1,9 MB), chạy trên host tĩnh, không cần COOP/COEP.
- Engine này: `UCI_Elo` min **1320** max 3190; `Skill Level` 0–20; `Threads` cố định 1. Dưới 1320 phải mô phỏng (xem `PLAN.md` mục 6.2).
- Trong Node, engine dùng `engine.processCommand(cmd)` và `engine.listener = fn`; trong trình duyệt dùng `Worker.postMessage` / `onmessage`.
- `chess.js@1.4.0` ESM: `dist/esm/chess.js`, `import { Chess } from ...`.
- Playwright + Chromium có sẵn trong môi trường cloud: `require('playwright')`, `chromium.launch()`. Nếu dự án pin phiên bản khác thì dùng `executablePath: '/opt/pw-browsers/chromium'`.
- Playwright cài toàn cục qua `NODE_PATH`, mà `import` ESM không đọc `NODE_PATH` → trong e2e nạp bằng `createRequire(import.meta.url)('playwright')`.
- `vendor/stockfish/package.json` (`"type":"commonjs"`) là bắt buộc để Node chạy được Stockfish khi `package.json` gốc có `"type":"module"`. Đừng xóa.
- Trong một tiến trình Node chỉ khởi tạo được **một** bản Stockfish; dùng chung cho nhiều vai.
- UCI_Elo 1320 ≈ Skill Level 0. Mức < 1320 không được dùng Skill > 0 (xem `PLAN.md` mục 6.2 và mục 16).

## Khi gặp điều chưa rõ

Chọn phương án **đơn giản hơn, an toàn hơn cho người bịt mắt**, ghi quyết định vào `PLAN.md` (mục liên quan) trong cùng commit, rồi tiếp tục. Không dừng lại chờ hỏi nếu `PLAN.md` đã đủ để quyết.
