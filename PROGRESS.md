# Vpost — Progress Tracker

> Cập nhật mỗi khi đổi trạng thái task. Đọc file này ngay sau CLAUDE.md.

**Last updated:** 2026-05-25 (session 4)

---

## Tổng quan các Phase

| Phase | Tên | Status |
|---|---|---|
| 1 | Landing + design system | ✅ Done |
| 2 | Supabase auth (email + phone) | ✅ Done |
| 3 | AI caption (Claude Haiku qua Edge Function) | ✅ Done |
| 3.5 | Posts migration sang Supabase + Storage upload | ✅ Done |
| 3.6 | Video slideshow + calendar đọc real posts | ✅ Done |
| 3.7 | Sidebar Video tab + mobile nav đồng nhất | ✅ Done |
| 6 | Pháp lý: privacy / terms / data-deletion (cho Meta App Review) | ✅ Done |
| 6.1 | Fix terms 4.3 — thanh toán Zalo cho beta | ✅ Done |
| — | Domain vpost.vn (DNS-only OneShield) | ✅ Done |
| — | SSL Let's Encrypt cho vpost.vn | ✅ Done (verified vpost.vn + privacy/terms/data-deletion load OK qua HTTPS) |
| 4 | FB OAuth + auto-post | ✅ Done (chờ Meta Business Verification) |
| **5** | **Payments flow + Admin nâng cao** | 🔨 **Đang làm** |
| 7 | Scheduler cron Edge Function | ⏳ Chưa (gộp vào Phase 4.7) |

---

## Phase 4 — FB OAuth + auto-post (chi tiết)

| Sub | Mô tả | Status |
|---|---|---|
| 4.0 | Migration `003_fb_integration.sql` (fb_connections, fb_pages, fb_api_log, RPCs, triggers) | ✅ Done — chạy via Supabase Management API (session 2026-05-23) |
| 4.1 | **Tạo FB App trên Meta for Developers** — lấy App ID + Secret, set OAuth Redirect URI = `https://vpost.vn/fb-callback.html` | 🔴 **User action cần làm** |
| 4.2 | Edge Function `fb-oauth-exchange` (code → long-lived token → upsert DB) | ✅ Code xong, **chờ deploy** |
| 4.3 | Frontend: `js/fb-client.js` + `fb-callback.html` + UI trong `pages/settings.html` | ✅ Code xong |
| 4.4 | Edge Function `fb-post` (post bài lên active page, log, update status) | ✅ Code xong, **chờ deploy** |
| 4.5 | Set Supabase Secrets: `FB_APP_ID`, `FB_APP_SECRET` | 🔴 **User action cần làm** (sau 4.1) |
| 4.6 | UI integration: `pages/caption.html` 3 nút "Lưu nháp / Đăng ngay / Lên lịch" + banner FB; calendar highlight posts có `fb_post_id` + badge | ✅ Code xong |
| 4.7 | Edge Function `fb-scheduler` (cron 5 phút) + migration 004 (status='posting' + updated_at + recover_stuck_posts) | ✅ Code xong, **chờ deploy + setup pg_cron** |
| 4.8 | Test end-to-end với 1 page thật, fix bug | ✅ **OAuth kết nối thành công** — "Kho Nệm Giá Tốt - Quảng Trị" đã connect (session 2026-05-23) |
| 4.9 | Submit Meta App Review để xin permissions production (`pages_manage_posts`...) | 🔨 **Đang làm** — form điền xong, chờ API counter cập nhật (tối đa 24h) rồi submit |

### Blocker hiện tại
- **4.2 + 4.4 + 4.7**: cần deploy edge functions từ terminal local.
- Sau deploy → test E2E (4.8).

### Next concrete step (cập nhật 2026-05-23 session 2)
✅ 4.1 — FB App tạo xong, App ID = `1765513901484406`
✅ 4.5 — Supabase Secrets: FB_APP_ID, FB_APP_SECRET, SCHEDULER_SECRET đã set
✅ migration 003 — **chạy xong** via Supabase Management API (tables: fb_connections, fb_pages, fb_api_log, RLS, RPCs)
✅ migration 004 — đã chạy (status 'posting', updated_at, recover_stuck_posts)
✅ pg_cron — vpost-fb-scheduler (*/5) + vpost-recover-stuck (*/30) đã tạo
✅ OAuth Redirect URI — `https://vpost.vn/fb-callback.html` đã set trong FB App
✅ FB App ID — đã điền vào fb-callback.html, pages/settings.html, pages/caption.html
✅ Bug fix session 2026-05-23:
   - `pages/caption.html` bị truncated → fix + thêm Phase 4.6 post actions
   - `pages/calendar.html` bị truncated → fix + thêm lại changeMonth/initCalendar/doLogout
   - `fb-callback.html` → thêm debug logging chi tiết
   - `supabase/functions/fb-oauth-exchange` → fix `granted_scopes` type (TEXT[] vs string)
