export const TEXT_EXTENSIONS = new Set([
  'html','htm','css','js','mjs','cjs','jsx','ts','tsx','json','md','txt',
  'svg','xml','yml','yaml','toml','ini','env','sh','bash','sql','py','rb',
  'php','java','c','h','cpp','hpp','cs','go','rs','swift','kt','vue','svelte'
]);

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function normalizePath(input) {
  let path = String(input ?? '').replace(/\\/g, '/').trim();
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!path) throw new Error('مسیر نمی‌تواند خالی باشد.');
  if (path.includes('\0')) throw new Error('مسیر شامل نویسهٔ غیرمجاز است.');
  if (path.length > 240) throw new Error('مسیر بیش از حد طولانی است.');
  const parts = path.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..') {
      throw new Error('مسیر باید نسبی و بدون بخش‌های . یا .. باشد.');
    }
    if (/[<>:"|?*]/.test(part)) {
      throw new Error('مسیر شامل نویسهٔ غیرمجاز ویندوز است.');
    }
  }
  return parts.join('/');
}

export function extname(path) {
  const name = path.split('/').pop() || '';
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function basename(path) {
  return path.split('/').pop() || path;
}

export function dirname(path) {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function isTextPath(path) {
  return TEXT_EXTENSIONS.has(extname(path));
}

export function mimeFor(path) {
  const ext = extname(path);
  const map = {
    html:'text/html', htm:'text/html', css:'text/css', js:'text/javascript',
    mjs:'text/javascript', json:'application/json', svg:'image/svg+xml',
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
    webp:'image/webp', avif:'image/avif', ico:'image/x-icon',
    woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf',
    mp3:'audio/mpeg', mp4:'video/mp4', webm:'video/webm',
    wasm:'application/wasm', xml:'application/xml', txt:'text/plain',
    md:'text/markdown', pdf:'application/pdf'
  };
  return map[ext] || 'application/octet-stream';
}

export function debounce(fn, wait = 300) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B','KB','MB','GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function dataUrlFromFile(file) {
  const bytes = file.binary
    ? new Uint8Array(file.content)
    : new TextEncoder().encode(file.content);
  return `data:${file.mime || mimeFor(file.path)};base64,${bytesToBase64(bytes)}`;
}

export function sanitizeFilename(name) {
  return String(name || 'project').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80);
}

export function escapeForHtmlText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));
}
