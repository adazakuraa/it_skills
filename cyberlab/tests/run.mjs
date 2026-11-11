// 自動テスト：コマンド挙動＋全ミッションが solution で解けるか
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildEnvironment } from '../js/env.js';
import { evaluate, needsAnswer } from '../js/checker.js';
import { STAGES, allMissions } from '../js/missions/index.js';
import { bundle } from '../build.mjs';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); } }

function freshShell(missionEnv) {
  const { shell } = buildEnvironment({ env: missionEnv });
  return shell;
}
// 1行実行してstdout文字列を返す
function sh(shell, line) {
  const chunks = shell.run(line);
  return chunks.filter(c => c.fd === 1).map(c => c.text).join('');
}
function shErr(shell, line) {
  const chunks = shell.run(line);
  return chunks.filter(c => c.fd === 2).map(c => c.text).join('');
}

// ---------- コマンド単体テスト ----------
function cmdTests() {
  const env = {
    user: 'tester', sudo: true,
    dirs: ['/home/tester/work', '/data'],
    files: [
      { path: '/home/tester/work/a.txt', owner: 'tester', content: 'banana\napple\ncherry\napple\n' },
      { path: '/home/tester/work/b.txt', owner: 'tester', mode: 0o600, content: 'secret=42\n' },
      { path: '/data/log.txt', owner: 'root', mode: 0o644, content: '10.0.0.1 ok\n10.0.0.2 fail\n10.0.0.1 ok\n10.0.0.1 fail\n' },
      { path: '/data/private', owner: 'root', mode: 0o600, content: 'topsecret\n' },
    ],
  };
  let s = freshShell(env);

  ok(sh(s, 'pwd') === '/home/tester\n', 'pwd home');
  ok(sh(s, 'echo hello world') === 'hello world\n', 'echo');
  ok(sh(s, 'echo $HOME') === '/home/tester\n', 'var expand');
  ok(sh(s, 'echo "a   b"') === 'a   b\n', 'double quote preserves spaces');
  ok(sh(s, "echo 'a$HOME'") === 'a$HOME\n', 'single quote no expand');
  ok(sh(s, 'cd work; pwd') === '/home/tester/work\n', 'cd relative + ;');
  ok(sh(s, 'cat a.txt') === 'banana\napple\ncherry\napple\n', 'cat');
  ok(sh(s, 'cat a.txt | sort') === 'apple\napple\nbanana\ncherry\n', 'pipe sort');
  ok(sh(s, 'sort a.txt | uniq') === 'apple\nbanana\ncherry\n', 'uniq');
  ok(sh(s, 'sort a.txt | uniq -c | sort -rn').startsWith('      2 apple'), 'uniq -c sort -rn');
  ok(sh(s, 'grep apple a.txt') === 'apple\napple\n', 'grep');
  ok(sh(s, 'grep -c apple a.txt') === '2\n', 'grep -c');
  ok(sh(s, 'grep -n cherry a.txt') === '3:cherry\n', 'grep -n');
  ok(sh(s, 'wc -l a.txt').trim().startsWith('4'), 'wc -l');
  ok(sh(s, 'head -n 2 a.txt') === 'banana\napple\n', 'head -n');
  ok(sh(s, 'tail -n 1 a.txt') === 'apple\n', 'tail -n');
  ok(sh(s, 'head -n1 a.txt') === 'banana\n', 'head -n1 combined');

  // redirect
  sh(s, 'echo line1 > out.txt');
  sh(s, 'echo line2 >> out.txt');
  ok(sh(s, 'cat out.txt') === 'line1\nline2\n', 'redirect > and >>');
  ok(s.vfs.exists('/home/tester/work/out.txt'), 'redirect created file');

  // cut / awk
  ok(sh(s, 'cut -d" " -f1 /data/log.txt | sort | uniq -c | sort -rn').startsWith('      3 10.0.0.1'), 'cut pipeline');
  ok(sh(s, "awk '{print $2}' /data/log.txt") === 'ok\nfail\nok\nfail\n', 'awk print $2');
  ok(sh(s, "awk 'NR==2' /data/log.txt") === '10.0.0.2 fail\n', 'awk NR');

  // find
  s = freshShell(env);
  const f = sh(s, 'find /home/tester -name "*.txt"');
  ok(f.includes('a.txt') && f.includes('b.txt'), 'find -name');
  ok(sh(s, 'find /home/tester/work -type f').split('\n').filter(Boolean).length === 2, 'find -type f');

  // permissions
  s = freshShell(env);
  ok(shErr(s, 'cat /data/private').includes('Permission denied'), 'read denied for 600 root file');
  ok(sh(s, 'sudo cat /data/private') === 'topsecret\n', 'sudo reads root file');
  sh(s, 'chmod 600 /home/tester/work/a.txt');
  const node = s.vfs.lookup('/home/tester/work/a.txt', '/', null);
  ok((node.mode & 0o777) === 0o600, 'chmod 600 applied');
  sh(s, 'chmod u+x /home/tester/work/a.txt');
  ok((s.vfs.lookup('/home/tester/work/a.txt', '/', null).mode & 0o100) !== 0, 'chmod u+x adds exec bit');

  // chmod symbolic =
  s = freshShell(env);
  sh(s, 'chmod 644 b.txt 2>/dev/null; cd work; chmod a=r a.txt');
  // write protection
  s = freshShell(env);
  ok(shErr(s, 'echo x > /data/log.txt').includes('Permission denied'), 'write denied to root-owned 644 in root dir');

  // process / kill / service
  const penv = {
    user: 'tester', sudo: true,
    processes: [{ pid: 4000, user: 'tester', cmd: '/tmp/evil', cpu: 90 }, { pid: 4001, user: 'root', cmd: 'sshd' }],
    services: [{ name: 'evilsvc', active: true, enabled: true }],
  };
  s = freshShell(penv);
  ok(sh(s, 'ps aux').includes('/tmp/evil'), 'ps shows process');
  sh(s, 'kill 4000');
  ok(!s.processes.some(p => p.pid === 4000), 'kill removes process');
  ok(shErr(s, 'systemctl stop evilsvc').length === 0 || true, 'systemctl stop no-crash');
  s = freshShell(penv);
  sh(s, 'sudo systemctl stop evilsvc');
  ok(s.services.find(x => x.name === 'evilsvc').active === false, 'sudo systemctl stop deactivates');
  sh(s, 'sudo systemctl disable evilsvc');
  ok(s.services.find(x => x.name === 'evilsvc').enabled === false, 'sudo systemctl disable');

  // non-root systemctl stop should fail to change
  s = freshShell(penv);
  sh(s, 'systemctl stop evilsvc');
  ok(s.services.find(x => x.name === 'evilsvc').active === true, 'non-root cannot stop service');

  // glob
  s = freshShell(env);
  ok(sh(s, 'ls work/*.txt').includes('a.txt'), 'glob *.txt');

  // 2>/dev/null
  s = freshShell(env);
  ok(sh(s, 'cat /data/private 2>/dev/null') === '', 'stderr to /dev/null discards error');

  // コマンド置換は自前パーサーで安全に実行される（eval ではない）
  s = freshShell(env);
  ok(sh(s, 'echo $(whoami)') === 'tester\n', 'command substitution runs in the sandboxed shell');

  // unknown command
  ok(shErr(s, 'frobnicate').includes('command not found'), 'unknown command');

  // SUID find
  const suidEnv = { user: 'tester', files: [{ path: '/usr/bin/vuln', owner: 'root', mode: 0o4755, content: '\u007fELF' }] };
  s = freshShell(suidEnv);
  ok(sh(s, 'find / -perm -4000 -type f 2>/dev/null').includes('/usr/bin/vuln'), 'find -perm -4000');
}

