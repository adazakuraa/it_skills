// ============================================================
// 仮想ファイルシステム / ユーザー / 権限
// 実OSには一切アクセスしない。すべてJSオブジェクト上の操作。
// ============================================================

export const BASE_TIME = Date.UTC(2026, 9, 14, 9, 0, 0); // 2026-10-14 09:00 UTC

export class FsError extends Error {
  constructor(code, path) {
    super(code);
    this.code = code; // ENOENT, EACCES, ENOTDIR, EISDIR, EEXIST, ENOTEMPTY, EPERM, EINVAL
    this.path = path;
  }
}

export const ERRMSG = {
  ENOENT: 'No such file or directory',
  EACCES: 'Permission denied',
  ENOTDIR: 'Not a directory',
  EISDIR: 'Is a directory',
  EEXIST: 'File exists',
  ENOTEMPTY: 'Directory not empty',
  EPERM: 'Operation not permitted',
  EINVAL: 'Invalid argument',
};

function mkdirNode(mode, uid, gid, mtime) {
  return { type: 'd', mode, uid, gid, mtime, children: Object.create(null) };
}
function mkfileNode(content, mode, uid, gid, mtime) {
  return { type: 'f', mode, uid, gid, mtime, content: String(content) };
}

export class VFS {
  constructor() {
    this.root = mkdirNode(0o755, 0, 0, BASE_TIME);
    this.users = [];   // {name, uid, gid, home, shell, gecos}
    this.groups = [];  // {name, gid, members: []}
    this.clock = BASE_TIME + 3600 * 1000 * 24 * 27; // 現在時刻（シミュレーション）
  }

  now() { this.clock += 1000; return this.clock; }

  // ---------- users ----------
  userByName(name) { return this.users.find(u => u.name === name); }
  userById(uid) { return this.users.find(u => u.uid === uid); }
  groupByName(name) { return this.groups.find(g => g.name === name); }
  groupById(gid) { return this.groups.find(g => g.gid === gid); }
  uname(uid) { const u = this.userById(uid); return u ? u.name : String(uid); }
  gname(gid) { const g = this.groupById(gid); return g ? g.name : String(gid); }
  /** ユーザーの所属グループID一覧（プライマリ + 補助） */
  gidsOf(user) {
    const set = new Set([user.gid]);
    for (const g of this.groups) if (g.members.includes(user.name)) set.add(g.gid);
    return [...set];
  }

  // ---------- path ----------
  /** 絶対パスの配列表現に正規化（シンボリックリンクは未対応） */
  normalize(path, cwd = '/') {
    if (path === '') return null;
    const base = path.startsWith('/') ? [] : this.split(cwd);
    for (const part of path.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') base.pop();
      else base.push(part);
    }
    return base;
  }
  split(abs) { return abs.split('/').filter(Boolean); }
  join(parts) { return '/' + parts.join('/'); }
  abs(path, cwd) { const p = this.normalize(path, cwd); return p ? this.join(p) : ''; }

  // ---------- permission ----------
  /** want: 4=r 2=w 1=x */
  can(node, user, want) {
    if (user.uid === 0) {
      // root は実行ビットが一つもないファイルの実行のみ不可
      if (want === 1 && node.type === 'f') return (node.mode & 0o111) !== 0;
      return true;
    }
    let bits;
    if (node.uid === user.uid) bits = (node.mode >> 6) & 7;
    else if (this.gidsOf(user).includes(node.gid)) bits = (node.mode >> 3) & 7;
    else bits = node.mode & 7;
    return (bits & want) === want;
  }

  /** パスを辿ってノードを返す。途中のディレクトリには x 権限が必要。 */
  lookup(path, cwd, user, { allowMissing = false } = {}) {
    const parts = Array.isArray(path) ? path : this.normalize(path, cwd);
    if (parts === null) throw new FsError('ENOENT', path);
    let node = this.root;
    for (let i = 0; i < parts.length; i++) {
      if (node.type !== 'd') throw new FsError('ENOTDIR', path);
      if (user && !this.can(node, user, 1)) throw new FsError('EACCES', path);
      const next = node.children[parts[i]];
      if (!next) {
        if (allowMissing && i === parts.length - 1) return null;
        throw new FsError('ENOENT', path);
      }
      node = next;
    }
    return node;
  }

  exists(path, cwd = '/') {
    try { return !!this.lookup(path, cwd, null); } catch { return false; }
  }

