-- ============================================================
-- Migration 009: Kho ảnh tự động cho auto-post
-- Thu hoạch ảnh thật từ fanpage (Graph API) → bài auto đăng kèm ảnh.
-- Chạy: Supabase Dashboard SQL Editor hoặc Management API.
-- ============================================================

CREATE TABLE IF NOT EXISTS page_photos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fb_page_id TEXT NOT NULL,
  fb_photo_id TEXT NOT NULL,            -- id ảnh trên Graph API (để refresh URL khi hết hạn)
  photo_url TEXT NOT NULL,              -- URL fbcdn (có chữ ký hết hạn → harvest hằng ngày refresh)
  width INT,
  height INT,
  times_used INT NOT NULL DEFAULT 0,    -- số lần đã gắn vào bài auto
  last_used_at TIMESTAMPTZ,             -- lần cuối được dùng (xoay vòng: ít dùng nhất trước)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  harvested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fb_photo_id)
);

CREATE INDEX IF NOT EXISTS idx_page_photos_pick
  ON page_photos (user_id, is_active, last_used_at NULLS FIRST, times_used);

ALTER TABLE page_photos ENABLE ROW LEVEL SECURITY;

-- User xem/sửa kho ảnh của mình (để sau này làm UI ẩn ảnh không muốn dùng)
CREATE POLICY "page_photos_select_own" ON page_photos
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "page_photos_update_own" ON page_photos
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "page_photos_delete_own" ON page_photos
  FOR DELETE USING (user_id = auth.uid());
-- INSERT chỉ qua service_role (harvest function) — không cần policy insert cho user.

COMMENT ON TABLE page_photos IS 'Kho ảnh thu hoạch từ fanpage user — auto-post xoay vòng gắn vào bài. Harvest cron refresh URL hằng ngày vì fbcdn URL có hạn.';
