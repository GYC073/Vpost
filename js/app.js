// ===== AUTH =====
function checkAuth() {
  try {
    if (!window.VpostAuth) return {};
    const isInner = window.location.href.includes('/pages/');
    const isPublic = window.location.href.includes('login') || window.location.href.includes('onboarding') || window.location.href.includes('locked');
    if (isPublic) return {};

    const user = VpostAuth.getCurrentUser();
    if (!user.loggedIn) {
      window.location.href = isInner ? '../login.html' : 'login.html'; return {};
    }

    // Kiểm tra trạng thái tài khoản
    const access = VpostAuth.checkAccess();
    if (!access.allowed && access.reason !== 'local_user') {
      window.location.href = isInner ? '../locked.html' : 'locked.html'; return {};
    }
    return user;
  } catch { return {}; }
}

function loadShopInfo() {
  const user = checkAuth();
  const nameEl = document.querySelector('.shop-hero-name');
  if (nameEl && user.shopName) nameEl.textContent = user.shopName;
  const savedCaption = localStorage.getItem('vpost_selected_caption');
  if (savedCaption) {
    const ta = document.getElementById('captionText');
    if (ta) { ta.value = savedCaption; localStorage.removeItem('vpost_selected_caption'); }
  }
  loadTodayTopic();
}

// ===== CHỦ ĐỀ HÔM NAY =====
function loadTodayTopic() {
  if (!window.CaptionEngine) return;
  const today = CaptionEngine.getTodaySchedule();
  const emojiEl = document.getElementById('topicEmoji');
  const titleEl = document.getElementById('topicTitle');
  const history = CaptionEngine.getHistory();
  const todayKey = new Date().toISOString().slice(0,10);
  const todayPosted = history.find(h => h.date && h.date.startsWith(todayKey));
  if (emojiEl) emojiEl.textContent = today.emoji;
  if (titleEl) {
    titleEl.innerHTML = today.label + (todayPosted ? ' <span class="caption-history-chip"><i class="ti ti-check"></i> Đã tạo hôm nay</span>' : '');
  }
}

// ===== TẠO BÀI AI TỪ TRANG CHỦ =====
async function generateTodayCaption() {
  const btn = document.getElementById('topicGenBtn');
  const ta = document.getElementById('captionText');
  if (!btn || !ta || !window.CaptionEngine) return;
  const tone = document.querySelector('.tone-select')?.value || 'fun';
  const userDesc = document.querySelector('.desc-textarea')?.value || '';
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite;display:inline-block"></i> AI đang viết...';
  try {
    const result = await CaptionEngine.generate({ tone, userDesc });
    ta.style.opacity = '0';
    setTimeout(() => { ta.value = result.captions[0]; ta.style.opacity = '1'; ta.style.transition = 'opacity 0.3s'; }, 150);
    showToast('AI đã tạo bài xong! Bạn có thể chỉnh trước khi đăng ✨');
    loadTodayTopic();
  } catch {
    const fb = CaptionEngine.getFallback(CaptionEngine.getShopInfo().shopName, userDesc, '');
    ta.value = fb[0];
    showToast('Đã tạo caption! ✨');
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="ti ti-sparkles"></i> Tạo lại';
}

// ===== REGENERATE =====
async function regenerateCaption() {
  const btn = document.querySelector('.regenerate-btn');
  const ta = document.getElementById('captionText');
  if (!btn || !ta) return;
  const tone = document.querySelector('.tone-select')?.value || 'fun';
  const userDesc = document.querySelector('.desc-textarea')?.value || '';
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite;display:inline-block"></i> Đang tạo...';
  btn.disabled = true;
  try {
    const result = await CaptionEngine.generate({ tone, userDesc });
    ta.style.opacity = '0';
    setTimeout(() => { ta.value = result.captions[0]; ta.style.opacity = '1'; }, 150);
    showToast('Đã tạo caption mới! ✨');
  } catch { showToast('Lỗi tạo caption, thử lại nhé!'); }
  btn.innerHTML = '<i class="ti ti-refresh"></i> Tạo lại';
  btn.disabled = false;
}

// ===== FILE UPLOAD =====
function handleFile(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('uploadPlaceholder').style.display = 'none';
    document.getElementById('uploadPreview').style.display = 'block';
    if (file.type.startsWith('image/')) document.getElementById('previewImg').src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function handleDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0]; if (!file) return;
  const input = document.getElementById('fileInput');
  const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
  handleFile(input);
}
function removeImage(e) {
  e.stopPropagation();
  document.getElementById('uploadPlaceholder').style.display = 'flex';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('previewImg').src = '';
  document.getElementById('fileInput').value = '';
}
function pickSample(img) {
  document.querySelectorAll('.sample-img').forEach(i => i.classList.remove('selected'));
  img.classList.add('selected');
  document.getElementById('uploadPlaceholder').style.display = 'none';
  document.getElementById('uploadPreview').style.display = 'block';
  // Nâng resolution lên 1080px khi dùng thật (thumbnail chỉ 200px sẽ vỡ khi đăng FB)
  const hiResUrl = img.src.replace(/w=\d+/, 'w=1080').replace(/q=\d+/, 'q=85');
  document.getElementById('previewImg').src = hiResUrl;
}

