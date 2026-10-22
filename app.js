import { ForgeDB } from './storage.js';
import { Workspace } from './workspace.js';
import { createEditor } from './editor.js';
import { Preview } from './preview.js';
import { readZip, exportProjectZip, exportBackup } from './archive.js';
import { searchProject, replaceAll } from './search.js';
import { loadPrefs, savePrefs, DEFAULT_PREFS } from './settings.js';
import { getGitHubStatus } from './github.js';
import { initRouter } from './router.js';
import { el, toast, confirmDialog, promptDialog, choiceDialog } from './ui.js';
import { basename, formatBytes, isTextPath } from './utils.js';

const db = new ForgeDB();
const workspace = new Workspace(db);

const dom = {
  editor: document.getElementById('editor'),
  fallback: document.getElementById('editor-fallback'),
  fallbackContent: document.getElementById('fallback-content'),
  saveState: document.getElementById('save-state'),
  tabs: document.getElementById('tabs'),
  sheet: document.getElementById('sheet'),
  sheetTitle: document.getElementById('sheet-title'),
  sheetBody: document.getElementById('sheet-body'),
  sheetBackdrop: document.getElementById('sheet-backdrop'),
  sheetClose: document.getElementById('sheet-close'),
  previewView: document.getElementById('preview-view'),
  previewHost: document.getElementById('preview-host'),
  previewSize: document.getElementById('preview-size'),
  previewClose: document.getElementById('preview-close'),
  previewRefresh: document.getElementById('preview-refresh'),
  toolbar: document.getElementById('toolbar'),
  bottomNav: document.getElementById('bottom-nav')
};

let prefs = { ...DEFAULT_PREFS };
let editor = null;
let preview = null;
let router = null;
let consoleEntries = [];
let editorError = null;
let zipInput = null;

function setSaveState() {
  const labels = {
    saved: 'ذخیره‌شده',
    saving: 'در حال ذخیره',
    dirty: 'تغییرات ذخیره‌نشده',
    error: 'خطای ذخیره'
  };
  dom.saveState.textContent = labels[workspace.status] || workspace.status;
  dom.saveState.dataset.state = workspace.status;
}

function renderTabs() {
  dom.tabs.replaceChildren();
  for (const path of workspace.tabs) {
    const dirty = workspace.dirty.has(path);
    const tab = el('button', {
      type: 'button',
      class: `tab${workspace.activePath === path ? ' is-active' : ''}`,
      'aria-label': `باز کردن ${path}`,
      onclick: () => workspace.setActive(path)
    });
    if (dirty) tab.append(el('span', { class: 'tab-dot', 'aria-label': 'ذخیره‌نشده' }));
    tab.append(el('span', { text: basename(path) }));
    tab.append(el('button', {
      type: 'button',
      class: 'tab-close',
      'aria-label': `بستن ${path}`,
      text: '✕',
      onclick: async (event) => {
        event.stopPropagation();
        await closeTab(path);
      }
    }));
    dom.tabs.append(tab);
  }
}

async function closeTab(path) {
  if (workspace.dirty.has(path)) {
    const choice = await choiceDialog(
      'فایل تغییرات ذخیره‌نشده دارد',
      'پیش از بستن، تغییرات ذخیره شود؟',
      [
        { label: 'لغو', value: 'cancel' },
        { label: 'دور انداختن', danger: true, value: 'discard' },
        { label: 'ذخیره و بستن', primary: true, value: 'save' }
      ]
    );
    if (choice === 'cancel' || choice === null) return;
    if (choice === 'save') await workspace.savePath(path, workspace.entry(path)?.content ?? '');
    workspace.closeTab(path, { force: true });
  } else {
    workspace.closeTab(path);
  }
  if (workspace.activePath === null && dom.editor) {
    dom.fallbackContent.textContent = '';
  }
}

