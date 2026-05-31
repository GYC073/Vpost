-- Migration 007: Auto post feature
-- Thêm cột auto_post_enabled vào profiles

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_post_enabled boolean DEFAULT false NOT NULL;

-- Index để query nhanh users cần auto-generate
CREATE INDEX IF NOT EXISTS idx_profiles_auto_post
  ON profiles (auto_post_enabled)
  WHERE auto_post_enabled = true;

-- Thêm cột source vào posts để phân biệt manual vs auto
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
-- source values: 'manual' | 'auto'
