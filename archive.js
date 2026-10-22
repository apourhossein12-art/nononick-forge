import { zip, unzip, unzipSync, strToU8, strFromU8 } from './fflate.js';
import { normalizePath, isTextPath, mimeFor, sanitizeFilename, downloadBlob } from './utils.js';

const LIMITS = {
  maxEntries: 500,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 30 * 1024 * 1024
};

function unzipAsync(data) {
  return new Promise((resolve, reject) => {
    unzip(data, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export async function readZip(file) {
  if (!file) throw new Error('فایلی انتخاب نشد.');
  if (file.size > LIMITS.maxTotalBytes * 2) {
    throw new Error('حجم فایل ZIP بیش از حد مجاز است.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let archive;
  try {
    archive = await unzipAsync(bytes);
  } catch (error) {
    throw new Error('ZIP معتبر نیست یا فشرده‌سازی آن پشتیبانی نمی‌شود.', { cause: error });
  }

  const paths = Object.keys(archive);
  if (paths.length > LIMITS.maxEntries) {
    throw new Error(`تعداد ورودی‌های ZIP بیش از ${LIMITS.maxEntries} است.`);
  }

  const entries = [];
  const seen = new Set();
  let total = 0;

  for (const rawPath of paths) {
    const isDirectory = rawPath.endsWith('/');
    let path;
    try {
      path = normalizePath(isDirectory ? rawPath.slice(0, -1) : rawPath);
    } catch (error) {
      throw new Error(`مسیر ناامن در ZIP: ${rawPath}`);
    }

    if (path.startsWith('__MACOSX/') || path.endsWith('.DS_Store')) continue;
    if (seen.has(path)) throw new Error(`مسیر تکراری در ZIP: ${path}`);
    seen.add(path);

    const content = archive[rawPath];
    const size = content.byteLength;
    total += size;
    if (size > LIMITS.maxFileBytes) throw new Error(`فایل «${path}» بیش از حد بزرگ است.`);
    if (total > LIMITS.maxTotalBytes) throw new Error('حجم استخراج‌شدهٔ ZIP بیش از حد مجاز است.');

    if (isDirectory) {
      entries.push({ path, kind: 'folder', content: '', binary: false, mime: '', size: 0 });
      continue;
    }

    const text = isTextPath(path);
    entries.push({
      path,
      kind: 'file',
      content: text ? strFromU8(content) : content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
      binary: !text,
      mime: mimeFor(path),
      size
    });
  }

  const files = entries.filter((entry) => entry.kind === 'file');
  if (!files.length) throw new Error('ZIP هیچ فایل قابل‌استفاده‌ای ندارد.');
  return entries;
}

function buildZipInput(files) {
  const input = {};
  for (const file of files) {
    if (file.kind === 'folder') {
      input[`${file.path}/`] = new Uint8Array(0);
    } else if (file.binary) {
      input[file.path] = new Uint8Array(file.content);
    } else {
      input[file.path] = strToU8(file.content);
    }
  }
  return input;
}

function zipAsync(input) {
  return new Promise((resolve, reject) => {
    zip(input, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

export async function exportProjectZip(project, files) {
  const input = buildZipInput(files);
  const zipped = await zipAsync(input);
  if (!zipped || !zipped.byteLength) throw new Error('ساخت ZIP ناموفق بود.');

  const verification = unzipSync(zipped);
  const expected = Object.keys(input).sort();
  const actual = Object.keys(verification).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    throw new Error('صحت ZIP ساخته‌شده تأیید نشد.');
  }

  const filename = `${sanitizeFilename(project.name)}.zip`;
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), filename);
  return { filename, bytes: zipped.byteLength };
}

export async function exportBackup(db) {
  const data = await db.exportAllData();
  const bytes = strToU8(JSON.stringify(data, null, 2));
  const filename = `forge-backup-${new Date().toISOString().slice(0,10)}.json`;
  downloadBlob(new Blob([bytes], { type: 'application/json' }), filename);
  return { filename, bytes: bytes.byteLength, projects: data.projects.length };
}
 
 
