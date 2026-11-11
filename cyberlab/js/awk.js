// ============================================================
// 安全な AWK インタプリタ（eval / Function 不使用）。
// 対応: BEGIN/END, パターン/範囲パターン, 条件式, 連想配列, for/while/if,
//       print/printf, 正規表現, 主要な組み込み関数・変数。
// 非対応(明示エラー): getline, system, パイプ/ファイルへの出力, ユーザー定義関数
// ============================================================
import { posixToJs } from './commands.js';

export class AwkError extends Error {}

// ---------- 字句解析 ----------
const KEYWORDS = new Set(['BEGIN', 'END', 'if', 'else', 'while', 'for', 'in', 'do', 'break', 'continue', 'next', 'exit', 'delete', 'print', 'printf', 'getline', 'function', 'return']);
const BUILTIN_FUNCS = new Set(['length', 'substr', 'index', 'split', 'sub', 'gsub', 'match', 'sprintf', 'tolower', 'toupper', 'int', 'sqrt', 'exp', 'log', 'sin', 'cos', 'atan2', 'rand', 'srand', 'system']);
const OPS = ['**=', '&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '^=', '!~', '>>', '**'];

function lex(src) {
  const toks = [];
  let i = 0;
  const last = () => toks[toks.length - 1];
  const divAllowed = () => {
    const t = last();
    if (!t) return false;
    if (t.t === 'num' || t.t === 'str' || t.t === 'name' || t.t === 'regex' || t.t === 'func') return true;
    if (t.t === 'op') return t.v === ')' || t.v === ']' || t.v === '++' || t.v === '--';
    return false;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; continue; }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '\n') {
      // 継続可能な位置の改行は無視
      const t = last();
      if (!(t && t.t === 'op' && ['{', '&&', '||', ',', ';'].includes(t.v)) && !(t && t.t === 'kw' && ['else', 'do'].includes(t.v))) toks.push({ t: 'nl' });
      i++; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/);
      toks.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue;
    }
    if (c === '"') {
      let j = i + 1, out = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[j + 1];
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n === '\\' ? '\\' : n === '"' ? '"' : n === '/' ? '/' : '\\' + n;
          j += 2;
        } else { out += src[j]; j++; }
      }
      if (j >= src.length) throw new AwkError('syntax error: 文字列が閉じられていません');
      toks.push({ t: 'str', v: out }); i = j + 1; continue;
    }
    if (c === '/' && !divAllowed()) {
      let j = i + 1, out = '', inBr = false;
      while (j < src.length && (src[j] !== '/' || inBr)) {
        if (src[j] === '\n') throw new AwkError('syntax error: 正規表現が閉じられていません');
        if (src[j] === '\\' && j + 1 < src.length) { out += src[j] + src[j + 1]; j += 2; continue; }
        if (src[j] === '[') inBr = true; else if (src[j] === ']') inBr = false;
        out += src[j]; j++;
      }
      if (j >= src.length) throw new AwkError('syntax error: 正規表現が閉じられていません');
      toks.push({ t: 'regex', v: out }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j); i = j;
      if (KEYWORDS.has(w)) toks.push({ t: 'kw', v: w });
      else if (BUILTIN_FUNCS.has(w)) toks.push({ t: 'func', v: w });
      else toks.push({ t: 'name', v: w });
      continue;
    }
    let matched = null;
    for (const op of OPS) if (src.startsWith(op, i)) { matched = op; break; }
    if (!matched && '+-*/%^<>=!~?:,;(){}[]$'.includes(c)) matched = c;
    if (!matched) throw new AwkError(`syntax error: 未対応の文字 '${c}'（パイプ | や & は未対応です）`);
    const len = matched.length;
    if (matched === '**') matched = '^';
    if (matched === '**=') matched = '^=';
    toks.push({ t: 'op', v: matched }); i += len;
  }
  return toks;
}

