// ============================================================
// 仮想ブラウザ: HTMLパーサ・DOM・セレクタ・可視判定・シリアライズ
// ゲーム内の架空ページを表現するためのもの。実ブラウザのDOMや innerHTML は使わない。
// ノード: { t:'el', tag, attrs:{}, children:[], parent, uid } /
//         { t:'text', text, parent, uid } / { t:'comment', text, parent, uid }
// ============================================================

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const MAX_NODES = 3000;
let uidSeq = 1;

export const nextUid = () => uidSeq++;

function mk(t, props) { return Object.assign({ t, parent: null, uid: nextUid() }, props); }

export function parseHtml(src) {
  const root = mk('el', { tag: '#document', attrs: {}, children: [] });
  const stack = [root];
  let i = 0, count = 0;
  const top = () => stack[stack.length - 1];
  const add = (n) => { if (++count > MAX_NODES) throw new Error('HTMLが大きすぎます'); n.parent = top(); top().children.push(n); return n; };
  const pushText = (s) => { if (s) add(mk('text', { text: decodeEntities(s) })); };
  while (i < src.length) {
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      const e = end < 0 ? src.length : end;
      add(mk('comment', { text: src.slice(i + 4, e) }));
      i = end < 0 ? src.length : end + 3; continue;
    }
    if (src.startsWith('<!', i)) { const end = src.indexOf('>', i); i = end < 0 ? src.length : end + 1; continue; }
    if (src.startsWith('</', i)) {
      const end = src.indexOf('>', i);
      const name = src.slice(i + 2, end < 0 ? src.length : end).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
      i = end < 0 ? src.length : end + 1; continue;
    }
    if (src[i] === '<' && /[A-Za-z]/.test(src[i + 1] || '')) {
      let j = i + 1;
      while (j < src.length && /[^\s/>]/.test(src[j])) j++;
      const tag = src.slice(i + 1, j).toLowerCase();
      const attrs = {};
      let selfClose = false;
      for (;;) {
        while (j < src.length && /\s/.test(src[j])) j++;
        if (j >= src.length) break;
        if (src[j] === '>') { j++; break; }
        if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
        if (src[j] === '/') { j++; continue; }
        let k = j;
        while (k < src.length && /[^\s=/>]/.test(src[k])) k++;
        const name = src.slice(j, k).toLowerCase();
        j = k;
        while (j < src.length && /\s/.test(src[j])) j++;
        let val = '';
        if (src[j] === '=') {
          j++;
          while (j < src.length && /\s/.test(src[j])) j++;
          if (src[j] === '"' || src[j] === "'") { const q = src[j]; const e = src.indexOf(q, j + 1); val = src.slice(j + 1, e < 0 ? src.length : e); j = e < 0 ? src.length : e + 1; }
          else { let e = j; while (e < src.length && /[^\s>]/.test(src[e])) e++; val = src.slice(j, e); j = e; }
        }
        if (name) attrs[name] = decodeEntities(val);
      }
      const el = add(mk('el', { tag, attrs, children: [] }));
      i = j;
      if (VOID.has(tag) || selfClose) continue;
      if (RAW.has(tag)) {
        const close = src.toLowerCase().indexOf('</' + tag, i);
        const e = close < 0 ? src.length : close;
        if (e > i) { const tn = mk('text', { text: src.slice(i, e), raw: true }); tn.parent = el; el.children.push(tn); count++; }
        const gt = src.indexOf('>', e);
        i = close < 0 ? src.length : (gt < 0 ? src.length : gt + 1);
        continue;
      }
      stack.push(el);
      continue;
    }
    const next = src.indexOf('<', i + 1);
    const e = next < 0 ? src.length : next;
    pushText(src.slice(i, e));
    i = e;
  }
  return root;
}

