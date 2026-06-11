// ============================================================
// EDGE FUNCTION: harvest-page-photos
// Chạy mỗi ngày 08:00 VN (01:00 UTC) — TRƯỚC auto-generate-post 08:30 VN.
//
// Flow:
//   1. Lấy users có auto_post_enabled + FB page active
//   2. Gọi Graph API /{page_id}/photos?type=uploaded → ảnh page đã đăng
//   3. Upsert vào page_photos (refresh photo_url vì fbcdn URL có hạn)
//
// Auth: SCHEDULER_SECRET (giống auto-generate-post)
// Deploy: npx supabase functions deploy harvest-page-photos --no-verify-jwt
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const FB_GRAPH = "https://graph.facebook.com/v21.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface GraphImage { source: string; width: number; height: number }
interface GraphPhoto { id: string; images?: GraphImage[]; created_time?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ===== Verify SCHEDULER_SECRET (chấp nhận nhiều kiểu header như auto-generate-post) =====
  const expected = Deno.env.get("SCHEDULER_SECRET");
  if (!expected) return json({ error: "SCHEDULER_SECRET not configured" }, 500);
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const provided = bearer || req.headers.get("x-scheduler-secret") || req.headers.get("apikey") || "";
  if (provided !== expected) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const results: Array<{ user_id: string; status: string; detail?: string; photos?: number }> = [];

  try {
    // ===== 1. Users bật auto-post =====
    const { data: profiles, error: pErr } = await admin
      .from("profiles")
      .select("id")
      .eq("auto_post_enabled", true)
      .eq("enabled", true);
    if (pErr) return json({ error: "fetch_profiles_failed", detail: pErr.message }, 500);
    if (!profiles?.length) return json({ ok: true, processed: 0 });

    for (const profile of profiles) {
      const uid = profile.id;
      try {
        // ===== 2. Page active + token =====
        const { data: page } = await admin
          .from("fb_pages")
          .select("fb_page_id, page_access_token")
          .eq("user_id", uid)
          .eq("is_active", true)
          .single();
        if (!page) {
          results.push({ user_id: uid, status: "skipped", detail: "no_active_fb_page" });
          continue;
        }

        // ===== 3. Lấy ảnh page đã upload (tối đa 100 ảnh gần nhất) =====
        const url = `${FB_GRAPH}/${page.fb_page_id}/photos?type=uploaded&fields=id,images,created_time&limit=100&access_token=${encodeURIComponent(page.page_access_token)}`;
        const res = await fetch(url);
        const body = await res.json();

        // Log audit như mọi call Graph khác
        await admin.from("fb_api_log").insert({
          user_id: uid,
          endpoint: `/${page.fb_page_id}/photos`,
          status_code: res.status,
          request: { type: "uploaded", limit: 100 },
          response: res.ok ? { count: body?.data?.length ?? 0 } : body,
          error: res.ok ? null : JSON.stringify(body?.error ?? body),
        });

        if (!res.ok) {
          results.push({ user_id: uid, status: "error", detail: `graph_${res.status}` });
          continue;
        }

        const photos: GraphPhoto[] = body?.data ?? [];
        let upserted = 0;
        for (const ph of photos) {
          // Chọn bản ảnh to nhất nhưng ≤1500px (đủ nét cho FB, không quá nặng)
          const imgs = (ph.images ?? []).sort((a, b) => b.width - a.width);
          const best = imgs.find((i) => i.width <= 1500) ?? imgs[imgs.length - 1];
          if (!best?.source) continue;

          const { error: upErr } = await admin.from("page_photos").upsert({
            user_id: uid,
            fb_page_id: page.fb_page_id,
            fb_photo_id: ph.id,
            photo_url: best.source,   // refresh URL mỗi lần harvest (fbcdn URL có hạn)
            width: best.width,
            height: best.height,
            harvested_at: new Date().toISOString(),
          }, { onConflict: "user_id,fb_photo_id" });
          if (!upErr) upserted++;
        }

        results.push({ user_id: uid, status: "ok", photos: upserted });
      } catch (userErr) {
        results.push({ user_id: uid, status: "error", detail: String(userErr) });
      }
    }

    const summary = {
      ok: true,
      total: profiles.length,
      harvested: results.filter((r) => r.status === "ok").length,
      results,
    };
    console.log("harvest-page-photos summary:", JSON.stringify(summary));
    return json(summary);
  } catch (e) {
    console.error("harvest-page-photos fatal error:", e);
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
