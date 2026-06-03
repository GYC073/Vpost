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

const STYLE_INSTRUCTIONS: Record<string, string> = {
  fb_real:  "Viết như người thật đang đăng Facebook cá nhân — câu ngắn dài xen kẽ, đôi khi thiếu chủ ngữ, lời lẽ đời thường tự nhiên. KHÔNG nghe như quảng cáo.",
  sales:    "Tạo urgency, nhấn mạnh lợi ích ngay từ đầu, CTA rõ ràng. Có FOMO nhẹ — nhưng vẫn nghe như người thật nói, không sỗ sàng.",
  luxury:   "Tone sang trọng, lịch lãm. Chọn từ tinh tế, câu có nhịp điệu. Emoji ít hoặc không dùng. Không dùng từ bình dân.",
  gen_z:    "Dùng từ ngữ Gen Z VN: 'ib', 'thả tim', 'cháy', 'gút chóp', 'real nha'. Câu cực ngắn, xuống dòng nhiều, vibe nhẹ nhàng trendy.",
  mom:      "Tone ấm áp như chị em bạn dì chia sẻ. Đề cập gia đình, con cái, cuộc sống hằng ngày nếu phù hợp. Gần gũi, thật lòng.",
  live:     "Mở bằng CTA mạnh hoặc câu hook ngay. Nhiều dòng ngắn. Urgency cao — 'còn ít lắm', 'giá chỉ tối nay'. Có câu hỏi để kéo tương tác.",
  viral:    "Mở đầu câu hook gây tò mò hoặc relatable mạnh. Có yếu tố bất ngờ hoặc gây tranh luận nhẹ — đọc xong phải share hoặc tag bạn.",
  short:    "Tối đa 35 chữ/caption. Mỗi từ đều cần thiết — không chữ thừa. Emoji 0–1 cái. Ngắn nhưng đủ ý.",
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
  realestate: "bất động sản (mua bán/cho thuê nhà đất, căn hộ, đất nền, dự án)",
  shoes:      "kinh doanh giày dép (form giày, size, chất liệu, phong cách, outfit phối đồ)",
  authentic:  "hàng authentic / hàng hiệu chính hãng (đảm bảo auth, tem chống giả, bill, check auth, hàng xịn)",
  perfume:    "kinh doanh nước hoa (mùi hương, nốt đầu/giữa/cuối, lưu hương, phong cách, dịp dùng)",
  other:      "kinh doanh",
};