// ---------- 構文解析 ----------
function parseProgram(src) {
  const toks = lex(src);
  let pos = 0;
  const peek = (o = 0) => toks[pos + o];
  const isOp = (v, o = 0) => { const t = toks[pos + o]; return t && t.t === 'op' && t.v === v; };
  const isKw = (v, o = 0) => { const t = toks[pos + o]; return t && t.t === 'kw' && t.v === v; };
  const fail = (m) => { throw new AwkError(`syntax error: ${m}`); };
  const expectOp = (v) => { if (!isOp(v)) fail(`'${v}' が必要です`); pos++; };
  const skipTerms = () => { while (peek() && (peek().t === 'nl' || isOp(';'))) pos++; };
  const skipNl = () => { while (peek() && peek().t === 'nl') pos++; };

  // ----- 式 -----
  let noGt = 0; // print 引数内では > を比較演算子にしない
  let noIn = 0; // for(... in ...) 判定用
  function parseExpr() { return parseTernary(); }
  function parseTernary() {
    const cond = parseOr();
    if (isOp('?')) {
      pos++; skipNl(); const a = parseTernary(); skipNl(); expectOp(':'); skipNl(); const b = parseTernary();
      return { k: 'cond', c: cond, a, b };
    }
    if (peek() && peek().t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '^='].includes(peek().v)) {
      if (!['var', 'field', 'index'].includes(cond.k)) fail('代入の左辺が不正です');
      const op = peek().v; pos++; skipNl();
      const rhs = parseTernary();
      return { k: 'assign', op, l: cond, r: rhs };
    }
    return cond;
  }
  function parseOr() { let l = parseAnd(); while (isOp('||')) { pos++; skipNl(); l = { k: 'or', l, r: parseAnd() }; } return l; }
  function parseAnd() { let l = parseIn(); while (isOp('&&')) { pos++; skipNl(); l = { k: 'and', l, r: parseIn() }; } return l; }
  function parseIn() {
    let l = parseMatch();
    while (!noIn && isKw('in')) { pos++; const t = peek(); if (!t || t.t !== 'name') fail('in の右辺は配列名です'); pos++; l = { k: 'in', key: l, arr: t.v }; }
    return l;
  }
  function parseMatch() {
    let l = parseRel();
    while (isOp('~') || isOp('!~')) { const neg = isOp('!~'); pos++; l = { k: 'match', neg, l, r: parseRel() }; }
    return l;
  }
  function parseRel() {
    const l = parseConcat();
    const t = peek();
    if (t && t.t === 'op' && ['<', '<=', '==', '!=', '>=', '>'].includes(t.v) && !(t.v === '>' && noGt)) {
      pos++; const r = parseConcat(); return { k: 'rel', op: t.v, l, r };
    }
    return l;
  }
  function startsOperand() {
    const t = peek();
    if (!t) return false;
    if (t.t === 'num' || t.t === 'str' || t.t === 'name' || t.t === 'func' || t.t === 'regex') return true;
    if (t.t === 'op') return ['$', '(', '!', '-', '+', '++', '--'].includes(t.v) && !['-', '+'].includes(t.v);
    return false;
  }
  function parseConcat() {
    let l = parseAdd();
    while (startsOperand() && !isKw('in')) { const r = parseAdd(); l = { k: 'concat', l, r }; }
    return l;
  }
  function parseAdd() {
    let l = parseMul();
    while (isOp('+') || isOp('-')) { const op = peek().v; pos++; l = { k: 'bin', op, l, r: parseMul() }; }
    return l;
  }
  function parseMul() {
    let l = parseUnary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = peek().v; pos++; l = { k: 'bin', op, l, r: parseUnary() }; }
    return l;
  }
  function parseUnary() {
    if (isOp('!')) { pos++; return { k: 'not', e: parseUnary() }; }
    if (isOp('-')) { pos++; return { k: 'neg', e: parseUnary() }; }
    if (isOp('+')) { pos++; return { k: 'pos', e: parseUnary() }; }
    return parsePow();
  }
  function parsePow() {
    const base = parsePostfix();
    if (isOp('^')) { pos++; const exp = parseUnaryForPow(); return { k: 'bin', op: '^', l: base, r: exp }; }
    return base;
  }
  function parseUnaryForPow() { if (isOp('-')) { pos++; return { k: 'neg', e: parseUnaryForPow() }; } const b = parsePostfix(); if (isOp('^')) { pos++; return { k: 'bin', op: '^', l: b, r: parseUnaryForPow() }; } return b; }
  function parsePostfix() {
    if (isOp('++') || isOp('--')) { const op = peek().v; pos++; const target = parsePrimary(); if (!['var', 'field', 'index'].includes(target.k)) fail('++/-- の対象が不正です'); return { k: 'incdec', op, pre: true, t: target }; }
    const e = parsePrimary();
    if ((isOp('++') || isOp('--')) && ['var', 'field', 'index'].includes(e.k)) { const op = peek().v; pos++; return { k: 'incdec', op, pre: false, t: e }; }
    return e;
  }
  function parsePrimary() {
    const t = peek();
    if (!t) fail('式が途中で終わっています');
    if (t.t === 'num') { pos++; return { k: 'num', v: t.v }; }
    if (t.t === 'str') { pos++; return { k: 'str', v: t.v }; }
    if (t.t === 'regex') { pos++; return { k: 'regex', v: t.v }; }
    if (t.t === 'op' && t.v === '$') { pos++; const e = parseFieldIndex(); return { k: 'field', e }; }
    if (t.t === 'op' && t.v === '(') {
      pos++; const saveGt = noGt, saveIn = noIn; noGt = 0; noIn = 0;
      const e = parseExpr(); noGt = saveGt; noIn = saveIn;
      if (isOp(',')) { // (i,j) in arr 用の多次元は未対応
        fail('カンマ区切りの添字は未対応です');
      }
      expectOp(')'); return { k: 'group', e };
    }
    if (t.t === 'func') {
      pos++;
      if (t.v === 'system') throw new AwkError('system() はこのシミュレーターでは未対応です（安全のため）');
      let args = [];
      if (isOp('(')) {
        pos++; const saveGt = noGt, saveIn = noIn; noGt = 0; noIn = 0;
        if (!isOp(')')) { args.push(parseExpr()); while (isOp(',')) { pos++; skipNl(); args.push(parseExpr()); } }
        noGt = saveGt; noIn = saveIn; expectOp(')');
      } else if (t.v !== 'length') fail(`${t.v} には括弧が必要です`);
      return { k: 'call', name: t.v, args };
    }
    if (t.t === 'kw' && t.v === 'getline') throw new AwkError('getline はこのシミュレーターでは未対応です');
    if (t.t === 'name') {
      pos++;
      if (isOp('[')) { pos++; const idx = parseExpr(); expectOp(']'); return { k: 'index', name: t.v, e: idx }; }
      return { k: 'var', name: t.v };
    }
    fail(`予期しないトークン '${t.v ?? t.t}'`);
  }
  function parseFieldIndex() {
    // $NF, $i, $(expr), $i++ は ($i)++ ではなく $(i++) になるが簡略化: 前置増減 or 一次式のみ
    if (isOp('++') || isOp('--')) return parsePostfix();
    if (isOp('-')) { pos++; return { k: 'neg', e: parseFieldIndex() }; }
    return parsePrimary();
  }

  // ----- 文 -----
  function parseSimpleOrBlock() {
    skipNl();
    return parseStmt();
  }
  function endStmt() {
    // 文の終端: ; 改行 } または EOF
    if (isOp(';') || (peek() && peek().t === 'nl')) { pos++; return; }
    if (!peek() || isOp('}')) return;
    fail(`文の終端が必要ですが '${peek().v ?? peek().t}' がありました`);
  }
  function parseBlock() {
    expectOp('{');
    const body = [];
    skipTerms();
    while (!isOp('}')) {
      if (!peek()) fail("'}' が必要です");
      body.push(parseStmt());
      skipTerms();
    }
    pos++;
    return { k: 'block', body };
  }
  function parsePrintArgs() {
    const saveGt = noGt; noGt = 1;
    const args = [];
    // print (a, b) 形式
    if (isOp('(')) {
      const save = pos;
      try {
        pos++; noGt = 0;
        const list = [parseExpr()];
        while (isOp(',')) { pos++; list.push(parseExpr()); }
        expectOp(')');
        if (!peek() || isOp(';') || isOp('}') || peek().t === 'nl' || isOp('>')) { noGt = saveGt; return list; }
      } catch (e) { /* 通常解析へ */ }
      pos = save; noGt = 1;
    }
    if (peek() && !isOp(';') && !isOp('}') && peek().t !== 'nl' && !isOp('>')) {
      args.push(parseExpr());
      while (isOp(',')) { pos++; skipNl(); args.push(parseExpr()); }
    }
    noGt = saveGt;
    return args;
  }
  function parseStmt() {
    const t = peek();
    if (!t) fail('文が途中で終わっています');
    if (isOp('{')) return parseBlock();
    if (t.t === 'kw') {
      if (t.v === 'if') {
        pos++; expectOp('('); const c = parseExpr(); expectOp(')');
        const then = parseSimpleOrBlock();
        // else の探索（; や改行を挟んでもよい）
        const save = pos; skipTerms();
        let els = null;
        if (isKw('else')) { pos++; els = parseSimpleOrBlock(); } else pos = save;
        return { k: 'if', c, then, els };
      }
      if (t.v === 'while') { pos++; expectOp('('); const c = parseExpr(); expectOp(')'); return { k: 'while', c, body: parseSimpleOrBlock() }; }
      if (t.v === 'do') { pos++; const body = parseSimpleOrBlock(); skipTerms(); if (!isKw('while')) fail("do に対応する while が必要です"); pos++; expectOp('('); const c = parseExpr(); expectOp(')'); return { k: 'do', c, body }; }
      if (t.v === 'for') {
        pos++; expectOp('(');
        if (peek() && peek().t === 'name' && isKw('in', 1) && peek(2) && peek(2).t === 'name' && isOp(')', 3)) {
          const v = peek().v, arr = peek(2).v; pos += 4;
          return { k: 'forin', v, arr, body: parseSimpleOrBlock() };
        }
        const init = isOp(';') ? null : parseStmtExprOnly(); expectOp(';');
        const c = isOp(';') ? null : parseExpr(); expectOp(';');
        const inc = isOp(')') ? null : parseStmtExprOnly(); expectOp(')');
        return { k: 'for', init, c, inc, body: parseSimpleOrBlock() };
      }
      if (t.v === 'break') { pos++; endStmt(); return { k: 'break' }; }
      if (t.v === 'continue') { pos++; endStmt(); return { k: 'continue' }; }
      if (t.v === 'next') { pos++; endStmt(); return { k: 'next' }; }
      if (t.v === 'exit') { pos++; let e = null; if (peek() && !isOp(';') && !isOp('}') && peek().t !== 'nl') e = parseExpr(); endStmt(); return { k: 'exit', e }; }
      if (t.v === 'delete') {
        pos++; const n = peek(); if (!n || n.t !== 'name') fail('delete の対象は配列です'); pos++;
        let e = null; if (isOp('[')) { pos++; e = parseExpr(); expectOp(']'); }
        endStmt(); return { k: 'delete', name: n.v, e };
      }
      if (t.v === 'print' || t.v === 'printf') {
        pos++; const args = parsePrintArgs();
        if (isOp('>') || isOp('>>')) throw new AwkError('print のファイル出力リダイレクトは未対応です（シェルの > を使ってください）');
        endStmt(); return { k: t.v, args };
      }
      if (t.v === 'function' || t.v === 'return') throw new AwkError('ユーザー定義関数は未対応です');
    }
    const e = parseExpr(); endStmt(); return { k: 'expr', e };
  }
  function parseStmtExprOnly() { return { k: 'expr', e: parseExpr() }; }

  // ----- プログラム全体 -----
  const items = [];
  skipTerms();
  while (peek()) {
    const it = { begin: false, end: false, pat: null, pat2: null, action: null };
    if (isKw('BEGIN')) { pos++; it.begin = true; skipNl(); it.action = parseBlock(); }
    else if (isKw('END')) { pos++; it.end = true; skipNl(); it.action = parseBlock(); }
    else {
      if (!isOp('{')) {
        it.pat = parseExpr();
        if (isOp(',')) { pos++; skipNl(); it.pat2 = parseExpr(); }
      }
      if (isOp('{')) it.action = parseBlock();
    }
    items.push(it);
    skipTerms();
  }
  return items;
}