  /** 親ディレクトリと末尾名を返す（作成・削除用） */
  parentOf(path, cwd, user) {
    const parts = this.normalize(path, cwd);
    if (!parts || parts.length === 0) throw new FsError('EPERM', path);
    const name = parts[parts.length - 1];
    const parent = this.lookup(parts.slice(0, -1), cwd, user);
    if (parent.type !== 'd') throw new FsError('ENOTDIR', path);
    return { parent, name, parts };
  }

  readFile(path, cwd, user) {
    const node = this.lookup(path, cwd, user);
    if (node.type === 'd') throw new FsError('EISDIR', path);
    if (node.special === 'null') return '';
    if (user && !this.can(node, user, 4)) throw new FsError('EACCES', path);
    return node.content;
  }

  writeFile(path, cwd, user, content, { append = false } = {}) {
    const { parent, name } = this.parentOf(path, cwd, user);
    let node = parent.children[name];
    if (node) {
      if (node.type === 'd') throw new FsError('EISDIR', path);
      if (node.special === 'null') return;
      if (user && !this.can(node, user, 2)) throw new FsError('EACCES', path);
      node.content = append ? node.content + content : String(content);
      node.mtime = this.now();
    } else {
      if (user && !this.can(parent, user, 3)) throw new FsError('EACCES', path);
      const mode = 0o666 & ~0o022;
      node = mkfileNode(content, mode, user ? user.uid : 0, user ? user.gid : 0, this.now());
      parent.children[name] = node;
      parent.mtime = node.mtime;
    }
  }

  mkdir(path, cwd, user, { parents = false } = {}) {
    const parts = this.normalize(path, cwd);
    if (!parts) throw new FsError('ENOENT', path);
    let node = this.root;
    for (let i = 0; i < parts.length; i++) {
      if (node.type !== 'd') throw new FsError('ENOTDIR', path);
      if (user && !this.can(node, user, 1)) throw new FsError('EACCES', path);
      const last = i === parts.length - 1;
      let next = node.children[parts[i]];
      if (next) {
        if (last && !parents) throw new FsError('EEXIST', path);
        if (next.type !== 'd') throw new FsError(last ? 'EEXIST' : 'ENOTDIR', path);
      } else {
        if (!last && !parents) throw new FsError('ENOENT', path);
        if (user && !this.can(node, user, 3)) throw new FsError('EACCES', path);
        next = mkdirNode(0o755, user ? user.uid : 0, user ? user.gid : 0, this.now());
        node.children[parts[i]] = next;
      }
      node = next;
    }
  }

  /** 削除権限チェック（親の w+x と sticky bit） */
  checkRemove(parent, node, user, path) {
    if (!user || user.uid === 0) return;
    if (!this.can(parent, user, 3)) throw new FsError('EACCES', path);
    if ((parent.mode & 0o1000) && node.uid !== user.uid && parent.uid !== user.uid) {
      throw new FsError('EPERM', path);
    }
  }

  remove(path, cwd, user, { recursive = false } = {}) {
    const { parent, name } = this.parentOf(path, cwd, user);
    const node = parent.children[name];
    if (!node) throw new FsError('ENOENT', path);
    if (node.type === 'd') {
      if (!recursive) throw new FsError('EISDIR', path);
      this.checkRemoveTree(node, user, path);
    }
    this.checkRemove(parent, node, user, path);
    delete parent.children[name];
    parent.mtime = this.now();
  }

  checkRemoveTree(dir, user, path) {
    if (!user || user.uid === 0) return;
    const names = Object.keys(dir.children);
    if (names.length === 0) return;
    if (!this.can(dir, user, 7)) throw new FsError('EACCES', path);
    for (const n of names) {
      const c = dir.children[n];
      if (c.type === 'd') this.checkRemoveTree(c, user, path + '/' + n);
    }
  }

  rmdir(path, cwd, user) {
    const { parent, name } = this.parentOf(path, cwd, user);
    const node = parent.children[name];
    if (!node) throw new FsError('ENOENT', path);
    if (node.type !== 'd') throw new FsError('ENOTDIR', path);
    if (Object.keys(node.children).length) throw new FsError('ENOTEMPTY', path);
    this.checkRemove(parent, node, user, path);
    delete parent.children[name];
  }

  /** ノード複製（cp 用）。所有者はコピーした人になる */
  cloneNode(node, user) {
    const uid = user ? user.uid : node.uid;
    const gid = user ? user.gid : node.gid;
    if (node.type === 'f') return mkfileNode(node.content, node.mode, uid, gid, this.now());
    const d = mkdirNode(node.mode, uid, gid, this.now());
    for (const [k, v] of Object.entries(node.children)) d.children[k] = this.cloneNode(v, user);
    return d;
  }

