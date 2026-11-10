// ============================================================
// コマンド実装。すべて仮想FS上の操作のみ。
// 各コマンドは (args, ctx) を受け取り終了コード(数値)を返す。
// ctx: { sh, stdin, out(text), err(text) }
// ============================================================
import { FsError, ERRMSG, modeString, lsDate, isoDate, nodeSize } from './vfs.js';
import { escapeRe } from './shell.js';
import { MANPAGES } from './manpages.js';

function fsMsg(e) { return e instanceof FsError ? (ERRMSG[e.code] || e.code) : String(e && e.message || e); }

// オプション解析: spec 例 { l:'bool', n:'val', '--color':'optval' }
function parseOpts(args, spec = {}, { stopAtNonOption = false } = {}) {
  const opts = {};
  const operands = [];
  let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { i++; break; }
    if (a.length > 2 && a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq >= 0 ? a.slice(0, eq) : a;
      if (spec[key] === 'val' || spec[key] === 'optval') {
        opts[key] = eq >= 0 ? a.slice(eq + 1) : (spec[key] === 'val' ? args[++i] : true);
      } else if (spec[key] === 'bool') opts[key] = true;
      else return { error: `unrecognized option '${a}'` };
      continue;
    }
    if (a.length > 1 && a[0] === '-' && a !== '-') {
      let j = 1;
      for (; j < a.length; j++) {
        const f = a[j];
        if (spec[f] === 'bool') opts[f] = true;
        else if (spec[f] === 'val') {
          const val = a.slice(j + 1);
          if (val) opts[f] = val;
          else opts[f] = args[++i];
          j = a.length; break;
        } else return { error: `invalid option -- '${f}'` };
      }
      continue;
    }
    if (stopAtNonOption) break;
    operands.push(a);
  }
  for (; i < args.length; i++) operands.push(args[i]);
  return { opts, operands };
}

function resolve(ctx, p) { return ctx.sh.vfs.abs(p, ctx.sh.cwd); }
function lookup(ctx, p, o) { return ctx.sh.vfs.lookup(p, ctx.sh.cwd, ctx.sh.user, o); }

