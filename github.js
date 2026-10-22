/**
 * GitHub integration is intentionally not presented as available in this milestone.
 *
 * Why:
 * - GitHub OAuth token endpoints do not send CORS headers, so a static browser-only
 *   app cannot complete the device flow directly.
 * - A client secret must never be embedded in a static app.
 * - A secure design requires a configured relay or backend that holds no tokens
 *   and exposes a narrow API contract. That is outside Milestone 1.
 *
 * A user-supplied fine-grained PAT could be kept only in memory and used against
 * api.github.com, but full push/pull/conflict UX is a separate milestone. No fake
 * Git buttons are shown here.
 */

export async function getGitHubStatus() {
  return {
    available: false,
    configured: false,
    reason:
      'یکپارچه‌سازی GitHub در این نسخه پیکربندی نشده است. ' +
      'ورود OAuth به دلیل نبود CORS در نقاط پایانی GitHub و الزام امنیت توکن، ' +
      'به یک relay یا backend پیکربندی‌شده نیاز دارد. ' +
      'هیچ عملیات جعلی Git نمایش داده نمی‌شود.',
    docs: 'docs/LIMITATIONS.md#github'
  };
}
 
 