  /** ディレクトリ配下の全ノード（find/grep -r 用）。読めないディレクトリは onError へ */
  walk(startPath, startNode, user, visit, onError, depth = 0, maxDepth = Infinity) {
    visit(startPath, startNode, depth);
    if (startNode.type !== 'd' || depth >= maxDepth) return;
    if (user && !this.can(startNode, user, 5)) {
      onError(startPath);
      return;
    }
    for (const name of Object.keys(startNode.children).sort()) {
      const child = startNode.children[name];
      const p = startPath === '/' ? '/' + name : startPath + '/' + name;
      this.walk(p, child, user, visit, onError, depth + 1, maxDepth);
    }
  }

  // ---------- builder helpers (環境構築用・権限チェックなし) ----------
  addDir(path, { mode = 0o755, owner = 'root', group } = {}) {
    const parts = this.split(path);
    let node = this.root;
    for (const p of parts) {
      if (!node.children[p]) node.children[p] = mkdirNode(0o755, 0, 0, BASE_TIME);
      node = node.children[p];
    }
    node.mode = typeof mode === 'string' ? parseInt(mode, 8) : mode;
    const u = this.userByName(owner);
    node.uid = u ? u.uid : 0;
    const g = this.groupByName(group || (u ? this.groupById(u.gid)?.name : 'root'));
    node.gid = g ? g.gid : (u ? u.gid : 0);
    return node;
  }

  addFile(path, content, { mode = 0o644, owner = 'root', group, mtime, caps } = {}) {
    const parts = this.split(path);
    const name = parts.pop();
    let node = this.root;
    for (const p of parts) {
      if (!node.children[p]) node.children[p] = mkdirNode(0o755, 0, 0, BASE_TIME);
      node = node.children[p];
    }
    const u = this.userByName(owner);
    const g = this.groupByName(group || (u ? this.groupById(u.gid)?.name : 'root'));
    const m = typeof mode === 'string' ? parseInt(mode, 8) : mode;
    const f = mkfileNode(content, m, u ? u.uid : 0, g ? g.gid : 0, mtime || BASE_TIME);
    node.children[name] = f;
    if (caps) f.caps = caps;
    return f;
  }

  // ---------- snapshot ----------
  serialize() {
    return { root: this.root, users: this.users, groups: this.groups, clock: this.clock };
  }
  static deserialize(obj) {
    const v = new VFS();
    const fix = n => {
      if (!n || typeof n !== 'object') throw new Error('bad node');
      if (n.type === 'd') {
        const c = Object.create(null);
        for (const [k, val] of Object.entries(n.children || {})) {
          if (k === '__proto__' || k.includes('/')) continue;
          c[k] = fix(val);
        }
        return { type: 'd', mode: n.mode | 0, uid: n.uid | 0, gid: n.gid | 0, mtime: +n.mtime || BASE_TIME, children: c };
      }
      const f = { type: 'f', mode: n.mode | 0, uid: n.uid | 0, gid: n.gid | 0, mtime: +n.mtime || BASE_TIME, content: String(n.content ?? '') };
      if (n.special === 'null') f.special = 'null';
      return f;
    };
    v.root = fix(obj.root);
    v.users = Array.isArray(obj.users) ? obj.users : [];
    v.groups = Array.isArray(obj.groups) ? obj.groups : [];
    v.clock = +obj.clock || v.clock;
    return v;
  }
}

// ---------- 表示用ユーティリティ ----------
export function modeString(node) {
  const t = node.type === 'd' ? 'd' : (node.special === 'null' ? 'c' : '-');
  const m = node.mode;
  const rwx = (b, sbit, sch) => {
    const r = b & 4 ? 'r' : '-';
    const w = b & 2 ? 'w' : '-';
    let x = b & 1 ? 'x' : '-';
    if (sbit) x = b & 1 ? sch : sch.toUpperCase();
    return r + w + x;
  };
  return t +
    rwx((m >> 6) & 7, m & 0o4000, 's') +
    rwx((m >> 3) & 7, m & 0o2000, 's') +
    rwx(m & 7, m & 0o1000, 't');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function lsDate(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export function isoDate(ms) {
  const d = new Date(ms);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '.000000000 +0000');
}
export function nodeSize(node) {
  if (node.type === 'd') return 4096;
  if (node.special === 'null') return 0;
  // UTF-8 バイト数
  let n = 0;
  for (const ch of node.content) {
    const c = ch.codePointAt(0);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}