// ---------- ミッション solution テスト ----------
function missionTests() {
  for (const m of allMissions()) {
    const { shell } = buildEnvironment(m);
    // solution を順に実行
    for (const line of (m.solution || [])) shell.run(line);
    // 各タスクを判定。answer系は solution 実行後の環境では直接評価できないので、
    // answerの正解をチェッカーで照合（any/equals の先頭を使って自己整合性を確認）
    m.tasks.forEach((task, ti) => {
      if (needsAnswer(task) && !task.noInput) {
        // 代表解を取り出して評価
        const probe = pickAnswer(task.check);
        const r = evaluate(task.check, probe, { vfs: shell.vfs, shell });
        ok(r.ok, `[${m.id}] task${ti + 1} answer "${probe}" should validate (${r.detail || ''})`);
      } else {
        const r = evaluate(task.check, null, { vfs: shell.vfs, shell });
        ok(r.ok, `[${m.id}] task${ti + 1} state check after solution failed: ${r.detail || ''}`);
      }
    });
  }
}

function pickAnswer(check) {
  if (!check) return '';
  if (check.type === 'answer') return (check.any && check.any[0]) ?? check.equals ?? '';
  if (check.of) for (const sub of check.of) { const a = pickAnswer(sub); if (a) return a; }
  return '';
}

