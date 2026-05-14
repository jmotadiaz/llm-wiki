// Cron jobs have been disabled. Operations run on demand via API:
// - POST /api/wiki/lint          (Tier 1 + Tier 3 audit)
// - POST /api/learning-paths/generate  (learning-path agent)
//
// The functions are still callable directly from the API routes.

export function initScheduler(_db: any) {
  console.log('[SCHEDULER] Cron jobs disabled. Use API endpoints for on-demand operations.');
}
