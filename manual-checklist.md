# Manual iPhone Test Checklist

## Editor
- [ ] Create a new file with a nested path.
- [ ] Type multiline HTML, CSS, and JS; verify caret, selection, copy/paste.
- [ ] Use undo/redo and bracket insertion.
- [ ] Switch tabs and confirm per-file undo history.
- [ ] Confirm dirty dot appears and disappears after save.

## Persistence
- [ ] Save, force-quit Safari, reopen; project and tabs restore.
- [ ] Open in private mode; verify a clear error if IndexedDB fails.
- [ ] Disable storage / fill quota; verify save failure is visible and dirty content remains.
- [ ] Create and restore a snapshot.

## ZIP
- [ ] Export a project with nested folders and binary assets.
- [ ] Unzip externally and verify structure.
- [ ] Import a ZIP with `../evil.js`; verify rejection.
- [ ] Import a valid multi-file ZIP; verify no overwrite without confirmation.

## Preview
- [ ] Run starter project; click button and verify console log.
- [ ] Add `throw new Error('x')`; verify error appears in console.
- [ ] Try `parent.document.body`; verify access is denied.
- [ ] Try `fetch('/secret')`; verify blocked.
- [ ] Test responsive and landscape sizes.

## PWA
- [ ] Serve over HTTPS.
- [ ] Install via Add to Home Screen.
- [ ] Turn off network; reopen; verify shell loads.
- [ ] Verify a newer service worker offers update.
 
 
