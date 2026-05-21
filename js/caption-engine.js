// ============================================================
// VPOST CAPTION ENGINE
// Hệ thống tạo caption thông minh, đa dạng, chống lặp
// ============================================================

const CaptionEngine = {

  // Lịch chủ đề 7 ngày trong tuần (0=CN, 1=T2...6=T7)
  weeklySchedule: {
    0: { topic: 'inspire',   label: 'Chủ nhật — Quote truyền cảm hứng',  emoji: '🌟' },
    1: { topic: 'energy',    label: 'Thứ Hai — Khởi đầu tuần năng lượng', emoji: '🚀' },
    2: { topic: 'product',   label: 'Thứ Ba — Giới thiệu sản phẩm',       emoji: '✨' },
    3: { topic: 'tips',      label: 'Thứ Tư — Mẹo & Kiến thức',           emoji: '💡' },
    4: { topic: 'story',     label: 'Thứ Năm — Câu chuyện shop',           emoji: '📖' },
    5: { topic: 'promotion', label: 'Thứ Sáu — Khuyến mãi cuối tuần',     emoji: '🔥' },
    6: { topic: 'interact',  label: 'Thứ Bảy — Tương tác khách hàng',     emoji: '💬' },
  },

  // Các cấu trúc bài viết xoay vòng (tránh lặp format)
  structures: [
    'opening_hook',    // Mở đầu gây chú ý → nội dung → CTA
    'storytelling',    // Kể chuyện ngắn → bài học → CTA
    'list_format',     // Danh sách 3 điểm → CTA
    'question_first',  // Bắt đầu bằng câu hỏi → trả lời → CTA
    'social_proof',    // Khách hàng nói gì → sản phẩm → CTA
    'before_after',    // Trước khi biết → sau khi dùng → CTA
    'behind_scenes',   // Hậu trường → giá trị → CTA
  ],

  // Lấy thông tin shop
  getShopInfo() {
    try { return JSON.parse(localStorage.getItem('vpost_user') || '{}'); } catch { return {}; }
  },

  // Lấy lịch sử caption (tránh lặp)
  getHistory() {
    try { return JSON.parse(localStorage.getItem('vpost_caption_history') || '[]'); } catch { return []; }
  },

  // Lưu caption vào lịch sử
  saveToHistory(captions, topic, structure) {
    const history = this.getHistory();
    history.unshift({ date: new Date().toISOString(), topic, structure, previews: captions.map(c => c.slice(0, 60)) });
    // Chỉ giữ 30 bản ghi gần nhất
    if (history.length > 30) history.splice(30);
    localStorage.setItem('vpost_caption_history', JSON.stringify(history));
  },

  // Lấy chủ đề hôm nay
  getTodaySchedule() {
    const day = new Date().getDay();
    return this.weeklySchedule[day];
  },

  // Chọn cấu trúc chưa dùng gần đây
  getNextStructure() {
    const history = this.getHistory();
    const recentStructures = history.slice(0, 7).map(h => h.structure);
    const available = this.structures.filter(s => !recentStructures.includes(s));
    const pool = available.length > 0 ? available : this.structures;
    return pool[Math.floor(Math.random() * pool.length)];
  },

  // Mô tả tone
  toneDescriptions: {
    fun:      'vui vẻ, năng lượng, dùng emoji phù hợp, gần gũi, cuối bài kêu gọi comment hoặc tag bạn bè',
    friendly: 'thân thiện, ấm áp, chân thành, tạo cảm giác tin tưởng, như người bạn chia sẻ',
    luxury:   'sang trọng, tinh tế, ngôn từ chọn lọc, ít emoji, chuyên nghiệp và uy tín',
    sale:     'mạnh mẽ, tạo urgency, kêu gọi hành động ngay, dùng chữ IN HOA cho điểm nhấn quan trọng',
    genz:     'trendy, dùng tiếng lóng Gen Z Việt tự nhiên (fr fr, literally, vibe, ok boii, slay), ngắn gọn cool',
  },

  // Mô tả cấu trúc bài
  structureDescriptions: {
    opening_hook:  'mở đầu bằng 1 câu gây chú ý mạnh (câu hỏi bất ngờ, sự thật thú vị, hoặc tuyên bố táo bạo), sau đó vào nội dung chính, kết bằng CTA',
    storytelling:  'kể một câu chuyện ngắn 2-3 câu liên quan shop/sản phẩm, rút ra điểm thú vị, kết bằng CTA mời khách ghé thăm',
    list_format:   'liệt kê 3 lý do/điểm nổi bật dạng danh sách có số hoặc emoji, mỗi điểm 1 dòng, kết bằng CTA',
    question_first:'bắt đầu bằng câu hỏi khiến người đọc phải suy nghĩ, trả lời bằng sản phẩm/dịch vụ, kết bằng CTA',
    social_proof:  'mô phỏng phản hồi tích cực của khách hàng (không bịa tên cụ thể), liên kết với sản phẩm, kết bằng CTA',
    before_after:  'mô tả vấn đề/tình huống trước → giải pháp từ shop → kết quả tốt → CTA',
    behind_scenes: 'hé lộ một điều thú vị về cách shop làm việc hoặc tạo ra sản phẩm, tạo sự kết nối, kết bằng CTA',
  },

  // Mô tả chủ đề
  topicDescriptions: {
    inspire:   'chia sẻ câu quote truyền cảm hứng liên quan ngành hàng hoặc cuộc sống, kết nối với giá trị của shop',
    energy:    'tạo năng lượng đầu tuần, khuyến khích khách hàng bắt đầu tuần mới tích cực, liên hệ shop',
    product:   'giới thiệu sản phẩm/dịch vụ nổi bật một cách hấp dẫn',
    tips:      'chia sẻ mẹo hữu ích liên quan ngành hàng mà khách hàng sẽ thấy có giá trị',
    story:     'kể câu chuyện về shop, nguồn gốc, đam mê, hoặc khoảnh khắc đáng nhớ',
    promotion: 'thông báo ưu đãi, khuyến mãi cuối tuần hoặc sản phẩm đặc biệt',
    interact:  'đặt câu hỏi thú vị để khách hàng comment, poll, hoặc tag bạn bè',
    hiring:    'tuyển dụng nhân viên cho shop',
  },

  // Build prompt thông minh
  buildPrompt(options = {}) {
    const shop = this.getShopInfo();
    const today = this.getTodaySchedule();
    const structure = options.structure || this.getNextStructure();
    const topic = options.topic || today.topic;
    const tone = options.tone || shop.tone || 'fun';
    const userDesc = options.userDesc || '';
    const history = this.getHistory().slice(0, 5);

    const shopName = shop.shopName || shop.name || 'Shop của tôi';
    const shopDesc = shop.shopDesc || 'Shop kinh doanh online';
    const shopAddr = shop.shopAddr || 'TP.HCM';
    const industry = shop.industry || 'kinh doanh';

    const historyNote = history.length > 0
      ? `\nLịch sử caption gần đây (TRÁNH lặp lại cấu trúc và ý tưởng này):\n${history.map((h, i) => `${i+1}. Chủ đề: ${h.topic} | Cấu trúc: ${h.structure} | Preview: "${h.previews[0]}..."`).join('\n')}`
      : '';

    return {
      prompt: `Bạn là chuyên gia viết caption mạng xã hội cho shop nhỏ lẻ Việt Nam. Viết SÁNG TẠO và ĐA DẠNG, tránh sáo rỗng.

THÔNG TIN SHOP:
- Tên: ${shopName}
- Ngành: ${industry}  
- Mô tả: ${shopDesc}
- Địa chỉ: ${shopAddr}

YÊU CẦU BÀI ĐĂNG HÔM NAY:
- Chủ đề: ${this.topicDescriptions[topic] || topic}
- Tone giọng: ${this.toneDescriptions[tone] || tone}
- Cấu trúc bài: ${this.structureDescriptions[structure] || structure}
- Gợi ý thêm từ chủ shop: "${userDesc || 'Không có, hãy tự sáng tạo'}"
${historyNote}

VIẾT ĐÚNG 3 PHIÊN BẢN caption KHÁC NHAU HOÀN TOÀN:
- Mỗi bài 60-150 chữ
- Dùng emoji phù hợp tone
- Cuối bài có 3-5 hashtag tiếng Việt liên quan
- BA BÀI PHẢI KHÁC NHAU về cách mở đầu, cách diễn đạt, góc nhìn
- KHÔNG dùng cụm từ sáo rỗng như "Đừng bỏ lỡ", "Còn chần chừ gì nữa"

Trả lời ĐÚNG JSON sau, không thêm gì khác:
{
  "topic": "${topic}",
  "structure": "${structure}",
  "captions": ["caption 1", "caption 2", "caption 3"]
}`,
      topic,
      structure,
      tone,
    };
  },

  // Gọi Edge Function generate-caption (Claude Haiku 4.5)
  // Backend tự quản quota, anti-repeat, save history vào DB.
  async generate(options = {}) {
    const tone = options.tone || this.getShopInfo().tone || 'fun';
    const topic = options.topic || this.getTodaySchedule().topic;
    const structure = options.structure || this.getNextStructure();
    const userDesc = options.userDesc || '';

    if (!window.vpostGenerateCaption) {
      throw new Error('Supabase chưa load, hãy F5 lại trang.');
    }

    // Build userDesc giàu hơn nếu là hiring (đẩy hết info vào để Claude có context)
    const enrichedDesc = options.enrichedDesc || userDesc;

    const result = await window.vpostGenerateCaption({
      tone,
      userDesc: enrichedDesc,
      topic,
    });

    // Map error sang exception để caption.html bắt được
    if (result.error) {
      const e = new Error(result.message || result.error);
      e.code = result.error;
      e.quota = result.quota;
      throw e;
    }

    // Lưu lịch sử local (để getNextStructure rotate giữa các structure)
    this.saveToHistory(result.captions, topic, structure);

    return {
      captions: result.captions,
      topic,
      structure,
      quota: result.quota,   // { limit, used, remaining }
      tokens: result.tokens, // { input, output, cost_usd }
    };
  },

  // Fallback nếu API lỗi
  getFallback(shopName, userDesc, topic) {
    const shop = this.getShopInfo();
    const name = shopName || shop.shopName || 'shop';
    return [
      `✨ Hôm nay ${name} muốn chia sẻ điều đặc biệt với bạn!\n\n${userDesc || 'Chúng mình luôn nỗ lực mang đến những điều tốt nhất cho khách hàng.'}\n\nGhé thăm ${name} để trải nghiệm nhé! 💙\n\n#${name.replace(/\s/g,'')} #ChấtLượng #TậnTâm`,
      `💫 Bạn có biết điều gì làm ${name} khác biệt không?\n\n${userDesc || 'Đó chính là sự tận tâm với từng khách hàng — mỗi người, mỗi sản phẩm đều được chăm chút kỹ lưỡng.'}\n\nTag người bạn muốn chia sẻ điều này! 👇\n\n#${name.replace(/\s/g,'')} #KhácBiệt`,
      `🌟 ${name} — nơi mỗi ngày đều có điều mới!\n\n${userDesc || 'Chúng mình liên tục cải thiện để phục vụ bạn tốt hơn mỗi ngày.'}\n\nNhắn tin hoặc ghé thăm mình nhé! 😊\n\n#${name.replace(/\s/g,'')} #MỗiNgàyMộiMới`,
    ];
  },
};

// Export cho dùng ở các file khác
window.CaptionEngine = CaptionEngine;
