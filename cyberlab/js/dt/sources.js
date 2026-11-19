// DevTools: Sources パネル（ソース閲覧・全文検索・整形表示・ブレークポイント）
import { el, clear } from '../util.js';

// 簡易整形（minify されたJSを読みやすくする）。文字列・コメントは壊さない。
export function prettyPrint(code) {
  let out = '', indent = 0, i = 0, inStr = null, paren = 0;
  const nl = () => { out = out.replace(/[ \t]+$/, '') + '\n' + '  '.repeat(Math.max(0, indent)); };
  while (i < code.length) {
    const c = code[i];
    if (inStr) { out += c; if (c === '\\') { out += code[i + 1] || ''; i += 2; continue; } if (c === inStr) inStr = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; i++; continue; }
    if (c === '(') paren++; else if (c === ')') paren = Math.max(0, paren - 1);
    if (c === '{') { out += ' {'; indent++; nl(); i++; if (code[i] === '}') { indent--; out = out.replace(/\n\s*$/, '') + '}'; i++; } continue; }
    if (c === '}') { indent--; nl(); out += '}'; i++; if (code[i] && !/[;,)\s.]/.test(code[i])) nl(); continue; }
    if (c === ';' && paren === 0) { out += ';'; nl(); i++; continue; }
    if (c === ',' && paren === 0 && indent > 0 && /^[\s]*["'\w$]+\s*:/.test(code.slice(i + 1, i + 60))) { out += ','; nl(); i++; continue; }
    if (c === '\n' ) { i++; continue; }
    out += c; i++;
  }
  return out.replace(/\n\s*\n/g, '\n').trim();
}

export function renderSources(host, ses, ui) {
  clear(host);
  const files = ses.sourceFiles();
  if (!files.length) { host.appendChild(el('div', { class: 'dt-hint', text: 'このページにはソースファイルがありません。' })); return; }
  if (!ui.srcFile || !files.includes(ui.srcFile)) ui.srcFile = null;
  const st = ses.state;

  // 全文検索
  const qIn = el('input', { class: 'dt-input', type: 'search', placeholder: '全ファイルを検索（例: key / token / password）', value: ui.srcQuery || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'search', 'aria-label': 'ソース全体を検索' });
  const doSearch = () => { ui.srcQuery = qIn.value.trim(); ui.srcResults = ui.srcQuery ? ses.searchSources(ui.srcQuery) : null; ui.rerender('sources', true); };
  qIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  host.appendChild(el('div', { class: 'dt-toolbar' }, [qIn, el('button', { class: 'dt-run', type: 'button', text: '検索', onclick: doSearch })]));

  if (ui.srcResults) {
    const res = ui.srcResults;
    host.appendChild(el('div', { class: 'dt-subhead', text: `検索結果 ${res.length} 件（タップで該当行を開く）` }));
    const box = el('div', { class: 'dt-results' });
    if (!res.length) box.appendChild(el('div', { class: 'dt-muted', text: '一致なし' }));
    for (const r of res.slice(0, 60)) box.appendChild(el('button', { class: 'dt-result', type: 'button', onclick: () => ui.openSource(r.file, r.line) }, [el('span', { class: 'dt-src', text: `${r.file}:${r.line}` }), el('span', { class: 'dt-result-text', text: r.text })]));
    host.appendChild(box);
  }

  host.appendChild(el('div', { class: 'dt-chips wrap' }, files.map(f => el('button', { class: 'dt-chip code' + (ui.srcFile === f ? ' on' : ''), type: 'button', text: f, onclick: () => { ui.srcFile = f; ui.srcLine = null; st.sourcesOpened.add(f); ui.rerender('sources', true); } }))));
  if (!ui.srcFile) { host.appendChild(el('div', { class: 'dt-hint', text: 'ファイル名をタップして中身を表示します。行番号をタップするとブレークポイントを設定できます。' })); return; }

  const f = ui.srcFile;
  ui.pretty = ui.pretty || {};
  const raw = ses.sourceText(f);
  const isMin = raw.split('\n').some(l => l.length > 200);
  const text = ui.pretty[f] ? prettyPrint(raw) : raw;
  const bar = el('div', { class: 'dt-toolbar' }, [el('span', { class: 'dt-muted', text: `${f}（${text.split('\n').length} 行）` })]);
  if (isMin || ui.pretty[f]) bar.appendChild(el('button', { class: 'dt-mini' + (ui.pretty[f] ? ' on' : ''), type: 'button', text: '{} 整形表示', onclick: () => { ui.pretty[f] = !ui.pretty[f]; if (ui.pretty[f]) st.prettyPrinted.add(f); ui.rerender('sources', true); } }));
  host.appendChild(bar);

  const lines = text.split('\n');
  const view = el('div', { class: 'dt-src-view' });
  const pausedHere = st.paused && st.paused.file === f ? st.paused.line : null;
  lines.forEach((l, i) => {
    const no = i + 1;
    const bp = !ui.pretty[f] && st.breakpoints.some(b => b.file === f && b.line === no);
    const row = el('div', { class: 'dt-line' + (ui.srcLine === no ? ' focus' : '') + (pausedHere === no && !ui.pretty[f] ? ' paused' : '') });
    const num = el('button', { class: 'dt-lno' + (bp ? ' bp' : ''), type: 'button', text: String(no), 'aria-label': `${no} 行目${bp ? '（ブレークポイントあり）' : ''}`, 'aria-pressed': bp ? 'true' : 'false' });
    num.addEventListener('click', () => { if (ui.pretty[f]) { ui.flash('整形表示中はブレークポイントを設定できません。{} をもう一度押して元のソースに戻してください。'); return; } const r = ses.toggleBreakpoint(f, no); ui.flash(r === 'paused' ? `${no} 行目で実行が一時停止しました（下の Scope を確認）` : r === 'set' ? `${no} 行目にブレークポイントを設定しました` : `${no} 行目のブレークポイントを解除しました`); ui.rerender('sources', true); });
    row.appendChild(num);
    row.appendChild(el('span', { class: 'dt-code-line', text: l || ' ' }));
    view.appendChild(row);
  });
  host.appendChild(view);
  if (ui.srcLine) requestAnimationFrame(() => { const t = view.querySelector('.dt-line.focus'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center' }); });

  if (st.paused) {
    const p = st.paused;
    const box = el('div', { class: 'dt-pane paused-box' }, [el('div', { class: 'dt-pane-title', text: `⏸ 一時停止中: ${p.file}:${p.line}` })]);
    if (p.note) box.appendChild(el('div', { class: 'dt-hint', text: p.note }));
    if (p.stack && p.stack.length) { box.appendChild(el('div', { class: 'dt-subhead', text: 'コールスタック (Call Stack)' })); box.appendChild(el('div', { class: 'dt-code', text: p.stack.join('\n') })); }
    box.appendChild(el('div', { class: 'dt-subhead', text: 'スコープ (Scope) — この時点の変数の値' }));
    for (const [scope, vars] of Object.entries(p.scope)) {
      box.appendChild(el('div', { class: 'dt-scope-name', text: scope }));
      box.appendChild(el('div', { class: 'dt-kvlist' }, Object.entries(vars).map(([k, v]) => el('div', { class: 'dt-kvrow' }, [el('span', { class: 'dt-k', text: k }), el('span', { class: 'dt-v', text: typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v) })]))));
    }
    box.appendChild(el('button', { class: 'dt-mini', type: 'button', text: '▶ 再開', onclick: () => { ses.resume(); ui.rerender('sources', true); } }));
    host.appendChild(box);
  }
}
