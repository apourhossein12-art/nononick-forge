# Security and Dependency Report

## Main application
- No `eval()` or `new Function()` in application code.
- CSP: no `script-src 'unsafe-inline'` and no `script-src 'unsafe-eval'`.
- `script-src 'self' blob:` is required because the sandboxed preview runs project
  scripts from blob URLs. Application code itself is external modules.
- `style-src 'self' 'unsafe-inline'` is required by CodeMirror style injection and
  preview inline CSS.
- `connect-src` is limited to same-origin and `https://api.github.com`. GitHub
  integration is not wired in this milestone.
- All dynamic text in the main UI uses `textContent` or `createElement`, not
  unsanitized `innerHTML`.
- Imported paths are normalized and validated; traversal and absolute paths are rejected.
- ZIP entries are bounded by count, per-file size, and total size.

## Preview
- Opaque-origin sandbox: `sandbox="allow-scripts"` only.
- No `allow-same-origin`.
- Preview code cannot access parent DOM, IndexedDB, localStorage, or app variables.
- Preview network access is restricted by CSP (`connect-src 'none'`); external
  resources are generally blocked.
- Runtime errors are captured and displayed; failure messages are not hidden.

## GitHub
- Not configured. OAuth token endpoints do not provide CORS headers for browser-only
  static apps, and a client secret must not be embedded.
- A future implementation requires a stateless relay with a narrow allow-list and a
  documented API contract. Tokens must not be written to project files, ZIP exports,
  or ordinary persistent browser storage without a justified security design.

## Dependencies
Pinned production dependencies:
- CodeMirror 6 packages: `6.65.7`, `6.20.4`, `6.11.1`, `6.3.1`, `6.4.12`, `6.2.5`,
  `6.13.1`, `6.7.2`, `6.7.6`, `6.43.15`
- fflate `0.8.3`

Development dependencies: esbuild `0.24.2`, sharp `0.33.5`.
Run `npm audit` after installing; commit `package-lock.json`. This report does not
claim a vulnerability-free status for transitive dependencies.
 
 
