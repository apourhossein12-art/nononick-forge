# Test Report — Milestone 1

## Environment
This deliverable was authored statically. The following tests were **not executed**
in a real Safari/iPhone environment in this answer. They must be run before production.

| # | Test | Status |
|---|---|---|
| 1 | Multiline editing in Safari iPhone | Not run |
| 2 | Open/switch files, tabs, dirty indicators | Not run |
| 3 | Save, reload, session restore | Not run |
| 4 | IndexedDB failure handling and unsaved-change retention | Not run |
| 5 | ZIP import/export with multi-file project | Not run |
| 6 | Preview local HTML/CSS/JS, assets, runtime errors | Not run |
| 7 | Preview cannot access parent DOM/IndexedDB | Not run |
| 8 | PWA install + offline shell | Not run |
| 9 | Malicious ZIP paths and invalid archives | Not run |
| 10 | Portrait, landscape, keyboard open/closed | Not run |
| 11 | GitHub auth/sync | Not implemented |
| 12 | Every visible control reports failure | Partially reviewed statically |

## Static checks performed
- No `eval()` / `new Function()` in application source.
- CSP has no `unsafe-inline` or `unsafe-eval` in `script-src`.
- Preview iframe sandbox is `allow-scripts` only.
- ZIP path traversal checks are present.
- All dynamic UI text uses text nodes.
- IndexedDB schema creation is idempotent and versioned.

## Required device tests
Use `tests/manual-checklist.md` on an actual iPhone with Safari, both HTTPS and
installed PWA modes. Record pass/fail and console output before claiming production readiness.
 
 