const ENT = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&copy;': '©', '&yen;': '¥' };
export function decodeEntities(s) { return s.replace(/&(?:lt|gt|amp|quot|#39|nbsp|copy|yen);/g, m => ENT[m]); }
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// ---------- シリアライズ ----------
export function openTag(n) {
  const a = Object.entries(n.attrs).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escAttr(v)}"`)).join('');
  return `<${n.tag}${a}>`;
}
export function outerHTML(n) {
  if (n.t === 'text') return n.raw ? n.text : escText(n.text);
  if (n.t === 'comment') return `<!--${n.text}-->`;
  if (VOID.has(n.tag)) return openTag(n);
  return openTag(n) + n.children.map(outerHTML).join('') + `</${n.tag}>`;
}
export const innerHTML = (n) => n.children.map(outerHTML).join('');

// ---------- テキスト ----------
export function textContent(n) {
  if (n.t === 'text') return n.text;
  if (n.t === 'comment') return '';
  return n.children.map(textContent).join('');
}
const BLOCK = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'form', 'section', 'article', 'header', 'footer', 'nav', 'main', 'table', 'tr', 'br', 'pre', 'label']);
export function innerText(n) {
  const parts = [];
  const walk = (x) => {
    if (x.t === 'text') { const t = x.text.replace(/\s+/g, ' ').trim(); if (t && !(x.parent && ['script', 'style'].includes(x.parent.tag))) parts.push(t); return; }
    if (x.t !== 'el' || isHidden(x) || ['script', 'style', 'head'].includes(x.tag)) return;
    const blk = BLOCK.has(x.tag);
    if (blk) parts.push('\n');
    x.children.forEach(walk);
    if (blk) parts.push('\n');
  };
  walk(n);
  return parts.join(' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

// ---------- 可視判定 ----------
export function styleOf(n) {
  const out = {};
  for (const decl of (n.attrs && n.attrs.style ? n.attrs.style : '').split(';')) {
    const i = decl.indexOf(':'); if (i < 0) continue;
    out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim().toLowerCase();
  }
  return out;
}
export function selfHidden(n) {
  if (n.t !== 'el') return false;
  if (n.attrs.hidden !== undefined) return true;
  if (n.tag === 'input' && (n.attrs.type || '').toLowerCase() === 'hidden') return true;
  const s = styleOf(n);
  if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return true;
  if (/^-\d{3,}/.test(s.left || '') || /^-\d{3,}/.test(s['margin-left'] || '') || /^-\d{3,}/.test(s['text-indent'] || '')) return true; // 画面外へ追い出す手口
  if ((s.width === '0' || s.width === '0px') && (s.height === '0' || s.height === '0px')) return true;
  return false;
}
export function isHidden(n) { for (let x = n; x && x.t === 'el'; x = x.parent) if (selfHidden(x)) return true; return false; }

// ---------- セレクタ ----------
function parseCompound(s) {
  const c = { tag: null, id: null, classes: [], attrs: [] };
  const re = /^(\*|[A-Za-z][A-Za-z0-9-]*)|#([A-Za-z0-9_-]+)|\.([A-Za-z0-9_-]+)|\[\s*([A-Za-z_:][\w:-]*)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*\]/y;
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m || m[0] === '') throw new Error(`SyntaxError: '${s}' is not a valid selector`);
    if (m[1]) c.tag = m[1].toLowerCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.classes.push(m[3]);
    else if (m[4]) c.attrs.push({ name: m[4].toLowerCase(), op: m[5] || null, val: m[6] ?? m[7] ?? m[8] ?? '' });
    pos = re.lastIndex;
  }
  return c;
}
function parseSelector(sel) {
  return sel.split(',').map(part => {
    const toks = part.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
    const chain = []; let comb = ' ';
    for (const t of toks) { if (t === '>') { comb = '>'; continue; } chain.push({ comb, c: parseCompound(t) }); comb = ' '; }
    if (!chain.length) throw new Error(`SyntaxError: '${sel}' is not a valid selector`);
    return chain;
  });
}
function matchCompound(n, c) {
  if (n.t !== 'el') return false;
  if (c.tag && c.tag !== '*' && c.tag !== n.tag) return false;
  if (c.id && n.attrs.id !== c.id) return false;
  if (c.classes.length) { const cl = (n.attrs.class || '').split(/\s+/); if (!c.classes.every(x => cl.includes(x))) return false; }
  for (const a of c.attrs) {
    const v = n.attrs[a.name];
    if (v === undefined) return false;
    if (!a.op) continue;
    if (a.op === '=' && v !== a.val) return false;
    if (a.op === '^=' && !v.startsWith(a.val)) return false;
    if (a.op === '$=' && !v.endsWith(a.val)) return false;
    if (a.op === '*=' && !v.includes(a.val)) return false;
    if (a.op === '~=' && !v.split(/\s+/).includes(a.val)) return false;
  }
  return true;
}
function matchChain(n, chain, idx) {
  const link = chain[idx];
  if (!matchCompound(n, link.c)) return false;
  if (idx === 0) return true;
  if (link.comb === '>') return !!n.parent && matchChain(n.parent, chain, idx - 1);
  for (let p = n.parent; p; p = p.parent) if (matchChain(p, chain, idx - 1)) return true;
  return false;
}
export function matches(n, sel) { return parseSelector(sel).some(ch => matchChain(n, ch, ch.length - 1)); }
export function descendants(root) {
  const out = [];
  const walk = (x) => { for (const c of x.children || []) { if (c.t === 'el') { out.push(c); walk(c); } } };
  walk(root);
  return out;
}
export function querySelectorAll(root, sel) {
  const chains = parseSelector(sel);
  return descendants(root).filter(n => chains.some(ch => matchChain(n, ch, ch.length - 1)));
}
export function querySelector(root, sel) { return querySelectorAll(root, sel)[0] || null; }
export function closest(n, sel) { for (let x = n; x && x.t === 'el'; x = x.parent) if (matches(x, sel)) return x; return null; }
export function allNodes(root) {
  const out = [];
  const walk = (x) => { for (const c of x.children || []) { out.push(c); walk(c); } };
  walk(root);
  return out;
}
export function removeNode(n) { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); n.parent = null; }
