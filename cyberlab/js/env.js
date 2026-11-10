// ============================================================
// ミッション環境ビルダー：ミッション定義(env)からVFS/シェルを構築する
// ============================================================
import { VFS } from './vfs.js';
import { Shell } from './shell.js';
import { makeCommands } from './commands.js';

const DEFAULT_USERS = [
  { name: 'root', uid: 0, gid: 0, home: '/root', shell: '/bin/bash', gecos: 'root' },
  { name: 'daemon', uid: 1, gid: 1, home: '/usr/sbin', shell: '/usr/sbin/nologin', gecos: 'daemon' },
  { name: 'www-data', uid: 33, gid: 33, home: '/var/www', shell: '/usr/sbin/nologin', gecos: 'www-data' },
  { name: 'sshd', uid: 108, gid: 65534, home: '/run/sshd', shell: '/usr/sbin/nologin', gecos: '' },
];
const DEFAULT_GROUPS = [
  { name: 'root', gid: 0, members: [] },
  { name: 'daemon', gid: 1, members: [] },
  { name: 'www-data', gid: 33, members: [] },
  { name: 'sudo', gid: 27, members: [] },
  { name: 'adm', gid: 4, members: [] },
  { name: 'nogroup', gid: 65534, members: [] },
];

export function buildEnvironment(mission) {
  const vfs = new VFS();
  const e = mission.env || {};
  const hostname = e.hostname || 'lab-01';

  // --- users / groups ---
  vfs.users = DEFAULT_USERS.map(u => ({ ...u }));
  vfs.groups = DEFAULT_GROUPS.map(g => ({ ...g, members: [...g.members] }));
  let nextUid = 1000, nextGid = 1000;
  for (const u of (e.users || [])) {
    const gid = u.gid != null ? u.gid : nextGid;
    if (!vfs.groupById(gid)) vfs.groups.push({ name: u.group || u.name, gid, members: [] });
    vfs.users.push({ name: u.name, uid: u.uid != null ? u.uid : nextUid++, gid, home: u.home || `/home/${u.name}`, shell: u.shell || '/bin/bash', gecos: u.gecos || '' });
    if (u.gid == null) nextGid++;
    if (u.sudo) { const sudo = vfs.groupByName('sudo'); if (!sudo.members.includes(u.name)) sudo.members.push(u.name); }
    for (const g of (u.groups || [])) { let grp = vfs.groupByName(g); if (!grp) { grp = { name: g, gid: nextGid++, members: [] }; vfs.groups.push(grp); } if (!grp.members.includes(u.name)) grp.members.push(u.name); }
  }
  for (const g of (e.groups || [])) { if (!vfs.groupByName(g.name)) vfs.groups.push({ name: g.name, gid: g.gid != null ? g.gid : nextGid++, members: g.members || [] }); }

  // プレイヤーをファイル作成前に登録（owner 指定を効かせるため）
  const userName = e.user || 'analyst';
  if (!vfs.userByName(userName)) {
    const gid = nextGid++;
    vfs.groups.push({ name: userName, gid, members: [] });
    vfs.users.push({ name: userName, uid: nextUid++, gid, home: `/home/${userName}`, shell: '/bin/bash', gecos: '' });
    if (e.sudo) { const sudo = vfs.groupByName('sudo'); if (!sudo.members.includes(userName)) sudo.members.push(userName); }
  }

  // --- 基本ディレクトリ構造 ---
  for (const d of ['/bin', '/sbin', '/usr', '/usr/bin', '/usr/sbin', '/usr/local', '/usr/local/bin', '/usr/share', '/lib', '/etc', '/etc/ssh', '/var', '/var/log', '/var/www', '/var/www/html', '/var/spool', '/var/spool/cron', '/var/spool/cron/crontabs', '/opt', '/srv', '/run', '/proc', '/dev', '/mnt', '/boot'])
    vfs.addDir(d);
  vfs.addDir('/root', { mode: 0o700, owner: 'root' });
  vfs.addDir('/tmp', { mode: 0o1777, owner: 'root' });
  vfs.addDir('/home', { mode: 0o755 });
  const nul = vfs.addFile('/dev/null', '', { mode: 0o666 });
  nul.special = 'null';

  // --- /etc 標準ファイル ---
  vfs.addFile('/etc/hostname', hostname + '\n');
  vfs.addFile('/etc/os-release', 'PRETTY_NAME="Ubuntu 22.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="22.04"\nID=ubuntu\n');
  vfs.addFile('/etc/hosts', `127.0.0.1\tlocalhost\n127.0.1.1\t${hostname}\n`);
  rebuildPasswd(vfs);

  // --- 各ユーザーのホーム ---
  for (const u of vfs.users) {
    if (u.uid >= 1000 || u.name === 'root') {
      vfs.addDir(u.home, { mode: u.name === 'root' ? 0o700 : 0o755, owner: u.name, group: vfs.gname(u.gid) });
    }
  }

  // --- クロンのベース ---
  vfs.addFile('/etc/crontab', '# /etc/crontab\nSHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n# m h dom mon dow user\tcommand\n17 *\t* * *\troot\tcd / && run-parts --report /etc/cron.hourly\n', { mode: 0o644 });

  // --- ミッション固有のディレクトリ・ファイル ---
  // e.dirs / e.files は owner 未指定ならプレイヤー所有（ホーム配下の作業を可能にするため）。
  // root 所有にしたい場合は owner を明示する。
  for (const d of (e.dirs || [])) {
    if (typeof d === 'string') vfs.addDir(d, { owner: userName });
    else vfs.addDir(d.path, { mode: d.mode, owner: d.owner || userName, group: d.group });
  }
  for (const f of (e.files || [])) {
    const node = vfs.addFile(f.path, dedent(f.content || ''), { mode: f.mode, owner: f.owner || userName, group: f.group, mtime: f.mtime });
    if (f.special) node.special = f.special;
  }
  rebuildPasswd(vfs, e.shadow);

  // --- プレイヤーのホーム（未作成なら） ---
  if (!vfs.exists(`/home/${userName}`)) vfs.addDir(`/home/${userName}`, { owner: userName, group: userName });
  rebuildPasswd(vfs);
  const player = vfs.userByName(userName);
  const cwd = e.cwd || player.home;

  const commandsRef = {};
  const commands = makeCommands(() => commandsRef);
  Object.assign(commandsRef, commands);

  const shell = new Shell({
    vfs, user: player, cwd, hostname,
    env: e.env || {},
    commands,
    processes: (e.processes || []).map((p, i) => ({ pid: p.pid ?? (900 + i), user: p.user || 'root', cmd: p.cmd, cpu: p.cpu ?? 0, mem: p.mem ?? 0.1, tty: p.tty || '?', stat: p.stat || 'Ss', time: p.time || '0:00', start: p.start || '09:00', vsz: p.vsz, rss: p.rss })),
    services: (e.services || []).map(s => ({ name: s.name, desc: s.desc, active: s.active !== false, enabled: s.enabled !== false })),
    sudo: !!e.sudo,
  });

  // 標準プロセスを先頭に追加
  shell.processes.unshift(
    { pid: 1, user: 'root', cmd: '/sbin/init', cpu: 0, mem: 0.1, tty: '?', stat: 'Ss', time: '0:04' },
  );

  return { vfs, shell, commands };
}