// ---------- 値の変換 ----------
const NUM_RE = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?\s*$/;
const looksNumeric = (v) => typeof v === 'number' || (typeof v === 'string' && NUM_RE.test(v));
function toNum(v) {
  if (typeof v === 'number') return v;
  if (v === undefined || v === '') return 0;
  const m = String(v).match(/^\s*[-+]?(?:\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)/);
  return m ? Number(m[0]) : 0;
}
function numToStr(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return String(n);
  if (!isFinite(n)) return Number.isNaN(n) ? 'nan' : (n > 0 ? 'inf' : '-inf');
  return String(parseFloat(n.toPrecision(6)));
}
const toStr = (v) => (typeof v === 'number' ? numToStr(v) : v === undefined ? '' : String(v));
function toBool(v) {
  if (typeof v === 'number') return v !== 0;
  if (v === undefined) return false;
  return NUM_RE.test(v) ? Number(v) !== 0 : v !== '';
}

// ---------- printf ----------
function fmtOne(flags, width, prec, conv, arg) {
  let s;
  const n0 = toNum(arg);
  const signOf = (n) => (n < 0 ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '');
  switch (conv) {
    case 'd': case 'i': { const n = Number.isFinite(n0) ? Math.trunc(n0) : 0; let b = String(Math.abs(n)); if (prec != null) b = b.padStart(prec, '0'); s = signOf(n) + b; break; }
    case 'u': { const n = Math.trunc(n0); s = String(n < 0 ? n >>> 0 : n); break; }
    case 'o': s = (flags.includes('#') ? '0' : '') + Math.trunc(n0).toString(8); break;
    case 'x': s = (flags.includes('#') ? '0x' : '') + Math.trunc(n0).toString(16); break;
    case 'X': s = (flags.includes('#') ? '0X' : '') + Math.trunc(n0).toString(16).toUpperCase(); break;
    case 'e': case 'E': { const e = Math.abs(n0).toExponential(prec ?? 6).replace(/e([+-])(\d)$/, 'e$10$2'); s = signOf(n0) + (conv === 'E' ? e.toUpperCase() : e); break; }
    case 'f': case 'F': s = signOf(n0) + Math.abs(n0).toFixed(prec ?? 6); break;
    case 'g': case 'G': {
      let p = prec ?? 6; if (p === 0) p = 1;
      const a = Math.abs(n0);
      if (a === 0) s = '0';
      else {
        const exp = Math.floor(Math.log10(a));
        if (exp < -4 || exp >= p) {
          s = a.toExponential(p - 1);
          if (!flags.includes('#')) s = s.replace(/\.?0+e/, 'e');
          s = s.replace(/e([+-])(\d)$/, 'e$10$2');
        } else {
          s = a.toFixed(Math.max(0, p - 1 - exp));
          if (!flags.includes('#') && s.includes('.')) s = s.replace(/\.?0+$/, '');
        }
      }
      s = signOf(n0) + (conv === 'G' ? s.toUpperCase() : s); break;
    }
    case 'c': s = typeof arg === 'number' ? String.fromCharCode(arg) : (toStr(arg)[0] ?? ''); break;
    case 's': s = toStr(arg); if (prec != null) s = s.slice(0, prec); break;
    default: s = '';
  }
  if (width != null && s.length < width) {
    if (flags.includes('-')) s = s.padEnd(width);
    else if (flags.includes('0') && 'diouxXeEfFgG'.includes(conv) && prec == null) { const sign = /^[+\- ]/.test(s) ? s[0] : ''; s = sign + s.slice(sign.length).padStart(width - sign.length, '0'); }
    else s = s.padStart(width);
  }
  return s;
}
function sprintf(fmt, args) {
  let ai = 0;
  return fmt.replace(/%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d+))?([diouxXeEfFgGcs%])/g, (m, flags, w, pr, conv) => {
    if (conv === '%') return '%';
    let width = w === '*' ? toNum(args[ai++]) : (w != null ? Number(w) : null);
    let prec = pr === '*' ? toNum(args[ai++]) : (pr != null ? Number(pr) : null);
    if (width != null && width < 0) { flags += '-'; width = -width; }
    return fmtOne(flags, width, prec, conv, args[ai++]);
  });
}

