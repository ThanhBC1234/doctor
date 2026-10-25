# Báo cáo kiểm thử — Cờ mù

- **Ngày:** 25/10/2026
- **Mã nguồn:** nhánh `claude/optimistic-brown-wodztk`, commit chứa báo cáo này (kiểm thử chạy trên trạng thái code của commit đó)
- **Môi trường:** Node 22.22.0, Playwright 1.63.0, Chromium 153.0.8010.12 (headless), Linux

## Tóm tắt

| Lớp | Lệnh | Kết quả | Thời gian |
|---|---|---|---|
| 1. Test đơn vị | `npm test` | **348/348 đạt** | 25 giây |
| 2. Test trình duyệt E1–E20 (+ bổ sung) | `npm run test:e2e` | **39/39 đạt** | |
| 3. Ván đấu tự động trọn vẹn | (trong `npm run test:e2e`) | **3/3 đạt** | |
| Tổng lớp 2 + 3 | `npm run test:e2e` | **42/42 đạt**, chạy 3 lượt liên tiếp, không có test chập chờn | ~100 giây/lượt |
| 4. Ảnh màn hình | `node tools/screenshots.mjs` | 12 ảnh (điện thoại + máy tính) | |

Sau mỗi test trình duyệt, bộ test tự kiểm tra hai điều: **không có lỗi console** và **micro không bao giờ mở khi máy đang đọc, đang nghĩ hoặc chưa tới lượt người chơi** (E17).

## Lớp 1 — Test đơn vị (348)

| File | Số test | Nội dung |
|---|---|---|
| `tests/parser.test.js` | 253 | 222 câu nói mẫu (tiếng Việt, tiếng Anh, NATO, tọa độ, SAN, phân biệt quân, ăn quân, bắt tốt qua đường, nhập thành, phong cấp, lệnh, câu rác); chế độ xác nhận; nhiều phương án nhận dạng; **kiểm tra vòng**: mọi nước hợp lệ trong ~1.000 thế cờ, máy đọc ra rồi parser phải hiểu lại đúng nước đó và chỉ nước đó (4 cách đọc) |
| `tests/engine.test.js` | 26 | Stockfish thật trong Node: mức 1000/1300/1400/2500 × 5 thế cờ (khai cuộc, trung cuộc, tàn cuộc, phong cấp, chỉ 1 nước), hết nước, đánh giá thế cờ, tìm chiếu hết 1 nước, phân tích dòng `info`, chọn nước ở mức thấp |
| `tests/speak-move.test.js` | 21 | Phụ lục B của PLAN, cả hai chế độ thông báo ăn quân, NATO, đọc vị trí quân |
| `tests/game.test.js` | 15 | Chiếu hết, pat, lặp 3 lần, luật 50 nước, không đủ lực, xin thua, hòa, hết giờ (kể cả đối phương không đủ lực → hòa), khôi phục ván, PGN |
| `tests/normalize.test.js` | 14 | Bỏ dấu, dấu thanh kiểu cũ, tách cụm dính, xung đột "xe" (quân Xe / cột c), "b", "to/two" |
| `tests/clock.test.js` | 8 | Trừ giờ, increment, tạm dừng, hết giờ đúng một lần, lưu/khôi phục |
| `tests/elo.test.js` | 6 | Mọi mức 1000→2500 cho tham số hợp lệ; mức < 1320 không mạnh hơn 1320 |
| `tests/hints.test.js` | 5 | 1 lần xem, 2 lần hỏi vị trí, lưu/khôi phục |

## Lớp 2 — Test trình duyệt (39)

Micro và giọng đọc được thay bằng bản giả điều khiển từ test (`e2e/helpers/fakes.js`). Test chạm vào màn hình thật, micro giả trả về câu nói, phần còn lại (parser, Stockfish thật chạy WebAssembly, đồng hồ, lưu trữ, giao diện) chạy như thật.