function rebuildPasswd(vfs, shadow) {
  let passwd = '';
  for (const u of [...vfs.users].sort((a, b) => a.uid - b.uid)) passwd += `${u.name}:x:${u.uid}:${u.gid}:${u.gecos || ''}:${u.home}:${u.shell}\n`;
  let group = '';
  for (const g of [...vfs.groups].sort((a, b) => a.gid - b.gid)) group += `${g.name}:x:${g.gid}:${g.members.join(',')}\n`;
  vfs.addFile('/etc/passwd', passwd, { mode: 0o644 });
  vfs.addFile('/etc/group', group, { mode: 0o644 });
  if (shadow) vfs.addFile('/etc/shadow', shadow, { mode: 0o640, owner: 'root', group: 'shadow' });
  else if (!vfs.exists('/etc/shadow')) {
    let sh = '';
    for (const u of [...vfs.users].sort((a, b) => a.uid - b.uid)) sh += `${u.name}:${u.uid === 0 ? '!' : '*'}:19500:0:99999:7:::\n`;
    vfs.addFile('/etc/shadow', sh, { mode: 0o640, owner: 'root', group: 'root' });
  }
}

// テンプレート文字列の共通インデントを除去（ミッション定義を書きやすくする）
export function dedent(str) {
  if (!str.includes('\n')) return str;
  const lines = str.replace(/^\n/, '').replace(/\n[ \t]*$/, '\n').split('\n');
  const indents = lines.filter(l => l.trim()).map(l => (l.match(/^[ \t]*/)[0].length));
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map(l => l.slice(min)).join('\n');
}
