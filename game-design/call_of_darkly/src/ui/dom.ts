/** Tiny DOM helpers. */

export type Kid = Node | string | null | false | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', kids: Kid[] | string = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (typeof kids === 'string') el.textContent = kids;
  else for (const k of kids) if (k) el.append(k);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Write textContent only when it changed (keeps idle frames free of DOM writes). */
export function setText(el: Node, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function toggle(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function show(el: HTMLElement, on: boolean): void {
  const v = on ? '' : 'none';
  if (el.style.display !== v) el.style.display = v;
}

/** `<span class="kc">E</span>` keycap. `hint` keycaps fade with the key-hint setting. */
export function kc(label: string, hint = false): HTMLSpanElement {
  return h('span', hint ? 'kc hint' : 'kc', label);
}
