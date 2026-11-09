import path from 'node:path';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as listview from '../../src/lib/listview.mjs';

// 浏览器脚本跑在浏览器里，这里用最小 DOM 夹具把它真正执行一遍：
// 只实现脚本用到的选择器、dataset、hidden、append/after，够跑通这条路径就行。
class Node {
  constructor(tag, attrs = {}) {
    this.tagName = tag;
    this.attrs = { ...attrs };
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.hidden = false;
    this.textContent = attrs.text ?? '';
    this.className = attrs.class ?? '';
    this.listeners = {};
    this.value = attrs.value ?? '';
    if (attrs.dataset) Object.assign(this.dataset, attrs.dataset);
  }

  matches(selector) {
    const parts = selector.trim().split(/\s+/);
    return this.matchesLast(parts[parts.length - 1]) && this.hasAncestorChain(parts);
  }

  matchesLast(part) {
    const fragments = part.match(/\[[^\]]*\]|\.[^.\[]+|[^.\[]+/g) ?? [];
    const head = fragments[0] ?? '';
    if (!head.startsWith('.') && !head.startsWith('[')) {
      if (head.toLowerCase() !== this.tagName.toLowerCase()) return false;
      fragments.shift();
    }
    for (const fragment of fragments) {
      if (fragment.startsWith('.')) {
        if (!this.className.split(/\s+/).includes(fragment.slice(1))) return false;
      } else if (fragment.startsWith('[')) {
        const name = fragment.slice(1, -1);
        const [key, wanted] = name.split('=');
        const actual = key.startsWith('data-')
          ? this.dataset[key.slice(5).replace(/-([a-z])/g, (_match, char) => char.toUpperCase())]
          : this.attrs[key];
        if (wanted === undefined) {
          if (actual === undefined) return false;
        } else if (actual !== wanted.replaceAll('"', '')) return false;
      }
    }
    return true;
  }

  hasAncestorChain(parts) {
    let node = this;
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (!node.matchesLast(parts[index])) return false;
      node = node.parent;
      if (index > 0 && !node) return false;
    }
    return true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (child.matches(selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }

  append(node) {
    node.parent?.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = this;
    this.children.push(node);
  }

  after(node) {
    const siblings = this.parent.children;
    node.parent = this.parent;
    siblings.splice(siblings.indexOf(this) + 1, 0, node);
  }

  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }

  emit(type, event = {}) {
    for (const handler of this.listeners[type] ?? []) handler(event);
  }
}

function select(name, options, selected) {
  const field = new Node('select', { name });
  field.attrs[name] = 'x';
  field.options = options.map((value) => ({ value }));
  field.dataset[name === 'month' ? 'filterMonth' : name === 'year' ? 'filterYear' : 'sortMode'] = '';
  field.value = selected;
  return field;
}

function buildPage(rows, { month = '', year = '', sort = 'quality' } = {}) {
  const body = new Node('body');
  const main = new Node('main', { tag: 'main' });
  const form = new Node('form', { class: 'filters' });
  const monthField = select('month', ['', '2026-11', '2026-10', '2025-12'], month);
  const yearField = select('year', ['', '2026', '2025'], year);
  const sortField = select('sort', ['quality', 'newest', 'score'], sort);
  sortField.dataset.sortMode = '';
  const count = new Node('span');
  count.dataset.filterCount = '';
  const hint = new Node('span');
  hint.dataset.sortHint = '';
  const note = new Node('p', { class: 'filter-note' });
  note.children.push(count, hint);
  note.parent = form;
  form.children.push(monthField, yearField, sortField, note);
  const list = new Node('ol', { class: 'stories' });
  for (const row of rows) {
    const li = new Node('li', { class: 'story' });
    li.dataset = { slug: row.slug, ...row };
    li.parent = list;
    list.children.push(li);
  }
  list.parent = main;
  form.parent = main;
  main.children.push(form, list);
  main.tagName = 'main';
  body.children.push(main);
  body.parent = null;
  const root = new Node('root');
  root.children.push(body);
  return { body, form, list, monthField, yearField, sortField, count, hint };
}

async function runListScript(document, search) {
  const source = await readFile(path.resolve(import.meta.dirname, '../../public/list.js'), 'utf8');
  const stripped = source.replace(/^import \{([^}]+)\} from '\/listview\.mjs';/m, 'const {$1} = listview;');
  const documentNode = document;
  const context = {
    document: { querySelector: (selector) => documentNode.querySelector(selector), createElement: (tag) => new Node(tag) },
    window: {
      location: { pathname: '/s/hardware', search },
      history: { replaceState: (_state, _title, url) => { context.window.location.search = new URL(url, 'https://tool-hub.xyz').search; } },
    },
    URLSearchParams,
    URL,
    listview,
  };
  await vm.runInNewContext(`(async () => {\n${stripped}\n})()`, context);
  return context;
}

export { Node, buildPage, runListScript };
