# Architecture — NONONICK FORGE Milestone 1

## Runtime model
Static SPA. No backend is required for local editing, storage, preview, or ZIP.
The browser is the runtime. A one-time development build bundles pinned dependencies
into `vendor/`; normal app usage does not require a build.

## Modules
- `storage.js`: versioned IndexedDB schema, transactions, migrations, snapshots.
- `workspace.js`: in-memory project state, dirty tracking, autosave, session restore.
- `editor.js`: CodeMirror 6 integration, per-file EditorState, toolbar commands.
- `preview.js`: builds a sandboxed preview document, resolves local assets to data URLs,
  extracts scripts, runs them through a blob bootstrap, and captures errors/logs.
- `archive.js`: fflate ZIP import/export with path and size validation.
- `search.js`: plain-text project search and transaction-safe replace-all.
- `ui.js`: accessible modals, toasts, DOM helpers.
- `app.js`: wiring, routing, sheets, toolbar, PWA registration.
- `sw.js`: versioned app-shell cache; never caches project data or API responses.

## Storage schema
Database: `nononick-forge`, version 3.

| Store | Key | Purpose |
|---|---|---|
| `projects` | `id` | Project metadata |
| `files` | `[projectId, path]` | Files and folder records |
| `workspace` | `id` | Last session |
| `snapshots` | `id` | Local revisions |
| `syncState` | `projectId` | Reserved for future sync metadata |
| `prefs` | `key` | Non-sensitive preferences |

Folders are explicit records with `kind: "folder"`. Empty folders can be persisted.
Binary files are stored as `ArrayBuffer`; text files as strings.

## Preview isolation
- iframe with `sandbox="allow-scripts"` only.
- No `allow-same-origin`, no top navigation, no popups, no forms.
- Project scripts are delivered as blob URLs created inside the sandboxed document
  by a bootstrap blob script.
- Project CSS is inlined after local `url(...)` assets are converted to data URLs.
- The preview document receives a restrictive CSP.
- Parent and preview communicate only via `postMessage`; the parent validates
  `event.source === iframe.contentWindow` and known message types.
- No app secrets or privileged APIs are exposed to preview code.

## PWA
- `manifest.webmanifest` with standalone display.
- Versioned service worker caches the app shell.
- Project data remains in IndexedDB; the service worker never caches it.
- Offline behavior is best-effort and subject to Safari/WebKit storage and
  service-worker limitations.
 
 
