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
