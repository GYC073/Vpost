-- ============================================================
-- VPOST — Migration 002: Data Deletion (GDPR / Meta App Review)
-- Date: 2026-05-21
-- ============================================================

-- 1) Bảng deletion_requests
--    Ghi lại mọi yêu cầu xóa data từ web form (không cần auth)
-- ============================================================
create table if not exists public.deletion_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  reason      text,
  source      text default 'web_form',  -- 'web_form' | 'fb_callback' | 'email_manual'
  user_agent  text,
  status      text default 'pending',   -- 'pending' | 'verified' | 'completed' | 'rejected'
  verified_at timestamptz,
  completed_at timestamptz,
  created_at  timestamptz default now()
);

-- Allow anonymous INSERT (form xóa data không cần đăng nhập)
alter table public.deletion_requests enable row level security;

drop policy if exists "anon can insert deletion requests" on public.deletion_requests;
create policy "anon can insert deletion requests"
  on public.deletion_requests
  for insert
  to anon, authenticated
  with check (true);

-- Chỉ admin (service_role) đọc được
drop policy if exists "service role reads deletion requests" on public.deletion_requests;
create policy "service role reads deletion requests"
  on public.deletion_requests
  for select
  to service_role
  using (true);

create index if not exists deletion_requests_email_idx on public.deletion_requests (email);
create index if not exists deletion_requests_status_idx on public.deletion_requests (status);

-- ============================================================
-- 2) RPC delete_my_account()
--    User đã đăng nhập gọi → xóa hết data của chính mình
--    SECURITY DEFINER để bypass RLS và xóa được auth.users
-- ============================================================
create or replace function public.delete_my_account()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Lấy email để log
  select email into user_email from auth.users where id = uid;

  -- Xóa data ứng dụng
  delete from public.posts where user_id = uid;
  -- delete from public.fb_connections where user_id = uid;  -- nếu có sau Phase 4
  delete from public.profiles where id = uid;

  -- Ghi log deletion_requests (mark completed)
  insert into public.deletion_requests (email, source, status, verified_at, completed_at)
  values (coalesce(user_email, 'unknown'), 'self_service', 'completed', now(), now());

  -- Xóa user khỏi auth (cuối cùng — sau dòng này không gọi được auth.uid())
  delete from auth.users where id = uid;

  return json_build_object('ok', true, 'message', 'Account deleted');
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ============================================================
-- 3) RPC admin_complete_deletion(req_id) — chỉ service_role gọi
--    Dùng khi admin xử lý thủ công yêu cầu từ web form
-- ============================================================
create or replace function public.admin_complete_deletion(req_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  req_email text;
  target_uid uuid;
begin
  select email into req_email from public.deletion_requests where id = req_id;
  if req_email is null then
    raise exception 'request not found';
  end if;

  select id into target_uid from auth.users where email = req_email;
  if target_uid is null then
    update public.deletion_requests
    set status = 'completed', completed_at = now()
    where id = req_id;
    return json_build_object('ok', true, 'message', 'no matching user — marked complete');
  end if;

  delete from public.posts where user_id = target_uid;
  delete from public.profiles where id = target_uid;
  delete from auth.users where id = target_uid;

  update public.deletion_requests
  set status = 'completed', completed_at = now()
  where id = req_id;

  return json_build_object('ok', true, 'message', 'deleted', 'user_id', target_uid);
end;
$$;

revoke all on function public.admin_complete_deletion(uuid) from public;
-- Chỉ service_role gọi (admin panel hoặc psql)

-- ============================================================
-- DONE — Apply bằng: supabase db push
-- ============================================================
