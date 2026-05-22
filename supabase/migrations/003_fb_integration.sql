-- ============================================================
-- VPOST — Migration 003: Facebook Integration (Phase 4)
-- Date: 2026-05-22
-- ============================================================
-- Mục tiêu:
--   1) Lưu kết nối OAuth FB của user (1 user → 1 FB account)
--   2) Lưu danh sách Pages user đã grant + chọn page active
--   3) Cập nhật posts: thêm fb_page_id để biết post lên page nào
--   4) Bảng log call FB Graph API (debug + audit)
-- ============================================================

-- =========== FB CONNECTIONS ===========
-- 1 user → 1 FB User connection (long-lived user access token)
CREATE TABLE IF NOT EXISTS public.fb_connections (
  user_id          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  fb_user_id       TEXT NOT NULL,                 -- FB User ID (numeric string)
  fb_user_name     TEXT,                          -- Display name (optional)
  access_token     TEXT NOT NULL,                 -- Long-lived user token (~60 ngày)
  token_expires_at TIMESTAMPTZ,                   -- Khi nào token hết hạn
  granted_scopes   TEXT[],                        -- ['pages_show_list', 'pages_manage_posts', ...]
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refreshed_at TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_fb_connections_user
  ON public.fb_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_fb_connections_expires
  ON public.fb_connections(token_expires_at)
  WHERE is_active = true;

-- =========== FB PAGES ===========
-- 1 user → nhiều pages. User chọn 1 page làm "active" để auto-post.
CREATE TABLE IF NOT EXISTS public.fb_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fb_page_id        TEXT NOT NULL,                -- FB Page ID
  page_name         TEXT NOT NULL,
  page_access_token TEXT NOT NULL,                -- Page-specific token (không hết hạn nếu user token long-lived)
  page_category     TEXT,
  picture_url       TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT false, -- User chỉ 1 page active để auto-post
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fb_page_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_pages_user
  ON public.fb_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_fb_pages_user_active
  ON public.fb_pages(user_id)
  WHERE is_active = true;

-- Trigger: đảm bảo mỗi user chỉ có 1 page active tại 1 thời điểm
CREATE OR REPLACE FUNCTION public.enforce_single_active_page()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.fb_pages
    SET is_active = false
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS single_active_fb_page ON public.fb_pages;
CREATE TRIGGER single_active_fb_page
  AFTER INSERT OR UPDATE OF is_active ON public.fb_pages
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.enforce_single_active_page();

-- =========== POSTS — thêm cột fb_page_id ===========
-- Khi đăng post, ghi nhận page nào. Cho phép user đổi page sau mà post cũ vẫn đúng.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS fb_page_id     TEXT,
  ADD COLUMN IF NOT EXISTS fb_error       TEXT,           -- Lưu error nếu post fail
  ADD COLUMN IF NOT EXISTS fb_retry_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_scheduler
  ON public.posts(status, scheduled_at)
  WHERE status = 'scheduled';

-- =========== FB API LOG ===========
-- Audit + debug mọi call FB Graph API
CREATE TABLE IF NOT EXISTS public.fb_api_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  post_id     UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  endpoint    TEXT NOT NULL,                       -- /me/accounts, /{page-id}/photos, ...
  http_method TEXT NOT NULL DEFAULT 'POST',
  status_code INT,
  request     JSONB,                               -- sanitize tokens trước khi log
  response    JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_api_log_user   ON public.fb_api_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_api_log_post   ON public.fb_api_log(post_id);
CREATE INDEX IF NOT EXISTS idx_fb_api_log_errors ON public.fb_api_log(created_at DESC) WHERE status_code >= 400;

-- ============================================================
-- ROW LEVEL SECURITY
-- User chỉ thấy data của chính mình. Edge Function dùng service_role bypass.
-- ============================================================
ALTER TABLE public.fb_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_pages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_api_log     ENABLE ROW LEVEL SECURITY;

-- FB CONNECTIONS — chỉ owner đọc/sửa/xóa
DROP POLICY IF EXISTS "fb_connections_owner_all" ON public.fb_connections;
CREATE POLICY "fb_connections_owner_all" ON public.fb_connections
  FOR ALL USING (auth.uid() = user_id);

-- FB PAGES — owner đọc/sửa/xóa; admin đọc
DROP POLICY IF EXISTS "fb_pages_owner_all" ON public.fb_pages;
CREATE POLICY "fb_pages_owner_all" ON public.fb_pages
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fb_pages_admin_read" ON public.fb_pages;
CREATE POLICY "fb_pages_admin_read" ON public.fb_pages
  FOR SELECT USING (public.is_admin());

-- FB API LOG — owner đọc, admin đọc; insert chỉ service_role
DROP POLICY IF EXISTS "fb_api_log_owner_read" ON public.fb_api_log;
CREATE POLICY "fb_api_log_owner_read" ON public.fb_api_log
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- ============================================================
-- RPC: get_active_fb_page(user_id_in)
-- Trả page active của user cho Edge Function gọi (qua service_role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_fb_page(user_id_in UUID)
RETURNS TABLE (
  fb_page_id        TEXT,
  page_name         TEXT,
  page_access_token TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fb_page_id, page_name, page_access_token
  FROM public.fb_pages
  WHERE user_id = user_id_in
    AND is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_fb_page(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_fb_page(UUID) TO service_role;

-- ============================================================
-- RPC: disconnect_fb()
-- User gọi để xóa toàn bộ FB data của mình (bắt buộc cho Meta App Review)
-- ============================================================
CREATE OR REPLACE FUNCTION public.disconnect_fb()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM public.fb_pages       WHERE user_id = uid;
  DELETE FROM public.fb_connections WHERE user_id = uid;

  RETURN json_build_object('ok', true, 'message', 'FB disconnected');
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_fb() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disconnect_fb() TO authenticated;

-- ============================================================
-- UPDATE delete_my_account() để xóa luôn FB data
-- (Bổ sung migration 002)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  user_email TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = uid;

  -- FB data
  DELETE FROM public.fb_pages       WHERE user_id = uid;
  DELETE FROM public.fb_connections WHERE user_id = uid;

  -- App data
  DELETE FROM public.posts          WHERE user_id = uid;
  DELETE FROM public.caption_history WHERE user_id = uid;
  DELETE FROM public.payments       WHERE user_id = uid;
  DELETE FROM public.profiles       WHERE id = uid;

  -- Log
  INSERT INTO public.deletion_requests (email, source, status, verified_at, completed_at)
  VALUES (COALESCE(user_email, 'unknown'), 'self_service', 'completed', NOW(), NOW());

  -- Auth user cuối cùng
  DELETE FROM auth.users WHERE id = uid;

  RETURN json_build_object('ok', true, 'message', 'Account deleted');
END;
$$;

-- ============================================================
-- DONE — Apply: paste vào Supabase Dashboard → SQL Editor → Run
-- ============================================================
