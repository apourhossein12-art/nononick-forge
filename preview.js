import { dirname, extname, mimeFor, dataUrlFromFile, escapeForHtmlText } from './utils.js';

const BOOTSTRAP_SOURCE = String.raw`
(() => {
  const post = (type, payload) => {
    try { parent.postMessage({ __forge: true, type, payload }, '*'); } catch {}
  };
  const safe = (value) => {
    try {
      if (typeof value === 'string') return value.slice(0, 4000);
      if (value instanceof Error) return (value.stack || value.message || '').slice(0, 4000);
      return JSON.stringify(value).slice(0, 4000);
    } catch {
      return '[unserializable]';
    }
  };
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const level of ['log', 'warn', 'error', 'info']) {
    console[level] = (...args) => {
      post('log', { level, args: args.map(safe) });
      try { original[level](...args); } catch {}
    };
  }
  window.addEventListener('error', (event) => {
    post('log', { level: 'error', args: [safe(event.message), safe(event.filename + ':' + event.lineno + ':' + event.colno)] });
  });
  window.addEventListener('unhandledrejection', (event) => {
    post('log', { level: 'error', args: ['Unhandled rejection', safe(event.reason)] });
  });
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest && event.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (href && !href.startsWith('#')) {
      event.preventDefault();
      post('log', { level: 'warn', args: ['Navigation blocked in preview: ' + safe(href)] });
    }
  }, true);
  window.addEventListener('message', (event) => {
    if (event.source !== parent) return;
    const data = event.data;
    if (!data || data.__forge !== true || data.type !== 'run') return;
    const scripts = Array.isArray(data.payload && data.payload.scripts)
      ? data.payload.scripts.slice(0, 40)
      : [];
    for (const item of scripts) {
      if (!item || typeof item.code !== 'string') continue;
      const blob = new Blob([item.code], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = url;
      if (item.type === 'module') script.type = 'module';
      else script.async = false;
      script.onerror = () => post('log', { level: 'error', args: ['Failed to load a project script.'] });
      document.body.appendChild(script);
    }
    post('run-accepted', { count: scripts.length });
  });
  post('ready', {});
})();
`;

