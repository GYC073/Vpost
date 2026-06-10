-- ============================================================
-- Migration 008: Học giọng + footer liên hệ cho auto-post
--
-- Mục tiêu: caption auto-post "thật" hơn — bớt giọng copywriter,
-- bớt lặp khuôn. 2 đòn bẩy:
--   1. voice_samples  — shop dán 3-5 bài đăng THẬT → AI bắt chước giọng
--   2. contact_footer — block thông tin liên hệ (giờ/hotline/địa chỉ)
--      gắn nguyên văn cuối bài (code gắn, KHÔNG để AI tự bịa số ĐT)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS voice_samples      text,
  ADD COLUMN IF NOT EXISTS contact_footer     text,
  ADD COLUMN IF NOT EXISTS auto_append_footer boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN profiles.voice_samples      IS 'Vài bài đăng thật của shop (phân tách bằng dòng ---). AI học giọng từ đây.';
COMMENT ON COLUMN profiles.contact_footer     IS 'Block thông tin liên hệ dán nguyên văn (giờ mở cửa, hotline/Zalo, địa chỉ).';
COMMENT ON COLUMN profiles.auto_append_footer IS 'Bật = auto-post tự gắn contact_footer vào cuối bài.';
