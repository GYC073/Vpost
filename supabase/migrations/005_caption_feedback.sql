-- ============================================================
-- Migration 004: Caption Feedback Loop
-- Theo dõi hành động user với từng caption AI
-- user_action: 'copied' | 'used' | 'regenerated'
-- ============================================================

-- Thêm cột tracking vào caption_history
ALTER TABLE caption_history
  ADD COLUMN IF NOT EXISTS user_action   VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS style_preset  VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS content_type  VARCHAR(20)  DEFAULT NULL;

-- Cho phép user tự update row của chính họ (để ghi user_action)
DROP POLICY IF EXISTS "caption_history_owner_update" ON caption_history;
CREATE POLICY "caption_history_owner_update" ON caption_history
  FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index giúp query dataset tốt (caption nào user thích)
CREATE INDEX IF NOT EXISTS idx_caption_history_action
  ON caption_history(user_id, user_action)
  WHERE user_action IS NOT NULL;