✅ **4.8 — E2E test PASS**: "Kho Nệm Giá Tốt - Quảng Trị" kết nối Facebook thành công

### Next concrete step (cập nhật 2026-05-23 session 3)
✅ App Settings — email, privacy URL, terms URL, data deletion URL, website URL đã điền
✅ App icon 1024×1024 — đã upload lên Meta
✅ Cách sử dụng hợp lệ — 5 permissions đã điền mô tả + checkbox
✅ Xử lý dữ liệu — Supabase Inc. (US) đã thêm, các câu hỏi đã trả lời
✅ Hướng dẫn dành cho người xét duyệt — URL vpost.vn, test account, hướng dẫn đã điền
✅ Video screencast (~1:37, 11MB) — đã upload cho tất cả permissions
✅ API test calls — me/accounts, {page_id}/feed GET+POST, me/businesses đã gọi thành công

**Việc cần làm sáng mai:**
1. Vào https://developers.facebook.com/apps/1765513901484406/app-review/submissions/?submission_id=1766108834758246
2. Kiểm tra API counter đã xanh chưa (tối đa 24h sau khi gọi)
3. Bấm **"Gửi đi xét duyệt"** → Phase 4.9 hoàn tất
4. Tiếp tục Phase 5: payments flow + admin nâng cao

---

## Pending / chưa schedule

### Phase 4 — còn lại
- Admin panel: chưa có chức năng xem fb_api_log để debug.
- Onboarding wizard: chưa nhắc user kết nối FB ngay sau đăng ký.
- SCHEDULER_SECRET: cần chạy `npx supabase secrets set SCHEDULER_SECRET=vpost_sched_2025_k9mX3pQzRnLw` nếu chưa set.

### Phase 5 — Payments flow + Admin nâng cao (session 4 — 2026-05-25)

**Mô hình giá:**
- 🥉 Cơ bản: 100k/tháng — 1 bài/ngày, 1 video/ngày
- 🥈 Tiêu chuẩn: 200k/tháng — 2 bài/ngày, 2 video/ngày
- 🥇 Pro: 400k/tháng — 2 bài/ngày, 5 video/ngày
- Dùng thử 3 ngày miễn phí. Hết trial → khoá app.
- Thanh toán: MB Bank 0789434345 / Momo 0789111574 (Nguyễn Phan Đắc Thắng)

**Đã làm:**
- [x] `pages/upgrade.html` — trang chọn gói, QR VietQR động (MB Bank), QR Momo, submit vào `payments`
- [x] `locked.html` — fix giá đúng (100k/200k/400k), thêm nút "Nâng cấp ngay" → upgrade.html
- [x] `admin.html` — tab Payments kết nối Supabase thật: load, xác nhận, từ chối; fix giá modal
- [x] `pages/video.html` + `pages/caption.html` — modal upgrade khi hết quota thay vì toast đơn thuần
- [x] `assets/` folder tạo sẵn (cần thêm `qr-momo.jpg`)

**Còn lại Phase 5:**
- [ ] Admin panel: tab xem `fb_api_log` (debug FB posts)
- [ ] Admin panel: thống kê doanh thu thật từ payments approved
- [ ] Sidebar các page: hiện đúng tên gói + ngày hết hạn từ Supabase (hiện hardcode)
- [ ] `app.html` dashboard: banner "X ngày còn lại" nếu plan sắp hết hạn

**Ghi chú:**
- Momo QR: cần save `D:\vpost\assets\qr-momo.jpg` (ảnh QR Momo của Thắng)
- MB Bank QR: tự động generate via VietQR API (dynamic theo số tiền + nội dung CK)

### Phase 6 — Hoàn thiện Meta App Review (sau khi submit)
- [ ] Chờ Meta review (~5–7 ngày làm việc)
- [ ] Nếu bị reject: đọc feedback, fix và resubmit
- [ ] Sau khi approved: switch app sang Live mode
- [ ] Xác minh doanh nghiệp: hoàn thiện khi có giấy đăng ký hộ kinh doanh

### Phase 7 — Onboarding + UX
- [ ] Onboarding wizard nhắc kết nối FB sau bước 1
- [ ] Banner/tooltip hướng dẫn user mới chưa kết nối FB
- [ ] Mobile responsive kiểm tra lại sau các thay đổi Phase 4

---

## Git status snapshot (2026-05-22 — sau session 