// ============================================================
// EDGE FUNCTION: demo-caption (PUBLIC — no auth required)
// POST /functions/v1/demo-caption
// Body: { desc: string, tone?: string }
// Returns: { caption: string }
//
// Deploy: npx supabase functions deploy demo-caption --no-verify-jwt
// Dùng cho landing page demo — không cần đăng nhập
// ============================================================

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.3";

const TONE_MAP: Record<string, string> = {
  friendly: "thân thiện, gần gũi, dễ thương",
  sale:     "kêu gọi mua hàng mạnh mẽ, tạo FOMO",
  luxury:   "sang trọng, tinh tế, chuyên nghiệp",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { desc, tone = "friendly" } = await req.json();

    if (!desc || desc.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: "Mô tả quá ngắn, nhập thêm thông tin nhé!" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const toneLabel = TONE_MAP[tone] || TONE_MAP.friendly;

    const anthropic = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
    });

    const systemPrompt = `Bạn là copywriter mạng xã hội cho shop nhỏ Việt Nam.
Viết caption Facebook ngắn gọn, tự nhiên như người thật — KHÔNG dùng các cụm sáo rỗng như "Nhanh tay sở hữu ngay", "Đừng bỏ lỡ", "Ưu đãi hấp dẫn", "Chất lượng vượt trội".
Tone: ${toneLabel}.
Độ dài: 40–80 chữ. Kết thúc bằng 1 câu CTA tự nhiên + 2–3 hashtag liên quan.
Chỉ trả về đúng caption, không giải thích gì thêm.`;

    const userPrompt = `Sản phẩm / dịch vụ: ${desc.trim()}
Viết 1 caption Facebook cho shop này.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6", // Sonnet: demo là bộ mặt sản phẩm — không để khách tiềm năng gặp lỗi bịa từ. Giới hạn 3 lần/session nên chi phí thấp.
      max_tokens: 300,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const caption = (message.content[0] as { type: string; text: string }).text?.trim() ?? "";

    return new Response(
      JSON.stringify({ caption }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("demo-caption error:", err);
    return new Response(
      JSON.stringify({ error: "Có lỗi xảy ra, thử lại nhé!" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
