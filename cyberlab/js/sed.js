// ============================================================
// 安全な sed エンジン（eval 不使用）。
// 対応: s///[g p i N], d, p, q, y///, a/i/c テキスト, =、
//       アドレス N / $ / /re/ / N,M / N,$ / /re/,/re/ / N,+K / 否定 !
//       複数コマンド(; または改行、-e 複数)、BRE/ERE、後方参照 \1..\9 と &
// 非対応(明示エラー): { } ブロック, ホールドスペース(h/g/x), n/N/D/P, w/r ファイル操作
// ============================================================
import { posixToJs } from './commands.js';

export class SedError extends Error {}

function readDelimited(src, i, delim, what) {
  // delim までを読む。\delim は delim 1文字に、それ以外の \x は保持
  let out = '';
  while (i < src.length && src[i] !== delim) {
    if (src[i] === '\\' && i + 1 < src.length) {
      if (src[i + 1] === delim) { out += delim; i += 2; continue; }
      out += src[i] + src[i + 1]; i += 2; continue;
    }
    out += src[i]; i++;
  }
  if (i >= src.length) throw new SedError(`${what} が閉じられていません`);
  return { text: out, next: i + 1 };
}

export function parseSed(script, ere) {
  const cmds = [];
  let i = 0;
  const ws = () => { while (i < script.length && (script[i] === ' ' || script[i] === '\t')) i++; };
  const readAddr = () => {
    const c = script[i];
    if (c >= '0' && c <= '9') { let j = i; while (/[0-9]/.test(script[j] || '')) j++; const n = Number(script.slice(i, j)); i = j; return { t: 'num', n }; }
    if (c === '$') { i++; return { t: 'last' }; }
    if (c === '/') {
      const r = readDelimited(script, i + 1, '/', 'アドレスの正規表現'); i = r.next;
      let flag = ''; if (script[i] === 'I') { flag = 'i'; i++; }
      return { t: 're', re: new RegExp(posixToJs(r.text, ere), flag) };
    }
    return null;
  };
  while (i < script.length) {
    while (i < script.length && /[\s;]/.test(script[i])) i++;
    if (i >= script.length) break;
    const cmd = { a1: null, a2: null, neg: false, c: '' };
    cmd.a1 = readAddr();
    if (cmd.a1 && script[i] === ',') {
      i++;
      if (script[i] === '+') { i++; let j = i; while (/[0-9]/.test(script[j] || '')) j++; cmd.a2 = { t: 'rel', n: Number(script.slice(i, j)) }; i = j; }
      else { cmd.a2 = readAddr(); if (!cmd.a2) throw new SedError('アドレス範囲の終端が不正です'); }
    }
    ws();
    while (script[i] === '!') { cmd.neg = true; i++; ws(); }
    const c = script[i++];
    if (c === undefined) throw new SedError('コマンドが不足しています');
    cmd.c = c;
    if (c === 's') {
      const delim = script[i++];
      if (!delim || delim === '\n' || delim === '\\') throw new SedError("s コマンドの区切り文字が不正です");
      const p = readDelimited(script, i, delim, 's の検索パターン'); i = p.next;
      const r = readDelimited(script, i, delim, 's の置換文字列'); i = r.next;
      let flags = '';
      while (i < script.length && !/[;\n}]/.test(script[i])) { if (script[i] !== ' ') flags += script[i]; i++; }
      cmd.g = flags.includes('g'); cmd.p = flags.includes('p'); const nm = flags.match(/\d+/); cmd.nth = nm ? Number(nm[0]) : 1;
      const bad = flags.replace(/[gpiI\d]/g, '');
      if (bad) throw new SedError(`s コマンドの未対応フラグ: ${bad}`);
      try { cmd.re = new RegExp(posixToJs(p.text, ere), 'g' + (/[iI]/.test(flags) ? 'i' : '')); } catch (e) { throw new SedError(`無効な正規表現: ${p.text}`); }
      cmd.repl = parseRepl(r.text);
    } else if (c === 'y') {
      const delim = script[i++];
      const a = readDelimited(script, i, delim, 'y のソース'); i = a.next;
      const b = readDelimited(script, i, delim, 'y の置換先'); i = b.next;
      const un = (t) => t.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
      cmd.src = [...un(a.text)]; cmd.dst = [...un(b.text)];
      if (cmd.src.length !== cmd.dst.length) throw new SedError('y: 文字列の長さが一致しません');
    } else if (c === 'a' || c === 'i' || c === 'c') {
      ws();
      if (script[i] === '\\') { i++; if (script[i] === '\n') i++; }
      let j = i; while (j < script.length && script[j] !== '\n') j++;
      cmd.text = script.slice(i, j); i = j;
    } else if (c === 'd' || c === 'p' || c === 'q' || c === '=') {
      if (c === 'q') { while (/[0-9 ]/.test(script[i] || '')) i++; }
    } else if (c === '{' || c === '}') {
      throw new SedError('{ } によるコマンドのグループ化はこのシミュレーターでは未対応です');
    } else if ('hHgGxnNDPwWrR'.includes(c)) {
      throw new SedError(`コマンド '${c}' はこのシミュレーターでは未対応です`);
    } else throw new SedError(`未知のコマンド: '${c}'`);
    cmds.push(cmd);
  }
  return cmds;
}

