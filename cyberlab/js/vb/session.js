// ============================================================
// 仮想ブラウザのセッション: 1ミッション分の「架空ページ」と DevTools の状態を保持する。
// 実際のネットワークには一切アクセスしない（すべてミッション定義のデータ）。
// def = { url, userAgent?, html, console[], network[], storage{local,session,cookies[]},
//         sources{path:text}, breakpoints{"file:line":{scope,stack}}, globals{}, security{}, issues[], perf{}, tabs[] }
// ============================================================
import * as H from './html.js';
import { createRepl, cookieString } from './jsrepl.js';

export const DEFAULT_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
export const ALL_TABS = ['elements', 'console', 'network', 'sources', 'application', 'security', 'performance'];
export const TAB_LABEL = { elements: 'Elements', console: 'Console', network: 'Network', sources: 'Sources', application: 'Application', security: 'Security', performance: 'Performance' };

const STATUS_TEXT = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };
export const THROTTLES = { none: { label: 'No throttling', f: 1 }, fast4g: { label: 'Fast 4G', f: 2 }, slow4g: { label: 'Slow 4G', f: 5 }, offline: { label: 'Offline', f: null } };

const clone = (o) => JSON.parse(JSON.stringify(o));

export function formatBytes(n) {
  if (n == null) return '-';
  if (n < 1000) return `${n} B`;
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)} kB`;
  return `${(n / 1e6).toFixed(1)} MB`;
}
export function formatMs(ms) { return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`; }

