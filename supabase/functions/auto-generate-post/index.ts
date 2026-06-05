// ============================================================
// EDGE FUNCTION: auto-generate-post
// Chạy mỗi ngày lúc 8:30 sáng giờ VN (01:30 UTC)
//
// Flow:
//   1. Lấy tất cả users có auto_post_enabled = true + plan hợp lệ + có FB page active
//   2. Với mỗi user: check chưa có auto post hôm nay + chưa quá quota bài/ngày
//   3. Generate caption (Claude Haiku) theo ngành + tên shop
//   4. Insert post với status='scheduled', scheduled_at = 10:00 VN hôm nay
//   5. fb-scheduler cron */5 sẽ tự pick up và đăng lúc 10h
//
// Auth: SCHEDULER_SECRET (giống fb-scheduler)
// Deploy: npx supabase functions deploy auto-generate-post --no-verify-jwt
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Số bài/ngày theo plan
const POST_QUOTA: Record<string, number> = {
  trial: 1,
  basic: 1,
  standard: 2,
  pro: 2,
};

// AI caption quota/ngày theo plan
const AI_QUOTA: Record<string, number> = {
  trial: 5,
  basic: 30,
  standard: 60,
  pro: 150,
};

const INDUSTRY_LABEL: Record<string, string> = {
  coffee:     "cà phê / đồ uống",
  fashion:    "thời trang",
  beauty:     "mỹ phẩm / làm đẹp",
  food:       "ẩm thực / nhà hàng",
  tech:       "điện tử / công nghệ",
  home:       "nội thất / gia dụng",
  health:     "sức khoẻ / dược phẩm",
  education:  "giáo dục / đào tạo",
  furniture:  "buôn bán nội thất",
  sport:      "thể thao / fitness",
  realestate: "bất động sản",
  shoes:      "giày dép",
  authentic:  "hàng authentic / hàng hiệu",
  perfume:    "nước hoa",
  other:      "kinh doanh",
};

// Pool chủ đề — CHỌN NGẪU NHIÊN mỗi ngày (không gán cứng theo thứ để tránh lặp nhịp tuần)
const TOPIC_POOL = [
  "giới thiệu sản phẩm mới về hoặc bán chạy nhất",
  "chia sẻ mẹo hay / kiến thức liên quan ngành hàng",
  "câu chuyện khách hàng thật / feedback tích cực",
  "flash sale hoặc ưu đãi sắp tới",
  "behind the scenes / một ngày của shop",
  "sản phẩm combo / gợi ý quà tặng",
  "cảm ơn khách hàng + nhắc đến sản phẩm hot",
  "đính chính 1 hiểu lầm phổ biến trong ngành",
  "so sánh giúp khách chọn đúng (kiểu A vs kiểu B)",
  "giải đáp 1 câu hỏi khách hay thắc mắc",
  "mẹo bảo quản / dùng sản phẩm bền đẹp",
  "khoảnh khắc đời thường ở shop (chân thật, không bán hàng lộ liễu)",
];

// Các kiểu mở bài — chọn ngẫu nhiên 1 kiểu mỗi ngày để caption không cùng giọng
const OPENING_ANGLES = [
  "một câu hỏi bất ngờ khiến người đọc khựng lại",
  "một quan sát đời thường rất relatable",
  "kể 1 khoảnh khắc/tình huống thật (mini-story)",
  "một con số hoặc chi tiết cụ thể gây tò mò",
  "một mẹo dùng được ngay",
  "một lời thú nhận thật lòng của chủ shop",
  "mở bằng cảm giác cụ thể (mát, êm, thơm, nhẹ tay...)",
  "một câu nói vu vơ như đang nhắn cho bạn thân",
];

// Cắt chuỗi theo CODE POINT (không xẻ đôi emoji / surrogate pair như String.slice)
function safeTruncate(s: string, n: number): string {
  return [...(s ?? "")].slice(0, n).join("");
}

// Loại bỏ surrogate lẻ (nửa emoji) — nếu lọt vào JSON gửi Anthropic sẽ gây
// lỗi 400 "no low surrogate in string". Đây là lớp phòng thủ cuối cùng.
function stripLoneSurrogates(s: string): string {
  return (s ?? "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Trả về thời điểm 10:00 AM VN hôm nay (UTC)
function getTodayAt10hVN(): Date {
  const now = new Date();
  // VN = UTC+7, nên 10:00 VN = 03:00 UTC
  const utcDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    3, 0, 0, 0  // 03:00 UTC = 10:00 VN
  ));
  return utcDate;
}

