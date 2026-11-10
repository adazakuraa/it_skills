// ============================================================
// ネットワーク系コマンド（仮想ネットワークに対してのみ動作）
// 実在のホストへは一切通信しない。shell.net のデータだけを参照する。
// net = {
//   interfaces: [{name, ip, prefix, mac, state}],
//   routes: [{dst, via, dev, scope}],
//   dns: { 'name': 'ip', ... },           // 正引き（逆引きは自動生成）
//   listening: [{proto, addr, port, process, pid}],  // 自ホストの待ち受け
//   hosts: { 'ip|name': { names:[], ports:[{port, proto, state, service, banner, http}] } },
// }
// ============================================================

function parseOptsLocal(args, spec) {
  const opts = {}; const operands = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.length > 1 && a[0] === '-' && a !== '-' && !a.startsWith('--')) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (spec[f] === 'val') { const v = a.slice(j + 1); opts[f] = v || args[++i]; j = a.length; }
        else opts[f] = true;
      }
    } else if (a.startsWith('--')) { opts[a.slice(2)] = true; }
    else operands.push(a);
  }
  return { opts, operands };
}

function resolveHost(net, target) {
  if (!net) return null;
  // IP そのまま
  const byKey = net.hosts && (net.hosts[target]);
  if (byKey) return { ip: target, entry: byKey };
  // DNS 正引き
  const ip = net.dns && net.dns[target];
  if (ip && net.hosts && net.hosts[ip]) return { ip, entry: net.hosts[ip] };
  if (ip) return { ip, entry: null };
  // names から探す
  if (net.hosts) {
    for (const [k, v] of Object.entries(net.hosts)) {
      if (v.names && v.names.includes(target)) return { ip: k, entry: v };
    }
  }
  return null;
}

function reverseDns(net, ip) {
  if (!net || !net.dns) return null;
  for (const [name, addr] of Object.entries(net.dns)) if (addr === ip) return name;
  return null;
}