// ---------- 実行 ----------
class NextSignal {}
class BreakSignal {}
class ContinueSignal {}
class ExitSignal { constructor(code) { this.code = code; } }
const STRING_FUNCS = new Set(['substr', 'tolower', 'toupper', 'sprintf']);
const MAX_STEPS = 3_000_000;

class Interp {
  constructor(items, { out, FS, vars }) {
    this.items = items; this.out = out; this.steps = 0;
    this.vars = Object.create(null); this.arrays = Object.create(null);
    Object.assign(this.vars, { FS: ' ', OFS: ' ', ORS: '\n', NR: 0, FNR: 0, NF: 0, FILENAME: '', SUBSEP: '\x1c', RSTART: 0, RLENGTH: -1 });
    if (FS != null) this.vars.FS = FS;
    Object.assign(this.vars, vars || {});
    this.record = ''; this.fields = []; this.regexCache = new Map(); this.range = new Map(); this.seed = 1;
  }
  tick() { if (++this.steps > MAX_STEPS) throw new AwkError('実行ステップ数の上限を超えました（無限ループの可能性）'); }
  regex(src, flags = '') {
    const key = flags + '/' + src;
    let re = this.regexCache.get(key);
    if (!re) { try { re = new RegExp(posixToJs(src, true), flags); } catch (e) { throw new AwkError(`無効な正規表現: ${src}`); } this.regexCache.set(key, re); }
    re.lastIndex = 0; return re;
  }
  arr(name) { return this.arrays[name] || (this.arrays[name] = new Map()); }

