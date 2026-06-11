# Vpost — Progress Tracker

> Cập nhật mỗi khi đổi trạng thái task. Đọc file này ngay sau CLAUDE.md.

**Last updated:** 2026-06-11 (session 29) — **Verify bài auto 08:30 11/06: ĐÃ RA nhưng có lỗi từ ngữ AI bịa** ("quần ga" thay vì "chăn ga", "chập xuống" thay vì "xẹp lún", câu đứt gãy "Cơn mưa hay thay quần ga"). Fix: thêm block "CHÍNH TẢ & TỪ NGỮ" vào prompt cả `auto-generate-post` lẫn `generate-caption` (cấm bịa từ + nêu lỗi thực tế làm ví dụ + bắt tự rà soát từng câu trước khi trả về). ⚠️ Commit `cd9264c` trong repo là bản LỖI (Edit tool truncate file — bug đã biết); bản đúng đang STAGED chờ amend. **Ben cần chạy từ Windows PowerShell:** xoá `.git\HEAD.lock` + `.git\index.lock` → `git commit --amend` → push → deploy 2 functions (`npx.cmd supabase functions deploy auto-generate-post --no-verify-jwt` + `npx.cmd supabase functions deploy generate-caption`). ⏳ Verify bài auto sáng 12/06.

**(session 28 — 2026-06-10):** — *(2 việc)* **(A) Nâng cấp caption auto-post "thật" hơn:** migration 008 (cột `voice_samples` + `contact_footer` + `auto_append_footer`) + Settings UI (ô dạy giọng/footer + checkbox) + viết lại prompt `auto-generate-post` (học giọng từ bài thật, cấm khuôn câu hỏi mở bài, bỏ CTA cứng, hashtag tùy chọn, code gắn footer liên hệ thay vì để AI bịa SĐT). Ben đã chạy migration + deploy + push + nhập giọng mẫu ở Settings. ⏳ Verify bằng bài auto 08:30 VN sáng 11/06 (xem calendar trước 10:00). **(B) Đóng drift repo↔production: deploy bản canonical `auto-generate-post` (--no-verify-jwt) + `generate-caption` lên production (trước đó production chạy bản edit-tại-chỗ thiếu hardening). Commit `.gitignore` (ignore `fix_auto_generate_cron.sql` chứa secret) + push. Verify production sạch: trigger thủ công auto-generate-post → 3 bài sinh ra caption đầy đủ (len 280–440), KHÔNG lỗi surrogate, 3 mở bài khác hẳn nhau (đa dạng đang ăn). Hệ thống đăng bài mấy hôm ổn định. *(Lưu ý môi trường: PowerShell chặn `npx.ps1` → dùng `npx.cmd`; `.git/index.lock` stale do sandbox tạo → `Remove-Item` từ Windows; `WARNING: Docker is not running` khi deploy function là vô hại.)*

**(session 27 — 2026-06-04):** Auto-post chết: 2 cron gửi token lệch SCHEDULER_SECRET → cả auto-generate lẫn fb-scheduler bị 401 mỗi lần chạy (soi net._http_response). Sửa: rewrite 2 cron dùng chung secret đúng + timeout 30s; xác nhận lại secret ở Dashboard. Lỗi thứ 2 lộ ra sau khi sửa auth: `h.caption.slice(0,80)` xẻ đôi emoji → Anthropic 400 "no low surrogate" → vá thành cắt theo code-point (+ stripLoneSurrogates ở bản local), deploy qua Dashboard editor. Verify end-to-end: bài auto ĐÃ ĐĂNG lên Facebook thật (status posted, có fb_post_id). Chi tiết: NEXT.md.

> **Bài học debug cron:** khi cron gọi edge function mà "không thấy gì xảy ra", soi `SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 10;` — đó là nơi thấy đúng HTTP status (401/404/200) và body lỗi function trả về.

**(session 26 — 2026-06-03):** Fix settings.html (script block đặt sau thẻ đóng html → JS không chạy). Deploy auto-generate-post lần đầu.

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
| 4.9 | Submit Meta App Review để xin permissions production (`pages_manage_posts`...) | ⏳ **Đang xác minh** — Thang sẽ chủ động báo khi xong, KHÔNG nhắc lại |

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

