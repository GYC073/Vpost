# NEXT — Handoff note (session 27, 2026-06-04)

## Trạng thái

✅ **ĐÃ FIX XONG + VERIFY END-TO-END.** Sáng 04/06 không có bài auto → tìm ra 2 lỗi, sửa hết, đã đăng 1 bài auto lên Facebook thật (post id `1031327383407406_122108100009293478`, status `posted`). App ổn định. Đang chờ Meta App Review.

---

## Session 27 — Auto-post chết, đã sửa (2026-06-04)

### Nguyên nhân gốc (2 lỗi chồng nhau)
1. **Token cron lệch SCHEDULER_SECRET** — đây là lỗi chính khiến sáng nay không có bài:
   - Function giữ `SCHEDULER_SECRET = vpost_sched_2025_k9mX3pQzRnLw` (đúng).
   - Nhưng 2 cron gửi token KHÁC: `vpost-auto-generate` gửi 1 chuỗi lệch, `vpost-fb-scheduler` gửi `b606272eeb922e317ef8e9c9d8861f36`.
   - → Cả 2 function trả **401 `{"error":"unauthorized"}`** mỗi lần cron chạy. Tức KHÔNG CHỈ auto-generate chết mà fb-scheduler (đăng bài theo lịch) cũng chết — soi `net._http_response` thấy 401 mỗi 5 phút.
2. **Bug cắt emoji trong caption history** — lỗi lộ ra sau khi sửa auth:
   - `h.caption.slice(0, 80)` cắt theo UTF-16 code unit → xẻ đôi emoji → surrogate lẻ → Anthropic trả **400 "no low surrogate in string"** → caption không sinh được.

### Đã sửa (đều đã APPLY lên production)
- ✅ Rewrite cả 2 pg_cron (`vpost-auto-generate` 30 1 * * *, `vpost-fb-scheduler` */5) → dùng chung `Bearer vpost_sched_2025_k9mX3pQzRnLw` + thêm `timeout_milliseconds := 30000` (function gọi Claude/FB hay >5s, mặc định pg_net timeout 5s làm mất log response).
- ✅ Set lại `SCHEDULER_SECRET` ở Dashboard (digest không đổi → xác nhận giá trị đúng vốn là chuỗi này).
- ✅ Sửa bug surrogate: `[...h.caption].slice(0,80).join('')` (cắt theo code-point) — **đã Deploy qua Dashboard editor**.
- ✅ File local `auto-generate-post/index.ts` còn được vá thêm: `safeTruncate()` + `stripLoneSurrogates()` (bọc system/user prompt) + auth tolerant (Bearer/x-scheduler-secret/apikey) + không skip khi cron chạy trễ. Bản local là SUPERSET của bản đang deploy.
- ✅ Verify: trigger thủ công → tạo post (status scheduled, caption thật) → fb-scheduler đăng → **status `posted`, có fb_post_id, fb_error NULL**.

### Còn nên làm (không gấp)
- [ ] Deploy bản local đầy đủ để đồng bộ repo↔production:
  `npx supabase functions deploy auto-generate-post --no-verify-jwt`
  (thêm stripLoneSurrogates làm lớp phòng thủ + auth tolerant. Bản đang chạy đã đủ để hoạt động, nhưng nên sync.)
- [ ] Commit: `auto-generate-post/index.ts`. (KHÔNG commit `supabase/fix_auto_generate_cron.sql` — đã .gitignore vì chứa secret.)
- [ ] Sáng mai 08:30 VN: xác nhận cron tự chạy tạo bài (giờ secret đã khớp).

---

## Session 27 (tiếp) — Caption đa dạng hơn (chống lặp khuôn)

**Vấn đề:** caption bị lặp *khuôn* (không phải từ ngữ). Bằng chứng từ caption_history: mở bài cứ lặp "Sự thật...", "Chuyện nhỏ mà dễ bị bỏ qua...", "Hôm nay mình muốn nghe từ bạn...".

**Gốc:**
- `generate-caption`: ép "3 cách mở đầu theo thứ tự cố định" → caption 2 luôn mở bằng "sự thật".
- `auto-generate-post`: chủ đề gán cứng theo thứ trong tuần + 1 tone cố định → lặp nhịp tuần.

**Đã sửa + deploy (qua Dashboard editor):**
- `generate-caption`: thay 3-mở-bài-cố-định → menu 10 góc mở bài (model tự chọn 3 khác nhau) + cấm các cụm nhàm + seed ngẫu nhiên mỗi lần gọi.
- `auto-generate-post`: chủ đề chọn NGẪU NHIÊN (không theo thứ) + thêm pool OPENING_ANGLES random mỗi ngày + cấm cụm nhàm + seed. Verify chạy sạch (200, errors:0).

**Drift cần biết:** bản local `index.ts` của 2 function này là canonical (đầy đủ hardening + diversity, auto-generate dùng `TOPIC_POOL` 12 mục). Bản đang deploy chỉ có các edit nhắm đích (auto-generate vẫn giữ `WEEKLY_TOPICS` 7 mục + OPENING_ANGLES inline). Khi rảnh, `npx supabase functions deploy generate-caption` và `... auto-generate-post --no-verify-jwt` để sync hẳn.

**Cách Ben tự kiểm chứng:** vào app → tạo caption 2-3 lần liên tiếp → mở bài/giọng sẽ khác nhau. Bài auto mai cũng sẽ khác hôm nay (chủ đề + giọng random).

---

## (cũ) Session 26

---

## Đã xong trong session 26

- ✅ **Fix settings.html**: toàn bộ script block (renderFB, applySettingsUI, DOMContentLoaded...) bị đặt SAU `</html>` → Chrome không chạy → FB status mãi "Đang kiểm tra...", shop name/plan không load từ Supabase. Fix: move `</body></html>` về đúng cuối file. File còn bị truncate giữa chừng — đã khôi phục đầy đủ.
- ✅ **Deploy `auto-generate-post`**: function commit ngày 31/05 nhưng chưa bao giờ deploy → pg_cron gọi lên thì 404 → không có bài auto nào từ 29/05 đến 03/06 (6 ngày trống). Sau deploy hôm nay, cron sẽ chạy lần đầu ngày mai **08:30 VN**.

---

## Ngày mai cần kiểm tra (2026-06-04)

1. Vào app.html hoặc calendar.html xem có bài auto được tạo lúc ~10h VN không
2. Nếu có bài nhưng chưa đăng Facebook → fb-scheduler sẽ pick up trong 5 phút
3. Nếu không có bài → check fb_api_log + Supabase Edge Function logs

---

## Hạ tầng

- `vpost-auto-generate` pg_cron: chạy 01:30 UTC (08:30 VN) hằng ngày — gọi `auto-generate-post` edge function
- `vpost-fb-scheduler` pg_cron: */5 phút — post scheduled → Facebook
- `vpost-recover-stuck` pg_cron: */30 phút — recover posts bị stuck ở 'posting'
- FB token: còn ~59 ngày
- Kho Nệm Giá Tốt: `auto_post_enabled = true`, plan Pro ✓

---

## Backlog

- [ ] **Thông báo đăng bài thất bại** — email/Zalo khi post failed
- [ ] **Chờ Meta App Review** — sau khi approve: switch app sang Live mode, onboard 3-5 khách đầu tiên
