// ============================================================
// VPOST AUTH & ACCESS CONTROL
// Cầu nối Admin ↔ Trang khách hàng
// ============================================================

const VpostAuth = {

  // ===== CONSTANTS =====
  PLANS: {
    trial:    { name: 'Dùng thử',    videoPerDay: 1, postPerDay: 1, durationDays: 3 },
    basic:    { name: 'Cơ bản',      videoPerDay: 1, postPerDay: 1, durationDays: 30 },
    standard: { name: 'Tiêu chuẩn', videoPerDay: 2, postPerDay: 2, durationDays: 30 },
    pro:      { name: 'Pro',         videoPerDay: 5, postPerDay: 2, durationDays: 30 },
  },

  // ===== LẤY DANH SÁCH KHÁCH (Admin quản lý) =====
  getCustomers() {
    try {
      return JSON.parse(localStorage.getItem('vpost_customers') || '[]');
    } catch { return []; }
  },

  saveCustomers(customers) {
    localStorage.setItem('vpost_customers', JSON.stringify(customers));
  },

  // ===== LẤY USER HIỆN TẠI (trang khách) =====
  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('vpost_user') || '{}');
    } catch { return {}; }
  },

  saveCurrentUser(user) {
    localStorage.setItem('vpost_user', JSON.stringify(user));
  },

  // ===== KIỂM TRA TRẠNG THÁI TÀI KHOẢN =====
  checkAccess() {
    const user = this.getCurrentUser();
    if (!user.loggedIn) return { allowed: false, reason: 'not_logged_in' };

    const customers = this.getCustomers();
    const customer = customers.find(c => c.phone === user.phone);

    // Nếu không tìm thấy trong DB admin → vẫn cho dùng (trường hợp demo/local)
    if (!customer) return { allowed: true, reason: 'local_user', user };

    // Admin đã tắt tài khoản
    if (!customer.enabled) return { allowed: false, reason: 'disabled', customer };

    // Kiểm tra hết hạn
    const today = new Date().toISOString().slice(0, 10);
    if (customer.expire < today) return { allowed: false, reason: 'expired', customer };

    // Đồng bộ thông tin plan từ admin xuống user
    if (customer.plan !== user.plan) {
      user.plan = customer.plan;
      this.saveCurrentUser(user);
    }

    return { allowed: true, reason: 'active', customer, user };
  },

  // ===== KIỂM TRA QUOTA VIDEO =====
  checkVideoQuota() {
    const user = this.getCurrentUser();
    const plan = user.plan || 'basic';
    const max = this.PLANS[plan]?.videoPerDay || 1;
    const today = new Date().toISOString().slice(0, 10);
    const used = parseInt(localStorage.getItem(`vpost_video_${user.phone}_${today}`) || '0');
    return { max, used, remaining: Math.max(0, max - used), plan };
  },

  useVideoQuota() {
    const user = this.getCurrentUser();
    const today = new Date().toISOString().slice(0, 10);
    const key = `vpost_video_${user.phone}_${today}`;
    const used = parseInt(localStorage.getItem(key) || '0');
    localStorage.setItem(key, used + 1);
  },

  // ===== ADMIN: KÍCH HOẠT TÀI KHOẢN =====
  activateCustomer(phone, plan, durationDays) {
    const customers = this.getCustomers();
    const idx = customers.findIndex(c => c.phone === phone);
    const expire = new Date();
    expire.setDate(expire.getDate() + (durationDays || 30));
    const expireStr = expire.toISOString().slice(0, 10);

    if (idx >= 0) {
      customers[idx].enabled = true;
      customers[idx].plan = plan || customers[idx].plan;
      customers[idx].expire = expireStr;
      customers[idx].status = plan === 'trial' ? 'trial' : 'active';
    } else {
      customers.push({ phone, plan: plan || 'basic', enabled: true, expire: expireStr, status: 'active' });
    }
    this.saveCustomers(customers);
  },

  // ===== ADMIN: TẮT TÀI KHOẢN =====
  disableCustomer(phone) {
    const customers = this.getCustomers();
    const c = customers.find(c => c.phone === phone);
    if (c) { c.enabled = false; c.status = 'pending'; }
    this.saveCustomers(customers);
  },

  // ===== ADMIN: GIA HẠN =====
  extendCustomer(phone, months) {
    const customers = this.getCustomers();
    const c = customers.find(x => x.phone === phone);
    if (!c) return;
    const base = c.expire > new Date().toISOString().slice(0,10) ? new Date(c.expire) : new Date();
    base.setMonth(base.getMonth() + (months || 1));
    c.expire = base.toISOString().slice(0, 10);
    c.enabled = true;
    c.status = 'active';
    this.saveCustomers(customers);
  },

  // ===== ĐĂNG KÝ MỚI (tạo customer trong DB) =====
  registerCustomer(shopName, phone, plan) {
    const customers = this.getCustomers();
    const exists = customers.find(c => c.phone === phone);
    if (exists) return false;

    const expire = new Date();
    expire.setDate(expire.getDate() + (plan === 'trial' ? 3 : 30));

    customers.push({
      id: Date.now(),
      name: shopName,
      phone,
      plan: plan || 'trial',
      status: 'trial',
      enabled: true,
      expire: expire.toISOString().slice(0, 10),
      initial: shopName[0]?.toUpperCase() || 'S',
      createdAt: new Date().toISOString(),
    });
    this.saveCustomers(customers);
    return true;
  },

  // ===== SEED DATA MẪU CHO ADMIN (lần đầu) =====
  seedDemoData() {
    const existing = this.getCustomers();
    if (existing.length > 0) return;
    const today = new Date();
    const addDays = (d) => { const x = new Date(today); x.setDate(x.getDate() + d); return x.toISOString().slice(0,10); };
    this.saveCustomers([
      { id:1, name:'Tiệm Cà Phê Hương Xưa',  phone:'0901111222', plan:'basic',    status:'active',  enabled:true,  expire: addDays(30),  initial:'H' },
      { id:2, name:'Shop Thời Trang Hà My',   phone:'0912333444', plan:'standard', status:'active',  enabled:true,  expire: addDays(45),  initial:'H' },
      { id:3, name:'Bánh Ngọt Gia Linh',      phone:'0923555666', plan:'trial',    status:'trial',   enabled:true,  expire: addDays(2),   initial:'G' },
      { id:4, name:'Mỹ Phẩm Ngọc Trinh',      phone:'0934777888', plan:'pro',      status:'active',  enabled:true,  expire: addDays(60),  initial:'N' },
      { id:5, name:'Phở Bò Sài Gòn 88',       phone:'0945999000', plan:'basic',    status:'expired', enabled:false, expire: addDays(-5),  initial:'P' },
      { id:6, name:'Nước Ép Healthy Life',     phone:'0956123456', plan:'trial',    status:'trial',   enabled:true,  expire: addDays(1),   initial:'N' },
      { id:7, name:'Shop Giày Sneaker VN',     phone:'0967234567', plan:'standard', status:'pending', enabled:false, expire: addDays(30),  initial:'S' },
      { id:8, name:'Đồ Handmade Xinh',         phone:'0978345678', plan:'basic',    status:'active',  enabled:true,  expire: addDays(20),  initial:'Đ' },
      { id:9, name:'Cơm Tấm Bà Năm',          phone:'0989456789', plan:'trial',    status:'expired', enabled:false, expire: addDays(-2),  initial:'C' },
      { id:10, name:'Spa & Nail Luxury',        phone:'0990567890', plan:'pro',      status:'active',  enabled:true,  expire: addDays(90),  initial:'S' },
    ]);
  },
};

window.VpostAuth = VpostAuth;