// ---------------- ファイル・ディレクトリ ----------------
export function makeCommands(getCmds) {
  const C = {};

  C.pwd = (args, ctx) => { ctx.out(ctx.sh.cwd + '\n'); return 0; };

  C.cd = (args, ctx) => {
    let target = args[0];
    if (!target || target === '~') target = ctx.sh.user.home;
    else if (target === '-') target = ctx.sh.env.OLDPWD || ctx.sh.cwd;
    else if (target.startsWith('~/')) target = ctx.sh.user.home + target.slice(1);
    try {
      const node = lookup(ctx, target);
      if (node.type !== 'd') { ctx.err(`bash: cd: ${target}: Not a directory\n`); return 1; }
      if (!ctx.sh.vfs.can(node, ctx.sh.user, 1)) { ctx.err(`bash: cd: ${target}: Permission denied\n`); return 1; }
      ctx.sh.env.OLDPWD = ctx.sh.cwd;
      ctx.sh.cwd = resolve(ctx, target);
      ctx.sh.env.PWD = ctx.sh.cwd;
      return 0;
    } catch (e) { ctx.err(`bash: cd: ${target}: ${fsMsg(e)}\n`); return 1; }
  };

  C.ls = (args, ctx) => {
    const { opts, operands, error } = parseOpts(args, { l: 'bool', a: 'bool', A: 'bool', h: 'bool', R: 'bool', t: 'bool', r: 'bool', S: 'bool', d: 'bool', i: 'bool', 1: 'bool', F: 'bool' });
    if (error) { ctx.err(`ls: ${error}\n`); return 2; }
    const paths = operands.length ? operands : ['.'];
    const vfs = ctx.sh.vfs, user = ctx.sh.user;
    let code = 0;
    const multiple = paths.length > 1;
    const dirsToList = [];
    const filesToShow = [];
    for (const p of paths) {
      try {
        const node = lookup(ctx, p);
        if (node.type === 'd' && !opts.d) dirsToList.push({ p, node });
        else filesToShow.push({ p, name: p, node });
      } catch (e) { ctx.err(`ls: cannot access '${p}': ${fsMsg(e)}\n`); code = 2; }
    }
    const fmtEntry = (name, node, showName) => {
      let suffix = '';
      if (opts.F) suffix = node.type === 'd' ? '/' : ((node.mode & 0o111) && node.type === 'f' ? '*' : '');
      if (opts.l) {
        const size = nodeSize(node);
        const links = node.type === 'd' ? 2 : 1;
        const sz = opts.h ? humanSize(size) : String(size);
        return `${modeString(node)} ${links} ${vfs.uname(node.uid).padEnd(8)} ${vfs.gname(node.gid).padEnd(8)} ${sz.padStart(opts.h ? 5 : 6)} ${lsDate(node.mtime)} ${showName}${suffix}`;
      }
      return showName + suffix;
    };
    const listDir = (p, node, header) => {
      if (!vfs.can(node, user, 4)) { ctx.err(`ls: cannot open directory '${p}': Permission denied\n`); code = 2; return; }
      if (header) ctx.out(`${p}:\n`);
      let names = Object.keys(node.children);
      if (opts.a) names.push('.', '..');
      else if (!opts.A) names = names.filter(n => !n.startsWith('.'));
      else names = names.filter(n => !n.startsWith('.') || opts.A);
      if (opts.a || opts.A) names = names.filter(n => opts.a || (n !== '.' && n !== '..'));
      const getNode = n => n === '.' ? node : n === '..' ? node : node.children[n];
      names.sort((a, b) => {
        let r;
        if (opts.S) r = nodeSize(getNode(b)) - nodeSize(getNode(a));
        else if (opts.t) r = getNode(b).mtime - getNode(a).mtime;
        else r = a.localeCompare(b);
        return opts.r ? -r : r;
      });
      if (opts.l) {
        ctx.out(`total ${names.length}\n`);
        for (const n of names) ctx.out(fmtEntry(n, getNode(n), n) + '\n');
      } else if (opts['1'] || opts.l) {
        for (const n of names) ctx.out(fmtEntry(n, getNode(n), n) + '\n');
      } else {
        ctx.out(names.map(n => {
          let s = n; if (opts.F) { const nd = getNode(n); s += nd.type === 'd' ? '/' : ((nd.mode & 0o111) ? '*' : ''); }
          return s;
        }).join('  ') + (names.length ? '\n' : ''));
      }
      if (opts.R) {
        for (const n of names.filter(n => n !== '.' && n !== '..')) {
          const ch = node.children[n];
          if (ch && ch.type === 'd') { ctx.out('\n'); listDir(p === '/' ? '/' + n : p + '/' + n, ch, true); }
        }
      }
    };
    if (filesToShow.length) {
      if (opts.l) for (const f of filesToShow) ctx.out(fmtEntry(f.name, f.node, f.name) + '\n');
      else ctx.out(filesToShow.map(f => f.name).join('  ') + '\n');
    }
    dirsToList.forEach((d, i) => {
      if (filesToShow.length && i === 0) ctx.out('\n');
      listDir(d.p, d.node, multiple || opts.R);
    });
    return code;
  };

  C.cat = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { n: 'bool', A: 'bool', E: 'bool', b: 'bool' });
    let code = 0;
    const sources = operands.length ? operands : ['-'];
    let line = 0;
    const emit = (text) => {
      if (opts.n || opts.b) {
        for (const l of text.split('\n').slice(0, -1)) {
          line++; ctx.out(String(line).padStart(6) + '\t' + l + '\n');
        }
      } else ctx.out(opts.E ? text.replace(/\n/g, '$\n') : text);
    };
    for (const p of sources) {
      if (p === '-') { emit(ctx.stdin); continue; }
      try { emit(ctx.sh.vfs.readFile(p, ctx.sh.cwd, ctx.sh.user)); }
      catch (e) { ctx.err(`cat: ${p}: ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.tac = (args, ctx) => {
    const data = args.length ? safeRead(ctx, args[0], 'tac') : ctx.stdin;
    if (data == null) return 1;
    const lines = data.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    ctx.out(lines.reverse().join('\n') + (lines.length ? '\n' : ''));
    return 0;
  };

  const pager = (args, ctx, name) => {
    let code = 0;
    const srcs = args.filter(a => !a.startsWith('-'));
    if (!srcs.length) { ctx.out(ctx.stdin); return 0; }
    for (const p of srcs) {
      try { ctx.out(ctx.sh.vfs.readFile(p, ctx.sh.cwd, ctx.sh.user)); }
      catch (e) { ctx.err(`${name}: ${p}: ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };
  C.less = (a, c) => pager(a, c, 'less');
  C.more = (a, c) => pager(a, c, 'more');

  C.head = (args, ctx) => headtail(args, ctx, 'head');
  C.tail = (args, ctx) => headtail(args, ctx, 'tail');
  function headtail(args, ctx, name) {
    const { opts, operands } = parseOpts(args, { n: 'val', c: 'val', f: 'bool', q: 'bool' });
    let n = 10;
    if (opts.n != null) { n = parseInt(opts.n, 10); if (isNaN(n)) { ctx.err(`${name}: invalid number\n`); return 1; } }
    const srcs = operands.length ? operands : ['-'];
    let code = 0;
    const multi = srcs.length > 1 && !opts.q;
    srcs.forEach((p, idx) => {
      let data;
      if (p === '-') data = ctx.stdin;
      else { data = safeRead(ctx, p, name); if (data == null) { code = 1; return; } }
      if (multi) ctx.out(`${idx ? '\n' : ''}==> ${p} <==\n`);
      const lines = data.split('\n');
      const hadTrailing = lines[lines.length - 1] === '';
      if (hadTrailing) lines.pop();
      let sel;
      if (name === 'head') sel = lines.slice(0, n);
      else sel = n >= 0 ? lines.slice(Math.max(0, lines.length - n)) : lines.slice(-n - 1);
      ctx.out(sel.map(l => l + '\n').join(''));
    });
    return code;
  }

  C.grep = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { i: 'bool', v: 'bool', n: 'bool', c: 'bool', r: 'bool', R: 'bool', E: 'bool', o: 'bool', l: 'bool', w: 'bool', H: 'bool', h: 'bool', F: 'bool', q: 'bool', a: 'bool' }, { stopAtNonOption: true });
    let pattern = opts.e;
    const ops = [...operands];
    if (pattern == null) pattern = ops.shift();
    if (pattern == null) { ctx.err('grep: 検索パターンがありません\n'); return 2; }
    let re;
    try {
      let pat = opts.F ? escapeRe(pattern) : pattern;
      if (opts.w) pat = `\\b(?:${pat})\\b`;
      re = new RegExp(pat, opts.i ? 'gi' : 'g');
    } catch (e) { ctx.err(`grep: 無効な正規表現: ${e.message}\n`); return 2; }
    const recursive = opts.r || opts.R;
    let matched = false;
    let code = 1;
    const vfs = ctx.sh.vfs;
    const searchText = (data, label) => {
      let count = 0;
      const lines = data.split('\n');
      if (lines[lines.length - 1] === '') lines.pop();
      lines.forEach((ln, i) => {
        re.lastIndex = 0;
        const hit = re.test(ln);
        if (hit !== !!opts.v) {
          matched = true; code = 0; count++;
          if (opts.q || opts.l || opts.c) return;
          const prefix = (label && (opts.H || recursive || opts.H)) ? label + ':' : '';
          if (opts.o && !opts.v) {
            re.lastIndex = 0; let m;
            while ((m = re.exec(ln))) { ctx.out(prefix + (opts.n ? (i + 1) + ':' : '') + m[0] + '\n'); if (m.index === re.lastIndex) re.lastIndex++; }
          } else {
            ctx.out(prefix + (opts.n ? (i + 1) + ':' : '') + ln + '\n');
          }
        }
      });
      if (opts.c && !opts.q) ctx.out((label ? label + ':' : '') + count + '\n');
      if (opts.l && count && !opts.q) ctx.out(label + '\n');
      return count;
    };
    if (!ops.length || ops[0] === '-') { searchText(ctx.stdin, opts.H ? '(standard input)' : ''); return opts.q ? (matched ? 0 : 1) : code; }
    for (const p of ops) {
      let node;
      try { node = lookup(ctx, p); } catch (e) { ctx.err(`grep: ${p}: ${fsMsg(e)}\n`); code = code === 0 ? 0 : 2; continue; }
      if (node.type === 'd') {
        if (!recursive) { ctx.err(`grep: ${p}: Is a directory\n`); continue; }
        vfs.walk(resolve(ctx, p), node, ctx.sh.user,
          (path, nd) => { if (nd.type === 'f') searchText(nd.special === 'null' ? '' : nd.content, path); },
          path => ctx.err(`grep: ${path}: Permission denied\n`));
      } else {
        const data = safeRead(ctx, p, 'grep'); if (data == null) { code = 2; continue; }
        searchText(data, (ops.length > 1 || recursive || opts.H) && !opts.h ? p : '');
      }
    }
    return opts.q ? (matched ? 0 : 1) : code;
  };

  C.find = (args, ctx) => {
    const paths = [];
    let i = 0;
    for (; i < args.length; i++) { if (args[i].startsWith('-') || args[i] === '!' || args[i] === '(') break; paths.push(args[i]); }
    if (!paths.length) paths.push('.');
    const tests = args.slice(i);
    const vfs = ctx.sh.vfs, user = ctx.sh.user;
    let code = 0;
    // 述語を関数に変換
    const preds = [];
    const actions = [];
    for (let k = 0; k < tests.length; k++) {
      const t = tests[k];
      const val = () => tests[++k];
      if (t === '-name') { const pat = globRe(val()); preds.push((p, n, name) => pat.test(name)); }
      else if (t === '-iname') { const pat = globRe(val(), true); preds.push((p, n, name) => pat.test(name)); }
      else if (t === '-type') { const ty = val(); preds.push((p, n) => (ty === 'f' ? n.type === 'f' : ty === 'd' ? n.type === 'd' : ty === 'l' ? n.type === 'l' : true)); }
      else if (t === '-maxdepth') { ctx._maxdepth = parseInt(val(), 10); }
      else if (t === '-mindepth') { ctx._mindepth = parseInt(val(), 10); }
      else if (t === '-perm') { const spec = val(); preds.push((p, n) => permMatch(n.mode, spec)); }
      else if (t === '-user') { const u = val(); const uu = vfs.userByName(u); preds.push((p, n) => n.uid === (uu ? uu.uid : parseInt(u, 10))); }
      else if (t === '-group') { const g = val(); const gg = vfs.groupByName(g); preds.push((p, n) => n.gid === (gg ? gg.gid : parseInt(g, 10))); }
      else if (t === '-size') { const spec = val(); preds.push((p, n) => sizeMatch(nodeSize(n), spec)); }
      else if (t === '-empty') { preds.push((p, n) => n.type === 'f' ? n.content === '' : Object.keys(n.children).length === 0); }
      else if (t === '-print') { /* default */ }
      else if (t === '-type') { }
      else if (t === '-o' || t === '-a' || t === '!' || t === '(' || t === ')') { /* 簡易: AND のみ対応 */ }
      else { ctx.err(`find: 未対応の述語 '${t}' は無視します\n`); }
    }
    const maxd = ctx._maxdepth ?? Infinity;
    const mind = ctx._mindepth ?? 0;
    delete ctx._maxdepth; delete ctx._mindepth;
    for (const start of paths) {
      let node;
      try { node = lookup(ctx, start); } catch (e) { ctx.err(`find: '${start}': ${fsMsg(e)}\n`); code = 1; continue; }
      vfs.walk(resolve(ctx, start), node, user,
        (path, nd, depth) => {
          if (depth < mind || depth > maxd) return;
          const name = path === '/' ? '/' : path.split('/').pop();
          if (preds.every(fn => fn(path, nd, name))) ctx.out(path + '\n');
        },
        path => { ctx.err(`find: '${path}': Permission denied\n`); code = 1; },
        0, maxd);
    }
    return code;
  };

  C.file = (args, ctx) => {
    let code = 0;
    for (const p of args.filter(a => !a.startsWith('-'))) {
      try {
        const node = lookup(ctx, p);
        let desc;
        if (node.type === 'd') desc = 'directory';
        else if (node.special === 'null') desc = 'character special';
        else if (node.content === '') desc = 'empty';
        else if (node.content.startsWith('\u007fELF')) desc = 'ELF 64-bit LSB executable';
        else if (node.content.startsWith('#!')) desc = `a ${node.content.slice(2).split('\n')[0].trim()} script, ASCII text executable`;
        else if (/[\x00-\x08\x0e-\x1f]/.test(node.content)) desc = 'data';
        else desc = 'ASCII text';
        ctx.out(`${p}: ${desc}\n`);
      } catch (e) { ctx.err(`${p}: cannot open \`${p}' (${fsMsg(e)})\n`); code = 1; }
    }
    return code;
  };

  C.stat = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { c: 'val' });
    let code = 0;
    for (const p of operands) {
      try {
        const node = lookup(ctx, p);
        const vfs = ctx.sh.vfs;
        if (opts.c) {
          ctx.out(opts.c
            .replace(/%n/g, p).replace(/%s/g, nodeSize(node))
            .replace(/%a/g, (node.mode & 0o7777).toString(8))
            .replace(/%U/g, vfs.uname(node.uid)).replace(/%G/g, vfs.gname(node.gid))
            .replace(/%F/g, node.type === 'd' ? 'directory' : 'regular file') + '\n');
        } else {
          const m = node.mode & 0o7777;
          ctx.out(`  File: ${p}\n  Size: ${nodeSize(node)}\tBlocks: 8\t${node.type === 'd' ? 'directory' : 'regular file'}\n`);
          ctx.out(`Access: (0${m.toString(8).padStart(3, '0')}/${modeString(node)})  Uid: (${String(node.uid).padStart(5)}/${vfs.uname(node.uid).padStart(8)})   Gid: (${String(node.gid).padStart(5)}/${vfs.gname(node.gid).padStart(8)})\n`);
          ctx.out(`Modify: ${isoDate(node.mtime)}\n`);
        }
      } catch (e) { ctx.err(`stat: cannot stat '${p}': ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.touch = (args, ctx) => {
    const { operands } = parseOpts(args, { c: 'bool', a: 'bool', m: 'bool' });
    let code = 0;
    for (const p of operands) {
      try {
        const node = lookup(ctx, p, { allowMissing: true });
        if (node) node.mtime = ctx.sh.vfs.now();
        else ctx.sh.vfs.writeFile(p, ctx.sh.cwd, ctx.sh.user, '');
      } catch (e) { ctx.err(`touch: cannot touch '${p}': ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.mkdir = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { p: 'bool', v: 'bool', m: 'val' });
    let code = 0;
    for (const p of operands) {
      try { ctx.sh.vfs.mkdir(p, ctx.sh.cwd, ctx.sh.user, { parents: opts.p }); if (opts.v) ctx.out(`mkdir: created directory '${p}'\n`); }
      catch (e) { if (opts.p && e.code === 'EEXIST') continue; ctx.err(`mkdir: cannot create directory '${p}': ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.rmdir = (args, ctx) => {
    let code = 0;
    for (const p of args.filter(a => !a.startsWith('-'))) {
      try { ctx.sh.vfs.rmdir(p, ctx.sh.cwd, ctx.sh.user); }
      catch (e) { ctx.err(`rmdir: failed to remove '${p}': ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.rm = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { r: 'bool', R: 'bool', f: 'bool', v: 'bool', i: 'bool' });
    const recursive = opts.r || opts.R;
    let code = 0;
    for (const p of operands) {
      try {
        const node = lookup(ctx, p, { allowMissing: true });
        if (!node) { if (!opts.f) { ctx.err(`rm: cannot remove '${p}': No such file or directory\n`); code = 1; } continue; }
        ctx.sh.vfs.remove(p, ctx.sh.cwd, ctx.sh.user, { recursive });
        if (opts.v) ctx.out(`removed '${p}'\n`);
      } catch (e) { if (opts.f && e.code === 'ENOENT') continue; ctx.err(`rm: cannot remove '${p}': ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.cp = (args, ctx) => copymove(args, ctx, 'cp');
  C.mv = (args, ctx) => copymove(args, ctx, 'mv');
  function copymove(args, ctx, name) {
    const { opts, operands } = parseOpts(args, { r: 'bool', R: 'bool', f: 'bool', v: 'bool', i: 'bool', a: 'bool', p: 'bool' });
    const recursive = opts.r || opts.R || opts.a;
    const vfs = ctx.sh.vfs, user = ctx.sh.user;
    if (operands.length < 2) { ctx.err(`${name}: missing destination file operand after '${operands[0] || ''}'\n`); return 1; }
    const dest = operands.pop();
    let destNode = null;
    try { destNode = lookup(ctx, dest); } catch { /* 存在しない */ }
    const destIsDir = destNode && destNode.type === 'd';
    if (operands.length > 1 && !destIsDir) { ctx.err(`${name}: target '${dest}' is not a directory\n`); return 1; }
    let code = 0;
    for (const src of operands) {
      try {
        const srcNode = lookup(ctx, src);
        const base = src.replace(/\/+$/, '').split('/').pop();
        const targetPath = destIsDir ? (dest.replace(/\/$/, '') + '/' + base) : dest;
        if (srcNode.type === 'd' && !recursive) { ctx.err(`${name}: -r not specified; omitting directory '${src}'\n`); code = 1; continue; }
        if (name === 'cp') {
          if (!vfs.can(srcNode, user, 4)) throw new FsError('EACCES', src);
          const { parent, name: nm } = vfs.parentOf(targetPath, ctx.sh.cwd, user);
          if (parent.children[nm] && parent.children[nm].type === 'd' && srcNode.type !== 'd') throw new FsError('EISDIR', targetPath);
          if (!vfs.can(parent, user, 3) && !parent.children[nm]) throw new FsError('EACCES', targetPath);
          const clone = vfs.cloneNode(srcNode, (opts.p || opts.a) ? null : user);
          if (opts.p || opts.a) { clone.uid = srcNode.uid; clone.gid = srcNode.gid; clone.mode = srcNode.mode; }
          parent.children[nm] = clone;
        } else {
          const { parent: sp, name: sn } = vfs.parentOf(src, ctx.sh.cwd, user);
          vfs.checkRemove(sp, srcNode, user, src);
          const { parent: dp, name: dn } = vfs.parentOf(targetPath, ctx.sh.cwd, user);
          if (!vfs.can(dp, user, 3) && !dp.children[dn]) throw new FsError('EACCES', targetPath);
          delete sp.children[sn];
          dp.children[dn] = srcNode;
          dp.mtime = vfs.now();
        }
        if (opts.v) ctx.out(`'${src}' -> '${targetPath}'\n`);
      } catch (e) { ctx.err(`${name}: cannot ${name === 'cp' ? 'copy' : 'move'} '${src}': ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  }

  C.ln = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { s: 'bool', f: 'bool' });
    if (operands.length < 2) { ctx.err('ln: missing file operand\n'); return 1; }
    ctx.err('ln: このシミュレーターではハードリンク/シンボリックリンクの作成は簡略化されています（cp で代替）\n');
    return C.cp([operands[0], operands[1]], ctx);
  };

  // ---------------- 権限・所有者 ----------------
  C.chmod = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { R: 'bool', v: 'bool' });
    const spec = operands.shift();
    if (spec == null || !operands.length) { ctx.err('chmod: missing operand\n'); return 1; }
    const vfs = ctx.sh.vfs, user = ctx.sh.user;
    let code = 0;
    const apply = (node, path) => {
      if (user.uid !== 0 && node.uid !== user.uid) { ctx.err(`chmod: changing permissions of '${path}': Operation not permitted\n`); code = 1; return; }
      const nm = computeMode(node.mode, spec);
      if (nm == null) { ctx.err(`chmod: invalid mode: '${spec}'\n`); code = 1; return; }
      node.mode = (node.mode & ~0o7777) | nm;
      if (opts.v) ctx.out(`mode of '${path}' changed to 0${nm.toString(8).padStart(3, '0')}\n`);
    };
    for (const p of operands) {
      try {
        const node = lookup(ctx, p);
        apply(node, resolve(ctx, p));
        if (opts.R && node.type === 'd') vfs.walk(resolve(ctx, p), node, user, (pp, nd) => { if (pp !== resolve(ctx, p)) apply(nd, pp); }, () => {});
      } catch (e) { ctx.err(`chmod: cannot access '${p}': ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.chown = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { R: 'bool', v: 'bool' });
    const spec = operands.shift();
    const vfs = ctx.sh.vfs, user = ctx.sh.user;
    if (user.uid !== 0) { ctx.err(`chown: changing ownership of '${operands[0] || ''}': Operation not permitted\n`); return 1; }
    const [uname, gname] = spec.split(':');
    const u = uname ? vfs.userByName(uname) : null;
    const g = gname ? vfs.groupByName(gname) : null;
    if (uname && !u) { ctx.err(`chown: invalid user: '${spec}'\n`); return 1; }
    if (gname && !g) { ctx.err(`chown: invalid group: '${spec}'\n`); return 1; }
    let code = 0;
    const apply = (node) => { if (u) node.uid = u.uid; if (g) node.gid = g.gid; else if (uname && uname.includes(':')) {} };
    for (const p of operands) {
      try {
        const node = lookup(ctx, p); apply(node);
        if (opts.R && node.type === 'd') vfs.walk(resolve(ctx, p), node, user, (pp, nd) => apply(nd), () => {});
      } catch (e) { ctx.err(`chown: cannot access '${p}': ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.chgrp = (args, ctx) => {
    const operands = args.filter(a => !a.startsWith('-'));
    const g = operands.shift();
    return C.chown([`:${g}`, ...operands], ctx);
  };

  // ---------------- ユーザー情報 ----------------
  C.whoami = (args, ctx) => { ctx.out(ctx.sh.user.name + '\n'); return 0; };
  C.id = (args, ctx) => {
    const vfs = ctx.sh.vfs;
    const target = args.find(a => !a.startsWith('-'));
    const u = target ? vfs.userByName(target) : ctx.sh.user;
    if (!u) { ctx.err(`id: '${target}': no such user\n`); return 1; }
    const grps = vfs.gidsOf(u).map(gid => `${gid}(${vfs.gname(gid)})`);
    ctx.out(`uid=${u.uid}(${u.name}) gid=${u.gid}(${vfs.gname(u.gid)}) groups=${grps.join(',')}\n`);
    return 0;
  };
  C.groups = (args, ctx) => {
    const u = ctx.sh.user;
    ctx.out(ctx.sh.vfs.gidsOf(u).map(g => ctx.sh.vfs.gname(g)).join(' ') + '\n'); return 0;
  };
  C.su = (args, ctx) => { ctx.err('su: このシミュレーターではユーザー切り替えは sudo で再現しています\n'); return 1; };

  C.sudo = (args, ctx) => {
    if (!args.length) { ctx.err('usage: sudo command\n'); return 1; }
    if (args[0] === '-l') { ctx.out(ctx.sh.sudoAllowed ? `User ${ctx.sh.user.name} may run the following commands:\n    (ALL : ALL) ALL\n` : `${ctx.sh.user.name} is not allowed to run sudo on ${ctx.sh.hostname}.\n`); return 0; }
    if (!ctx.sh.sudoAllowed) { ctx.err(`${ctx.sh.user.name} is not in the sudoers file. This incident will be reported.\n`); return 1; }
    const savedUser = ctx.sh.user;
    const root = ctx.sh.vfs.userByName('root') || { name: 'root', uid: 0, gid: 0, home: '/root', shell: '/bin/bash' };
    ctx.sh.user = root;
    try { return ctx.sh.exec(args, ctx); }
    finally { ctx.sh.user = savedUser; }
  };

  C.passwd = (args, ctx) => { ctx.out('パスワード変更はこのシミュレーターでは省略されています。\n'); return 0; };

  // ---------------- プロセス・サービス ----------------
  C.ps = (args, ctx) => {
    const showAll = args.some(a => a.includes('a') || a.includes('e') || a === 'aux' || a.includes('x'));
    const procs = ctx.sh.processes;
    if (args.includes('aux') || args.some(a => a.startsWith('-') && a.includes('u')) || args.includes('u')) {
      ctx.out('USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n');
      for (const p of procs) {
        if (!showAll && p.user !== ctx.sh.user.name) continue;
        ctx.out(`${p.user.padEnd(8)} ${String(p.pid).padStart(5)} ${(p.cpu ?? 0).toFixed(1).padStart(4)} ${(p.mem ?? 0).toFixed(1).padStart(4)} ${String(p.vsz ?? 1000).padStart(6)} ${String(p.rss ?? 500).padStart(5)} ${(p.tty || '?').padEnd(8)} ${(p.stat || 'Ss').padEnd(4)} ${(p.start || '09:00').padEnd(5)} ${(p.time || '0:00').padStart(5)} ${p.cmd}\n`);
      }
    } else {
      ctx.out('    PID TTY          TIME CMD\n');
      for (const p of procs) {
        if (!showAll && p.user !== ctx.sh.user.name) continue;
        ctx.out(`${String(p.pid).padStart(7)} ${(p.tty || '?').padEnd(8)} ${(p.time || '00:00:00').padStart(8)} ${p.cmd.split(' ')[0].split('/').pop()}\n`);
      }
    }
    return 0;
  };

  C.pgrep = (args, ctx) => {
    const pat = args.find(a => !a.startsWith('-'));
    let found = 0;
    for (const p of ctx.sh.processes) if (p.cmd.includes(pat)) { ctx.out(p.pid + '\n'); found++; }
    return found ? 0 : 1;
  };

  C.top = (args, ctx) => {
    ctx.out('top - 10:12:03 up 27 days,  1:12,  1 user,  load average: 0.08, 0.03, 0.01\n');
    ctx.out(`Tasks: ${ctx.sh.processes.length} total\n\n`);
    ctx.out('  PID USER      %CPU %MEM COMMAND\n');
    for (const p of [...ctx.sh.processes].sort((a, b) => (b.cpu || 0) - (a.cpu || 0)).slice(0, 10))
      ctx.out(`${String(p.pid).padStart(5)} ${p.user.padEnd(8)} ${(p.cpu || 0).toFixed(1).padStart(5)} ${(p.mem || 0).toFixed(1).padStart(4)} ${p.cmd}\n`);
    return 0;
  };

  C.kill = (args, ctx) => {
    const { operands } = parseOpts(args, { 9: 'bool', s: 'val', l: 'bool' });
    let code = 0;
    for (const t of operands.filter(x => /^\d+$/.test(x))) {
      const pid = parseInt(t, 10);
      const idx = ctx.sh.processes.findIndex(p => p.pid === pid);
      if (idx < 0) { ctx.err(`kill: (${pid}): No such process\n`); code = 1; continue; }
      const proc = ctx.sh.processes[idx];
      if (proc.user !== ctx.sh.user.name && ctx.sh.user.uid !== 0) { ctx.err(`kill: (${pid}): Operation not permitted\n`); code = 1; continue; }
      ctx.sh.processes.splice(idx, 1);
    }
    return code;
  };
  C.pkill = (args, ctx) => {
    const pat = args.find(a => !a.startsWith('-'));
    let n = 0;
    ctx.sh.processes = ctx.sh.processes.filter(p => {
      if (p.cmd.includes(pat) && (p.user === ctx.sh.user.name || ctx.sh.user.uid === 0)) { n++; return false; }
      return true;
    });
    return n ? 0 : 1;
  };

  C.systemctl = (args, ctx) => {
    const sub = args[0];
    const svc = (args[1] || '').replace(/\.service$/, '');
    const services = ctx.sh.services;
    const find = () => services.find(s => s.name === svc);
    if (sub === 'status') {
      const s = find();
      if (!s) { ctx.err(`Unit ${svc}.service could not be found.\n`); return 4; }
      ctx.out(`● ${s.name}.service - ${s.desc || s.name}\n   Loaded: loaded (/lib/systemd/system/${s.name}.service; ${s.enabled ? 'enabled' : 'disabled'})\n   Active: ${s.active ? 'active (running)' : 'inactive (dead)'}\n`);
      return s.active ? 0 : 3;
    }
    if (['start', 'stop', 'restart', 'enable', 'disable'].includes(sub)) {
      const s = find();
      if (!s) { ctx.err(`Failed to ${sub} ${svc}.service: Unit not found.\n`); return 5; }
      if (ctx.sh.user.uid !== 0) { ctx.err(`Failed to ${sub} ${svc}.service: Access denied\n==== AUTHENTICATION FAILED ====\n`); return 1; }
      if (sub === 'start' || sub === 'restart') s.active = true;
      if (sub === 'stop') s.active = false;
      if (sub === 'enable') s.enabled = true;
      if (sub === 'disable') s.enabled = false;
      return 0;
    }
    if (sub === 'list-units' || sub === 'list-unit-files') {
      for (const s of services) ctx.out(`${(s.name + '.service').padEnd(28)} ${s.enabled ? 'enabled ' : 'disabled'} ${s.active ? 'active' : 'inactive'}\n`);
      return 0;
    }
    ctx.err(`Unknown command verb ${sub}.\n`); return 1;
  };
  C.service = (args, ctx) => C.systemctl([args[1], args[0]], ctx);

  // ---------------- テキスト処理 ----------------
  C.echo = (args, ctx) => {
    let nl = true;
    let interpret = false;
    let i = 0;
    while (args[i] === '-n' || args[i] === '-e' || args[i] === '-E') { if (args[i] === '-n') nl = false; if (args[i] === '-e') interpret = true; if (args[i] === '-E') interpret = false; i++; }
    let s = args.slice(i).join(' ');
    if (interpret) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    ctx.out(s + (nl ? '\n' : ''));
    return 0;
  };
  C.printf = (args, ctx) => {
    const fmt = args[0] || '';
    let ai = 1;
    const out = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/%[sd]/g, () => args[ai++] ?? '');
    ctx.out(out);
    return 0;
  };

  C.wc = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { l: 'bool', w: 'bool', c: 'bool', m: 'bool' });
    const any = opts.l || opts.w || opts.c || opts.m;
    const count = (data) => {
      const lines = (data.match(/\n/g) || []).length;
      const words = (data.trim().match(/\S+/g) || []).length;
      const bytes = data.length;
      let parts = [];
      if (!any || opts.l) parts.push(String(lines).padStart(any && Object.keys(opts).length === 1 ? 0 : 7));
      if (!any || opts.w) parts.push(String(words).padStart(any && Object.keys(opts).length === 1 ? 0 : 7));
      if (!any || opts.c || opts.m) parts.push(String(bytes).padStart(any && Object.keys(opts).length === 1 ? 0 : 7));
      return parts.join(' ');
    };
    if (!operands.length) { ctx.out(count(ctx.stdin) + '\n'); return 0; }
    let code = 0;
    for (const p of operands) {
      const data = safeRead(ctx, p, 'wc'); if (data == null) { code = 1; continue; }
      ctx.out(count(data) + ' ' + p + '\n');
    }
    return code;
  };

  C.sort = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { r: 'bool', n: 'bool', u: 'bool', f: 'bool', k: 'val', t: 'val', h: 'bool' });
    let data = operands.length ? safeRead(ctx, operands[0], 'sort') : ctx.stdin;
    if (data == null) return 1;
    let lines = data.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const keyOf = (line) => {
      if (opts.k) { const col = parseInt(opts.k, 10); const sep = opts.t || /\s+/; const parts = opts.t ? line.split(opts.t) : line.trim().split(/\s+/); return parts.slice(col - 1).join(' '); }
      return line;
    };
    lines.sort((a, b) => {
      let ka = keyOf(a), kb = keyOf(b);
      if (opts.f) { ka = ka.toLowerCase(); kb = kb.toLowerCase(); }
      let r;
      if (opts.n) r = (parseFloat(ka) || 0) - (parseFloat(kb) || 0);
      else r = ka < kb ? -1 : ka > kb ? 1 : 0;
      return opts.r ? -r : r;
    });
    if (opts.u) lines = lines.filter((l, i) => i === 0 || keyOf(l) !== keyOf(lines[i - 1]));
    ctx.out(lines.map(l => l + '\n').join(''));
    return 0;
  };

  C.uniq = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { c: 'bool', d: 'bool', u: 'bool', i: 'bool' });
    let data = operands.length ? safeRead(ctx, operands[0], 'uniq') : ctx.stdin;
    if (data == null) return 1;
    const lines = data.split('\n');
    const had = lines[lines.length - 1] === '';
    if (had) lines.pop();
    const groups = [];
    for (const l of lines) {
      const key = opts.i ? l.toLowerCase() : l;
      const last = groups[groups.length - 1];
      if (last && (opts.i ? last.line.toLowerCase() : last.line) === key) last.n++;
      else groups.push({ line: l, n: 1 });
    }
    for (const g of groups) {
      if (opts.d && g.n < 2) continue;
      if (opts.u && g.n > 1) continue;
      ctx.out((opts.c ? String(g.n).padStart(7) + ' ' : '') + g.line + '\n');
    }
    return 0;
  };

  C.cut = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { d: 'val', f: 'val', c: 'val', s: 'bool' });
    let data = operands.length ? safeRead(ctx, operands[0], 'cut') : ctx.stdin;
    if (data == null) return 1;
    const delim = opts.d ?? '\t';
    const lines = data.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const ranges = parseRanges(opts.f || opts.c);
    for (const line of lines) {
      if (opts.f != null) {
        if (!line.includes(delim)) { if (!opts.s) ctx.out(line + '\n'); continue; }
        const parts = line.split(delim);
        ctx.out(ranges.filter(i => i >= 1 && i <= parts.length).map(i => parts[i - 1]).join(delim) + '\n');
      } else if (opts.c != null) {
        ctx.out(ranges.filter(i => i >= 1 && i <= line.length).map(i => line[i - 1]).join('') + '\n');
      }
    }
    return 0;
  };

  C.tr = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { d: 'bool', s: 'bool', c: 'bool' });
    let data = ctx.stdin;
    const set1 = expandSet(operands[0] || '');
    const set2 = expandSet(operands[1] || '');
    let out = '';
    if (opts.d) out = data.split('').filter(ch => !set1.includes(ch)).join('');
    else {
      out = data.split('').map(ch => { const i = set1.indexOf(ch); return i >= 0 ? (set2[Math.min(i, set2.length - 1)] || '') : ch; }).join('');
    }
    if (opts.s) out = out.replace(/(.)\1+/g, '$1');
    ctx.out(out);
    return 0;
  };

  C.sed = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { n: 'bool', i: 'bool', e: 'val', E: 'bool', r: 'bool' });
    let script = opts.e;
    const ops = [...operands];
    if (script == null) script = ops.shift();
    let data = ops.length ? safeRead(ctx, ops[0], 'sed') : ctx.stdin;
    if (data == null) return 1;
    const lines = data.split('\n');
    const had = lines[lines.length - 1] === '';
    if (had) lines.pop();
    // 対応: s/old/new/flags, Np, Nd, /re/d, /re/p
    const m = script.match(/^s(.)(.*?)\1(.*?)\1([gip0-9]*)$/);
    let outLines = [];
    try {
      if (m) {
        const [, , pat, rep, flags] = m;
        const re = new RegExp(pat, flags.includes('g') ? (flags.includes('i') ? 'gi' : 'g') : (flags.includes('i') ? 'i' : ''));
        const repl = rep.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        for (const l of lines) {
          const r = l.replace(re, repl.replace(/&/g, '$$&'));
          if (flags.includes('p')) { if (!opts.n) outLines.push(l); outLines.push(r); }
          else outLines.push(r);
        }
        if (flags.includes('p') && opts.n) outLines = lines.map(l => l.replace(re, repl)).filter((_, i) => re.test(lines[i]));
      } else if (/^\d+d$/.test(script)) {
        const n = parseInt(script, 10); outLines = lines.filter((_, i) => i + 1 !== n);
      } else if (/d$/.test(script) && script.startsWith('/')) {
        const re = new RegExp(script.slice(1, script.lastIndexOf('/')));
        outLines = lines.filter(l => !re.test(l));
      } else if (/^\d+p$/.test(script) && opts.n) {
        const n = parseInt(script, 10); if (lines[n - 1] != null) outLines = [lines[n - 1]];
      } else { ctx.err(`sed: このシミュレーターでは一部のスクリプトのみ対応しています (${script})\n`); return 1; }
    } catch (e) { ctx.err(`sed: -e 式 #1 の解釈に失敗: ${e.message}\n`); return 1; }
    const result = outLines.map(l => l + '\n').join('');
    if (opts.i && ops.length) { try { ctx.sh.vfs.writeFile(ops[0], ctx.sh.cwd, ctx.sh.user, result); } catch (e) { ctx.err(`sed: ${fsMsg(e)}\n`); return 1; } }
    else ctx.out(result);
    return 0;
  };

  C.awk = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { F: 'val' });
    const prog = operands.shift();
    let data = operands.length ? safeRead(ctx, operands[0], 'awk') : ctx.stdin;
    if (data == null) return 1;
    const FS = opts.F || /\s+/;
    const lines = data.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    // 対応: '{print $N}', '{print $N, $M}', '/re/{print...}', 'NR==N', '{print}'
    const bodyMatch = prog.match(/^\s*(?:\/([^/]*)\/)?\s*(?:\{(.*)\})?\s*$/);
    let reFilter = null, body = 'print';
    if (bodyMatch) { if (bodyMatch[1]) reFilter = new RegExp(bodyMatch[1]); if (bodyMatch[2] != null) body = bodyMatch[2].trim(); }
    const condMatch = prog.match(/^\s*(NR|NF)\s*(==|>|<|>=|<=)\s*(\d+)\s*(?:\{(.*)\})?\s*$/);
    lines.forEach((line, idx) => {
      const trimmed = opts.F ? line : line.trim();
      const fields = opts.F ? line.split(FS) : (line.trim() === '' ? [] : line.trim().split(FS));
      const NR = idx + 1, NF = fields.length;
      let pass = true;
      if (reFilter) pass = reFilter.test(line);
      if (condMatch) {
        const lhs = condMatch[1] === 'NR' ? NR : NF;
        const rhs = parseInt(condMatch[3], 10);
        const op = condMatch[2];
        pass = op === '==' ? lhs === rhs : op === '>' ? lhs > rhs : op === '<' ? lhs < rhs : op === '>=' ? lhs >= rhs : lhs <= rhs;
        if (condMatch[4] != null) body = condMatch[4].trim();
        else body = 'print';
      }
      if (!pass) return;
      const printMatch = body.match(/^print\s*(.*)$/);
      if (printMatch != null) {
        const arg = printMatch[1].trim();
        if (!arg) { ctx.out(line + '\n'); return; }
        const parts = arg.split(',').map(tok => {
          tok = tok.trim();
          if (tok === '$0') return line;
          if (tok === '$NF') return fields[NF - 1] ?? '';
          if (tok === '$(NF-1)') return fields[NF - 2] ?? '';
          const fm = tok.match(/^\$(\d+)$/);
          if (fm) return fields[parseInt(fm[1], 10) - 1] ?? '';
          if (tok === 'NR') return String(NR);
          if (tok === 'NF') return String(NF);
          return tok.replace(/^"|"$/g, '');
        });
        ctx.out(parts.join(' ') + '\n');
      }
    });
    return 0;
  };

  C.tee = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { a: 'bool' });
    ctx.out(ctx.stdin);
    let code = 0;
    for (const p of operands) {
      try { ctx.sh.vfs.writeFile(p, ctx.sh.cwd, ctx.sh.user, ctx.stdin, { append: opts.a }); }
      catch (e) { ctx.err(`tee: ${p}: ${fsMsg(e)}\n`); code = 1; }
    }
    return code;
  };

  C.rev = (args, ctx) => {
    const data = args.length ? safeRead(ctx, args[0], 'rev') : ctx.stdin;
    if (data == null) return 1;
    const lines = data.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    ctx.out(lines.map(l => l.split('').reverse().join('') + '\n').join(''));
    return 0;
  };

  C.nl = (args, ctx) => {
    const data = args.filter(a => !a.startsWith('-')).length ? safeRead(ctx, args.filter(a => !a.startsWith('-'))[0], 'nl') : ctx.stdin;
    if (data == null) return 1;
    const lines = data.split('\n'); if (lines[lines.length - 1] === '') lines.pop();
    let n = 0;
    ctx.out(lines.map(l => (l.trim() === '' ? '       \t' + l : String(++n).padStart(6) + '\t' + l) + '\n').join(''));
    return 0;
  };

  C.xargs = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { n: 'val', I: 'val' });
    const items = ctx.stdin.split(/\s+/).filter(Boolean);
    const cmd = operands.length ? operands : ['echo'];
    if (opts.I) {
      for (const it of items) { const line = cmd.map(c => c.replace(new RegExp(escapeRe(opts.I), 'g'), it)).join(' '); const chunks = ctx.sh.run(line, { record: false }); for (const c of chunks) (c.fd === 2 ? ctx.err : ctx.out)(c.text); }
    } else {
      const line = cmd.join(' ') + ' ' + items.join(' ');
      const chunks = ctx.sh.run(line, { record: false });
      for (const c of chunks) (c.fd === 2 ? ctx.err : ctx.out)(c.text);
    }
    return 0;
  };

  // ---------------- 環境変数 ----------------
  C.env = (args, ctx) => { for (const [k, v] of Object.entries(ctx.sh.env)) ctx.out(`${k}=${v}\n`); return 0; };
  C.printenv = (args, ctx) => {
    if (args.length) { const v = ctx.sh.env[args[0]]; if (v == null) return 1; ctx.out(v + '\n'); return 0; }
    return C.env(args, ctx);
  };
  C.export = (args, ctx) => {
    if (!args.length) return C.env(args, ctx);
    for (const a of args) { const m = a.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s); if (m) ctx.sh.env[m[1]] = m[2]; }
    return 0;
  };
  C.unset = (args, ctx) => { for (const a of args) delete ctx.sh.env[a]; return 0; };
  C.set = (args, ctx) => { for (const [k, v] of Object.entries(ctx.sh.env)) ctx.out(`${k}=${v}\n`); return 0; };
  C.alias = (args, ctx) => { ctx.out(''); return 0; };
  C.source = (args, ctx) => {
    const data = safeRead(ctx, args[0], 'source'); if (data == null) return 1;
    return ctx.sh.runScript(data, args.slice(1), ctx, args[0]);
  };
  C['.'] = C.source;
  C.history = (args, ctx) => { ctx.sh.history.forEach((h, i) => ctx.out(String(i + 1).padStart(5) + '  ' + h + '\n')); return 0; };

  // ---------------- 日付・その他 ----------------
  C.date = (args, ctx) => {
    const d = new Date(ctx.sh.vfs.clock);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = n => String(n).padStart(2, '0');
    const fmt = args.find(a => a.startsWith('+'));
    if (fmt) {
      ctx.out(fmt.slice(1).replace(/%Y/g, d.getUTCFullYear()).replace(/%m/g, pad(d.getUTCMonth() + 1)).replace(/%d/g, pad(d.getUTCDate())).replace(/%H/g, pad(d.getUTCHours())).replace(/%M/g, pad(d.getUTCMinutes())).replace(/%S/g, pad(d.getUTCSeconds())) + '\n');
    } else {
      ctx.out(`${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC ${d.getUTCFullYear()}\n`);
    }
    return 0;
  };
  C.uptime = (args, ctx) => { ctx.out(' 10:12:03 up 27 days,  1:12,  1 user,  load average: 0.08, 0.03, 0.01\n'); return 0; };
  C.uname = (args, ctx) => {
    const all = args.some(a => a.includes('a'));
    if (all) ctx.out(`Linux ${ctx.sh.hostname} 5.15.0-generic #72-Ubuntu SMP x86_64 GNU/Linux\n`);
    else if (args.some(a => a.includes('r'))) ctx.out('5.15.0-generic\n');
    else ctx.out('Linux\n');
    return 0;
  };
  C.hostname = (args, ctx) => { ctx.out(ctx.sh.hostname + '\n'); return 0; };
  C.clear = (args, ctx) => { ctx.out('\u001b[CLEAR]'); return 0; };
  C.sleep = (args, ctx) => 0;
  C.true = () => 0;
  C.false = () => 1;
  C.yes = (args, ctx) => { ctx.out((args[0] || 'y') + '\n'); return 0; };
  C.seq = (args, ctx) => {
    const nums = args.map(Number);
    let start = 1, end, step = 1;
    if (nums.length === 1) end = nums[0];
    else if (nums.length === 2) { start = nums[0]; end = nums[1]; }
    else { start = nums[0]; step = nums[1]; end = nums[2]; }
    let out = '';
    for (let i = start; step > 0 ? i <= end : i >= end; i += step) out += i + '\n';
    ctx.out(out);
    return 0;
  };
  C.basename = (args, ctx) => { let b = (args[0] || '').replace(/\/+$/, '').split('/').pop(); if (args[1] && b.endsWith(args[1])) b = b.slice(0, -args[1].length); ctx.out(b + '\n'); return 0; };
  C.dirname = (args, ctx) => { const p = (args[0] || '').replace(/\/+$/, ''); const i = p.lastIndexOf('/'); ctx.out((i <= 0 ? (i === 0 ? '/' : '.') : p.slice(0, i)) + '\n'); return 0; };
  C.which = (args, ctx) => {
    let code = 0;
    for (const a of args) {
      if (C[a]) ctx.out('/usr/bin/' + a + '\n');
      else {
        let found = false;
        for (const dir of (ctx.sh.env.PATH || '').split(':')) { if (ctx.sh.vfs.exists((dir + '/' + a), '/')) { ctx.out(dir + '/' + a + '\n'); found = true; break; } }
        if (!found) code = 1;
      }
    }
    return code;
  };

  C.md5sum = (args, ctx) => hashCmd(args, ctx, 'md5');
  C.sha256sum = (args, ctx) => hashCmd(args, ctx, 'sha256');
  C.sha1sum = (args, ctx) => hashCmd(args, ctx, 'sha1');
  function hashCmd(args, ctx, algo) {
    let code = 0;
    const srcs = args.filter(a => !a.startsWith('-'));
    const list = srcs.length ? srcs : ['-'];
    for (const p of list) {
      let data;
      if (p === '-') data = ctx.stdin;
      else { data = safeRead(ctx, p, algo + 'sum'); if (data == null) { code = 1; continue; } }
      ctx.out(`${simpleHash(data, algo)}  ${p}\n`);
    }
    return code;
  }
  C.base64 = (args, ctx) => {
    const decode = args.some(a => a === '-d' || a === '--decode');
    const srcs = args.filter(a => !a.startsWith('-'));
    const data = srcs.length ? safeRead(ctx, srcs[0], 'base64') : ctx.stdin;
    if (data == null) return 1;
    try {
      if (decode) ctx.out(b64decode(data.trim()));
      else { const enc = b64encode(data); ctx.out(enc.replace(/(.{76})/g, '$1\n').replace(/\n$/, '') + '\n'); }
    } catch (e) { ctx.err('base64: invalid input\n'); return 1; }
    return 0;
  };

  C.man = (args, ctx) => {
    const name = args.find(a => !a.startsWith('-'));
    if (!name) { ctx.err('What manual page do you want?\n'); return 1; }
    const page = MANPAGES[name];
    if (!page) { ctx.err(`No manual entry for ${name}\n`); return 16; }
    ctx.out(page + '\n');
    return 0;
  };
  C.help = (args, ctx) => {
    ctx.out('利用可能なコマンド:\n');
    ctx.out(Object.keys(getCmds()).filter(c => c !== '.').sort().join('  ') + '\n');
    ctx.out("詳しくは 'man <コマンド>' を参照してください。\n");
    return 0;
  };
  C.exit = (args, ctx) => { ctx.sh.exitRequested = true; return parseInt(args[0] || '0', 10) || 0; };
  C.logout = C.exit;

  C.du = (args, ctx) => {
    const { opts, operands } = parseOpts(args, { s: 'bool', h: 'bool', a: 'bool' });
    const paths = operands.length ? operands : ['.'];
    const vfs = ctx.sh.vfs;
    let code = 0;
    const sizeOf = (node) => {
      if (node.type !== 'd') return nodeSize(node);
      let total = 4096;
      for (const c of Object.values(node.children)) total += sizeOf(c);
      return total;
    };
    const fmt = (bytes) => opts.h ? humanSize(bytes) : String(Math.ceil(bytes / 1024));
    for (const p of paths) {
      let node;
      try { node = lookup(ctx, p); } catch (e) { ctx.err(`du: cannot access '${p}': ${fsMsg(e)}\n`); code = 1; continue; }
      if (node.type === 'd' && !opts.s) {
        for (const name of Object.keys(node.children).sort()) {
          const child = node.children[name];
          if (child.type === 'd' || opts.a) {
            const cp = p === '.' ? './' + name : (p.endsWith('/') ? p + name : p + '/' + name);
            ctx.out(`${fmt(sizeOf(child))}\t${cp}\n`);
          }
        }
      }
      ctx.out(`${fmt(sizeOf(node))}\t${p}\n`);
    }
    return code;
  };

  C.df = (args, ctx) => {
    const h = args.some(a => a.includes('h'));
    if (h) {
      ctx.out('Filesystem      Size  Used Avail Use% Mounted on\n');
      ctx.out('/dev/vda1        20G   14G  5.2G  73% /\n');
      ctx.out('tmpfs           2.0G     0  2.0G   0% /dev/shm\n');
    } else {
      ctx.out('Filesystem     1K-blocks     Used Available Use% Mounted on\n');
      ctx.out('/dev/vda1       20511356 14680064   5452096  73% /\n');
      ctx.out('tmpfs            2048000        0   2048000   0% /dev/shm\n');
    }
    return 0;
  };

  C.crontab = (args, ctx) => {
    if (args.includes('-l')) {
      try { ctx.out(ctx.sh.vfs.readFile(`/var/spool/cron/crontabs/${ctx.sh.user.name}`, '/', ctx.sh.user)); return 0; }
      catch { ctx.out(`no crontab for ${ctx.sh.user.name}\n`); return 1; }
    }
    ctx.err('crontab: 対話編集はこのシミュレーターでは未対応です。/etc/crontab や /var/spool/cron を直接確認してください。\n');
    return 1;
  };

  return C;
}

