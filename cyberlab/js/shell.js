// ============================================================
// 独自シェル：字句解析 → 構文解析 → 展開 → 実行
// 入力は決して JavaScript として評価しない（eval / Function 不使用）。
// ============================================================
import { FsError, ERRMSG } from './vfs.js';

const MAX_LINE = 4000;
const MAX_OUTPUT = 200000;
const MAX_DEPTH = 8;

export class ShellSyntaxError extends Error {}

// ---------- 字句解析 ----------
// 単語は segment の配列: {k:'lit', v, q} / {k:'var', name, q} / {k:'tilde'}
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
    if (rest.startsWith('(')) throw new ShellSyntaxError('コマンド置換 $(...) はこのシミュレーターでは未対応です');
    push({ k: 'lit', v: '$', q }); i++;
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
        if (d === '`') throw new ShellSyntaxError('コマンド置換 `...` はこのシミュレーターでは未対応です');
        buf += d; i++;
      }
      if (!closed) throw new ShellSyntaxError('unexpected EOF while looking for matching `"\'');
      if (buf) push({ k: 'lit', v: buf, q: true });
      continue;
    }
    if (c === '$') { readVar(false); continue; }
    if (c === '`') throw new ShellSyntaxError('コマンド置換 `...` はこのシミュレーターでは未対応です');
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

  /** 単語を展開して文字列配列にする（グロブ展開を含む） */
  expandWord(word) {
    let text = '';
    let pattern = '';
    let hasGlob = false;
    for (const s of word) {
      if (s.k === 'tilde') { text += this.env.HOME || this.user.home; pattern += quoteAll(this.env.HOME || this.user.home); continue; }
      const v = s.k === 'var' ? this.getVar(s.name) : s.v;
      text += v;
      if (s.q || s.k === 'var') pattern += quoteAll(v);
      else {
        pattern += v;
        if (/[*?[]/.test(v)) hasGlob = true;
      }
    }
    if (hasGlob) {
      const matches = this.glob(pattern);
      if (matches.length) return matches;
    }
    return [text];
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
  run(line, { record = true } = {}) {
    const chunks = [];
    if (line.length > MAX_LINE) {
      chunks.push({ fd: 2, text: 'bash: 入力が長すぎます\n' });
      return chunks;
    }
    if (record && line.trim()) {
      this.history.push(line);
      if (this.history.length > 500) this.history.shift();
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
    for (const item of list) {
      if (item.connector === '&&' && this.lastCode !== 0) continue;
      if (item.connector === '||' && this.lastCode === 0) continue;
      this.lastCode = this.runPipeline(item.pipeline, chunks);
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
      for (const w of cmd.words) argv.push(...this.expandWord(w));
    } catch (e) {
      errChunks.push({ fd: 2, text: `bash: ${e.message}\n` });
      return { out: '', code: 1 };
    }

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

  runScript(content, args, ctx, name = 'script') {
    if (this.depth >= MAX_DEPTH) { ctx.err(`bash: ${name}: 再帰が深すぎます\n`); return 1; }
    const savedPos = this.positional;
    const savedCwd = this.cwd;
    this.positional = args;
    this.depth++;
    let code = 0;
    try {
      for (const raw of content.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        if (/^(if|then|else|elif|fi|for|while|do|done|case|esac|function)\b/.test(line)) {
          ctx.err(`${name}: 制御構文 (${line.split(/\s/)[0]}) はこのシミュレーターでは未対応です。行をスキップします\n`);
          continue;
        }
        if (/^exit\b/.test(line)) { code = parseInt(line.split(/\s+/)[1] || '0', 10) || 0; break; }
        const chunks = this.run(line, { record: false });
        for (const c of chunks) (c.fd === 2 ? ctx.err : ctx.out)(c.text);
        code = this.lastCode;
      }
    } finally {
      this.positional = savedPos;
      this.cwd = savedCwd; // スクリプトはサブシェルで動く
      this.env.PWD = savedCwd;
      this.depth--;
    }
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
