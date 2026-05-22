-- ============================================================
-- MIGRATION 004: Scheduler support
-- ============================================================
-- 1. Cho phép status='posting' (cron đang xử lý — tránh race condition).
-- 2. Index cho cron query (đã có idx_posts_scheduler ở 003, nhưng bổ sung).
-- 3. Hướng dẫn setup pg_cron (chạy thủ công dưới đây).
-- ============================================================

-- ===== 1) Relax CHECK constraint để có thêm 'posting' =====
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_status_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN (
    'draft',
    'scheduled',
    'posting',     -- NEW: cron đang gọi fb-post cho bài này
    'pending',
    'posted',
    'auto_posted',
    'failed'
  ));

-- ===== 2) Thêm updated_at cho posts (cần cho stuck-recovery) =====
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS touch_posts ON public.posts;
CREATE TRIGGER touch_posts BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ===== 3) Index cho cleanup posts 'posting' bị treo =====
CREATE INDEX IF NOT EXISTS idx_posts_posting_recovery
  ON public.posts(status, updated_at)
  WHERE status = 'posting';

-- ===== 4) Cleanup function: post 'posting' >10 phút → revert 'scheduled' =====
-- (đề phòng edge function crash giữa chừng làm post kẹt)
CREATE OR REPLACE FUNCTION public.recover_stuck_posts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.posts
     SET status = 'scheduled'
   WHERE status = 'posting'
     AND updated_at < now() - interval '10 minutes';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recover_stuck_posts() TO service_role;

-- ============================================================
-- ===== HƯỚNG DẪN SETUP pg_cron (chạy thủ công trên Supabase SQL Editor) =====
-- ============================================================
-- Bước 1: Bật extensions (Dashboard → Database → Extensions: enable pg_cron + pg_net)
--   hoặc chạy:
--     CREATE EXTENSION IF NOT EXISTS pg_cron;
--     CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- Bước 2: Tạo schedule (thay <PROJECT_REF> và <SCHEDULER_SECRET>):
--
--   SELECT cron.schedule(
--     'vpost-fb-scheduler',
--     '*/5 * * * *',
--     $cmd$
--       SELECT net.http_post(
--         url := 'https://<PROJECT_REF>.supabase.co/functions/v1/fb-scheduler',
--         headers := jsonb_build_object(
--           'Authorization', 'Bearer <SCHEDULER_SECRET>',
--           'Content-Type', 'application/json'
--         ),
--         body := '{}'::jsonb
--       );
--     $cmd$
--   );
--
-- Bước 3: Schedule recovery (mỗi 30 phút):
--
--   SELECT cron.schedule(
--     'vpost-recover-stuck',
--     '*/30 * * * *',
--     $cmd$ SELECT public.recover_stuck_posts(); $cmd$
--   );
--
-- Bước 4: Kiểm tra jobs đang chạy:
--   SELECT * FROM cron.job;
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- Bước 5: Set SCHEDULER_SECRET (terminal local):
--   openssl rand -hex 32          -- copy giá trị này
--   npx supabase secrets set SCHEDULER_SECRET=<giá_trị>
--
-- Bước 6: Deploy edge function:
--   npx supabase functions deploy fb-scheduler --no-verify-jwt
-- ============================================================
