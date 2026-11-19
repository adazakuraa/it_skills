// DevTools: Performance パネル（Core Web Vitals と読み込みの内訳）
import { el, clear } from '../util.js';
import { formatBytes, formatMs, THROTTLES } from '../vb/session.js';

export function renderPerformance(host, ses, ui) {
  clear(host);
  const p = ses.perf();
  const f = THROTTLES[ses.state.throttle].f || 1;
  const metric = (label, v, unit, good, bad, hint) => {
    const val = v == null ? null : (unit === 'ms' ? v * f : v);
    const cls = val == null ? '' : (unit === 'ms' ? (val <= good ? 'good' : val <= bad ? 'mid' : 'bad') : (val <= good ? 'good' : val <= bad ? 'mid' : 'bad'));
    return el('div', { class: `dt-metric ${cls}` }, [el('div', { class: 'dt-metric-v', text: val == null ? '—' : (unit === 'ms' ? formatMs(val) : String(val)) }), el('div', { class: 'dt-metric-k', text: label }), el('div', { class: 'dt-metric-h', text: hint })]);
  };
  host.appendChild(el('div', { class: 'dt-subhead', text: `Core Web Vitals（${THROTTLES[ses.state.throttle].label}）` }));
  host.appendChild(el('div', { class: 'dt-metrics' }, [
    metric('FCP 最初の描画', p.fcp, 'ms', 1800, 3000, '何か表示されるまで'),
    metric('LCP 最大要素の描画', p.lcp, 'ms', 2500, 4000, '一番大きい要素が出るまで'),
    metric('CLS レイアウトのズレ', p.cls, 'n', 0.1, 0.25, 'ガタつきの少なさ'),
    metric('TBT 操作できない時間', p.tbt, 'ms', 200, 600, 'JSの重さの目安'),
  ]));
  if (p.lcpElement) host.appendChild(el('div', { class: 'dt-pane' }, [el('div', { class: 'dt-subhead', text: 'LCP 要素' }), el('div', { class: 'dt-code', text: p.lcpElement })]));
  const sum = ses.networkSummary();
  const bytesByType = {};
  for (const r of ses.requests) bytesByType[r.type] = (bytesByType[r.type] || 0) + r.size;
  const rows = Object.entries(bytesByType).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0) || 1;
  const box = el('div', { class: 'dt-pane' }, [el('div', { class: 'dt-subhead', text: `種類別の転送サイズ（合計 ${formatBytes(total)}）` })]);
  for (const [t, n] of rows) box.appendChild(el('div', { class: 'dt-bar-row' }, [el('span', { class: 'dt-bar-k', text: t }), el('div', { class: 'dt-bar-track' }, [el('div', { class: 'dt-bar-fill', style: `width:${Math.max(2, (n / total) * 100)}%` })]), el('span', { class: 'dt-bar-v', text: formatBytes(n) })]));
  box.appendChild(el('div', { class: 'dt-hint', text: `全 ${sum.count} 件のリクエスト。回線を遅くするとき(Network タブの Throttling)は、表示までの時間が伸びます。` }));
  host.appendChild(box);
}
