// 情報収集・OSINT（収集済みデータ・設定・メタデータからの情報抽出）
import { mcq } from './_shared.js';

export const stageRecon = {
  id: 'recon',
  title: 'Recon — 情報収集',
  subtitle: '設定・秘密情報・メタデータ・アカウントから手がかりを集める',
  intro: '攻撃も防御も「情報を制する者」が有利。散在する設定・ファイル・メタデータから、意味のある情報を抽出し相関させる技術を磨く。',
  missions: [
    {
      id: 'rc-01-secrets',
      title: '設定に埋もれた秘密を集める',
      minutes: 11,
      objectives: ['複数ファイルを横断して秘密情報を探す', 'grep -r を使いこなす'],
      prereq: [],
      briefing: 'アプリの設定群のどこかに、認証情報やAPIキーが平文で残っている。grep -r でディレクトリ全体を横断検索し、漏れている秘密をすべて拾い出す。',
      concepts: [{
        title: '横断的な秘密情報探索',
        why: '開発者はうっかり設定やコードに秘密を平文で残す。攻撃者も防御者も、それを機械的に洗い出したい。',
        problem: '多数のファイルに散らばる password / api_key / token を一度に見つけたい。',
        how: 'grep -r "パターン" ディレクトリ で再帰検索。grep -rn で行番号付き、grep -ri で大小無視。password|secret|key|token を -E で同時検索。.env や .git/config も狙い目。',
        example: '$ grep -rniE "password|api_key|secret" /opt/app',
        relation: 'grep -r で設定群から秘密情報を網羅的に収集する。',
      }],
      env: {
        user: 'analyst', dirs: ['/opt/app', '/opt/app/config', '/opt/app/.git'],
        files: [
          { path: '/opt/app/config/database.yml', owner: 'analyst', content: 'production:\n  host: db.lab\n  user: appuser\n  password: Pr0d-DB-Pass!\n' },
          { path: '/opt/app/config/app.yml', owner: 'analyst', content: 'name: acme\ndebug: false\n' },
          { path: '/opt/app/.env', owner: 'analyst', content: 'API_KEY=sk-live-9f8a7b6c5d\nSTRIPE_SECRET=whsec_xyz\n' },
          { path: '/opt/app/.git/config', owner: 'analyst', content: '[remote "origin"]\n  url = https://ci-bot:ghp_ABC123token@github.com/acme/app.git\n' },
          { path: '/opt/app/README.md', owner: 'analyst', content: '# Acme App\nSee config/ for settings.\n' },
        ],
      },
      quick: ['grep -rn password /opt/app', 'grep -rniE "password|api_key|secret|token" /opt/app', 'cat /opt/app/.env', 'cat /opt/app/.git/config'],
      tasks: [
        {
          q: 'config/database.yml に平文で書かれている本番DBのパスワードを答えてください（grep で探す）。',
          narration: 'grep -rn で /opt/app 全体を横断し、password を含む行を探す。',
          check: { type: 'answer', any: ['Pr0d-DB-Pass!'] },
          answerHint: 'password: の値',
          hints: ['grep -rn password /opt/app', 'database.yml の password: 行', 'Pr0d-DB-Pass!'],
          explain: 'grep -rn で平文パスワードを発見。設定ファイルへの秘密の平文記載は典型的な漏洩源。対策は秘密を環境変数や秘密管理ツール(Vault)へ逃がし、設定ファイルから排除すること。',
        },
        {
          q: 'さらに .git/config には、Gitリモートに埋め込まれたアクセストークンが漏れています。そのトークン文字列(ghp_ で始まる)を答えてください。',
          narration: '.git/config のような隠しファイルにも秘密が残る。cat や grep で確認。URLに認証情報が埋め込まれる事故は多い。',
          check: { type: 'answer', any: ['ghp_ABC123token'], ci: true },
          answerHint: 'ghp_ で始まる文字列',
          hints: ['cat /opt/app/.git/config', 'url = https://ci-bot:___@github.com/...', 'ghp_ABC123token'],
          explain: 'GitリモートURLに埋め込まれた個人アクセストークン(ghp_)が漏洩。これがあればリポジトリを改ざんできる。.env のAPI_KEYも同様。公開リポジトリやバックアップにこうした秘密が混入する事故は頻発。対策はトークンの即時失効、.gitignore、秘密スキャンツール(git-secrets)の導入。',
        },
        {
          q: '/opt/app 全体から password・api_key・secret・token を含む行を grep -riE でまとめて検索すると、秘密情報を含むファイルは何個見つかりますか（database.yml, .env, .git/config）。',
          narration: '複数パターンを -E で同時検索し、漏洩の全体像を掴む。grep -rliE でファイル名だけ列挙すると数えやすい。',
          check: { type: 'answer', any: ['3'] },
          hints: ['grep -rliE "password|api_key|secret|token" /opt/app', '-l はファイル名のみ表示', 'database.yml, .env, .git/config の3ファイル'],
          explain: 'grep -rliE で秘密を含む3ファイルを特定。-l はマッチしたファイル名のみ表示で、網羅的な棚卸しに便利。これが防御側の「秘密スキャン」の基本動作。CI/CDに秘密スキャンを組み込み、コミット前に検出するのが現代の標準。',
        },
      ],
      review: { steps: ['grep -r で横断検索', '複数パターンを -E で同時検索', '隠しファイル(.env/.git)も対象', '-l でファイルを棚卸し'], commands: [{ cmd: 'grep -rniE "password|api_key|secret|token" /opt/app', meaning: '秘密情報の横断検索' }, { cmd: 'grep -rliE "secret|token" /opt/app', meaning: '含有ファイルの列挙' }], why: '秘密の平文残存はありふれた重大漏洩源。横断検索で網羅的に洗い出す力は攻守両用。', practice: 'ソースコードの秘密スキャン(git-secrets/trufflehog)、設定監査、漏洩トークンの失効。', related: ['情報漏洩', '秘密管理', 'grep'] },
      learned: ['secret-scanning', 'grep-r', 'credential-leak', 'git-secrets'], solution: ['grep -rniE "password|api_key|secret|token" /opt/app', 'cat /opt/app/.git/config'],
    },

    {
      id: 'rc-02-metadata',
      title: 'メタデータとコメントの情報漏洩',
      minutes: 10,
      objectives: ['ファイル内の隠れた情報を抽出する', '開発メモ・作者情報の漏洩を理解する'],
      prereq: ['rc-01-secrets'],
      briefing: '公開ファイルには、本文以外にも情報が潜む——HTMLコメント、作者メタデータ、デバッグ出力。これらの「意図しない情報」を拾い集める。',
      concepts: [{
        title: 'メタデータ・コメントからの情報収集',
        why: '本文には出さない情報が、コメントやメタデータに残り、攻撃者に内部構造・担当者・技術スタックを教えてしまう。',
        problem: '公開HTMLやファイルから、本来見せるべきでない内部情報を抽出したい。',
        how: 'grep でコメント(<!-- -->、# 行)や作者情報(Author:)を抽出。設定のデバッグ出力やバージョン文字列も情報源。公開前にこれらを除去するのが防御。',
        example: '$ grep -i "author\\|TODO\\|password\\|internal" index.html',
        relation: 'ファイルから隠れた内部情報を grep で抽出する。',
      }],
      env: {
        user: 'analyst', dirs: ['/var/www/html'],
        files: [
          { path: '/var/www/html/index.html', owner: 'analyst', content: `<html>
<head><!-- Author: tanaka@acme.local, built with Acme-CMS v3.1 --></head>
<body>
<h1>Welcome</h1>
<!-- TODO: remove debug endpoint /debug?token=dev-9f2 before launch -->
<!-- internal API: http://api.internal.acme.lab:8080 -->
</body>
</html>
` }],
        },
      quick: ['cd /var/www/html', 'cat index.html', 'grep -i author index.html', 'grep -i "TODO\\|internal\\|debug" index.html'],
      tasks: [
        {
          q: 'index.html のHTMLコメントから、このサイトを構築したCMSの名前とバージョンを読み取り、バージョン番号を答えてください（例: 3.1）。',
          narration: 'ブラウザには表示されないコメント(<!-- -->)にも情報がある。grep や cat で生のHTMLを読む。',
          check: { type: 'answer', any: ['3.1', 'v3.1'], ci: true },
          answerHint: 'バージョン番号',
          hints: ['grep -i "built with\\|author" index.html', 'Acme-CMS v3.1 とコメントにある', '3.1'],
          explain: 'HTMLコメントにCMS名とバージョン(Acme-CMS v3.1)が漏れていた。これで攻撃者はそのCMSの既知脆弱性を狙える(バージョン開示=Web IIの復習)。コメントの作者メールも標的型攻撃に悪用される。公開前にコメント・メタデータを除去するのが鉄則。',
        },
        {
          q: 'コメント内に、公開前に消すべきデバッグ用エンドポイントのトークンが残っています。そのトークン(dev- で始まる)を答えてください。',
          narration: 'TODO コメントなどに開発時の秘密が残ることがある。grep で TODO や debug を探す。',
          check: { type: 'answer', any: ['dev-9f2'], ci: true },
          answerHint: 'dev- で始まる',
          hints: ['grep -i "TODO\\|debug" index.html', 'debug endpoint /debug?token=dev-9f2', 'dev-9f2'],
          explain: 'TODOコメントにデバッグエンドポイントとトークン(dev-9f2)、さらに内部API(api.internal.acme.lab)まで漏れていた。開発者のメモは攻撃者への贈り物になりうる。これらは本文に現れず見落とされがちだが、ソース/コメント/メタデータの精査は偵察の定番。公開物のサニタイズを徹底する。',
        },
      ],
      review: { steps: ['生のソース/ファイルを読む', 'コメント(<!-- -->, #)を抽出', 'メタデータ・TODO・内部URLを探す', '公開前除去の重要性を理解'], commands: [{ cmd: 'grep -i "author\\|TODO\\|internal" index.html', meaning: '隠れた内部情報の抽出' }], why: '意図しない情報漏洩は偵察の宝庫。見えない情報(コメント/メタデータ)にこそ手がかりがある。', practice: '公開ファイルのサニタイズ監査、ソースコメントの精査、ドキュメントのメタデータ除去。', related: ['情報漏洩', 'バージョン開示', '偵察'] },
      learned: ['metadata-leak', 'html-comments', 'information-gathering', 'sanitization'], solution: ['cd /var/www/html', 'grep -i "author\\|TODO\\|internal\\|debug" index.html'],
    },

    {
      id: 'rc-03-userenum',
      title: 'ログイン可能なアカウントを列挙',
      minutes: 10,
      objectives: ['/etc/passwdからログイン可能ユーザーを絞り込む', 'ログインシェルの意味を理解する'],
      prereq: ['rc-01-secrets'],
      briefing: 'システムには多数のアカウントがあるが、実際に対話ログインできるのは一部。ログインシェルを手がかりに、攻撃対象になりうる「本物の」ユーザーを絞り込む。',
      concepts: [{
        title: 'ユーザー列挙とログインシェル',
        why: 'サービス用アカウント(nologin)は対話ログインできない。攻撃対象は「ログイン可能な」ユーザーに絞られる。',
        problem: '/etc/passwd の多数のエントリから、実際にログインできる(攻撃価値のある)アカウントだけを抽出したい。',
        how: '/etc/passwd の7列目がログインシェル。/bin/bash や /bin/sh ならログイン可能、/usr/sbin/nologin や /bin/false ならログイン不可(サービス用)。grep や awk -F: でシェルの列を見て絞り込む。',
        example: '$ grep -E "/bin/(ba)?sh$" /etc/passwd   # ログイン可能なアカウント',
        relation: '/etc/passwd からログイン可能ユーザーを絞り込む。',
      }],
      env: {
        hostname: 'srv-20', user: 'analyst',
        users: [{ name: 'deploy' }, { name: 'webadmin' }, { name: 'backup', shell: '/bin/bash' }],
        files: [],
      },
      quick: ['cat /etc/passwd', 'grep bash /etc/passwd', 'grep nologin /etc/passwd', "awk -F: '$7==\"/bin/bash\"' /etc/passwd", 'cut -d: -f1,7 /etc/passwd'],
      tasks: [
        {
          q: '/etc/passwd で、ログインシェルが /bin/bash になっている(＝対話ログイン可能な)アカウントは何個ありますか。',
          narration: '7列目(シェル)が /bin/bash のものを数える。grep bash や awk -F: で絞れる。サービス用(nologin)は除外される。',
          check: { type: 'answer', any: ['5'] },
          hints: ["grep '/bin/bash' /etc/passwd | wc -l", "awk -F: '$7==\"/bin/bash\"' /etc/passwd でも可", 'root, analyst, deploy, webadmin, backup の5つ'],
          explain: 'ログインシェルが /bin/bash のアカウント(root/analyst/deploy/webadmin/backup)が対話ログイン可能＝攻撃の標的候補。www-data や daemon 等のサービスアカウントは /usr/sbin/nologin でログイン不可。攻撃面を「ログイン可能ユーザー」に正しく絞れる。',
        },
        {
          q: 'ログインシェルが nologin(ログイン不可のサービスアカウント)になっているアカウントの例を、/etc/passwd から1つ挙げてください（ユーザー名）。',
          narration: 'grep nologin で、対話ログインできないサービス用アカウントを確認する。これらは通常攻撃対象から外れる。',
          check: { type: 'answer', any: ['www-data', 'daemon', 'sshd'], ci: true },
          answerHint: 'ユーザー名(例を1つ)',
          hints: ['grep nologin /etc/passwd', 'www-data, daemon, sshd など', 'いずれか1つを答える'],
          explain: 'www-data/daemon/sshd 等はシェルが nologin で対話ログイン不可＝サービス専用。これらを nologin にするのは堅牢化(万一乗っ取られても対話シェルを与えない)。ユーザー列挙では「ログイン可能か」を見極め、攻撃面を正確に把握する。cut -d: -f1,7 で名前とシェルを一覧できる。',
        },
      ],
      review: { steps: ['/etc/passwd の7列目(シェル)に注目', 'bash/sh=ログイン可能で絞る', 'nologin/false=サービス用で除外', '攻撃面を正確化'], commands: [{ cmd: "awk -F: '$7==\"/bin/bash\"' /etc/passwd", meaning: 'ログイン可能ユーザー抽出' }, { cmd: 'cut -d: -f1,7 /etc/passwd', meaning: '名前とシェルの一覧' }], why: 'ログイン可能ユーザーの把握は攻撃面の正確な評価に不可欠。サービスアカウントの堅牢化(nologin)にも繋がる。', practice: '総当たり対象の絞り込み、サービスアカウントのnologin化監査、不要アカウントの無効化。', related: ['ユーザー管理', 'passwd', '堅牢化'] },
      learned: ['user-enumeration', 'login-shell', 'nologin', 'attack-surface'], solution: ["awk -F: '$7==\"/bin/bash\"' /etc/passwd", 'grep nologin /etc/passwd'],
    },

    {
      id: 'rc-04-osint-opsec',
      title: 'OSINTとOPSECの考え方',
      minutes: 8,
      objectives: ['OSINTの概念を理解する', '情報漏洩を防ぐOPSECを理解する'],
      prereq: ['rc-02-metadata'],
      briefing: '攻撃者は公開情報(OSINT)から驚くほど多くを知る。その手口を知り、自分たちの情報露出(OPSEC)を管理する視点を持つ。',
      concepts: [{
        title: 'OSINT と OPSEC',
        why: 'OSINT(公開情報収集)で、攻撃者は標的の技術・人・構造を無害に調べ上げる。防御側は自分たちの露出を管理(OPSEC)する必要がある。',
        problem: '公開された断片情報(求人・SNS・DNS・証明書・メタデータ)が、攻撃の下準備に使われる。',
        how: 'OSINTはログイン不要・痕跡を残さず行える偵察。求人票(使用技術)、SNS(人・メール形式)、DNS/証明書(ホスト)、流出DB(パスワード)などを収集・相関する。OPSECはこうした露出を意識し、不要な情報公開を減らす運用規律。',
        example: '求人「Kubernetes経験者募集」→ その組織はk8sを使うと推測できる',
        relation: 'これまでの情報収集を、OSINT/OPSECの枠組みで捉え直す。',
      }],
      env: {}, quick: [],
      tasks: [
        mcq('OSINT(オープンソース・インテリジェンス)の説明として最も適切なものはどれか。',
          ['標的サーバーに侵入して得る情報', '公開されている情報を収集・分析する偵察手法', 'パスワードを総当たりする攻撃', 'ファイルを暗号化する攻撃'], 2,
          'OSINTは公開情報(Web/SNS/DNS/求人/証明書/流出DB等)を収集・相関する偵察。ログイン不要で標的に痕跡を残さず行えるため、攻撃の初期段階で多用される。防御側も自組織のOSINTを定期的に実施し、露出を把握する。',
          { narration: 'OSINTが「何を」収集するかを押さえる。' }),
        mcq('OPSEC(運用上の機密保持)の観点で適切な行動はどれか。',
          ['社内システムの詳細を求人票やSNSに自由に書く', 'エラーメッセージで内部パスやバージョンを公開する', '公開する情報から内部構造の手がかりを減らす', 'サーバーのバージョンを目立つように表示する'], 3,
          'OPSECは「攻撃者に使える情報の露出を最小化する」規律。求人票・SNS・エラーメッセージ・バナー等から内部構造が漏れないよう管理する。これまで学んだバージョン秘匿・メタデータ除去・エラー抑制はすべてOPSECの実践。',
          { narration: '露出を「増やす」行動を消去法で除く。' }),
      ],
      review: { steps: ['OSINTの範囲を理解', '収集源(求人/SNS/DNS/証明書)を知る', '自組織の露出を管理(OPSEC)', '既習の対策をOPSECとして統合'], commands: [], why: 'OSINT/OPSECは技術の外側の攻防。どれだけシステムを固めても、情報露出が多ければ狙われやすい。', practice: '自組織のOSINT調査、公開情報の棚卸し、従業員向けOPSEC教育、露出の継続監視。', related: ['偵察', '情報漏洩', 'ソーシャルエンジニアリング'] },
      learned: ['osint', 'opsec', 'reconnaissance', 'information-exposure'], solution: [],
    },
  ],
};
