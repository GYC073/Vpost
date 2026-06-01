# NEXT — Handoff note (session 25, 2026-06-01)

## Trạng thái: Đèn đỏ → Chờ đèn xanh 🚦

App hoàn chỉnh. Đang chờ Meta App Review approve để mở ra cho tất cả user (không chỉ Tester).

---

## Đã xong trong session 25

- ✅ **Fix auto-post cron**: pg_cron dùng `current_setting()` không có giá trị → 401 mỗi ngày. Fix: hardcode SCHEDULER_SECRET trong command (giống fb-scheduler). Verified: function trả về `ok: true`.
- ✅ **Fix FB checklist trên dashboard**: `.select('id')` trên `fb_connections` (không có cột id) → sửa thành `.select('user_id')`. User mới sẽ thấy tick đúng.
- ✅ **Fix plan date trong settings**: hardcoded "15/06/2025 · Còn 30 ngày" → load dynamic từ Supabase, tính đúng ngày còn lại, hiển thị "Vĩnh viễn" nếu plan Pro dài hạn.
- ✅ **Fix landing scroll animation**: threshold 0.12 → 0.05, thêm rootMargin. Hết blank spaces khi scroll nhanh.

---

## Khi Meta approve — làm ngay

1. Switch FB App từ Development → Live mode
2. Onboard 3-5 khách đầu tiên thủ công (Zalo trực tiếp)
3. Ngồi cùng họ qua onboarding, ghi lại chỗ mắc
4. Thu feedback sau tuần đầu → iterate

---

## Backlog (sau khi có user thật + revenue)

- [ ] **Thông báo đăng bài thất bại** — email/Zalo khi post failed
- [ ] **Admin: xem fb_api_log chi tiết** — debug lỗi đăng bài
- [ ] **Onboarding nhắc kết nối FB** — wizard step 4 chưa redirect đúng cho user mới
- [ ] **Zalo OA** — kênh thông báo + chăm sóc khách sau khi có revenue đầu tiên

---

## Hạ tầng ổn định

- Auto-post cron: `vpost-auto-generate` chạy 8:30 VN (01:30 UTC) ✅
- FB scheduler: `vpost-fb-scheduler` */5 phút ✅
- pg_cron recover stuck: */30 phút ✅
- Kho Nệm Giá Tốt đang dùng thật, `auto_post_enabled = true` ✅
