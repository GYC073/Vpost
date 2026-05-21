-- ============================================================
-- VPOST — INITIAL SCHEMA (Phase 1)
-- Replaces localStorage state with proper backend tables.
-- Apply via: npx supabase db push
-- ============================================================

-- =========== PROFILES ===========
-- 1:1 với auth.users. Chứa info shop của user.
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone           TEXT UNIQUE,
  shop_name       TEXT,
  industry        TEXT,                        -- coffee, fashion, beauty, food, tech, home, health, education, furniture, sport, other
  tone            TEXT DEFAULT 'fun',          -- friendly, fun, luxury, sale, genz
  shop_address    TEXT,
  shop_desc       TEXT,
  avatar_url      TEXT,
  cover_url       TEXT,
  plan            TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','basic','standard','pro')),
  plan_expires_at DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '3 days'),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========== POSTS ===========
CREATE TABLE IF NOT EXISTS posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  caption         TEXT NOT NULL,
  image_url       TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','pending','posted','auto_posted','failed')),
  scheduled_at    TIMESTAMPTZ,
  posted_at       TIMESTAMPTZ,
  fb_post_id      TEXT,                        -- V2: khi tích hợp FB
  interactions    INTEGER DEFAULT 0,
  tone            TEXT,
  topic           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_user_scheduled ON posts(user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_status    ON posts(user_id, status);

-- =========== CAPTION HISTORY ===========
-- Lưu mọi caption AI đã sinh — dùng để anti-repeat + train sau này
CREATE TABLE IF NOT EXISTS caption_history (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  caption         TEXT NOT NULL,
  topic           TEXT,
  tone            TEXT,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_caption_history_user ON caption_history(user_id, generated_at DESC);

-- =========== USAGE LOG ===========
-- Track quota + cost per user (cho admin xem doanh thu vs cost AI)
CREATE TABLE IF NOT EXISTS usage_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,               -- caption_generate, video_generate, post_publish
  tokens_input    INTEGER,
  tokens_output   INTEGER,
  cost_usd        NUMERIC(10,6),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_user_day ON usage_log(user_id, created_at DESC);

-- =========== PAYMENTS ===========
-- Bill manual: user upload, admin duyệt
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL CHECK (plan IN ('basic','standard','pro')),
  amount_vnd      INTEGER NOT NULL,
  months          INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  bill_image_url  TEXT,
  transfer_note   TEXT,                        -- ex: VPOST-0901234567
  admin_note      TEXT,
  approved_by     UUID REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC);

-- ============================================================
-- TRIGGER: tự tạo profile khi user mới register qua auth.users
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone)
  VALUES (NEW.id, NEW.phone)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: tự cập nhật updated_at khi UPDATE profiles
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_profiles ON profiles;
CREATE TRIGGER touch_profiles BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- HELPER: kiểm tra user hiện tại có phải admin không
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- User chỉ thấy data của chính mình; admin thấy tất cả.
-- ============================================================
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE caption_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments        ENABLE ROW LEVEL SECURITY;

-- PROFILES
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON profiles;
CREATE POLICY "profiles_select_own_or_admin" ON profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL USING (public.is_admin());

-- POSTS
DROP POLICY IF EXISTS "posts_owner_all" ON posts;
CREATE POLICY "posts_owner_all" ON posts
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "posts_admin_read" ON posts;
CREATE POLICY "posts_admin_read" ON posts
  FOR SELECT USING (public.is_admin());

-- CAPTION HISTORY
DROP POLICY IF EXISTS "caption_history_owner_read" ON caption_history;
CREATE POLICY "caption_history_owner_read" ON caption_history
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "caption_history_owner_insert" ON caption_history;
CREATE POLICY "caption_history_owner_insert" ON caption_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- USAGE LOG (chỉ admin xem; user không cần thấy)
DROP POLICY IF EXISTS "usage_log_admin_read" ON usage_log;
CREATE POLICY "usage_log_admin_read" ON usage_log
  FOR SELECT USING (public.is_admin());

-- Edge Function dùng service_role → bypass RLS, nên user không insert trực tiếp

-- PAYMENTS
DROP POLICY IF EXISTS "payments_owner_read" ON payments;
CREATE POLICY "payments_owner_read" ON payments
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "payments_owner_insert" ON payments;
CREATE POLICY "payments_owner_insert" ON payments
  FOR INSERT WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "payments_admin_all" ON payments;
CREATE POLICY "payments_admin_all" ON payments
  FOR ALL USING (public.is_admin());

-- ============================================================
-- STORAGE BUCKETS (chạy 1 lần — bills + post images)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('bills', 'bills', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
DROP POLICY IF EXISTS "post_images_owner_upload" ON storage.objects;
CREATE POLICY "post_images_owner_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'post-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "post_images_public_read" ON storage.objects;
CREATE POLICY "post_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "bills_owner_upload" ON storage.objects;
CREATE POLICY "bills_owner_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bills'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "bills_owner_or_admin_read" ON storage.objects;
CREATE POLICY "bills_owner_or_admin_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'bills'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );
