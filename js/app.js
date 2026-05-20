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
  document.getElementById('previewImg').src = img.src;
}

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
  other:    {
    cover: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=900&q=80',
    avatar: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=120&q=80',
    samples: [
      'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=200&q=70',
      'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=200&q=70',
      'https://images.unsplash.com/photo-1520333789090-1afc82db536a?w=200&q=70',
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=200&q=70',
    ]
  },
};

// ===== LOAD THÔNG TIN SHOP THEO USER THẬT =====
function applyShopAssets() {
  try {
    const user = PostlyAuth ? PostlyAuth.getCurrentUser() : JSON.parse(localStorage.getItem('vpost_user') || '{}');
    if (!user || !user.loggedIn) return;

    const industry = user.industry || 'other';
    const assets = industryAssets[industry] || industryAssets['other'];
    const shopName = user.shopName || user.name || 'Shop của bạn';

    // Cập nhật tên shop
    ['heroShopName', 'heroPlatformPage'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = shopName;
    });
    document.querySelectorAll('.shop-hero-name').forEach(el => el.textContent = shopName);
    document.querySelectorAll('.platform-page').forEach(el => el.textContent = shopName);

    // Cập nhật ảnh cover và avatar theo ngành
    const cover = document.querySelector('.shop-hero-cover');
    if (cover) cover.src = assets.cover;

    const avatar = document.querySelector('.shop-avatar');
    if (avatar) avatar.src = assets.avatar;

    // Cập nhật ảnh mẫu theo ngành
    const sampleImgs = document.querySelectorAll('.sample-img');
    sampleImgs.forEach((img, i) => {
      if (assets.samples[i]) img.src = assets.samples[i];
    });

    // Reset stats về 0 cho user mới
    const joinDate = user.joinDate || new Date().toISOString();
    const daysSinceJoin = Math.floor((new Date() - new Date(joinDate)) / 86400000);
    const postsCount = parseInt(localStorage.getItem(`vpost_posts_${user.phone}`) || '0');
    const autoCount  = parseInt(localStorage.getItem(`vpost_auto_${user.phone}`) || '0');

    const statPosts   = document.getElementById('statPosts');
    const statAuto    = document.getElementById('statAuto');
    const statStreak  = document.getElementById('statStreak');
    const statInteract= document.getElementById('statInteract');

    if (statPosts)    statPosts.textContent    = postsCount;
    if (statAuto)     statAuto.textContent     = autoCount;
    if (statStreak)   statStreak.textContent   = daysSinceJoin > 0 ? daysSinceJoin : 0;
    if (statInteract) statInteract.textContent = postsCount * 12; // ước tính 12 tương tác/bài

    // Lưu ngày join nếu chưa có
    if (!user.joinDate) {
      user.joinDate = new Date().toISOString();
      localStorage.setItem('vpost_user', JSON.stringify(user));
    }

  } catch(e) { console.log('applyShopAssets error:', e); }
}

// Gọi khi trang load xong
document.addEventListener('DOMContentLoaded', () => {
  if (!window.location.href.includes('login') && !window.location.href.includes('onboarding')) {
    setTimeout(applyShopAssets, 100);
  }
});
