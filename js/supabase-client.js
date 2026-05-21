// ============================================================
// VPOST — SUPABASE CLIENT (Frontend)
// Load sau cùng trong <head> hoặc trước </body>:
//   <script src="https://esm.sh/@supabase/supabase-js@2.45.4"></script>
//   <script src="js/supabase-client.js"></script>
//
// SAU KHI TẠO PROJECT SUPABASE:
//   1. Vào https://app.supabase.com → chọn project → Settings → API
//   2. Copy "Project URL" và "anon public" key
//   3. Paste vào 2 biến bên dưới
// ============================================================

(function () {
  // ⚠️ Project: vpost-prod (Reference: elfswkmautcyrrkecrns)
  const SUPABASE_URL      = "https://elfswkmautcyrrkecrns.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_btXlJDohdiGYxJc66qudKA_aHmNg7aB";

  // Kiểm tra SDK đã load chưa
  if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
    console.error(
      "[Vpost] Chưa load Supabase SDK. Thêm vào HTML:\n" +
      '<script src="https://esm.sh/@supabase/supabase-js@2.45.4"></script>'
    );
    return;
  }

  // Cảnh báo nếu còn placeholder
  if (SUPABASE_URL === "YOUR_PROJECT_URL" || SUPABASE_ANON_KEY === "YOUR_ANON_KEY") {
    console.warn(
      "[Vpost] ⚠️ Bạn chưa điền SUPABASE_URL và SUPABASE_ANON_KEY trong js/supabase-client.js.\n" +
      "Xem hướng dẫn tại SETUP.md → Bước 6."
    );
  }

  // Tạo client (auto persist session vào localStorage)
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: "vpost-auth",
    },
  });

  // Expose ra global
  window.vpostSupabase = client;

  // ============================================================
  // HELPER: Generate caption qua Edge Function
  // Dùng: const r = await vpostGenerateCaption({tone:'fun', topic:'cuối tuần'})
  // Return: { captions: [...], quota: {...} } HOẶC { error: '...' }
  // ============================================================
  window.vpostGenerateCaption = async function ({ tone, userDesc, topic } = {}) {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return { error: "not_logged_in", message: "Vui lòng đăng nhập lại." };

      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-caption`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tone, userDesc, topic }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Map error sang message tiếng Việt thân thiện
        const msgMap = {
          quota_exceeded:    `Bạn đã dùng hết ${data.quota?.limit ?? 0} caption hôm nay. Quay lại sau 0h hoặc nâng cấp gói.`,
          plan_expired:      "Gói của bạn đã hết hạn. Vào trang Tài khoản để gia hạn.",
          account_disabled:  "Tài khoản đang bị tạm khoá. Liên hệ admin.",
          missing_auth:      "Chưa đăng nhập.",
          invalid_auth:      "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.",
          profile_not_found: "Không tìm thấy thông tin shop. Hãy điền ở trang Cài đặt.",
          missing_ai_key:    "Server chưa cấu hình AI. Báo cho admin.",
          ai_returned_empty: "AI tạm thời không trả lời, hãy thử lại.",
        };
        return {
          error: data.error || "unknown",
          message: msgMap[data.error] || `Lỗi: ${data.error || res.status}`,
          quota: data.quota,
        };
      }

      return data; // { captions, quota, tokens }
    } catch (e) {
      console.error("[Vpost] generate caption error:", e);
      return { error: "network_error", message: "Lỗi mạng, hãy kiểm tra kết nối." };
    }
  };

  // ============================================================
  // HELPER: Auth shortcut
  // ============================================================
  window.vpostAuth = {
    // Đăng ký bằng SĐT + mật khẩu (Supabase yêu cầu phone format E.164: +84901234567)
    signUp: async (phone, password) => {
      const formatted = phone.startsWith("+") ? phone : "+84" + phone.replace(/^0/, "");
      return await client.auth.signUp({ phone: formatted, password });
    },
    signIn: async (phone, password) => {
      const formatted = phone.startsWith("+") ? phone : "+84" + phone.replace(/^0/, "");
      return await client.auth.signInWithPassword({ phone: formatted, password });
    },
    signOut: async () => await client.auth.signOut(),
    getUser: async () => {
      const { data } = await client.auth.getUser();
      return data.user;
    },
    onChange: (cb) => client.auth.onAuthStateChange(cb),
  };

  // ============================================================
  // HELPER: Profile shortcuts
  // ============================================================
  window.vpostProfile = {
    get: async () => {
      const user = await window.vpostAuth.getUser();
      if (!user) return null;
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (error) console.warn("[Vpost] profile.get error:", error);
      return data;
    },
    update: async (patch) => {
      const user = await window.vpostAuth.getUser();
      if (!user) return { error: "not_logged_in" };
      const { data, error } = await client
        .from("profiles")
        .update(patch)
        .eq("id", user.id)
        .select()
        .single();
      return { data, error };
    },
  };

  // ============================================================
  // HELPER: Posts shortcuts
  // ============================================================
  window.vpostPosts = {
    list: async ({ status, limit = 50 } = {}) => {
      let q = client.from("posts").select("*").order("scheduled_at", { ascending: false }).limit(limit);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      return { data: data || [], error };
    },
    create: async (post) => {
      const user = await window.vpostAuth.getUser();
      if (!user) return { error: "not_logged_in" };
      return await client.from("posts").insert({ ...post, user_id: user.id }).select().single();
    },
    update: async (id, patch) => {
      return await client.from("posts").update(patch).eq("id", id).select().single();
    },
    remove: async (id) => {
      return await client.from("posts").delete().eq("id", id);
    },
  };

  console.log("[Vpost] Supabase client ready ✓");
})();
