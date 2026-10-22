/**
 * Remote synchronization is not implemented in Milestone 1.
 * Local editing, persistence, ZIP portability, and backup export are fully local.
 * No remote success messages are fabricated.
 */
export function getSyncStatus() {
  return {
    mode: 'local-only',
    available: false,
    reason: 'همگام‌سازی راه دور در این نسخه پیکربندی نشده است.'
  };
}
 
 