// ============================================================
// ===== TẠO POST THẬT (lưu vào Supabase) =====
// status: 'posted' (đăng ngay), 'scheduled' (lên lịch), 'auto_posted' (AI tự lo)
// ============================================================
async function submitPost(status) {
  if (!window.vpostPosts) {
    showToast('Supabase chưa load, hãy F5 lại trang.');
    return;
  }
  const ta = document.getElementById('captionText');
  const caption = (ta?.value || '').trim();
  if (!caption) {
    showToast('Bạn chưa có caption nào để đăng. Tạo caption trước nhé!');
    return;
  }

  // Lấy ảnh nếu có
  const fileInput = document.getElementById('fileInput');
  const previewImg = document.getElementById('previewImg');
  const file = fileInput?.files?.[0];

  // Nếu lên lịch → hỏi giờ đơn giản (default: tối nay 8pm)
  let scheduledAt = null;
  if (status === 'scheduled') {
    const def = new Date();
    def.setHours(20, 0, 0, 0);
    if (def < new Date()) def.setDate(def.getDate() + 1);
    const defStr = def.toISOString().slice(0,16);  // 'YYYY-MM-DDTHH:mm'
    const input = prompt('Đăng lúc nào? (định dạng: YYYY-MM-DD HH:mm)\nMặc định: ' + defStr.replace('T', ' '), defStr.replace('T',' '));
    if (input === null) return; // user cancel
    const parsed = new Date(input.trim().replace(' ', 'T'));
    if (isNaN(parsed.getTime())) {
      showToast('Định dạng giờ không hợp lệ.');
      return;
    }
    scheduledAt = parsed.toISOString();
  } else if (status === 'auto_posted') {
    // AI tự đăng → 10h sáng hôm sau (hoặc hôm nay nếu chưa qua)
    const auto = new Date();
    auto.setHours(10, 0, 0, 0);
    if (auto < new Date()) auto.setDate(auto.getDate() + 1);
    scheduledAt = auto.toISOString();
  }

  // Disable các button trong khi đang lưu
  const buttons = document.querySelectorAll('.action-row button');
  buttons.forEach(b => b.disabled = true);
  showToast('⏳ Đang lưu bài...');

  try {
    // Upload ảnh trước nếu có
    let imageUrl = null;
    if (file) {
      const uploaded = await window.vpostPosts.uploadImage(file);
      if (uploaded.error) {
        showToast('⚠️ Upload ảnh lỗi: ' + uploaded.error);
      } else {
        imageUrl = uploaded.url;
      }
    } else if (previewImg?.src && previewImg.src.startsWith('http')) {
      // Người dùng đã chọn ảnh mẫu (chỉ là URL Unsplash, lưu thẳng vào DB)
      imageUrl = previewImg.src;
    }

    const user = VpostAuth.getCurrentUser();
    const post = {
      caption,
      image_url: imageUrl,
      status,
      scheduled_at: scheduledAt,
      posted_at: status === 'posted' ? new Date().toISOString() : null,
      tone: document.querySelector('.tone-select')?.value || null,
    };

    const { data, error } = await window.vpostPosts.create(post);
    if (error) {
      showToast('❌ Lưu bài thất bại: ' + (error.message || error));
      buttons.forEach(b => b.disabled = false);
      return;
    }

    const msgMap = {
      posted: '✅ Đã lưu bài đăng! Copy caption sang Facebook để post nhé 🎉',
      scheduled: '⏰ Đã lên lịch! Vào "Lịch đăng" để xem.',
      auto_posted: '🤖 Đã giao cho AI. Bài sẽ tự đăng theo lịch.',
    };
    showToast(msgMap[status] || 'Đã lưu bài!');

    // Reset form
    ta.value = '';
    if (fileInput) fileInput.value = '';
    document.getElementById('uploadPlaceholder')?.style?.setProperty('display', 'flex');
    document.getElementById('uploadPreview')?.style?.setProperty('display', 'none');

    // Refresh stats
    setTimeout(refreshStats, 500);
  } catch (e) {
    console.error('[Vpost] submitPost error:', e);
    showToast('❌ Lỗi: ' + e.message);
  } finally {
    buttons.forEach(b => b.disabled = false);
  }
}

