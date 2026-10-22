import { isTextPath } from './utils.js';

export function searchProject(files, query, { caseSensitive = false, maxResults = 200 } = {}) {
  const needle = String(query || '');
  if (!needle) return { results: [], truncated: false };
  const haystackQuery = caseSensitive ? needle : needle.toLowerCase();
  const results = [];
  let truncated = false;

  for (const file of files) {
    if (file.kind !== 'file' || file.binary || !isTextPath(file.path)) continue;
    const lines = String(file.content || '').split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const haystack = caseSensitive ? line : line.toLowerCase();
      let column = haystack.indexOf(haystackQuery);
      while (column !== -1) {
        results.push({
          path: file.path,
          line: lineIndex + 1,
          column: column + 1,
          preview: line.trim().slice(0, 220)
        });
        if (results.length >= maxResults) {
          truncated = true;
          return { results, truncated };
        }
        column = haystack.indexOf(haystackQuery, column + Math.max(1, haystackQuery.length));
      }
    }
  }
  return { results, truncated };
}

export async function replaceAll(db, projectId, files, query, replacement, { caseSensitive = false } = {}) {
  const needle = String(query || '');
  if (!needle) throw new Error('متن جستجو خالی است.');

  let count = 0;
  const updated = [];

  for (const file of files) {
    if (file.kind !== 'file' || file.binary || !isTextPath(file.path)) continue;
    const source = String(file.content || '');
    let next;
    if (caseSensitive) {
      next = source.split(needle).join(replacement);
      count += source.split(needle).length - 1;
    } else {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      const matches = source.match(regex);
      count += matches ? matches.length : 0;
      next = source.replace(regex, replacement);
    }
    if (next !== source) {
      updated.push({
        ...file,
        content: next,
        size: next.length,
        updatedAt: Date.now()
      });
    }
  }

  if (updated.length) {
    await db.putFilesBatch(updated);
  }
  return { count, filesChanged: updated.length };
}
 
 
