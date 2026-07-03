// Netlify Scheduled Function.
//
// Drains the Sherin generation queue on a cron tick so queued or running
// generations keep advancing even when no owner browser is open. During active
// browser sessions the client-side kicker and the post-submit `after()` hook
// already advance the queue; this scheduled function is the safety net for
// closed tabs and long-running provider polls that resume across ticks.
//
// The schedule is declared in `netlify.toml` under
// `[functions."process-generations"]`. It calls the idempotent, bearer-guarded
// `GET /api/generations/process` endpoint using the shared `CRON_SECRET`.
//
// Setup: set `CRON_SECRET` in the Netlify site environment with the Functions
// scope (values from `netlify.toml` are NOT exposed to functions). `URL` is a
// Netlify read-only variable available at runtime. Without `CRON_SECRET` the
// drain is skipped and the queue still advances during active sessions.
//
// Scheduled functions have a 30s execution limit, so a slower generation
// finishes its poll on the route's own (60s) invocation and resumes on the
// next tick.

const SCHEDULED_FUNCTION_BUDGET_MS = 25_000;

export default async function processGenerations(): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  const siteUrl = process.env.URL ?? process.env.NEXT_PUBLIC_SITE_URL;

  if (!cronSecret || !siteUrl) {
    return new Response(
      'CRON_SECRET or site URL not configured; skipping scheduled queue drain.',
      { status: 200 },
    );
  }

  const target = new URL('/api/generations/process', siteUrl);

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: { authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(SCHEDULED_FUNCTION_BUDGET_MS),
    });

    return new Response(`Queue drain responded ${response.status}.`, {
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';

    return new Response(`Queue drain kick issued (${message}).`, {
      status: 200,
    });
  }
}
