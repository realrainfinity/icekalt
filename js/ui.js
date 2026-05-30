// Kleine UI-Helfer (DOM-Erzeugung, Modal, Toast) – ohne Framework.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

// Bottom-Sheet-Modal. content(close) erhält die close-Funktion.
export function openModal(title, contentFn) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const modal = el('div', { class: 'modal' });
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  modal.append(el('h2', { text: title }));
  modal.append(contentFn(close));
  backdrop.append(modal);
  document.body.append(backdrop);
  return close;
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    openModal('Bestätigen', (close) =>
      el('div', {}, [
        el('p', { class: 'muted', text: message }),
        el('div', { class: 'btn-row' }, [
          el('button', { class: 'btn block', onClick: () => { close(); resolve(false); }, text: 'Abbrechen' }),
          el('button', { class: 'btn primary block', onClick: () => { close(); resolve(true); }, text: 'OK' }),
        ]),
      ])
    );
  });
}
