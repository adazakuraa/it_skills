// DevTools: Application パネル（Local Storage / Session Storage / Cookies）
import { el, clear } from '../util.js';

export function renderApplication(host, ses, ui) {
  clear(host);
  const cur = ui.appTab || 'local';
  const tabs = [['local', 'Local Storage'], ['session', 'Session Storage'], ['cookies', 'Cookies']];
  host.appendChild(el('div', { class: 'dt-chips' }, tabs.map(([k, l]) => el('button', { class: 'dt-chip' + (cur === k ? ' on' : ''), type: 'button', text: l, onclick: () => { ui.appTab = k; ui.rerender('application', true); } }))));
  const pane = el('div', { class: 'dt-pane' });
  if (cur === 'local' || cur === 'session') {
    const data = ses[cur];
    const keys = Object.keys(data);
    pane.appendChild(el('div', { class: 'dt-subhead', text: `${cur === 'local' ? 'localStorage' : 'sessionStorage'}（${keys.length} 件）— ${ses.page.origin}` }));
    if (!keys.length) pane.appendChild(el('div', { class: 'dt-muted', text: '（空です）' }));
    for (const k of keys) {
      pane.appendChild(el('div', { class: 'dt-store' }, [
        el('div', { class: 'dt-store-key', text: k }),
        el('div', { class: 'dt-store-val', text: data[k] }),
        el('button', { class: 'dt-mini danger', type: 'button', text: '削除', 'aria-label': `${k} を削除`, onclick: () => ses.removeStorage(cur, k) }),
      ]));
    }
    pane.appendChild(el('div', { class: 'dt-hint', text: cur === 'local' ? 'Local Storage はブラウザを閉じても残り、同じサイトのJavaScriptなら誰でも読めます。' : 'Session Storage はタブを閉じると消えます。こちらも同じタブ内のJavaScriptから読めます。' }));
  } else {
    pane.appendChild(el('div', { class: 'dt-subhead', text: `Cookies（${ses.cookies.length} 件）— ${ses.page.hostname}` }));
    if (!ses.cookies.length) pane.appendChild(el('div', { class: 'dt-muted', text: '（Cookie はありません）' }));
    for (const c of ses.cookies) {
      const flags = el('div', { class: 'dt-flags' }, [
        el('span', { class: 'dt-flag ' + (c.httpOnly ? 'good' : 'bad'), text: c.httpOnly ? 'HttpOnly ✓' : 'HttpOnly ✗' }),
        el('span', { class: 'dt-flag ' + (c.secure ? 'good' : 'bad'), text: c.secure ? 'Secure ✓' : 'Secure ✗' }),
        el('span', { class: 'dt-flag ' + (c.sameSite ? 'good' : 'bad'), text: c.sameSite ? `SameSite=${c.sameSite}` : 'SameSite ✗' }),
      ]);
      pane.appendChild(el('div', { class: 'dt-store' }, [
        el('div', { class: 'dt-store-key', text: c.name }),
        el('div', { class: 'dt-store-val', text: c.value }),
        el('div', { class: 'dt-muted', text: `Domain: ${c.domain || ses.page.hostname} / Path: ${c.path || '/'} / Expires: ${c.expires || 'Session'}` }),
        flags,
        el('button', { class: 'dt-mini danger', type: 'button', text: '削除', 'aria-label': `${c.name} を削除`, onclick: () => ses.removeCookie(c.name) }),
      ]));
    }
    pane.appendChild(el('div', { class: 'dt-hint', text: 'HttpOnly が ✓ の Cookie は JavaScript（document.cookie）から読めません。Secure は HTTPS でのみ送信、SameSite は他サイトからの送信の制限です。' }));
  }
  host.appendChild(pane);
}
