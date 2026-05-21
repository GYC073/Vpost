# Vpost — Hướng dẫn cài đặt từ A đến Z

Tài liệu này hướng dẫn bạn (chủ shop / dev của Vpost) cách dựng backend cho Vpost từ con số 0. Làm xong sẽ có:

- ✅ Database Supabase chứa user, post, payment, quota
- ✅ Edge Function tự sinh caption bằng Claude Haiku 4.5
- ✅ Frontend `vpost.vn` kết nối backend hoàn chỉnh
- ✅ Tài khoản admin đầu tiên (chính bạn)

**Tổng thời gian**: khoảng 30–45 phút.

---

## Bước 0 — Cài công cụ

Bạn cần có sẵn trên máy:

1. **Node.js** (≥ 18) — tải tại https://nodejs.org
2. **Git** — đã có sẵn vì bạn đang dùng GitHub
3. **Supabase CLI** — cài bằng lệnh:
   ```bash
   npm install -g supabase
   ```
   Kiểm tra: `supabase --version` (phải ra số version, ví dụ `1.200.x`)

---

## Bước 1 — Tạo project Supabase (5 phút)

1. Vào https://supabase.com → **Start your project**
2. Đăng nhập bằng GitHub (`gyc073`) cho tiện
3. Bấm **New Project**:
   - **Name**: `vpost-prod`
   - **Database Password**: tự đặt 1 mật khẩu mạnh → **LƯU LẠI vào file riêng**, dùng cho Bước 4
   - **Region**: `Southeast Asia (Singapore)` ⭐ (gần Việt Nam nhất, nhanh nhất)
   - **Pricing Plan**: **Free** (đủ dùng cho 50–100 shop đầu tiên)
4. Bấm **Create new project** → đợi ~2 phút cho Supabase khởi tạo
5. Khi xong, vào **Settings** (bánh răng góc trái) → **API**:
   - Copy 2 giá trị này ra file ghi chú:
     - **Project URL** (ví dụ: `https://abcxyzabcxyz.supabase.co`)
     - **anon public** key (chuỗi dài bắt đầu bằng `eyJhbGc...`)
     - **service_role** key (cũng `eyJhbGc...`) — ⚠️ TUYỆT ĐỐI KHÔNG đưa key này lên GitHub
6. Cũng trong **Settings**, vào **General** → copy **Reference ID** (ví dụ `abcxyzabcxyz`) — dùng ở Bước 4

---

## Bước 2 — Lấy Anthropic API Key (5 phút)

Cần API key để Vpost dùng Claude Haiku sinh caption.

1. Vào https://console.anthropic.com
2. Đăng ký tài khoản (bằng email hoặc Google)
3. Vào **Billing** → **Add credit** → nạp tối thiểu **$5** (~125,000 VNĐ)
   - $5 đủ tạo ~20,000 caption ngắn → đủ cho 100 shop dùng 1 tháng
4. Vào **API Keys** → **Create Key**:
   - **Name**: `vpost-prod`
   - **Permissions**: để mặc định
5. Bấm **Create** → **copy key NGAY** (chuỗi `sk-ant-api03-...`) — chỉ hiện 1 lần
6. Lưu vào file ghi chú cùng chỗ với credentials Supabase

---

## Bước 3 — Bật Phone Auth trên Supabase (3 phút)

Vpost đăng nhập bằng SĐT.

1. Trong Supabase Dashboard → **Authentication** → **Providers**
2. Tìm **Phone** → bật **Enable phone provider**
3. Chọn SMS provider:
   - **Twilio** (khuyến nghị, giá rẻ): cần tạo account Twilio rồi paste Account SID + Auth Token + Phone Number
   - **MessageBird**, **Vonage**: lựa chọn khác
   - **Hoặc**: tắt verify OTP, dùng phone + password trực tiếp (đơn giản hơn cho V1)
4. Bấm **Save**

> 💡 Nếu chưa muốn lo Twilio: vào **Authentication** → **Settings** → tắt **Confirm phone**. Sau này khi user đông sẽ bật OTP sau.

---

## Bước 4 — Push schema lên database (5 phút)

Mở terminal trong thư mục `D:\vpost`:

```bash
cd D:\vpost

# Đăng nhập Supabase CLI (mở browser)
supabase login

# Khởi tạo cấu hình local (nếu chưa có thư mục .supabase)
supabase init

# Liên kết folder này với project trên cloud
# THAY <reference-id> bằng Reference ID lấy ở Bước 1
supabase link --project-ref <reference-id>
# Nhập database password (đã lưu ở Bước 1)

# Push file 001_initial_schema.sql lên Supabase
supabase db push
```

Sau khi xong, vào Supabase Dashboard → **Table Editor** sẽ thấy 5 bảng:
`profiles`, `posts`, `caption_history`, `usage_log`, `payments`

Và 2 storage bucket: `post-images`, `bills`.

---

## Bước 5 — Deploy Edge Function (5 phút)