// Trả về ngày hôm nay theo VN (UTC+7) ở dạng YYYY-MM-DD
function getTodayVN(): string {
  const now = new Date();
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return vnTime.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ===== Verify SCHEDULER_SECRET =====
  const expected = Deno.env.get("SCHEDULER_SECRET");
  if (!expected) return json({ error: "SCHEDULER_SECRET not configured" }, 500);

  // Chấp nhận secret qua nhiều cách để chịu được mọi kiểu cấu hình cron:
  //   - Authorization: Bearer <secret>
  //   - x-scheduler-secret: <secret>
  //   - apikey: <secret>
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const provided = bearer || req.headers.get("x-scheduler-secret") || req.headers.get("apikey") || "";
  if (provided !== expected) {
    console.warn("auto-generate-post: unauthorized (secret mismatch)");
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

  const anthropic = new Anthropic({ apiKey });

  const todayVN = getTodayVN();
  const nowUTC = new Date();

  // Mục tiêu: hẹn giờ đăng lúc 10:00 VN hôm nay.
  // Nếu cron chạy TRỄ (đã quá 10:00 VN) → KHÔNG bỏ qua nữa, mà hẹn đăng sau 3 phút
  // để bài vẫn ra trong ngày. Chống lỗi "skip âm thầm" khi cron lệch giờ.
  let scheduledAt = getTodayAt10hVN();
  let scheduleNote = "10:00 VN";
  if (nowUTC >= scheduledAt) {
    scheduledAt = new Date(nowUTC.getTime() + 3 * 60 * 1000);
    scheduleNote = "now+3min (cron chạy sau 10:00 VN)";
  }
  console.log(`auto-generate-post start — todayVN=${todayVN}, scheduledAt=${scheduledAt.toISOString()} (${scheduleNote})`);

  const results: Array<{user_id: string; status: string; detail?: string}> = [];

  try {
    // ===== 1. Lấy users cần auto-generate =====
    const { data: profiles, error: profilesErr } = await admin
      .from("profiles")
      .select("id, shop_name, industry, shop_desc, plan, plan_expires_at, enabled")
      .eq("auto_post_enabled", true)
      .eq("enabled", true);

    if (profilesErr) return json({ error: "fetch_profiles_failed", detail: profilesErr.message }, 500);
    if (!profiles || profiles.length === 0) return json({ ok: true, processed: 0, message: "No users with auto post enabled" });

    for (const profile of profiles) {
      const uid = profile.id;

      try {
        // ===== 2. Check plan còn hiệu lực =====
        if (profile.plan_expires_at && new Date(profile.plan_expires_at) < nowUTC) {
          results.push({ user_id: uid, status: "skipped", detail: "plan_expired" });
          continue;
        }

        // ===== 3. Check có FB page active không =====
        const { data: fbPage } = await admin
          .from("fb_pages")
          .select("fb_page_id")
          .eq("user_id", uid)
          .eq("is_active", true)
          .single();

        if (!fbPage) {
          results.push({ user_id: uid, status: "skipped", detail: "no_active_fb_page" });
          continue;
        }

        // ===== 4. Check đã có auto post hôm nay chưa =====
        const todayStart = `${todayVN}T00:00:00+07:00`;
        const todayEnd   = `${todayVN}T23:59:59+07:00`;

        const { count: autoToday } = await admin
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("source", "auto")
          .gte("created_at", todayStart)
          .lte("created_at", todayEnd);

        if ((autoToday ?? 0) > 0) {
          results.push({ user_id: uid, status: "skipped", detail: "already_generated_today" });
          continue;
        }

        // ===== 5. Check quota bài/ngày chưa vượt =====
        const postQuota = POST_QUOTA[profile.plan] ?? 1;
        const { count: postsToday } = await admin
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid)
          .in("status", ["scheduled", "posted", "auto_posted", "posting"])
          .gte("scheduled_at", todayStart)
          .lte("scheduled_at", todayEnd);

        if ((postsToday ?? 0) >= postQuota) {
          results.push({ user_id: uid, status: "skipped", detail: "post_quota_reached" });
          continue;
        }

        // ===== 6. Check AI quota =====
        const aiQuota = AI_QUOTA[profile.plan] ?? 5;
        const { count: aiToday } = await admin
          .from("usage_log")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("action", "caption_generate")
          .gte("created_at", todayStart);

        if ((aiToday ?? 0) >= aiQuota) {
          results.push({ user_id: uid, status: "skipped", detail: "ai_quota_reached" });
          continue;
        }

        // ===== 7. Chọn chủ đề + kiểu mở bài NGẪU NHIÊN (đa dạng mỗi ngày) =====
        const topic = TOPIC_POOL[Math.floor(Math.random() * TOPIC_POOL.length)];
        const openingAngle = OPENING_ANGLES[Math.floor(Math.random() * OPENING_ANGLES.length)];

        const industryKey = profile.industry ?? "other";
        const industryLabel = INDUSTRY_LABEL[industryKey] ?? "kinh doanh";
        const shopName = profile.shop_name ?? "Shop";

        // ===== 8. Lấy caption history gần nhất để anti-repeat =====
        const { data: history } = await admin
          .from("caption_history")
          .select("caption")
          .eq("user_id", uid)
          .order("generated_at", { ascending: false })
          .limit(5);

        const recentContent = (history ?? [])
          .map((h: {caption: string}, i: number) => `${i + 1}. ${safeTruncate(h.caption, 80)}`)
          .join("\n") || "(chưa có)";

        // ===== 9. Generate caption với Claude Haiku =====
        const systemPrompt = `Bạn là người viết caption Facebook cho shop nhỏ Việt Nam — viết như chính chủ shop nhắn, không phải copywriter marketing.

TỪ TUYỆT ĐỐI KHÔNG DÙNG:
"đừng bỏ lỡ" / "chất lượng vượt trội" / "siêu hot" / "deal hấp dẫn" / "cơ hội vàng" / "đội ngũ chuyên nghiệp" / "sản phẩm uy tín" / "giá cực tốt" / "không thể bỏ lỡ" / "ưu đãi hấp dẫn" / "chất lượng cao" / "phục vụ tận tâm"

VIẾT NHƯ NGƯỜI VIỆT THẬT:
- Câu ngắn 5–10 chữ xen câu dài hơn
- Xuống dòng sau 1–2 câu
- CTA nhẹ tự nhiên: "ai cần nhắn mình", "nhắn shop nhé" (KHÔNG dùng "inbox ngay")
- Emoji 0–2 cái
- Hashtag 1–3 cái, cụ thể ngành/sản phẩm
- CẤM mở đầu bằng các cụm nhàm: "Sự thật", "Chuyện nhỏ mà dễ bị bỏ qua", "Hôm nay mình muốn nghe từ bạn", "Bạn có biết". KHÔNG lặp kiểu mở bài của các bài gần đây bên dưới.

ĐỘ DÀI: 40–90 chữ — ngắn nhưng đủ ý`;

        const userPrompt = `Shop: "${shopName}" — ngành ${industryLabel}.
Chủ đề hôm nay: ${topic}
${profile.shop_desc ? `Mô tả shop: ${profile.shop_desc}` : ""}

Bài đã đăng gần đây (tránh lặp ý VÀ tránh lặp kiểu mở bài):
${recentContent}

Hôm nay mở bài theo kiểu: ${openingAngle}.
(Hạt giống sáng tạo: ${Math.floor(Math.random() * 100000)} — viết khác các lần trước, đừng in số này ra.)

Viết 1 caption Facebook tự nhiên, đúng chủ đề hôm nay.`;

        const msg = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          system: stripLoneSurrogates(systemPrompt),
          messages: [{ role: "user", content: stripLoneSurrogates(userPrompt) }],
        });

        const caption = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
        if (!caption || caption.length < 20) {
          results.push({ user_id: uid, status: "error", detail: "ai_returned_empty" });
          continue;
        }

        // ===== 10. Insert post =====
        const { error: insertErr } = await admin.from("posts").insert({
          user_id: uid,
          caption,
          status: "scheduled",
          scheduled_at: scheduledAt.toISOString(),
          source: "auto",
        });

        if (insertErr) {
          results.push({ user_id: uid, status: "error", detail: insertErr.message });
          continue;
        }

        // ===== 11. Log usage =====
        const inputTokens = msg.usage.input_tokens;
        const outputTokens = msg.usage.output_tokens;
        const costUsd = (inputTokens * 0.25 + outputTokens * 1.25) / 1_000_000;

        await admin.from("usage_log").insert({
          user_id: uid,
          action: "caption_generate",
          tokens_input: inputTokens,
          tokens_output: outputTokens,
          cost_usd: costUsd,
        });

        await admin.from("caption_history").insert({
          user_id: uid,
          caption,
          tone: "friendly",
          topic,
          content_type: "facebook",
        });

        results.push({ user_id: uid, status: "ok" });

      } catch (userErr) {
        results.push({ user_id: uid, status: "error", detail: String(userErr) });
      }
    }

    const summary = {
      ok: true,
      total: profiles.length,
      generated: results.filter(r => r.status === "ok").length,
      skipped: results.filter(r => r.status === "skipped").length,
      errors: results.filter(r => r.status === "error").length,
      scheduled_for: scheduledAt.toISOString(),
      schedule_note: scheduleNote,
      results,
    };

    console.log("auto-generate-post summary:", JSON.stringify(summary));
    return json(summary);

  } catch (e) {
    console.error("auto-generate-post fatal error:", e);
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
