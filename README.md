# NONONICK FORGE — Milestone 1

Mobile-first, iPhone-oriented web IDE with IndexedDB persistence, CodeMirror 6, sandboxed preview, ZIP import/export, and PWA shell.

## Quick start

```bash
npm ci
npm run build:vendor
npm run generate:icons
```

Serve the repository root over **HTTPS** (or `http://localhost`) from any static host. Do **not** open via `file://`.

```bash
npx serve .
# or: python3 -m http.server 8080
```

Then open in Safari / Chrome. On iPhone: Share → Add to Home Screen for PWA install.

## What works in this milestone

| Area | Status |
|------|--------|
| Projects / files CRUD | Implemented |
| IndexedDB schema, autosave, snapshots | Implemented |
| CodeMirror 6 editor + toolbar | Implemented (after vendor build) |
| Project-wide search/replace | Implemented |
| Sandboxed HTML/CSS/JS preview | Implemented |
| ZIP import/export | Implemented |
| PWA manifest + service worker | Implemented |
| Settings, storage quota, backup | Implemented |
| GitHub OAuth / sync | **Not** in this milestone |
| Node.js / backend execution | Impossible in browser-only runtime |

## Project layout

```
nononick-forge/
├── index.html
├── manifest.webmanifest
├── sw.js
├── package.json
├── scripts/
├── vendor-src/
├── vendor/          # generated
├── css/
├── js/
├── assets/
├── tests/
└── docs/
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Limitations](docs/LIMITATIONS.md)
- [Test report](docs/TEST-REPORT.md)
- [Manual iPhone checklist](tests/manual-checklist.md)

## License

Private / use as needed for the NONONICK FORGE project.