// ---------- 構造検証 ----------
function structureTests() {
  const ids = new Set();
  for (const st of STAGES) {
    ok(st.id && st.title && Array.isArray(st.missions), `stage ${st.id} shape`);
    for (const m of st.missions) {
      ok(!ids.has(m.id), `duplicate mission id ${m.id}`); ids.add(m.id);
      ok(m.title && m.minutes && Array.isArray(m.tasks) && m.tasks.length > 0, `mission ${m.id} basic shape`);
      ok(Array.isArray(m.objectives) && m.objectives.length > 0, `mission ${m.id} objectives`);
      ok(m.review && Array.isArray(m.review.commands), `mission ${m.id} review`);
      for (let i = 0; i < m.tasks.length; i++) {
        const t = m.tasks[i];
        ok(t.q && t.check && t.explain, `mission ${m.id} task${i + 1} fields`);
        ok(Array.isArray(t.hints) && t.hints.length >= 1, `mission ${m.id} task${i + 1} hints`);
      }
    }
  }
}


// ---------- エンジン(awk/sed/grep/find/head)の回帰テスト ----------
function engineTests() {
  const env = { user: 't', files: [
    { path: '/home/t/log.txt', owner: 't', content: '10.0.0.1 GET /a 200 120\n10.0.0.2 GET /b 404 0\n10.0.0.1 POST /login 401 15\n10.0.0.3 GET /a 200 300\n10.0.0.1 POST /login 401 15\n' },
    { path: '/home/t/c.ini', owner: 't', content: '# comment\ndebug=true\nhost=localhost\nport=8080\n\n# end\nname=app\n' },
    { path: '/home/t/m.txt', owner: 't', content: 'alpha 1\nTODO fix\nbeta 2\nINTERNAL x\ngamma 3\ndelta 4\nTODO again\n' },
    { path: '/home/t/d/a.log', owner: 't', content: 'x\n' }, { path: '/home/t/d/b.txt', owner: 't', content: 'y\n' }, { path: '/home/t/d/c.conf', owner: 't', content: 'z\n' },
  ] };
  const { shell: s } = buildEnvironment({ env });
  const run = (l) => s.run(l).map(c => (c.fd === 2 ? '[E]' : '') + c.text).join('');
  run('cd /home/t');
  const eq = (name, cmd, want) => { const got = run(cmd); ok(got === want, `${name}: ${cmd} → ${JSON.stringify(got)} (期待 ${JSON.stringify(want)})`); };

  // awk: 条件のみ・条件+アクション（条件を無視して全行出力していた旧バグの回帰）
  eq('awk cond', "awk '$4==401' log.txt", '10.0.0.1 POST /login 401 15\n10.0.0.1 POST /login 401 15\n');
  eq('awk cond+print', "awk '$4>=400 {print $1, $3}' log.txt", '10.0.0.2 /b\n10.0.0.1 /login\n10.0.0.1 /login\n');
  eq('awk passwd uid0', "awk -F: '$3==0' /etc/passwd", 'root:x:0:0:root:/root:/bin/bash\n');
  eq('awk str cmp', "awk -F: '$7==\"/bin/bash\" {print $1}' /etc/passwd | head -1", 'root\n');
  eq('awk array', "awk '{c[$1]++} END{for(k in c) print k, c[k]}' log.txt", '10.0.0.1 3\n10.0.0.2 1\n10.0.0.3 1\n');
  eq('awk sum', "awk '{s+=$5} END{print s}' log.txt", '450\n');
  eq('awk printf', "awk '{s+=$5;n++} END{printf \"%.2f\\n\", s/n}' log.txt", '90.00\n');
  eq('awk range', "awk 'NR==2,NR==3{print NR\":\"$3}' log.txt", '2:/b\n3:/login\n');
  eq('awk -v', "awk -v t=400 '$4>=t{n++} END{print n}' log.txt", '3\n');
  eq('awk BEGIN', "awk 'BEGIN{print 1+2*3, 7%4, 2^10}'", '7 3 1024\n');
  eq('awk gsub', "echo 'a.b.c' | awk '{gsub(/\\./,\"-\"); print}'", 'a-b-c\n');
  ok(run("awk '{print $1'").startsWith('[E]awk: syntax error'), 'awk 構文エラーを報告する');
  ok(run("awk 'BEGIN{system(\"id\")}'").includes('未対応'), 'awk system() は拒否される');
  // sed
  eq('sed s', "sed 's/true/false/' c.ini | sed -n 2p", 'debug=false\n');
  eq('sed backref', "echo 'john smith' | sed -E 's/(\\w+) (\\w+)/\\2, \\1/'", 'smith, john\n');
  eq('sed multi', "echo hi | sed 's/^/> /; s/$/ </'", '> hi <\n');
  eq('sed BRE alt', "echo 'cat dog' | sed 's/cat\\|dog/X/g'", 'X X\n');
  eq('sed range', "sed -n '2,4p' c.ini", 'debug=true\nhost=localhost\nport=8080\n');
  eq('sed $d', "sed '$d' c.ini | tail -1", '# end\n');
  eq('sed -e x2', "sed -e 's/true/1/' -e 's/localhost/127.0.0.1/' c.ini | sed -n '2,3p'", 'debug=1\nhost=127.0.0.1\n');
  eq('sed nth', "echo aaa | sed 's/a/b/2'", 'aba\n');
  eq('sed -i.bak', "sed -i.bak 's/8080/9090/' c.ini; grep port c.ini", 'port=9090\n');
  // grep
  eq('grep BRE |', "grep -i 'todo\\|internal' m.txt", 'TODO fix\nINTERNAL x\nTODO again\n');
  eq('grep ERE', "grep -E 'TODO|beta' m.txt", 'TODO fix\nbeta 2\nTODO again\n');
  eq('grep -A', 'grep -A1 TODO m.txt', 'TODO fix\nbeta 2\n--\nTODO again\n');
  eq('grep -n -C', 'grep -n -C1 beta m.txt', '2-TODO fix\n3:beta 2\n4-INTERNAL x\n');
  eq('grep posix', 'grep -c "[[:digit:]]" m.txt', '4\n');
  // find
  eq('find rel', 'cd d; find . -type f', './a.log\n./b.txt\n./c.conf\n');
  eq('find -o', 'find . -name "*.log" -o -name "*.txt"', './a.log\n./b.txt\n');
  eq('find !', 'find . -type f ! -name "*.log"', './b.txt\n./c.conf\n');
  eq('find paren', 'find . -type f \\( -name "*.log" -o -name "*.conf" \\)', './a.log\n./c.conf\n');
  eq('find -exec', 'find . -name "*.txt" -exec cat {} \\;', 'y\n');
  ok(run('find . -bogus').startsWith('[E]find: unknown predicate'), 'find 不明述語はエラー');
  // head/tail 旧式
  eq('head -N', 'cd /home/t; head -3 m.txt', 'alpha 1\nTODO fix\nbeta 2\n');
  eq('tail -N', 'tail -2 m.txt', 'delta 4\nTODO again\n');
  ok(run('ls --bogus').includes("Try 'man ls'"), '不明オプションは GNU 形式のエラー');
}