  // --- レコードとフィールド ---
  splitStr(str, fs) {
    if (fs === ' ') { const t = str.replace(/^[ \t\n]+|[ \t\n]+$/g, ''); return t === '' ? [] : t.split(/[ \t\n]+/); }
    if (str === '') return [];
    if (fs.length === 1) return str.split(fs);
    return str.split(this.regex(fs));
  }
  setRecord(str) { this.record = str; this.fields = this.splitStr(str, toStr(this.vars.FS)); this.vars.NF = this.fields.length; }
  getField(i) {
    i = Math.trunc(toNum(i));
    if (i < 0) throw new AwkError(`負のフィールド番号 $${i} は使えません`);
    return i === 0 ? this.record : (this.fields[i - 1] ?? '');
  }
  setField(i, v) {
    i = Math.trunc(toNum(i));
    if (i < 0) throw new AwkError(`負のフィールド番号 $${i} は使えません`);
    if (i === 0) { this.setRecord(toStr(v)); return; }
    while (this.fields.length < i) this.fields.push('');
    this.fields[i - 1] = toStr(v); this.vars.NF = this.fields.length;
    this.record = this.fields.join(toStr(this.vars.OFS));
  }
  setVar(name, v) {
    if (name === 'NF') {
      const n = Math.max(0, Math.trunc(toNum(v)));
      this.fields.length = Math.min(this.fields.length, n); while (this.fields.length < n) this.fields.push('');
      this.vars.NF = n; this.record = this.fields.join(toStr(this.vars.OFS)); return;
    }
    this.vars[name] = v;
  }

