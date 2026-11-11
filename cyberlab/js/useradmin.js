// ============================================================
// ユーザー・グループ管理コマンド（仮想の /etc/passwd /etc/group /etc/shadow を更新）
// すべて仮想FS上の操作。root 権限（sudo）が必要。
// ============================================================

const NAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

// getopt 風: 結合フラグ(-aG)・値付き(-s /bin/sh, -s/bin/sh, -G g1,g2)に対応
function parseArgs(args, valueFlags, boolFlags) {
  const opts = {}; const operands = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.length > 1 && a[0] === '-' && a !== '--') {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (boolFlags.includes(f)) opts[f] = true;
        else if (valueFlags.includes(f)) { opts[f] = a.length > j + 1 ? a.slice(j + 1) : args[++i]; break; }
        else return { error: `invalid option -- '${f}'` };
      }
    } else operands.push(a);
  }
  return { opts, operands };
}

function shadowLines(vfs) {
  const n = vfs.lookup('/etc/shadow', '/', null, { allowMissing: true });
  return n ? n.content.split('\n').filter(Boolean) : [];
}
function writeShadow(vfs, lines) {
  const n = vfs.lookup('/etc/shadow', '/', null, { allowMissing: true });
  const text = lines.length ? lines.join('\n') + '\n' : '';
  if (n) n.content = text; else vfs.addFile('/etc/shadow', text, { mode: 0o640, owner: 'root', group: 'root' });
}
export function isLocked(vfs, name) {
  const l = shadowLines(vfs).find(x => x.split(':')[0] === name);
  return !!l && (l.split(':')[1] || '').startsWith('!');
}
function setLock(vfs, name, lock) {
  const lines = shadowLines(vfs);
  let found = false;
  const out = lines.map(l => {
    const f = l.split(':');
    if (f[0] !== name) return l;
    found = true;
    const h = f[1] || '';
    f[1] = lock ? (h.startsWith('!') ? h : '!' + h) : h.replace(/^!+/, '');
    return f.join(':');
  });
  if (!found) out.push(`${name}:${lock ? '!' : '*'}:19700:0:99999:7:::`);
  writeShadow(vfs, out);
}

