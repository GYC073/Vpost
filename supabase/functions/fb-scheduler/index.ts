// ============================================================
// EDGE FUNCTION: fb-scheduler
// GET/POST /functions/v1/fb-scheduler
//
// Quét posts có status='scheduled' AND scheduled_at <= now()
// → gọi fb-post (HTTP, service_role) cho từng post.
//
// Trigger: pg_cron (Supabase) hoặc cron-job.org gọi mỗi 5 phút.
// Auth: phải gửi `Authorization: Bearer <SCHEDULER_SECRET>` để chặn lạm dụng.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-inject)
//   SCHEDULER_SECRET                          (set bằng npx supabase secrets set)
//
// Deploy: npx supabase functions deploy fb-scheduler --no-verify-jwt
// (no-verify-jwt vì cron không có user JWT, ta tự verify SCHEDULER_SECRET)
//
// Setup pg_cron (Dashboard → SQL):
//   SELECT cron.schedule(
//     'fb-scheduler-5min', '*/5 * * * *',
//     $$ SELECT net.http_post(
//          url := 'https://<project>.supabase.co/functions/v1/fb-scheduler',
//          headers := jsonb_build_object('Authorization', 'Bearer <SCHEDULER_SECRET>')
//        ); $$
//   );
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Số post tối đa xử lý trong 1 lượt cron (tránh timeout 60s)
const BATCH_LIMIT = 25;

// Số lần retry tối đa cho 1 post failed → sau đó để failed luôn, không retry nữa
const MAX_RETRY = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // ===== Verify SCHEDULER_SECRET =====
  const expected = Deno.env.get("SCHEDULER_SECRET");
  if (!expected) {
    return json({ error: "SCHEDULER_SECRET not configured" }, 500);
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const startedAt = Date.now();
  const results: Array<{ post_id: string; ok: boolean; error?: string }> = [];

  try {
    // ===== Tìm posts đến lịch =====
    const nowIso = new Date().toISOString();
    const { data: due, error: dueErr } = await admin
      .from("posts")
      .select("id, user_id, scheduled_at, fb_retry_count")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_LIMIT);

    if (dueErr) {
      return json({ error: "query failed", db: dueErr.message }, 500);
    }
    if (!due || due.length === 0) {
      return json({ ok: true, processed: 0, ms: Date.now() - startedAt });
    }

    // ===== Lock từng post (status = 'posting') để cron lần sau không lấy lại =====
    // Chỉ update nếu vẫn ở status='scheduled' để tránh race condition
    for (const p of due) {
      const { data: locked } = await admin
        .from("posts")
        .update({ status: "posting" })
        .eq("id", p.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();

      if (!locked) {
        // Đã có cron khác lấy mất → skip
        continue;
      }

      // Gọi fb-post HTTP với service_role + user_id
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/fb-post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ post_id: p.id, user_id: p.user_id }),
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          // fb-post đã tự update posts.status='posted' rồi
          results.push({ post_id: p.id, ok: true });
        } else {
          const retryCount = (p.fb_retry_count ?? 0) + 1;
          const giveUp = retryCount >= MAX_RETRY;
          // fb-post đã set status='failed' rồi, ta chỉ tăng retry_count
          // và reschedule (chuyển về 'scheduled') nếu chưa hết retry
          await admin
            .from("posts")
            .update({
              status: giveUp ? "failed" : "scheduled",
              fb_retry_count: retryCount,
              scheduled_at: giveUp
                ? undefined
                : new Date(Date.now() + retryDelayMs(retryCount)).toISOString(),
            })
            .eq("id", p.id);

          results.push({
            post_id: p.id,
            ok: false,
            error: data.error ?? "fb-post failed",
          });
        }
      } catch (fetchErr) {
        // Network / timeout — rollback status để cron sau retry
        await admin
          .from("posts")
          .update({
            status: "scheduled",
            fb_retry_count: (p.fb_retry_count ?? 0) + 1,
          })
          .eq("id", p.id);
        results.push({ post_id: p.id, ok: false, error: String(fetchErr) });
      }
    }

    return json({
      ok: true,
      processed: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      ms: Date.now() - startedAt,
      results,
    });
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

// Exponential backoff: 5min → 15min → 45min
function retryDelayMs(attempt: number): number {
  const base = 5 * 60 * 1000;
  return base * Math.pow(3, attempt - 1);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
