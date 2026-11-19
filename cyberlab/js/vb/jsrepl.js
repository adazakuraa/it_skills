// ============================================================
// Console 用の安全な実行系。実ブラウザの eval/Function は使わず、
// 許可したオブジェクト(document / localStorage / location など)だけを操作できる。
// プロトタイプ経由の脱出(__proto__ / constructor / prototype)は遮断する。
// ============================================================
import * as H from './html.js';
import { parse, ParseError } from './jsparse.js';

export class ReplError extends Error { constructor(name, msg) { super(msg); this.errName = name; } }
const E = (name, msg) => new ReplError(name, msg);
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__']);
const MAX_STEPS = 60000, MAX_DEPTH = 40;

// ---------- 値クラス ----------
export class El { constructor(node) { this.node = node; } }
class NodeListV extends Array {}
class Host { get() { return undefined; } set(k) { throw E('TypeError', `Cannot set property '${k}' of ${this.label()}`); } keys() { return []; } label() { return 'Object'; } }
class HostFn { constructor(name, fn) { this.name = name; this.fn = fn; } }
class Arrow { constructor(params, body, scope, src) { this.params = params; this.body = body; this.scope = scope; this.src = src; } }

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

// ---------- 文字列化・整形 ----------
export function toStr(v) {
  if (typeof v === 'string') return v;
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return v.map(x => (x === null || x === undefined ? '' : toStr(x))).join(',');
  if (v instanceof El) return `[object HTML${v.node.tag === 'a' ? 'Anchor' : 'Unknown'}Element]`;
  if (v instanceof Arrow) return v.src;
  if (v instanceof HostFn) return `function ${v.name}() { [native code] }`;
  if (v instanceof Host) return `[object ${v.label().split(' ')[0]}]`;
  if (isPlain(v)) return '[object Object]';
  return String(v);
}
const toNum = (v) => (typeof v === 'number' ? v : v instanceof El || v instanceof Host || isPlain(v) ? NaN : Number(v));
const truthy = (v) => !!v && !(typeof v === 'number' && Number.isNaN(v));