export function makeUserAdminCommands() {
  const U = {};
  const root = (ctx, cmd) => { if (ctx.sh.user.uid !== 0) { ctx.err(`${cmd}: Permission denied.\n${cmd}: cannot lock /etc/passwd; try again later.\n`); return false; } return true; };
  const findGroup = (vfs, spec) => vfs.groupByName(spec) || (/^\d+$/.test(spec) ? vfs.groupById(parseInt(spec, 10)) : null);
  const nextId = (used, start) => { let n = start; while (used.has(n)) n++; return n; };

  U.useradd = (args, ctx) => {
    const vfs = ctx.sh.vfs;
    const { opts, operands, error } = parseArgs(args, ['s', 'g', 'G', 'u', 'd', 'c', 'k'], ['m', 'M', 'r', 'N', 'U']);
    if (error) { ctx.err(`useradd: ${error}\n`); return 2; }
    if (!root(ctx, 'useradd')) return 1;
    const name = operands[0];
    if (!name) { ctx.err('Usage: useradd [options] LOGIN\n'); return 2; }
    if (!NAME_RE.test(name)) { ctx.err(`useradd: invalid user name '${name}'\n`); return 3; }
    if (vfs.userByName(name)) { ctx.err(`useradd: user '${name}' already exists\n`); return 9; }
    const usedUids = new Set(vfs.users.map(u => u.uid));
    let uid;
    if (opts.u != null) {
      uid = parseInt(opts.u, 10);
      if (!Number.isInteger(uid) || uid < 0) { ctx.err(`useradd: invalid user ID '${opts.u}'\n`); return 3; }
      if (usedUids.has(uid)) { ctx.err(`useradd: UID ${uid} is not unique\n`); return 4; }
    } else uid = nextId(usedUids, Math.max(1000, ...vfs.users.filter(u => u.uid < 60000).map(u => u.uid + 1)));
    let gid;
    if (opts.g != null) {
      const g = findGroup(vfs, opts.g);
      if (!g) { ctx.err(`useradd: group '${opts.g}' does not exist\n`); return 6; }
      gid = g.gid;
    } else {
      if (vfs.groupByName(name)) { ctx.err(`useradd: group ${name} exists - if you want to add this user to that group, use -g.\n`); return 9; }
      const usedGids = new Set(vfs.groups.map(g => g.gid));
      gid = usedGids.has(uid) ? nextId(usedGids, 1000) : uid;
      vfs.groups.push({ name, gid, members: [] });
    }
    const extra = [];
    if (opts.G) for (const gn of opts.G.split(',').filter(Boolean)) {
      const g = vfs.groupByName(gn);
      if (!g) { ctx.err(`useradd: group '${gn}' does not exist\n`); return 6; }
      extra.push(g);
    }
    const home = opts.d || (opts.r ? `/var/lib/${name}` : `/home/${name}`);
    vfs.users.push({ name, uid, gid, home, shell: opts.s || '/bin/sh', gecos: opts.c || '' });
    for (const g of extra) if (!g.members.includes(name)) g.members.push(name);
    vfs.syncAccountFiles();
    setLock(vfs, name, true); // パスワード未設定＝ロック状態で作られる
    if (opts.m && !opts.M) {
      vfs.addDir(home, { mode: 0o755, owner: name, group: vfs.gname(gid) });
      vfs.addFile(`${home}/.bashrc`, '# ~/.bashrc\n', { owner: name, group: vfs.gname(gid), mode: 0o644 });
      vfs.addFile(`${home}/.profile`, '# ~/.profile\n', { owner: name, group: vfs.gname(gid), mode: 0o644 });
    }
    return 0;
  };

  U.usermod = (args, ctx) => {
    const vfs = ctx.sh.vfs;
    const { opts, operands, error } = parseArgs(args, ['s', 'g', 'G', 'd', 'c', 'l'], ['a', 'L', 'U']);
    if (error) { ctx.err(`usermod: ${error}\n`); return 2; }
    if (!root(ctx, 'usermod')) return 1;
    const name = operands[0];
    if (!name) { ctx.err('Usage: usermod [options] LOGIN\n'); return 2; }
    const u = vfs.userByName(name);
    if (!u) { ctx.err(`usermod: user '${name}' does not exist\n`); return 6; }
    if (opts.a && opts.G == null) { ctx.err('usermod: option -a は -G と一緒に指定してください\n'); return 2; }
    if (opts.G != null) {
      const wanted = opts.G.split(',').filter(Boolean);
      for (const gn of wanted) if (!vfs.groupByName(gn)) { ctx.err(`usermod: group '${gn}' does not exist\n`); return 6; }
      if (!opts.a) for (const g of vfs.groups) g.members = g.members.filter(m => m !== name); // -a なしは置き換え
      for (const gn of wanted) { const g = vfs.groupByName(gn); if (!g.members.includes(name)) g.members.push(name); }
    }
    if (opts.g != null) { const g = findGroup(vfs, opts.g); if (!g) { ctx.err(`usermod: group '${opts.g}' does not exist\n`); return 6; } u.gid = g.gid; }
    if (opts.s != null) u.shell = opts.s;
    if (opts.d != null) u.home = opts.d;
    if (opts.c != null) u.gecos = opts.c;
    if (opts.l != null) {
      if (!NAME_RE.test(opts.l)) { ctx.err(`usermod: invalid user name '${opts.l}'\n`); return 3; }
      for (const g of vfs.groups) g.members = g.members.map(m => (m === name ? opts.l : m));
      writeShadow(vfs, shadowLines(vfs).map(l => (l.split(':')[0] === name ? [opts.l, ...l.split(':').slice(1)].join(':') : l)));
      u.name = opts.l;
    }
    if (opts.L) setLock(vfs, u.name, true);
    if (opts.U) setLock(vfs, u.name, false);
    vfs.syncAccountFiles();
    return 0;
  };

  U.userdel = (args, ctx) => {
    const vfs = ctx.sh.vfs;
    const { opts, operands, error } = parseArgs(args, [], ['r', 'f']);
    if (error) { ctx.err(`userdel: ${error}\n`); return 2; }
    if (!root(ctx, 'userdel')) return 1;
    const name = operands[0];
    if (!name) { ctx.err('Usage: userdel [options] LOGIN\n'); return 2; }
    const u = vfs.userByName(name);
    if (!u) { ctx.err(`userdel: user '${name}' does not exist\n`); return 6; }
    const proc = ctx.sh.processes.find(p => p.user === name);
    if (proc && !opts.f) { ctx.err(`userdel: user ${name} is currently used by process ${proc.pid}\n`); return 8; }
    vfs.users = vfs.users.filter(x => x.name !== name);
    for (const g of vfs.groups) g.members = g.members.filter(m => m !== name);
    const pg = vfs.groupByName(name);
    if (pg && pg.gid === u.gid && !vfs.users.some(x => x.gid === pg.gid) && !pg.members.length) vfs.groups = vfs.groups.filter(g => g !== pg);
    writeShadow(vfs, shadowLines(vfs).filter(l => l.split(':')[0] !== name));
    vfs.syncAccountFiles();
    if (opts.r) { try { vfs.remove(u.home, '/', null, { recursive: true }); } catch { /* ホームが無い場合は無視 */ } }
    return 0;
  };

  U.groupadd = (args, ctx) => {
    const vfs = ctx.sh.vfs;
    const { opts, operands, error } = parseArgs(args, ['g'], ['r']);
    if (error) { ctx.err(`groupadd: ${error}\n`); return 2; }
    if (!root(ctx, 'groupadd')) return 1;
    const name = operands[0];
    if (!name) { ctx.err('Usage: groupadd [options] GROUP\n'); return 2; }
    if (!NAME_RE.test(name)) { ctx.err(`groupadd: '${name}' is not a valid group name\n`); return 3; }
    if (vfs.groupByName(name)) { ctx.err(`groupadd: group '${name}' already exists\n`); return 9; }
    const used = new Set(vfs.groups.map(g => g.gid));
    let gid;
    if (opts.g != null) { gid = parseInt(opts.g, 10); if (!Number.isInteger(gid) || gid < 0) { ctx.err(`groupadd: invalid group ID '${opts.g}'\n`); return 3; } if (used.has(gid)) { ctx.err(`groupadd: GID '${gid}' already exists\n`); return 4; } }
    else gid = nextId(used, Math.max(1000, ...vfs.groups.filter(g => g.gid < 60000).map(g => g.gid + 1)));
    vfs.groups.push({ name, gid, members: [] });
    vfs.syncAccountFiles();
    return 0;
  };

  U.groupdel = (args, ctx) => {
    const vfs = ctx.sh.vfs;
    if (!root(ctx, 'groupdel')) return 1;
    const name = args.find(a => !a.startsWith('-'));
    if (!name) { ctx.err('Usage: groupdel GROUP\n'); return 2; }
    const g = vfs.groupByName(name);
    if (!g) { ctx.err(`groupdel: group '${name}' does not exist\n`); return 6; }
    const prim = vfs.users.find(u => u.gid === g.gid);
    if (prim) { ctx.err(`groupdel: cannot remove the primary group of user '${prim.name}'\n`); return 8; }
    vfs.groups = vfs.groups.filter(x => x !== g);
    vfs.syncAccountFiles();
    return 0;
  };

  U.gpasswd = (args, ctx) => {
    const vfs = ctx.sh.vfs;
    const { opts, operands, error } = parseArgs(args, ['a', 'd'], []);
    if (error) { ctx.err(`gpasswd: ${error}\n`); return 2; }
    if (!root(ctx, 'gpasswd')) return 1;
    const gname = operands[0];
    const g = gname && vfs.groupByName(gname);
    if (!g) { ctx.err(`gpasswd: group '${gname || ''}' does not exist\n`); return 3; }
    if (opts.a != null) {
      if (!vfs.userByName(opts.a)) { ctx.err(`gpasswd: user '${opts.a}' does not exist\n`); return 3; }
      if (!g.members.includes(opts.a)) g.members.push(opts.a);
      ctx.out(`Adding user ${opts.a} to group ${gname}\n`);
    } else if (opts.d != null) {
      if (!g.members.includes(opts.d)) { ctx.err(`gpasswd: user '${opts.d}' is not a member of '${gname}'\n`); return 3; }
      g.members = g.members.filter(m => m !== opts.d);
      ctx.out(`Removing user ${opts.d} from group ${gname}\n`);
    } else { ctx.err('Usage: gpasswd (-a USER | -d USER) GROUP\n'); return 2; }
    vfs.syncAccountFiles();
    return 0;
  };

  U.passwd = (args, ctx) => {
    const vfs = ctx.sh.vfs;
    const flags = args.filter(a => a.startsWith('-'));
    const target = args.find(a => !a.startsWith('-')) || ctx.sh.user.name;
    const u = vfs.userByName(target);
    if (!u) { ctx.err(`passwd: user '${target}' does not exist\n`); return 1; }
    if (flags.includes('-S')) {
      if (ctx.sh.user.uid !== 0 && target !== ctx.sh.user.name) { ctx.err(`passwd: You may not view or modify password information for ${target}.\n`); return 1; }
      ctx.out(`${target} ${isLocked(vfs, target) ? 'L' : 'P'} 2026-10-14 0 99999 7 -1\n`); return 0;
    }
    if (ctx.sh.user.uid !== 0 && target !== ctx.sh.user.name) { ctx.err(`passwd: You may not view or modify password information for ${target}.\n`); return 1; }
    if (flags.includes('-l') || flags.includes('-u')) {
      if (ctx.sh.user.uid !== 0) { ctx.err('passwd: Permission denied.\n'); return 1; }
      setLock(vfs, target, flags.includes('-l')); ctx.out('passwd: password expiry information changed.\n'); return 0;
    }
    ctx.err('(シミュレーター: パスワードの対話入力は省略され、変更は記録されません)\n');
    ctx.out('passwd: password updated successfully\n');
    return 0;
  };

  return U;
}
