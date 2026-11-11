// ============================================================
// tcpdump（キャプチャファイル読み取り版）。実際のパケット取得は行わない。
// キャプチャファイルは tcpdump 出力形式のテキスト:
//   HH:MM:SS.ffffff IP 送信元.ポート > 宛先.ポート: 詳細
//   <TAB>ペイロード行（-A のときだけ表示）
// フィルタは BPF の一部: host/src host/dst host/port/src port/dst port/tcp/udp/icmp/ip と and/or/not/( )
// ============================================================

const HEADER_RE = /^(\d{2}:\d{2}:\d{2}\.\d+) IP (\S+) > (\S+?): (.*)$/;
const ADDR_RE = /^((?:\d+\.){3}\d+)(?:\.(\d+))?$/;

export function parsePackets(text) {
  const pkts = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('\t')) { if (pkts.length) pkts[pkts.length - 1].payload.push(line.slice(1)); continue; }
    if (!line.trim()) continue;
    const m = line.match(HEADER_RE);
    if (!m) continue;
    const s = m[2].match(ADDR_RE), d = m[3].match(ADDR_RE);
    if (!s || !d) continue;
    const det = m[4];
    pkts.push({
      raw: line, time: m[1], detail: det, payload: [],
      src: { ip: s[1], port: s[2] ? Number(s[2]) : null }, dst: { ip: d[1], port: d[2] ? Number(d[2]) : null },
      proto: det.startsWith('Flags [') ? 'tcp' : /^ICMP/.test(det) ? 'icmp' : 'udp',
    });
  }
  return pkts;
}

// ---- フィルタ式 ----
function compileFilter(expr) {
  const toks = expr.match(/\(|\)|&&|\|\||!|[^\s()]+/g) || [];
  let pos = 0;
  const fail = (m) => { throw new Error(`syntax error in filter expression: ${m}`); };
  const peek = () => toks[pos];
  const num = (t) => { if (!/^\d+$/.test(t || '')) fail(`数値が必要です (${t ?? '末尾'})`); return Number(t); };
  const parseOr = () => { let l = parseAnd(); while (peek() === 'or' || peek() === '||') { pos++; const r = parseAnd(); const a = l; l = (p) => a(p) || r(p); } return l; };
  const parseAnd = () => {
    let l = parseNot();
    while (peek() === 'and' || peek() === '&&') { pos++; const r = parseNot(); const a = l; l = (p) => a(p) && r(p); }
    return l;
  };
  const parseNot = () => { if (peek() === 'not' || peek() === '!') { pos++; const i = parseNot(); return (p) => !i(p); } return primary(); };
  const primary = () => {
    const t = toks[pos++];
    if (t === undefined) fail('式が途中で終わっています');
    if (t === '(') { const v = parseOr(); if (toks[pos++] !== ')') fail("')' が必要です"); return v; }
    if (t === 'tcp' || t === 'udp' || t === 'icmp') return (p) => p.proto === t;
    if (t === 'ip') return () => true;
    let dir = null;
    let k = t;
    if (k === 'src' || k === 'dst') { dir = k; k = toks[pos++]; }
    if (k === 'host') { const h = toks[pos++]; if (!h) fail('host の後にアドレスが必要です'); return (p) => (dir === 'src' ? p.src.ip === h : dir === 'dst' ? p.dst.ip === h : p.src.ip === h || p.dst.ip === h); }
    if (k === 'port') { const n = num(toks[pos++]); return (p) => (dir === 'src' ? p.src.port === n : dir === 'dst' ? p.dst.port === n : p.src.port === n || p.dst.port === n); }
    fail(`未対応の条件 '${t}'`);
  };
  const f = parseOr();
  if (pos < toks.length) fail(`余分なトークン '${toks[pos]}'`);
  return f;
}

export function makeTcpdump() {
  const T = {};
  T.tcpdump = (args, ctx) => {
    const sh = ctx.sh, vfs = sh.vfs;
    let file = null, outFile = null, count = Infinity, ascii = false, noTime = false, iface = null;
    const rest = [];
    const BOOL = 'nvAqtXeSlpU', VAL = 'rwcis';
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.length > 1 && a[0] === '-' && !/^-\d/.test(a)) {
        // getopt 風: -nr FILE / -nAr / -c10 / -vv などの結合フラグ
        for (let j = 1; j < a.length; j++) {
          const f = a[j];
          if (BOOL.includes(f)) { if (f === 'A') ascii = true; if (f === 't') noTime = true; continue; }
          if (VAL.includes(f)) {
            const v = a.length > j + 1 ? a.slice(j + 1) : args[++i];
            if (v == null) { ctx.err(`tcpdump: option requires an argument -- '${f}'\n`); return 1; }
            if (f === 'r') file = v; else if (f === 'w') outFile = v; else if (f === 'i') iface = v;
            else if (f === 'c') { count = parseInt(v, 10); if (!(count > 0)) { ctx.err(`tcpdump: invalid packet count ${v}\n`); return 1; } }
            break;
          }
          ctx.err(`tcpdump: invalid option -- '${f}'\nTry 'man tcpdump' for more information.\n`); return 1;
        }
      } else rest.push(a);
    }
    if (!file) {
      if (sh.user.uid !== 0) { ctx.err(`tcpdump: ${iface || 'eth0'}: You don't have permission to perform this capture on that device\n(socket: Operation not permitted)\n`); return 1; }
      ctx.err('tcpdump: verbose output suppressed, use -v[v]... for full protocol decode\n');
      ctx.err(`listening on ${iface || 'eth0'}, link-type EN10MB (Ethernet), snapshot length 262144 bytes\n`);
      ctx.err('(シミュレーター: 仮想NICには実トラフィックがありません。キャプチャファイルは -r で読んでください)\n');
      ctx.out('0 packets captured\n');
      return 0;
    }
    let text;
    try { text = vfs.readFile(file, sh.cwd, sh.user); }
    catch (e) { ctx.err(`tcpdump: ${file}: ${e.code === 'EACCES' ? 'Permission denied' : 'No such file or directory'}\n`); return 1; }
    let pred;
    try { pred = rest.length ? compileFilter(rest.join(' ')) : () => true; }
    catch (e) { ctx.err(`tcpdump: ${e.message}\n`); return 1; }
    ctx.err(`reading from file ${file}, link-type EN10MB (Ethernet), snapshot length 262144\n`);
    let n = 0; const saved = [];
    for (const p of parsePackets(text)) {
      if (!pred(p)) continue;
      if (n >= count) break;
      n++;
      if (outFile) { saved.push(p.raw, ...p.payload.map(l => '\t' + l)); continue; }
      ctx.out((noTime ? p.raw.replace(/^\S+ /, '') : p.raw) + '\n');
      if (ascii) for (const l of p.payload) ctx.out(l + '\n');
    }
    if (outFile) {
      try { vfs.writeFile(outFile, sh.cwd, sh.user, saved.length ? saved.join('\n') + '\n' : ''); }
      catch (e) { ctx.err(`tcpdump: ${outFile}: ${e.code === 'EACCES' ? 'Permission denied' : 'cannot write'}\n`); return 1; }
      ctx.err(`${n} packets captured\n`);
    }
    return 0;
  };
  return T;
}
