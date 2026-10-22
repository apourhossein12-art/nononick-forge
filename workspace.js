import { uuid, normalizePath, isTextPath, mimeFor, basename } from './utils.js';

const STARTER_FILES = [
  {
    path: 'index.html',
    content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Forge Project</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="app">
    <h1>Hello, Forge.</h1>
    <p>Edit this project on your iPhone.</p>
    <button id="action">Tap me</button>
    <output id="result"></output>
  </main>
  <script src="app.js"></script>
</body>
</html>`
  },
  {
    path: 'styles.css',
    content: `:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: #050609;
  color: #e6edf7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.app { width: min(520px, 90vw); padding: 24px; border: 1px solid #1b2230; }
h1 { margin: 0 0 8px; font-size: 28px; }
p { color: #8b97a8; line-height: 1.7; }
button { min-height: 44px; padding: 0 16px; border: 1px solid #62d9ff; background: rgba(98,217,255,.1); color: #62d9ff; }
output { display: block; margin-top: 16px; font-family: ui-monospace, monospace; }`
  },
  {
    path: 'app.js',
    content: `const button = document.getElementById('action');
const result = document.getElementById('result');
let count = 0;
button.addEventListener('click', () => {
  count += 1;
  result.textContent = 'Tapped ' + count + ' time' + (count === 1 ? '' : 's');
  console.log('Forge action', count);
});
console.info('Forge project loaded');`
  }
];

export class Workspace {
  constructor(db) {
    this.db = db;
    this.projects = [];
    this.project = null;
    this.files = [];
    this.tabs = [];
    this.activePath = null;
    this.dirty = new Set();
    this.status = 'saved';
    this.expandedFolders = new Set();
    this._listeners = new Map();
    this._saveTimers = new Map();
    this._sessionTimer = null;
    this._sessionWrite = null;
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this._listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    for (const handler of this._listeners.get(event) || []) {
      try { handler(payload); } catch (error) { console.error('[FORGE] listener error', error); }
    }
  }

  get activeFile() {
    return this.entry(this.activePath);
  }

  entry(path) {
    return this.files.find((file) => file.path === path) || null;
  }

  textFiles() {
    return this.files.filter((file) => file.kind === 'file' && !file.binary && isTextPath(file.path));
  }

  async init() {
    this.projects = await this.db.listProjects();
    const savedSession = await this.db.getWorkspace();

    if (!this.projects.length) {
      const project = await this.createProject('Forge Project', { switchTo: false });
      this.projects = [project];
    }

    const desiredProject = this.projects.find((project) => project.id === savedSession?.projectId)
      || this.projects[0];

    await this.openProject(desiredProject.id, savedSession);
  }

  async refreshProjects() {
    this.projects = await this.db.listProjects();
    this.emit('projects-changed', this.projects);
  }

  async openProject(projectId, session = null) {
    const project = await this.db.getProject(projectId);
    if (!project) throw new Error('پروژه پیدا نشد.');
    this.project = project;
    this.files = await this.db.getFiles(projectId);
    this.dirty.clear();
    this.status = 'saved';
    this.tabs = [];
    this.activePath = null;

    const validPaths = new Set(this.files.filter((file) => file.kind === 'file' && !file.binary).map((file) => file.path));

    if (session && session.projectId === projectId) {
      this.tabs = (session.openPaths || []).filter((path) => validPaths.has(path));
      this.activePath = validPaths.has(session.activePath) ? session.activePath : (this.tabs[0] || null);
      if (this.activePath && !this.tabs.includes(this.activePath)) this.tabs.unshift(this.activePath);
    } else {
      const index = this.files.find((file) => file.path === 'index.html');
      if (index) {
        this.tabs = [index.path];
        this.activePath = index.path;
      }
    }

    this.emit('project-changed', this.project);
    this.emit('files-changed', this.files);
    this.emit('tabs-changed', this.tabs);
    this.emit('active-changed', this.activePath);
    this.emit('status-changed', this.status);
    this.saveSessionSoon();
  }

  async createProject(name, { switchTo = true } = {}) {
    const projectName = await this._uniqueProjectName(String(name || 'Untitled Project').trim());
    const now = Date.now();
    const project = {
      id: uuid(),
      name: projectName,
      createdAt: now,
      updatedAt: now
    };
    const entries = STARTER_FILES.map((file) => ({
      path: file.path,
      kind: 'file',
      content: file.content,
      binary: false,
      mime: mimeFor(file.path),
      size: file.content.length
    }));
    await this.db.createProject(project, entries);
    await this.refreshProjects();
    if (switchTo) await this.openProject(project.id);
    return project;
  }

  async importProject(name, entries) {
    const projectName = await this._uniqueProjectName(String(name || 'Imported Project').trim());
    const now = Date.now();
    const project = { id: uuid(), name: projectName, createdAt: now, updatedAt: now };
    await this.db.createProject(project, entries);
    await this.refreshProjects();
    await this.openProject(project.id);
    return project;
  }

  async duplicateProject(projectId) {
    const source = this.projects.find((project) => project.id === projectId);
    if (!source) throw new Error('پروژه پیدا نشد.');
    const files = await this.db.getFiles(projectId);
    const project = {
      id: uuid(),
      name: await this._uniqueProjectName(`${source.name} Copy`),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await this.db.createProject(project, files.map((file) => ({ ...file })));
    await this.refreshProjects();
    await this.openProject(project.id);
    return project;
  }

  async renameProject(projectId, name) {
    const project = this.projects.find((item) => item.id === projectId);
    if (!project) throw new Error('پروژه پیدا نشد.');
    const nextName = String(name || '').trim();
    if (!nextName) throw new Error('نام پروژه خالی است.');
    if (this.projects.some((item) => item.id !== projectId && item.name === nextName)) {
      throw new Error('پروژه‌ای با این نام وجود دارد.');
    }
    const updated = { ...project, name: nextName };
    await this.db.updateProject(updated);
    await this.refreshProjects();
    if (this.project?.id === projectId) {
      this.project = updated;
      this.emit('project-changed', this.project);
    }
  }

  async deleteProject(projectId) {
    if (this.projects.length <= 1) throw new Error('حداقل یک پروژه باید باقی بماند.');
    await this.db.deleteProject(projectId);
    await this.refreshProjects();
    if (this.project?.id === projectId) {
      await this.openProject(this.projects[0].id);
    }
  }

  async refreshFiles() {
    if (!this.project) return;
    this.files = await this.db.getFiles(this.project.id);
    this.emit('files-changed', this.files);
  }

  async ensureParentFolders(path) {
    const parts = normalizePath(path).split('/');
    parts.pop();
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.files.some((file) => file.path === current)) {
        await this.db.putFile({
          projectId: this.project.id,
          path: current,
          kind: 'folder',
          content: '',
          binary: false,
          mime: '',
          size: 0,
          updatedAt: Date.now()
        });
      }
    }
  }

  async createFile(path, content = '') {
    const normalized = normalizePath(path);
    if (this.entry(normalized)) throw new Error('مسیری با این نام وجود دارد.');
    await this.ensureParentFolders(normalized);
    const file = {
      projectId: this.project.id,
      path: normalized,
      kind: 'file',
      content,
      binary: false,
      mime: mimeFor(normalized),
      size: content.length,
      updatedAt: Date.now()
    };
    await this.db.putFile(file);
    await this.refreshFiles();
    await this.openFile(normalized);
    return file;
  }

  async createFolder(path) {
    const normalized = normalizePath(path);
    if (this.entry(normalized)) throw new Error('مسیری با این نام وجود دارد.');
    await this.ensureParentFolders(normalized);
    const folder = {
      projectId: this.project.id,
      path: normalized,
      kind: 'folder',
      content: '',
      binary: false,
      mime: '',
      size: 0,
      updatedAt: Date.now()
    };
    await this.db.putFile(folder);
    this.expandedFolders.add(normalized);
    await this.refreshFiles();
    return folder;
  }

  async openFile(path) {
    const file = this.entry(path);
    if (!file || file.kind === 'folder') return;
    if (file.binary) {
      this.emit('binary-selected', file);
      return;
    }
    if (!this.tabs.includes(path)) this.tabs = [...this.tabs, path];
    this.activePath = path;
    this.emit('tabs-changed', this.tabs);
    this.emit('active-changed', this.activePath);
    this.saveSessionSoon();
  }

  closeTab(path, { force = false } = {}) {
    if (this.dirty.has(path) && !force) {
      throw new Error('فایل تغییرات ذخیره‌نشده دارد.');
    }
    const index = this.tabs.indexOf(path);
    if (index === -1) return;
    this.tabs = this.tabs.filter((item) => item !== path);
    if (this.activePath === path) {
      this.activePath = this.tabs[Math.max(0, index - 1)] || this.tabs[0] || null;
    }
    this.emit('tabs-changed', this.tabs);
    this.emit('active-changed', this.activePath);
    this.saveSessionSoon();
  }

  setActive(path) {
    if (!this.tabs.includes(path)) return;
    this.activePath = path;
    this.emit('active-changed', path);
    this.saveSessionSoon();
  }

  noteEdit(path, content) {
    const file = this.entry(path);
    if (!file || file.kind !== 'file') return;
    file.content = content;
    file.size = content.length;
    file.updatedAt = Date.now();
    this.dirty.add(path);
    this.status = 'dirty';
    this.emit('dirty-changed', this.dirty);
    this.emit('status-changed', this.status);
    this.scheduleSave(path, content);
    this.saveSessionSoon();
  }

  scheduleSave(path, content) {
    clearTimeout(this._saveTimers.get(path));
    this._saveTimers.set(path, setTimeout(() => {
      this._saveTimers.delete(path);
      this.savePath(path, content).catch(() => {});
    }, 700));
  }

  async savePath(path, content = null) {
    const file = this.entry(path);
    if (!file || file.kind !== 'file' || file.binary) return;
    const value = content ?? file.content;
    this.status = 'saving';
    this.emit('status-changed', this.status);
    try {
      await this.db.putFile({
        ...file,
        content: value,
        size: value.length,
        updatedAt: Date.now()
      });
      if (file.content === value) {
        this.dirty.delete(path);
        this.emit('dirty-changed', this.dirty);
        this.status = this.dirty.size ? 'dirty' : 'saved';
      } else {
        this.status = 'dirty';
      }
      this.emit('status-changed', this.status);
    } catch (error) {
      this.status = 'error';
      this.emit('status-changed', this.status);
      this.emit('storage-error', error);
      throw error;
    }
  }

  async saveAll() {
    const paths = [...this.dirty];
    for (const path of paths) {
      const file = this.entry(path);
      if (file) await this.savePath(path, file.content);
    }
    await this.refreshFiles();
  }

  async flushPendingSaves() {
    const promises = [];
    for (const [path, timer] of this._saveTimers) {
      clearTimeout(timer);
      this._saveTimers.delete(path);
      const file = this.entry(path);
      if (file) promises.push(this.savePath(path, file.content));
    }
    await Promise.allSettled(promises);
  }

  async renameEntry(path, newPath) {
    const normalized = normalizePath(newPath);
    const entry = this.entry(path);
    if (!entry) throw new Error('مسیر پیدا نشد.');
    if (this.dirty.has(path)) await this.savePath(path, entry.content);
    await this.db.renameEntry(this.project.id, path, normalized);

    this.tabs = this.tabs.map((tab) => {
      if (tab === path) return normalized;
      if (tab.startsWith(`${path}/`)) return normalized + tab.slice(path.length);
      return tab;
    });
    if (this.activePath === path) this.activePath = normalized;
    else if (this.activePath?.startsWith(`${path}/`)) {
      this.activePath = normalized + this.activePath.slice(path.length);
    }

    await this.refreshFiles();
    this.emit('tabs-changed', this.tabs);
    this.emit('active-changed', this.activePath);
    this.emit('entry-renamed', { from: path, to: normalized });
    this.saveSessionSoon();
  }

  async duplicateEntry(path, newPath) {
    const normalized = normalizePath(newPath);
    await this.db.duplicateEntry(this.project.id, path, normalized);
    await this.refreshFiles();
    return this.entry(normalized);
  }

  async deleteEntry(path) {
    const entry = this.entry(path);
    if (!entry) throw new Error('مسیر پیدا نشد.');
    await this.db.deleteEntry(this.project.id, path);
    const affected = (candidate) => candidate === path || candidate.startsWith(`${path}/`);
    this.tabs = this.tabs.filter((tab) => !affected(tab));
    if (this.activePath && affected(this.activePath)) {
      this.activePath = this.tabs[0] || null;
    }
    for (const dirtyPath of [...this.dirty]) {
      if (affected(dirtyPath)) this.dirty.delete(dirtyPath);
    }
    await this.refreshFiles();
    this.emit('tabs-changed', this.tabs);
    this.emit('active-changed', this.activePath);
    this.emit('dirty-changed', this.dirty);
    this.saveSessionSoon();
  }

  async snapshot(reason = 'manual') {
    const snapshot = await this.db.createSnapshot(this.project.id, reason, this.files);
    const snapshots = await this.db.listSnapshots(this.project.id);
    for (const old of snapshots.slice(20)) {
      // Old snapshots are kept; trimming is a future enhancement.
      break;
    }
    return snapshot;
  }

  async restoreSnapshot(snapshotId) {
    await this.db.restoreSnapshot(this.project.id, snapshotId);
    this.dirty.clear();
    await this.refreshFiles();
    this.emit('tabs-changed', this.tabs);
    this.emit('active-changed', this.activePath);
  }

  saveSessionSoon() {
    clearTimeout(this._sessionTimer);
    this._sessionTimer = setTimeout(() => {
      this._sessionWrite = this.db.saveWorkspace({
        projectId: this.project?.id || null,
        openPaths: this.tabs,
        activePath: this.activePath
      }).catch((error) => console.error('[FORGE] session save failed', error));
    }, 250);
  }

  async _uniqueProjectName(base) {
    let name = base || 'Untitled Project';
    let counter = 2;
    const existing = new Set(this.projects.map((project) => project.name));
    while (existing.has(name)) {
      name = `${base} ${counter}`;
      counter += 1;
    }
    return name;
  }
}
 
 