function quote(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  return q + s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(q === "'" ? /'/g : /"/g, '\\' + q) + q;
}
export function elLabel(n) {
  const a = Object.entries(n.attrs).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v.length > 40 ? v.slice(0, 40) + '…' : v}"`)).join('');
  const kids = n.children.length;
  return `<${n.tag}${a}>${kids ? '…' : ''}${['img', 'input', 'br', 'meta', 'link', 'hr'].includes(n.tag) ? '' : `</${n.tag}>`}`;
}
export function fmt(v, depth = 0) {
  let s;
  if (v === undefined) s = 'undefined';
  else if (v === null) s = 'null';
  else if (typeof v === 'string') s = quote(v);
  else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
  else if (v instanceof El) s = elLabel(v.node);
  else if (v instanceof NodeListV) s = `NodeList(${v.length}) [${v.slice(0, 6).map(x => fmt(x, depth + 1)).join(', ')}${v.length > 6 ? ', …' : ''}]`;
  else if (Array.isArray(v)) s = depth > 1 ? `Array(${v.length})` : `(${v.length}) [${v.slice(0, 20).map(x => fmt(x, depth + 1)).join(', ')}${v.length > 20 ? ', …' : ''}]`;
  else if (v instanceof Arrow) s = v.src;
  else if (v instanceof HostFn) s = `ƒ ${v.name}() { [native code] }`;
  else if (v instanceof Host) s = v.format ? v.format(depth, fmt) : v.label();
  else if (isPlain(v)) {
    const ks = Object.keys(v);
    s = depth > 1 ? 'Object' : ks.length ? `{${ks.slice(0, 20).map(k => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k)}: ${fmt(v[k], depth + 1)}`).join(', ')}${ks.length > 20 ? ', …' : ''}}` : '{}';
  } else s = String(v);
  return s.length > 600 ? s.slice(0, 600) + '…' : s;
}
const fmtLog = (args) => args.map(a => (typeof a === 'string' ? a : fmt(a))).join(' ');

// ---------- cookie ----------
export function cookieString(cookies) { return cookies.filter(c => !c.httpOnly).map(c => `${c.name}=${c.value}`).join('; '); }

// ---------- atob / btoa（実ブラウザと同じくバイナリ文字列） ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function btoaImpl(s) {
  let out = '';
  for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2);
    if (a > 255 || b > 255 || c > 255) throw E('InvalidCharacterError', "Failed to execute 'btoa': The string to be encoded contains characters outside of the Latin1 range.");
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b || 0) >> 4)] + (Number.isNaN(b) ? '=' : B64[((b & 15) << 2) | ((c || 0) >> 6)]) + (Number.isNaN(c) ? '=' : B64[c & 63]);
  }
  return out;
}
function atobImpl(s) {
  s = s.replace(/[\t\n\f\r ]/g, '');
  if (s.length % 4 === 1 || /[^A-Za-z0-9+/=]/.test(s)) throw E('InvalidCharacterError', "Failed to execute 'atob' on 'Window': The string to be decoded is not correctly encoded.");
  s = s.replace(/=+$/, '');
  let out = '';
  for (let i = 0; i < s.length; i += 4) {
    const n = [0, 1, 2, 3].map(k => (i + k < s.length ? B64.indexOf(s[i + k]) : -1));
    out += String.fromCharCode((n[0] << 2) | (n[1] >> 4));
    if (n[2] >= 0) out += String.fromCharCode(((n[1] & 15) << 4) | (n[2] >> 2));
    if (n[3] >= 0) out += String.fromCharCode(((n[2] & 3) << 6) | n[3]);
  }
  return out;
}

const ATTR_PROPS = { href: 'href', src: 'src', action: 'action', method: 'method', name: 'name', type: 'type', value: 'value', placeholder: 'placeholder', alt: 'alt', title: 'title', target: 'target', rel: 'rel', content: 'content', charset: 'charset', htmlFor: 'for', id: 'id', lang: 'lang', className: 'class' };
const BOOL_PROPS = { checked: 'checked', disabled: 'disabled', hidden: 'hidden', required: 'required', readOnly: 'readonly', selected: 'selected', async: 'async', defer: 'defer' };
const camel = (s) => s.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
const kebab = (s) => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

/**
 * Repl を生成する。host は仮想ブラウザのセッションが提供する:
 *  { root(), href(), userAgent, cookies[], local{}, session{}, globals{}, log(level,text), onDom(), onStorage(), onCookie() }
 */
export function createRepl(host) {
  const topScope = { vars: new Map(), parent: null };
  let steps = 0, depth = 0;
  const elCache = new Map();
  const wrap = (n) => { if (!n) return null; let w = elCache.get(n.uid); if (!w) { w = new El(n); elCache.set(n.uid, w); } return w; };
  const list = (nodes) => { const l = new NodeListV(); nodes.forEach(n => l.push(wrap(n))); return l; };
  const fn = (name, f) => new HostFn(name, f);
  const needEl = (v, what) => { if (!(v instanceof El)) throw E('TypeError', `${what} is not an Element`); return v.node; };
  const sel = (root, s) => { try { return H.querySelectorAll(root, toStr(s)); } catch (e) { throw E('SyntaxError', `Failed to execute 'querySelectorAll' on 'Document': ${e.message.replace('SyntaxError: ', '')}`); } };

  const base = () => new URL(host.href());
  const resolveUrl = (v) => { try { return new URL(v, base()).href; } catch { return v; } };

  // ---------- Style / Storage ----------
  class StyleHost extends Host {
    constructor(n) { super(); this.n = n; }
    label() { return 'CSSStyleDeclaration'; }
    get(k) { const s = H.styleOf(this.n); return s[kebab(k)] ?? ''; }
    set(k, v) {
      const s = H.styleOf(this.n); s[kebab(k)] = toStr(v);
      this.n.attrs.style = Object.entries(s).filter(([, x]) => x !== '').map(([a, b]) => `${a}: ${b}`).join('; '); host.onDom();
    }
    keys() { return Object.keys(H.styleOf(this.n)).map(camel); }
  }
  class StorageHost extends Host {
    constructor(name, data) { super(); this.nameV = name; this.data = data; }
    label() { return 'Storage'; }
    get(k) {
      if (k === 'length') return Object.keys(this.data).length;
      if (k === 'getItem') return fn('getItem', (t, a) => (Object.prototype.hasOwnProperty.call(this.data, toStr(a[0])) ? this.data[toStr(a[0])] : null));
      if (k === 'setItem') return fn('setItem', (t, a) => { this.data[toStr(a[0])] = toStr(a[1]); host.onStorage(); });
      if (k === 'removeItem') return fn('removeItem', (t, a) => { delete this.data[toStr(a[0])]; host.onStorage(); });
      if (k === 'clear') return fn('clear', () => { for (const x of Object.keys(this.data)) delete this.data[x]; host.onStorage(); });
      if (k === 'key') return fn('key', (t, a) => Object.keys(this.data)[toNum(a[0])] ?? null);
      return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : undefined;
    }
    set(k, v) { this.data[k] = toStr(v); host.onStorage(); }
    keys() { return Object.keys(this.data); }
    format(d, f) { const ks = Object.keys(this.data); return `Storage {${ks.slice(0, 12).map(k => `${k}: ${f(this.data[k], 2)}`).join(', ')}${ks.length ? ', ' : ''}length: ${ks.length}}`; }
  }

  // ---------- Document / Location / Navigator / Window / Console ----------
  const docQuery = (root) => ({
    querySelector: fn('querySelector', (t, a) => wrap(H.querySelector(root, toStr(a[0])))),
    querySelectorAll: fn('querySelectorAll', (t, a) => list(sel(root, a[0]))),
  });
  class DocumentHost extends Host {
    label() { return '#document'; }
    format() { return '#document'; }
    get(k) {
      const root = host.root();
      const html = () => H.querySelector(root, 'html'), q = (s) => H.querySelector(root, s);
      switch (k) {
        case 'title': { const t = q('title'); return t ? H.textContent(t).trim() : ''; }
        case 'cookie': return cookieString(host.cookies);
        case 'URL': case 'documentURI': return host.href();
        case 'domain': return base().hostname;
        case 'referrer': return '';
        case 'readyState': return 'complete';
        case 'characterSet': case 'charset': return 'UTF-8';
        case 'contentType': return 'text/html';
        case 'documentElement': return wrap(html());
        case 'body': return wrap(q('body'));
        case 'head': return wrap(q('head'));
        case 'forms': return list(H.querySelectorAll(root, 'form'));
        case 'links': return list(H.querySelectorAll(root, 'a[href], area[href]'));
        case 'scripts': return list(H.querySelectorAll(root, 'script'));
        case 'images': return list(H.querySelectorAll(root, 'img'));
        case 'querySelector': case 'querySelectorAll': return docQuery(root)[k];
        case 'getElementById': return fn('getElementById', (t, a) => wrap(q('#' + toStr(a[0]).replace(/[^\w-]/g, '')) || H.allNodes(root).find(n => n.t === 'el' && n.attrs.id === toStr(a[0])) || null));
        case 'getElementsByTagName': return fn('getElementsByTagName', (t, a) => list(H.querySelectorAll(root, toStr(a[0]) === '*' ? '*' : toStr(a[0]).replace(/[^\w-]/g, ''))));
        case 'getElementsByClassName': return fn('getElementsByClassName', (t, a) => list(H.querySelectorAll(root, '.' + toStr(a[0]).replace(/[^\w-]/g, ''))));
        case 'getElementsByName': return fn('getElementsByName', (t, a) => list(H.allNodes(root).filter(n => n.t === 'el' && n.attrs.name === toStr(a[0]))));
        default: return undefined;
      }
    }
    set(k, v) {
      if (k === 'title') {
        let t = H.querySelector(host.root(), 'title');
        if (!t) { const h = H.querySelector(host.root(), 'head'); if (!h) return; t = { t: 'el', tag: 'title', attrs: {}, children: [], parent: h, uid: H.nextUid() }; h.children.push(t); }
        t.children = [{ t: 'text', text: toStr(v), parent: t, uid: H.nextUid(), raw: true }]; host.onDom(); return;
      }
      if (k === 'cookie') {
        const parts = toStr(v).split(';').map(s => s.trim());
        const [name, ...rest] = parts[0].split('=');
        if (!name) return;
        const attrs = parts.slice(1).map(s => s.toLowerCase());
        if (attrs.includes('httponly')) return; // JavaScriptからHttpOnly属性付きのCookieは作れない
        const val = rest.join('=');
        const ex = host.cookies.find(c => c.name === name.trim());
        if (ex && ex.httpOnly) return; // HttpOnlyのCookieはJavaScriptから上書きできない
        const exp = parts.slice(1).find(s => /^expires=/i.test(s) || /^max-age=/i.test(s));
        if (ex) { ex.value = val; } else host.cookies.push({ name: name.trim(), value: val, domain: base().hostname, path: '/', expires: exp ? exp.split('=')[1] : 'Session', httpOnly: false, secure: attrs.includes('secure'), sameSite: (attrs.find(a => a.startsWith('samesite=')) || '').split('=')[1] || '' });
        host.onCookie(); return;
      }
      super.set(k);
    }
  }
  class LocationHost extends Host {
    label() { return 'Location'; }
    format() { return `Location {href: ${quote(host.href())}, origin: ${quote(base().origin)}, pathname: ${quote(base().pathname)}, …}`; }
    get(k) {
      const u = base();
      if (k === 'href') return u.href;
      if (['origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash'].includes(k)) return u[k];
      if (k === 'toString') return fn('toString', () => u.href);
      return undefined;
    }
  }
  class NavigatorHost extends Host {
    label() { return 'Navigator'; }
    get(k) {
      return ({ userAgent: host.userAgent, language: 'ja-JP', languages: ['ja-JP', 'ja', 'en-US'], platform: 'Linux armv81', onLine: true, cookieEnabled: true, hardwareConcurrency: 8, maxTouchPoints: 5, webdriver: false, vendor: 'Google Inc.' })[k];
    }
  }
  class ConsoleHost extends Host {
    label() { return 'console'; }
    get(k) {
      if (['log', 'info', 'warn', 'error', 'debug'].includes(k)) return fn(k, (t, a) => { host.log(k === 'debug' ? 'log' : k, fmtLog(a)); });
      if (k === 'clear') return fn('clear', () => host.log('clear', ''));
      if (k === 'table') return fn('table', (t, a) => { host.log('log', fmtLog(a)); });
      return undefined;
    }
  }
  const documentH = new DocumentHost(), locationH = new LocationHost(), navigatorH = new NavigatorHost(), consoleH = new ConsoleHost();
  const localH = new StorageHost('localStorage', host.local), sessionH = new StorageHost('sessionStorage', host.session);
  class WindowHost extends Host {
    label() { return 'Window'; }
    format() { return 'Window {window: Window, self: Window, document: document, location: Location, …}'; }
    get(k) {
      const b = builtin(k); if (b !== undefined) return b;
      return Object.prototype.hasOwnProperty.call(host.globals, k) ? host.globals[k] : undefined;
    }
    set(k, v) { if (BLOCKED.has(k)) return; host.globals[k] = v; }
    keys() { return Object.keys(host.globals); }
  }
  const windowH = new WindowHost();

  // ---------- 静的ビルトイン ----------
  const ObjectNS = new (class extends Host {
    label() { return 'Object'; }
    get(k) {
      const keysOf = (o) => (o instanceof Host ? o.keys() : Array.isArray(o) ? o.map((x, i) => String(i)) : isPlain(o) ? Object.keys(o) : o instanceof El ? [] : typeof o === 'string' ? [...o].map((x, i) => String(i)) : []);
      const valOf = (o, k2) => (o instanceof Host ? o.get(k2) : o[k2]);
      if (k === 'keys') return fn('keys', (t, a) => keysOf(a[0]));
      if (k === 'values') return fn('values', (t, a) => keysOf(a[0]).map(x => valOf(a[0], x)));
      if (k === 'entries') return fn('entries', (t, a) => keysOf(a[0]).map(x => [x, valOf(a[0], x)]));
      return undefined;
    }
  })();
  const ArrayNS = new (class extends Host {
    label() { return 'Array'; }
    get(k) {
      if (k === 'isArray') return fn('isArray', (t, a) => Array.isArray(a[0]));
      if (k === 'from') return fn('from', (t, a) => {
        const v = a[0];
        const arr = Array.isArray(v) ? [...v] : typeof v === 'string' ? [...v] : v instanceof Host ? v.keys().map(x => v.get(x)) : [];
        return a[1] ? arr.map((x, i) => callFn(a[1], undefined, [x, i])) : arr;
      });
      return undefined;
    }
  })();
  const JSONNS = new (class extends Host {
    label() { return 'JSON'; }
    get(k) {
      if (k === 'parse') return fn('parse', (t, a) => { try { return JSON.parse(toStr(a[0])); } catch (e) { throw E('SyntaxError', e.message); } });
      if (k === 'stringify') return fn('stringify', (t, a) => {
        const plain = (v, d) => {
          if (d > 8) return undefined;
          if (v === undefined || v instanceof Arrow || v instanceof HostFn) return undefined;
          if (v === null || typeof v !== 'object') return v;
          if (v instanceof El || v instanceof Host) return v instanceof StorageHost ? Object.fromEntries(v.keys().map(x => [x, v.get(x)])) : {};
          if (Array.isArray(v)) return v.map(x => plain(x, d + 1) ?? null);
          const o = {}; for (const x of Object.keys(v)) { const p = plain(v[x], d + 1); if (p !== undefined) o[x] = p; } return o;
        };
        const sp = a[2] === undefined ? undefined : Math.min(8, toNum(a[2]) || 0);
        return JSON.stringify(plain(a[0], 0), null, sp);
      });
      return undefined;
    }
  })();
  const MathNS = new (class extends Host {
    label() { return 'Math'; }
    get(k) {
      const m1 = { floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, sqrt: Math.sqrt, trunc: Math.trunc, log: Math.log, sign: Math.sign };
      if (m1[k]) return fn(k, (t, a) => m1[k](toNum(a[0])));
      if (k === 'max' || k === 'min') return fn(k, (t, a) => Math[k](...a.map(toNum)));
      if (k === 'pow') return fn('pow', (t, a) => Math.pow(toNum(a[0]), toNum(a[1])));
      if (k === 'random') return fn('random', () => 0.5);
      if (k === 'PI') return Math.PI;
      return undefined;
    }
  })();
  const GLOBAL_FNS = {
    atob: (t, a) => atobImpl(toStr(a[0])), btoa: (t, a) => btoaImpl(toStr(a[0])),
    parseInt: (t, a) => { const r = a[1] === undefined ? undefined : toNum(a[1]); return parseInt(toStr(a[0]), r); },
    parseFloat: (t, a) => parseFloat(toStr(a[0])), isNaN: (t, a) => Number.isNaN(toNum(a[0])),
    encodeURIComponent: (t, a) => encodeURIComponent(toStr(a[0])), decodeURIComponent: (t, a) => { try { return decodeURIComponent(toStr(a[0])); } catch { throw E('URIError', 'URI malformed'); } },
    encodeURI: (t, a) => encodeURI(toStr(a[0])), String: (t, a) => toStr(a[0]), Number: (t, a) => toNum(a[0]), Boolean: (t, a) => truthy(a[0]),
    $: (t, a) => wrap(H.querySelector(host.root(), toStr(a[0]))), $$: (t, a) => list(sel(host.root(), a[0])),
  };
  const builtins = {
    document: documentH, window: windowH, self: windowH, globalThis: windowH, location: locationH, navigator: navigatorH, console: consoleH,
    localStorage: localH, sessionStorage: sessionH, Object: ObjectNS, Array: ArrayNS, JSON: JSONNS, Math: MathNS, NaN, Infinity,
  };
  for (const [n, f] of Object.entries(GLOBAL_FNS)) builtins[n] = fn(n, f);
  function builtin(name) { return Object.prototype.hasOwnProperty.call(builtins, name) ? builtins[name] : undefined; }

  // ---------- 文字列/配列/数値メソッド ----------
  const argN = (a, i, d) => (a[i] === undefined ? d : toNum(a[i]));
  const STR = {
    split: (s, a) => (a[0] === undefined ? [s] : s.split(toStr(a[0]), a[1] === undefined ? undefined : toNum(a[1]))),
    slice: (s, a) => s.slice(argN(a, 0, 0), a[1] === undefined ? undefined : toNum(a[1])),
    substring: (s, a) => s.substring(argN(a, 0, 0), a[1] === undefined ? undefined : toNum(a[1])),
    substr: (s, a) => s.substr(argN(a, 0, 0), a[1] === undefined ? undefined : toNum(a[1])),
    toUpperCase: (s) => s.toUpperCase(), toLowerCase: (s) => s.toLowerCase(), trim: (s) => s.trim(), trimStart: (s) => s.trimStart(), trimEnd: (s) => s.trimEnd(),
    includes: (s, a) => s.includes(toStr(a[0])), indexOf: (s, a) => s.indexOf(toStr(a[0])), lastIndexOf: (s, a) => s.lastIndexOf(toStr(a[0])),
    startsWith: (s, a) => s.startsWith(toStr(a[0])), endsWith: (s, a) => s.endsWith(toStr(a[0])),
    replace: (s, a) => s.replace(toStr(a[0]), () => toStr(a[1])), replaceAll: (s, a) => s.split(toStr(a[0])).join(toStr(a[1])),
    charAt: (s, a) => s.charAt(argN(a, 0, 0)), charCodeAt: (s, a) => s.charCodeAt(argN(a, 0, 0)), at: (s, a) => s.at(argN(a, 0, 0)),
    padStart: (s, a) => s.padStart(Math.min(200, argN(a, 0, 0)), a[1] === undefined ? ' ' : toStr(a[1])), padEnd: (s, a) => s.padEnd(Math.min(200, argN(a, 0, 0)), a[1] === undefined ? ' ' : toStr(a[1])),
    repeat: (s, a) => s.repeat(Math.min(500, Math.max(0, argN(a, 0, 0)))), concat: (s, a) => s + a.map(toStr).join(''), toString: (s) => s,
  };
  const ARR = {
    map: (r, a) => r.map((x, i) => callFn(a[0], undefined, [x, i, r])), filter: (r, a) => r.filter((x, i) => truthy(callFn(a[0], undefined, [x, i, r]))),
    forEach: (r, a) => { r.forEach((x, i) => callFn(a[0], undefined, [x, i, r])); }, find: (r, a) => r.find((x, i) => truthy(callFn(a[0], undefined, [x, i, r]))),
    findIndex: (r, a) => r.findIndex((x, i) => truthy(callFn(a[0], undefined, [x, i, r]))), some: (r, a) => r.some((x, i) => truthy(callFn(a[0], undefined, [x, i, r]))),
    every: (r, a) => r.every((x, i) => truthy(callFn(a[0], undefined, [x, i, r]))), join: (r, a) => r.map(x => (x === null || x === undefined ? '' : toStr(x))).join(a[0] === undefined ? ',' : toStr(a[0])),
    slice: (r, a) => r.slice(argN(a, 0, 0), a[1] === undefined ? undefined : toNum(a[1])), concat: (r, a) => r.concat(...a.map(x => (Array.isArray(x) ? [...x] : [x]))),
    includes: (r, a) => r.includes(a[0]), indexOf: (r, a) => r.indexOf(a[0]), at: (r, a) => r.at(argN(a, 0, 0)), push: (r, a) => r.push(...a), pop: (r) => r.pop(),
    reverse: (r) => r.reverse(), reduce: (r, a) => (a.length > 1 ? r.reduce((acc, x, i) => callFn(a[0], undefined, [acc, x, i, r]), a[1]) : r.reduce((acc, x, i) => callFn(a[0], undefined, [acc, x, i, r]))),
    sort: (r, a) => r.sort(a[0] === undefined ? (x, y) => (toStr(x) < toStr(y) ? -1 : toStr(x) > toStr(y) ? 1 : 0) : (x, y) => toNum(callFn(a[0], undefined, [x, y]))),
    flat: (r) => r.flat(), toString: (r) => toStr(r),
  };
  const NUM = { toFixed: (n, a) => n.toFixed(Math.min(20, Math.max(0, argN(a, 0, 0)))), toString: (n, a) => n.toString(a[0] === undefined ? 10 : toNum(a[0])) };

  // ---------- Element ----------
  function elGet(el, k) {
    const n = el.node;
    if (k === 'tagName' || k === 'nodeName') return n.tag.toUpperCase();
    if (k === 'localName') return n.tag;
    if (ATTR_PROPS[k]) { const a = ATTR_PROPS[k]; const v = n.attrs[a]; if (v === undefined) return ''; return (k === 'href' || k === 'src' || k === 'action') ? resolveUrl(v) : v; }
    if (BOOL_PROPS[k]) return n.attrs[BOOL_PROPS[k]] !== undefined;
    switch (k) {
      case 'textContent': return H.textContent(n);
      case 'innerText': return H.innerText(n);
      case 'innerHTML': return H.innerHTML(n);
      case 'outerHTML': return H.outerHTML(n);
      case 'children': return list(n.children.filter(c => c.t === 'el'));
      case 'childElementCount': return n.children.filter(c => c.t === 'el').length;
      case 'firstElementChild': return wrap(n.children.find(c => c.t === 'el') || null);
      case 'lastElementChild': return wrap([...n.children].reverse().find(c => c.t === 'el') || null);
      case 'parentElement': case 'parentNode': return n.parent && n.parent.tag !== '#document' ? wrap(n.parent) : null;
      case 'nextElementSibling': { const s = (n.parent ? n.parent.children : []).filter(c => c.t === 'el'); return wrap(s[s.indexOf(n) + 1] || null); }
      case 'previousElementSibling': { const s = (n.parent ? n.parent.children : []).filter(c => c.t === 'el'); return wrap(s[s.indexOf(n) - 1] || null); }
      case 'classList': return Object.assign((n.attrs.class || '').split(/\s+/).filter(Boolean), {});
      case 'attributes': return Object.entries(n.attrs).map(([name, value]) => ({ name, value }));
      case 'dataset': { const o = {}; for (const [a, v] of Object.entries(n.attrs)) if (a.startsWith('data-')) o[camel(a.slice(5))] = v; return o; }
      case 'style': return new StyleHost(n);
      case 'getAttribute': return fn('getAttribute', (t, a) => (n.attrs[toStr(a[0]).toLowerCase()] ?? null));
      case 'setAttribute': return fn('setAttribute', (t, a) => { n.attrs[toStr(a[0]).toLowerCase()] = toStr(a[1]); host.onDom(); });
      case 'removeAttribute': return fn('removeAttribute', (t, a) => { delete n.attrs[toStr(a[0]).toLowerCase()]; host.onDom(); });
      case 'hasAttribute': return fn('hasAttribute', (t, a) => n.attrs[toStr(a[0]).toLowerCase()] !== undefined);
      case 'getAttributeNames': return fn('getAttributeNames', () => Object.keys(n.attrs));
      case 'querySelector': return fn('querySelector', (t, a) => wrap(H.querySelector(n, toStr(a[0]))));
      case 'querySelectorAll': return fn('querySelectorAll', (t, a) => list(sel(n, a[0])));
      case 'closest': return fn('closest', (t, a) => wrap(H.closest(n, toStr(a[0]))));
      case 'matches': return fn('matches', (t, a) => H.matches(n, toStr(a[0])));
      case 'remove': return fn('remove', () => { H.removeNode(n); host.onDom(); });
      case 'click': return fn('click', () => { host.log('log', `click() → ${H.openTag(n)}`); });
      case 'contains': return fn('contains', (t, a) => { for (let x = a[0] instanceof El ? a[0].node : null; x; x = x.parent) if (x === n) return true; return false; });
      default: return undefined;
    }
  }
  function elSet(el, k, v) {
    const n = el.node;
    if (ATTR_PROPS[k]) { n.attrs[ATTR_PROPS[k]] = toStr(v); host.onDom(); return; }
    if (BOOL_PROPS[k]) { if (truthy(v)) n.attrs[BOOL_PROPS[k]] = ''; else delete n.attrs[BOOL_PROPS[k]]; host.onDom(); return; }
    if (k === 'textContent' || k === 'innerText') { n.children = [{ t: 'text', text: toStr(v), parent: n, uid: H.nextUid() }]; host.onDom(); return; }
    if (k === 'innerHTML') {
      const frag = H.parseHtml(toStr(v));
      n.children = frag.children; n.children.forEach(c => { c.parent = n; }); host.onDom(); return;
    }
    throw E('TypeError', `Cannot set property '${k}' of ${elLabel(n)}`);
  }

  // ---------- プロパティ取得/設定/呼び出し ----------
  function getProp(obj, key, describe) {
    if (obj === null || obj === undefined) throw E('TypeError', `Cannot read properties of ${obj === null ? 'null' : 'undefined'} (reading '${String(key)}')`);
    key = typeof key === 'number' ? String(key) : key;
    if (typeof key !== 'string') key = toStr(key);
    if (BLOCKED.has(key)) return undefined;
    if (typeof obj === 'string') {
      if (key === 'length') return obj.length;
      if (/^\d+$/.test(key)) return obj[Number(key)];
      return STR[key] ? fn(key, (t, a) => STR[key](obj, a)) : undefined;
    }
    if (typeof obj === 'number') return NUM[key] ? fn(key, (t, a) => NUM[key](obj, a)) : undefined;
    if (typeof obj === 'boolean') return undefined;
    if (obj instanceof El) return elGet(obj, key);
    if (obj instanceof Host) return obj.get(key);
    if (Array.isArray(obj)) {
      if (key === 'length') return obj.length;
      if (/^\d+$/.test(key)) return obj[Number(key)];
      if (obj.__classList && key === 'contains') return undefined;
      if (key === 'item' && obj instanceof NodeListV) return fn('item', (t, a) => obj[toNum(a[0])] ?? null);
      if (key === 'contains' && !ARR.contains) return fn('contains', (t, a) => obj.includes(toStr(a[0])));
      return ARR[key] ? fn(key, (t, a) => ARR[key](obj, a)) : undefined;
    }
    if (isPlain(obj)) return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    return undefined;
  }
  function setProp(obj, key, val) {
    if (obj === null || obj === undefined) throw E('TypeError', `Cannot set properties of ${obj === null ? 'null' : 'undefined'} (setting '${String(key)}')`);
    key = typeof key === 'string' ? key : toStr(key);
    if (BLOCKED.has(key)) return;
    if (obj instanceof El) return elSet(obj, key, val);
    if (obj instanceof Host) return obj.set(key, val);
    if (Array.isArray(obj)) { if (/^\d+$/.test(key)) obj[Number(key)] = val; return; }
    if (isPlain(obj)) { obj[key] = val; }
  }
  function callFn(f, thisVal, args, text) {
    if (f instanceof HostFn) return f.fn(thisVal, args);
    if (f instanceof Arrow) {
      if (++depth > MAX_DEPTH) { depth = 0; throw E('RangeError', 'Maximum call stack size exceeded'); }
      try {
        const scope = { vars: new Map(), parent: f.scope };
        f.params.forEach((p, i) => scope.vars.set(p, { v: args[i], c: false }));
        return ev(f.body, scope);
      } finally { depth--; }
    }
    throw E('TypeError', `${text || toStr(f)} is not a function`);
  }

  // ---------- 評価 ----------
  const lookup = (name, scope) => {
    for (let s = scope; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name).v;
    const b = builtin(name); if (b !== undefined) return b;
    if (Object.prototype.hasOwnProperty.call(host.globals, name)) return host.globals[name];
    throw E('ReferenceError', `${name} is not defined`);
  };
  const looseEq = (a, b) => {
    const prim = (x) => x === null || x === undefined || typeof x !== 'object' && typeof x !== 'function';
    if (prim(a) && prim(b)) return a == b; // eslint-disable-line eqeqeq
    return a === b;
  };
  function ev(n, scope) {
    if (++steps > MAX_STEPS) throw E('RangeError', '実行ステップ数の上限を超えました');
    switch (n.k) {
      case 'num': case 'str': return n.v;
      case 'lit': return n.v;
      case 'group': return ev(n.e, scope);
      case 'tpl': return n.quasis.reduce((acc, q, i) => acc + q + (i < n.exprs.length ? toStr(ev(n.exprs[i], scope)) : ''), '');
      case 'array': return n.items.map(x => ev(x, scope));
      case 'object': { const o = {}; for (const p of n.props) if (!BLOCKED.has(p.key)) o[p.key] = ev(p.value, scope); return o; }
      case 'id': return lookup(n.name, scope);
      case 'member': { const o = ev(n.obj, scope); if (n.optional && (o === null || o === undefined)) return undefined; return getProp(o, n.name); }
      case 'index': { const o = ev(n.obj, scope); if (n.optional && (o === null || o === undefined)) return undefined; return getProp(o, ev(n.idx, scope)); }
      case 'call': {
        let thisVal, f;
        if (n.callee.k === 'member' || n.callee.k === 'index') {
          thisVal = ev(n.callee.obj, scope);
          if (n.callee.optional && (thisVal === null || thisVal === undefined)) return undefined;
          f = getProp(thisVal, n.callee.k === 'member' ? n.callee.name : ev(n.callee.idx, scope));
        } else f = ev(n.callee, scope);
        if (n.optional && (f === null || f === undefined)) return undefined;
        const text = n.src ? n.src : undefined;
        return callFn(f, thisVal, n.args.map(a => ev(a, scope)), calleeText(n.callee));
      }
      case 'arrow': return new Arrow(n.params, n.body, scope, srcSlice(n));
      case 'unary': {
        if (n.op === 'typeof') { let v; try { v = ev(n.e, scope); } catch (e) { if (e instanceof ReplError && e.errName === 'ReferenceError') return 'undefined'; throw e; } return v === null ? 'object' : (v instanceof Arrow || v instanceof HostFn) ? 'function' : typeof v === 'object' || v instanceof Host ? 'object' : typeof v; }
        const v = ev(n.e, scope);
        return n.op === '!' ? !truthy(v) : n.op === '-' ? -toNum(v) : toNum(v);
      }
      case 'bin': {
        if (n.op === '&&') { const l = ev(n.l, scope); return truthy(l) ? ev(n.r, scope) : l; }
        if (n.op === '||') { const l = ev(n.l, scope); return truthy(l) ? l : ev(n.r, scope); }
        if (n.op === '??') { const l = ev(n.l, scope); return l === null || l === undefined ? ev(n.r, scope) : l; }
        const l = ev(n.l, scope), r = ev(n.r, scope);
        switch (n.op) {
          case '+': return typeof l === 'string' || typeof r === 'string' || typeof l === 'object' && l !== null || typeof r === 'object' && r !== null ? toStr(l) + toStr(r) : toNum(l) + toNum(r);
          case '-': return toNum(l) - toNum(r);
          case '*': return toNum(l) * toNum(r);
          case '%': return toNum(l) % toNum(r);
          case '===': return l === r;
          case '!==': return l !== r;
          case '==': return looseEq(l, r);
          case '!=': return !looseEq(l, r);
          case '<': return (typeof l === 'string' && typeof r === 'string') ? l < r : toNum(l) < toNum(r);
          case '>': return (typeof l === 'string' && typeof r === 'string') ? l > r : toNum(l) > toNum(r);
          case '<=': return (typeof l === 'string' && typeof r === 'string') ? l <= r : toNum(l) <= toNum(r);
          default: return (typeof l === 'string' && typeof r === 'string') ? l >= r : toNum(l) >= toNum(r);
        }
      }
      case 'cond': return truthy(ev(n.c, scope)) ? ev(n.a, scope) : ev(n.b, scope);
      case 'assign': return assign(n, scope);
      default: throw E('SyntaxError', `未対応の式: ${n.k}`);
    }
  }
  let curSrc = '';
  const srcSlice = (n) => (n.s !== undefined && n.e !== undefined ? curSrc.slice(n.s, n.e) : 'ƒ');
  function calleeText(c) { return srcSlice(c) !== 'ƒ' ? srcSlice(c) : c.k === 'id' ? c.name : 'expression'; }
  function assign(n, scope) {
    const t = n.target;
    let val;
    const cur = () => (t.k === 'id' ? lookup(t.name, scope) : t.k === 'member' ? getProp(ev(t.obj, scope), t.name) : getProp(ev(t.obj, scope), ev(t.idx, scope)));
    if (n.op === '=') val = ev(n.value, scope);
    else { const a = cur(), b = ev(n.value, scope); val = n.op === '+=' ? (typeof a === 'string' || typeof b === 'string' ? toStr(a) + toStr(b) : toNum(a) + toNum(b)) : toNum(a) - toNum(b); }
    if (t.k === 'id') {
      for (let s = scope; s; s = s.parent) if (s.vars.has(t.name)) { const e = s.vars.get(t.name); if (e.c) throw E('TypeError', 'Assignment to constant variable.'); e.v = val; return val; }
      topScope.vars.set(t.name, { v: val, c: false }); return val;
    }
    const obj = ev(t.obj, scope);
    setProp(obj, t.k === 'member' ? t.name : ev(t.idx, scope), val);
    return val;
  }
  function execStmt(st) {
    if (st.k === 'decl') {
      if (topScope.vars.has(st.name) && topScope.vars.get(st.name).kind !== 'var' && st.kind !== 'var') { /* 再宣言はREPLでは許容 */ }
      topScope.vars.set(st.name, { v: st.init ? ev(st.init, topScope) : undefined, c: st.kind === 'const', kind: st.kind });
      return undefined;
    }
    return ev(st.e, topScope);
  }

  return {
    vars: topScope.vars,
    /** 1行(複数文可)を実行。{ ok, text, value } / { ok:false, name, message, text } */
    run(text) {
      steps = 0; depth = 0; curSrc = text;
      try {
        const prog = parse(text);
        let val;
        for (const st of prog) val = execStmt(st);
        return { ok: true, value: val, text: fmt(val) };
      } catch (e) {
        if (e instanceof ParseError || e instanceof ReplError) return { ok: false, name: e.errName, message: e.message, text: `Uncaught ${e.errName}: ${e.message}` };
        throw e;
      }
    },
    fmt, wrap,
  };
}
