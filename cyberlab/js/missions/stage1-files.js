// Stage 1: ファイル調査・検索・テキスト処理
export const stage1 = {
  id: 'stage1',
  title: 'Stage 1 — ファイルを調べ、情報を掘り出す',
  subtitle: '検索・閲覧・テキスト処理で「隠れた情報」を見つける',
  intro: '侵害の疑いがあるサーバーのディスクイメージを渡された。無数のファイルの中から、手がかりとなる情報を自力で掘り出していく。',
  missions: [
    {
      id: 'f-01-find',
      title: '散らばった設定ファイルを探す',
      minutes: 8,
      objectives: ['find で名前・種類からファイルを探す', 'ワイルドカードを使う'],
      prereq: ['tut-02-navigate'],
      briefing: 'あるアプリの設定ファイルがシステム内のどこかにある。しかし置き場所が分からない。ls で一つずつ探すのは非現実的だ。こういうときは find でディレクトリ階層を一気に検索する。',
      concepts: [
        {
          title: 'find — 階層を横断する検索',
          why: '大きなシステムではファイルが数万個ある。手で辿るのは不可能。',
          problem: '「名前が config で終わるファイル」「SUIDが付いた実行ファイル」など、条件でまとめて探したい。',
          how: 'find 開始パス -name "パターン" のように、どこから・何を探すかを指定する。-name はワイルドカード（* は任意の文字列）が使える。-type f でファイル、-type d でディレクトリに絞れる。',
          example: '$ find /etc -name "*.conf"\n/etc/ssh/sshd_config ...',
          relation: 'このミッションでは find で設定ファイルとログを探し当てる。',
        },
      ],
      env: {
        hostname: 'web-01', user: 'analyst',
        dirs: ['/opt/app', '/opt/app/conf', '/opt/app/logs', '/srv/data'],
        files: [
          { path: '/opt/app/conf/app.conf', content: 'listen_port=8080\nsecret_key=hunter2\ndebug=false\n' },
          { path: '/opt/app/conf/db.conf', content: 'db_host=10.0.0.5\ndb_user=appuser\n' },
          { path: '/opt/app/logs/app.log', content: 'INFO service started\nERROR connection refused\n' },
          { path: '/srv/data/notes.md', content: 'TODO: ローテーション設定\n' },
          { path: '/opt/app/README', content: '設定は conf/ 以下。*.conf を探せ。\n' },
        ],
      },
      quick: ['find /opt -type f', 'find /opt -name "*.conf"', 'find / -name app.conf 2>/dev/null', 'cat /opt/app/conf/app.conf'],
      tasks: [
        {
          q: '/opt 以下にある拡張子 .conf のファイルは何個ありますか。find で探して数を答えてください。',
          narration: 'まずは条件に合うファイルを列挙する。find /opt -name "*.conf" で「/opt 以下、名前が .conf で終わる」ものを探せる。',
          check: { type: 'answer', any: ['2', '２'] },
          hints: ['find の開始パスは /opt、条件は -name', 'find /opt -name "*.conf"（* は任意の文字列）', '出力された行数が答え。app.conf と db.conf の2つ'],
          explain: 'find 開始パス -name "パターン" で名前による検索ができる。* は0文字以上の任意文字列にマッチするワイルドカード。クォートで囲むのはシェルが先に * を展開してしまうのを防ぐため。',
        },
        {
          q: 'app.conf の中に書かれている secret_key の値を答えてください。',
          narration: 'find で場所を特定できたら、cat で中身を読む。設定ファイルには認証情報が平文で書かれていることがあり、これは調査でも攻撃でも重要な着眼点になる。',
          check: { type: 'answer', any: ['hunter2'] },
          answerHint: 'secret_key= の右側',
          hints: ['find で app.conf のフルパスを特定する', 'cat /opt/app/conf/app.conf', 'secret_key=___ の値を読む'],
          explain: '設定ファイルに平文で書かれた秘密情報は典型的な脆弱点。実務では権限を絞り、可能なら秘密管理ツール（Vault等）に逃がす。',
        },
        {
          q: '/opt 以下で種類がディレクトリ（-type d）のものを find で列挙しました。conf と logs の親となるディレクトリの絶対パスを答えてください。',
          narration: 'find は -type d でディレクトリだけに絞れる。構造の把握に役立つ。',
          check: { type: 'answer', any: ['/opt/app'] },
          hints: ['find /opt -type d を実行', '出力の中で conf と logs を子に持つもの', '/opt/app が conf/ と logs/ の親'],
          explain: '-type d でディレクトリのみ、-type f でファイルのみに絞れる。構造調査ではまず -type d でどんな区画に分かれているかを掴み、次に -type f で個々のファイルを探す、という順で使い分けると全体像を素早く把握できる。',
        },
      ],
      review: {
        steps: ['find 開始パス -name でファイルを探す', '見つけたパスを cat で読む', '-type d/f で種別を絞る'],
        commands: [
          { cmd: 'find /opt -name "*.conf"', meaning: '名前が.confで終わるファイルを検索' },
          { cmd: 'find /opt -type d', meaning: 'ディレクトリのみ列挙' },
          { cmd: 'cat /opt/app/conf/app.conf', meaning: '見つけた設定を読む' },
        ],
        why: '侵害調査では「どこに何があるか分からない」状態から始まる。find は未知の環境を地図化する最初の武器。',
        practice: 'SUIDバイナリ探索 find / -perm -4000 や、最近変更されたファイルの特定に日常的に使う。',
        related: ['grep による内容検索', 'ファイル権限'],
      },
      learned: ['find', 'wildcards', 'file-types', 'config-secrets'],
      solution: ['find /opt -name "*.conf"', 'cat /opt/app/conf/app.conf', 'find /opt -type d'],
    },

    {
      id: 'f-02-grep',
      title: 'ログから異常を拾い上げる',
      minutes: 10,
      objectives: ['grep で文字列を検索する', 'grep のオプション(-i -n -c -r)を使い分ける'],
      prereq: ['f-01-find'],
      briefing: 'Webサーバーのログが大量に溜まっている。この中から「エラー」と「特定IPからのアクセス」を拾い出したい。ファイル全体を目で追うのは不可能。grep で必要な行だけを抽出する。',
      concepts: [
        {
          title: 'grep — 行を絞り込む',
          why: 'ログは数千〜数百万行になる。欲しいのはそのうちのごく一部。',
          problem: '「ERRORを含む行だけ」「あるIPが出てくる行だけ」を取り出したい。',
          how: 'grep "パターン" ファイル で、パターンを含む行だけを表示する。-i で大小無視、-n で行番号、-c で件数、-r でディレクトリ再帰。',
          example: '$ grep -n ERROR app.log\n3:ERROR disk full',
          relation: 'このミッションではエラー行の抽出と、攻撃元IPの特定を grep で行う。',
        },
      ],
      env: {
        hostname: 'web-01', user: 'analyst',
        dirs: ['/var/log/app'],
        files: [
          { path: '/var/log/app/access.log', content: `203.0.113.9 - - GET /index.html 200
198.51.100.23 - - GET /login 200
203.0.113.9 - - POST /login 401
203.0.113.9 - - POST /login 401
203.0.113.9 - - POST /login 401
198.51.100.23 - - GET /dashboard 200
203.0.113.9 - - POST /login 401
203.0.113.9 - - GET /admin 403
192.0.2.55 - - GET /index.html 200
` },
          { path: '/var/log/app/error.log', content: `WARN slow query 1.2s
ERROR failed login from 203.0.113.9
error disk usage high
ERROR failed login from 203.0.113.9
INFO cache cleared
` },
        ],
      },
      quick: ['cd /var/log/app', 'grep ERROR error.log', 'grep -i error error.log', 'grep -c 401 access.log', 'grep 203.0.113.9 access.log'],
      tasks: [
        {
          q: 'error.log の中で、大文字小文字を区別せず "error" を含む行は何行ありますか。',
          narration: 'ログは書き手によって ERROR / error / Error と表記が揺れる。-i で大小を無視し、-c で件数だけ数えると速い。',
          check: { type: 'answer', any: ['3', '３'] },
          hints: ['大小無視は -i、件数は -c', 'grep -ic error error.log', 'ERROR 2行 + error 1行 = 3行'],
          explain: 'grep -i で大文字小文字を無視、-c でマッチした行数を返す。ログは書き手によって ERROR / error / Error と表記が揺れるため、-i を付けないと「見えているのに数えられていない」行が出る。件数だけ欲しいときは -c が速い。',
        },
        {
          q: 'access.log で /login に対して認証失敗(401)を繰り返している攻撃元のIPアドレスを特定してください。',
          narration: '同じIPから /login への 401（認証失敗）が何度も続くのはブルートフォース（総当たり）の典型的な痕跡だ。401 を含む行を抽出し、発信元IPを読み取ろう。',
          check: { type: 'answer', any: ['203.0.113.9'], normalizeIp: true },
          answerHint: 'xxx.xxx.xxx.xxx 形式',
          hints: ['まず grep 401 access.log で失敗行を抽出', '抽出された行の先頭に並ぶIPを見る', '繰り返し 401 を出している 203.0.113.9 が攻撃元'],
          explain: '短時間に同一IPから認証失敗(401)が連続するのはパスワード総当たりの兆候。実務ではこのIPをファイアウォールやfail2banで遮断する。',
        },
        {
          q: '203.0.113.9 からのアクセスは access.log に何件ありますか。grep -c で数えてください。',
          narration: '攻撃元を特定したら、そのIPの活動量を把握する。grep -c で件数を数えられる。',
          check: { type: 'answer', any: ['6', '６'] },
          hints: ['grep -c で件数', 'grep -c 203.0.113.9 access.log', '出力の数値をそのまま答える'],
          explain: 'grep -c はマッチ行数を返す。攻撃者のIPでフィルタして件数・頻度を見ることで、攻撃の規模を評価できる。次のステージではこれを sort|uniq -c で集計する方法も学ぶ。',
        },
      ],
      review: {
        steps: ['grep -i で表記揺れを吸収', 'grep で攻撃パターン(401)を抽出', '行頭のIPで攻撃元を特定', 'grep -c で件数集計'],
        commands: [
          { cmd: 'grep -ic error error.log', meaning: '大小無視でerrorの件数' },
          { cmd: 'grep 401 access.log', meaning: '認証失敗の行を抽出' },
          { cmd: 'grep -c 203.0.113.9 access.log', meaning: '特定IPのアクセス件数' },
        ],
        why: 'ログ解析はインシデント対応の中核。grepで「正常の中から異常を一行だけ引き抜く」技術は毎日使う。',
        practice: 'auth.log から Failed password を grep して総当たり攻撃を検知する、など実務直結。',
        related: ['パイプで grep | sort | uniq -c', '正規表現'],
      },
      learned: ['grep', 'grep-options', 'log-analysis', 'bruteforce-detection'],
      solution: ['grep -ic error error.log', 'grep 401 access.log', 'grep -c 203.0.113.9 access.log'],
    },

    {
      id: 'f-03-pipes',
      title: 'パイプで集計する',
      minutes: 12,
      objectives: ['パイプ | でコマンドをつなぐ', 'sort と uniq -c で集計する', 'リダイレクトで結果を保存する'],
      prereq: ['f-02-grep'],
      briefing: '前回は攻撃元が1つだったが、実際のログには多数のIPが入り乱れる。「どのIPが何回アクセスしたか」をランキングにしたい。複数のコマンドをパイプでつなげば、小さな道具の組み合わせで集計処理が組める。これがUnixの思想だ。',
      concepts: [
        {
          title: 'パイプとフィルタ',
          why: '1つのコマンドは1つの仕事をうまくこなす。それらをつないで複雑な処理を作るのがUnixの哲学。',
          problem: 'ログからIPを抜き出し、同じものを数え、多い順に並べる——これを一気にやりたい。',
          how: 'cmd1 | cmd2 で、cmd1 の標準出力を cmd2 の標準入力に渡す。cut/awk で列を抜き、sort で並べ、uniq -c で重複を数える。> でファイルに保存、>> で追記。',
          example: '$ cut -d" " -f1 access.log | sort | uniq -c | sort -rn',
          relation: 'このミッションでアクセス元IPランキングを1本のパイプラインで作る。',
        },
      ],
      env: {
        hostname: 'web-01', user: 'analyst',
        dirs: ['/var/log/app', '/home/analyst/report'],
        files: [
          { path: '/var/log/app/access.log', owner: 'analyst', content: `203.0.113.9 GET /login 401
198.51.100.23 GET /index 200
203.0.113.9 GET /login 401
10.0.0.5 GET /index 200
203.0.113.9 GET /login 401
198.51.100.23 GET /about 200
203.0.113.9 GET /admin 403
10.0.0.5 GET /index 200
203.0.113.9 GET /login 401
198.51.100.23 GET /index 200
` },
        ],
      },
      quick: ['cd /var/log/app', 'cut -d" " -f1 access.log', 'cut -d" " -f1 access.log | sort', 'cut -d" " -f1 access.log | sort | uniq -c', 'cut -d" " -f1 access.log | sort | uniq -c | sort -rn'],
      tasks: [
        {
          q: 'access.log の各行の先頭フィールド（IPアドレス）だけを取り出すコマンドを実行します。最もアクセス数が多いIPを答えてください。',
          narration: '行は空白区切り。cut -d" " -f1 で1列目（IP）だけを抜ける。それを sort で並べ、uniq -c で連続する重複を数え、さらに sort -rn で件数の多い順に並べる。',
          check: { type: 'answer', any: ['203.0.113.9'], normalizeIp: true },
          answerHint: '最多アクセスのIP',
          hints: ['cut -d" " -f1 access.log でIPだけ取り出す', 'そのあと | sort | uniq -c で集計（uniqは事前のsortが必要）', '| sort -rn で多い順。先頭が最多IP'],
          explain: 'uniq -c は「隣り合う」重複しか数えないため、必ず sort で同じ行を隣接させてから使う。sort -rn は数値(n)の降順(r)。この sort|uniq -c|sort -rn は集計の定番パターン。',
        },
        {
          q: 'そのランキング結果（IPごとのアクセス数、多い順）を /home/analyst/report/top_ips.txt に保存してください。保存できたら done と入力。',
          narration: '調査結果は証拠として残す。コマンドの出力を画面ではなくファイルへ向けるのがリダイレクト > だ。',
          check: { type: 'all', of: [
            { type: 'state', path: '/home/analyst/report/top_ips.txt', exists: true },
            { type: 'state', path: '/home/analyst/report/top_ips.txt', contains: '203.0.113.9' },
          ] },
          answerHint: '保存したら done',
          hints: ['パイプラインの最後に > でファイル名を指定', 'cut -d" " -f1 access.log | sort | uniq -c | sort -rn > /home/analyst/report/top_ips.txt', '保存後 cat で中身を確認し done と入力'],
          explain: '> は標準出力をファイルにリダイレクトし、既存内容を上書きする。>> なら追記。パイプラインの末尾に付ければ集計結果をそのまま保存できる。インシデント対応では必ず証跡を残す。',
        },
        {
          q: '401（認証失敗）だけに絞ってから攻撃元IPを集計します。401 を含む行のうち最多のIPのアクセス「回数」を答えてください。',
          narration: 'grep と cut とパイプを組み合わせる。まず grep 401 で失敗行だけにし、そこから同じ集計をかける。道具を足し引きするだけで分析の切り口を変えられるのがパイプの強み。',
          check: { type: 'answer', any: ['4', '４'] },
          hints: ['grep 401 access.log | cut -d" " -f1 | sort | uniq -c', '203.0.113.9 の行だけが 401 を持つ', 'その件数(回数)を数字で答える'],
          explain: 'grep（絞り込み）→ cut（列抽出）→ sort|uniq -c（集計）と、単機能の道具を直列につないで分析した。同じ部品で「全アクセス」と「失敗のみ」など観点を切り替えられる。これがフィルタ指向の強力さ。',
        },
      ],
      review: {
        steps: ['cut/awk で列を抽出', 'sort で整列', 'uniq -c で件数化', 'sort -rn でランキング', '> で保存'],
        commands: [
          { cmd: 'cut -d" " -f1 access.log', meaning: '空白区切りの1列目(IP)を抽出' },
          { cmd: 'sort | uniq -c', meaning: '整列してから重複を数える' },
          { cmd: 'sort -rn', meaning: '数値の降順に並べる' },
          { cmd: '> report/top_ips.txt', meaning: '結果をファイルに保存' },
        ],
        why: 'ログ集計・頻度分析はSOC(セキュリティ監視)の日常業務。パイプで即席の分析ツールを組む力は極めて実用的。',
        practice: 'awk \'{print $1}\' access.log | sort | uniq -c | sort -rn でアクセス元ランキングを出すのは現場の定番。',
        related: ['awk による高度な抽出', 'ログローテーション'],
      },
      learned: ['pipe', 'cut', 'sort', 'uniq', 'redirect', 'log-aggregation'],
      solution: [
        'cd /var/log/app',
        'cut -d" " -f1 access.log | sort | uniq -c | sort -rn',
        'cut -d" " -f1 access.log | sort | uniq -c | sort -rn > /home/analyst/report/top_ips.txt',
        'grep 401 access.log | cut -d" " -f1 | sort | uniq -c',
      ],
    },
  ],
};
