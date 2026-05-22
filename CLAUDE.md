# Vpost — Project Context (đọc đầu mỗi session)

> Mục đích: 1 file đọc đầu phiên là nắm hết bối cảnh. KHÔNG cần read lại các file lớn (migration, edge function, settings.html) trừ khi sửa trực tiếp.

---

## 1. Sản phẩm

**Vpost** — web app auto-post Facebook cho shop nhỏ Việt Nam.

- Owner: Thang (GitHub: gyc073, SĐT: 0789.434.345, email: nguyenphandacthang@gmail.com)
- Production: https://vpost.vn  (custom domain, trỏ Render qua iNET OneShield DNS-only)
- Fallback: https://vpost.onrender.com
- Repo: https://github.com/gyc073/vpost
- Local: `D:\vpost`

**Pricing model (tham khảo terms.html):** beta free, thanh toán qua Zalo.

---

## 2. Tech stack

- **Frontend:** Static HTML/CSS/JS, không build step. Tabler Icons (CDN). Single-page-style nhưng nhiều .html.
- **Backend:** Supabase
  - URL: `https://elfswkmautcyrrkecrns.supabase.co`
  - Anon key: `sb_publishable_btXlJDohdiGYxJc66qudKA_aHmNg7aB` (đã ở `js/supabase-client.js`)
  - Service role key: chỉ ở Supabase Secrets (Edge Functions) — KHÔNG bao giờ commit
- **Hosting:** Render.com (static site, auto-deploy từ branch `main`)
- **DNS:** iNET OneShield (vClouDNS nameservers). A `@` = `216.24.57.1` (Render), mode **"Chỉ DNS"** — KHÔNG bật proxy "Bảo vệ" (gây Cloudflare 1001).
- **AI:** Claude Haiku qua Edge Function `generate-caption`.

---

## 3. Cấu trúc thư mục

```
D:\vpost\
├── index.html              # Landing page
├── login.html              # Auth (email + phone)
├── app.html                # Dashboard sau login
├── onboarding.html         # First-run wizard
├── admin.html              # Admin panel (is_admin())
├── locked.html             # Tài khoản bị khoá
├── fb-callback.html        # FB OAuth callback (Phase 4)
├── privacy.html, terms.html, data-deletion.html  # Pháp lý (Meta App Review)
├── pages/
│   ├── caption.html        # Tạo post + AI caption
│   ├── calendar.html       # Lịch đăng bài
│   ├── settings.html       # Settings + FB connect UI
│   └── video.html          # Video slideshow tool
├── js/
│   ├── supabase-client.js  # window.vpostSupabase
│   ├── auth.js             # login/logout helpers
│   ├── app.js              # dashboard logic
│   ├── caption-engine.js   # gọi Edge Function generate-caption
│   └── fb-client.js        # window.vpostFB (Phase 4)
├── css/style.css           # Design system + variables
└── supabase/
    ├── migrations/
    │   ├── 001_initial_schema.sql      # profiles, posts, caption_history, usage_log, payments
    │   ├── 002_data_deletion.sql       # delete_my_account() RPC
    │   └── 003_fb_integration.sql      # fb_connections, fb_pages, fb_api_log
    └── functions/
        ├── generate-caption/index.ts    # Claude Haiku
        ├── fb-oauth-exchange/index.ts   # FB OAuth → DB
        └── fb-post/index.ts             # Post lên FB Page
```

---

## 4. Database schema (tóm tắt)

### Core (migration 001)
- **`profiles`** — 1:1 với `auth.users`. Cột chính: `id`, `full_name`, `phone`, `shop_name`, `industry`, `is_locked`, `created_at`.
- **`posts`** — bảng trung tâm. `id`, `user_id`, `caption`, `image_url`, `status` (`draft|scheduled|posted|auto_posted|failed`), `scheduled_at`, `posted_at`, `fb_post_id`, `fb_page_id` (003), `fb_error` (003), `fb_retry_count` (003).
- **`caption_history`** — log AI caption đã tạo.
- **`usage_log`** — đếm AI calls/ngày (rate limit).
- **`payments`** — đơn nâng cấp gói.