// ============================================================
// ===== REFRESH STATS từ Supabase (thay vì localStorage counter) =====
// ============================================================
async function refreshStats() {
  if (!window.vpostPosts) return;
  try {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const fromISO = monthStart.toISOString();

    // Đếm song song cho nhanh
    const [postedCount, autoCount, allMonth] = await Promise.all([
      window.vpostPosts.count({ status: 'posted', from: fromISO }),
      window.vpostPosts.count({ status: 'auto_posted', from: fromISO }),
      window.vpostPosts.list({ limit: 200, from: fromISO }),
    ]);

    const statPosts = document.getElementById('statPosts');
    const statAuto  = document.getElementById('statAuto');
    const statInteract = document.getElementById('statInteract');
    const statStreak = document.getElementById('statStreak');

    const totalThisMonth = postedCount + autoCount;
    if (statPosts) statPosts.textContent = postedCount;
    if (statAuto)  statAuto.textContent  = autoCount;

    // AI calls hôm nay từ usage_log
    if (statInteract && window.vpostSupabase) {
      try {
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const { count } = await window.vpostSupabase
          .from('usage_log')
          .select('*', { count: 'exact', head: true })
          .eq('action', 'caption_generate')
          .gte('created_at', todayStart.toISOString());
        statInteract.textContent = count ?? 0;
      } catch(_) { statInteract.textContent = 0; }
    }

    // Streak: đếm số ngày liên tiếp có post
    if (statStreak) {
      const dates = new Set((allMonth.data || []).map(p => (p.posted_at || p.created_at || '').slice(0, 10)).filter(Boolean));
      let streak = 0;
      const d = new Date();
      while (dates.has(d.toISOString().slice(0,10))) {
        streak++;
        d.setDate(d.getDate() - 1);
      }
      statStreak.textContent = streak;
    }
  } catch (e) {
    console.warn('[Vpost] refreshStats error:', e);
  }
}
window.submitPost = submitPost;
window.refreshStats = refreshStats;

// ===== UI =====
function showToast(msg) {
  const toast = document.getElementById('toast'); if (!toast) return;
  toast.textContent = msg; toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('overlay')?.classList.toggle('show');
}

document.addEventListener('DOMContentLoaded', () => {
  if (!window.location.href.includes('login') && !window.location.href.includes('onboarding')) {
    loadShopInfo();
  }
});

const style = document.createElement('style');
style.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
document.head.appendChild(style);

// ===== ẢNH THEO NGÀNH HÀNG =====
const industryAssets = {
  coffee:   {
    cover: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&q=70',
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=200&q=70',
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=200&q=70',
      'https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?w=200&q=70',
    ]
  },
  fashion:  {
    cover: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=200&q=70',
      'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&q=70',
      'https://images.unsplash.com/photo-1467043237213-65f2da53396f?w=200&q=70',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&q=70',
    ]
  },
  beauty:   {
    cover: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1631214524020-3c69f7f7a09b?w=200&q=70',
      'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=200&q=70',
      'https://images.unsplash.com/photo-1583241475880-083f84372725?w=200&q=70',
      'https://images.unsplash.com/photo-1614806687007-2215916ec42c?w=200&q=70',
    ]
  },
  food:     {
    cover: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&q=70',
      'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=200&q=70',
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&q=70',
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=200&q=70',
    ]
  },
  tech:     {
    cover: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=200&q=70',
      'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=200&q=70',
      'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=200&q=70',
      'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=200&q=70',
    ]
  },
  home:     {
    cover: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1493663284031-b7e3aaa4cab1?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=200&q=70',
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=200&q=70',
      'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=200&q=70',
      'https://images.unsplash.com/photo-1484101403633-562f891dc89a?w=200&q=70',
    ]
  },
  health:   {
    cover: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=200&q=70',
      'https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=200&q=70',
      'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=200&q=70',
      'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=200&q=70',
    ]
  },
  education:{
    cover: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=200&q=70',
      'https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=200&q=70',
      'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=200&q=70',
      'https://images.unsplash.com/photo-1513258496099-48168024aec0?w=200&q=70',
    ]
  },
  furniture:{
    cover: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=200&q=70',
      'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=200&q=70',
      'https://images.unsplash.com/photo-1567538096621-38d2284b23ff?w=200&q=70',
      'https://images.unsplash.com/photo-1493663284031-b7e3aaa4cab1?w=200&q=70',
    ]
  },
  sport:    {
    cover: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70',
      'https://images.unsplash.com/photo-1546483875-ad9014c88eba?w=200&q=70',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&q=70',
      'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=200&q=70',
    ]
  },
  realestate: {
    cover: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=200&q=80',
      'https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=200&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=200&q=80',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=200&q=80',
    ]
  },
  shoes:    {
    cover: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200&q=80',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=200&q=80',
      'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=200&q=80',
      'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=200&q=80',
    ]
  },
  authentic:{
    cover: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=200&q=80',
      'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=200&q=80',
      'https://images.unsplash.com/photo-1591085686350-798c0f9faa7f?w=200&q=80',
      'https://images.unsplash.com/photo-1622560480654-d96214fdc887?w=200&q=80',
    ]
  },
  perfume:  {
    cover: 'https://images.unsplash.com/photo-1541643600914-78b084683702?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1619994403073-2cec844b8e63?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1541643600914-78b084683702?w=200&q=80',
      'https://images.unsplash.com/photo-1619994403073-2cec844b8e63?w=200&q=80',
      'https://images.unsplash.com/photo-1587017539504-67cfbddac569?w=200&q=80',
      'https://images.unsplash.com/photo-1602928321679-560bb453f190?w=200&q=80',
    ]
  },
  other:    {
    cover: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=200&q=80',
      'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=200&q=80',
      'https://images.unsplash.com/photo-1520333789090-1afc82db536a?w=200&q=80',
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=200&q=80',
    ]
  },
};

