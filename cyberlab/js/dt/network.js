// DevTools: Network パネル（リクエスト一覧と詳細）
import { el, clear } from '../util.js';
import { formatBytes, formatMs, THROTTLES } from '../vb/session.js';

const FILTERS = [['all', 'すべて'], ['fetch', 'Fetch/XHR'], ['script', 'JS'], ['stylesheet', 'CSS'], ['img', 'Img'], ['document', 'Doc'], ['other', 'その他']];
const matchFilter = (r, f) => f === 'all' || (f === 'fetch' ? (r.type === 'fetch' || r.type === 'xhr') : f === 'other' ? !['fetch', 'xhr', 'script', 'stylesheet', 'img', 'document'].includes(r.type) : r.type === f);
const TYPE_LABEL = { fetch: 'fetch', xhr: 'xhr', script: 'script', stylesheet: 'css', img: 'img', document: 'doc', font: 'font', other: 'other' };

export function renderNetwork(host, ses, ui) {
  clear(host);
  if (ui.netDetail) return renderDetail(host, ses, ui, ses.requests.find(r => r.id === ui.netDetail));
  const st = ses.state;
  const filter = st.networkFilter || 'all';
  const sum = ses.networkSummary();
  const tl = THROTTLES[st.throttle];

  const chips = el('div', { class: 'dt-chips' }, FILTERS.map(([k, l]) => el('button', { class: 'dt-chip' + (filter === k ? ' on' : ''), type: 'button', text: l, onclick: () => { st.networkFilter = k; st.filtersUsed.add(k); ui.rerender('network', true); } })));
  const q = el('input', { class: 'dt-input', type: 'search', placeholder: 'URL・ステータスで絞り込み', value: ui.netSearch || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Network を検索' });
  q.addEventListener('input', () => { ui.netSearch = q.value; ui.rerender('network', true); });
  const th = el('select', { class: 'dt-select', 'aria-label': '回線速度のスロットリング' }, Object.entries(THROTTLES).map(([k, v]) => { const o = el('option', { value: k, text: v.label }); if (k === st.throttle) o.selected = true; return o; }));
  th.addEventListener('change', () => { st.throttle = th.value; ui.rerender('network', true); });
  host.appendChild(el('div', { class: 'dt-toolbar col' }, [chips, el('div', { class: 'dt-row-flex' }, [q, th])]));

  const needle = (ui.netSearch || '').trim().toLowerCase();
  const rows = ses.requests.filter(r => matchFilter(r, filter) && (!needle || r.url.toLowerCase().includes(needle) || String(r.status).includes(needle) || r.method.toLowerCase().includes(needle)));
  const list = el('div', { class: 'dt-netlist', role: 'list' });
  const maxEnd = Math.max(1, ...ses.requests.map(r => r.start + r.time));
  if (!rows.length) list.appendChild(el('div', { class: 'dt-hint', text: '条件に一致するリクエストはありません。' }));
  for (const r of rows) {
    const bad = r.failed || r.status >= 400;
    const line1 = el('div', { class: 'dt-net-l1' }, [
      el('span', { class: 'dt-method', text: r.method }),
      el('span', { class: 'dt-net-name', text: r.name }),
      el('span', { class: 'dt-status ' + (bad ? 'bad' : r.status >= 300 ? 'redir' : 'ok'), text: r.failed ? '(failed)' : r.blocked ? `(blocked:${r.blocked})` : String(r.status) }),
    ]);
    const t = tl.f == null ? null : r.time * tl.f;
    const line2 = el('div', { class: 'dt-net-l2' }, [
      el('span', { text: TYPE_LABEL[r.type] || r.type }), el('span', { text: r.fromCache ? '(キャッシュ)' : formatBytes(r.size) }),
      el('span', { text: t == null ? '—' : formatMs(t) }), el('span', { class: 'dt-host' + (r.thirdParty ? ' third' : ''), text: r.host }),
    ]);
    const bar = el('div', { class: 'dt-wf' }, [el('div', { class: 'dt-wf-bar' + (bad ? ' bad' : ''), style: `left:${(r.start / maxEnd) * 100}%;width:${Math.max(1.5, (r.time / maxEnd) * 100)}%` })]);
    const row = el('button', { class: 'dt-netrow' + (bad ? ' bad' : ''), type: 'button', role: 'listitem', onclick: () => { ui.netDetail = r.id; ui.netTab = 'headers'; st.viewedRequests.add(r.id); ui.rerender('network', true); } }, [line1, line2, bar]);
    list.appendChild(row);
  }
  host.appendChild(list);
  host.appendChild(el('div', { class: 'dt-summary' }, [
    el('span', { text: `${rows.length}/${sum.count} 件` }),
    el('span', { text: sum.finish == null ? 'オフライン' : `転送 ${formatBytes(sum.transferred)}` }),
    el('span', { text: sum.finish == null ? '' : `完了 ${formatMs(sum.finish)}` }),
    el('span', { class: 'dt-muted', text: tl.label }),
  ]));
  host.appendChild(el('div', { class: 'dt-hint', text: 'リクエストをタップすると、ヘッダ・送信内容・レスポンスなどの詳細を確認できます。ステータスが赤いものは失敗です。' }));
}

const kvTable = (obj) => {
  const entries = Array.isArray(obj) ? obj : Object.entries(obj);
  if (!entries.length) return el('div', { class: 'dt-muted', text: '（なし）' });
  return el('div', { class: 'dt-kvlist' }, entries.map(([k, v]) => el('div', { class: 'dt-kvrow' }, [el('span', { class: 'dt-k', text: k }), el('span', { class: 'dt-v', text: String(v) })])));
};

function renderDetail(host, ses, ui, r) {
  if (!r) { ui.netDetail = null; return renderNetwork(host, ses, ui); }
  const tabs = [['headers', 'Headers'], ['payload', 'Payload'], ['response', 'Response'], ['timing', 'Timing']];
  const cur = ui.netTab || 'headers';
  host.appendChild(el('div', { class: 'dt-toolbar' }, [
    el('button', { class: 'dt-mini', type: 'button', text: '‹ 一覧へ', onclick: () => { ui.netDetail = null; ui.rerender('network', true); } }),
    el('span', { class: 'dt-net-name big', text: r.name }),
  ]));
  host.appendChild(el('div', { class: 'dt-chips' }, tabs.map(([k, l]) => el('button', { class: 'dt-chip' + (cur === k ? ' on' : ''), type: 'button', text: l, onclick: () => { ui.netTab = k; ui.rerender('network', true); } }))));
  const body = el('div', { class: 'dt-pane' });
  if (cur === 'headers') {
    body.appendChild(el('div', { class: 'dt-subhead', text: '全般 (General)' }));
    body.appendChild(kvTable([['Request URL', r.url], ['Request Method', r.method], ['Status Code', `${r.failed ? '(failed) ' + r.failed : r.status + ' ' + r.statusText}`], ['Remote Address', r.remote || '—'], ['Protocol', r.protocol]]));
    body.appendChild(el('div', { class: 'dt-subhead', text: 'レスポンスヘッダ (Response Headers)' }));
    body.appendChild(kvTable(r.resHeaders));
    body.appendChild(el('div', { class: 'dt-subhead', text: 'リクエストヘッダ (Request Headers)' }));
    body.appendChild(kvTable(r.reqHeaders));
  } else if (cur === 'payload') {
    body.appendChild(el('div', { class: 'dt-subhead', text: 'クエリパラメータ (Query String Parameters)' }));
    body.appendChild(kvTable(r.params));
    body.appendChild(el('div', { class: 'dt-subhead', text: '送信内容 (Request Payload)' }));
    body.appendChild(r.reqBody ? el('div', { class: 'dt-code', text: r.reqBody }) : el('div', { class: 'dt-muted', text: '（なし）' }));
  } else if (cur === 'response') {
    body.appendChild(el('div', { class: 'dt-subhead', text: `レスポンス (${r.mime || '不明'})` }));
    let txt = r.resBody;
    if (/json/.test(r.mime) && txt) { try { txt = JSON.stringify(JSON.parse(txt), null, 2); } catch { /* そのまま */ } }
    body.appendChild(txt ? el('div', { class: 'dt-code', text: txt }) : el('div', { class: 'dt-muted', text: r.failed ? '（通信に失敗したためレスポンスはありません）' : '（レスポンス本文はありません）' }));
  } else {
    const f = THROTTLES[ses.state.throttle].f;
    body.appendChild(el('div', { class: 'dt-subhead', text: 'タイミング (Timing)' }));
    body.appendChild(kvTable([['開始', formatMs(r.start * (f || 1))], ['所要時間', f == null ? '—' : formatMs(r.time * f)], ['転送サイズ', r.fromCache ? '(キャッシュ)' : formatBytes(r.size)], ['展開後サイズ', formatBytes(r.resourceSize)], ['回線', THROTTLES[ses.state.throttle].label]]));
    if (r.initiator) { body.appendChild(el('div', { class: 'dt-subhead', text: 'このリクエストを発行したもの (Initiator)' })); body.appendChild(el('div', { class: 'dt-code', text: r.initiator })); }
  }
  if (r.note) body.appendChild(el('div', { class: 'dt-hint', text: r.note }));
  host.appendChild(body);
}