### FB (migration 003)
- **`fb_connections`** — 1 row/user. `user_id` (unique), `fb_user_id`, `fb_user_name`, `access_token` (long-lived ~60 ngày), `token_expires_at`, `granted_scopes`, `is_active`.
- **`fb_pages`** — N rows/user. `id`, `user_id`, `fb_page_id`, `page_name`, `page_access_token`, `page_category`, `picture_url`, `is_active` (single-active trigger: chỉ 1 page active/user).
- **`fb_api_log`** — audit log mọi call Graph API. `user_id`, `post_id`, `endpoint`, `status_code`, `request`, `response`, `error`.

### Hàm quan trọng
- `handle_new_user()` — trigger tạo profile khi user signup.
- `is_admin()` — check JWT claim cho admin panel.
- `delete_my_account()` (002, mở rộng ở 003) — user-callable, xoá toàn bộ data.
- `get_active_fb_page(user_id_in)` — **chỉ service_role gọi**, trả page + token.
- `disconnect_fb()` — user-callable, xoá fb_connections + fb_pages của họ.
- `enforce_single_active_page()` — trigger BEFORE INSERT/UPDATE trên fb_pages.

---

## 5. Edge Functions

| Function | Auth | Body | Mô tả |
|---|---|---|---|
| `generate-caption` | User JWT | `{prompt, ...}` | Gọi Claude Haiku, log vào caption_history + usage_log |
| `fb-oauth-exchange` | User JWT | `{code, redirect_uri}` | OAuth code → long-lived token → upsert fb_connections + fb_pages |
| `fb-post` | User JWT **hoặc** service_role+`{user_id}` | `{post_id}` | Post lên active FB page, log fb_api_log, update posts.status |

**Secrets cần set trên Supabase:**
- `FB_APP_ID`, `FB_APP_SECRET` — từ Meta for Developers
- `ANTHROPIC_API_KEY` — cho generate-caption
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` — auto inject bởi Supabase

**Deploy:** `npx supabase functions deploy <name>` (từ máy dev).

---

## 6. Frontend conventions

- **Global Supabase client:** `window.vpostSupabase` (load `js/supabase-client.js` đầu mỗi page).
- **Auth check:** dùng `supa.auth.getSession()`. Nếu null → redirect `/login.html`.
- **RLS:** mọi bảng đều có RLS, policy `user_id = auth.uid()`. Service role bypass.
- **FB module:** `window.vpostFB` (load `js/fb-client.js` + set `window.VPOST_FB_APP_ID` trước đó).
- **CSS variables:** `--bg`, `--surface`, `--border`, `--text`, `--text-secondary`, `--primary`, `--radius`, `--shadow`. Dùng các biến này, đừng hard-code màu.
- **Vietnamese-first:** UI text tiếng Việt. Comment code có thể tiếng Việt.

---

## 7. Quy tắc làm việc

1. **Đọc PROGRESS.md** ngay sau file này để biết đang ở đâu.
2. **Không đọc lại file >200 dòng** trừ khi sửa trực tiếp. Dùng `Grep` tìm symbol cụ thể, rồi `Read` với `offset`+`limit`.
3. **Commit + push thường xuyên** sau mỗi sub-task xong (giúp git log thành "ngoại bộ nhớ").
4. **Cập nhật PROGRESS.md** mỗi khi đổi trạng thái task.
5. **Trước khi compact** (context đầy): tự ghi handoff vào `D:\vpost\NEXT.md`.
6. **Edge Function lớn:** tách `index.ts` + `_lib/*.ts` để dễ sửa từng phần.
7. **Secret/key:** không bao giờ commit. Chỉ tham chiếu tên biến.

---

## 8. URL/Endpoint quan trọng

- Supabase Dashboard: https://supabase.com/dashboard/project/elfswkmautcyrrkecrns
- Render: https://dashboard.render.com (service tên `vpost`)
- iNET OneShield: portal iNET → vpost.vn → OneShield → Bản ghi DNS
- Meta for Developers: https://developers.facebook.com/apps (cần tạo app, lấy App ID + Secret, set OAuth Redirect URI = `https://vpost.vn/fb-callback.html`)