async function openActiveInEditor() {
  const file = workspace.activeFile;
  if (!file || file.kind !== 'file') return;

  if (file.binary) {
    toast('فایل دودویی در ویرایشگر متنی باز نمی‌شود. برای دارایی‌های تصویری از پیش‌نمایش استفاده کنید.', { type: 'warn' });
    return;
  }

  if (!editor) {
    dom.fallback.classList.remove('hidden');
    dom.fallbackContent.textContent = file.content || '';
    return;
  }

  dom.fallback.classList.add('hidden');
  editor.open(file.path, file.content || '');
  editor.setPrefs(prefs);
}

function renderFileTree(container) {
  container.replaceChildren();
  const tree = new Map();

  for (const entry of workspace.files) {
    const parts = entry.path.split('/');
    let level = tree;
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const path = parts.slice(0, index + 1).join('/');
      const isLeaf = index === parts.length - 1;
      if (!level.has(name)) {
        level.set(name, {
          name, path,
          kind: isLeaf ? entry.kind : 'folder',
          entry: isLeaf ? entry : null,
          children: new Map()
        });
      }
      const node = level.get(name);
      if (isLeaf && entry.kind === 'folder') node.kind = 'folder';
      if (!isLeaf) level = node.children;
    }
  }

  const renderLevel = (map, depth, target) => {
    const sorted = [...map.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'fa');
    });

    for (const node of sorted) {
      const isFolder = node.kind === 'folder';
      const expanded = workspace.expandedFolders.has(node.path);
      const row = el('div', { class: 'tree-row' });
      const main = el('button', {
        type: 'button',
        class: 'tree-main',
        style: `padding-inline-start:${depth * 12}px`,
        'aria-label': isFolder ? `${expanded ? 'بستن' : 'باز کردن'} پوشهٔ ${node.path}` : `باز کردن ${node.path}`,
        onclick: async () => {
          if (isFolder) {
            if (expanded) workspace.expandedFolders.delete(node.path);
            else workspace.expandedFolders.add(node.path);
            renderFileTree(container);
          } else {
            await workspace.openFile(node.path);
            closeSheet();
          }
        }
      });
      main.append(el('span', { class: 'tree-caret', text: isFolder ? (expanded ? '▾' : '▸') : '·' }));
      main.append(el('span', { class: 'name', text: node.name }));
      row.append(main);

      if (!isFolder && node.entry) {
        row.append(el('button', {
          type: 'button',
          class: 'tree-action',
          'aria-label': `عملیات ${node.path}`,
          text: '⋯',
          onclick: () => openEntryActions(node.entry)
        }));
      }

      target.append(row);

      if (isFolder && expanded) {
        renderLevel(node.children, depth + 1, target);
      }
    }
  };

  const wrapper = el('div', { class: 'tree' });
  renderLevel(tree, 0, wrapper);
  container.append(wrapper);
}

function openSheet(title, content) {
  dom.sheetTitle.textContent = title;
  dom.sheetBody.replaceChildren(content);
  dom.sheet.classList.remove('hidden');
  dom.sheetBackdrop.classList.remove('hidden');
  dom.sheetClose.focus();
}

function closeSheet() {
  dom.sheet.classList.add('hidden');
  dom.sheetBackdrop.classList.add('hidden');
}

