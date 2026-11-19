// DevTools: Elements パネル（DOMツリーの閲覧と編集）
import { el, clear } from '../util.js';
import { elLabel } from '../vb/jsrepl.js';
import * as H from '../vb/html.js';

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);

export function renderElements(host, ses, ui) {
  clear(host);
  const open = ui.elOpen || (ui.elOpen = new Set());
  if (!ui.elInit) {
    // 既定で html → head/body までを展開（深い階層は自分で開いてもらう）
    const html = H.querySelector(ses.root, 'html');
    if (html) { open.add(html.uid); for (const c of html.children) if (c.t === 'el') open.add(c.uid); }
    ui.elInit = true;
  }
  const search = el('input', { class: 'dt-input', type: 'search', placeholder: '検索（セレクタ・テキスト・属性値）', value: ui.elSearch || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const counter = el('span', { class: 'dt-muted' });
  const sel = ui.elSelected && ui.elSelected.parent !== null ? ui.elSelected : null;
  const matchSet = new Set();
  const q = (ui.elSearch || '').trim();
  if (q) {
    let byCss = [];
    try { byCss = H.querySelectorAll(ses.root, q); } catch { /* セレクタではない */ }
    const ql = q.toLowerCase();
    for (const n of H.allNodes(ses.root)) {
      if (byCss.includes(n)) { matchSet.add(n); continue; }
      if (n.t === 'text' && n.text.toLowerCase().includes(ql)) matchSet.add(n);
      else if (n.t === 'comment' && n.text.toLowerCase().includes(ql)) matchSet.add(n);
      else if (n.t === 'el' && (n.tag.includes(ql) || Object.entries(n.attrs).some(([k, v]) => k.includes(ql) || v.toLowerCase().includes(ql)))) matchSet.add(n);
    }
    // 一致ノードの祖先を展開する
    for (const n of matchSet) for (let p = n.parent; p; p = p.parent) open.add(p.uid);
    counter.textContent = `${matchSet.size} 件`;
  }
  search.addEventListener('input', () => { ui.elSearch = search.value; ui.rerender('elements', true); });

  const tree = el('div', { class: 'dt-tree', role: 'tree' });
  const renderNode = (n, depth, into) => {
    const pad = Math.min(depth, 8) * 12;
    if (n.t === 'text') {
      const t = n.text.replace(/\s+/g, ' ').trim();
      if (!t) return;
      const raw = n.parent && ['script', 'style'].includes(n.parent.tag);
      into.appendChild(el('div', { class: 'dt-row dt-text' + (matchSet.has(n) ? ' hit' : ''), style: `padding-left:${pad + 16}px` }, [el('span', { class: 'dt-txt', text: raw ? n.text.trim().slice(0, 160) : t })]));
      return;
    }
    if (n.t === 'comment') {
      into.appendChild(el('div', { class: 'dt-row dt-comment' + (matchSet.has(n) ? ' hit' : ''), style: `padding-left:${pad + 16}px` }, [el('span', { text: `<!--${n.text}-->` })]));
      return;
    }
    const kids = n.children.filter(c => !(c.t === 'text' && !c.text.trim()));
    const expandable = kids.length > 0 && !VOID.has(n.tag);
    const isOpen = open.has(n.uid);
    const hidden = H.selfHidden(n);
    const row = el('div', { class: 'dt-row dt-el' + (sel === n ? ' sel' : '') + (hidden ? ' hidden-el' : '') + (matchSet.has(n) ? ' hit' : ''), style: `padding-left:${pad}px` });
    const arrow = el('span', { class: 'dt-arrow', text: expandable ? (isOpen ? '▾' : '▸') : '' });
    arrow.addEventListener('click', (e) => { e.stopPropagation(); if (!expandable) return; if (open.has(n.uid)) open.delete(n.uid); else open.add(n.uid); ui.rerender('elements', true); });
    row.appendChild(arrow);
    const tag = el('span', { class: 'dt-tag' });
    tag.appendChild(document.createTextNode('<'));
    tag.appendChild(el('span', { class: 'dt-tagname', text: n.tag }));
    for (const [k, v] of Object.entries(n.attrs)) {
      tag.appendChild(document.createTextNode(' '));
      tag.appendChild(el('span', { class: 'dt-attrname', text: k }));
      if (v !== '') { tag.appendChild(document.createTextNode('="')); tag.appendChild(el('span', { class: 'dt-attrval', text: v.length > 80 ? v.slice(0, 80) + '…' : v })); tag.appendChild(document.createTextNode('"')); }
    }
    tag.appendChild(document.createTextNode('>'));
    row.appendChild(tag);
    if (expandable && !isOpen) row.appendChild(el('span', { class: 'dt-muted', text: ' …' }));
    if (!expandable && !VOID.has(n.tag)) row.appendChild(el('span', { class: 'dt-tag', text: `</${n.tag}>` }));
    if (hidden) row.appendChild(el('span', { class: 'dt-badge', text: '非表示' }));
    row.addEventListener('click', () => { ui.elSelected = n; ui.rerender('elements', true); });
    into.appendChild(row);
    if (expandable && isOpen) {
      for (const c of n.children) renderNode(c, depth + 1, into);
      into.appendChild(el('div', { class: 'dt-row dt-el', style: `padding-left:${pad}px` }, [el('span', { class: 'dt-arrow' }), el('span', { class: 'dt-tag', text: `</${n.tag}>` })]));
    }
  };
  for (const c of ses.root.children) renderNode(c, 0, tree);

  host.appendChild(el('div', { class: 'dt-toolbar' }, [search, counter]));
  host.appendChild(tree);
  host.appendChild(selectedPane(ses, ui, sel));
}

function selectedPane(ses, ui, n) {
  const box = el('div', { class: 'dt-pane' });
  if (!n) { box.appendChild(el('div', { class: 'dt-hint', text: '行をタップして要素を選ぶと、属性の確認と編集ができます。' })); return box; }
  box.appendChild(el('div', { class: 'dt-pane-title', text: elLabel(n) }));
  box.appendChild(el('div', { class: 'dt-kv' }, [
    el('span', { class: 'dt-k', text: '表示状態' }),
    el('span', { class: 'dt-v', text: H.isHidden(n) ? '画面には表示されません（非表示）' : '画面に表示されます' }),
  ]));
  const attrs = Object.entries(n.attrs);
  box.appendChild(el('div', { class: 'dt-subhead', text: `属性（${attrs.length}）— タップして編集` }));
  if (!attrs.length) box.appendChild(el('div', { class: 'dt-muted', text: '属性はありません' }));
  for (const [k, v] of attrs) {
    const row = el('div', { class: 'dt-attr' });
    const val = el('input', { class: 'dt-input small', type: 'text', value: v, 'aria-label': `${k} の値`, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    val.addEventListener('change', () => { ses.editAttr(n, k, val.value); });
    row.appendChild(el('span', { class: 'dt-attrname', text: k }));
    row.appendChild(val);
    row.appendChild(el('button', { class: 'dt-mini danger', type: 'button', text: '削除', 'aria-label': `${k} 属性を削除`, onclick: () => ses.editAttr(n, k, null) }));
    box.appendChild(row);
  }
  const add = el('div', { class: 'dt-attr' });
  const nm = el('input', { class: 'dt-input small', type: 'text', placeholder: '属性名', autocapitalize: 'off', spellcheck: 'false' });
  const vl = el('input', { class: 'dt-input small', type: 'text', placeholder: '値', autocapitalize: 'off', spellcheck: 'false' });
  add.appendChild(nm); add.appendChild(vl);
  add.appendChild(el('button', { class: 'dt-mini', type: 'button', text: '追加', onclick: () => { const k = nm.value.trim().toLowerCase(); if (/^[a-z_:][\w:-]*$/.test(k)) ses.editAttr(n, k, vl.value); } }));
  box.appendChild(add);
  if (n.t === 'el' && n.children.some(c => c.t === 'text' && c.text.trim()) && !['script', 'style'].includes(n.tag)) {
    box.appendChild(el('div', { class: 'dt-subhead', text: 'テキスト内容' }));
    box.appendChild(el('div', { class: 'dt-code', text: H.textContent(n).trim().slice(0, 400) }));
  }
  box.appendChild(el('div', { class: 'dt-hint', text: 'ここでの編集は、この端末のブラウザ内の「架空ページ」にだけ反映されます（元のサーバーは変わりません）。' }));
  return box;
}
