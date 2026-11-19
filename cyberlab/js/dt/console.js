// DevTools: Console パネル（メッセージの閲覧と式の実行）
import { el, clear } from '../util.js';

const LEVEL_LABEL = { error: 'エラー', warn: '警告', info: '情報', log: 'ログ' };

export function renderConsole(host, ses, ui) {
  clear(host);
  const filter = ui.conFilter || 'all';
  const filters = [['all', 'すべて'], ['error', 'エラー'], ['warn', '警告'], ['log', 'ログ/情報']];
  const bar = el('div', { class: 'dt-chips' }, filters.map(([k, l]) => el('button', { class: 'dt-chip' + (filter === k ? ' on' : ''), type: 'button', text: l, onclick: () => { ui.conFilter = k; ui.rerender('console', true); } })));
  const counts = { error: 0, warn: 0 };
  for (const m of ses.consoleLog) if (counts[m.level] !== undefined) counts[m.level]++;
  host.appendChild(el('div', { class: 'dt-toolbar' }, [bar, el('span', { class: 'dt-muted', text: `エラー ${counts.error} / 警告 ${counts.warn}` })]));

  const out = el('div', { class: 'dt-console', 'aria-live': 'polite' });
  const show = (m) => {
    if (m.level === 'input' || m.level === 'result') return true;
    if (filter === 'all') return true;
    if (filter === 'log') return m.level === 'log' || m.level === 'info';
    return m.level === filter;
  };
  for (const m of ses.consoleLog) {
    if (!show(m)) continue;
    const row = el('div', { class: `dt-msg ${m.level}` });
    if (m.level === 'input') row.appendChild(el('span', { class: 'dt-prompt', text: '›' }));
    else if (m.level === 'result') row.appendChild(el('span', { class: 'dt-prompt', text: '‹' }));
    else if (m.level === 'error') row.appendChild(el('span', { class: 'dt-ico', text: '⛔', title: LEVEL_LABEL.error }));
    else if (m.level === 'warn') row.appendChild(el('span', { class: 'dt-ico', text: '⚠️', title: LEVEL_LABEL.warn }));
    else row.appendChild(el('span', { class: 'dt-prompt', text: ' ' }));
    row.appendChild(el('span', { class: 'dt-msg-text', text: m.text }));
    if (m.source) {
      const link = el('button', { class: 'dt-src', type: 'button', text: m.source, 'aria-label': `${m.source} をSourcesで開く` });
      const mm = /^(.+?):(\d+)(?::\d+)?$/.exec(m.source);
      if (mm && ses.sourceFiles().includes(mm[1])) link.addEventListener('click', () => ui.openSource(mm[1], Number(mm[2])));
      else link.disabled = true;
      row.appendChild(link);
    }
    if (m.nav) row.appendChild(el('button', { class: 'dt-src', type: 'button', text: '通信を見る', onclick: () => ui.openRequest(m.nav) }));
    out.appendChild(row);
  }
  host.appendChild(out);

  const input = el('input', { class: 'dt-input mono', type: 'text', placeholder: 'JavaScript を入力（例: document.title）', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Console に式を入力' });
  const hist = ses.replHistory; let hi = hist.length;
  const run = () => {
    const t = input.value; if (!t.trim()) return;
    input.value = ''; ses.runConsole(t); hi = hist.length;
    ui.rerender('console', true, true);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); input.value = hist[hi] || ''; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; }
  });
  const row = el('div', { class: 'dt-inputrow' }, [el('span', { class: 'dt-prompt', text: '›' }), input, el('button', { class: 'dt-run', type: 'button', text: '実行', onclick: run })]);
  host.appendChild(row);

  const quick = (ui.quick || []);
  if (quick.length) {
    host.appendChild(el('div', { class: 'dt-subhead', text: '式の例（タップで入力欄へ）' }));
    host.appendChild(el('div', { class: 'dt-chips wrap' }, quick.map(q => el('button', { class: 'dt-chip code', type: 'button', text: q, onclick: () => { input.value = q; input.focus(); } }))));
  }
  host.appendChild(el('div', { class: 'dt-hint', text: 'Console では、このページの中身に対して JavaScript の式を実行できます。実行できる範囲は学習用に限定されています。' }));
  if (ui.stickBottom) { requestAnimationFrame(() => { out.scrollTop = out.scrollHeight; }); }
}
