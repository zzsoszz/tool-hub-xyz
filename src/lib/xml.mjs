const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026', bull: '\u2022', middot: '\u00b7',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  trade: '\u2122', copy: '\u00a9', reg: '\u00ae', deg: '\u00b0', times: '\u00d7', sup2: '\u00b2',
};

export function decodeEntities(value) {
  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

export function parseXml(xml) {
  const source = String(xml)
    .replace(/\r\n?/g, '\n')
    .replace(/<\?xml[\s\S]*?\?>/, '')
    .replace(/<!DOCTYPE[\s\S]*?>/i, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  let pos = 0;

  const readTag = () => {
    let cursor = pos + 1;
    const nameMatch = /^([A-Za-z_:][A-Za-z0-9_.:-]*)/.exec(source.slice(cursor, cursor + 200));
    if (!nameMatch) return null;
    const name = nameMatch[1];
    cursor += name.length;
    const attrs = {};
    while (cursor < source.length) {
      while (/\s/.test(source[cursor])) cursor += 1;
      if (source[cursor] === '/' && source[cursor + 1] === '>') {
        pos = cursor + 2;
        return { name, attrs, selfClosing: true };
      }
      if (source[cursor] === '>') {
        pos = cursor + 1;
        return { name, attrs, selfClosing: false };
      }
      const attrMatch = /^([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(source.slice(cursor, cursor + 4000));
      if (!attrMatch) {
        cursor += 1;
        continue;
      }
      attrs[attrMatch[1]] = decodeEntities(attrMatch[2] ?? attrMatch[3] ?? '');
      cursor += attrMatch[0].length;
    }
    return null;
  };

  const parseElement = (name, attrs) => {
    const node = { name, attrs, children: [], text: '' };
    while (pos < source.length) {
      const next = source.indexOf('<', pos);
      if (next === -1) {
        node.text += decodeEntities(source.slice(pos));
        pos = source.length;
        break;
      }
      if (next > pos) node.text += decodeEntities(source.slice(pos, next));
      pos = next;
      if (source.startsWith('</', pos)) {
        const end = source.indexOf('>', pos);
        pos = end === -1 ? source.length : end + 1;
        return node;
      }
      if (source.startsWith('<![CDATA[', pos)) {
        const end = source.indexOf(']]>', pos);
        node.text += end === -1 ? source.slice(pos + 9) : source.slice(pos + 9, end);
        pos = end === -1 ? source.length : end + 3;
        continue;
      }
      const tag = readTag();
      if (!tag) {
        pos += 1;
        continue;
      }
      if (tag.selfClosing) {
        node.children.push({ name: tag.name, attrs: tag.attrs, children: [], text: '' });
        continue;
      }
      node.children.push(parseElement(tag.name, tag.attrs));
    }
    return node;
  };

  while (pos < source.length && source[pos] !== '<') pos += 1;
  const rootTag = readTag();
  if (!rootTag) return null;
  if (rootTag.selfClosing) return { name: rootTag.name, attrs: rootTag.attrs, children: [], text: '' };
  return parseElement(rootTag.name, rootTag.attrs);
}

export function allChildren(node, name) {
  if (!node) return [];
  return node.children.filter((child) => child.name === name);
}

export function firstChild(node, names) {
  for (const name of names) {
    const found = allChildren(node, name)[0];
    if (found) return found;
  }
  return null;
}

export function childText(node, names) {
  const found = firstChild(node, names);
  return found ? flattenText(found) : '';
}

export function flattenText(node) {
  if (!node) return '';
  const own = node.text ?? '';
  return node.children.length ? `${own}${node.children.map(flattenText).join(' ')}` : own;
}

export function attr(node, name) {
  return node?.attrs?.[name] ?? '';
}