function resolvePath(basePath, reference) {
  const clean = String(reference || '').split('#')[0].split('?')[0].trim();
  if (!clean || /^(?:[a-z]+:)?\/\//i.test(clean) || clean.startsWith('data:') || clean.startsWith('blob:')) {
    return null;
  }
  let path = clean.replace(/\\/g, '/');
  if (path.startsWith('/')) {
    path = path.slice(1);
  } else {
    const base = dirname(basePath);
    path = base ? `${base}/${path}` : path;
  }
  const parts = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function cssUrlToDataUrl(css, cssPath, fileMap, warnings) {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, reference) => {
    if (/^(data:|https?:|blob:|#)/i.test(reference)) return match;
    const resolved = resolvePath(cssPath, reference);
    const file = resolved ? fileMap.get(resolved) : null;
    if (!file) {
      warnings.push(`CSS asset not found: ${reference} (from ${cssPath})`);
      return match;
    }
    return `url("${dataUrlFromFile(file)}")`;
  });
}

function parseHtmlDocument(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function serializeDocument(doc) {
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

function buildPreviewHtml(project, files) {
  const fileMap = new Map(files.map((file) => [file.path, file]));
  const htmlFile = fileMap.get('index.html')
    || files.find((file) => file.kind === 'file' && file.path.toLowerCase() === 'index.html');

  const warnings = [];
  if (!htmlFile) {
    return {
      html: `<!doctype html><meta charset="utf-8"><body style="background:#050609;color:#ff6b7a;font-family:monospace;padding:24px">
        <h1>index.html not found</h1>
        <p>Create an index.html at the project root to preview.</p></body>`,
      scripts: [],
      warnings: ['index.html not found']
    };
  }

  const doc = parseHtmlDocument(htmlFile.content);
  doc.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach((node) => node.remove());
  doc.querySelectorAll('base').forEach((node) => node.remove());

  const csp = doc.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', [
    "default-src 'none'",
    "script-src blob:",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data: blob:",
    "media-src data: blob:",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'"
  ].join('; '));
  doc.head.prepend(csp);

  const scripts = [];

  doc.querySelectorAll('link[rel~="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) { link.remove(); return; }
    const resolved = resolvePath(htmlFile.path, href);
    const cssFile = resolved ? fileMap.get(resolved) : null;
    if (!cssFile || cssFile.binary) {
      warnings.push(`Stylesheet not resolved locally: ${href}`);
      link.remove();
      return;
    }
    const style = doc.createElement('style');
    style.textContent = cssUrlToDataUrl(cssFile.content, cssFile.path, fileMap, warnings);
    link.replaceWith(style);
  });

  doc.querySelectorAll('script').forEach((script) => {
    const src = script.getAttribute('src');
    if (src) {
      const resolved = resolvePath(htmlFile.path, src);
      const jsFile = resolved ? fileMap.get(resolved) : null;
      if (!jsFile || jsFile.binary) {
        warnings.push(`Script not resolved locally: ${src}`);
        script.remove();
        return;
      }
      scripts.push({
        code: jsFile.content,
        type: script.getAttribute('type') === 'module' ? 'module' : 'classic'
      });
    } else {
      scripts.push({
        code: script.textContent || '',
        type: script.getAttribute('type') === 'module' ? 'module' : 'classic'
      });
    }
    script.remove();
  });

  const assetAttributes = ['src', 'poster'];
  doc.querySelectorAll('img, source, video, audio, track').forEach((element) => {
    for (const attribute of assetAttributes) {
      const value = element.getAttribute(attribute);
      if (!value || /^(data:|https?:|blob:)/i.test(value)) continue;
      const resolved = resolvePath(htmlFile.path, value);
      const asset = resolved ? fileMap.get(resolved) : null;
      if (!asset) {
        warnings.push(`Asset not found: ${value}`);
        continue;
      }
      element.setAttribute(attribute, dataUrlFromFile(asset));
    }
  });

  doc.querySelectorAll('iframe, object, embed').forEach((node) => {
    warnings.push(`Embedded element removed: <${node.tagName.toLowerCase()}>`);
    node.remove();
  });

  const bootstrap = doc.createElement('script');
  bootstrap.src = URL.createObjectURL(new Blob([BOOTSTRAP_SOURCE], { type: 'text/javascript' }));
  bootstrap.dataset.forgeBootstrap = 'true';
  doc.body.append(bootstrap);

  return { html: serializeDocument(doc), scripts, warnings, bootstrapUrl: bootstrap.src };
}

export class Preview {
  constructor({ host, onLog, onError }) {
    this.host = host;
    this.onLog = onLog;
    this.onError = onError;
    this.iframe = null;
    this.bootstrapUrl = null;
    this.scripts = [];
    this._messageHandler = null;
  }

  async run(project, files) {
    this.destroyFrame();
    const built = buildPreviewHtml(project, files);
    for (const warning of built.warnings) this.onLog?.({ level: 'warn', args: [warning] });

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('title', 'Project preview');
    iframe.srcdoc = built.html;
    this.iframe = iframe;
    this.bootstrapUrl = built.bootstrapUrl;
    this.scripts = built.scripts;

    this._messageHandler = (event) => {
      if (!this.iframe || event.source !== this.iframe.contentWindow) return;
      const data = event.data;
      if (!data || data.__forge !== true) return;
      if (data.type === 'ready') {
        try {
          this.iframe.contentWindow.postMessage({
            __forge: true,
            type: 'run',
            payload: { scripts: this.scripts.slice(0, 40) }
          }, '*');
        } catch (error) {
          this.onError?.(error);
        }
      } else if (data.type === 'log') {
        const payload = data.payload || {};
        this.onLog?.({
          level: ['log','info','warn','error'].includes(payload.level) ? payload.level : 'log',
          args: Array.isArray(payload.args) ? payload.args.slice(0, 10) : []
        });
      } else if (data.type === 'run-accepted') {
        this.onLog?.({ level: 'info', args: [`Preview executed ${data.payload?.count ?? 0} script(s).`] });
      }
    };
    window.addEventListener('message', this._messageHandler);

    this.host.replaceChildren(iframe);
    return built.warnings;
  }

  destroyFrame() {
    if (this._messageHandler) {
      window.removeEventListener('message', this._messageHandler);
      this._messageHandler = null;
    }
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    if (this.bootstrapUrl) {
      URL.revokeObjectURL(this.bootstrapUrl);
      this.bootstrapUrl = null;
    }
  }

  destroy() {
    this.destroyFrame();
  }
}
 
 
