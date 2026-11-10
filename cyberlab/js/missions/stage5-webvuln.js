// Stage 5: Webアプリケーションの脆弱性演習（ゲーム内仮想Webアプリに対してのみ実施）
export const stage5 = {
  id: 'stage5',
  title: 'Stage 5 — Webの脆弱性を突く',
  subtitle: 'SQLインジェクション・ディレクトリトラバーサルの仕組みを手で理解する',
  intro: 'Acmeの社内Webアプリに脆弱性診断を実施する。すべてゲーム内の仮想アプリが対象で、実在のサーバーには一切触れない。攻撃の仕組みを理解し、なぜ危険かを説明できるようになることが目的だ。',
  missions: [
    {
      id: 'w-01-sqli',
      title: 'SQLインジェクションで認証を回避',
      minutes: 13,
      objectives: ['SQLインジェクションの仕組みを理解する', 'ログインフォームを認証回避する', '根本原因と対策を説明する'],
      prereq: ['n-03-web-recon'],
      briefing: 'ログイン画面 /login がある。正規の資格情報は持っていない。だが入力値がSQL文にそのまま埋め込まれていれば、クエリの意味を書き換えて認証を突破できる。仮想アプリ相手に、その手口を体験する。',
      concepts: [
        {
          title: 'SQLインジェクション(SQLi)',
          why: 'Webアプリは入力値を使ってDBに問い合わせる。入力を文字列として安全に扱わず、SQL文に連結すると、入力でSQLの構造を改変できてしまう。',
          problem: `典型例: "SELECT * FROM users WHERE name='$user' AND pass='$pass'" に $user をそのまま埋め込むと、入力次第でWHERE条件を常に真にできる。`,
          how: `name に ' OR '1'='1 を入れると WHERE name='' OR '1'='1' AND ... となり、'1'='1' が常に真。条件が崩れて最初のユーザー(多くは管理者)としてログインが通る。これを認証回避という。`,
          example: `$ curl -X POST http://web.lab/login -d "user=' OR '1'='1&pass=x"\nWelcome admin!`,
          relation: 'このミッションで、正規ログインの失敗を確認したうえでSQLiペイロードを送り、回避に成功させる。',
        },
      ],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: {
          self: '10.10.14.7',
          dns: { 'web.lab': '10.10.14.50' },
          hosts: {
            '10.10.14.50': { ports: [
              { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'Apache/2.4.52', http: {
                routes: [
                  { path: '/', body: '<html><body><h1>Acme Portal</h1><form action="/login" method="post">user/pass</form></body></html>' },
                  { path: '/login', method: 'GET', body: '<html><body><form action="/login" method="post"><input name="user"><input name="pass"></form></body></html>' },
                  // SQLi 成功条件: user にSQLメタ文字（' OR 等）が含まれる
                  { path: '/login', method: 'POST', when: { param: 'user', regex: "'\\s*or\\s*'?1'?\\s*=\\s*'?1|'\\s*or\\s*1\\s*=\\s*1|'--|'\\s*or\\s*'" },
                    body: '<html><body><h1>Welcome, admin!</h1><p>認証を回避しました。 FLAG{sqli_auth_bypass_7c1a}</p></body></html>' },
                  // それ以外(正規の誤った資格情報含む)は失敗
                  { path: '/login', method: 'POST', default: '<html><body><p>Invalid username or password.</p></body></html>' },
                ],
                notFound: { body: '404 Not Found', status: 404 },
              } },
            ] },
          },
        },
      },
      quick: [
        'curl http://web.lab/login',
        'curl -X POST http://web.lab/login -d "user=admin&pass=admin"',
        'curl -X POST http://web.lab/login -d "user=\' OR \'1\'=\'1&pass=x"',
      ],
      tasks: [
        {
          q: 'まず正規の推測ログインを試します。user=admin, pass=admin を送ると、レスポンスには認証失敗を示す英単語が含まれます。その単語（1語）を答えてください。',
          narration: '攻撃の前に、通常の挙動を確認する。当て推量のパスワードでPOSTしてみて、失敗時のレスポンスを把握しておく。これが「成功」との比較基準になる。',
          check: { type: 'answer', any: ['Invalid'], ci: true },
          answerHint: 'レスポンス中の単語',
          hints: ['curl -X POST http://web.lab/login -d "user=admin&pass=admin"', 'POSTデータは -d で送る。&を含むので全体をクォートで囲む', 'レスポンスの "Invalid username or password." の先頭の語'],
          explain: '正規の誤った資格情報では "Invalid username or password." が返る。これがベースライン。診断では常に「正常な失敗」と「異常な成功」を比較して脆弱性を判断する。',
        },
        {
          q: `user フィールドに SQLインジェクションのペイロード（例: ' OR '1'='1 ）を入れて認証を回避し、レスポンスに現れるフラグ FLAG{...} の中身（波括弧の中）を答えてください。`,
          narration: `入力がSQL文に連結されているなら、' で文字列を抜け出し OR '1'='1 で条件を常に真にできる。pass は何でもよい。& を含むのでデータ全体をクォートで囲むのを忘れずに。`,
          check: { type: 'answer', any: ['sqli_auth_bypass_7c1a'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: [`user に ' OR '1'='1 を仕込む`, `curl -X POST http://web.lab/login -d "user=' OR '1'='1&pass=x"`, 'レスポンスの FLAG{sqli_auth_bypass_7c1a} の中身を答える'],
          explain: `' OR '1'='1 により WHERE 条件が常に真となり、先頭ユーザー(admin)として認証が通った。これが認証回避。根本原因は入力値をSQL文字列に連結したこと。対策は【プリペアドステートメント(パラメータ化クエリ)】で値とSQL構造を分離すること。入力検証やWAFは補助であり、本質的対策はパラメータ化。`,
        },
        {
          q: 'このSQLインジェクションの根本的な対策として最も有効なのはどれですか。番号で答えてください。 1) 入力をURLエンコードする 2) プリペアドステートメント(パラメータ化クエリ)を使う 3) エラーメッセージを隠す 4) HTTPSにする',
          narration: '攻撃を再現できたら、必ず「どう直すか」まで理解する。表面的な緩和と、根本対策を区別できることが実務で問われる。',
          check: { type: 'answer', any: ['2'] },
          answerHint: '番号',
          hints: ['入力を連結していることが原因', '値とSQL構造を分離する仕組みは？', 'プリペアドステートメント＝2 が根本対策'],
          explain: '正解は2。プリペアドステートメントは値をSQLの「構造」ではなく「データ」として扱うため、どんな入力もSQLを書き換えられない。3(エラー秘匿)や4(HTTPS)は別のリスク低減にはなるがSQLi自体は防げない。1(エンコード)も不十分。根本原因に対処するのが鉄則。',
        },
      ],
      review: {
        steps: ['正規の失敗レスポンスをベースライン化', "user に ' OR '1'='1 を注入してPOST", '認証回避の成功を確認', '根本対策(パラメータ化クエリ)を特定'],
        commands: [
          { cmd: 'curl -X POST .../login -d "user=admin&pass=admin"', meaning: '正常な失敗を確認' },
          { cmd: `curl -X POST .../login -d "user=' OR '1'='1&pass=x"`, meaning: 'SQLiで認証回避' },
        ],
        why: 'SQLiはOWASP Top10常連の重大脆弱性。手で再現し、正常系と比較して判断し、根本対策まで言える力が診断業務で問われる。',
        practice: 'ログインや検索フォームへの ' + "' や OR の注入はWeb診断の基本チェック。開発側はORM/プリペアドで必ず防ぐ。",
        related: ['UNIONベースSQLi', 'ブラインドSQLi', 'プリペアドステートメント', 'WAF'],
      },
      learned: ['sqli', 'auth-bypass', 'owasp', 'prepared-statements', 'http-post'],
      solution: [
        'curl -X POST http://web.lab/login -d "user=admin&pass=admin"',
        `curl -X POST http://web.lab/login -d "user=' OR '1'='1&pass=x"`,
      ],
    },

    {
      id: 'w-02-traversal',
      title: 'ディレクトリトラバーサルで機密を読む',
      minutes: 11,
      objectives: ['パストラバーサルの仕組みを理解する', '../ でWebルートからLinux機密ファイルへ抜ける', '対策を説明する'],
      prereq: ['w-01-sqli'],
      briefing: 'ファイル閲覧機能 /download?file=... がある。ファイル名を無検証でパスに連結しているなら、../ を使ってWeb公開領域の外——システムの /etc/passwd まで読み出せるかもしれない。',
      concepts: [
        {
          title: 'ディレクトリトラバーサル(パストラバーサル)',
          why: 'アプリが「指定ファイルを返す」機能で、ファイル名を検証せずパスに連結すると、相対パス ../ で想定外の場所へ移動できてしまう。',
          problem: 'files/report.pdf を返すつもりが、file=../../../../etc/passwd を渡されるとサーバーの /etc/passwd を返してしまう。',
          how: `../ は親ディレクトリへ一段上がる(Stage0で学んだ通り)。十分な数の ../ を重ねてルート / まで遡り、/etc/passwd のような絶対的に存在する機密へ到達する。`,
          example: '$ curl "http://web.lab/download?file=../../../../etc/passwd"\nroot:x:0:0:root:/root:/bin/bash ...',
          relation: 'このミッションで ../ を使い、Webルートの外の /etc/passwd を読み出す。',
        },
      ],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: {
          self: '10.10.14.7',
          dns: { 'web.lab': '10.10.14.50' },
          hosts: {
            '10.10.14.50': { ports: [
              { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'Apache/2.4.52', http: {
                routes: [
                  { path: '/', body: '<html><body><h1>Acme Docs</h1><a href="/download?file=welcome.txt">welcome</a></body></html>' },
                  { path: '/download', when: { param: 'file', regex: '\\.\\./|/etc/passwd|%2e%2e' },
                    body: 'root:x:0:0:root:/root:/bin/bash\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nsvc_acme:x:1001:1001:Acme service account FLAG{path_tr4v3rs4l_e9d2}:/home/svc_acme:/bin/bash\n' },
                  { path: '/download', when: { param: 'file', equals: 'welcome.txt' }, body: 'Welcome to Acme document server.\n' },
                  { path: '/download', default: 'Error: file not found\n' },
                ],
                notFound: { body: '404 Not Found', status: 404 },
              } },
            ] },
          },
        },
      },
      quick: [
        'curl "http://web.lab/download?file=welcome.txt"',
        'curl "http://web.lab/download?file=../../../../etc/passwd"',
      ],
      tasks: [
        {
          q: '正常系を確認します。file=welcome.txt を要求したときに返るメッセージの最初の単語（英語1語）を答えてください。',
          narration: 'まず正規の使い方を観察する。? 以降のクエリや & を含むURLは、シェルに解釈されないよう必ずダブルクォートで囲むこと。',
          check: { type: 'answer', any: ['Welcome'], ci: true },
          answerHint: 'レスポンスの先頭語',
          hints: ['curl "http://web.lab/download?file=welcome.txt"', 'URLは ? を含むのでクォートで囲む', '"Welcome to Acme document server." の先頭語'],
          explain: '正常時は指定どおり welcome.txt の内容が返る。この時点では無害に見えるが、ファイル名の扱いに脆弱性が潜む。正常系の把握は攻撃の前提。',
        },
        {
          q: `file パラメータに ../ を重ねて /etc/passwd を読み出し、その中に紛れているフラグ FLAG{...} の中身を答えてください。`,
          narration: 'Webアプリの公開ディレクトリは /var/www/html などルートから数階層下にある。../ を十分な数（4〜5個も重ねれば十分）並べて / まで遡り、/etc/passwd を指す。余分な ../ があっても / より上には行けないので問題ない。',
          check: { type: 'answer', any: ['path_tr4v3rs4l_e9d2'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['file=../../../../etc/passwd を渡す', 'curl "http://web.lab/download?file=../../../../etc/passwd"', '/etc/passwd の svc_acme の行(gecos欄)にある FLAG{path_tr4v3rs4l_e9d2}'],
          explain: `../ の連続でWebルートを脱出し、サーバーの /etc/passwd を読み出せた。これがディレクトリトラバーサル。/etc/passwd はユーザー一覧の宝庫で、侵入の足がかりになる。根本対策は【ユーザー入力をパスに使わない／正規化後に許可ディレクトリ配下か検証する(basename化・ホワイトリスト)】こと。`,
        },
        {
          q: 'ディレクトリトラバーサルの対策として適切なのはどれですか。番号で答えてください。 1) 入力ファイル名を正規化し許可ディレクトリ配下に収まるか検証する 2) ファイル名を長くする 3) 403ページを用意する 4) アクセスログを取る',
          narration: '攻撃の再現で終わらせず、設計レベルの対策まで理解する。',
          check: { type: 'answer', any: ['1'] },
          answerHint: '番号',
          hints: ['原因は入力をパスにそのまま使うこと', 'パスを正規化して許可範囲内か確認する', '1 が根本対策'],
          explain: '正解は1。入力を正規化(realpath等)し、意図したディレクトリ配下かを検証（またはファイル名をホワイトリスト/IDで管理）するのが本質的対策。ログ(4)は検知に役立つが防止にはならない。入力を信頼しないのが鉄則。',
        },
      ],
      review: {
        steps: ['正常なファイル取得を観察', 'file に ../ を重ねてルートへ遡る', '/etc/passwd を読み出す', '対策(パス正規化・検証)を特定'],
        commands: [
          { cmd: 'curl "http://web.lab/download?file=welcome.txt"', meaning: '正常系の確認' },
          { cmd: 'curl "http://web.lab/download?file=../../../../etc/passwd"', meaning: '../でルート外の機密を読む' },
        ],
        why: 'パストラバーサルはファイル処理機能の定番脆弱性。Stage0で学んだ ../ の知識が、そのまま攻撃と防御の理解に直結する。',
        practice: 'ダウンロード/プレビュー/テンプレート読み込み機能は要注意。開発側は入力をパスに使わずID参照＋正規化検証する。',
        related: ['LFI/RFI', 'パス正規化', '最小権限(Webサーバーの実行ユーザー)'],
      },
      learned: ['path-traversal', 'lfi', 'input-validation', 'etc-passwd', 'web-exploitation'],
      solution: [
        'curl "http://web.lab/download?file=welcome.txt"',
        'curl "http://web.lab/download?file=../../../../etc/passwd"',
      ],
    },
  ],
};