// 置換文字列 → [{lit}|{grp}]
function parseRepl(s) {
  const parts = []; let lit = '';
  const flush = () => { if (lit) { parts.push({ lit }); lit = ''; } };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const n = s[++i];
      if (/[0-9]/.test(n)) { flush(); parts.push({ grp: Number(n) }); }
      else if (n === 'n') lit += '\n'; else if (n === 't') lit += '\t'; else lit += n;
    } else if (c === '&') { flush(); parts.push({ grp: 0 }); }
    else lit += c;
  }
  flush(); return parts;
}
const expand = (parts, m) => parts.map(p => (p.lit !== undefined ? p.lit : (m[p.grp] ?? ''))).join('');

// 1ストリーム(行配列)を処理して出力行配列を返す
export function runSedLines(cmds, lines, { quiet = false } = {}) {
  const out = [];
  const state = cmds.map(() => ({ active: false, endLine: null }));
  const total = lines.length;
  let quit = false;
  for (let idx = 0; idx < total && !quit; idx++) {
    const ln = idx + 1; const isLast = ln === total;
    let ps = lines[idx]; let deleted = false; const appendQ = [];
    const test = (a) => (a.t === 'num' ? ln === a.n : a.t === 'last' ? isLast : a.re.test(ps));
    for (let ci = 0; ci < cmds.length && !deleted && !quit; ci++) {
      const c = cmds[ci], st = state[ci];
      let m;
      if (!c.a1) m = true;
      else if (!c.a2) m = test(c.a1);
      else if (!st.active) {
        m = test(c.a1);
        if (m) {
          if (c.a2.t === 'num') st.active = c.a2.n > ln;
          else if (c.a2.t === 'rel') { st.endLine = ln + c.a2.n; st.active = c.a2.n > 0; }
          else if (c.a2.t === 'last') st.active = !isLast;
          else st.active = true; // 正規表現は次行以降で終端判定
        }
      } else {
        m = true;
        if (c.a2.t === 'num') { if (ln >= c.a2.n) st.active = false; }
        else if (c.a2.t === 'rel') { if (ln >= st.endLine) st.active = false; }
        else if (c.a2.t === 'last') { if (isLast) st.active = false; }
        else if (c.a2.re.test(ps)) st.active = false;
      }
      if (c.neg) m = !m;
      if (!m) continue;
      switch (c.c) {
        case 's': {
          let count = 0, replaced = false;
          const re = c.re; re.lastIndex = 0;
          const res = ps.replace(re, (...a) => {
            count++;
            const mm = a.slice(0, a.findIndex((x) => typeof x === 'number'));
            if (count < c.nth || (!c.g && count > c.nth)) return mm[0];
            replaced = true; return expand(c.repl, mm);
          });
          if (replaced) { ps = res; if (c.p) out.push(ps); }
          break;
        }
        case 'd': deleted = true; break;
        case 'p': out.push(ps); break;
        case 'q': quit = true; break;
        case 'y': { const map = new Map(c.src.map((ch, k) => [ch, c.dst[k]])); ps = [...ps].map(ch => (map.has(ch) ? map.get(ch) : ch)).join(''); break; }
        case 'a': appendQ.push(c.text); break;
        case 'i': out.push(c.text); break;
        case 'c': { if (!c.a2 || !st.active) out.push(c.text); deleted = true; break; }
        case '=': out.push(String(ln)); break;
        default: break;
      }
    }
    if (!deleted && !quiet) out.push(ps);
    for (const t of appendQ) out.push(t);
  }
  return out;
}
