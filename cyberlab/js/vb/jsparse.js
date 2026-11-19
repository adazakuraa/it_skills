// ============================================================
// Console 用 JavaScript 風式のパーサ（eval / Function は使わない）。
// 対応: リテラル(数値/文字列/テンプレート/配列/オブジェクト/true/false/null/undefined)、
//       メンバー(. [] ?.)、呼び出し、アロー関数(式本体)、単項(! - + typeof)、
//       二項(+ - * / % < > <= >= == != === !== && || ??)、三項、代入(= += -=)、
//       const/let/var 宣言、; 区切り
// 非対応(明示エラー): new, function, class, ブロック文, 制御構文, 正規表現リテラル, ++/--
// ============================================================

export class ParseError extends Error { constructor(msg) { super(msg); this.errName = 'SyntaxError'; } }

const KEYWORDS_UNSUPPORTED = new Set(['new', 'function', 'class', 'if', 'for', 'while', 'do', 'switch', 'try', 'return', 'throw', 'delete', 'void', 'await', 'async', 'import', 'export', 'this', 'in', 'of', 'instanceof']);
const OPS3 = ['===', '!==', '...'];
const OPS2 = ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '+=', '-=', '++', '--'];

export function tokenize(src) {
  const toks = [];
  let i = 0;
  const err = (m) => { throw new ParseError(m); };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const start = i;
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = src.slice(i).match(/^(0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+)/);
      toks.push({ t: 'num', v: Number(m[0]), s: start, e: i + m[0].length }); i += m[0].length; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, out = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\n') err('Invalid or unexpected token');
        if (src[j] === '\\') {
          const n = src[j + 1];
          if (n === 'u' && /^[0-9a-fA-F]{4}/.test(src.slice(j + 2, j + 6))) { out += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 6; continue; }
          out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n === '0' ? '\0' : n; j += 2; continue;
        }
        out += src[j]; j++;
      }
      if (j >= src.length) err('Invalid or unexpected token');
      toks.push({ t: 'str', v: out, s: start, e: j + 1 }); i = j + 1; continue;
    }
    if (c === '`') {
      const quasis = [], exprs = [];
      let j = i + 1, cur = '';
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') { const n = src[j + 1]; cur += n === 'n' ? '\n' : n === 't' ? '\t' : n; j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          let depth = 1, k = j + 2;
          while (k < src.length && depth > 0) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; k++; }
          if (depth) err('Unexpected end of input');
          quasis.push(cur); cur = '';
          exprs.push(src.slice(j + 2, k - 1)); j = k; continue;
        }
        cur += src[j]; j++;
      }
      if (j >= src.length) err('Invalid or unexpected token');
      quasis.push(cur);
      toks.push({ t: 'tpl', quasis, exprs, s: start, e: j + 1 }); i = j + 1; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j), s: start, e: j }); i = j; continue;
    }
    let op = OPS3.find(o => src.startsWith(o, i)) || OPS2.find(o => src.startsWith(o, i));
    if (op === '?.' && /[0-9]/.test(src[i + 2] || '')) op = null; // 三項演算子 a?.5:1
    if (!op && '+-*/%<>=!?:.,;()[]{}'.includes(c)) op = c;
    if (!op) err('Invalid or unexpected token');
    if (op === '/' ) err('正規表現リテラルや除算以外の / はこのシミュレーターでは未対応です');
    toks.push({ t: 'op', v: op, s: start, e: i + op.length }); i += op.length;
  }
  return toks;
}

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = (o = 0) => toks[p + o];
  const isOp = (v, o = 0) => { const t = toks[p + o]; return t && t.t === 'op' && t.v === v; };
  const fail = (t) => {
    if (!t) throw new ParseError('Unexpected end of input');
    if (t.t === 'str') throw new ParseError('Unexpected string');
    if (t.t === 'num') throw new ParseError('Unexpected number');
    if (t.t === 'id') throw new ParseError(`Unexpected identifier '${t.v}'`);
    throw new ParseError(`Unexpected token '${t.v ?? t.t}'`);
  };
  const expect = (v) => { if (!isOp(v)) fail(peek()); p++; };
  const span = (a, b) => src.slice(a, b);
  const lastEnd = () => toks[p - 1].e;

  function parseProgram() {
    const stmts = [];
    while (p < toks.length) {
      if (isOp(';')) { p++; continue; }
      stmts.push(parseStatement());
      if (p < toks.length && !isOp(';')) fail(peek());
    }
    return stmts;
  }
  function parseStatement() {
    const t = peek();
    if (t.t === 'id' && ['const', 'let', 'var'].includes(t.v)) {
      p++;
      const id = peek(); if (!id || id.t !== 'id') fail(id);
      p++;
      let init = null;
      if (isOp('=')) { p++; init = parseAssign(); }
      else if (t.v === 'const') throw new ParseError('Missing initializer in const declaration');
      return { k: 'decl', kind: t.v, name: id.v, init };
    }
    if (t.t === 'id' && KEYWORDS_UNSUPPORTED.has(t.v) && !(peek(1) && peek(1).t === 'op' && peek(1).v === '=>')) throw new ParseError(`'${t.v}' はこのシミュレーターのConsoleでは未対応です`);
    if (isOp('{')) throw new ParseError('ブロック文はこのシミュレーターのConsoleでは未対応です（式を1つずつ実行してください）');
    return { k: 'expr', e: parseAssign() };
  }
  function parseAssign() {
    const start = peek() ? peek().s : 0;
    // アロー関数: id => expr / (a, b) => expr
    if (peek() && peek().t === 'id' && isOp('=>', 1) && !KEYWORDS_UNSUPPORTED.has(peek().v)) {
      const name = peek().v; p += 2; return arrowBody([name], start);
    }
    if (isOp('(')) {
      const params = tryArrowParams();
      if (params) return arrowBody(params, start);
    }
    const left = parseCond();
    const t = peek();
    if (t && t.t === 'op' && ['=', '+=', '-='].includes(t.v)) {
      if (!['id', 'member', 'index'].includes(left.k)) throw new ParseError('Invalid left-hand side in assignment');
      p++;
      return { k: 'assign', op: t.v, target: left, value: parseAssign(), s: start, e: lastEnd() };
    }
    return left;
  }
  function tryArrowParams() {
    // ( id (, id)* ) =>
    let q = p + 1; const names = [];
    if (toks[q] && toks[q].t === 'op' && toks[q].v === ')') { q++; }
    else {
      for (;;) {
        const t = toks[q]; if (!t || t.t !== 'id') return null;
        names.push(t.v); q++;
        if (toks[q] && toks[q].t === 'op' && toks[q].v === ',') { q++; continue; }
        break;
      }
      if (!(toks[q] && toks[q].t === 'op' && toks[q].v === ')')) return null;
      q++;
    }
    if (!(toks[q] && toks[q].t === 'op' && toks[q].v === '=>')) return null;
    p = q + 1; return names;
  }
  function arrowBody(params, start) {
    if (isOp('{')) throw new ParseError('アロー関数の本体は式のみ対応です（{ } のブロックは未対応）');
    const body = parseAssign();
    return { k: 'arrow', params, body, s: start, e: lastEnd() };
  }
  function parseCond() {
    const c = parseBin(0);
    if (isOp('?')) { p++; const a = parseAssign(); expect(':'); const b = parseAssign(); return { k: 'cond', c, a, b }; }
    return c;
  }
  const LEVELS = [['??'], ['||'], ['&&'], ['==', '!=', '===', '!=='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '%']];
  function parseBin(level) {
    if (level >= LEVELS.length) return parseUnary();
    let left = parseBin(level + 1);
    for (;;) {
      const t = peek();
      if (t && t.t === 'op' && LEVELS[level].includes(t.v)) { p++; left = { k: 'bin', op: t.v, l: left, r: parseBin(level + 1) }; }
      else return left;
    }
  }
  function parseUnary() {
    const t = peek();
    if (t && t.t === 'op' && ['!', '-', '+'].includes(t.v)) { p++; return { k: 'unary', op: t.v, e: parseUnary() }; }
    if (t && t.t === 'op' && (t.v === '++' || t.v === '--')) throw new ParseError('++/-- はこのシミュレーターでは未対応です');
    if (t && t.t === 'id' && t.v === 'typeof') { p++; return { k: 'unary', op: 'typeof', e: parseUnary() }; }
    return parsePostfix();
  }
  function parsePostfix() {
    const startTok = peek();
    let e = parsePrimary();
    for (;;) {
      if (isOp('.') || isOp('?.')) {
        const optional = isOp('?.'); p++;
        if (optional && (isOp('(') || isOp('['))) {
          if (isOp('[')) { p++; const idx = parseAssign(); expect(']'); e = { k: 'index', obj: e, idx, optional: true }; }
          else { e = { k: 'call', callee: e, args: parseArgs(), optional: true, s: startTok.s, e: lastEnd() }; }
          continue;
        }
        const n = peek(); if (!n || n.t !== 'id') fail(n);
        p++; e = { k: 'member', obj: e, name: n.v, optional, s: startTok.s, e: lastEnd() };
      } else if (isOp('[')) {
        p++; const idx = parseAssign(); expect(']'); e = { k: 'index', obj: e, idx, optional: false, s: startTok.s, e: lastEnd() };
      } else if (isOp('(')) {
        e = { k: 'call', callee: e, args: parseArgs(), optional: false, s: startTok.s, e: lastEnd() };
      } else return e;
    }
  }
  function parseArgs() {
    expect('('); const args = [];
    if (!isOp(')')) { for (;;) { args.push(parseAssign()); if (isOp(',')) { p++; if (isOp(')')) break; continue; } break; } }
    expect(')'); return args;
  }
  function parsePrimary() {
    const t = peek();
    if (!t) fail(null);
    if (t.t === 'num') { p++; return { k: 'num', v: t.v }; }
    if (t.t === 'str') { p++; return { k: 'str', v: t.v }; }
    if (t.t === 'tpl') { p++; return { k: 'tpl', quasis: t.quasis, exprs: t.exprs.map(s => { const sub = parse(s); if (sub.length !== 1 || sub[0].k !== 'expr') throw new ParseError('テンプレート内は式のみ対応です'); return sub[0].e; }) }; }
    if (t.t === 'id') {
      if (['true', 'false', 'null', 'undefined'].includes(t.v)) { p++; return { k: 'lit', v: t.v === 'true' ? true : t.v === 'false' ? false : t.v === 'null' ? null : undefined }; }
      if (KEYWORDS_UNSUPPORTED.has(t.v)) throw new ParseError(`'${t.v}' はこのシミュレーターのConsoleでは未対応です`);
      p++; return { k: 'id', name: t.v };
    }
    if (isOp('(')) { p++; const e = parseAssign(); expect(')'); return { k: 'group', e }; }
    if (isOp('[')) {
      p++; const items = [];
      while (!isOp(']')) { if (!peek()) fail(null); items.push(parseAssign()); if (isOp(',')) p++; else break; }
      expect(']'); return { k: 'array', items };
    }
    if (isOp('{')) {
      p++; const props = [];
      while (!isOp('}')) {
        const kt = peek(); if (!kt) fail(null);
        let key;
        if (kt.t === 'id' || kt.t === 'str') key = kt.v; else if (kt.t === 'num') key = String(kt.v); else fail(kt);
        p++;
        if (isOp(':')) { p++; props.push({ key, value: parseAssign() }); }
        else if (kt.t === 'id') props.push({ key, value: { k: 'id', name: key } }); // 省略記法 {a}
        else fail(peek());
        if (isOp(',')) p++; else break;
      }
      expect('}'); return { k: 'object', props };
    }
    fail(t);
  }
  const prog = parseProgram();
  prog.src = src;
  return prog;
}