```bash
# Set secret cho function (THAY sk-ant-... bằng key Anthropic ở Bước 2)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxx

# Deploy function generate-caption
supabase functions deploy generate-caption
```

Sẽ thấy output:
```
Deployed Function generate-caption on project xxx
You can test it with: curl https://xxx.supabase.co/functions/v1/generate-caption
```

---

## Bước 6 — Cập nhật credentials trong frontend (1 phút)

Mở file `D:\vpost\js\supabase-client.js`, sửa 2 dòng đầu:

```js
const SUPABASE_URL      = "https://abcxyzabcxyz.supabase.co";  // Project URL ở Bước 1
const SUPABASE_ANON_KEY = "eyJhbGciOi...";                      // anon public key ở Bước 1
```

> ⚠️ **Chỉ dán anon public key**, KHÔNG dán service_role key.
> Anon key được thiết kế để chạy ở browser, đã được bảo vệ bằng RLS.

Sau đó nhớ thêm dòng này vào `<head>` của mọi HTML page cần Supabase (app.html, admin.html, settings.html, calendar.html):

```html
<script src="https://esm.sh/@supabase/supabase-js@2.45.4"></script>
<script src="js/supabase-client.js"></script>
```

---

## Bước 7 — Tạo admin đầu tiên (CHÍNH BẠN) (2 phút)

1. Vào trang `vpost.vn` (hoặc deploy preview Render)
2. Đăng ký bằng SĐT của bạn (ví dụ `0901234567`)
3. Vào Supabase Dashboard → **Table Editor** → bảng **profiles**
4. Tìm dòng có SĐT của bạn → bấm vào ô **role** → đổi từ `user` thành `admin`
5. Cũng nên đổi **plan** thành `pro` và **plan_expires_at** lên năm 2099 cho khỏi hết
6. Logout & login lại trên Vpost → bây giờ bạn vào `vpost.vn/admin.html` sẽ thấy toàn bộ dashboard quản trị

---

## Bước 8 — Commit & push code

```bash
cd D:\vpost
git add .
git commit -m "feat: backend Supabase + Edge Function generate-caption"
git push origin main
```

Render sẽ tự deploy bản mới trong ~2 phút.

---

## ✅ Checklist hoàn thành

- [ ] Project Supabase đã tạo, region Singapore
- [ ] Có file note chứa: Project URL, anon key, service_role key (bí mật), DB password
- [ ] Có Anthropic API key, đã nạp ≥ $5
- [ ] Phone auth đã bật
- [ ] `supabase db push` chạy thành công, 5 bảng đã có
- [ ] `supabase functions deploy generate-caption` thành công
- [ ] Đã set secret `ANTHROPIC_API_KEY`
- [ ] Đã sửa `js/supabase-client.js` với URL + anon key thật
- [ ] Đã thêm 2 thẻ `<script>` vào các page cần Supabase
- [ ] Đã đăng ký tài khoản test và set `role = admin` cho chính bạn
- [ ] Code đã push lên GitHub, Render đã deploy

---

## 🐞 Troubleshooting

**`supabase: command not found`** → cài lại: `npm install -g supabase`

**`Error: project not linked`** → chạy lại `supabase link --project-ref <reference-id>`

**`generate-caption` trả `missing_ai_key`** → chưa set secret. Chạy lại `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` rồi redeploy function

**Frontend báo `[Vpost] ⚠️ Bạn chưa điền SUPABASE_URL`** → quay lại Bước 6, chưa sửa file `js/supabase-client.js`

**Frontend báo `not_logged_in`** dù đã đăng nhập → kiểm tra `vpostSupabase` console: có thể URL/key sai

**RLS chặn không cho insert** → trong SQL Editor, chạy: `SELECT auth.uid();` — nếu trả về `NULL` nghĩa là chưa có session, đăng nhập lại

**Anthropic báo 401** → key sai hoặc chưa nạp credit. Vào https://console.anthropic.com/settings/billing kiểm tra

---

## 💰 Chi phí dự kiến tháng đầu

| Hạng mục              | Cost                                  |
|-----------------------|---------------------------------------|
| Supabase Free         | 0₫ (đủ 50,000 monthly active users)   |
| Anthropic Claude Haiku| ~$5 cho ~20,000 caption               |
| Render Free           | 0₫ (cho static site)                  |
| Domain `vpost.vn`     | đã có                                 |
| **TỔNG**              | **~$5 (~125,000₫) / tháng đầu**       |

Khi có 100+ shop trả phí → upgrade Supabase Pro ($25/tháng) + Anthropic ~$20–50/tháng.

---

## Bước tiếp theo (sau khi hoàn thành)

1. **Tích hợp `vpostGenerateCaption()` vào trang tạo bài** — thay chỗ đang `setTimeout` fake
2. **Migration user từ localStorage sang Supabase** (nếu đã có user thật)
3. **Trang VietQR + upload bill** (Phase 5)
4. **FB OAuth + auto-post** (Phase 6, khi qua được app review của Meta)

Có gì khó hỏi mình bất cứ lúc nào nhé!