// ---------- helpers ----------
function safeRead(ctx, p, cmd) {
  try {
    const node = lookup(ctx, p);
    if (node.type === 'd') { ctx.err(`${cmd}: ${p}: Is a directory\n`); return null; }
    return ctx.sh.vfs.readFile(p, ctx.sh.cwd, ctx.sh.user);
  } catch (e) { ctx.err(`${cmd}: ${p}: ${fsMsg(e)}\n`); return null; }
}
function humanSize(n) {
  if (n < 1024) return String(n);
  const u = ['K', 'M', 'G', 'T']; let i = -1; let v = n;
  do { v /= 1024; i++; } while (v >= 1024 && i < u.length - 1);
  return (v < 10 ? v.toFixed(1) : Math.round(v)) + u[i];
}
function parseRanges(spec) {
  const out = [];
  if (!spec) return out;
  for (const part of spec.split(',')) {
    if (part.includes('-')) { const [a, b] = part.split('-'); const lo = parseInt(a || '1', 10); const hi = parseInt(b || '999', 10); for (let i = lo; i <= hi; i++) out.push(i); }
    else out.push(parseInt(part, 10));
  }
  return out;
}
function expandSet(s) {
  s = s.replace(/\[:alpha:\]/g, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
       .replace(/\[:digit:\]/g, '0123456789').replace(/\[:space:\]/g, ' \t\n')
       .replace(/\[:upper:\]/g, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ').replace(/\[:lower:\]/g, 'abcdefghijklmnopqrstuvwxyz');
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i + 1] === '-' && s[i + 2]) { for (let c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) out.push(String.fromCharCode(c)); i += 2; }
    else if (s[i] === '\\' && s[i + 1] === 'n') { out.push('\n'); i++; }
    else if (s[i] === '\\' && s[i + 1] === 't') { out.push('\t'); i++; }
    else out.push(s[i]);
  }
  return out;
}
function globRe(glob, ci) {
  let re = '^';
  for (const c of glob) { if (c === '*') re += '.*'; else if (c === '?') re += '.'; else re += escapeRe(c); }
  return new RegExp(re + '$', ci ? 'i' : '');
}
function permMatch(mode, spec) {
  const m = mode & 0o7777;
  if (spec.startsWith('-')) { const want = parseInt(spec.slice(1), 8); return (m & want) === want; }
  if (spec.startsWith('/')) { const want = parseInt(spec.slice(1), 8); return (m & want) !== 0; }
  return m === parseInt(spec, 8);
}
function sizeMatch(bytes, spec) {
  let mult = 1, s = spec;
  const unit = s[s.length - 1];
  if (unit === 'k') { mult = 1024; s = s.slice(0, -1); }
  else if (unit === 'M') { mult = 1024 * 1024; s = s.slice(0, -1); }
  else if (unit === 'c') { mult = 1; s = s.slice(0, -1); }
  const sign = s[0];
  const n = parseInt(s.replace(/^[+-]/, ''), 10) * mult;
  if (sign === '+') return bytes > n;
  if (sign === '-') return bytes < n;
  return Math.ceil(bytes / mult) === Math.ceil(n / mult);
}
function computeMode(cur, spec) {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let mode = cur & 0o7777;
  for (const clause of spec.split(',')) {
    const m = clause.match(/^([ugoa]*)([+\-=])([rwxXst]*)$/);
    if (!m) return null;
    let [, who, op, perms] = m;
    if (!who) who = 'a';
    let mask = 0, special = 0;
    const bit = { r: 4, w: 2, x: 1 };
    for (const ch of perms) {
      if (ch === 'r' || ch === 'w' || ch === 'x') {
        if (who.includes('u') || who.includes('a')) mask |= bit[ch] << 6;
        if (who.includes('g') || who.includes('a')) mask |= bit[ch] << 3;
        if (who.includes('o') || who.includes('a')) mask |= bit[ch];
      } else if (ch === 'X') {
        if ((cur & 0o111) || (cur & 0o40000)) { if (who.includes('u') || who.includes('a')) mask |= 1 << 6; if (who.includes('g') || who.includes('a')) mask |= 1 << 3; if (who.includes('o') || who.includes('a')) mask |= 1; }
      } else if (ch === 's') { if (who.includes('u')) special |= 0o4000; if (who.includes('g')) special |= 0o2000; }
      else if (ch === 't') special |= 0o1000;
    }
    if (op === '+') mode |= (mask | special);
    else if (op === '-') mode &= ~(mask | special);
    else { // '='
      let clear = 0;
      if (who.includes('u') || who.includes('a')) clear |= 0o700;
      if (who.includes('g') || who.includes('a')) clear |= 0o070;
      if (who.includes('o') || who.includes('a')) clear |= 0o007;
      mode = (mode & ~clear) | mask | special;
    }
  }
  return mode;
}

