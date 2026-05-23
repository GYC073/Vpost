# Vpost — Progress Tracker

> Cập nhật mỗi khi đổi trạng thái task. Đọc file này ngay sau CLAUDE.md.

**Last updated:** 2026-05-22

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
| **4** | **FB OAuth + auto-post** | 🔨 **Đang làm** |
| 5 | Admin nâng cao + payments flow | ⏳ Chưa |
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
| 4.9 | Submit Meta App Review để xin permissions production (`pages_manage_posts`...) | ⏳ Sau khi 4.8 ổn |

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

**Còn lại — Anh Thang chạy từ terminal:**
1. Xóa git lock files (nếu còn):
   ```
   del D:\vpost\.git\index.lock
   del D:\vpost\.git\HEAD.lock
   ```
2. Commit + push tất cả:
   ```bash
   cd D:\vpost
   git add -A
   git commit -m "feat(phase4): FB OAuth working, migration 003 applied, fix truncated files"
   git push origin main
   ```
3. Deploy edge functions (fb-post và fb-scheduler chưa deploy):
   ```bash
   npx supabase functions deploy fb-oauth-exchange
   npx supabase functions deploy fb-post
   npx supabase functions deploy fb-scheduler --no-verify-jwt
   ```
4. → Phase 4.9: Submit Meta App Review.

---

## Pending / chưa schedule

- Admin panel: chưa có chức năng xem fb_api_log để debug.
- Onboarding wizard: chưa nhắc user kết nối FB.
- Phase 5: payments flow + admin nâng cao.

---

## Git status snapshot (2026-05-22 — sau session 