function guessType(r) {
  if (r.type) return r.type;
  const m = (r.mime || '').toLowerCase(), u = r.url.split('?')[0].toLowerCase();
  if (/html/.test(m) || /\.html?$/.test(u)) return 'document';
  if (/javascript/.test(m) || /\.m?js$/.test(u)) return 'script';
  if (/css/.test(m) || /\.css$/.test(u)) return 'stylesheet';
  if (/^image\//.test(m) || /\.(png|jpe?g|gif|webp|svg|ico)$/.test(u)) return 'img';
  if (/font/.test(m) || /\.(woff2?|ttf)$/.test(u)) return 'font';
  if (/json/.test(m)) return 'fetch';
  return 'other';
}

export function createSession(def) {
  const root = H.parseHtml(def.html || '<html><body></body></html>');
  const page = new URL(def.url);
  const ses = {
    def, root, page,
    tabs: def.tabs && def.tabs.length ? def.tabs : ALL_TABS,
    cookies: clone((def.storage && def.storage.cookies) || []),
    local: clone((def.storage && def.storage.local) || {}),
    session: clone((def.storage && def.storage.session) || {}),
    globals: clone(def.globals || {}),
    consoleLog: [],          // { level, text, source?, nav? }
    replHistory: [],         // 実行した式（デバッグ状態の判定に使う）
    state: { visited: new Set(['elements']), breakpoints: [], paused: null, pausedOnce: [], filtersUsed: new Set(), viewedRequests: new Set(), searches: [], throttle: 'none', domEdits: 0, storageEdits: 0, sourcesOpened: new Set(), prettyPrinted: new Set(), networkFilter: 'all' },
    listeners: new Set(),
    userAgent: def.userAgent || DEFAULT_UA,
    domVersion: 0,
  };
  const notify = (what) => { ses.domVersion++; for (const f of ses.listeners) f(what); };
  for (const m of (def.console || [])) ses.consoleLog.push({ level: m.level || 'log', text: m.text, source: m.source || null, nav: m.nav || null });

  // ---- ネットワーク: 正規化 ----
  ses.requests = (def.network || []).map((r, i) => {
    const u = new URL(r.url, page);
    const type = guessType(r);
    const name = (u.pathname.split('/').filter(Boolean).pop() || u.hostname) + (u.search && type === 'fetch' ? '' : '');
    return {
      id: r.id || `r${i + 1}`, idx: i, method: r.method || 'GET', url: u.href, host: u.host, path: u.pathname + u.search, name, type,
      status: r.failed ? 0 : (r.status ?? 200), statusText: r.failed ? '(failed)' : (r.statusText || STATUS_TEXT[r.status ?? 200] || ''),
      failed: r.failed || null, blocked: r.blocked || null, mime: r.mime || '', initiator: r.initiator || '', protocol: r.protocol || 'h2', remote: r.remote || '',
      size: r.size ?? 0, resourceSize: r.resourceSize ?? r.size ?? 0, time: r.time ?? 50, start: r.start ?? 0, fromCache: !!r.fromCache,
      reqHeaders: r.reqHeaders || {}, resHeaders: r.resHeaders || {}, reqBody: r.reqBody || '', resBody: r.resBody ?? '', note: r.note || '',
      params: [...u.searchParams.entries()],
      thirdParty: u.host !== page.host,
    };
  });

  // ---- 実行系(Console) ----
  const repl = createRepl({
    root: () => root, href: () => page.href, userAgent: ses.userAgent, cookies: ses.cookies, local: ses.local, session: ses.session, globals: ses.globals,
    log: (level, text) => { if (level === 'clear') ses.consoleLog.length = 0; else ses.consoleLog.push({ level, text, source: 'VM:1' }); notify('console'); },
    onDom: () => { ses.state.domEdits++; notify('dom'); }, onStorage: () => { ses.state.storageEdits++; notify('storage'); }, onCookie: () => { ses.state.storageEdits++; notify('storage'); },
  });
  ses.repl = repl;
  ses.runConsole = (text) => {
    const t = text.trim(); if (!t) return null;
    ses.replHistory.push(t);
    ses.consoleLog.push({ level: 'input', text: t });
    let r;
    try { r = repl.run(t); } catch (e) { r = { ok: false, name: 'Error', message: String(e && e.message || e), text: `Uncaught Error: ${e && e.message}` }; }
    ses.consoleLog.push({ level: r.ok ? 'result' : 'error', text: r.text, source: r.ok ? null : 'VM:1' });
    notify('console');
    return r;
  };

  // ---- Elements ----
  ses.isHidden = H.isHidden;
  ses.querySelector = (s) => { try { return H.querySelector(root, s); } catch { return null; } };
  ses.querySelectorAll = (s) => { try { return H.querySelectorAll(root, s); } catch { return []; } };
  ses.editAttr = (node, name, value) => { if (value === null) delete node.attrs[name]; else node.attrs[name] = value; ses.state.domEdits++; notify('dom'); };
  ses.setTitle = () => {};

  // ---- Cookie / Storage ----
  ses.documentCookie = () => cookieString(ses.cookies);
  ses.removeCookie = (name) => { ses.cookies = ses.cookies.filter(c => c.name !== name); ses.state.storageEdits++; notify('storage'); };
  ses.removeStorage = (kind, key) => { delete ses[kind][key]; ses.state.storageEdits++; notify('storage'); };

  // ---- Sources ----
  ses.sourceFiles = () => Object.keys(def.sources || {});
  ses.sourceText = (f) => (def.sources || {})[f] ?? '';
  ses.searchSources = (q, { regex = false, caseSensitive = false } = {}) => {
    const out = [];
    if (!q) return out;
    let re = null;
    if (regex) { if (q.length > 80) return out; try { re = new RegExp(q, caseSensitive ? '' : 'i'); } catch { return out; } }
    for (const f of ses.sourceFiles()) {
      const lines = ses.sourceText(f).split('\n');
      lines.forEach((l, i) => { const hit = re ? re.test(l) : (caseSensitive ? l.includes(q) : l.toLowerCase().includes(q.toLowerCase())); if (hit) out.push({ file: f, line: i + 1, text: l.trim().slice(0, 160) }); });
    }
    ses.state.searches.push(q);
    return out;
  };
  ses.toggleBreakpoint = (file, line) => {
    const i = ses.state.breakpoints.findIndex(b => b.file === file && b.line === line);
    if (i >= 0) { ses.state.breakpoints.splice(i, 1); if (ses.state.paused && ses.state.paused.file === file && ses.state.paused.line === line) ses.state.paused = null; notify('bp'); return null; }
    ses.state.breakpoints.push({ file, line });
    const hit = (def.breakpoints || {})[`${file}:${line}`];
    ses.state.paused = hit ? { file, line, scope: hit.scope || {}, stack: hit.stack || [], note: hit.note || '' } : null;
    if (hit) ses.state.pausedOnce.push({ file, line });
    notify('bp');
    return hit ? 'paused' : 'set';
  };
  ses.resume = () => { ses.state.paused = null; notify('bp'); };

  // ---- Network ----
  ses.throttledTime = (r) => { const f = THROTTLES[ses.state.throttle].f; return f == null ? null : r.time * f; };
  ses.networkSummary = () => {
    const f = THROTTLES[ses.state.throttle].f;
    if (f == null) return { count: ses.requests.length, transferred: 0, resources: 0, finish: null };
    let finish = 0, transferred = 0, resources = 0;
    for (const r of ses.requests) { finish = Math.max(finish, (r.start + r.time) * f); transferred += r.fromCache ? 0 : r.size; resources += r.resourceSize; }
    return { count: ses.requests.length, transferred, resources, finish };
  };

  // ---- Issues / Security / Performance ----
  ses.issues = () => {
    const list = [];
    const https = page.protocol === 'https:';
    for (const r of ses.requests) {
      if (https && r.url.startsWith('http://') && !r.blocked) list.push({ kind: 'mixed', severity: 'warning', title: `混在コンテンツ: HTTPSページが安全でないリソースを読み込んでいます`, detail: r.url, why: 'HTTPSのページ内にHTTPのリソースがあると、その部分は盗聴・改ざんされうる。ブラウザはスクリプトなどを自動でブロックする。' });
      if (r.blocked) list.push({ kind: r.blocked, severity: 'error', title: r.blocked === 'csp' ? 'Content Security Policy によりブロックされました' : r.blocked === 'cors' ? 'CORS ポリシーによりブロックされました' : 'ブロックされました', detail: r.url, why: r.note || '' });
    }
    for (const c of ses.cookies) {
      if (https && !c.secure) list.push({ kind: 'cookie', severity: 'warning', title: `Cookie '${c.name}' に Secure 属性がありません`, detail: c.name, why: 'Secure が無いCookieは、HTTP(暗号化されていない通信)でも送信されうる。' });
      if (!c.httpOnly && /sess|token|auth|sid/i.test(c.name)) list.push({ kind: 'cookie', severity: 'warning', title: `認証用らしい Cookie '${c.name}' に HttpOnly 属性がありません`, detail: c.name, why: 'HttpOnly が無いと、XSSなどでJavaScriptから読み取られて盗まれる恐れがある。' });
      if (!c.sameSite) list.push({ kind: 'cookie', severity: 'info', title: `Cookie '${c.name}' に SameSite 属性がありません`, detail: c.name, why: 'SameSite の指定が無いと、他サイトからのリクエストにCookieが付く挙動(CSRFの足がかり)になりうる。' });
    }
    for (const i of (def.issues || [])) list.push(i);
    return list;
  };
  ses.security = () => Object.assign({ https: page.protocol === 'https:', protocol: 'TLS 1.3', cert: null }, def.security || {});
  ses.perf = () => Object.assign({ fcp: null, lcp: null, cls: null, tbt: null, lcpElement: '' }, def.perf || {});

  ses.subscribe = (f) => { ses.listeners.add(f); return () => ses.listeners.delete(f); };
  ses.visit = (tab) => { ses.state.visited.add(tab); };
  return ses;
}
