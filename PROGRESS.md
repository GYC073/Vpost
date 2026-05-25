# Vpost — Progress Tracker

> Cập nhật mỗi khi đổi trạng thái task. Đọc file này ngay sau CLAUDE.md.

**Last updated:** 2026-05-25 (session 8)

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
| **5** | **Payments flow + Admin nâng cao** | ✅ Done |
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

**Đã làm thêm (session 5 — 2026-05-25):**
- [x] `js/sidebar.js` — load plan + days left từ Supabase, hiển thị động trên sidebar mọi page
- [x] `css/style.css` — thêm `.plan-expiry-banner`, `.system-msg-banner` styles
- [x] `app.html` — banner `#planExpiryBanner` (warn/danger ≤5 ngày) + `#systemMessageBanner` (từ admin)
- [x] `admin.html` tab Khách hàng — **kết nối Supabase thật**: loadCustomers, renderTable, toggleCustomer, openEditModal, saveCustomer, extendPlan (không còn localStorage demo)
- [x] `admin.html` tab Thanh toán — **kết nối Supabase thật**: loadPayments, confirmPayment (approve + cập nhật profiles.plan), rejectPayment
- [x] `admin.html` tab Cài đặt hệ thống — **MỚI HOÀN TOÀN**:
  - Thống kê nhanh: tổng user, đang trial, đang trả phí, doanh thu tháng, chờ xác nhận TT
  - Thông báo hệ thống: bật/tắt toggle, loại (info/warning/danger), nội dung, xem preview → hiện banner cho tất cả user
  - Giới hạn AI theo gói: bảng read-only quota mỗi gói
  - Thông tin hỗ trợ: Zalo URL + phone lưu vào Supabase
- [x] `supabase/migrations/006_app_settings.sql` — bảng `app_settings` (key-value), RLS policies, default values — **đã chạy thành công trên Supabase**
- [x] Fix nhiều lần file `admin.html` bị truncate (mất JS) — đã ổn định với 1 script block duy nhất

**Đã làm thêm (session 6 — 2026-05-25):**
- [x] `admin.html` tab Thống kê — **MỚI HOÀN TOÀN** (Chart.js 4.4):
  - Summary cards: Doanh thu tháng, Bài đã đăng FB, User mới, Kết nối Facebook
  - Biểu đồ doanh thu theo tháng (bar, 6 tháng gần nhất)
  - Biểu đồ bài đăng theo ngày (line + fill, filter 30/90/180 ngày)
  - Phân bổ gói dịch vụ (doughnut + custom legend)
  - User mới theo ngày (bar)
  - Trạng thái posts (doughnut, legend bên phải)
- [x] `admin.html` tab FB Logs — **MỚI**:
  - Load 200 log gần nhất từ `fb_api_log`
  - Filter: Tất cả / Thành công (2xx) / Lỗi (4xx/5xx)
  - Badge `!` màu vàng trên sidebar nav khi có lỗi
  - Click row expand → xem request + response JSON (dark code block)

**Phase 5: ✅ HOÀN THÀNH**

**Đã làm thêm (session 7 — 2026-05-25):**
- [x] **Fix logout signOut** trên TẤT CẢ trang: `app.html`, `pages/settings.html`, `pages/caption.html`, `pages/video.html`, `locked.html`, `admin.html` — đều gọi `window.vpostAuth.signOut()` trước khi redirect
- [x] **Fix `caption.html` truncation** — file bị cắt tại `showUpgradePrompt(typ` trong mọi commit cũ → đã reconstruct hoàn chỉnh (894 dòng)
- [x] **Fix `video.html` truncation** — tương tự, cộng thêm `doLogout()` hoàn toàn thiếu → đã thêm (1030 dòng)
- [x] **Fix `login.html`** — "Quên mật khẩu?" dead link → Zalo admin link
- [x] **Fix `onboarding.html`** — `finishOnboarding()` lưu `shop_name` + `industry` vào Supabase profiles thật
- [x] **Full UX audit** toàn bộ flow: sidebar.js, auth.js, app.js, calendar.html, supabase-client.js — không phát hiện thêm bug nghiêm trọng

**Git commits session 7:**
- `fix: signOut on all pages, locked+admin logout, onboarding save, caption/video truncation`

**Git commits session 6:**
- `a3483c3` feat: admin stats charts + FB logs tab (Phase 5 complete)

**Git commits session 5:**
- `6612e6a` feat: admin settings + payments real data; fix script duplication
- `990f9f7` feat: admin settings page - thong bao, quota, ho tro, thong ke nhanh
- `b001e8f` feat: admin customers tab -> Supabase real data
- `5d51b20` feat: sidebar dong + banner het han + Momo QR lon hon

**Ghi chú kỹ thuật quan trọng:**
- `admin.html` hay bị truncate khi Edit tool chạy trên file lớn → dùng Python để append/rewrite an toàn hơn
- Git lock file `.git/index.lock` chỉ tồn tại trong Linux sandbox, KHÔNG tồn tại trên Windows → user chỉ cần chạy git trực tiếp từ Windows CMD/PowerShell, không cần `del` gì cả
- Migration 006 đã chạy: bảng `app_settings` có 5 rows mặc định (system_message, system_message_enabled, system_message_type, support_zalo, support_phone)
- MB Bank QR: VietQR API động theo amount + note. Momo QR: ảnh tĩnh `assets/qr-momo.jpg` (đã có)

### Phase 6 — Hoàn thiện Meta App Review (sau khi submit)
- [ ] Chờ Meta review (~5–7 ngày làm việc)
- [ ] Nếu bị reject: đọc feedback, fix và resubmit
- [ ] Sau khi approved: switch app sang Live mode
- [ ] Xác minh doanh nghiệp: hoàn thiện khi có giấy đăng ký hộ kinh doanh

### Phase 7 — Onboarding + UX ✅ HOÀN THÀNH (session 8 — 2026-05-25)
- [x] **7.1** `onboarding.html` — thêm step 4 "Kết nối Facebook" (5 bước tổng): card giới thiệu lợi ích, nút "Kết nối ngay" + "Bỏ qua". Sau OAuth thành công, fb-callback redirect về `app.html?fb_connected=1`
- [x] **7.2** `app.html` — banner nhắc kết nối FB cho user chưa có `fb_connections`. Tự ẩn khi đã kết nối. Toast chào mừng khi return từ onboarding OAuth.
- [x] **7.3** Mobile responsive fix:
  - `onboarding.html`: @media 400px — circle nhỏ hơn (26px), label 9px, line 16px
  - `settings.html`: settings-row flex-wrap, fb-connect-btn compact ≤420px
  - `caption.html`: publish-grid 2 cols ≤420px, Đăng ngay lên full-width, schedule-row stack
  - `calendar.html`: @media 380px — cal-grid gap 2px, font nhỏ hơn

**Git commit session 8:** `feat: phase 7 - onboarding FB step, FB banner app.html, mobile responsive fixes`

---

## Git status snapshot (2026-05-22 — sau session 