  // --- 式の評価 ---
  isStrNode(n) { while (n.k === 'group') n = n.e; return n.k === 'str' || n.k === 'concat' || (n.k === 'call' && STRING_FUNCS.has(n.name)); }
  compare(op, a, b, forceStr) {
    if (a === undefined) a = (typeof b === 'number' || looksNumeric(b)) ? 0 : '';
    if (b === undefined) b = (typeof a === 'number' || looksNumeric(a)) ? 0 : '';
    let c;
    if (!forceStr && looksNumeric(a) && looksNumeric(b)) { const x = toNum(a), y = toNum(b); c = x < y ? -1 : x > y ? 1 : 0; }
    else { const x = toStr(a), y = toStr(b); c = x < y ? -1 : x > y ? 1 : 0; }
    switch (op) { case '<': return c < 0; case '<=': return c <= 0; case '==': return c === 0; case '!=': return c !== 0; case '>=': return c >= 0; default: return c > 0; }
  }
  lval(node) {
    if (node.k === 'var') return { get: () => this.vars[node.name], set: (v) => this.setVar(node.name, v) };
    if (node.k === 'field') { const i = this.eval(node.e); return { get: () => this.getField(i), set: (v) => this.setField(i, v) }; }
    const key = toStr(this.eval(node.e)); const a = this.arr(node.name);
    return { get: () => a.get(key), set: (v) => a.set(key, v) };
  }
  eval(n) {
    this.tick();
    switch (n.k) {
      case 'num': return n.v;
      case 'str': return n.v;
      case 'regex': return this.regex(n.v).test(this.record) ? 1 : 0;
      case 'group': return this.eval(n.e);
      case 'var': return this.vars[n.name];
      case 'field': return this.getField(this.eval(n.e));
      case 'index': { const a = this.arr(n.name), key = toStr(this.eval(n.e)); if (!a.has(key)) a.set(key, undefined); return a.get(key); }
      case 'assign': {
        const lv = this.lval(n.l);
        let v;
        if (n.op === '=') v = this.eval(n.r);
        else { const x = toNum(lv.get()), y = toNum(this.eval(n.r)); v = n.op === '+=' ? x + y : n.op === '-=' ? x - y : n.op === '*=' ? x * y : n.op === '/=' ? this.div(x, y) : n.op === '%=' ? this.mod(x, y) : x ** y; }
        lv.set(v); return v;
      }
      case 'cond': return toBool(this.eval(n.c)) ? this.eval(n.a) : this.eval(n.b);
      case 'or': return toBool(this.eval(n.l)) || toBool(this.eval(n.r)) ? 1 : 0;
      case 'and': return toBool(this.eval(n.l)) && toBool(this.eval(n.r)) ? 1 : 0;
      case 'not': return toBool(this.eval(n.e)) ? 0 : 1;
      case 'neg': return -toNum(this.eval(n.e));
      case 'pos': return toNum(this.eval(n.e));
      case 'bin': {
        const x = toNum(this.eval(n.l)), y = toNum(this.eval(n.r));
        switch (n.op) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return this.div(x, y); case '%': return this.mod(x, y); default: return x ** y; }
      }
      case 'rel': return this.compare(n.op, this.eval(n.l), this.eval(n.r), this.isStrNode(n.l) || this.isStrNode(n.r)) ? 1 : 0;
      case 'match': {
        const s = toStr(this.eval(n.l));
        const re = n.r.k === 'regex' ? this.regex(n.r.v) : this.regex(toStr(this.eval(n.r)));
        return re.test(s) !== n.neg ? 1 : 0;
      }
      case 'concat': return toStr(this.eval(n.l)) + toStr(this.eval(n.r));
      case 'in': return this.arr(n.arr).has(toStr(this.eval(n.key))) ? 1 : 0;
      case 'incdec': {
        const lv = this.lval(n.t); const old = toNum(lv.get()); const nv = n.op === '++' ? old + 1 : old - 1;
        lv.set(nv); return n.pre ? nv : old;
      }
      case 'call': return this.call(n);
      default: throw new AwkError(`内部エラー: 未知の式 ${n.k}`);
    }
  }
  div(x, y) { if (y === 0) throw new AwkError('division by zero'); return x / y; }
  mod(x, y) { if (y === 0) throw new AwkError('division by zero in %'); return x % y; }

  call(n) {
    const a = n.args;
    const sarg = (i) => toStr(this.eval(a[i]));
    const need = (min, max = min) => { if (a.length < min || a.length > max) throw new AwkError(`${n.name}: 引数の数が不正です`); };
    switch (n.name) {
      case 'length': {
        if (a.length === 0) return this.record.length;
        if (a[0].k === 'var' && this.arrays[a[0].name]) return this.arrays[a[0].name].size;
        return sarg(0).length;
      }
      case 'substr': {
        need(2, 3); const s = sarg(0); const m = Math.round(toNum(this.eval(a[1])));
        const len = a.length === 3 ? Math.round(toNum(this.eval(a[2]))) : Infinity;
        const start = Math.max(1, m); const end = Math.min(s.length + 1, m + len);
        return end <= start ? '' : s.slice(start - 1, end - 1);
      }
      case 'index': need(2); return sarg(0).indexOf(sarg(1)) + 1;
      case 'tolower': need(1); return sarg(0).toLowerCase();
      case 'toupper': need(1); return sarg(0).toUpperCase();
      case 'sprintf': { if (!a.length) throw new AwkError('sprintf: フォーマットがありません'); return sprintf(sarg(0), a.slice(1).map(x => this.eval(x))); }
      case 'int': need(1); return Math.trunc(toNum(this.eval(a[0])));
      case 'sqrt': need(1); return Math.sqrt(toNum(this.eval(a[0])));
      case 'exp': need(1); return Math.exp(toNum(this.eval(a[0])));
      case 'log': need(1); return Math.log(toNum(this.eval(a[0])));
      case 'sin': need(1); return Math.sin(toNum(this.eval(a[0])));
      case 'cos': need(1); return Math.cos(toNum(this.eval(a[0])));
      case 'atan2': need(2); return Math.atan2(toNum(this.eval(a[0])), toNum(this.eval(a[1])));
      case 'rand': this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x80000000;
      case 'srand': { const old = this.seed; this.seed = a.length ? Math.trunc(toNum(this.eval(a[0]))) : 0; return old; }
      case 'split': {
        need(2, 3);
        if (a[1].k !== 'var') throw new AwkError('split の第2引数は配列名です');
        const s = sarg(0); const arr = this.arr(a[1].name); arr.clear();
        let parts;
        if (a.length === 3 && a[2].k === 'regex') parts = s === '' ? [] : s.split(this.regex(a[2].v));
        else parts = this.splitStr(s, a.length === 3 ? sarg(2) : toStr(this.vars.FS));
        parts.forEach((p, i) => arr.set(String(i + 1), p));
        return parts.length;
      }
      case 'match': {
        need(2); const s = sarg(0);
        const re = a[1].k === 'regex' ? this.regex(a[1].v) : this.regex(sarg(1));
        const m = re.exec(s);
        this.vars.RSTART = m ? m.index + 1 : 0; this.vars.RLENGTH = m ? m[0].length : -1;
        return this.vars.RSTART;
      }
      case 'sub': case 'gsub': {
        need(2, 3);
        const src = a[0].k === 'regex' ? a[0].v : sarg(0);
        const repl = sarg(1);
        const target = a.length === 3 ? a[2] : { k: 'field', e: { k: 'num', v: 0 } };
        if (!['var', 'field', 'index'].includes(target.k)) throw new AwkError(`${n.name}: 第3引数が代入可能ではありません`);
        const lv = this.lval(target);
        const str = toStr(lv.get());
        const re = this.regex(src, n.name === 'gsub' ? 'g' : '');
        let count = 0;
        const out = str.replace(re, (m) => { count++; return repl.replace(/\\&|&/g, (x) => (x === '&' ? m : '&')); });
        if (count) lv.set(out);
        return count;
      }
      default: throw new AwkError(`未対応の関数: ${n.name}`);
    }
  }

  // --- 文の実行 ---
  emit(text) { this.out(text); }
  exec(st) {
    this.tick();
    switch (st.k) {
      case 'block': for (const s of st.body) this.exec(s); return;
      case 'expr': this.eval(st.e); return;
      case 'print': {
        const vals = st.args.length ? st.args.map(e => toStr(this.eval(e))) : [this.record];
        this.emit(vals.join(toStr(this.vars.OFS)) + toStr(this.vars.ORS)); return;
      }
      case 'printf': {
        if (!st.args.length) throw new AwkError('printf: フォーマットがありません');
        const vals = st.args.map(e => this.eval(e));
        this.emit(sprintf(toStr(vals[0]), vals.slice(1))); return;
      }
      case 'if': if (toBool(this.eval(st.c))) this.exec(st.then); else if (st.els) this.exec(st.els); return;
      case 'while': this.loop(() => toBool(this.eval(st.c)), st.body); return;
      case 'do': { let first = true; this.loop(() => { if (first) { first = false; return true; } return toBool(this.eval(st.c)); }, st.body); return; }
      case 'for': {
        if (st.init) this.exec(st.init);
        this.loop(() => (st.c ? toBool(this.eval(st.c)) : true), st.body, st.inc ? () => this.exec(st.inc) : null); return;
      }
      case 'forin': {
        for (const key of [...this.arr(st.arr).keys()]) {
          this.setVar(st.v, key);
          try { this.exec(st.body); } catch (e) { if (e instanceof BreakSignal) break; if (e instanceof ContinueSignal) continue; throw e; }
        }
        return;
      }
      case 'delete': if (st.e) this.arr(st.name).delete(toStr(this.eval(st.e))); else this.arr(st.name).clear(); return;
      case 'break': throw new BreakSignal();
      case 'continue': throw new ContinueSignal();
      case 'next': throw new NextSignal();
      case 'exit': throw new ExitSignal(st.e ? Math.trunc(toNum(this.eval(st.e))) : 0);
      default: throw new AwkError(`内部エラー: 未知の文 ${st.k}`);
    }
  }
  loop(cond, body, step) {
    while (cond()) {
      this.tick();
      try { this.exec(body); } catch (e) { if (e instanceof BreakSignal) break; if (!(e instanceof ContinueSignal)) throw e; }
      if (step) step();
    }
  }

  runMain(mains) {
    for (const it of mains) {
      if (it.pat2) {
        let active = this.range.get(it);
        if (!active) { if (!toBool(this.eval(it.pat))) continue; active = true; }
        if (toBool(this.eval(it.pat2))) active = false;
        this.range.set(it, active);
      } else if (it.pat && !toBool(this.eval(it.pat))) continue;
      if (it.action) this.exec(it.action); else this.emit(this.record + toStr(this.vars.ORS));
    }
  }
  run(inputs) {
    const begins = this.items.filter(i => i.begin), ends = this.items.filter(i => i.end);
    const mains = this.items.filter(i => !i.begin && !i.end);
    let code = 0, exited = false;
    try {
      for (const b of begins) this.exec(b.action);
      if (mains.length || ends.length) {
        for (const inp of inputs) {
          this.vars.FILENAME = inp.name; this.vars.FNR = 0;
          const lines = inp.text.split('\n'); if (lines[lines.length - 1] === '') lines.pop();
          for (const line of lines) {
            this.vars.NR = toNum(this.vars.NR) + 1; this.vars.FNR = toNum(this.vars.FNR) + 1;
            this.setRecord(line);
            try { this.runMain(mains); } catch (e) { if (e instanceof NextSignal) continue; throw e; }
          }
        }
      }
    } catch (e) { if (e instanceof ExitSignal) { code = e.code; exited = true; } else throw e; }
    try { for (const en of ends) this.exec(en.action); }
    catch (e) { if (e instanceof ExitSignal) code = e.code; else throw e; }
    return code;
  }
}

// 実行エントリ。inputs: [{ name, text }]。out(text) に出力を渡す。戻り値は終了コード。
export function runAwk({ program, inputs, vars, FS, out }) {
  const items = parseProgram(program);
  const it = new Interp(items, { out, FS, vars });
  return it.run(inputs);
}

export { parseProgram };
