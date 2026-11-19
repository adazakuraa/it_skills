// ============================================================
// 疑似 DevTools（スマホ向け）。ゲーム内の架空ページに対して
// Elements / Console / Network / Sources / Application / Security / Performance を操作する。
// 実ブラウザの DevTools や実ページには一切アクセスしない。
// ============================================================
import { el, clear } from './util.js';
import { TAB_LABEL } from './vb/session.js';
import * as H from './vb/html.js';
import { renderElements } from './dt/elements.js';
import { renderConsole } from './dt/console.js';
import { renderNetwork } from './dt/network.js';
import { renderApplication } from './dt/application.js';
import { renderSources } from './dt/sources.js';
import { renderSecurity } from './dt/security.js';
import { renderPerformance } from './dt/performance.js';

const RENDER = { elements: renderElements, console: renderConsole, network: renderNetwork, application: renderApplication, sources: renderSources, security: renderSecurity, performance: renderPerformance };
const ERR_BADGE = (ses) => ses.consoleLog.filter(m => m.level === 'error').length;

/** DevTools を container に構築する。ui オブジェクトは再描画しても状態を保持する。 */
export function mountDevtools(container, ses, ui, { onChange } = {}) {
  ui.tab = ui.tab && ses.tabs.includes(ui.tab) ? ui.tab : ses.tabs[0];
  ui.quick = ui.quick || [];
  const shell = el('div', { class: 'dt' });
  const tabbar = el('div', { class: 'dt-tabs', role: 'tablist' });
  const toast = el('div', { class: 'dt-toast', role: 'status' });
  const body = el('div', { class: 'dt-body' });
  shell.appendChild(tabbar); shell.appendChild(body); shell.appendChild(toast);
  container.appendChild(shell);

  let toastTimer = null;
  ui.flash = (msg) => { toast.textContent = msg; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); };
  ui.openSource = (file, line) => { ui.srcFile = file; ui.srcLine = line || null; ses.state.sourcesOpened.add(file); setTab('sources'); };
  ui.openRequest = (id) => { ui.netDetail = id; ui.netTab = 'headers'; ses.state.viewedRequests.add(id); setTab('network'); };

  function drawTabs() {
    clear(tabbar);
    for (const t of ses.tabs) {
      const badge = t === 'console' ? ERR_BADGE(ses) : 0;
      tabbar.appendChild(el('button', { class: 'dt-tab' + (ui.tab === t ? ' active' : ''), type: 'button', role: 'tab', 'aria-selected': ui.tab === t ? 'true' : 'false', onclick: () => setTab(t) }, [TAB_LABEL[t], badge ? el('span', { class: 'dt-tab-badge', text: String(badge) }) : null]));
    }
  }
  function draw(keepScroll, toBottom) {
    const top = body.scrollTop;
    ui.stickBottom = !!toBottom;
    RENDER[ui.tab](body, ses, ui);
    if (keepScroll) body.scrollTop = top;
    if (toBottom) requestAnimationFrame(() => { const c = body.querySelector('.dt-console'); if (c) c.scrollTop = c.scrollHeight; });
  }
  function setTab(t) { ui.tab = t; ses.visit(t); drawTabs(); draw(false); if (onChange) onChange(); }
  ui.rerender = (tab, keepScroll, toBottom) => { drawTabs(); if (!tab || tab === ui.tab) draw(keepScroll, toBottom); if (onChange) onChange(); };

  ses.visit(ui.tab);
  const unsub = ses.subscribe((what) => { if (!shell.isConnected) { unsub(); return; } drawTabs(); if (what === 'dom' || what === 'storage' || what === 'bp' || what === 'console') { if (ui.tab !== 'console' || what === 'console') draw(true, what === 'console'); } if (onChange) onChange(); });
  drawTabs(); draw(false);
  return shell;
}

/** ページの「見た目」プレビュー（表示されている要素だけを簡易描画）。DOMはtextContentで作り、innerHTMLは使わない。 */
export function renderPagePreview(container, ses) {
  clear(container);
  const bar = el('div', { class: 'pv-url' }, [el('span', { class: 'pv-lock', text: ses.page.protocol === 'https:' ? '🔒' : '⚠️' }), el('span', { class: 'pv-url-text', text: ses.page.href })]);
  const page = el('div', { class: 'pv-page' });
  const body = H.querySelector(ses.root, 'body');
  const title = H.querySelector(ses.root, 'title');
  const draw = (n, into) => {
    if (n.t === 'text') { const t = n.text.replace(/\s+/g, ' ').trim(); if (t && !(n.parent && ['script', 'style', 'title'].includes(n.parent.tag))) into.appendChild(document.createTextNode(t + ' ')); return; }
    if (n.t !== 'el' || H.selfHidden(n)) return;
    const t = n.tag;
    if (['script', 'style', 'head', 'meta', 'link', 'title', 'noscript'].includes(t)) return;
    let node;
    if (/^h[1-6]$/.test(t)) node = el('div', { class: 'pv-' + t });
    else if (t === 'a') node = el('span', { class: 'pv-a' });
    else if (t === 'button') node = el('span', { class: 'pv-btn' });
    else if (t === 'input') { if (['hidden', 'submit', 'button'].includes((n.attrs.type || '').toLowerCase())) { if ((n.attrs.type || '') === 'hidden') return; node = el('span', { class: 'pv-btn', text: n.attrs.value || '送信' }); into.appendChild(node); return; } node = el('span', { class: 'pv-input', text: n.attrs.placeholder || n.attrs.value || n.attrs.name || '' }); into.appendChild(node); return; }
    else if (t === 'img') { into.appendChild(el('span', { class: 'pv-img', text: `🖼 ${n.attrs.alt || (n.attrs.src || 'image').split('/').pop()}` })); return; }
    else if (t === 'iframe') { into.appendChild(el('span', { class: 'pv-img', text: '▭ 埋め込みフレーム' })); return; }
    else if (['p', 'div', 'li', 'section', 'form', 'ul', 'ol', 'nav', 'header', 'footer', 'main', 'article', 'table', 'tr', 'label', 'pre'].includes(t)) node = el('div', { class: 'pv-block pv-' + t });
    else node = el('span', {});
    for (const c of n.children) draw(c, node);
    if (node.childNodes.length) into.appendChild(node);
  };
  if (body) for (const c of body.children) draw(c, page);
  if (!page.childNodes.length) page.appendChild(el('div', { class: 'dt-muted', text: '（表示される内容がありません）' }));
  container.appendChild(el('div', { class: 'pv' }, [bar, el('div', { class: 'pv-title', text: title ? H.textContent(title).trim() : '(無題)' }), page,
    el('div', { class: 'dt-hint', text: 'これは「画面に実際に表示される内容」の簡易表示です。非表示にされた要素・コメント・通信の中身は、DevTools でないと見えません。' })]));
}
