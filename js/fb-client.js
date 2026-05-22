// ============================================================
// VPOST — FB OAUTH CLIENT HELPERS
// Yêu cầu: đã load js/supabase-client.js (window.vpostSupabase)
//
// Public API (gắn vào window):
//   window.vpostFB.startConnect()          → mở FB OAuth dialog
//   window.vpostFB.handleCallback(params)  → gọi từ fb-callback.html
//   window.vpostFB.disconnect()            → xóa FB connection của user
//   window.vpostFB.getStatus()             → { connected, activePage, allPages }
// ============================================================

(function () {
  // ⚠️ Sau khi tạo FB App, điền App ID vào đây (App Secret KHÔNG bao giờ để ở frontend)
  const FB_APP_ID = window.VPOST_FB_APP_ID || ""; // có thể override trước khi load script

  const REQUIRED_SCOPES = [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
  ].join(",");

  function redirectUri() {
    // Phải khớp với "Valid OAuth Redirect URIs" trong FB App settings
    return window.location.origin + "/fb-callback.html";
  }

  function buildOAuthUrl() {
    if (!FB_APP_ID) {
      throw new Error("FB_APP_ID chưa được cấu hình. Set window.VPOST_FB_APP_ID trước khi load script.");
    }
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("vpost_fb_oauth_state", state);

    const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    u.searchParams.set("client_id", FB_APP_ID);
    u.searchParams.set("redirect_uri", redirectUri());
    u.searchParams.set("scope", REQUIRED_SCOPES);
    u.searchParams.set("state", state);
    u.searchParams.set("response_type", "code");
    return u.toString();
  }

  async function startConnect() {
    const supa = window.vpostSupabase;
    if (!supa) throw new Error("Supabase client chưa load");
    const { data: { session } } = await supa.auth.getSession();
    if (!session) {
      alert("Bạn cần đăng nhập Vpost trước.");
      window.location.href = "/login.html";
      return;
    }
    window.location.href = buildOAuthUrl();
  }

  async function handleCallback(params) {
    // params: URLSearchParams từ window.location.search
    const supa = window.vpostSupabase;
    if (!supa) throw new Error("Supabase client chưa load");

    const code = params.get("code");
    const state = params.get("state");
    const expectedState = sessionStorage.getItem("vpost_fb_oauth_state");
    sessionStorage.removeItem("vpost_fb_oauth_state");

    const fbError = params.get("error");
    if (fbError) {
      return { ok: false, error: params.get("error_description") || fbError };
    }
    if (!code) return { ok: false, error: "Missing authorization code" };
    if (!state || state !== expectedState) {
      return { ok: false, error: "Invalid state (CSRF check failed)" };
    }

    const { data: { session } } = await supa.auth.getSession();
    if (!session) return { ok: false, error: "Bạn chưa đăng nhập Vpost" };

    // Gọi Edge Function exchange
    const url = supa.supabaseUrl + "/functions/v1/fb-oauth-exchange";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ code, redirect_uri: redirectUri() }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Exchange failed", details: data };
    }
    return { ok: true, fb_user: data.fb_user, pages: data.pages };
  }

  async function disconnect() {
    const supa = window.vpostSupabase;
    if (!supa) throw new Error("Supabase client chưa load");
    const { data, error } = await supa.rpc("disconnect_fb");
    if (error) throw error;
    return data;
  }

  async function getStatus() {
    const supa = window.vpostSupabase;
    if (!supa) throw new Error("Supabase client chưa load");
    const { data: { session } } = await supa.auth.getSession();
    if (!session) return { connected: false };

    const { data: conn } = await supa
      .from("fb_connections")
      .select("fb_user_id, fb_user_name, token_expires_at, is_active")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!conn) return { connected: false };

    const { data: pages } = await supa
      .from("fb_pages")
      .select("id, fb_page_id, page_name, picture_url, is_active")
      .eq("user_id", session.user.id)
      .order("added_at", { ascending: false });

    const allPages = pages ?? [];
    const activePage = allPages.find((p) => p.is_active) || null;
    return { connected: true, fb_user: conn, activePage, allPages };
  }

  async function setActivePage(pageRowId) {
    const supa = window.vpostSupabase;
    if (!supa) throw new Error("Supabase client chưa load");
    const { data: { session } } = await supa.auth.getSession();
    if (!session) throw new Error("Bạn chưa đăng nhập");
    const { error } = await supa
      .from("fb_pages")
      .update({ is_active: true })
      .eq("id", pageRowId)
      .eq("user_id", session.user.id);
    if (error) throw error;
    return { ok: true };
  }

  // Post a single post_id to active FB Page (gọi Edge Function fb-post)
  async function postToFB(postId) {
    const supa = window.vpostSupabase;
    if (!supa) throw new Error("Supabase client chưa load");
    const { data: { session } } = await supa.auth.getSession();
    if (!session) throw new Error("Bạn chưa đăng nhập");
    const url = supa.supabaseUrl + "/functions/v1/fb-post";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify({ post_id: postId }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "FB post failed");
    }
    return data;
  }

  window.vpostFB = {
    startConnect,
    handleCallback,
    disconnect,
    getStatus,
    setActivePage,
    postToFB,
  };
})();