// ===== LOAD THÔNG TIN SHOP THEO USER THẬT =====
function applyShopAssets(overrideIndustry, overrideName) {
  try {
    const user = (window.VpostAuth ? VpostAuth.getCurrentUser() : null) || JSON.parse(localStorage.getItem('vpost_user') || '{}');
    if (!user || !user.loggedIn) return;

    const industry = overrideIndustry || user.industry || 'other';
    const assets = industryAssets[industry] || industryAssets['other'];
    const shopName = overrideName || user.shopName || user.name || 'Shop của bạn';

    // Cập nhật tên shop
    ['heroShopName', 'heroPlatformPage'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = shopName;
    });
    document.querySelectorAll('.shop-hero-name').forEach(el => el.textContent = shopName);
    document.querySelectorAll('.platform-page').forEach(el => el.textContent = shopName);

    // Cập nhật ảnh cover và avatar theo ngành
    document.querySelectorAll('.shop-hero-cover, .shop-profile-cover img').forEach(el => { el.src = assets.cover; });
    document.querySelectorAll('.shop-avatar, .shop-profile-avatar, #settingsAvatar').forEach(el => { el.src = assets.avatar; });

    // Cập nhật ảnh mẫu theo ngành
    const sampleImgs = document.querySelectorAll('.sample-img');
    sampleImgs.forEach((img, i) => {
      const idx = i % assets.samples.length;
      if (assets.samples[idx]) img.src = assets.samples[idx];
    });

    // Set placeholder 0 cho stats
    ['statPosts','statAuto','statStreak','statInteract'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.textContent) el.textContent = '0';
    });

    if (!user.joinDate) {
      user.joinDate = new Date().toISOString();
      localStorage.setItem('vpost_user', JSON.stringify(user));
    }

    // Refresh stats THẬT từ Supabase (async)
    if (typeof refreshStats === 'function') refreshStats();

  } catch(e) { console.log('applyShopAssets error:', e); }
}

// ===== LOAD SHOP TỪ SUPABASE (luôn mới nhất) =====
async function loadShopFromSupabase() {
  try {
    const supa = window.vpostSupabase;
    if (!supa) return;
    const { data: { session } } = await supa.auth.getSession();
    if (!session?.user?.id) return;

    const { data: profile } = await supa
      .from('profiles')
      .select('shop_name, industry')
      .eq('id', session.user.id)
      .single();

    if (!profile) return;

    // Sync về localStorage để các module khác dùng
    try {
      const stored = JSON.parse(localStorage.getItem('vpost_user') || '{}');
      if (profile.shop_name) stored.shopName = profile.shop_name;
      if (profile.industry)  stored.industry  = profile.industry;
      localStorage.setItem('vpost_user', JSON.stringify(stored));
    } catch(_) {}

    // Cập nhật UI với data thật từ Supabase
    applyShopAssets(profile.industry, profile.shop_name);

  } catch(e) { console.warn('[Vpost] loadShopFromSupabase error:', e); }
}

// Gọi khi trang load xong
document.addEventListener('DOMContentLoaded', () => {
  if (!window.location.href.includes('login') && !window.location.href.includes('onboarding')) {
    setTimeout(applyShopAssets, 100);       // Hiện ngay từ localStorage (nhanh)
    setTimeout(loadShopFromSupabase, 400);  // Sau đó sync từ Supabase (luôn mới nhất)
  }
});

// Expose để settings page có thể trigger refresh ảnh khi user đổi ngành
window.applyShopAssets = applyShopAssets;