### Phase 7 — Scheduler / Cron (session 10 — 2026-05-26)

**Mục tiêu:** Hoàn thiện UI + logic cho tính năng đăng bài tự động theo lịch.

**Đã làm (session 10):**
- [x] **calendar.html** — thêm status `posting` đầy đủ:
  - `STATUS_MAP`: `posting: 'posting'`
  - `statusLabels`: `posting: 'Đang đăng...'`, `statusIcons`: `posting: 'ti-loader-2'`
  - `.cal-dot.posting` với animation pulse (amber, nhấp nháy khi cron đang xử lý)
  - `.status-posting` badge (vàng nhạt)
  - `postItemHTML`: hiển thị "Cron đang xử lý, vui lòng chờ..."
- [x] **calendar.html** — thêm action buttons vào post cards:
  - `scheduled`: nút **Đăng ngay** (gọi `fb-post` edge function với user JWT) + **Hủy lịch** (→ draft)
  - `failed`: nút **Thử lại** (reset về scheduled, fb_retry_count=0) + **Xóa**
  - `draft`: nút **Xóa**
  - CSS: `.post-action-btn`, `.post-actions`, hover states (success/danger)
- [x] **calendar.html** — JS action functions: `cancelSchedule`, `postNow`, `retryPost`, `deletePost`, `_refreshCalendar`

**Git commit session 10:** `feat(phase7): calendar post actions - cancel/postNow/retry/delete + posting status`

**Còn lại để Phase 7 hoàn chỉnh:**
- [x] **Deploy edge functions** (2026-05-28 session 16):
  - `fb-oauth-exchange` ✅
  - `fb-post` ✅
  - `fb-scheduler --no-verify-jwt` ✅
  - `demo-caption --no-verify-jwt` ✅ (tested: AI generate OK)
  - `generate-caption` ✅ (tested: 3 caption versions OK)
- [x] Test end-to-end: tạo bài → lên lịch → chờ cron → verify đăng thành công ✅ (2026-05-28)
- [x] Verify pg_cron đang chạy đúng: active ✅

**Session 16 — Deploy + E2E fix (2026-05-28):**
- [x] Fix "Dùng lại" prefill trong `caption.html`: IDs sai (`captionResult`→`result1`, `topicInput`→`userDesc`, thêm tone + show resultsSection)
- [x] Deploy tất cả 5 edge functions thành công
- [x] Fix SCHEDULER_SECRET missing → `npx supabase secrets set SCHEDULER_SECRET=...`
- [x] Fix fb-post auth khi scheduler gọi — 3 vòng debug:
  - Attempt 1: `authHeader.includes(serviceKey)` — Supabase middleware chặn → "fb-post failed" (data.error null)
  - Attempt 2: decode JWT base64url → jwtRole — base64url decode fail → "unauthorized"  
  - **Final fix**: truyền `scheduler_secret` trong body, fb-post check `body.scheduler_secret === SCHEDULER_SECRET`
- [x] fb-post deploy với `--no-verify-jwt` (Supabase middleware không block service_role call)
- [x] E2E PASS: scheduler pick up post → gọi fb-post → bài lên Facebook ✅

**Ghi chú kỹ thuật quan trọng:**
- `fb-post` phải deploy với `--no-verify-jwt` (Supabase middleware block service_role JWT nếu không)
- Scheduler→fb-post auth: `scheduler_secret` trong request body (KHÔNG dùng header để tránh CORS)
- `postNow` từ calendar gọi trực tiếp `fb-post` với user JWT (không qua scheduler)
- `retryPost` reset `scheduled_at = now()` và `fb_retry_count = 0` → cron 5 phút sau sẽ pick up
- pg_cron jobs: `vpost-fb-scheduler` (*/5) + `vpost-recover-stuck` (*/30) — đều active

---

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