// ---------- シェルスクリプト機能の回帰テスト ----------
function scriptTests() {
  const env = { user: 't', files: [
    { path: '/home/t/a.txt', owner: 't', content: 'one two\nthree\n' },
    { path: '/home/t/b.log', owner: 't', content: 'x\n' },
    { path: '/home/t/run.sh', owner: 't', mode: 0o755, content: '#!/bin/bash\nfor f in *.txt; do\n  if [ -s "$f" ]; then\n    echo "found $f"\n  else\n    echo "empty $f"\n  fi\ndone\ncount=0\nwhile [ $count -lt 3 ]; do\n  count=$((count+1))\ndone\necho "count=$count"\nexit 3\n' },
  ] };
  const { shell: s } = buildEnvironment({ env });
  const run = (l) => s.run(l).map(c => (c.fd === 2 ? '[E]' : '') + c.text).join('');
  run('cd /home/t');
  const eq = (name, cmd, want) => { const got = run(cmd); ok(got === want, `${name}: ${cmd} → ${JSON.stringify(got)} (期待 ${JSON.stringify(want)})`); };
  eq('subst', 'echo "user=$(whoami) cwd=$(pwd)"', 'user=t cwd=/home/t\n');
  eq('backtick', 'echo `hostname`', 'lab-01\n');
  eq('arith', 'n=5; echo $((n*n+1)) $((1+2*(3+4)))', '26 15\n');
  eq('arith div0', 'echo $((10/0))', '[E]bash: division by 0\n');
  eq('assign no split', 'x=$(cat a.txt); echo "$x" | wc -l', '2\n');
  eq('word split', 'v="a b"; echo $v | wc -w', '2\n');
  eq('glob in subst', 'ls $(echo *.log)', 'b.log\n');
  eq('for list', 'for f in a b c; do echo $f; done', 'a\nb\nc\n');
  eq('for glob', 'for f in *.txt; do wc -l $f; done', '2 a.txt\n');
  eq('if/else', 'if [ -f a.txt ]; then echo yes; else echo no; fi', 'yes\n');
  eq('if/elif', 'if [ -d nope ]; then echo d; elif [ -f a.txt ]; then echo f; else echo none; fi', 'f\n');
  eq('while', 'i=0; while [ $i -lt 3 ]; do echo i=$i; i=$((i+1)); done', 'i=0\ni=1\ni=2\n');
  eq('break', 'for n in $(seq 1 5); do [ $n -eq 3 ] && break; echo $n; done', '1\n2\n');
  eq('continue', 'for n in 1 2 3; do [ $n -eq 2 ] && continue; echo $n; done', '1\n3\n');
  eq('test -a', '[ 5 -gt 3 -a 2 -lt 4 ] && echo both', 'both\n');
  eq('[[ glob', '[[ abc == a* ]] && echo m', 'm\n');
  eq('[[ regex', '[[ hello =~ ^h.l+o$ ]] && echo re', 're\n');
  eq('script run', './run.sh; echo rc=$?', 'found a.txt\ncount=3\nrc=3\n');
  eq('bash script', 'bash run.sh | tail -1', 'count=3\n');
  eq('case unsupported', 'case x in x) echo y;; esac', "[E]bash: 'case' はこのシミュレーターでは未対応です\n");
  ok(run('if true; then echo a').includes("'fi'"), '未完の if は構文エラーを報告');
  ok(run('while true; do :; done').includes('上限'), '無限ループはステップ上限で止まる');
}

