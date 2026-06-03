# NEXT — Handoff note (session 26, 2026-06-03)

## Trạng thái

App ổn định. Đang chờ Meta App Review approve. 2 bug lớn đã fix hôm nay.

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
