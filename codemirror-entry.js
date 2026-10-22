export { basicSetup } from 'codemirror';
export { EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor,
  highlightActiveLine } from '@codemirror/view';
export { EditorState, Compartment, EditorSelection } from '@codemirror/state';
export { defaultKeymap, history, historyKeymap, indentWithTab,
  undo, redo, indentMore, indentLess,
  cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown } from '@codemirror/commands';
export { searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search';
export { bracketMatching, indentOnInput, syntaxHighlighting,
  defaultHighlightStyle, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
export { closeBrackets, closeBracketsKeymap, autocompletion,
  completionKeymap } from '@codemirror/autocomplete';
export { html } from '@codemirror/lang-html';
export { css } from '@codemirror/lang-css';
export { javascript } from '@codemirror/lang-javascript';