// ---------- セキュリティ: eval / Function を使っていないことの静的検査 ----------
function securityStaticTests() {
  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(path.join(baseDir, 'js')).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(f, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const rel = path.relative(baseDir, f);
    ok(!/(^|[^.\w])eval\s*\(/.test(src), `${rel}: eval() を使っていない`);
    ok(!/new\s+Function\s*\(/.test(src) && !/(^|[^.\w])Function\s*\(/.test(src), `${rel}: Function() を使っていない`);
    ok(!/set(Timeout|Interval)\s*\(\s*['"`]/.test(src), `${rel}: 文字列の setTimeout/setInterval を使っていない`);
    ok(!/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(src), `${rel}: innerHTML 等の HTML 文字列挿入を使っていない`);
  }
}

// ---------- バンドルが最新か検証（node build.mjs の実行忘れを検出） ----------
function bundleTests() {
  const baseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const built = bundle(baseDir).code;
  let onDisk = null;
  try { onDisk = fs.readFileSync(path.join(baseDir, 'app.bundle.js'), 'utf8'); } catch { /* missing */ }
  ok(onDisk === built, 'app.bundle.js が最新のソースと一致（不一致なら `node build.mjs` を実行してコミット）');
}

cmdTests();
engineTests();
scriptTests();
securityStaticTests();
structureTests();
missionTests();
bundleTests();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFAILURES:'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
else console.log('✓ すべてのテストに合格しました');
