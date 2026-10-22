export const DEFAULT_PREFS = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true
};

export async function loadPrefs(db) {
  const rows = await db.getPrefs();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    fontSize: Number.isFinite(stored.fontSize) ? stored.fontSize : DEFAULT_PREFS.fontSize,
    tabSize: Number.isFinite(stored.tabSize) ? stored.tabSize : DEFAULT_PREFS.tabSize,
    wordWrap: typeof stored.wordWrap === 'boolean' ? stored.wordWrap : DEFAULT_PREFS.wordWrap,
    lineNumbers: typeof stored.lineNumbers === 'boolean' ? stored.lineNumbers : DEFAULT_PREFS.lineNumbers
  };
}

export async function savePrefs(db, prefs) {
  await db.setPref('fontSize', prefs.fontSize);
  await db.setPref('tabSize', prefs.tabSize);
  await db.setPref('wordWrap', prefs.wordWrap);
  await db.setPref('lineNumbers', prefs.lineNumbers);
}
 
 
