export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function toast(message, { type = 'info', duration = 4200, action = null } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = el('div', { class: 'toast', dataset: { type }, role: type === 'error' ? 'alert' : 'status' });
  node.append(el('span', { text: String(message) }));
  if (action && typeof action.onClick === 'function') {
    node.append(el('button', {
      type: 'button',
      text: action.label || 'انجام',
      onclick: () => {
        try { action.onClick(); } finally { node.remove(); }
      }
    }));
  }
  root.append(node);
  setTimeout(() => node.remove(), duration);
}

function modal({ title, message, input = null, actions = [] }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const backdrop = el('div', { class: 'modal-backdrop' });
    const dialog = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
    dialog.append(el('h3', { text: title }));
    if (message) dialog.append(el('p', { text: message }));

    let inputNode = null;
    if (input) {
      inputNode = el('input', {
        type: input.type || 'text',
        value: input.value || '',
        placeholder: input.placeholder || '',
        autocomplete: 'off',
        spellcheck: 'false'
      });
      dialog.append(inputNode);
    }

    const actionRow = el('div', { class: 'modal-actions' });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      resolve(value);
    };

    for (const action of actions) {
      actionRow.append(el('button', {
        type: 'button',
        text: action.label,
        dataset: {
          primary: action.primary ? 'true' : 'false',
          danger: action.danger ? 'true' : 'false'
        },
        onclick: () => finish(action.value(inputNode))
      }));
    }

    dialog.append(actionRow);
    backdrop.append(dialog);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) finish(null);
    });
    root.append(backdrop);
    inputNode?.focus();
    inputNode?.select();
  });
}

export function confirmDialog(title, message, { confirmText = 'تأیید', danger = false } = {}) {
  return modal({
    title,
    message,
    actions: [
      { label: 'لغو', value: () => false },
      { label: confirmText, primary: !danger, danger, value: () => true }
    ]
  }).then((value) => value === true);
}

export function promptDialog(title, { message = '', label = '', value = '', placeholder = '' } = {}) {
  return modal({
    title,
    message,
    input: { label, value, placeholder },
    actions: [
      { label: 'لغو', value: () => null },
      { label: 'تأیید', primary: true, value: (input) => input?.value?.trim() || null }
    ]
  });
}

export function choiceDialog(title, message, choices) {
  return modal({
    title,
    message,
    actions: choices.map((choice) => ({
      label: choice.label,
      primary: choice.primary,
      danger: choice.danger,
      value: () => choice.value
    }))
  });
}
 
 
