// ============================================================
// EDGE FUNCTION: fb-post
// POST /functions/v1/fb-post
// Body: { post_id: string }   — id của row trong public.posts
// Headers: Authorization: Bearer <user_jwt>   (hoặc service_role nếu scheduler gọi)
// Returns: { ok: true, fb_post_id: string }
//
// Deploy: npx supabase functions deploy fb-post
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FB_GRAPH = "https://graph.facebook.com/v21.0";

interface PostBody {
  post_id: string;
  user_id?: string; // chỉ dùng khi scheduler gọi (service_role)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const body = (await req.json()) as PostBody;
    if (!body.post_id) return json({ error: "missing post_id" }, 400);

    // ===== 1) Xác định user_id =====
    let userId: string | null = null;

    // Trường hợp scheduler gọi với service_role + user_id explicit
    if (body.user_id && authHeader.includes(serviceKey)) {
      userId = body.user_id;
    } else if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(
        supabaseUrl,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userResp } = await userClient.auth.getUser();
      userId = userResp.user?.id ?? null;
    }

    if (!userId) return json({ error: "unauthorized" }, 401);

    // ===== 2) Lấy post =====
    const { data: post, error: postErr } = await admin
      .from("posts")
      .select("id, user_id, caption, image_url, status")
      .eq("id", body.post_id)
      .eq("user_id", userId)
      .single();

    if (postErr || !post) return json({ error: "post not found" }, 404);
    if (post.status === "posted" || post.status === "auto_posted") {
      return json({ error: "already posted" }, 400);
    }

    // ===== 3) Lấy active page =====
    const { data: pageRows, error: pageErr } = await admin
      .rpc("get_active_fb_page", { user_id_in: userId });
    if (pageErr) return json({ error: "rpc failed", db: pageErr.message }, 500);

    const page = pageRows?.[0];
    if (!page) {
      await markFailed(admin, post.id, "no_active_page");
      return json({ error: "no active FB page" }, 400);
    }

    // ===== 4) Gọi FB Graph POST /{page-id}/photos hoặc /feed =====
    const hasImage = !!post.image_url;
    const endpoint = hasImage
      ? `${FB_GRAPH}/${page.fb_page_id}/photos`
      : `${FB_GRAPH}/${page.fb_page_id}/feed`;

    const payload = new URLSearchParams();
    payload.set("access_token", page.page_access_token);
    if (hasImage) {
      payload.set("url", post.image_url!);
      payload.set("caption", post.caption);
    } else {
      payload.set("message", post.caption);
    }

    const fbRes = await fetch(endpoint, {
      method: "POST",
      body: payload,
    });
    const fbData = await fbRes.json();

    // Log mọi call
    await admin.from("fb_api_log").insert({
      user_id: userId,
      post_id: post.id,
      endpoint: hasImage ? `/${page.fb_page_id}/photos` : `/${page.fb_page_id}/feed`,
      http_method: "POST",
      status_code: fbRes.status,
      request: { caption: post.caption, has_image: hasImage },
      response: fbData,
      error: fbRes.ok ? null : (fbData?.error?.message ?? "unknown"),
    });

    if (!fbRes.ok || (!fbData.id && !fbData.post_id)) {
      await markFailed(admin, post.id, fbData?.error?.message ?? "fb_error");
      return json({ error: "fb post failed", fb: fbData }, 502);
    }

    const fbPostId: string = (fbData.post_id as string) ?? (fbData.id as string);

    // ===== 5) Cập nhật post =====
    await admin
      .from("posts")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        fb_post_id: fbPostId,
        fb_page_id: page.fb_page_id,
        fb_error: null,
      })
      .eq("id", post.id);

    return json({ ok: true, fb_post_id: fbPostId, page_name: page.page_name });
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

async function markFailed(admin: ReturnType<typeof createClient>, postId: string, reason: string) {
  await admin
    .from("posts")
    .update({
      status: "failed",
      fb_error: reason,
      fb_retry_count: 0, // scheduler sẽ tăng
    })
    .eq("id", postId);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
