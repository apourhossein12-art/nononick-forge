import { normalizePath } from './utils.js';

const DB_NAME = 'nononick-forge';
const DB_VERSION = 3;

const STORES = {
  projects: 'projects',
  files: 'files',
  workspace: 'workspace',
  snapshots: 'snapshots',
  syncState: 'syncState',
  prefs: 'prefs'
};

export class StorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

export class ForgeDB {
  constructor() {
    this.db = null;
    this._opening = null;
  }

  async open() {
    if (this.db) return this.db;
    if (!this._opening) {
      this._opening = this._openInternal().catch((error) => {
        this._opening = null;
        throw new StorageError('باز کردن پایگاه‌داده ممکن نشد. آیا حالت خصوصی Safari فعال است؟', error);
      });
    }
    return this._opening;
  }

  _openInternal() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const tx = request.transaction;
        const oldVersion = event.oldVersion;

        if (!db.objectStoreNames.contains(STORES.projects)) {
          const store = db.createObjectStore(STORES.projects, { keyPath: 'id' });
          store.createIndex('name', 'name');
          store.createIndex('updatedAt', 'updatedAt');
        }

        if (!db.objectStoreNames.contains(STORES.files)) {
          const store = db.createObjectStore(STORES.files, { keyPath: ['projectId', 'path'] });
          store.createIndex('projectId', 'projectId');
          store.createIndex('projectId_updatedAt', ['projectId', 'updatedAt']);
        } else if (oldVersion < 3) {
          const store = tx.objectStore(STORES.files);
          if (!store.indexNames.contains('projectId_updatedAt')) {
            store.createIndex('projectId_updatedAt', ['projectId', 'updatedAt']);
          }
          store.openCursor().onsuccess = (cursorEvent) => {
            const cursor = cursorEvent.target.result;
            if (!cursor) return;
            const value = cursor.value;
            if (!value.kind) {
              cursor.update({
                ...value,
                kind: 'file',
                size: value.size ?? (typeof value.content === 'string'
                  ? value.content.length
                  : value.content?.byteLength || 0)
              });
            }
            cursor.continue();
          };
        }

        if (!db.objectStoreNames.contains(STORES.workspace)) {
          db.createObjectStore(STORES.workspace, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORES.snapshots)) {
          const store = db.createObjectStore(STORES.snapshots, { keyPath: 'id' });
          store.createIndex('projectId', 'projectId');
          store.createIndex('projectId_createdAt', ['projectId', 'createdAt']);
        }

        if (!db.objectStoreNames.contains(STORES.syncState)) {
          db.createObjectStore(STORES.syncState, { keyPath: 'projectId' });
        }

