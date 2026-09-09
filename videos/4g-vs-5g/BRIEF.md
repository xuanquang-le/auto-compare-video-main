---
workflow: general-video
flow: companion
storyboard: no
message: "So sánh 4G vs 5G — góc 'nhanh hơn trên lý thuyết, nhưng thực tế tùy hoàn cảnh' cho series 'so sánh/phân biệt kiến thức'"
destination: tiktok
aspect: 1080x1920
language: vi
length: 30-40s
---

## Intent

Video thứ ba trong series "so sánh/phân biệt kiến thức" (xem `../../DESIGN.md` cho hợp đồng
layout/màu/font/motion 3-zone dùng chung — **không lặp lại ở đây**, chỉ đổi nội dung). Đây là
bản 12 dòng / 30-40s (không phải bản 8 dòng/15-20s cũ của 2 video trước).

Cặp khái niệm: **4G vs 5G**. Góc so sánh: 5G nhanh hơn 4G rất nhiều trên lý thuyết (băng thông
cao hơn, độ trễ thấp hơn), nhưng tốc độ thật ngoài đời còn phụ thuộc vị trí, độ phủ sóng, số
người dùng chung trạm phát — không phải lúc nào cũng vượt trội rõ rệt như quảng cáo.

Nội dung dựa trên kịch bản TikTok gốc người dùng cung cấp (60s, 6 beat: hook → đặt vấn đề → so
sánh → yếu tố thực tế → ví dụ → kết luận), rút gọn về đúng khung 12 dòng / 6 beat chuẩn của
series (hook → nút thắt → giải A → giải B → so sánh trực tiếp → payoff).

## Assets

- Icon 2 card: vẽ CSS/SVG placeholder (không phụ thuộc ảnh ngoài) — cả 2 card dùng chung mô-típ
  "màn hình điện thoại": thanh sóng tín hiệu (4 vạch cho 4G, 5 vạch cao hơn cho 5G — số vạch
  khớp luôn với số thế hệ mạng), chữ to `4G`/`5G` giữa màn hình, và số tia sét bên dưới (1 tia
  cho 4G, 3 tia cho 5G) — giữ đúng tinh thần "4G ⚡ vs 5G ⚡⚡⚡" trong kịch bản gốc.
- 2 badge payoff (`#verdict-left` / `#verdict-right`) dùng ⏳ (4G) / ⚡ (5G) thay vì ✓/✕ mặc
  định của template — tránh gợi ý sai rằng 4G "sai", vì thông điệp video là "nhanh hơn nhưng
  không phải lúc nào cũng vượt trội", không phải nhị phân đúng/sai.
- Giọng đọc: **Gemini TTS** (giọng dựng sẵn `Achird`, theo yêu cầu người dùng — copy pattern
  TTS từ project `premium-text-to-video` sang, xem thêm ghi chú provider thứ 3 trong
  `scripts/generate-vo.mjs`), sinh qua `scripts/generate-vo.mjs` (đọc `.env` ở **repo root**,
  dùng chung với video khác trong series). Ban đầu thử Edge TTS trước (`vi-VN-NamMinhNeural`,
  speed 1.25x) nhưng người dùng muốn nghe thử nhiều giọng hơn trước khi chốt — đã gửi mẫu 2
  giọng Edge TTS qua chat, sau đó người dùng chọn dùng giọng Achird từ project khác thay vì
  Edge.
  **Batch mode**: 12 dòng ban đầu sinh bằng 12 lệnh gọi Gemini riêng — người dùng nghe thấy
  giọng hơi khác nhau giữa các dòng (Gemini là model sinh giọng "diễn", mỗi lần gọi API độc
  lập có thể lệch tông/tốc độ dù cùng tên giọng). Đã đổi sang **1 lệnh gọi Gemini duy nhất**
  cho cả 12 dòng nối bằng `\n\n` (đọc liền mạch → giọng đều hơn), rồi cắt thành 12 file bằng
  `ffmpeg silencedetect` tại khoảng lặng giữa các câu (xem `generateGeminiSpeechBatch` trong
  `scripts/generate-vo.mjs`). Đã thử và người dùng xác nhận nghe ổn qua Chrome trước khi
  render. Gemini free tier giới hạn 3 request/phút — script tự giãn cách và tự chờ đúng
  `retryDelay` khi bị 429. 12 clip mp3 tại `assets/vo/line-N.mp3`, thời lượng thật ghi ở
  `assets/vo/durations.json`. Phiên âm TTS: "4G" → "bốn Gờ", "5G" → "năm Gờ", "MBPS" → "mê ga
  bít" (caption trên màn hình giữ chính tả gốc). Dòng 4 và 7 đã rút gọn (bỏ "là mạng phổ biến"
  / "là thế hệ mới") để tổng thời lượng gần khung 30-40s hơn (TTS sinh nên tổng dao động nhẹ
  mỗi lần gen lại — bản cuối 42.45s).
- Nền `assets/bg-plexus.mp4`: loop riêng 46s (dài hơn bản 21s dùng cho 2 video 8-dòng cũ) vì
  composition này dài ~42.4s — xem ghi chú trong `DESIGN.md` § Background layer.

## Customizations

- Thêm 1 beat mới so với 2 video trước: "so sánh trực tiếp" (dòng 10-11) — cả 2 card về full
  opacity/scale, nhấp nháy nhẹ luân phiên trái rồi phải, không bên nào bị dim (khác beat giải
  A/B, nơi bên không active bị dim 55%).
- Avatar dùng pose "explain" (`pose(40, -40, ...)`, cả 2 tay hơi mở) cho cả beat so sánh trực
  tiếp, thay vì chỉ tay hẳn về 1 bên như beat giải A/B.

## Notes

- Kịch bản 12 dòng, nhịp `hook(2) → nút thắt(1) → giải A(3) → giải B(3) → so sánh trực tiếp(2)
  → payoff(1)`, tổng ROOT_DURATION ≈ 42.42s.
