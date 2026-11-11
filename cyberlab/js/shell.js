// ============================================================
// 独自シェル：字句解析 → 構文解析 → 展開 → 実行
// 入力は決して JavaScript として評価しない（eval / Function 不使用）。
// ============================================================
import { FsError, ERRMSG } from './vfs.js';

const MAX_LINE = 4000;
const MAX_OUTPUT = 200000;
const MAX_DEPTH = 8;
const COMPOUND_RE = /(^|[;&|]\s*)(if|for|while|until|case)\s/;
const MAX_SCRIPT_STEPS = 20000;

export class ShellSyntaxError extends Error {}


// 対応する ')' の位置を返す（クォート・入れ子・エスケープを考慮）。start は '(' の次の位置。無ければ -1
function findClosingParen(line, start) {
  let depth = 1, i = start, inS = false, inD = false;
  while (i < line.length) {
    const c = line[i];
    if (inS) { if (c === "'") inS = false; i++; continue; }
    if (c === '\\') { i += 2; continue; }
    if (inD) { if (c === '"') inD = false; i++; continue; }
    if (c === "'") inS = true;
    else if (c === '"') inD = true;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

// ---------- 字句解析 ----------
// 単語は segment の配列: {k:'lit', v, q} / {k:'var', name, q} / {k:'cmd', src, q} / {k:'arith', src, q} / {k:'tilde'}
export function tokenize(line) {
  const toks = [];
  let i = 0;
  let word = null;
  const push = seg => { if (!word) word = []; word.push(seg); };
  const flush = () => { if (word) { toks.push({ word }); word = null; } };
  const readVar = (q) => {
    // i は '$' の位置
    const rest = line.slice(i + 1);
    let m;
    if ((m = rest.match(/^\{([A-Za-z_][A-Za-z0-9_]*|[0-9?#@*])\}/))) { push({ k: 'var', name: m[1], q }); i += m[0].length + 1; return; }
    if ((m = rest.match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9?#@*$])/))) { push({ k: 'var', name: m[1], q }); i += m[0].length + 1; return; }
    if (rest.startsWith('(')) {
      const end = findClosingParen(line, i + 2);
      if (end < 0) throw new ShellSyntaxError("unexpected EOF while looking for matching `)'");
      if (line[i + 2] === '(' && line[end - 1] === ')') push({ k: 'arith', src: line.slice(i + 3, end - 1), q });
      else push({ k: 'cmd', src: line.slice(i + 2, end), q });
      i = end + 1; return;
    }
    push({ k: 'lit', v: '$', q }); i++;
  };
  const readBacktick = (q) => {
    const end = line.indexOf('`', i + 1);
    if (end < 0) throw new ShellSyntaxError("unexpected EOF while looking for matching ``'");
    push({ k: 'cmd', src: line.slice(i + 1, end).replace(/\\`/g, '`'), q });
    i = end + 1;
  };

  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') { flush(); i++; continue; }
    if (c === '#' && !word) break; // コメント
    if (c === '\\') {
      if (i + 1 < line.length) push({ k: 'lit', v: line[i + 1], q: true });
      i += 2; continue;
    }
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) throw new ShellSyntaxError("unexpected EOF while looking for matching `''");
      push({ k: 'lit', v: line.slice(i + 1, end), q: true });
      if (end === i + 1) push({ k: 'lit', v: '', q: true });
      i = end + 1; continue;
    }
    if (c === '"') {
      i++;
      let buf = '';
      let closed = false;
      push({ k: 'lit', v: '', q: true });
      while (i < line.length) {
        const d = line[i];
        if (d === '"') { closed = true; i++; break; }
        if (d === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) { buf += line[i + 1]; i += 2; continue; }
        if (d === '$') { if (buf) { push({ k: 'lit', v: buf, q: true }); buf = ''; } readVar(true); continue; }
        if (d === '`') { if (buf) { push({ k: 'lit', v: buf, q: true }); buf = ''; } readBacktick(true); continue; }
        buf += d; i++;
      }
      if (!closed) throw new ShellSyntaxError('unexpected EOF while looking for matching `"\'');
      if (buf) push({ k: 'lit', v: buf, q: true });
      continue;
    }
    if (c === '$') { readVar(false); continue; }
    if (c === '`') { readBacktick(false); continue; }
    // 演算子
    const three = line.slice(i, i + 3);
    const two = line.slice(i, i + 2);
    if (three === '2>>') { flush(); toks.push({ op: '2>>' }); i += 3; continue; }
    if (line.slice(i, i + 4) === '2>&1') { flush(); toks.push({ op: '2>&1' }); i += 4; continue; }
    if (['&&', '||', '>>', '2>', '&>'].includes(two) && (two !== '2>' || !word)) {
      flush(); toks.push({ op: two }); i += 2; continue;
    }
    if ('|;<>&'.includes(c)) { flush(); toks.push({ op: c }); i++; continue; }
    if (c === '~' && !word) { push({ k: 'tilde' }); i++; continue; }
    // 通常文字
    let j = i;
    while (j < line.length && !' \t\\\'"$|;<>&`'.includes(line[j])) j++;
    push({ k: 'lit', v: line.slice(i, j), q: false });
    i = j;
  }
  flush();
  return toks;
}

// ---------- 構文解析 ----------
// list: [{ connector: null|';'|'&&'|'||', pipeline: [cmd] }]
// cmd: { words: [word], redirs: [{op, word}] }
export function parse(toks) {
  const list = [];
  let pipeline = [];
  let cmd = { words: [], redirs: [] };
  let connector = null;
  const endCmd = (opName) => {
    if (cmd.words.length === 0 && cmd.redirs.length === 0) {
      throw new ShellSyntaxError(`syntax error near unexpected token \`${opName}'`);
    }
    pipeline.push(cmd);
    cmd = { words: [], redirs: [] };
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.word) { cmd.words.push(t.word); continue; }
    const op = t.op;
    if (op === '|') { endCmd('|'); continue; }
    if (op === ';' || op === '&&' || op === '||') {
      endCmd(op);
      list.push({ connector, pipeline });
      pipeline = [];
      connector = op;
      continue;
    }
    if (op === '&') throw new ShellSyntaxError('バックグラウンド実行 (&) はこのシミュレーターでは未対応です');
    if (op === '2>&1') { cmd.redirs.push({ op }); continue; }
    // > >> < 2> 2>> &>
    const next = toks[i + 1];
    if (!next || !next.word) throw new ShellSyntaxError("syntax error near unexpected token `newline'");
    cmd.redirs.push({ op, word: next.word });
    i++;
  }
  if (cmd.words.length || cmd.redirs.length) pipeline.push(cmd);
  else if (pipeline.length || connector === '&&' || connector === '||') {
    if (connector && connector !== ';') throw new ShellSyntaxError("syntax error: unexpected end of file");
    if (pipeline.length) throw new ShellSyntaxError("syntax error: unexpected end of file");
  }
  if (pipeline.length) list.push({ connector, pipeline });
  return list;
}

// ---------- グロブ ----------
function globToRegExp(pat) {
  let re = '^';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '\u0000') { re += escapeRe(pat[++i]); continue; } // クォートされた文字
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const end = pat.indexOf(']', i + 2);
      if (end < 0) { re += '\\['; continue; }
      let body = pat.slice(i + 1, end).replace(/\u0000/g, '');
      if (body[0] === '!') body = '^' + body.slice(1);
      re += '[' + body.replace(/\\/g, '\\\\') + ']';
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp(re + '$');
}
export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }

// ---------- シェル本体 ----------
export class Shell {
  constructor({ vfs, user, cwd, env = {}, hostname = 'lab', commands, processes = [], services = [], sudo = false, net = null }) {
    this.vfs = vfs;
    this.user = user;
    this.cwd = cwd;
    this.hostname = hostname;
    this.commands = commands;
    this.processes = processes;
    this.services = services;
    this.sudoAllowed = sudo;
    this.net = net;
    this.history = [];
    this.lastCode = 0;
    this.positional = [];
    this.depth = 0;
    this.cmdLog = []; // 実行したコマンド名の記録（復習画面用）
    this.subDepth = 0;      // コマンド置換の入れ子の深さ
    this.loopDepth = 0;     // 実行中のループの深さ（break/continue の検証用）
    this.pendingErr = [];   // コマンド置換内で出た stderr（親コマンドの出力へ合流）
    this.env = Object.assign({
      HOME: user.home, USER: user.name, LOGNAME: user.name, SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin', PWD: cwd, LANG: 'C.UTF-8', TERM: 'xterm-256color',
      HOSTNAME: hostname,
    }, env);
  }

  prompt() {
    const home = this.user.home;
    let p = this.cwd;
    if (p === home) p = '~';
    else if (p.startsWith(home + '/')) p = '~' + p.slice(home.length);
    return `${this.user.name}@${this.hostname}:${p}${this.user.uid === 0 ? '#' : '$'} `;
  }

  getVar(name) {
    if (name === '?') return String(this.lastCode);
    if (name === '$') return '4242';
    if (name === '#') return String(this.positional.length);
    if (name === '@' || name === '*') return this.positional.join(' ');
    if (/^[0-9]$/.test(name)) return name === '0' ? 'bash' : (this.positional[+name - 1] ?? '');
    return this.env[name] ?? '';
  }

  /** 単語を展開して文字列配列にする（変数/コマンド置換/算術 → 単語分割 → グロブ） */
  expandWord(word, { noSplit = false, noGlob = false } = {}) {
    const fields = [];
    let cur = { text: '', pat: '', glob: false, keep: false };
    const endField = () => { fields.push(cur); cur = { text: '', pat: '', glob: false, keep: false }; };
    const addQuoted = (v) => { cur.text += v; cur.pat += quoteAll(v); cur.keep = true; };
    for (const s of word) {
      if (s.k === 'tilde') { const h = this.env.HOME || this.user.home; cur.text += h; cur.pat += quoteAll(h); continue; }
      if (s.k === 'lit') {
        if (s.q) addQuoted(s.v);
        else { cur.text += s.v; cur.pat += s.v; if (/[*?[]/.test(s.v)) cur.glob = true; }
        continue;
      }
      const v = s.k === 'var' ? this.getVar(s.name) : s.k === 'cmd' ? this.captureRun(s.src) : this.evalArith(s.src);
      if (s.q || noSplit) { addQuoted(v); continue; }
      if (v === '') continue;
      // 未クォートの展開結果は空白で単語分割され、グロブの対象にもなる
      const toks = v.split(/[ \t\n]+/).filter(Boolean);
      if (!toks.length) { if (cur.text !== '' || cur.keep) endField(); continue; }
      if (/^[ \t\n]/.test(v) && (cur.text !== '' || cur.keep)) endField();
      toks.forEach((t, k) => { if (k > 0) endField(); cur.text += t; cur.pat += t; if (/[*?[]/.test(t)) cur.glob = true; });
      if (/[ \t\n]$/.test(v)) endField();
    }
    if (cur.text !== '' || cur.keep) fields.push(cur);
    const out = [];
    for (const f of fields) {
      if (f.glob && !noGlob) { const m = this.glob(f.pat); if (m.length) { out.push(...m); continue; } }
      out.push(f.text);
    }
    return out;
  }

  /** コマンド置換 $(...) / `...`: 同じ安全なパーサーでサブコマンドを実行し stdout を返す */
  captureRun(src) {
    if (this.subDepth >= 4) throw new ShellSyntaxError('コマンド置換の入れ子が深すぎます');
    this.subDepth++;
    const saved = this.lastCode;
    try {
      const chunks = this.run(src, { record: false });
      for (const c of chunks) if (c.fd === 2) this.pendingErr.push(c);
      return chunks.filter(c => c.fd === 1).map(c => c.text).join('').replace(/\n+$/, '');
    } finally { this.subDepth--; this.lastCode = saved; }
  }

  /** 算術展開 $((...)): + - * / % ** と括弧・比較。変数は名前でも $名前 でも参照可。eval は使わない */
  evalArith(src) {
    const s = src.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*|[0-9?#])\}?/g, (m, n) => this.getVar(n) || '0');
    let i = 0;
    const ws = () => { while (s[i] === ' ' || s[i] === '\t') i++; };
    const fail = (m) => { throw new ShellSyntaxError(m); };
    const primary = () => {
      ws();
      if (s[i] === '(') { i++; const v = cmp(); ws(); if (s[i] !== ')') fail('arithmetic: ) が必要です'); i++; return v; }
      if (s[i] === '-') { i++; return -primary(); }
      if (s[i] === '+') { i++; return primary(); }
      if (s[i] === '!') { i++; return primary() ? 0 : 1; }
      const m = s.slice(i).match(/^(0[xX][0-9a-fA-F]+|\d+|[A-Za-z_][A-Za-z0-9_]*)/);
      if (!m) fail(`arithmetic: 構文エラー: '${s.slice(i)}'`);
      i += m[0].length;
      if (/^[A-Za-z_]/.test(m[0])) return parseInt(this.getVar(m[0]) || '0', 10) || 0;
      return Number(m[0]);
    };
    const pow = () => { let l = primary(); ws(); if (s.startsWith('**', i)) { i += 2; l = l ** pow(); } return l; };
    const mul = () => {
      let l = pow();
      for (;;) {
        ws(); const c = s[i];
        if (c === '*' && s[i + 1] !== '*') { i++; l *= pow(); }
        else if (c === '/') { i++; const r = pow(); if (r === 0) fail('division by 0'); l = Math.trunc(l / r); }
        else if (c === '%') { i++; const r = pow(); if (r === 0) fail('division by 0'); l %= r; }
        else return l;
      }
    };
    const add = () => { let l = mul(); for (;;) { ws(); if (s[i] === '+') { i++; l += mul(); } else if (s[i] === '-') { i++; l -= mul(); } else return l; } };
    const cmp = () => {
      let l = add();
      for (;;) {
        ws(); const m = s.slice(i).match(/^(<=|>=|==|!=|<|>)/);
        if (!m) return l;
        i += m[0].length; const r = add();
        l = (m[0] === '<=' ? l <= r : m[0] === '>=' ? l >= r : m[0] === '==' ? l === r : m[0] === '!=' ? l !== r : m[0] === '<' ? l < r : l > r) ? 1 : 0;
      }
    };
    const v = cmp(); ws();
    if (i < s.length) fail(`arithmetic: 構文エラー: '${s.slice(i)}'`);
    return String(Math.trunc(v));
  }

  glob(pattern) {
    const isAbs = pattern.startsWith('/');
    const parts = pattern.split('/').filter(p => p !== '');
    let cands = [{ shown: isAbs ? '/' : '', abs: isAbs ? '/' : this.cwd }];
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      const next = [];
      const hasMeta = /(^|[^\u0000])[*?[]/.test(part) || /^[*?[]/.test(part);
      for (const c of cands) {
        const joinShown = n => (c.shown === '' ? n : c.shown === '/' ? '/' + n : c.shown + '/' + n);
        const joinAbs = n => (c.abs === '/' ? '/' + n : c.abs + '/' + n);
        if (!hasMeta) {
          const lit = part.replace(/\u0000/g, '');
          next.push({ shown: joinShown(lit), abs: joinAbs(lit) });
          continue;
        }
        let dir;
        try { dir = this.vfs.lookup(c.abs, '/', this.user); } catch { continue; }
        if (dir.type !== 'd' || !this.vfs.can(dir, this.user, 4)) continue;
        const re = globToRegExp(part);
        for (const name of Object.keys(dir.children).sort()) {
          if (name.startsWith('.') && !part.replace(/\u0000/g, '').startsWith('.')) continue;
          if (re.test(name)) next.push({ shown: joinShown(name), abs: joinAbs(name) });
        }
      }
      cands = next;
    }
    return cands.filter(c => this.vfs.exists(c.abs)).map(c => c.shown);
  }

  /** 1行を実行して出力チャンク [{fd, text}] を返す */
  run(line, { record = true, noRoute = false } = {}) {
    const chunks = [];
    if (line.length > MAX_LINE) {
      chunks.push({ fd: 2, text: 'bash: 入力が長すぎます\n' });
      return chunks;
    }
    if (record && line.trim()) {
      this.history.push(line);
      if (this.history.length > 500) this.history.shift();
    }
    // if / for / while / until を含む行は、複合コマンド対応の実行器で処理する
    if (!noRoute && COMPOUND_RE.test(line)) {
      const ctx = { sh: this, tty: true, stdin: '', out: (t) => chunks.push({ fd: 1, text: t }), err: (t) => chunks.push({ fd: 2, text: t }) };
      this.lastCode = this.runScript(line, [], ctx, 'bash', { interactive: true });
      return chunks;
    }
    let list;
    try {
      list = parse(tokenize(line));
    } catch (e) {
      if (e instanceof ShellSyntaxError) {
        chunks.push({ fd: 2, text: `bash: ${e.message}\n` });
        this.lastCode = 2;
        return chunks;
      }
      throw e;
    }
    let loopSig = null;
    for (const item of list) {
      if (item.connector === '&&' && this.lastCode !== 0) continue;
      if (item.connector === '||' && this.lastCode === 0) continue;
      try { this.lastCode = this.runPipeline(item.pipeline, chunks); }
      catch (e) { if (e instanceof LoopSignal) { loopSig = e; break; } throw e; }
      if (this.exitRequested) break;
    }
    // 出力サイズ上限
    let total = 0;
    for (const c of chunks) {
      total += c.text.length;
      if (total > MAX_OUTPUT) {
        c.text = c.text.slice(0, Math.max(0, c.text.length - (total - MAX_OUTPUT))) + '\n[出力が長すぎるため省略しました]\n';
        chunks.length = chunks.indexOf(c) + 1;
        break;
      }
    }
    if (loopSig) chunks.loopSignal = loopSig;
    return chunks;
  }

  runPipeline(pipeline, chunks) {
    let stdin = '';
    let code = 0;
    for (let i = 0; i < pipeline.length; i++) {
      const isLast = i === pipeline.length - 1;
      const res = this.runSimple(pipeline[i], stdin, isLast ? chunks : null, chunks);
      stdin = res.out;
      code = res.code;
    }
    return code;
  }

  /**
   * 単純コマンドを実行。
   * toTerminal: 最終コマンドなら chunks（stdoutを画面へ）、途中なら null（stdoutは次のstdinへ）
   */
  runSimple(cmd, stdin, toTerminal, errChunks) {
    const ordered = []; // [{fd, text}]
    let argv = [];
    try {
      let assignPhase = true;
      for (const w of cmd.words) {
        const first = w[0];
        const isAssign = assignPhase && first && first.k === 'lit' && !first.q && /^[A-Za-z_][A-Za-z0-9_]*=/.test(first.v);
        if (!isAssign) assignPhase = false;
        const inDbl = argv[0] === '[['; // [[ ]] の中は単語分割もグロブもしない
        argv.push(...this.expandWord(w, { noSplit: isAssign || inDbl, noGlob: inDbl }));
      }
    } catch (e) {
      errChunks.push({ fd: 2, text: `bash: ${e.message}\n` });
      return { out: '', code: 1 };
    }
    if (this.pendingErr.length) { errChunks.push(...this.pendingErr); this.pendingErr = []; }

    // リダイレクト解決
    let outTarget = null, outAppend = false, errTarget = null, errAppend = false, errToOut = false;
    for (const r of cmd.redirs) {
      if (r.op === '2>&1') { errToOut = true; continue; }
      const target = this.expandWord(r.word);
      if (target.length !== 1 || target[0] === '') {
        errChunks.push({ fd: 2, text: 'bash: ambiguous redirect\n' });
        return { out: '', code: 1 };
      }
      const t = target[0];
      if (r.op === '<') {
        try { stdin = this.vfs.readFile(t, this.cwd, this.user); }
        catch (e) { errChunks.push({ fd: 2, text: `bash: ${t}: ${fsMsg(e)}\n` }); return { out: '', code: 1 }; }
      } else if (r.op === '>' || r.op === '>>') { outTarget = t; outAppend = r.op === '>>'; }
      else if (r.op === '2>' || r.op === '2>>') { errTarget = t; errAppend = r.op === '2>>'; }
      else if (r.op === '&>') { outTarget = t; outAppend = false; errToOut = true; }
    }
    // 出力先ファイルは実行前に作成/切り詰め（bash と同じ順序）
    const prep = (t, append) => {
      try {
        if (!append) this.vfs.writeFile(t, this.cwd, this.user, '');
        else this.vfs.writeFile(t, this.cwd, this.user, '', { append: true });
        return true;
      } catch (e) { errChunks.push({ fd: 2, text: `bash: ${t}: ${fsMsg(e)}\n` }); return false; }
    };
    if (outTarget && !prep(outTarget, outAppend)) return { out: '', code: 1 };
    if (errTarget && !prep(errTarget, errAppend)) return { out: '', code: 1 };

    let code;
    const ctx = {
      sh: this,
      tty: !!toTerminal && !outTarget, // 標準出力が端末か（ls の整形などに影響）
      stdin,
      out: text => { ordered.push({ fd: 1, text }); },
      err: text => { ordered.push({ fd: 2, text }); },
    };
    if (argv.length === 0) {
      code = 0;
    } else {
      code = this.exec(argv, ctx);
    }

    // 出力の振り分け
    let outText = '';
    let errText = '';
    const termOut = [];
    for (const c of ordered) {
      const fd = c.fd === 2 && errToOut ? 1 : c.fd;
      if (fd === 1) {
        outText += c.text;
        if (!outTarget && toTerminal) termOut.push({ fd: c.fd === 2 ? 2 : 1, text: c.text });
      } else {
        errText += c.text;
      }
    }
    if (outTarget) {
      try { this.vfs.writeFile(outTarget, this.cwd, this.user, outText, { append: true }); } catch { /* prep 済み */ }
      outText = '';
    }
    if (errText) {
      if (errTarget) {
        try { this.vfs.writeFile(errTarget, this.cwd, this.user, errText, { append: true }); } catch { /* prep 済み */ }
      } else {
        errChunks.push({ fd: 2, text: errText });
      }
    }
    if (toTerminal) toTerminal.push(...termOut);
    return { out: toTerminal ? '' : outText, code };
  }

  /** argv を実行（sudo などから再帰的にも呼ばれる） */
  exec(argv, ctx) {
    const name = argv[0];
    // 変数代入 NAME=value
    const asg = name.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s);
    if (asg && argv.length === 1) { this.env[asg[1]] = asg[2]; return 0; }
    if (asg) {
      const saved = this.env[asg[1]];
      this.env[asg[1]] = asg[2];
      const code = this.exec(argv.slice(1), ctx);
      if (saved === undefined) delete this.env[asg[1]]; else this.env[asg[1]] = saved;
      return code;
    }
    this.cmdLog.push(name);
    if (name.includes('/')) return this.execPath(name, argv.slice(1), ctx);
    const fn = Object.prototype.hasOwnProperty.call(this.commands, name) ? this.commands[name] : null;
    if (!fn) {
      // PATH 上のスクリプト（例: /usr/local/bin/backup.sh）
      for (const dir of (this.env.PATH || '').split(':')) {
        if (!dir) continue;
        const p = (dir.endsWith('/') ? dir : dir + '/') + name;
        let node;
        try { node = this.vfs.lookup(p, '/', this.user); } catch { continue; }
        if (node.type === 'f' && !node.content.startsWith('\u007fELF')) return this.execPath(p, argv.slice(1), ctx);
      }
      ctx.err(`${name}: command not found\n`);
      return 127;
    }
    try {
      const r = fn(argv.slice(1), ctx);
      return typeof r === 'number' ? r : 0;
    } catch (e) {
      if (e instanceof LoopSignal) throw e;
      if (e instanceof FsError) { ctx.err(`${name}: ${e.path}: ${ERRMSG[e.code] || e.code}\n`); return 1; }
      if (e && e.name === 'OptError') { ctx.err(`${name}: ${e.message}\nTry 'man ${name}' for more information.\n`); return 2; }
      ctx.err(`${name}: 内部エラー: ${e.message}\n`);
      return 1;
    }
  }

  /** ./script.sh のようなパス指定の実行 */
  execPath(path, args, ctx) {
    let node;
    try { node = this.vfs.lookup(path, this.cwd, this.user); }
    catch (e) { ctx.err(`bash: ${path}: ${fsMsg(e)}\n`); return e.code === 'ENOENT' ? 127 : 126; }
    if (node.type === 'd') { ctx.err(`bash: ${path}: Is a directory\n`); return 126; }
    if (!this.vfs.can(node, this.user, 1)) { ctx.err(`bash: ${path}: Permission denied\n`); return 126; }
    if (node.content.startsWith('\u007fELF')) {
      // バイナリはコマンド名として実行
      const base = path.split('/').pop();
      const fn = this.commands[base];
      if (fn) return this.exec([base, ...args], ctx);
      ctx.err(`bash: ${path}: このシミュレーターではバイナリの実行は再現していません\n`);
      return 126;
    }
    if (!this.vfs.can(node, this.user, 4)) { ctx.err(`bash: ${path}: Permission denied\n`); return 126; }
    return this.runScript(node.content, args, ctx, path);
  }

  /**
   * スクリプト/複合コマンドの実行器。
   * 対応: if/elif/else/fi, for VAR in WORDS; do ... done, while/until, break/continue,
   *       exit, 変数代入, $(...) / $((...)), test / [ ] / [[ ]]
   * 非対応(明示エラー): case, 関数定義, { } グループ, here-doc, read/リダイレクト付きループ
   */
  runScript(content, args, ctx, name = 'script', { interactive = false } = {}) {
    if (this.depth >= MAX_DEPTH) { ctx.err(`bash: ${name}: 再帰が深すぎます\n`); return 1; }
    const savedPos = this.positional, savedCwd = this.cwd, savedExit = this.exitRequested;
    this.positional = args; this.depth++; this.exitRequested = false;
    let code = 0;
    try {
      const stmts = splitScript(content);
      code = this.execStmts(stmts, 0, stmts.length, ctx, name, { steps: 0, loops: 0 });
    } catch (e) {
      if (e instanceof ScriptError || e instanceof ShellSyntaxError) { ctx.err(`${name}: ${e.message}\n`); code = 2; }
      else if (e instanceof LoopSignal) { ctx.err(`${name}: ${e.kind}: ループの外では使えません\n`); code = 1; }
      else throw e;
    } finally {
      this.positional = savedPos; this.depth--; this.exitRequested = savedExit;
      if (!interactive) { this.cwd = savedCwd; this.env.PWD = savedCwd; } // スクリプトはサブシェルで動く
    }
    return code;
  }

  runStmt(text, ctx) {
    const chunks = this.run(text, { record: false, noRoute: true });
    for (const c of chunks) (c.fd === 2 ? ctx.err : ctx.out)(c.text);
    if (chunks.loopSignal) throw chunks.loopSignal;
    return this.lastCode;
  }

  execStmts(stmts, from, to, ctx, name, st) {
    let code = this.lastCode;
    let i = from;
    while (i < to) {
      if (this.exitRequested) break;
      if (++st.steps > MAX_SCRIPT_STEPS) throw new ScriptError('実行ステップ数の上限を超えました（無限ループの可能性）');
      const s = stmts[i];
      const kw = s.split(/\s/, 1)[0];
      if (kw === 'if') { const end = blockEnd(stmts, i, 'fi'); code = this.execIf(stmts, i, end, ctx, name, st); i = end + 1; continue; }
      if (kw === 'for') { const end = blockEnd(stmts, i, 'done'); code = this.execFor(stmts, i, end, ctx, name, st); i = end + 1; continue; }
      if (kw === 'while' || kw === 'until') { const end = blockEnd(stmts, i, 'done'); code = this.execWhile(stmts, i, end, ctx, name, st); i = end + 1; continue; }
      if (kw === 'break' || kw === 'continue') throw new LoopSignal(kw);
      if (['then', 'else', 'elif', 'fi', 'do', 'done'].includes(kw)) throw new ScriptError(`構文エラー: 予期しない '${kw}' の近く`);
      if (['case', 'esac', 'function', '{', '}', 'select'].includes(kw)) throw new ScriptError(`'${kw}' はこのシミュレーターでは未対応です`);
      if (/^[A-Za-z_][A-Za-z0-9_]*\(\)/.test(s)) throw new ScriptError('関数定義はこのシミュレーターでは未対応です');
      code = this.runStmt(s, ctx);
      i++;
    }
    return code;
  }

  execIf(stmts, i, end, ctx, name, st) {
    // 分岐を収集: [{cond, from, to}]（else は cond=null）
    const branches = [];
    let j = i;
    while (j < end) {
      const kw = stmts[j].split(/\s/, 1)[0];
      const cond = kw === 'else' ? null : stmts[j].slice(kw.length).trim();
      if (kw !== 'else') { if (stmts[j + 1] !== 'then') throw new ScriptError("構文エラー: 'then' が必要です"); }
      const bodyFrom = kw === 'else' ? j + 1 : j + 2;
      let k = bodyFrom, depth = 0;
      for (; k < end; k++) {
        const w = stmts[k].split(/\s/, 1)[0];
        if (w === 'if') depth++;
        else if (w === 'fi') depth--;
        else if (depth === 0 && (w === 'elif' || w === 'else')) break;
      }
      branches.push({ cond, from: bodyFrom, to: k });
      j = k;
    }
    for (const b of branches) {
      if (b.cond === null || this.runStmt(b.cond, ctx) === 0) return this.execStmts(stmts, b.from, b.to, ctx, name, st);
    }
    return 0;
  }

  loopBody(stmts, from, to, ctx, name, st) {
    try { this.execStmts(stmts, from, to, ctx, name, st); }
    catch (e) { if (e instanceof LoopSignal) return e.kind; throw e; }
    return null;
  }

  execFor(stmts, i, end, ctx, name, st) {
    const m = stmts[i].match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+in(?:\s+(.*))?)?$/s);
    if (!m) throw new ScriptError('構文エラー: for VAR in WORDS の形式が必要です');
    if (stmts[i + 1] !== 'do') throw new ScriptError("構文エラー: 'do' が必要です");
    const items = [];
    if (m[2] === undefined && !/\sin\b/.test(stmts[i])) items.push(...this.positional);
    else for (const t of tokenize(m[2] || '')) { if (t.word) items.push(...this.expandWord(t.word)); }
    let code = 0;
    this.loopDepth++;
    try {
      for (const item of items) {
        if (++st.loops > MAX_SCRIPT_STEPS) throw new ScriptError('ループ回数の上限を超えました');
        this.env[m[1]] = item;
        const sig = this.loopBody(stmts, i + 2, end, ctx, name, st);
        if (sig === 'break') break;
        if (this.exitRequested) break;
        code = this.lastCode;
      }
    } finally { this.loopDepth--; }
    return code;
  }

  execWhile(stmts, i, end, ctx, name, st) {
    const kw = stmts[i].split(/\s/, 1)[0];
    const cond = stmts[i].slice(kw.length).trim();
    if (stmts[i + 1] !== 'do') throw new ScriptError("構文エラー: 'do' が必要です");
    let code = 0;
    this.loopDepth++;
    try {
      for (;;) {
        if (++st.loops > MAX_SCRIPT_STEPS) throw new ScriptError('ループ回数の上限を超えました（無限ループの可能性）');
        const c = this.runStmt(cond, ctx);
        if (kw === 'while' ? c !== 0 : c === 0) break;
        const sig = this.loopBody(stmts, i + 2, end, ctx, name, st);
        if (sig === 'break') break;
        if (this.exitRequested) break;
        code = this.lastCode;
      }
    } finally { this.loopDepth--; }
    return code;
  }

  /** 補完候補 */
  complete(line) {
    const m = line.match(/(\S*)$/);
    const cur = m ? m[1] : '';
    const before = line.slice(0, line.length - cur.length);
    const isCmd = /^\s*(sudo\s+)?$/.test(before) || /[|;&]\s*$/.test(before);
    let cands = [];
    if (isCmd && !cur.includes('/')) {
      cands = Object.keys(this.commands).filter(c => c.startsWith(cur)).sort();
    } else {
      const slash = cur.lastIndexOf('/');
      const dirPart = slash >= 0 ? cur.slice(0, slash + 1) : '';
      const filePart = slash >= 0 ? cur.slice(slash + 1) : cur;
      const dirAbs = dirPart === '' ? this.cwd : this.vfs.abs(dirPart.replace(/^~/, this.user.home), this.cwd) || '/';
      try {
        const dir = this.vfs.lookup(dirAbs, '/', this.user);
        if (dir.type === 'd' && this.vfs.can(dir, this.user, 4)) {
          cands = Object.keys(dir.children)
            .filter(n => n.startsWith(filePart) && (filePart.startsWith('.') || !n.startsWith('.')))
            .sort()
            .map(n => dirPart + n + (dir.children[n].type === 'd' ? '/' : ''));
        }
      } catch { /* 候補なし */ }
    }
    return { before, cur, cands };
  }
}

function quoteAll(s) { return s.replace(/[\s\S]/g, ch => (/[*?[\]]/.test(ch) ? '\u0000' + ch : ch)); }
export function fsMsg(e) { return e instanceof FsError ? (ERRMSG[e.code] || e.code) : String(e.message || e); }

class ScriptError extends Error {}
export class LoopSignal extends Error { constructor(kind) { super(kind); this.kind = kind; } }

// 対応する閉じキーワード(fi/done)の位置を探す
function blockEnd(stmts, i, close) {
  const opens = close === 'fi' ? ['if'] : ['for', 'while', 'until'];
  let depth = 0;
  for (let j = i; j < stmts.length; j++) {
    const w = stmts[j].split(/\s/, 1)[0];
    if (opens.includes(w)) depth++;
    else if (w === close) { depth--; if (depth === 0) return j; }
  }
  throw new ScriptError(`構文エラー: 対応する '${close}' がありません`);
}

/**
 * スクリプト本文を「文」の配列に分割する。
 * 改行と ; で分割（クォート・$( )・バッククォート内は除く）、# コメントを除去し、
 * then / do / else / fi / done は単独の文として切り出す。
 */
export function splitScript(text) {
  const stmts = [];
  let buf = '', i = 0, inS = false, inD = false, paren = 0, btick = false;
  const pushStmt = (t) => {
    t = t.trim();
    while (t) {
      let m = t.match(/^(then|do|else)(?:\s+([\s\S]*))?$/);
      if (!m) m = t.match(/^(fi|done)(?:\s+([\s\S]*))?$/);
      if (!m) break;
      stmts.push(m[1]); t = (m[2] || '').trim();
    }
    if (t) stmts.push(t);
  };
  const boundary = () => { pushStmt(buf); buf = ''; };
  while (i < text.length) {
    const c = text[i], prev = text[i - 1];
    if (inS) { buf += c; if (c === "'") inS = false; i++; continue; }
    if (c === '\\') {
      if (text[i + 1] === '\n') { i += 2; continue; }
      buf += c + (text[i + 1] ?? ''); i += 2; continue;
    }
    if (inD) { buf += c; if (c === '"') inD = false; i++; continue; }
    if (c === "'") { inS = true; buf += c; i++; continue; }
    if (c === '"') { inD = true; buf += c; i++; continue; }
    if (c === '`') { btick = !btick; buf += c; i++; continue; }
    if (c === '(' && prev === '$') paren++;
    else if (c === '(' && paren > 0) paren++;
    else if (c === ')' && paren > 0) paren--;
    const top = paren === 0 && !btick;
    if (c === '#' && top && (i === 0 || /[\s;]/.test(prev))) { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (top && c === ';') { boundary(); i++; continue; }
    if (top && c === '\n') {
      if (/(&&|\|\||\|)\s*$/.test(buf)) { buf += ' '; i++; continue; } // 行末の && || | は継続
      boundary(); i++; continue;
    }
    buf += c; i++;
  }
  boundary();
  return stmts;
}
