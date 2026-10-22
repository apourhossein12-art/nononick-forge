# Limitations and Explicit Non-Features

## GitHub
Not implemented in Milestone 1. OAuth token endpoints lack CORS for browser-only
static apps and a client secret cannot be embedded. A future milestone must define a
stateless relay contract. No fake Git actions are shown.

## Preview
- Node.js, npm packages, shell commands, and backend execution are not supported.
- `fetch` and external network resources are blocked by CSP in the preview.
- Relative ES module imports inside project JavaScript are not recursively resolved.
- Inline event handler attributes may be blocked by CSP; use `addEventListener`.
- External stylesheets/scripts are not loaded; they are reported as warnings.
- Preview behavior is same-origin iframe sandboxed with an opaque origin. It is not
  a substitute for a dedicated preview origin; test against the app’s real CSP before
  production use.

## Editor
- CodeMirror syntax highlighting is not full language-server diagnostics.
- No LSP, linting, or TypeScript type checking.
- Binary files are not editable.

## Storage
- IndexedDB is not permanent. Browser or user site-data deletion removes projects.
- Users should export ZIP or JSON backups regularly.
- Storage quota is browser-managed.

## iOS
- File System Access API is unavailable on iOS Safari.
- PWA installation is manual via Share → Add to Home Screen.
- Service worker and storage behavior depend on WebKit.
- VisualViewport keyboard handling is best-effort; test all orientations.

## Search
- Plain-text search only; no regex UI in this milestone.
 
 