| Mã | Kịch bản | Kết quả |
|---|---|---|
| E1 | Mở trang, engine tải xong, nút Bắt đầu bật, không lỗi console | ✅ |
| E2 | Bắt đầu qua form cài đặt; bàn cờ không có trên màn hình chơi | ✅ |
| E3 | "e4" → "Tốt e 4. Đúng không?" → "đúng" → máy đi và đọc đúng nước | ✅ |
| E4, E4b | "sai" → hủy; im lặng 2 lần khi xác nhận → hủy; thế cờ không đổi | ✅ |
| E5 | "hậu h5" ở khai cuộc → "Nước đi không hợp lệ: Hậu hát 5"; câu vô nghĩa → "Không hiểu" | ✅ |
| E6 | "mã d2" khi 2 mã cùng tới → máy liệt kê và hỏi lại; "mã bê đến dê hai" → đi đúng Nbd2 | ✅ |
| E7, E7b | Tắt xác nhận (ở form và trong hộp Cài đặt giữa ván) → đi ngay | ✅ |
| E8 | 3 phương án nhận dạng, chỉ phương án 2 hợp lệ → nhận đúng | ✅ |
| E9, E9b, E9c | Xem bàn cờ: hiện bàn cờ đúng, đếm ngược + bíp, tự che; nói "xong" hoặc chạm để che sớm; lần 2 bị từ chối | ✅ |
| E10 | Hỏi vị trí 2 lần, so khớp từng quân với thế cờ thật, không có tốt; lần 3 từ chối | ✅ |
| E11, E11b, E11c | Nhắc lại, tôi vừa đi gì, đọc lại ván, trợ giúp, thời gian, tạm dừng/tiếp tục, cầu hòa sớm bị từ chối | ✅ |
| E12, E12b | Hết giờ → thua, màn kết thúc, micro tắt; cảnh báo "Còn một phút" + bíp 10 giây cuối | ✅ |
| E13, E13b | Xin thua có xác nhận; đổi ý "không" thì ván tiếp tục; PGN `Result "0-1"`, tải file được | ✅ |
| E14a/b/c | Máy chiếu hết người; người chiếu hết máy; hòa lặp 3 lần; danh sách nước đúng, xem lại từng nước, PGN đọc lại được, link Lichess, chơi lại | ✅ |
| E15, E15b | Tải lại trang giữa ván → tiếp tục đúng thế cờ, quyền trợ giúp, đồng hồ (lệch < 2 giây); bỏ ván cũ | ✅ |
| E16 | Cầm Đen → máy đi trước, đọc nước trước khi micro mở | ✅ |
| E17 | Chuỗi dài có lỗi, hỏi lại, xác nhận, chạm khi máy đang nghĩ → micro không mở sai lúc (và kiểm tra này chạy sau **mọi** test) | ✅ |
| E18 | Bật thông báo: "Tốt dê ăn Tốt e 4", "Hậu hát 4, chiếu hết" | ✅ |
| E19, E19b | Điện thoại 390×844: không tràn ngang, vùng chạm ≥ 60% chiều cao, chữ ≥ 24px, chạm để nói, bàn cờ vừa màn hình; manifest PWA + icon | ✅ |
| E20 | Phím Space mở micro | ✅ |
| Bổ sung | Bấm trợ giúp khi máy nghĩ → "Chờ máy đi xong", không mất lượt | ✅ |
| Bổ sung | Trình duyệt không có nhận dạng giọng nói → cảnh báo, ô gõ mở sẵn, chơi bằng gõ | ✅ |
| Bổ sung | Gõ nhiều nước SAN liên tiếp | ✅ |
| Bổ sung | Chế độ nghe liên tục: micro tự mở lại, im lặng không bị nhắc | ✅ |
| Bổ sung | Chạm để nói mà im lặng → "Không nghe thấy gì", micro không tự mở | ✅ |
| Bổ sung | Micro bị từ chối quyền → cảnh báo + báo bằng giọng | ✅ |
| Bổ sung | Giả lập Safari iOS: micro tự mở bị từ chối → không báo nhầm, chạm để trả lời vẫn chơi tiếp | ✅ |

## Lớp 3 — Ván đấu tự động trọn vẹn (3)

"Người chơi" chọn nước ngẫu nhiên (tránh nước để bị chiếu hết ngay), nói bằng câu tiếng Việt do máy tạo ra, đi qua đúng đường micro → parser → Stockfish → giọng đọc. Mỗi nước đều được kiểm tra là đúng nước định nói.

| Ván | Cài đặt | Kết quả (lượt chạy cuối) | Nước chậm nhất |
|---|---|---|---|
| 1 | Elo 1000, cầm Trắng, đọc cột kiểu Việt, không xác nhận | 40 nửa nước, máy chiếu hết | 0,14 s |
| 2 | Elo 1800, cầm Đen, đọc cột NATO, có xác nhận | 41 nửa nước, máy chiếu hết | 0,96 s |
| 3 | Elo 2500, cầm Trắng, có thông báo ăn quân | 40 nửa nước, máy chiếu hết | 1,35 s |

