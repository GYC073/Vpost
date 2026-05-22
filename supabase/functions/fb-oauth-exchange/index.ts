// ============================================================
// EDGE FUNCTION: fb-oauth-exchange
// POST /functions/v1/fb-oauth-exchange
// Body: { code: string, redirect_uri: string }
// Headers: Authorization: Bearer <user_jwt>
// Returns: { ok: true, fb_user: {...}, pages: [{ fb_page_id, page_name, picture_url, ... }] }
//
// Deploy:    npx supabase functions deploy fb-oauth-exchange
// Secrets:   npx supabase secrets set FB_APP_ID=... FB_APP_SECRET=...
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FB_GRAPH = "https://graph.facebook.com/v21.0";

interface ExchangeBody {
  code: string;
  redirect_uri: string;
}

interface FbPageRaw {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  picture?: { data?: { url?: string } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ===== 1) Auth =====
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "missing bearer token" }, 401);
    }

    const FB_APP_ID = Deno.env.get("FB_APP_ID");
    const FB_APP_SECRET = Deno.env.get("FB_APP_SECRET");
    if (!FB_APP_ID || !FB_APP_SECRET) {
      return json({ error: "FB_APP_ID / FB_APP_SECRET not configured" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client với JWT để biết user là ai
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResp, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userResp.user) {
      return json({ error: "invalid user" }, 401);
    }
    const userId = userResp.user.id;

    // ===== 2) Parse body =====
    const body = (await req.json()) as ExchangeBody;
    if (!body.code || !body.redirect_uri) {
      return json({ error: "missing code or redirect_uri" }, 400);
    }

    // ===== 3) Exchange code → short-lived token =====
    const exchangeUrl = new URL(`${FB_GRAPH}/oauth/access_token`);
    exchangeUrl.searchParams.set("client_id", FB_APP_ID);
    exchangeUrl.searchParams.set("client_secret", FB_APP_SECRET);
    exchangeUrl.searchParams.set("redirect_uri", body.redirect_uri);
    exchangeUrl.searchParams.set("code", body.code);

    const shortRes = await fetch(exchangeUrl.toString());
    const shortData = await shortRes.json();
    if (!shortRes.ok || !shortData.access_token) {
      return json({ error: "exchange failed", fb: shortData }, 400);
    }
    const shortToken = shortData.access_token as string;

    // ===== 4) Upgrade → long-lived token (~60 ngày) =====
    const longUrl = new URL(`${FB_GRAPH}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", FB_APP_ID);
    longUrl.searchParams.set("client_secret", FB_APP_SECRET);
    longUrl.searchParams.set("fb_exchange_token", shortToken);

    const longRes = await fetch(longUrl.toString());
    const longData = await longRes.json();
    if (!longRes.ok || !longData.access_token) {
      return json({ error: "long-lived exchange failed", fb: longData }, 400);
    }
    const longToken = longData.access_token as string;
    const expiresIn = (longData.expires_in as number) ?? 60 * 24 * 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // ===== 5) Fetch FB user info =====
    const meRes = await fetch(`${FB_GRAPH}/me?fields=id,name&access_token=${longToken}`);
    const meData = await meRes.json();
    if (!meRes.ok || !meData.id) {
      return json({ error: "fetch me failed", fb: meData }, 400);
    }

    // ===== 6) Fetch pages user manages =====
    const pagesRes = await fetch(
      `${FB_GRAPH}/me/accounts?fields=id,name,access_token,category,picture{url}&access_token=${longToken}`,
    );
    const pagesData = await pagesRes.json();
    if (!pagesRes.ok) {
      return json({ error: "fetch pages failed", fb: pagesData }, 400);
    }
    const rawPages: FbPageRaw[] = pagesData.data ?? [];

    // ===== 7) Save to DB (service_role bypasses RLS) =====
    const admin = createClient(supabaseUrl, serviceKey);

    const { error: connErr } = await admin.from("fb_connections").upsert(
      {
        user_id: userId,
        fb_user_id: meData.id,
        fb_user_name: meData.name,
        access_token: longToken,
        token_expires_at: expiresAt.toISOString(),
        granted_scopes: shortData.granted_scopes ?? null,
        last_refreshed_at: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: "user_id" },
    );
    if (connErr) {
      return json({ error: "save connection failed", db: connErr.message }, 500);
    }

    // Upsert pages (preserve is_active flag if exists)
    const pagesToUpsert = rawPages.map((p) => ({
      user_id: userId,
      fb_page_id: p.id,
      page_name: p.name,
      page_access_token: p.access_token,
      page_category: p.category ?? null,
      picture_url: p.picture?.data?.url ?? null,
    }));

    if (pagesToUpsert.length > 0) {
      const { error: pagesErr } = await admin
        .from("fb_pages")
        .upsert(pagesToUpsert, { onConflict: "user_id,fb_page_id", ignoreDuplicates: false });
      if (pagesErr) {
        return json({ error: "save pages failed", db: pagesErr.message }, 500);
      }
    }

    // ===== 8) Return summary =====
    return json({
      ok: true,
      fb_user: { id: meData.id, name: meData.name },
      pages: rawPages.map((p) => ({
        fb_page_id: p.id,
        page_name: p.name,
        page_category: p.category ?? null,
        picture_url: p.picture?.data?.url ?? null,
      })),
      token_expires_at: expiresAt.toISOString(),
    });
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
