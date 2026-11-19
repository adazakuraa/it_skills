// DevTools: Security / Issues パネル
import { el, clear } from '../util.js';

export function renderSecurity(host, ses, ui) {
  clear(host);
  const sec = ses.security();
  const pane = el('div', { class: 'dt-pane' });
  pane.appendChild(el('div', { class: 'dt-subhead', text: '接続の概要 (Overview)' }));
  pane.appendChild(el('div', { class: 'dt-secbanner ' + (sec.https ? 'ok' : 'bad'), text: sec.https ? '🔒 このページは HTTPS で配信されています' : '⚠️ このページは安全ではありません (HTTP)' }));
  if (sec.cert) {
    pane.appendChild(el('div', { class: 'dt-subhead', text: '証明書 (Certificate)' }));
    pane.appendChild(el('div', { class: 'dt-kvlist' }, [['発行先', sec.cert.subject], ['発行者', sec.cert.issuer], ['有効期間', `${sec.cert.validFrom} 〜 ${sec.cert.validTo}`], ['プロトコル', sec.protocol], ['暗号スイート', sec.cert.cipher || '—']].filter(x => x[1]).map(([k, v]) => el('div', { class: 'dt-kvrow' }, [el('span', { class: 'dt-k', text: k }), el('span', { class: 'dt-v', text: v })]))));
  }
  const http = ses.requests.filter(r => r.url.startsWith('http://')).length, https = ses.requests.length - http;
  pane.appendChild(el('div', { class: 'dt-subhead', text: 'リソースの通信方式' }));
  pane.appendChild(el('div', { class: 'dt-kvlist' }, [['HTTPS', `${https} 件`], ['HTTP（暗号化なし）', `${http} 件`]].map(([k, v]) => el('div', { class: 'dt-kvrow' }, [el('span', { class: 'dt-k', text: k }), el('span', { class: 'dt-v', text: v })]))));
  host.appendChild(pane);

  const issues = ses.issues();
  const box = el('div', { class: 'dt-pane' }, [el('div', { class: 'dt-subhead', text: `問題 (Issues) — ${issues.length} 件` })]);
  if (!issues.length) box.appendChild(el('div', { class: 'dt-muted', text: '検出された問題はありません。' }));
  for (const i of issues) {
    box.appendChild(el('div', { class: `dt-issue ${i.severity}` }, [
      el('div', { class: 'dt-issue-title', text: `${i.severity === 'error' ? '⛔' : i.severity === 'warning' ? '⚠️' : 'ℹ️'} ${i.title}` }),
      i.detail ? el('div', { class: 'dt-code small', text: i.detail }) : null,
      i.why ? el('div', { class: 'dt-hint', text: i.why }) : null,
    ]));
  }
  host.appendChild(box);
}