export function makeNetCommands() {
  const N = {};

  N.ip = (args, ctx) => {
    const net = ctx.sh.net;
    const sub = args[0];
    if (!net) { ctx.err('ip: ネットワーク情報がありません\n'); return 1; }
    if (sub === 'a' || sub === 'addr' || sub === 'address' || !sub) {
      (net.interfaces || []).forEach((ifc, i) => {
        ctx.out(`${i + 1}: ${ifc.name}: <${ifc.state === 'UP' || ifc.name !== 'lo' ? 'BROADCAST,MULTICAST,UP,LOWER_UP' : 'LOOPBACK,UP'}> mtu 1500 state ${ifc.state || 'UP'}\n`);
        ctx.out(`    link/ether ${ifc.mac || '00:00:00:00:00:00'} brd ff:ff:ff:ff:ff:ff\n`);
        if (ifc.ip) ctx.out(`    inet ${ifc.ip}/${ifc.prefix ?? 24} scope global ${ifc.name}\n`);
      });
      return 0;
    }
    if (sub === 'r' || sub === 'route') {
      for (const r of (net.routes || [])) {
        if (r.dst === 'default') ctx.out(`default via ${r.via} dev ${r.dev}\n`);
        else ctx.out(`${r.dst} dev ${r.dev} proto kernel scope link\n`);
      }
      return 0;
    }
    if (sub === 'link') { for (const ifc of (net.interfaces || [])) ctx.out(`${ifc.name}: link/ether ${ifc.mac}\n`); return 0; }
    ctx.err(`ip: 未対応のサブコマンド: ${sub}\n`); return 1;
  };

  N.ifconfig = (args, ctx) => {
    const net = ctx.sh.net; if (!net) return 1;
    for (const ifc of (net.interfaces || [])) {
      ctx.out(`${ifc.name}: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n`);
      if (ifc.ip) ctx.out(`        inet ${ifc.ip}  netmask ${prefixToMask(ifc.prefix ?? 24)}\n`);
      ctx.out(`        ether ${ifc.mac || '00:00:00:00:00:00'}\n\n`);
    }
    return 0;
  };

  N.ss = (args, ctx) => ssNetstat(args, ctx, 'ss');
  N.netstat = (args, ctx) => ssNetstat(args, ctx, 'netstat');
  function ssNetstat(args, ctx, name) {
    const net = ctx.sh.net;
    const { opts } = parseOptsLocal(args, {});
    if (!net) { ctx.out('State  Recv-Q Send-Q Local Address:Port\n'); return 0; }
    const wantListen = opts.l;
    const wantTcp = opts.t, wantUdp = opts.u;
    let list = (net.listening || []).filter(e => {
      if (wantListen && e.state && e.state !== 'LISTEN') return false;
      if (wantTcp && !wantUdp && e.proto !== 'tcp') return false;
      if (wantUdp && !wantTcp && e.proto !== 'udp') return false;
      return true;
    });
    if (name === 'ss') {
      ctx.out('Netid State   Local Address:Port    Peer Address:Port   Process\n');
      for (const e of list) {
        const proc = (opts.p && e.process) ? `users:(("${e.process}",pid=${e.pid || 0}))` : '';
        ctx.out(`${e.proto.padEnd(5)} ${(e.state || 'LISTEN').padEnd(7)} ${(e.addr || '0.0.0.0') + ':' + e.port}`.padEnd(45) + `${proc}\n`);
      }
    } else {
      ctx.out('Proto Recv-Q Send-Q Local Address           State       PID/Program name\n');
      for (const e of list) {
        const proc = (opts.p && e.process) ? `${e.pid || '-'}/${e.process}` : '-';
        ctx.out(`${e.proto.padEnd(5)} 0      0      ${((e.addr || '0.0.0.0') + ':' + e.port).padEnd(22)} ${(e.state || 'LISTEN').padEnd(11)} ${proc}\n`);
      }
    }
    return 0;
  }

  N.ping = (args, ctx) => {
    const { opts, operands } = parseOptsLocal(args, { c: 'val' });
    const target = operands[0];
    if (!target) { ctx.err('ping: usage: ping host\n'); return 1; }
    const net = ctx.sh.net;
    const r = resolveHost(net, target);
    const count = Math.min(parseInt(opts.c, 10) || 4, 10);
    const ip = r ? r.ip : (net && net.dns && net.dns[target]);
    const reachable = r && (r.entry ? r.entry.up !== false : true);
    if (!ip) { ctx.err(`ping: ${target}: Name or service not known\n`); return 2; }
    ctx.out(`PING ${target} (${ip}) 56(84) bytes of data.\n`);
    if (reachable) {
      for (let i = 0; i < count; i++) ctx.out(`64 bytes from ${ip}: icmp_seq=${i + 1} ttl=64 time=${(0.2 + i * 0.03).toFixed(2)} ms\n`);
      ctx.out(`\n--- ${target} ping statistics ---\n${count} packets transmitted, ${count} received, 0% packet loss\n`);
      return 0;
    }
    ctx.out(`\n--- ${target} ping statistics ---\n${count} packets transmitted, 0 received, 100% packet loss\n`);
    return 1;
  };

  N.dig = (args, ctx) => {
    const { operands } = parseOptsLocal(args, {});
    const name = operands.find(a => a !== '+short' && !a.startsWith('@')) || operands[0];
    const short = args.includes('+short');
    const net = ctx.sh.net;
    const ip = net && net.dns && net.dns[name];
    if (short) { if (ip) ctx.out(ip + '\n'); return ip ? 0 : 0; }
    ctx.out(`; <<>> DiG 9.18 <<>> ${name}\n;; QUESTION SECTION:\n;${name}.\t\tIN\tA\n\n`);
    if (ip) ctx.out(`;; ANSWER SECTION:\n${name}.\t300\tIN\tA\t${ip}\n`);
    else ctx.out(`;; ->>HEADER<<- status: NXDOMAIN\n`);
    return 0;
  };

  N.nslookup = (args, ctx) => {
    const name = args.find(a => !a.startsWith('-'));
    const net = ctx.sh.net;
    const ip = net && net.dns && net.dns[name];
    ctx.out(`Server:\t\t${(net && net.resolver) || '127.0.0.53'}\nAddress:\t${(net && net.resolver) || '127.0.0.53'}#53\n\n`);
    if (ip) ctx.out(`Name:\t${name}\nAddress: ${ip}\n`);
    else { ctx.out(`** server can't find ${name}: NXDOMAIN\n`); return 1; }
    return 0;
  };

  N.host = (args, ctx) => {
    const name = args.find(a => !a.startsWith('-'));
    const net = ctx.sh.net;
    const ip = net && net.dns && net.dns[name];
    if (ip) ctx.out(`${name} has address ${ip}\n`);
    else if (net) { const rev = reverseDns(net, name); if (rev) { ctx.out(`${name} domain name pointer ${rev}.\n`); return 0; } ctx.out(`Host ${name} not found: 3(NXDOMAIN)\n`); return 1; }
    return 0;
  };

  N.nmap = (args, ctx) => {
    const { opts, operands } = parseOptsLocal(args, { p: 'val' });
    const target = operands[operands.length - 1];
    if (!target) { ctx.err('nmap: usage: nmap [options] target\n'); return 1; }
    const net = ctx.sh.net;
    const r = resolveHost(net, target);
    ctx.out(`Starting Nmap 7.94 ( https://nmap.org )\n`);
    if (!r || !r.entry) { ctx.out(`Note: Host seems down or has no open ports.\nNmap done: 1 IP address (0 hosts up)\n`); return 0; }
    const names = r.entry.names && r.entry.names.length ? r.entry.names[0] : reverseDns(net, r.ip);
    ctx.out(`Nmap scan report for ${names ? names + ' (' + r.ip + ')' : r.ip}\nHost is up (0.00030s latency).\n`);
    let ports = (r.entry.ports || []).filter(p => p.state !== 'closed');
    if (opts.p && opts.p !== '-') { const want = String(opts.p).split(',').map(x => parseInt(x, 10)); ports = ports.filter(p => want.includes(p.port)); }
    ports = ports.sort((a, b) => a.port - b.port);
    if (!ports.length) { ctx.out(`All scanned ports are closed\n`); return 0; }
    ctx.out(`\nPORT     STATE SERVICE${opts.sV || opts.A ? ' VERSION' : ''}\n`);
    for (const p of ports) {
      let line = `${(p.port + '/' + (p.proto || 'tcp')).padEnd(8)} ${(p.state || 'open').padEnd(5)} ${(p.service || 'unknown').padEnd(7)}`;
      if ((opts.sV || opts.A) && p.banner) line += ' ' + p.banner;
      ctx.out(line + '\n');
    }
    ctx.out(`\nNmap done: 1 IP address (1 host up) scanned\n`);
    return 0;
  };

  N.curl = (args, ctx) => {
    const { opts, operands } = parseOptsLocal(args, { X: 'val', d: 'val', H: 'val', o: 'val', data: 'val' });
    const url = operands.find(a => /^https?:\/\//.test(a)) || operands[0];
    if (!url) { ctx.err('curl: try \'curl --help\'\n'); return 2; }
    const m = url.match(/^(https?):\/\/([^/:]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?/);
    if (!m) { ctx.err(`curl: (3) URL malformed\n`); return 3; }
    const [, scheme, hostname, portStr, path = '/', query = ''] = m;
    const net = ctx.sh.net;
    const r = resolveHost(net, hostname);
    if (!r) { ctx.err(`curl: (6) Could not resolve host: ${hostname}\n`); return 6; }
    const port = parseInt(portStr, 10) || (scheme === 'https' ? 443 : 80);
    const portEntry = (r.entry && r.entry.ports || []).find(p => p.port === port && (p.service === 'http' || p.service === 'https' || p.http));
    if (!r.entry || !portEntry || !portEntry.http) { ctx.err(`curl: (7) Failed to connect to ${hostname} port ${port}: Connection refused\n`); return 7; }
    const method = (opts.X || (opts.d || opts.data ? 'POST' : 'GET')).toUpperCase();
    const bodyData = opts.d || opts.data || '';
    const params = {};
    for (const kv of [query.replace(/^\?/, ''), bodyData].join('&').split('&')) { if (!kv) continue; const i = kv.indexOf('='); if (i >= 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }
    const resp = matchRoute(portEntry.http, path, method, params);
    if (opts.I || opts.head) {
      ctx.out(`HTTP/1.1 ${resp.status || 200} ${statusText(resp.status || 200)}\r\nServer: ${portEntry.banner || 'nginx'}\r\nContent-Type: ${resp.contentType || 'text/html'}\r\n\r\n`);
      return 0;
    }
    if (opts.o && opts.o !== '-') { try { ctx.sh.vfs.writeFile(opts.o, ctx.sh.cwd, ctx.sh.user, resp.body || ''); } catch (e) { ctx.err(`curl: ${e.message}\n`); return 1; } return 0; }
    ctx.out((resp.body || '') + (resp.body && !resp.body.endsWith('\n') ? '\n' : ''));
    return 0;
  };

  N.wget = (args, ctx) => {
    const { opts, operands } = parseOptsLocal(args, { O: 'val' });
    const url = operands.find(a => /^https?:\/\//.test(a));
    if (!url) { ctx.err('wget: URL がありません\n'); return 1; }
    const fname = opts.O || url.split('/').pop() || 'index.html';
    // curl と同じ解決を使い、body をファイルへ
    let captured = '';
    const fakeCtx = { sh: ctx.sh, stdin: '', out: t => { captured += t; }, err: ctx.err };
    const code = N.curl([url], fakeCtx);
    if (code !== 0) return code;
    try { ctx.sh.vfs.writeFile(fname, ctx.sh.cwd, ctx.sh.user, captured); ctx.err(`‘${fname}’ saved\n`); } catch (e) { ctx.err(`wget: ${e.message}\n`); return 1; }
    return 0;
  };

  N.traceroute = (args, ctx) => {
    const target = args.find(a => !a.startsWith('-'));
    const net = ctx.sh.net;
    const r = resolveHost(net, target);
    const ip = r ? r.ip : (net && net.dns && net.dns[target]);
    if (!ip) { ctx.err(`traceroute: unknown host ${target}\n`); return 1; }
    ctx.out(`traceroute to ${target} (${ip}), 30 hops max\n`);
    const gw = (net.routes || []).find(x => x.dst === 'default');
    if (gw) ctx.out(` 1  ${gw.via} (${gw.via})  0.3 ms\n`);
    ctx.out(` 2  ${ip} (${ip})  0.6 ms\n`);
    return 0;
  };

  N.nc = (args, ctx) => {
    const { operands } = parseOptsLocal(args, {});
    const host = operands[0]; const port = parseInt(operands[1], 10);
    const net = ctx.sh.net;
    const r = resolveHost(net, host);
    const pe = r && r.entry && (r.entry.ports || []).find(p => p.port === port);
    if (!pe || pe.state === 'closed') { ctx.err(`nc: connect to ${host} port ${port} failed: Connection refused\n`); return 1; }
    if (pe.banner) ctx.out(pe.banner + '\n');
    return 0;
  };

  N.arp = (args, ctx) => {
    const net = ctx.sh.net;
    ctx.out('Address                  HWtype  HWaddress           Flags Mask            Iface\n');
    for (const [ip, h] of Object.entries((net && net.arp) || {})) ctx.out(`${ip.padEnd(24)} ether   ${h}   C                     eth0\n`);
    return 0;
  };

  return N;
}

// http ルートマッチング（SQLi/認証回避の疑似演習に使う宣言的ルール）
// http = { server?, routes:[{ path, method?, when?:{param, equals|contains|regex}, body, status?, contentType? }] , notFound?:{body,status} }
function matchRoute(http, path, method, params) {
  let fallback = null;
  for (const route of (http.routes || [])) {
    if (route.path !== path && route.path !== '*') continue;
    if (route.method && route.method.toUpperCase() !== method) continue;
    // body を持たず default のみのルートは「このパスの既定応答」として後回し
    if (route.body == null && route.default != null && !route.when) { fallback = route; continue; }
    if (route.when) {
      const v = params[route.when.param];
      if (v == null) continue;
      if (route.when.equals != null && v !== route.when.equals) continue;
      if (route.when.contains != null && !String(v).includes(route.when.contains)) continue;
      if (route.when.regex != null) { try { if (!new RegExp(route.when.regex, 'i').test(v)) continue; } catch { continue; } }
    }
    if (route.body != null) return { body: route.body, status: route.status || 200, contentType: route.contentType };
  }
  if (fallback) return { body: fallback.default, status: fallback.defaultStatus || 200, contentType: fallback.contentType };
  if (http.notFound) return { body: http.notFound.body, status: http.notFound.status || 404 };
  return { body: '', status: 404 };
}

function statusText(code) { return { 200: 'OK', 301: 'Moved Permanently', 302: 'Found', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error' }[code] || 'OK'; }
function prefixToMask(prefix) {
  const bits = 0xffffffff << (32 - prefix) >>> 0;
  return [(bits >>> 24) & 255, (bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255].join('.');
}