        if (!db.objectStoreNames.contains(STORES.prefs)) {
          db.createObjectStore(STORES.prefs, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db.close();
          this.db = null;
          this._opening = null;
        };
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('پایگاه‌داده توسط نسخهٔ دیگری از برنامه باز نگه داشته شده است.'));
    });
  }

  async listProjects() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.projects, 'readonly');
      const request = tx.objectStore(STORES.projects).getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.updatedAt - a.updatedAt));
      request.onerror = () => reject(request.error);
    });
  }

  async getProject(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORES.projects, 'readonly')
        .objectStore(STORES.projects).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async createProject(project, entries) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.projects, STORES.files], 'readwrite');
      tx.oncomplete = () => resolve(project);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('ساخت پروژه لغو شد.'));
      tx.objectStore(STORES.projects).add(project);
      const files = tx.objectStore(STORES.files);
      for (const entry of entries) {
        files.add({
          projectId: project.id,
          path: normalizePath(entry.path),
          kind: entry.kind === 'folder' ? 'folder' : 'file',
          content: entry.kind === 'folder' ? '' : entry.content,
          binary: Boolean(entry.binary),
          mime: entry.mime || '',
          size: entry.size ?? 0,
          updatedAt: Date.now()
        });
      }
    });
  }

  async updateProject(project) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.projects, 'readwrite');
      tx.objectStore(STORES.projects).put({ ...project, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteProject(projectId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [STORES.projects, STORES.files, STORES.snapshots, STORES.syncState],
        'readwrite'
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('حذف پروژه لغو شد.'));

      tx.objectStore(STORES.projects).delete(projectId);

      const filesIndex = tx.objectStore(STORES.files).index('projectId');
      filesIndex.openCursor(IDBKeyRange.only(projectId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };

      const snapshotsIndex = tx.objectStore(STORES.snapshots).index('projectId');
      snapshotsIndex.openCursor(IDBKeyRange.only(projectId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };

      tx.objectStore(STORES.syncState).delete(projectId);
    });
  }

  async getFiles(projectId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.files, 'readonly');
      const request = tx.objectStore(STORES.files).index('projectId').getAll(IDBKeyRange.only(projectId));
      request.onsuccess = () => resolve(request.result.sort((a, b) => a.path.localeCompare(b.path)));
      request.onerror = () => reject(request.error);
    });
  }

  async putFile(file) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.files, STORES.projects], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('ذخیرهٔ فایل لغو شد.'));
      tx.objectStore(STORES.files).put(file);

      const projects = tx.objectStore(STORES.projects);
      const request = projects.get(file.projectId);
      request.onsuccess = () => {
        if (request.result) {
          projects.put({ ...request.result, updatedAt: Date.now() });
        }
      };
    });
  }

  async putFilesBatch(files) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.files, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('ذخیرهٔ دسته‌ای لغو شد.'));
      const store = tx.objectStore(STORES.files);
      for (const file of files) store.put(file);
    });
  }

  async replaceProjectFiles(projectId, files) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.files, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('جای‌گذاری فایل‌ها لغو شد.'));
      const store = tx.objectStore(STORES.files);
      store.index('projectId').openCursor(IDBKeyRange.only(projectId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          for (const file of files) store.put({ ...file, projectId });
        }
      };
    });
  }

  async deleteEntry(projectId, path) {
    const normalized = normalizePath(path);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.files, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('حذف لغو شد.'));
      const store = tx.objectStore(STORES.files);
      const request = store.index('projectId').getAll(IDBKeyRange.only(projectId));
      request.onsuccess = () => {
        const targets = request.result.filter(
          (file) => file.path === normalized || file.path.startsWith(`${normalized}/`)
        );
        if (!targets.length) {
          reject(new Error('مسیر موردنظر پیدا نشد.'));
          tx.abort();
          return;
        }
        for (const file of targets) store.delete([projectId, file.path]);
      };
    });
  }

  async renameEntry(projectId, oldPath, newPath) {
    const source = normalizePath(oldPath);
    const target = normalizePath(newPath);
    if (source === target) return;
    if (target.startsWith(`${source}/`)) {
      throw new Error('انتقال یک پوشه به داخل خودش مجاز نیست.');
    }

    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.files, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('تغییر نام لغو شد.'));

      const store = tx.objectStore(STORES.files);
      const request = store.index('projectId').getAll(IDBKeyRange.only(projectId));
      request.onsuccess = () => {
        const all = request.result;
        const moving = all.filter(
          (file) => file.path === source || file.path.startsWith(`${source}/`)
        );
        if (!moving.length) {
          reject(new Error('مسیر مبدأ پیدا نشد.'));
          tx.abort();
          return;
        }

        const movingPaths = new Set(moving.map((file) => file.path));
        const updates = [];

        for (const file of moving) {
          const suffix = file.path.slice(source.length);
          const nextPath = normalizePath(target + suffix);
          const conflict = all.find((other) => other.path === nextPath && !movingPaths.has(other.path));
          if (conflict) {
            reject(new Error(`مسیر مقصد «${nextPath}» از قبل وجود دارد.`));
            tx.abort();
            return;
          }
          updates.push({ ...file, path: nextPath, updatedAt: Date.now() });
        }

        for (const file of moving) store.delete([projectId, file.path]);
        for (const file of updates) store.put(file);
      };
    });
  }

  async duplicateEntry(projectId, sourcePath, targetPath) {
    const source = normalizePath(sourcePath);
    const target = normalizePath(targetPath);
    if (target === source || target.startsWith(`${source}/`)) {
      throw new Error('مسیر مقصد برای تکثیر معتبر نیست.');
    }

    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.files, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('تکثیر لغو شد.'));

      const store = tx.objectStore(STORES.files);
      const request = store.index('projectId').getAll(IDBKeyRange.only(projectId));
      request.onsuccess = () => {
        const all = request.result;
        const copies = all.filter(
          (file) => file.path === source || file.path.startsWith(`${source}/`)
        );
        if (!copies.length) {
          reject(new Error('مسیر مبدأ پیدا نشد.'));
          tx.abort();
          return;
        }

        const planned = [];
        for (const file of copies) {
          const suffix = file.path.slice(source.length);
          const nextPath = normalizePath(target + suffix);
          if (all.some((other) => other.path === nextPath)) {
            reject(new Error(`مسیر مقصد «${nextPath}» از قبل وجود دارد.`));
            tx.abort();
            return;
          }
          planned.push({ ...file, path: nextPath, updatedAt: Date.now() });
        }

        for (const file of planned) store.put(file);
      };
    });
  }

  async getWorkspace() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORES.workspace, 'readonly')
        .objectStore(STORES.workspace).get('session');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveWorkspace(session) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.workspace, 'readwrite');
      tx.objectStore(STORES.workspace).put({ ...session, id: 'session', updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async createSnapshot(projectId, reason, files) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.snapshots, 'readwrite');
      const store = tx.objectStore(STORES.snapshots);
      const snapshot = {
        id: `${projectId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        reason,
        createdAt: Date.now(),
        files: files.map((file) => ({ ...file }))
      };
      store.add(snapshot);
      tx.oncomplete = () => resolve(snapshot);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('ساخت نسخهٔ پشتیبان لغو شد.'));
    });
  }

  async listSnapshots(projectId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORES.snapshots, 'readonly')
        .objectStore(STORES.snapshots)
        .index('projectId_createdAt')
        .getAll(IDBKeyRange.only(projectId));
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  }

  async restoreSnapshot(projectId, snapshotId) {
    const db = await this.open();
    const snapshot = await new Promise((resolve, reject) => {
      const request = db.transaction(STORES.snapshots, 'readonly')
        .objectStore(STORES.snapshots).get(snapshotId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (!snapshot || snapshot.projectId !== projectId) {
      throw new Error('نسخهٔ پشتیبان پیدا نشد.');
    }
    await this.replaceProjectFiles(projectId, snapshot.files);
    return snapshot.files;
  }

  async getPrefs() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORES.prefs, 'readonly')
        .objectStore(STORES.prefs).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async setPref(key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.prefs, 'readwrite');
      tx.objectStore(STORES.prefs).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async estimate() {
    if (!navigator.storage?.estimate) return { usage: null, quota: null };
    return navigator.storage.estimate();
  }

  async exportAllData() {
    const projects = await this.listProjects();
    const result = { version: DB_VERSION, exportedAt: Date.now(), projects: [] };
    for (const project of projects) {
      result.projects.push({
        project,
        files: await this.getFiles(project.id)
      });
    }
    return result;
  }
}
 
 