async function openEntryActions(entry) {
  const content = el('div', { class: 'sheet-stack' });
  content.append(el('div', { class: 'muted mono', text: entry.path }));

  content.append(el('button', {
    type: 'button', class: 'btn', text: 'تغییر نام',
    onclick: async () => {
      closeSheet();
      const next = await promptDialog('تغییر نام', { value: entry.path });
      if (!next) return;
      try {
        await workspace.renameEntry(entry.path, next);
        editor?.invalidate(entry.path);
        await openActiveInEditor();
        toast('تغییر نام انجام شد.');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));

  content.append(el('button', {
    type: 'button', class: 'btn', text: 'تکثیر',
    onclick: async () => {
      closeSheet();
      const next = await promptDialog('تکثیر', { value: `${entry.path}-copy` });
      if (!next) return;
      try {
        await workspace.duplicateEntry(entry.path, next);
        toast('تکثیر انجام شد.');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));

  content.append(el('button', {
    type: 'button', class: 'btn btn-danger', text: 'حذف',
    onclick: async () => {
      closeSheet();
      const ok = await confirmDialog('حذف', `«${entry.path}» حذف شود؟`, { confirmText: 'حذف', danger: true });
      if (!ok) return;
      try {
        await workspace.deleteEntry(entry.path);
        editor?.invalidate(entry.path);
        await openActiveInEditor();
        toast('حذف انجام شد.');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));

  openSheet('عملیات فایل', content);
}

function openFilesSheet() {
  const content = el('div', { class: 'sheet-stack' });

  const projectRow = el('div', { class: 'row-between' });
  const select = el('select', { class: 'select', 'aria-label': 'انتخاب پروژه' });
  for (const project of workspace.projects) {
    const option = el('option', { value: project.id, text: project.name });
    if (workspace.project?.id === project.id) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', async () => {
    try {
      await workspace.openProject(select.value);
      editor?.invalidateAll();
      await openActiveInEditor();
      closeSheet();
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  });
  projectRow.append(select);

  const projectMenu = el('button', {
    type: 'button', class: 'btn', text: '⋯',
    'aria-label': 'عملیات پروژه',
    onclick: () => openProjectActions()
  });
  projectRow.append(projectMenu);
  content.append(projectRow);

  const actions = el('div', { class: 'row' });
  actions.append(el('button', {
    type: 'button', class: 'btn btn-accent', text: '+ فایل',
    onclick: async () => {
      const path = await promptDialog('فایل جدید', { value: 'untitled.js' });
      if (!path) return;
      try {
        await workspace.createFile(path, '');
        closeSheet();
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));
  actions.append(el('button', {
    type: 'button', class: 'btn', text: '+ پوشه',
    onclick: async () => {
      const path = await promptDialog('پوشهٔ جدید', { value: 'assets' });
      if (!path) return;
      try {
        await workspace.createFolder(path);
        renderFileTree(content.querySelector('.tree') || el('div'));
        toast('پوشه ساخته شد.');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));
  actions.append(el('button', {
    type: 'button', class: 'btn', text: 'Import ZIP',
    onclick: () => zipInput?.click()
  }));
  actions.append(el('button', {
    type: 'button', class: 'btn', text: 'Export ZIP',
    onclick: async () => {
      try {
        const result = await exportProjectZip(workspace.project, workspace.files);
        toast(`ZIP ساخته شد: ${result.filename}`);
      } catch (error) {
        toast(`خطای ZIP: ${error.message}`, { type: 'error' });
      }
    }
  }));
  content.append(actions);

  const treeContainer = el('div');
  renderFileTree(treeContainer);
  content.append(treeContainer);

  openSheet('پروژه و فایل‌ها', content);
}

async function openProjectActions() {
  closeSheet();
  const content = el('div', { class: 'sheet-stack' });

  content.append(el('button', {
    type: 'button', class: 'btn', text: 'پروژهٔ جدید',
    onclick: async () => {
      closeSheet();
      const name = await promptDialog('پروژهٔ جدید', { value: 'New Project' });
      if (!name) return;
      try {
        await workspace.createProject(name);
        editor?.invalidateAll();
        await openActiveInEditor();
        toast('پروژه ساخته شد.');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));

  content.append(el('button', {
    type: 'button', class: 'btn', text: 'تغییر نام پروژه',
    onclick: async () => {
      closeSheet();
      const name = await promptDialog('تغییر نام پروژه', { value: workspace.project.name });
      if (!name) return;
      try {
        await workspace.renameProject(workspace.project.id, name);
        toast('نام پروژه تغییر کرد.');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));

  content.append(el('button', {
    type: 'button', class: 'btn', text: 'تکثیر پروژه',
    onclick: async () => {
      closeSheet();
      try {
        await workspace.duplicateProject(workspace.project.id);
        editor?.invalidateAll();
        await openActiveInEditor();
        toast('پروژه تکثیر شد.');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));

  content.append(el('button', {
    type: 'button', class: 'btn btn-danger', text: 'حذف پروژه',
    onclick: async () => {
      closeSheet();
      const ok = await confirmDialog('حذف پروژه', `پروژهٔ «${workspace.project.name}» و همهٔ فایل‌های آن حذف شود؟`, { confirmText: 'حذف', danger: true });
      if (!ok) return;
      try {
        await workspace.deleteProject(workspace.project.id);
        editor?.invalidateAll();
        await openActiveInEditor();
        toast('پروژه حذف شد.');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));

  openSheet('عملیات پروژه', content);
}

function openSearchSheet() {
  const content = el('div', { class: 'sheet-stack' });
  const queryInput = el('input', { class: 'select', type: 'search', placeholder: 'جستجو در پروژه', 'aria-label': 'عبارت جستجو' });
  const replacementInput = el('input', { class: 'select', type: 'text', placeholder: 'متن جایگزین', 'aria-label': 'متن جایگزین' });
  const caseLabel = el('label', { class: 'row muted' });
  const caseInput = el('input', { type: 'checkbox' });
  caseLabel.append(caseInput, el('span', { text: 'حساس به حروف' }));

  const resultHost = el('div');
  const status = el('div', { class: 'hint' });

  const runSearch = () => {
    const result = searchProject(workspace.files, queryInput.value, { caseSensitive: caseInput.checked });
    resultHost.replaceChildren();
    status.textContent = result.results.length
      ? `${result.results.length} نتیجه${result.truncated ? ' (نمایش محدود)' : ''}`
      : 'نتیجه‌ای پیدا نشد.';

    if (result.results.length) {
      const list = el('div', { class: 'result-list' });
      for (const item of result.results) {
        list.append(el('button', {
          type: 'button',
          class: 'result-item',
          onclick: async () => {
            await workspace.openFile(item.path);
            closeSheet();
            editor?.goToLine(item.line);
          }
        },
          el('span', { class: 'result-path', text: `${item.path}:${item.line}:${item.column}` }),
          el('span', { class: 'result-line', text: item.preview })
        ));
      }
      resultHost.append(list);
    }
  };

  const searchButton = el('button', {
    type: 'button', class: 'btn btn-accent', text: 'جستجو',
    onclick: runSearch
  });

  const replaceButton = el('button', {
    type: 'button', class: 'btn', text: 'جایگزینی همه',
    onclick: async () => {
      const ok = await confirmDialog(
        'جایگزینی همه',
        'همهٔ موارد منطبق در فایل‌های متنی پروژه جایگزین شوند؟',
        { confirmText: 'جایگزینی', danger: true }
      );
      if (!ok) return;
      try {
        const result = await replaceAll(db, workspace.project.id, workspace.files, queryInput.value, replacementInput.value, { caseSensitive: caseInput.checked });
        await workspace.refreshFiles();
        editor?.invalidateAll();
        await openActiveInEditor();
        runSearch();
        toast(`${result.count} مورد در ${result.filesChanged} فایل جایگزین شد.`);
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  });

  const row = el('div', { class: 'row' }, queryInput, searchButton);
  content.append(row, caseLabel, replacementInput, el('div', { class: 'row' }, replaceButton), status, resultHost);

  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runSearch();
  });

  openSheet('جستجو در پروژه', content);
  queryInput.focus();
}

function openConsoleSheet() {
  const content = el('div', { class: 'sheet-stack' });
  const list = el('div', { class: 'console-list' });

  if (!consoleEntries.length) {
    list.append(el('div', { class: 'hint', text: 'هنوز پیامی از پیش‌نمایش ثبت نشده است.' }));
  }

  for (const entry of consoleEntries.slice(-200)) {
    list.append(el('div', {
      class: 'console-item',
      dataset: { level: entry.level },
      text: `[${entry.level}] ${entry.args.join(' ')}`
    }));
  }

  content.append(el('div', { class: 'row-between' },
    el('span', { class: 'hint', text: `${consoleEntries.length} پیام` }),
    el('button', {
      type: 'button', class: 'btn', text: 'پاک کردن',
      onclick: () => {
        consoleEntries = [];
        openConsoleSheet();
      }
    })
  ));
  content.append(list);
  openSheet('کنسول', content);
}

async function openGitSheet() {
  const content = el('div', { class: 'sheet-stack' });
  const status = await getGitHubStatus();
  content.append(el('div', { class: 'hint', text: status.reason }));
  content.append(el('button', {
    type: 'button', class: 'btn', text: 'راهنمای محدودیت‌ها',
    onclick: async () => {
      await confirmDialog(
        'GitHub در این نسخه',
        'ورود OAuth گیت‌هاب از یک اپ استاتیک بدون relay ممکن نیست؛ نقاط پایانی توکن CORS ندارند و توکن نباید در فایل پروژه یا حافظهٔ عمومی ذخیره شود. در نسخه‌های بعدی یک relay محدود و قرارداد API تعریف می‌شود.',
        { confirmText: 'فهمیدم' }
      );
    }
  }));
  content.append(el('div', { class: 'separator' }));
  content.append(el('div', { class: 'hint', text: 'در این نسخه، ذخیره‌سازی محلی، ZIP و پشتیبان‌گیری JSON کاملاً فعال هستند.' }));
  openSheet('Git', content);
}

function openSettingsSheet() {
  const content = el('div', { class: 'sheet-stack' });

  const fontField = el('label', { class: 'field' },
    el('span', { text: 'اندازهٔ فونت ویرایشگر' }),
    el('input', { type: 'number', min: '10', max: '24', step: '1', value: prefs.fontSize })
  );
  const tabField = el('label', { class: 'field' },
    el('span', { text: 'اندازهٔ تب' }),
    el('select', { class: 'select' },
      ...[2, 4, 8].map((size) => {
        const option = el('option', { value: size, text: String(size) });
        if (prefs.tabSize === size) option.selected = true;
        return option;
      })
    )
  );
  const wrapLabel = el('label', { class: 'row muted' });
  const wrapInput = el('input', { type: 'checkbox' });
  wrapInput.checked = prefs.wordWrap;
  wrapLabel.append(wrapInput, el('span', { text: 'شکستن خطوط' }));

  const lineLabel = el('label', { class: 'row muted' });
  const lineInput = el('input', { type: 'checkbox' });
  lineInput.checked = prefs.lineNumbers;
  lineLabel.append(lineInput, el('span', { text: 'شماره‌های خط' }));

  const apply = async () => {
    prefs = {
      fontSize: Math.max(10, Math.min(24, Number(fontField.querySelector('input').value) || DEFAULT_PREFS.fontSize)),
      tabSize: Number(tabField.querySelector('select').value) || DEFAULT_PREFS.tabSize,
      wordWrap: wrapInput.checked,
      lineNumbers: lineInput.checked
    };
    document.documentElement.style.setProperty('--editor-font-size', `${prefs.fontSize}px`);
    editor?.setPrefs(prefs);
    try {
      await savePrefs(db, prefs);
    } catch (error) {
      toast(`ذخیرهٔ تنظیمات ناموفق: ${error.message}`, { type: 'error' });
    }
  };

  for (const control of [fontField, tabField, wrapLabel, lineLabel]) {
    control.addEventListener('change', apply);
  }

  content.append(fontField, tabField, wrapLabel, lineLabel);

  content.append(el('div', { class: 'separator' }));

  const storageInfo = el('div', { class: 'hint', text: 'در حال محاسبهٔ فضای ذخیره‌سازی…' });
  db.estimate().then(({ usage, quota }) => {
    storageInfo.textContent = usage != null
      ? `مصرف: ${formatBytes(usage)} از ${formatBytes(quota)}`
      : 'مرورگر اطلاعات فضای ذخیره‌سازی را ارائه نمی‌دهد.';
  }).catch(() => {
    storageInfo.textContent = 'خواندن فضای ذخیره‌سازی ناموفق بود.';
  });
  content.append(storageInfo);

  content.append(el('button', {
    type: 'button', class: 'btn', text: 'درخواست ذخیره‌سازی پایدار',
    onclick: async () => {
      try {
        if (!navigator.storage?.persist) throw new Error('این مرورگر از ذخیره‌سازی پایدار پشتیبانی نمی‌کند.');
        const granted = await navigator.storage.persist();
        toast(granted ? 'ذخیره‌سازی پایدار تأیید شد.' : 'مرورگر ذخیره‌سازی پایدار را تأیید نکرد.', { type: granted ? 'info' : 'warn' });
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }
  }));

  content.append(el('button', {
    type: 'button', class: 'btn', text: 'پشتیبان کامل JSON',
    onclick: async () => {
      try {
        const result = await exportBackup(db);
        toast(`پشتیبان ساخته شد: ${result.filename} (${result.projects} پروژه)`);
      } catch (error) {
        toast(`خطای پشتیبان: ${error.message}`, { type: 'error' });
      }
    }
  }));

  content.append(el('button', {
    type: 'button', class: 'btn', text: 'ساخت Snapshot از پروژه',
    onclick: async () => {
      try {
        await workspace.snapshot('manual');
        toast('نسخهٔ پشتیبان محلی ساخته شد.');
      } catch (error) {
        toast(`خطای Snapshot: ${error.message}`, { type: 'error' });
      }
    }
  }));

  content.append(el('div', { class: 'separator' }));
  content.append(el('div', { class: 'hint', text: 'نصب PWA در iPhone: Safari → Share → Add to Home Screen. برخی قابلیت‌ها به HTTPS و پشتیبانی مرورگر وابسته‌اند.' }));
  content.append(el('div', { class: 'hint', text: `نسخه: 1.0.0-milestone1` }));

  openSheet('تنظیمات', content);
}

async function openPreview() {
  if (!workspace.project) return;
  dom.previewView.classList.remove('hidden');
  if (!preview) {
    preview = new Preview({
      host: dom.previewHost,
      onLog: (entry) => {
        consoleEntries.push(entry);
        if (consoleEntries.length > 500) consoleEntries = consoleEntries.slice(-500);
      },
      onError: (error) => {
        consoleEntries.push({ level: 'error', args: [error.message || String(error)] });
        toast(`خطای پیش‌نمایش: ${error.message}`, { type: 'error' });
      }
    });
  }
  try {
    await preview.run(workspace.project, workspace.files);
    toast('پیش‌نمایش اجرا شد. برای دیدن پیام‌ها کنسول را باز کنید.');
  } catch (error) {
    toast(`اجرای پیش‌نمایش ناموفق: ${error.message}`, { type: 'error' });
  }
}

function setupToolbar() {
  dom.toolbar.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-cmd]');
    if (!button) return;
    if (!editor) {
      toast('ویرایشگر آماده نیست. ابتدا vendor را بسازید.', { type: 'error' });
      return;
    }
    const command = button.dataset.cmd;
    if (command === 'save') {
      try {
        await workspace.saveAll();
        toast('همهٔ تغییرات ذخیره شد.');
      } catch (error) {
        toast(`ذخیره ناموفق: ${error.message}`, { type: 'error' });
      }
      return;
    }
    if (command === 'pair') {
      editor.pair(button.dataset.open || '', button.dataset.close || '');
      return;
    }
    if (command === 'semicolon') {
      editor.semicolon();
      return;
    }
    if (command === 'indent') editor.indent();
    else if (command === 'outdent') editor.outdent();
    else if (command === 'undo') editor.undo();
    else if (command === 'redo') editor.redo();
    else if (command === 'left' || command === 'right' || command === 'up' || command === 'down') editor.move(command);
    else if (command === 'search') editor.search();
  });
}

function setupNav() {
  dom.bottomNav.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-route]');
    if (!button) return;
    router.navigate(button.dataset.route);
  });
}

function setActiveNav(route) {
  for (const button of dom.bottomNav.querySelectorAll('button[data-route]')) {
    button.classList.toggle('is-active', button.dataset.route === route);
  }
}

function setupViewport() {
  const sync = () => {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    const keyboardOpen = Boolean(viewport && window.innerHeight - viewport.height > 120);
    document.body.classList.toggle('keyboard-open', keyboardOpen);
  };
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  sync();
}

function setupZipInput() {
  zipInput = el('input', {
    type: 'file',
    accept: '.zip,application/zip',
    style: 'display:none'
  });
  document.body.append(zipInput);
  zipInput.addEventListener('change', async () => {
    const file = zipInput.files?.[0];
    zipInput.value = '';
    if (!file) return;
    try {
      const entries = await readZip(file);
      const suggested = file.name.replace(/\.zip$/i, '') || 'Imported Project';
      const name = await promptDialog('Import ZIP', { value: suggested });
      if (!name) return;
      await workspace.importProject(name, entries);
      editor?.invalidateAll();
      await openActiveInEditor();
      toast('پروژه از ZIP وارد شد.');
    } catch (error) {
      toast(`خطای Import: ${error.message}`, { type: 'error' });
    }
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          toast('نسخهٔ جدید FORGE آماده است.', {
            duration: 12000,
            action: {
              label: 'به‌روزرسانی',
              onClick: () => {
                worker.postMessage({ type: 'SKIP_WAITING' });
                navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
              }
            }
          });
        }
      });
    });
  } catch (error) {
    console.warn('[FORGE] service worker registration failed', error);
    toast('ثبت Service Worker ناموفق بود؛ برنامه ممکن است آفلاین کار نکند.', { type: 'warn' });
  }
}

async function boot() {
  setupViewport();
  setupZipInput();
  setupToolbar();
  setupNav();

  try {
    prefs = await loadPrefs(db);
  } catch (error) {
    toast('خواندن تنظیمات ناموفق بود؛ مقادیر پیش‌فرض استفاده می‌شود.', { type: 'warn' });
  }
  document.documentElement.style.setProperty('--editor-font-size', `${prefs.fontSize}px`);

  try {
    await workspace.init();
  } catch (error) {
    toast(`راه‌اندازی پروژه ناموفق: ${error.message}`, { type: 'error', duration: 12000 });
    return;
  }

  workspace.on('tabs-changed', renderTabs);
  workspace.on('dirty-changed', renderTabs);
  workspace.on('active-changed', () => { openActiveInEditor().catch(() => {}); renderTabs(); });
  workspace.on('status-changed', setSaveState);
  workspace.on('storage-error', (error) => toast(`خطای ذخیره‌سازی: ${error.message}`, { type: 'error' }));
  workspace.on('binary-selected', (file) => {
    toast(`«${file.path}» دودویی است و در ویرایشگر متنی باز نمی‌شود.`, { type: 'warn' });
  });

  try {
    editor = await createEditor({
      parent: dom.editor,
      prefs,
      onChange: (path, content) => workspace.noteEdit(path, content),
      onFocusChange: () => {}
    });
  } catch (error) {
    editorError = error;
    dom.fallback.classList.remove('hidden');
    dom.fallbackContent.textContent = 'برای فعال‌سازی ویرایشگر، vendor را بسازید.';
    toast(error.message, { type: 'error', duration: 12000 });
  }

  renderTabs();
  setSaveState();
  await openActiveInEditor();

  router = initRouter((route) => {
    setActiveNav(route);
    if (route === 'files') openFilesSheet();
    else if (route === 'search') openSearchSheet();
    else if (route === 'preview') openPreview();
    else if (route === 'console') openConsoleSheet();
    else if (route === 'git') openGitSheet();
    else if (route === 'settings') openSettingsSheet();
  });

  dom.sheetClose.addEventListener('click', closeSheet);
  dom.sheetBackdrop.addEventListener('click', closeSheet);
  dom.previewClose.addEventListener('click', () => {
    dom.previewView.classList.add('hidden');
    preview?.destroy();
    preview = null;
    router.navigate('files');
  });
  dom.previewRefresh.addEventListener('click', openPreview);
  dom.previewSize.addEventListener('change', () => {
    dom.previewHost.dataset.size = dom.previewSize.value;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
  });

  window.addEventListener('beforeunload', (event) => {
    if (workspace.dirty.size) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      workspace.flushPendingSaves().catch(() => {});
    }
  });

  await registerServiceWorker();
}

boot().catch((error) => {
  console.error('[FORGE] fatal', error);
  toast(`خطای راه‌اندازی: ${error.message}`, { type: 'error', duration: 15000 });
});
 
 