// 教育用の軽量ハッシュ（暗号用途ではない。固定の16進表現を得るため）
function simpleHash(str, algo) {
  const len = algo === 'md5' ? 32 : algo === 'sha1' ? 40 : 64;
  let h = new Array(len / 2).fill(0);
  let acc = algo === 'md5' ? 0x67 : algo === 'sha1' ? 0x1a : 0x6a;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    for (let j = 0; j < h.length; j++) {
      acc = (acc * 31 + c + j * 7 + i) & 0xff;
      h[j] = (h[j] + acc + ((c << (j % 5)) & 0xff)) & 0xff;
    }
  }
  // 追加撹拌
  for (let round = 0; round < 3; round++) for (let j = 0; j < h.length; j++) h[j] = (h[j] * 131 + h[(j + 1) % h.length] + round) & 0xff;
  return h.map(b => b.toString(16).padStart(2, '0')).join('');
}
function b64encode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = []; for (const ch of str) { const c = ch.codePointAt(0); if (c < 0x80) bytes.push(c); else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); } else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); } }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : chars[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : chars[b2 & 63];
  }
  return out;
}
function b64decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  str = str.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    const n = (chars.indexOf(str[i]) << 18) | (chars.indexOf(str[i + 1]) << 12) | ((chars.indexOf(str[i + 2]) & 63) << 6) | (chars.indexOf(str[i + 3]) & 63);
    bytes.push((n >> 16) & 0xff); if (str[i + 2] !== '=' && str[i + 2] !== undefined) bytes.push((n >> 8) & 0xff); if (str[i + 3] !== '=' && str[i + 3] !== undefined) bytes.push(n & 0xff);
  }
  // UTF-8 デコード
  let out = ''; for (let i = 0; i < bytes.length;) { const b = bytes[i]; if (b < 0x80) { out += String.fromCharCode(b); i++; } else if (b < 0xe0) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; } else { out += String.fromCharCode(((b & 0xf) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3; } }
  return out;
}
export { simpleHash, b64encode };
