// ============================================================
// VPOST SIDEBAR.JS — Sidebar plan info động từ Supabase
// Load sau supabase-client.js trên mọi trang (trừ login/landing)
// ============================================================

(async function initSidebarPlan() {
  const supa = window.vpostSupabase;
  if (!supa) return;

  try {
    const { data: { session } } = await supa.auth.getSession();
    if (!session) return;

    const { data: profile } = await supa
      .from('profiles')
      .select('plan, plan_expires_at, shop_name')
      .eq('id', session.user.id)
      .single();

    if (!profile) return;

    const planNames = { trial: 'Dùng thử', basic: 'Cơ bản', standard: 'Tiêu chuẩn', pro: 'Pro' };
    const planName = planNames[profile.plan] || 'Dùng thử';

    // Tính ngày còn lại
    let daysLeft = null;
    let expireStr = '';
    if (profile.plan_expires_at) {
      const expDate = new Date(profile.plan_expires_at);
      daysLeft = Math.ceil((expDate - new Date()) / 86400000);
      expireStr = expDate.toLocaleDateString('vi-VN');
    }

    // ── Cập nhật sidebar-plan ──────────────────────────────
    const badge  = document.querySelector('.sidebar-plan .plan-badge');
    const expire = document.querySelector('.sidebar-plan .plan-expire');
    const dayEl  = document.querySelector('.sidebar-plan .plan-days');

    if (badge)  badge.textContent = 'Gói ' + planName;
    if (expire && expireStr) expire.textContent = 'Hết hạn: ' + expireStr;
    if (dayEl) {
      if (daysLeft === null) {
        dayEl.textContent = '';
      } else if (daysLeft < 0) {
        dayEl.textContent = 'Đã hết hạn!';
        dayEl.style.color = '#FCA5A5';
        dayEl.style.fontWeight = '700';
      } else if (daysLeft <= 5) {
        dayEl.textContent = `⚠️ Còn ${daysLeft} ngày`;
        dayEl.style.color = '#FDE68A';
        dayEl.style.fontWeight = '700';
      } else {
        dayEl.textContent = `Còn ${daysLeft} ngày`;
      }
    }

    // ── Banner hết hạn trên dashboard (app.html) ──────────
    const banner = document.getElementById('planExpiryBanner');
    if (banner && daysLeft !== null) {
      if (daysLeft < 0) {
        banner.innerHTML = `
          <i class="ti ti-clock-off"></i>
          <span>Gói <strong>${planName}</strong> đã hết hạn! App sẽ bị khoá.</span>
          <a href="pages/upgrade.html">Gia hạn ngay →</a>`;
        banner.className = 'plan-expiry-banner danger';
        banner.style.display = 'flex';
      } else if (daysLeft <= 5) {
        banner.innerHTML = `
          <i class="ti ti-clock"></i>
          <span>Gói <strong>${planName}</strong> còn <strong>${daysLeft} ngày</strong> — hết hạn ${expireStr}.</span>
          <a href="pages/upgrade.html">Gia hạn ngay →</a>`;
        banner.className = 'plan-expiry-banner warn';
        banner.style.display = 'flex';
      }
    }

    // ── Expose cho các script khác dùng ──────────────────
    window.vpostPlan = {
      plan: profile.plan,
      planName,
      daysLeft,
      expireStr,
      shopName: profile.shop_name,
    };

  } catch (e) {
    console.warn('[Vpost] sidebar.js error:', e);
  }
})();
