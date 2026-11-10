// Linux III（運用管理：プロセス・ログ・ディスク・パッケージ・サービス監査）
export const stageSysadmin = {
  id: 'sysadmin',
  title: 'Linux III — システム運用',
  subtitle: 'プロセス優先度・ログ管理・ディスク調査・パッケージ・サービス監査',
  intro: 'サーバーを「動かし続ける」運用の視点。資源の調査、ログの管理、インストール物の把握——守りと安定運用に効く実務スキルを磨く。',
  missions: [
    {
      id: 'sa-01-disk',
      title: 'ディスクを食う犯人を探す',
      minutes: 10,
      objectives: ['df/duでディスク使用量を調べる', '肥大化したディレクトリ・ファイルを特定する'],
      prereq: [],
      briefing: '「ディスク容量が逼迫」のアラート。何が容量を食っているのかを df と du で突き止め、肥大化したログを特定する。',
      concepts: [{
        title: 'ディスク使用量の調査(df/du)',
        why: 'ディスク枯渇はサービス停止に直結する(可用性)。原因を素早く特定する必要がある。',
        problem: 'どのファイルシステムが逼迫し、どのディレクトリ/ファイルが容量を食っているかを知りたい。',
        how: 'df -h で各ファイルシステムの使用率を確認(全体像)。du -sh ディレクトリ で特定ディレクトリの合計サイズ、du -h で内訳。find -size で大きいファイルを特定。「全体(df)→絞り込み(du)→犯人(find)」の順。',
        example: '$ df -h\n$ du -sh /var/log\n$ du -h /var/log | sort -rh | head',
        relation: 'df→duでディスクを食っているディレクトリを特定する。',
      }],
      env: {
        user: 'analyst', dirs: ['/var/log', '/var/log/app'],
        files: [
          { path: '/var/log/app/huge.log', owner: 'analyst', content: 'X'.repeat(8000) + '\n' },
          { path: '/var/log/app/small.log', owner: 'analyst', content: 'ok\n' },
          { path: '/var/log/syslog', owner: 'analyst', content: 'Y'.repeat(500) + '\n' },
        ],
      },
      quick: ['df -h', 'du -sh /var/log', 'du -h /var/log', 'du -h /var/log/app', 'find /var/log -size +1k'],
      tasks: [
        {
          q: 'df -h でルートファイルシステム(/)の使用率(Use%)を確認します。何%使用されていますか（数字のみ、%は不要）。',
          narration: 'まず全体像。df -h で各ファイルシステムの使用率を見る。/ の Use% が逼迫度を示す。',
          check: { type: 'answer', any: ['73'] },
          hints: ['df -h を実行', '/ の行の Use% 列', '73%'],
          explain: 'df -h でルート(/)が73%使用と分かる。df は「どのファイルシステムが逼迫しているか」の全体像を与える。次は du でその中のどこが食っているかを絞り込む。',
        },
        {
          q: '/var/log 以下で最も容量を食っているログファイルを特定してください。ファイル名(拡張子含む)を答えてください。',
          narration: 'du -h /var/log で内訳を見て、find -size で大きいファイルを特定する。df→du→findの絞り込み。',
          check: { type: 'answer', any: ['huge.log', '/var/log/app/huge.log', 'app/huge.log'] },
          answerHint: 'ファイル名',
          hints: ['du -h /var/log で内訳、app が大きい', 'find /var/log -size +1k -type f で大きいファイル', 'huge.log(約8KB)が犯人'],
          explain: 'du で /var/log/app が大きいと分かり、find -size +1k で huge.log を特定。肥大化ログはローテーション設定の不備が原因のことが多い。対策はログローテーション(logrotate)の設定。全体(df)→絞り込み(du)→犯人(find)の流れは容量障害対応の定石。',
        },
      ],
      review: { steps: ['df -h で逼迫FSを特定', 'du -sh/-h で大きいディレクトリを絞る', 'find -size で犯人ファイルを特定', 'ローテーション等で対処'], commands: [{ cmd: 'df -h', meaning: 'ファイルシステム使用率' }, { cmd: 'du -h /var/log', meaning: 'ディレクトリ別サイズ' }], why: 'ディスク枯渇はサービス停止(可用性低下)の主因。素早い原因特定が運用の基本。', practice: 'ディスクアラート対応、肥大ログの特定とローテーション設定、不要ファイルの削除。', related: ['ログ管理', 'find', '可用性'] },
      learned: ['df', 'du', 'disk-usage', 'troubleshooting'], solution: ['df -h', 'du -h /var/log', 'find /var/log -size +1k -type f'],
    },

    {
      id: 'sa-02-logmgmt',
      title: 'ログの管理とローテーション',
      minutes: 10,
      objectives: ['ログローテーションの仕組みを理解する', '古い/圧縮ログを見分ける'],
      prereq: ['sa-01-disk'],
      briefing: 'サーバーのログは放置すると無限に増える。ローテーション(古いログを退避・圧縮・削除)の仕組みと、調査時のログの探し方を理解する。',
      concepts: [{
        title: 'ログローテーション',
        why: 'ログは増え続けディスクを圧迫する。一方、調査のため一定期間は保持したい。この両立がローテーション。',
        problem: '最新ログは app.log、少し前は app.log.1、さらに前は app.log.2.gz(圧縮)——どれを見ればよいか。',
        how: 'logrotate が定期的に、現行ログをリネーム(app.log→app.log.1)し、古いものを圧縮(.gz)、さらに古いものを削除する。調査では app.log(最新)に加え、app.log.1 や *.gz(過去分)も確認する。番号が大きいほど古い。',
        example: 'app.log (最新) → app.log.1 → app.log.2.gz (圧縮済み・古い)',
        relation: 'ローテーションされたログ群を見分け、調査対象を把握する。',
      }],
      env: {
        user: 'analyst', dirs: ['/var/log/nginx'],
        files: [
          { path: '/var/log/nginx/access.log', owner: 'analyst', content: 'today request 1\ntoday request 2\n' },
          { path: '/var/log/nginx/access.log.1', owner: 'analyst', content: 'yesterday request\n' },
          { path: '/var/log/nginx/access.log.2.gz', owner: 'analyst', content: '\u001f\u008b(compressed data)\n' },
          { path: '/var/log/nginx/access.log.3.gz', owner: 'analyst', content: '\u001f\u008b(compressed data)\n' },
        ],
      },
      quick: ['cd /var/log/nginx', 'ls -l', 'ls access.log*', 'cat access.log', 'cat access.log.1'],
      tasks: [
        {
          q: '/var/log/nginx にローテーションされた access.log 系のファイルは、現行(access.log)を含めて全部でいくつありますか。ls で確認して数えてください。',
          narration: 'ls access.log* でローテーション済みを含む一覧が見える。現行・.1・.gz を数える。',
          check: { type: 'answer', any: ['4'] },
          hints: ['ls access.log* を実行', 'access.log, .1, .2.gz, .3.gz', '4つ'],
          explain: 'access.log(最新)・.1(昨日)・.2.gz/.3.gz(圧縮された過去分)の4つ。logrotateが世代管理している。調査で「先週の」ログを見たいなら過去世代(.gz含む)を確認する必要がある。',
        },
        {
          q: 'これらのうち、既にgzipで圧縮されている(拡張子が .gz)古いログは何個ありますか。',
          narration: '一定以上古いログは圧縮されて .gz になる。ls や find で .gz を数える。',
          check: { type: 'answer', any: ['2'] },
          hints: ['ls *.gz または find . -name "*.gz"', 'access.log.2.gz と access.log.3.gz', '2つ'],
          explain: '.gz は圧縮済みの古いログ(.2.gz/.3.gz)。ディスク節約のため古い世代は圧縮される。実機では zcat/zgrep で圧縮したまま中身を検索できる。番号が大きいほど古く、保持期間を過ぎると削除される。ローテーション設計は「保持期間 vs ディスク」のバランス。',
        },
      ],
      review: { steps: ['ls access.log* で世代を確認', '番号が大きいほど古い', '.gz は圧縮済み過去分', '調査は過去世代も対象に'], commands: [{ cmd: 'ls -l /var/log/nginx/access.log*', meaning: 'ログ世代の一覧' }], why: 'ログ管理は運用と調査の両面で重要。過去世代を見落とすと、少し前の事象を追えない。', practice: 'logrotate設定、過去ログの調査(zgrep)、保持期間とコンプライアンス要件の調整。', related: ['ディスク管理', 'ログ解析', 'cron'] },
      learned: ['log-rotation', 'logrotate', 'gzip-logs', 'log-retention'], solution: ['cd /var/log/nginx', 'ls access.log*', 'ls access.log.2.gz access.log.3.gz'],
    },

    {
      id: 'sa-03-services-audit',
      title: 'サービスの棚卸し',
      minutes: 9,
      objectives: ['稼働中サービスを一覧する', '自動起動設定を監査する'],
      prereq: ['sa-01-disk'],
      briefing: 'このサーバーで何が動き、何が再起動時に自動起動するのか。サービスの棚卸しは、堅牢化と安定運用の基礎だ。',
      concepts: [{
        title: 'サービスの監査(systemctl)',
        why: '意図しないサービスが動いていないか、不要なものが自動起動していないかを把握するため。',
        problem: '稼働中・自動起動のサービスを一覧し、不要・不審なものを見つけたい。',
        how: 'systemctl list-units でサービスの active/enabled 状態を一覧。enabled は再起動時に自動起動する。不要なのに enabled のものは堅牢化の対象(Defenseステージ参照)。見覚えのないサービスは侵害の兆候かもしれない。',
        example: '$ systemctl list-units\nsshd.service   enabled  active',
        relation: 'サービス一覧から不要/不審なものを洗い出す。',
      }],
      env: {
        hostname: 'srv-20', user: 'analyst', sudo: true,
        services: [
          { name: 'sshd', desc: 'OpenSSH', active: true, enabled: true },
          { name: 'nginx', desc: 'web', active: true, enabled: true },
          { name: 'cron', desc: 'scheduler', active: true, enabled: true },
          { name: 'tor', desc: 'anonymity service (unexpected!)', active: true, enabled: true },
        ],
      },
      quick: ['systemctl list-units', 'systemctl status tor', 'systemctl status nginx'],
      tasks: [
        {
          q: 'サービス一覧を確認すると、本番Webサーバーには不釣り合いな、匿名通信に使われるサービスが動いています。そのサービス名を答えてください。',
          narration: 'systemctl list-units で全サービスを眺め、用途に合わない見慣れないものを探す。',
          check: { type: 'answer', any: ['tor'], ci: true },
          hints: ['systemctl list-units を実行', 'sshd/nginx/cron は正常。残りは？', 'tor(匿名通信)が不審に動いている'],
          explain: 'tor は匿名通信サービス。通常のWebサーバーに不要で、攻撃者がC2通信を隠すために入れた可能性がある。見慣れないサービスの発見は侵害検知の一手。正体を調査し、不正なら停止・無効化(Defenseステージの堅牢化)する。',
        },
        {
          q: 'その tor サービスを停止し、自動起動も無効化してください。両方できたら done。',
          narration: '不審サービスは stop + disable で恒久停止(Defenseの復習)。sudo が要る。',
          check: { type: 'all', of: [{ type: 'service', name: 'tor', active: false }, { type: 'service', name: 'tor', enabled: false }] },
          noInput: true,
          hints: ['sudo systemctl stop tor', 'sudo systemctl disable tor', 'systemctl status tor で確認し done'],
          explain: 'stop+disable で tor を恒久的に無効化。サービスの棚卸しと不要サービスの除去は、攻撃面削減と侵害対応の両面で効く。定期的な棚卸しで「いつの間にか増えた」サービスを検出することが重要。',
        },
      ],
      review: { steps: ['systemctl list-units で全サービス確認', '用途に合わないものを特定', 'stop+disableで無効化'], commands: [{ cmd: 'systemctl list-units', meaning: 'サービス一覧' }, { cmd: 'sudo systemctl disable tor', meaning: '不審サービスを無効化' }], why: 'サービス棚卸しは堅牢化と侵害検知の交差点。何が動くべきかを把握してこそ異常に気づける。', practice: '定期的なサービス監査、構成管理(あるべき状態との差分検出)、不要サービス除去。', related: ['堅牢化', 'systemctl', '侵害検知'] },
      learned: ['service-audit', 'systemctl-list', 'rogue-service', 'baseline'], solution: ['systemctl list-units', 'sudo systemctl stop tor', 'sudo systemctl disable tor'],
    },

    {
      id: 'sa-04-packages',
      title: 'インストール物を把握する',
      minutes: 9,
      objectives: ['インストール済みパッケージ/ログを調べる', '不審な導入物を見つける'],
      prereq: ['sa-03-services-audit'],
      briefing: 'サーバーに何がインストールされているかの把握は、脆弱性管理と侵害調査の基礎。パッケージ導入のログから、不審なインストールを見つける。',
      concepts: [{
        title: 'パッケージ管理と導入履歴',
        why: 'インストール物のバージョンは脆弱性管理に直結し、不審な導入は侵害の痕跡になる。',
        problem: 'いつ・何がインストールされたか、特に攻撃ツールらしきものが入っていないかを知りたい。',
        how: 'Debian系は dpkg/apt。インストール履歴は /var/log/dpkg.log や /var/log/apt/history.log に残る。grep で "install" 行を抽出し、時刻と共に導入物を確認。攻撃ツール(nmap, netcat, 攻撃用スクリプト)が侵入後に入れられていないかを見る。',
        example: '$ grep " install " /var/log/dpkg.log',
        relation: 'dpkg.log から不審なパッケージ導入を特定する。',
      }],
      env: {
        hostname: 'srv-20', user: 'analyst',
        files: [{ path: '/var/log/dpkg.log', owner: 'analyst', content:
`2026-09-01 10:00:00 install nginx:amd64 <none> 1.22.0
2026-09-01 10:00:05 install openssh-server:amd64 <none> 8.9p1
2026-10-14 03:22:10 install netcat-traditional:amd64 <none> 1.10
2026-10-14 03:22:40 install nmap:amd64 <none> 7.94
2026-10-14 03:23:00 install john:amd64 <none> 1.9.0
` }],
      },
      quick: ['grep install /var/log/dpkg.log', 'grep "2026-10-14" /var/log/dpkg.log', 'cat /var/log/dpkg.log'],
      tasks: [
        {
          q: 'dpkg.log を見ると、9月の正規セットアップとは別に、10月14日の未明にまとめて攻撃ツールらしきパッケージが導入されています。その中の「パスワードクラッカー」として有名なツール名を答えてください。',
          narration: 'grep で install 行を抽出し、時刻でまとめて入った不審な導入を探す。攻撃に使われるツール名に注目。',
          check: { type: 'answer', any: ['john', 'john-the-ripper', 'john:amd64'], ci: true },
          answerHint: 'ツール名',
          hints: ['grep "2026-10-14" /var/log/dpkg.log', 'netcat, nmap, john がまとめて導入されている', 'john(John the Ripper=パスワードクラッカー)'],
          explain: '10月14日未明に netcat(リバースシェル)・nmap(スキャン)・john(パスワードクラック)がまとめて導入＝侵入後に攻撃者がツールを展開した痕跡。導入時刻が正規セットアップ(9月)と乖離しているのが手がかり。パッケージ導入ログの監査で、侵害後の活動を検出できる。',
        },
        {
          q: '10月14日に導入された不審なパッケージは全部でいくつありますか。',
          narration: '時刻で絞って件数を数える。grep と wc の組み合わせ。',
          check: { type: 'answer', any: ['3'] },
          hints: ['grep "2026-10-14" /var/log/dpkg.log | wc -l', 'netcat, nmap, john', '3つ'],
          explain: '10/14に3つ(netcat/nmap/john)が導入された。攻撃者のツールキット展開の典型。対策はパッケージ導入の監視(file integrity monitoring)、最小インストール原則、不審な導入時のアラート。正規の変更管理プロセス外の導入は赤信号。',
        },
      ],
      review: { steps: ['dpkg.log/apt履歴を確認', 'install行を抽出', '時刻の乖離で不審導入を特定', 'ツール名から攻撃意図を推定'], commands: [{ cmd: 'grep install /var/log/dpkg.log', meaning: '導入パッケージの履歴' }, { cmd: 'grep "2026-10-14" /var/log/dpkg.log', meaning: '特定日の導入を抽出' }], why: 'インストール物の把握は脆弱性管理と侵害調査の両面で基礎。不審な導入は侵害後活動の痕跡。', practice: 'パッケージ監査、EOL/脆弱版の検出、変更管理外の導入検知、最小インストール。', related: ['脆弱性管理', 'ログ解析', '侵害検知'] },
      learned: ['package-management', 'dpkg-log', 'install-audit', 'attacker-tooling'], solution: ['grep install /var/log/dpkg.log', 'grep "2026-10-14" /var/log/dpkg.log'],
    },
  ],
};