**Git commit session 8:** `feat: phase 7 - onboarding FB step, FB banner app.html, mobile respo
---

### Session 11 — UX & Caption nâng cao (2026-05-26)

**Đã làm:**

**Fix & Deploy:**
- [x] `login.html` — form đăng ký nhận cả SĐT lẫn email (label "Số điện thoại / Email", validation isEmail/isPhone, `signUp(identifier, ...)`)
- [x] `js/app.js` — ảnh mẫu nhanh: nâng URL lên 1080px/q=85 trước khi set previewImg (tránh mờ khi đăng Facebook)

**AI Caption cải tiến:**
- [x] `supabase/functions/generate-caption/index.ts` — rewrite prompt: chống 13 cụm sáo rỗng, 3 cấu trúc A/B/C bắt buộc, học giọng từ caption history
- [x] **4 loại nội dung** (contentType): Bài Facebook / Mô tả Shopee / Kịch bản livestream / Trả lời comment — mỗi loại prompt riêng, ẩn/hiện section phù hợp
- [x] **AI học theo mẫu viết của shop** (styleSamples): user dán 2-3 bài FB cũ → lưu localStorage → truyền lên API làm style guide ưu tiên cao nhất
- [x] `js/caption-engine.js` — truyền `contentType` và `styleSamples` vào API call
- [x] `pages/caption.html` — thêm content type selector (4 nút), section "AI học theo giọng shop" (collapsible), placeholder thay đổi theo loại, nút generate đổi label

**Loading & Template:**
- [x] `pages/caption.html` — redesign loading: brain icon + rings quay + 5 bước checklist với cursor blink; step 5 giữ active đến khi API trả về
- [x] `pages/caption.html` — Template Gallery: 8 tình huống có sẵn (khai trương, flash sale, tuyển dụng...) auto-fill tone/chủ đề/gợi ý

**Landing Page:**
- [x] `index.html` — hero mới: headline "Biến 1 ảnh thành bài đăng Facebook hoàn chỉnh", Before/After card demo
- [x] `index.html` — section "Dành cho ai" (6 ngành: nệm, spa, cafe, mỹ phẩm, thời trang, local brand)
- [x] `index.html` — **Demo miễn phí** không cần đăng nhập: textarea + tone picker + AI generate thật, giới hạn 3 lần/session (localStorage)
- [x] `supabase/functions/demo-caption/index.ts` — edge function public (--no-verify-jwt), gọi Claude Haiku, 3 tone

**Git commits session 11:**
- `feat: email+phone register, template gallery, loading redesign, landing hero, hi-res samples, anti-cliche caption`
- `feat: free demo landing page, email register, template gallery, loading redesign`
- `feat: content types (shopee/livestream/reply) + AI style learning from user samples`
- `fix: pass contentType+styleSamples through CaptionEngine to API`

**Deploy:** ✅ Tất cả đã deploy 2026-05-28

**Đã làm (session 12 — 2026-05-26):**
- [x] **Social proof**: testimonials section redesign — 4 cards (có Kho Nệm Giá Tốt - Quảng Trị là real user), initials avatars thay Unsplash, stats strip (50+/1,200+/5 tỉnh/4.9★)
- [x] **Dashboard UX**: Quick Actions grid (4 nút), Recent Posts feed (5 bài gần nhất + skeleton loading), Greeting động theo giờ
- [x] **Wording**: greeting dynamic, auto-alert text mềm hơn, stat label rõ hơn, upload placeholder gọn hơn
- [x] **Branding consistency**: `.badge-*` utility classes, `.btn` utility classes, calendar.html status colors → CSS variables

**Git commit:** `fix: social proof, dashboard UX, wording, branding consistency`

**Còn lại (backlog):**
- [ ] Deploy edge functions từ terminal local
- [ ] Test E2E scheduler

---


---


### Session 15 — Login page nâng cấp (2026-05-28)

**`login.html` cải tiến:**
- [x] **Rotating testimonials** (3 người): Kho Nệm Giá Tốt / Mỹ phẩm Hana / Tiệm Cafe Mộc — cycle 5s, fade animation, dot indicators
- [x] **Industry badges strip**: 6 ngành (Thời trang, Nội thất, Mỹ phẩm, Cafe, Spa, Ăn uống) hiện dưới preview headline
- [x] **Animated counters**: 1,200+ captions và 50+ shops đếm lên khi trang load (easing cubic)
- [x] **Register benefits panel**: khi click tab "Đăng ký", panel phải hiện checklist 4 tính năng (AI caption, lên lịch, video, trial 3 ngày) — thay ba-card
- [x] **switchTab** patched: toggle `regBenefits` + `ba-card` theo tab

**Git commit session 15:**
- `feat: login rotating testimonials, industry badges, animated counters, register benefits panel`

### Session 14 — Caption History + Pricing nâng cấp + Mobile UX polish (2026-05-28)

**Caption History (`pages/history.html`) — MỚI HOÀN TOÀN:**
- [x] Trang lịch sử AI caption: load từ `caption_history` table (Supabase RLS)
- [x] Grid cards: caption text (expandable), topic chip, tone badge (vui/chuyên/cảm xúc/hành động), ngày giờ tạo
- [x] Actions: Copy, Dùng lại (prefill vào caption.html qua sessionStorage + `?from=history`), Xóa (có animation)
- [x] Search theo nội dung + filter theo tone (pills)
- [x] Skeleton loader, empty state, load more (pagination 20/batch)
- [x] Prefill handler trong `caption.html`: detect `?from=history`, load sessionStorage, show toast
- [x] Thêm "Lịch sử" vào sidebar nav CỦA TẤT CẢ trang (app, caption, calendar, settings, video, upgrade, history)

**Upgrade/Pricing (`pages/upgrade.html`) — Nâng cấp:**
- [x] Bảng so sánh tính năng 3 gói (Cơ bản / Tiêu chuẩn / Pro) — full feature matrix
- [x] FAQ accordion (5 câu): thời gian kích hoạt, nâng hạ gói, hoàn tiền, gia hạn, Facebook bắt buộc?
- [x] CSS: `.compare-table`, `.faq-item`, `.faq-q`, `.faq-a` (collapse/expand animation)
- [x] Fix `sidebar-overlay` → `overlay` (nhất quán với CSS toàn app)

**Mobile UX Polish:**
- [x] `css/style.css` — thêm ~90 dòng mobile CSS (session 14):
  - Touch targets ≥ 44px cho nav-item, menu-btn
  - Quick actions: 2×2 grid trên màn hình ≤768px (thay vì 4 cột)
  - Stats grid: 2 cols responsive thay vì 1 col
  - Safe area inset cho iPhone X+ (mobile-nav + main padding)
  - Upgrade: plan-grid 1 col ≤480px, comparison table compact, QR responsive
  - Caption: ctype-btn 2×2 grid ≤480px
  - Calendar: post-action-btn 34px (bigger tap target) ≤480px
  - Settings: settings-row stack + fb-connect-btn full width ≤480px
  - Plan expiry banner: flex-wrap ≤768px
- [x] **Bug fix** `pages/video.html` — sidebar nav dùng sai path `../pages/*.html` thay vì `*.html` → fixed TẤT CẢ links
- [x] **Bug fix** `pages/video.html` — mobile nav cũng dùng sai paths → fixed
- [x] Tất cả overlay class nhất quán: `class="overlay"` trên mọi trang

**Git commit session 14:**
- `feat: caption history page, pricing comparison+FAQ, mobile UX polish, video.html nav fix`

---

## Phase 8 — Poster Generator AI ~~(backlog)~~ ❌ Đã bỏ (session 24)

**Mục tiêu:** `pages/poster.html` — tạo ảnh poster Canvas-based, export JPG, đăng FB luôn.

**Ý tưởng gốc:** Thay vì user tự làm ảnh ngoài (Canva, AI tool), app tự sinh ảnh quảng cáo đẹp từ thông tin shop + nội dung → xuất JPG → đăng kèm caption lên Facebook.

### Flow tổng quan
1. User chọn **template** (tuyển dụng / khuyến mãi / sản phẩm mới / khai trương)
2. Điền thông tin (tên shop, tiêu đề chính, chi tiết, liên hệ...)
3. AI Haiku sinh tagline/slogan ngắn (2-3 từ, optional)
4. **Pollinations.ai** sinh ảnh nền phù hợp ngành → load vào Canvas
5. Canvas composit: ảnh nền + gradient overlay + text + logo/watermark → preview live
6. Export JPG → user tải về hoặc đăng Facebook (dùng `fb-post` edge function)

### Templates cần làm (MVP — 4 template)

| Template | Màu chủ đạo | Ảnh nền Pollinations prompt | Cấu trúc text |
|---|---|---|---|
| Tuyển dụng | Đỏ / Cam | "modern office background" | Tuyển [vị trí] — Lương — Liên hệ |
| Khuyến mãi / Flash sale | Đỏ / Vàng | "sale promotion abstract" | % GIẢM — Thời gian — Sản phẩm |
| Sản phẩm mới | Xanh / Trắng | "product showcase minimal" | NEW — Tên SP — Giá — Slogan |
| Khai trương | Tím / Vàng | "grand opening celebration" | Khai Trương — Ngày — Địa chỉ — Ưu đãi |

### Technical approach
- **Canvas API** — tương tự `video.html` nhưng output 1 frame JPG (1:1 hoặc 4:5 ratio)
- **Pollinations.ai** — `https://image.pollinations.ai/prompt/{encoded_prompt}?width=720&height=720&nologo=true` (free, no API key)
- **Font rendering** — Canvas drawText với line-wrap tự viết (font từ Google Fonts CDN load trước)
- **AI tagline** — gọi `generate-caption` edge function với prompt kiểu "viết 1 tagline ≤5 từ cho..."
- **Export** — `canvas.toDataURL('image/jpeg', 0.92)` → download link hoặc upload lên Supabase Storage
- **Post to FB** — sau export: cho user xem preview → gọi `fb-post` kèm ảnh

### Sub-tasks

| Sub | Mô tả | Status |
|---|---|---|
| 8.0 | Thiết kế layout `pages/poster.html` (sidebar giống các trang khác) | [ ] Pending |
| 8.1 | Canvas renderer + template Tuyển dụng (cơ bản nhất) | [ ] Pending |
| 8.2 | Thêm Pollinations.ai background với fallback (solid gradient nếu load fail) | [ ] Pending |
| 8.3 | Template Khuyến mãi + Sản phẩm mới | [ ] Pending |
| 8.4 | Template Khai trương | [ ] Pending |
| 8.5 | AI tagline integration (gọi generate-caption edge function) | [ ] Pending |
| 8.6 | Export JPG + upload Storage + post to FB | [ ] Pending |
| 8.7 | Thêm "Tạo poster" vào sidebar nav tất cả trang + sidebar.js | [ ] Pending |

**Quyết định:** Bỏ hoàn toàn. Không phù hợp với trọng tâm hiện tại.

---

## UX / Growth Backlog (session 12 — 2026-05-26)

> Ý tưởng nâng cấp trải nghiệm + conversion. Chưa schedule, làm dần.

### 🎨 Visual & Brand
- [x] **Login page "AI platform"** — ✅ split layout + ba-card + testimonial + stats (session 15)
- [x] **Typography "premium"** — ✅ line-height 1.6, heading 1.32, page-title 24px/800, stat-value 28px/800, rp-item hover lift (session 18)
- [ ] **CTA mạnh hơn** — tăng contrast nút CTA chính, giảm text phụ, 1 CTA rõ ràng thay nhiều nút
- [x] **Brand positioning** — ✅ "AI Content Studio" subtext trên logo login (session 15)

### ✨ "Wow Moment"
- [x] **Caption sample ngay trang home/login** — ✅ before/after card đã có (session 15)
- [x] **Loading đẹp + output streaming** — ✅ brain icon + typewriter cursor (session 11/14)
- [x] **Card/shadow tinh tế hơn** — ✅ hover elevation nhất quán (session 18)

### 🚀 Growth / Conversion
- [x] **"Generate không cần login"** — ✅ demo landing page (session 11)
- [x] **Onboarding cảm xúc hơn** — ✅ confetti canvas khi hoàn thành bước 5 (session 18)

### 🔔 Tính năng mới
- [ ] **Thông báo kết quả đăng bài** — toast/email khi post scheduled thành công hoặc thất bại
- [x] **FB token expiry warning** — ✅ đã có (settings.html + app.html)
- [x] **Dashboard stats charts** — ✅ đã có filter 7/30 ngày (session 17)
- [x] **Admin badge "Payments" động** — ✅ đã có loadNavBadges() query Supabase thật
- [x] **Typewriter effect** — ✅ đã có trong caption.html

