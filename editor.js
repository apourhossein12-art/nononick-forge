let CM = null;

async function loadCM() {
  if (CM) return CM;
  try {
    CM = await import('./codemirror.js');
  } catch (error) {
    throw new Error(
      'بستهٔ CodeMirror در vendor/codemirror.js پیدا نشد. ' +
      'یک‌بار npm run build:vendor را اجرا کنید.',
      { cause: error }
    );
  }
  return CM;
}

function languageFor(CM, path) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (['html', 'htm', 'vue', 'svelte'].includes(ext)) return CM.html();
  if (ext === 'css') return CM.css();
  if (['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json'].includes(ext)) {
    return CM.javascript({ jsx: ext === 'jsx', typescript: ['ts','tsx'].includes(ext) });
  }
  return [];
}

export async function createEditor({ parent, prefs, onChange, onFocusChange }) {
  const cm = await loadCM();
  const {
    EditorView, EditorState, Compartment, EditorSelection,
    keymap, lineNumbers, highlightActiveLineGutter, drawSelection,
    dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine,
    defaultKeymap, history, historyKeymap, indentWithTab,
    undo, redo, indentMore, indentLess,
    cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown,
    searchKeymap, highlightSelectionMatches, openSearchPanel,
    bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle,
    foldGutter, foldKeymap, indentUnit,
    closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap
  } = cm;

  const tabSizeCompartment = new Compartment();
  const lineWrapCompartment = new Compartment();
  const lineNumbersCompartment = new Compartment();
  const fontSizeCompartment = new Compartment();

  const states = new Map();
  let activePath = null;
  let switching = false;

  const theme = EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: '#050609',
      color: '#e6edf7',
      direction: 'ltr'
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      caretColor: '#62d9ff'
    },
    '.cm-gutters': {
      backgroundColor: '#090c12',
      color: '#57657a',
      border: 'none'
    }
  }, { dark: true });

  const extensionsFor = (path) => [
    lineNumbersCompartment.of(prefs.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    highlightActiveLine(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab
    ]),
    languageFor(cm, path),
    tabSizeCompartment.of(EditorState.tabSize.of(prefs.tabSize)),
    indentUnit.of(' '.repeat(prefs.tabSize)),
    lineWrapCompartment.of(prefs.wordWrap ? EditorView.lineWrapping : []),
    fontSizeCompartment.of(EditorView.theme({
      '.cm-content, .cm-gutters': { fontSize: `${prefs.fontSize}px` }
    })),
    theme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !switching && activePath) {
        onChange(activePath, update.state.doc.toString());
      }
      if (update.focusChanged && onFocusChange) {
        onFocusChange(update.view.hasFocus);
      }
    })
  ];

  const makeState = (path, content) => EditorState.create({
    doc: content,
    extensions: extensionsFor(path)
  });

  const view = new EditorView({
    state: makeState('__empty__.txt', ''),
    parent
  });

  function open(path, content) {
    if (!states.has(path)) {
      states.set(path, makeState(path, content));
    }
    if (activePath === path && view.state === states.get(path)) {
      view.focus();
      return;
    }
    if (activePath && view.state) {
      states.set(activePath, view.state);
    }
    switching = true;
    activePath = path;
    view.setState(states.get(path));
    switching = false;
    view.focus();
  }

  function invalidate(path) {
    if (activePath === path) return;
    states.delete(path);
  }

  function invalidateAll() {
    for (const key of [...states.keys()]) {
      if (key !== activePath) states.delete(key);
    }
  }

  function pair(openText, closeText) {
    const selection = view.state.selection.main;
    const selected = view.state.sliceDoc(selection.from, selection.to);
    const insertion = openText + selected + closeText;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: insertion },
      selection: {
        anchor: selection.from + openText.length,
        head: selection.from + openText.length + selected.length
      },
      scrollIntoView: true
    });
    view.focus();
  }

  function insertText(text) {
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      selection: { anchor: selection.from + text.length },
      scrollIntoView: true
    });
    view.focus();
  }

  function move(command) {
    if (command === 'left') cursorCharLeft(view);
    else if (command === 'right') cursorCharRight(view);
    else if (command === 'up') cursorLineUp(view);
    else if (command === 'down') cursorLineDown(view);
    view.focus();
  }

  function goToLine(lineNumber) {
    const doc = view.state.doc;
    const line = doc.line(Math.max(1, Math.min(lineNumber, doc.lines)));
    view.dispatch({
      selection: EditorSelection.cursor(line.from),
      scrollIntoView: true
    });
    view.focus();
  }

  function setPrefs(next) {
    prefs = next;
    const effects = [
      tabSizeCompartment.reconfigure(EditorState.tabSize.of(next.tabSize)),
      lineWrapCompartment.reconfigure(next.wordWrap ? EditorView.lineWrapping : []),
      lineNumbersCompartment.reconfigure(next.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
      fontSizeCompartment.reconfigure(EditorView.theme({
        '.cm-content, .cm-gutters': { fontSize: `${next.fontSize}px` }
      }))
    ];
    const current = view.state;
    view.setState(current.update({ effects }).state);
    if (activePath) states.set(activePath, view.state);
  }

  return {
    view,
    open,
    invalidate,
    invalidateAll,
    get activePath() { return activePath; },
    getValue: () => view.state.doc.toString(),
    focus: () => view.focus(),
    pair,
    insertText,
    move,
    indent: () => { indentMore(view); view.focus(); },
    outdent: () => { indentLess(view); view.focus(); },
    semicolon: () => insertText(';'),
    undo: () => { undo(view); view.focus(); },
    redo: () => { redo(view); view.focus(); },
    search: () => { openSearchPanel(view); view.focus(); },
    goToLine,
    setPrefs,
    destroy: () => view.destroy()
  };
}
 
 
