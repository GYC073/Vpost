-- Migration 006: App Settings (key-value store cho admin)
-- Chạy trong Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Admin có thể đọc/ghi
CREATE POLICY "app_settings_admin_all" ON app_settings
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());

-- User thường chỉ được đọc (để load system message)
CREATE POLICY "app_settings_user_read" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Giá trị mặc định
INSERT INTO app_settings (key, value) VALUES
  ('system_message',         '')          ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES
  ('system_message_enabled', 'false')     ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES
  ('system_message_type',    'info')      ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES
  ('support_zalo',           'https://zalo.me/0789434345') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES
  ('support_phone',          '0789.434.345')               ON CONFLICT (key) DO NOTHING;