// Few-shot caption examples cho từng ngành — giúp AI hiểu đúng tone, từ ngữ, cấu trúc
const INDUSTRY_EXAMPLES: Record<string, string[]> = {
  realestate: [
    `Bạn đang tìm nhà để ở hay để đầu tư? 🏠\n\nNhiều người nghĩ hai mục tiêu này mâu thuẫn — nhưng thực ra có những căn hộ vừa tiện nghi để ở, vừa có tiềm năng tăng giá tốt sau 3–5 năm.\n\nNhắn mình để được tư vấn miễn phí nhé! 👇\n\n#BatDongSan #NhaDat #DauTuThongMinh`,
    `3 điều PHẢI kiểm tra trước khi mua đất 📋\n\n1️⃣ Pháp lý — sổ đỏ/hồng đầy đủ chưa?\n2️⃣ Quy hoạch — khu đất có nằm vùng giải toả không?\n3️⃣ Hạ tầng — đường vào, điện, nước có sẵn chưa?\n\nMua đất phải kỹ — liên hệ mình để được hỗ trợ tận tình! 🏡\n\n#MuaDat #TuVanBDS #AnCuLapNghiep`,
    `Anh Minh vừa nhận nhà tuần trước 🎉\n\n"Pháp lý rõ ràng, giá hợp lý, hỗ trợ vay ngân hàng tận tình — mình rất hài lòng!"\n\nBạn cũng đang tìm nhà? Nhắn tin mình ngay — có danh sách căn hộ/đất nền nhiều tầm giá! 💬\n\n#NhaDat #MuaBanNhaDat #ChoThueNhaDat`,
  ],
  shoes: [
    `Đôi giày nói lên cả phong cách của bạn 👟\n\nMẫu mới về hôm nay — form chuẩn, đế êm, phối được mọi outfit từ đi làm đến dạo phố.\n\nSize 36–44, inbox ngay trước khi hết hàng nha! 🔥\n\n#GiayDep #NewArrival #OutfitOfTheDay`,
    `Mẹo phối đồ với giày trắng ai cũng cần biết 🤍\n\n✅ Jean xanh + áo thun → casual chill\n✅ Váy midi + giày trắng → nữ tính ngọt ngào\n✅ Quần tây + sơ mi → công sở xịn xò\n\nShop đang có nhiều mẫu giày trắng đẹp — DM để xem thêm nhé! 😍\n\n#GiayTrang #PhaDo #StyleViet`,
    `Còn đúng 3 đôi size 38 thôi nha 🫣\n\nMẫu này ra là hết vèo — form ôm chân, đế cao 3cm tạo dáng, chất liệu không bị hôi chân dù đi cả ngày.\n\nNhanh tay inbox trước khi hết nhé bạn ơi! 👇\n\n#GiayNu #SaleGiay #GiayDepGiaRe`,
  ],
  authentic: [
    `Mua hàng hiệu mà sợ hàng fake? 😤\n\nShop cam kết AUTH 100% — có bill mua hàng, tem chống giả, ảnh thực tế. Check auth thoải mái trước khi nhận hàng.\n\nTag người hay mua hàng hiệu để biết địa chỉ uy tín nhé! 💎\n\n#HangAuth #HangHieu #Auth100`,
    `Hàng auth khác hàng rep ở điểm nào? 🧐\n\nĐường may, logo, chất liệu — chuẩn từng chi tiết nhỏ nhất. Hàng auth không chỉ là thương hiệu, là đầu tư dài hạn: dùng bền, giữ giá, tự tin khi diện.\n\nShop có sẵn nhiều mẫu — DM để xem hàng và báo giá nhé!\n\n#Authentic #LuxuryGoods #HangXin`,
    `Unbox hàng mới về 📦✨\n\nVừa nhập về hôm nay, bill + hộp + phụ kiện đầy đủ 100%. Ai đang săn mẫu này nhắn inbox ngay — có ảnh thực tế gửi liền!\n\n#UnboxAuth #HangHieuAuth #NewArrival`,
  ],
  perfume: [
    `Mùi hương nói lên cá tính của bạn 🌸\n\nFloral nhẹ nhàng cho cô nàng dịu dàng — Woody ấm áp cho chàng trai lịch lãm — Fresh mát lạnh cho ngày hè năng động.\n\nShop có hơn 100 mẫu — inbox để được tư vấn mùi phù hợp nhất với bạn! 🌿\n\n#NuocHoa #Perfume #MuiHuong`,
    `Tại sao xịt lên người lại khác khi test trên giấy? 🤔\n\nVì mùi hương phản ứng với thân nhiệt và mùi da riêng của mỗi người — đó là lý do nước hoa rất "riêng" và đặc biệt.\n\nShop cho test thử trước khi mua, ưng 100% mới chốt! 💫\n\n#NuocHoa #TuVanNuocHoa #Perfume`,
    `Không biết tặng gì cho người thương? 💝\n\nMột chai nước hoa đúng mùi người ấy thích = điểm 10 tình cảm đảm bảo!\n\nShop tư vấn miễn phí + gói quà đẹp + ship toàn quốc. Nhắn mình ngay nha! 🎁\n\n#NuocHoaTangQua #GiftSet #Perfume`,
  ],
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
    const contentType = String(body.contentType ?? "facebook"); // facebook|shopee|livestream|reply
    const styleSamples = String(body.styleSamples ?? "").slice(0, 1500);
    const stylePreset  = String(body.stylePreset ?? "fb_real"); // fb_real|sales|luxury|gen_z|mom|live|viral|short

    // ----- Lấy 10 caption gần nhất để anti-repeat -----
    const { data: history } = await supabaseUser
      .from("caption_history")
      .select("caption")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(10);

    const allHistory = history ?? [];

    // 3 bài gần nhất → style guide (bắt chước giọng văn của shop)
    const styleGuide = allHistory.slice(0, 3)
      .map((h: {caption: string}, i: number) => `[Mẫu ${i + 1}]\n${h.caption}`)
      .join("\n\n");

    // 10 bài gần nhất → tránh lặp nội dung
    const recentContent = allHistory.slice(0, 10)
      .map((h: {caption: string}, i: number) => `${i + 1}. ${h.caption.slice(0, 80)}`)
      .join("\n") || "(chưa có)";

    const industryKey = profile.industry ?? "other";
    const industryLabel = INDUSTRY_LABEL[industryKey] ?? "kinh doanh";
    const toneLabel = TONE_MAP[tone] ?? TONE_MAP.fun;
    const industryExamples = INDUSTRY_EXAMPLES[industryKey] ?? [];

    // Ưu tiên: 1. styleSamples từ user, 2. caption history, 3. ví dụ ngành
    const referenceBlock = styleSamples
      ? `PHONG CÁCH VIẾT CỦA SHOP NÀY (chủ shop cung cấp) — học cách dùng từ, nhịp câu, cách đặt emoji (KHÔNG copy nội dung):\n${styleSamples}\n`
      : styleGuide
        ? `PHONG CÁCH VIẾT CỦA SHOP NÀY — bắt chước cách dùng từ, nhịp câu, độ dài, cách đặt emoji (KHÔNG copy nội dung):\n${styleGuide}\n`
        : industryExamples.length > 0
          ? `VÍ DỤ THAM KHẢO NGÀNH (học phong cách — KHÔNG copy):\n${industryExamples.map((ex: string, i: number) => `[Ví dụ ${i + 1}]\n${ex}`).join("\n\n")}\n`
          : "";

    // ── Prompt theo loại nội dung ──
    let systemPrompt = "";
    let userPrompt = "";

    if (contentType === "shopee") {
      systemPrompt = `Bạn là chuyên gia viết mô tả sản phẩm Shopee cho shop Việt Nam.
Viết 3 mẫu mô tả sản phẩm theo 3 phong cách khác nhau, tách bằng "---".
Mỗi mẫu gồm: Tiêu đề (<70 ký tự, có từ khoá), Mô tả ngắn (3-5 bullet điểm), Thông tin giao hàng/đổi trả.
KHÔNG dùng: "chất lượng cao", "giá tốt nhất", "uy tín", "chuyên nghiệp".
Viết thực tế, rõ ràng — người mua đọc là biết ngay sản phẩm có gì.`;
      userPrompt = `Shop: "${profile.shop_name ?? "Shop"}" — ngành ${industryLabel}.
Thông tin sản phẩm: ${userDesc || topic || "sản phẩm mới"}
${referenceBlock}
Viết 3 mẫu mô tả Shopee khác nhau, tách bằng "---".`;

    } else if (contentType === "livestream") {
      systemPrompt = `Bạn là chuyên gia viết kịch bản livestream bán hàng Facebook cho shop Việt Nam.
Viết 1 kịch bản livestream đầy đủ, tự nhiên như người thật nói — không cứng nhắc.
Cấu trúc: Mở màn (chào, giới thiệu) → Sản phẩm highlight (2-3 sản phẩm với điểm nhấn) → Mini game/voucher → CTA chốt đơn → Lời kết.
Tone: ${toneLabel}. Ngắn gọn, súc tích — mỗi phần 3-5 câu.`;
      userPrompt = `Shop: "${profile.shop_name ?? "Shop"}" — ngành ${industryLabel}.
Nội dung live: ${userDesc || topic || "giới thiệu sản phẩm mới"}
${referenceBlock}
Viết kịch bản livestream hoàn chỉnh.`;

    } else if (contentType === "reply") {
      systemPrompt = `Bạn là chuyên gia tư vấn bán hàng online cho shop Việt Nam.
Với comment/câu hỏi của khách, viết 3 mẫu trả lời theo 3 phong cách: [A – Thân thiện ngắn], [B – Chi tiết tư vấn], [C – Chốt đơn khéo].
Tách bằng "---". Mỗi mẫu 1-3 câu. KHÔNG dùng "dạ em", "bạn ơi" lặp đi lặp lại.
Viết như chính chủ shop đang nhắn — tự nhiên, không robot.`;
      userPrompt = `Shop: "${profile.shop_name ?? "Shop"}" — ngành ${industryLabel}.
Comment của khách: "${userDesc || "Sản phẩm này có tốt không?"}"
${referenceBlock}
Viết 3 mẫu trả lời, tách bằng "---".`;

    } else if (contentType === "hiring") {
      // ── Tuyển dụng: prompt riêng, không dùng rule Facebook generic ──
      systemPrompt = `Bạn là chuyên gia viết bài tuyển dụng Facebook cho shop nhỏ Việt Nam.
Viết 3 mẫu bài tuyển dụng theo 3 phong cách, tách bằng "---":
[A – Rõ ràng & trực tiếp] Thông tin ngắn gọn, cấu trúc rõ, dễ đọc — ai lướt qua cũng nắm được ngay
[B – Thân thiện & mời gọi] Tone ấm áp, nhấn vào môi trường làm việc vui, đồng nghiệp thân thiện
[C – Nhấn vào thu nhập] Highlight mức lương + phúc lợi lên đầu để thu hút người cần việc gấp

QUY TẮC:
- Mỗi bài 70–130 chữ (đủ thông tin, không dài dòng)
- PHẢI có đủ: vị trí, số lượng, lương, giờ làm, yêu cầu, cách liên hệ — nếu thiếu thì ghi "liên hệ để biết thêm"
- Được phép dùng "inbox" hoặc "nhắn tin" để ứng tuyển
- 2–4 hashtag tuyển dụng cụ thể (VD: #TuyenNhanVien #[TinhThanh] #ViTriCuThe)
- Emoji vừa đủ: 2–4 cái, đặt tự nhiên
Tone: ${toneLabel}`;

      userPrompt = `Shop: "${profile.shop_name ?? "Shop"}" — ngành ${industryLabel}.
${userDesc}
Viết 3 mẫu bài tuyển dụng Facebook, tách bằng "---".`;

    } else {
      // facebook (default)
      systemPrompt = `Bạn là người viết caption Facebook cho shop nhỏ Việt Nam — viết như chính chủ shop nhắn, không phải copywriter marketing.

TỪ TUYỆT ĐỐI KHÔNG DÙNG (dù chỉ 1 từ là loại luôn):
"đừng bỏ lỡ" / "chất lượng vượt trội" / "siêu hot" / "deal hấp dẫn" / "cơ hội vàng" / "đội ngũ chuyên nghiệp" / "sản phẩm uy tín" / "giá cực tốt" / "không thể bỏ lỡ" / "đừng bỏ qua" / "ưu đãi hấp dẫn" / "chất lượng cao" / "phục vụ tận tâm"

3 CÁCH MỞ ĐẦU KHÁC NHAU — mỗi caption dùng 1 cách, theo thứ tự:
1. Câu hỏi hoặc quan sát bất ngờ → rồi mới nói đến sản phẩm
2. Chia sẻ thẳng 1 sự thật/chi tiết cụ thể về sản phẩm (con số, cảm nhận, so sánh)
3. Kể ngắn 1 tình huống thật của khách hoặc 1 mẹo hay liên quan

VIẾT NHƯ NGƯỜI VIỆT THẬT:
- Câu ngắn 5–10 chữ xen câu dài hơn — không đều nhau
- Xuống dòng sau 1–2 câu
- Được bắt đầu câu không có chủ ngữ ("Vừa về hôm nay.", "Mặc vào là mát liền.")
- CTA nhẹ tự nhiên cuối bài nếu cần: "ai cần nhắn mình", "nhắn shop nhé" (KHÔNG dùng "inbox ngay")
- Emoji 0–2 cái — đặt giữa câu hoặc cuối đoạn, không nhồi
- Hashtag 1–3 cái, cụ thể ngành/sản phẩm

ĐỘ DÀI: 40–90 chữ mỗi caption — ngắn nhưng đủ ý, không bỏ thừa chữ nào

TÁCH CAPTION bằng dòng chỉ có "---"`;

      userPrompt = `Shop: "${profile.shop_name ?? "Shop"}" — ngành ${industryLabel}.
${profile.shop_desc ? `Mô tả shop: ${profile.shop_desc}` : ""}
Tone mong muốn: ${toneLabel}
${topic ? `Chủ đề / định hướng bài đăng: ${topic}` : ""}
${userDesc ? `Gợi ý thêm từ chủ shop (dùng làm định hướng sáng tạo, KHÔNG trích nguyên văn vào caption): ${userDesc}` : ""}

${referenceBlock}
Bài đã đăng gần đây (tránh lặp ý):
${recentContent}

Viết 3 caption theo 3 cách mở đầu khác nhau, tách bằng "---". Không đánh số, không thêm nhãn [1] [2] [3].`;
    }

    // ----- Ghép Style Preset + Humanize Layer vào systemPrompt -----
    const styleInstruction = STYLE_INSTRUCTIONS[stylePreset] ?? STYLE_INSTRUCTIONS.fb_real;
    systemPrompt += `

PHONG CÁCH BÀI ĐĂNG (ưu tiên cao — áp dụng cho cả 3 mẫu):
${styleInstruction}

HUMANIZE — BẮT BUỘC:
- Dùng từ đời thường: "vừa về", "ngon nha", "ai cần nhắn mình", "thử xem", "ghiền lắm"
- Được viết tắt tự nhiên: "k" (không), "vs" (với), "đc" (được) nếu phù hợp tone
- Không câu nào nghe như slogan hoặc quảng cáo trên TV
- Nếu có giá: viết thẳng số (ví dụ "180k", "1.2tr") — không viết "giá hợp lý" hay "giá tốt"
- Kết bài bằng hành động cụ thể nếu cần: nhắn shop / bình luận / ghé xem — KHÔNG "liên hệ ngay"`;

    // ----- Gọi Claude Haiku -----
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "missing_ai_key" }, 500);

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1100,
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

    const { data: historyRows } = await supabaseAdmin
      .from("caption_history")
      .insert(captions.map((c) => ({
        user_id: user.id,
        caption: c,
        tone,
        topic: topic || null,
        style_preset: stylePreset,
        content_type: contentType,
      })))
      .select("id");

    const captionIds = (historyRows ?? []).map((r: { id: number }) => r.id);

    return json({
      captions,
      caption_ids: captionIds,
      quota: { limit: quota, used: used + 1, remaining: Math.max(0, quota - used - 1) },
      tokens: { input: inputTokens, output: outputTokens, cost_usd: costUsd },
    });
  } catch (e) {
    console.error("generate-caption error:", e);
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
