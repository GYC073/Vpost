# NEXT — Handoff note (session 19, 2026-05-28)

## Đang làm dở: Pricing value framing

**Bối cảnh:** Thang muốn thêm framing "3.000đ/ngày" vào pricing cards thay vì chỉ "100k/tháng".
Câu framing đã thống nhất: **"Tiết kiệm ~15 giờ/tháng — chỉ 3.000đ/ngày"**

**Files cần sửa:**

### 1. `pages/upgrade.html` (CHƯA LÀM)
Thêm `.plan-per-day` dưới mỗi `.plan-period`:
- Cơ bản: `<div class="plan-per-day">≈ 3.300đ/ngày</div>` + value hint "Tiết kiệm ~10h/tháng"
- Tiêu chuẩn: `<div class="plan-per-day">≈ 6.600đ/ngày</div>` + "Tiết kiệm ~20h/tháng"
- Pro: `<div class="plan-per-day">≈ 13.300đ/ngày</div>` + "Tiết kiệm ~30h/tháng"

CSS cần thêm:
```css
.plan-per-day { font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
.plan-value-hint { font-size: 11px; color: #059669; font-weight: 600; background: #f0fdf4; border-radius: 6px; padding: 3px 8px; margin-bottom: 12px; display: inline-block; }
```

### 2. `index.html` — pricing section (CHƯA LÀM)
Tìm section `id="pricing"` hoặc `class="pricing-grid"`, thêm tương tự per-day framing vào 3 plan cards.

### 3. `index.html` — hero/section subtitle (CÂN NHẮC)
Thay hoặc thêm dòng: *"Tiết kiệm 15 giờ/tháng viết content — chỉ từ 3.000đ/ngày"*

---

## Đã xong trong session 19

- ✅ Bug fix: FB connect banner ẩn sai (chỉ hiện khi `!error && !data`)
- ✅ Upgrade page: Tiêu chuẩn button solid tím, Pro button disabled "Gói đang dùng"
- ✅ Video grid: 4+1 → 5 cột đều nhau
- ✅ Full UI audit toàn bộ trang — đã review admin, caption, calendar, settings, video, history, upgrade, dashboard

---

## Chuẩn bị launch

- Pricing framing: làm xong session tới
- Không làm push notification (đồng ý — chưa đúng trọng tâm)
- Trial: 3 ngày (đã đúng ở mọi nơi)
- Kênh nhắc sau launch: Email hoặc Zalo OA (sau khi có revenue)
