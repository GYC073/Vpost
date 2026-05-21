// ============================================================
// EDGE FUNCTION: generate-caption
// POST /functions/v1/generate-caption
// Body: { tone?, userDesc?, topic? }
// Returns: { captions: string[], quota: { limit, used, remaining } }
//
// Deploy: npx supabase functions deploy generate-caption
// Secrets needed:
//   ANTHROPIC_API_KEY (set via: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";

// Quota mỗi ngày theo plan
const PLAN_QUOTA: Record<string, number> = {
  trial: 5,
  basic: 30,
  standard: 60,
  pro: 150,
};

const TONE_MAP: Record<string, string> = {
  friendly: "thân thiện, gần gũi, dễ thương",
  fun: "vui vẻ, nhiệt huyết, hài hước nhẹ",
  luxury: "sang trọng, tinh tế, chuyên nghiệp",
  sale: "kêu gọi mua hàng mạnh mẽ, có sức thuyết phục, có FOMO",
  genz: "trẻ trung, dùng tiếng lóng Gen Z, slang Việt như 'cháy', 'gút chóp', 'real'",
};

const INDUSTRY_LABEL: Record<string, string> = {
  coffee: "cà phê / đồ uống",
  fashion: "thời trang",
  beauty: "mỹ phẩm / làm đẹp",
  food: "ẩm thực / nhà hàng",
  tech: "điện tử / công nghệ",
  home: "nội thất / gia dụng",
  health: "sức khoẻ / dược phẩm",
  education: "giáo dục / đào tạo",
  furniture: "buôn bán nội thất",
  sport: "thể thao / fitness",
  other: "kinh doanh",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_auth" }, 401);

    // ----- Init Supabase với token của user (để áp RLS đúng) -----
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // ----- Service client để insert vào usage_log (bypass RLS) -----
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "invalid_auth" }, 401);

    // ----- Load profile -----
    const { data: profile, error: profileErr } = await supabaseUser
      .from("profiles")
      .select("shop_name, industry, shop_desc, plan, plan_expires_at, enabled")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) return json({ error: "profile_not_found" }, 404);

    // ----- Kiểm tra plan -----
    if (!profile.enabled) {
      return json({ error: "account_disabled" }, 403);
    }
    if (profile.plan_expires_at && new Date(profile.plan_expires_at) < new Date()) {
      return json({ error: "plan_expired" }, 402);
    }

    // ----- Kiểm tra quota -----
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: usedToday } = await supabaseAdmin
      .from("usage_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action", "caption_generate")
      .gte("created_at", todayStart.toISOString());

    const quota = PLAN_QUOTA[profile.plan] ?? 5;
    const used = usedToday ?? 0;

    if (used >= quota) {
      return json({
        error: "quota_exceeded",
        quota: { limit: quota, used, remaining: 0 },
      }, 429);
    }

    // ----- Parse body -----
    const body = await req.json().catch(() => ({}));
    const tone = String(body.tone ?? "fun");
    const userDesc = String(body.userDesc ?? "").slice(0, 300);
    const topic = String(body.topic ?? "").slice(0, 200);

    // ----- Lấy 10 caption gần nhất để anti-repeat -----
    const { data: history } = await supabaseUser
      .from("caption_history")
      .select("caption")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(10);

    const recent = (history ?? [])
      .map((h, i) => `${i + 1}. ${h.caption}`)
      .join("\n") || "(chưa có caption nào)";

    const industryLabel = INDUSTRY_LABEL[profile.industry ?? "other"] ?? "kinh doanh";
    const toneLabel = TONE_MAP[tone] ?? TONE_MAP.fun;

    const systemPrompt = `Bạn là chuyên gia viết caption Facebook cho các shop nhỏ ở Việt Nam.
Quy tắc:
- Viết tiếng Việt tự nhiên, NGẮN GỌN (60-130 chữ mỗi caption).
- Có 1-3 emoji vừa phải, đặt đúng chỗ (không nhồi cuối câu).
- KHÔNG dùng hashtag dài lê thê — tối đa 2-3 hashtag ngắn ở cuối.
- Mỗi caption phải có CTA (call-to-action) rõ ràng.
- Phù hợp văn hoá người Việt, không "dịch máy".
- TRÁNH lặp lại ý/cấu trúc các caption đã sinh gần đây.
- Mỗi caption tách nhau bằng dòng riêng chứa "---".`;

    const userPrompt = `Shop: "${profile.shop_name ?? "Shop"}" — ngành ${industryLabel}.
Mô tả shop: ${profile.shop_desc ?? "(chủ shop chưa điền)"}
Tone giọng: ${toneLabel}
${topic ? `Chủ đề hôm nay: ${topic}` : ""}
${userDesc ? `Gợi ý thêm từ chủ shop: ${userDesc}` : ""}

10 caption shop đã đăng gần đây (TRÁNH viết lặp):
${recent}

Hãy viết 3 caption KHÁC BIỆT, mỗi caption tách bằng "---" trên dòng riêng.`;

    // ----- Gọi Claude Haiku -----
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "missing_ai_key" }, 500);

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const captions = text
      .split(/^\s*---\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 20)
      .slice(0, 3);

    if (captions.length === 0) {
      return json({ error: "ai_returned_empty", raw: text }, 502);
    }

    // ----- Log usage + lưu history (qua service client để chắc chắn ghi được) -----
    const inputTokens = msg.usage.input_tokens;
    const outputTokens = msg.usage.output_tokens;
    // Pricing Claude Haiku 4.5 (USD per 1M tokens): input $0.25, output $1.25
    const costUsd = (inputTokens * 0.25 + outputTokens * 1.25) / 1_000_000;

    await supabaseAdmin.from("usage_log").insert({
      user_id: user.id,
      action: "caption_generate",
      tokens_input: inputTokens,
      tokens_output: outputTokens,
      cost_usd: costUsd,
    });

    await supabaseAdmin.from("caption_history").insert(
      captions.map((c) => ({ user_id: user.id, caption: c, tone, topic: topic || null }))
    );

    return json({
      captions,
      quota: { limit: quota, used: used + 1, remaining: Math.max(0, quota - used - 1) },
      tokens: { input: inputTokens, output: outputTokens, cost_usd: costUsd },
    });
  } catch (e) {
    console.error("generate-caption error:", e);
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