Sau mỗi ván: dựng lại từ danh sách nước cho ra cùng thế cờ, PGN đọc lại được, kết quả trong PGN khớp.

## Độ mạnh các mức Elo

`node tools/measure-strength.mjs`: với 100 thế cờ khai cuộc/trung cuộc, đo mức mất điểm trung bình mỗi nước so với nước tốt nhất (Stockfish độ sâu 10). Số càng lớn, máy càng yếu.

| Mức | Mất điểm trung bình / nước | Nước hỏng nặng (≥ 2 tốt) |
|---|---|---|
| 1000 | 133 cp | 18% |
| 1150 | 129 cp | 20% |
| 1300 | 80 cp | 9% |
| 1350 | 88 cp | 14% |
| 1800 | 75 cp | 10% |
| 2500 | 50 cp | 4% |

Trong lần đo đầu, mức 1300 mạnh hơn mức 1600 vì thiết kế ban đầu dùng Skill Level 1–5. Lỗi đã được sửa (xem `PLAN.md` mục 6.2 và 16). Số đo có nhiễu khoảng ±15 cp. Mức 1300 và 1350 gần như ngang nhau, đúng ý đồ là nối liền hai dải.

## Lớp 4 — Ảnh màn hình

Thư mục `docs/screenshots/`, mỗi màn hình có bản điện thoại (`mobile-*`) và máy tính (`desktop-*`):

| Màn hình | Điện thoại |
|---|---|
| Cài đặt | ![](docs/screenshots/mobile-1-setup.png) |
| Đang chơi (bàn cờ ẩn) | ![](docs/screenshots/mobile-2-play.png) |
| Đang nghe | ![](docs/screenshots/mobile-3-listening.png) |
| Chờ xác nhận | ![](docs/screenshots/mobile-4-confirm.png) |
| Tháo bịt mắt 10 giây | ![](docs/screenshots/mobile-5-peek.png) |
| Kết thúc ván | ![](docs/screenshots/mobile-6-gameover.png) |

Khi xem ảnh, mình đã phát hiện và sửa 3 lỗi giao diện: hàng trống trên bàn cờ bị bẹp, danh sách nước đi thiếu số thứ tự, và khi đang nghe vẫn hiện câu nói cũ.

## Những gì máy CHƯA kiểm được — cần anh tự thử (khoảng 5 phút)

Môi trường kiểm thử tự động không có micro và loa thật, nên **độ chính xác nhận dạng giọng tiếng Việt của Google/Apple** và **giọng đọc thật** chưa được kiểm. Phần này cần anh thử trên điện thoại:

1. Mở trang (GitHub Pages, HTTPS) bằng **Chrome trên Android** hoặc **Safari trên iPhone**. Cho phép micro.
2. Bắt đầu ván mặc định (Trắng, 1400, có xác nhận). Nghe câu chào bằng tiếng Việt.
3. Chạm màn hình, nói lần lượt: **"e bốn"**, **"mã ép ba"**, **"tượng xê bốn"**. Mỗi lần trả lời **"đúng"**. Ghi lại câu nào máy nghe sai (dòng "Nghe được: …" trên màn hình cho biết máy nghe thành gì).
4. Thử kiểu NATO: **"knight charlie three"** (hoặc "mã charlie ba").
5. Nói **"xem bàn cờ"**: bàn cờ hiện 10 giây rồi tự che.
6. Nói **"quân ở đâu"**: nghe đọc vị trí các quân.
7. Nói **"xin thua"** → **"đúng"**: màn kết thúc hiện, bấm **Tải PGN**.
8. Tắt màn hình hoặc chuyển ứng dụng giữa ván, mở lại: phải có nút **Tiếp tục**.

Nếu câu nào hay bị nghe sai, gửi lại cho mình dòng "Nghe được: …" để thêm từ đó vào bảng nhận dạng (`js/speech/normalize.js`).

Riêng **Safari iOS**: iOS chỉ cho mở micro khi người dùng chạm. Vì vậy khi máy hỏi "Đúng không?", trên iPhone có thể phải **chạm thêm một lần** rồi mới trả lời. Màn hình sẽ ghi "Chạm để trả lời".
