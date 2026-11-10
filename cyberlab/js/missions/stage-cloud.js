// クラウド & コンテナ（実技：IAM/S3ポリシー監査・Dockerfileレビュー・コンテナ脱出）
export const stageCloud = {
  id: 'cloud-container',
  title: 'Cloud & Container — 実技',
  subtitle: 'IAM/S3ポリシーをjqで監査・Dockerfileレビュー・コンテナ脱出の兆候',
  intro: 'インフラはクラウドとコンテナで動く。設定(JSON/Dockerfile)を読み、過剰権限・公開設定・危険な構成を自力で見つける。jqで構造化データを扱う力もここで磨く。',
  missions: [
    {
      id: 'cl-01-iam',
      title: 'IAMポリシーの過剰権限を暴く',
      minutes: 12,
      objectives: ['IAMポリシーをjqで解析する', '過剰な権限(ワイルドカード)を特定する'],
      prereq: [],
      briefing: 'クラウドのIAMポリシー(JSON)が渡された。最小権限の原則に反する「何でもできる」過剰な権限が紛れていないか、jqで中身を解析して監査する。',
      concepts: [{
        title: 'IAMポリシーと最小権限',
        why: 'クラウドの権限はIAMポリシー(JSON)で定義される。過剰な権限は、1つのキー漏洩で全リソース掌握を許す。',
        problem: 'Action や Resource に * (ワイルドカード)が使われていないか——つまり「何でも・どこでも」許可していないかを見つけたい。',
        how: 'ポリシーは Statement の配列。各文に Effect(Allow/Deny)、Action(操作)、Resource(対象)。jq でこれらを抽出。Action:"*" や Resource:"*" は「全操作・全リソース」で過剰。最小権限は必要な操作・対象だけに絞る。',
        example: '$ cat policy.json | jq \'.Statement[].Action\'',
        relation: 'jq でポリシーの Action/Effect を抽出し、ワイルドカードを発見する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst', dirs: ['/home/analyst/audit'],
        files: [{ path: '/home/analyst/audit/policy.json', owner: 'analyst', content: `{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ReadLogs", "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::acme-logs/*" },
    { "Sid": "AdminAll", "Effect": "Allow", "Action": "*", "Resource": "*" }
  ]
}` }],
      },
      quick: ['cd /home/analyst/audit', 'cat policy.json | jq .', 'cat policy.json | jq ".Statement[].Action"', 'cat policy.json | jq ".Statement[].Sid"', 'cat policy.json | jq -r ".Statement[].Effect"'],
      tasks: [
        {
          q: 'policy.json には Statement(ポリシー文)がいくつ含まれていますか。jq で配列を調べて答えてください。',
          narration: 'jq ".Statement | length" で配列の要素数が分かる。または .Statement[].Sid で各文のIDを一覧。',
          check: { type: 'answer', any: ['2'] },
          hints: ['cat policy.json | jq ".Statement | length"', 'ReadLogs と AdminAll', '2つ'],
          explain: 'jq ".Statement | length" で2文と分かる。jq はJSONを構造的に扱える——grep で無理やり読むより正確。クラウド/API/ログの時代、jq は必須の道具。',
        },
        {
          q: '各 Statement の Action を jq で抽出します。「すべての操作」を許可してしまっている過剰な権限の Action の値を答えてください。',
          narration: 'jq ".Statement[].Action" で全文の Action を並べる。ワイルドカード(*)が過剰権限のサイン。',
          check: { type: 'answer', any: ['*'] },
          answerHint: 'Action の値',
          hints: ['cat policy.json | jq ".Statement[].Action"', '"s3:GetObject" は限定的、もう一方は？', 'Action が "*" = 全操作許可で過剰'],
          explain: 'AdminAll 文の Action:"*", Resource:"*" は「全操作・全リソース」を許可＝最小権限の重大な違反。このロールのキーが漏れれば全クラウドリソースを掌握される。SSRFで盗まれた一時キー(前ステージ)がこの権限だったら壊滅的。対策は必要な Action/Resource だけに絞ること。jq での機械的な監査が有効。',
        },
      ],
      review: { steps: ['jq . で全体を整形表示', '.Statement[] で各文を展開', '.Action/.Resource を抽出', '* (ワイルドカード)を検出'], commands: [{ cmd: 'cat policy.json | jq ".Statement[].Action"', meaning: 'ポリシーのActionを抽出' }, { cmd: 'cat policy.json | jq ".Statement | length"', meaning: '文の数を数える' }], why: 'IAMの過剰権限はクラウド侵害の被害を最大化する。ポリシー監査(jq)は最小権限実現の基本動作。', practice: 'IAMポリシー監査、ワイルドカード権限の棚卸し、least-privilege化、IAM Access Analyzer。', related: ['least-privilege', 'cloud-security', 'jq'] },
      learned: ['iam-policy', 'jq', 'wildcard-permission', 'least-privilege'], solution: ['cd /home/analyst/audit', 'cat policy.json | jq ".Statement[].Action"'],
    },

    {
      id: 'cl-02-s3',
      title: '公開されたストレージを見つける',
      minutes: 11,
      objectives: ['バケットポリシーの公開設定を見抜く', 'Principal:* の危険を理解する'],
      prereq: ['cl-01-iam'],
      briefing: 'クラウド事故で最も多いのが「公開設定のストレージ」。バケットポリシー(JSON)を jq で調べ、全世界に公開されてしまっている設定を特定する。',
      concepts: [{
        title: 'ストレージの公開設定',
        why: 'クラウドストレージ(S3等)の公開設定ミスは、大量の個人情報・機密が全世界に露出する最頻出事故。',
        problem: 'バケットポリシーの Principal(誰に許可するか)が * (全員)になっていないかを見つけたい。',
        how: 'バケットポリシーの Statement で Principal:"*" は「認証不要・全員に許可」＝公開。Effect:Allow と組み合わさると誰でもアクセスできる。jq で Principal を抽出して確認。対策はパブリックアクセスのブロック、Principal を特定アカウント/ロールに限定。',
        example: '$ cat bucket-policy.json | jq \'.Statement[].Principal\'',
        relation: 'jq で Principal を抽出し、公開(* )設定を見つける。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst', dirs: ['/home/analyst/audit'],
        files: [{ path: '/home/analyst/audit/bucket-policy.json', owner: 'analyst', content: `{
  "Statement": [
    {
      "Sid": "PublicRead",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::acme-customer-data/*",
      "Note": "FLAG{public_bucket_exposure_c5b1}"
    }
  ]
}` }],
      },
      quick: ['cd /home/analyst/audit', 'cat bucket-policy.json | jq .', 'cat bucket-policy.json | jq -r ".Statement[].Principal"', 'cat bucket-policy.json | jq -r ".Statement[].Resource"'],
      tasks: [
        {
          q: 'bucket-policy.json の Principal(アクセスを許可する相手)を jq で抽出してください。全世界に公開されていることを示す Principal の値を答えてください。',
          narration: 'jq ".Statement[].Principal" で誰に許可しているかを見る。* なら「全員(公開)」。',
          check: { type: 'answer', any: ['*'] },
          answerHint: 'Principal の値',
          hints: ['cat bucket-policy.json | jq -r ".Statement[].Principal"', 'Principal が特定アカウントでなく？', '"*" = 全世界に公開'],
          explain: 'Principal:"*" + Effect:Allow + s3:GetObject ＝ 認証不要で誰でもオブジェクトを読める「公開バケット」。顧客データ(acme-customer-data)が全世界に露出している重大事故。クラウド漏洩の典型。対策はパブリックアクセスブロックの有効化と Principal の限定。',
        },
        {
          q: 'このポリシーの Note フィールドに、脆弱性を示すフラグが入っています。jq で取り出して FLAG{...} の中身を答えてください。',
          narration: 'jq で任意のフィールドを抜ける。.Statement[].Note を取り出す。',
          check: { type: 'answer', any: ['public_bucket_exposure_c5b1'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['cat bucket-policy.json | jq -r ".Statement[].Note"', 'Note フィールドを抽出', 'FLAG{public_bucket_exposure_c5b1}'],
          explain: 'jq -r ".Statement[].Note" でフラグを抽出。jq は深い階層や任意フィールドを正確に取り出せる。公開バケットは検索エンジンやツール(GrayhatWarfare等)で見つけられ、気づかぬうちに大量流出する。クラウドでは「デフォルト非公開」を徹底し、公開は明示的・最小限にする。',
        },
      ],
      review: { steps: ['jq . でポリシー全体を確認', '.Principal で許可相手を抽出', '* (全員)を検出', '任意フィールドもjqで抽出'], commands: [{ cmd: 'cat bucket-policy.json | jq -r ".Statement[].Principal"', meaning: '公開設定(Principal)の確認' }], why: '公開ストレージはクラウド漏洩の筆頭。ポリシー監査で「誰に公開しているか」を機械的に確認する。', practice: 'バケットポリシー監査、パブリックアクセスブロック、公開リソースの定期スキャン。', related: ['cloud-security', 'misconfiguration', 'jq'] },
      learned: ['bucket-policy', 'public-exposure', 'principal-wildcard', 'jq'], solution: ['cd /home/analyst/audit', 'cat bucket-policy.json | jq -r ".Statement[].Principal"', 'cat bucket-policy.json | jq -r ".Statement[].Note"'],
    },

    {
      id: 'cl-03-dockerfile',
      title: 'Dockerfileを安全性レビューする',
      minutes: 12,
      objectives: ['Dockerfileの危険な記述を見つける', 'ベストプラクティス違反を指摘する'],
      prereq: [],
      briefing: 'コンテナイメージの設計図 Dockerfile をレビューする。ハードコードされた秘密、root実行、不安定なタグなど、本番に出してはいけない記述を洗い出す。',
      concepts: [{
        title: 'Dockerfileのセキュリティレビュー',
        why: 'Dockerfileの不備は、作られる全コンテナに影響する。秘密の埋め込みやroot実行は重大リスク。',
        problem: 'イメージに秘密が焼き込まれていないか、rootで動いていないか、再現性のないタグを使っていないかを確認したい。',
        how: 'grep でチェック: ENV/ARG に password/key/token(秘密の埋め込み。レイヤーに残り消せない)、USER root または USER 指定なし(root実行)、FROM ...:latest(再現性なし)、ADD でのリモート取得。ベストプラクティスは非rootユーザー、固定バージョンタグ、秘密はビルド時シークレット/実行時注入。',
        example: '$ grep -niE "password|secret|key|USER|FROM" Dockerfile',
        relation: 'Dockerfileから秘密・root実行・latestタグを見つける。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst', dirs: ['/home/analyst/app'],
        files: [{ path: '/home/analyst/app/Dockerfile', owner: 'analyst', content: `FROM ubuntu:latest
RUN apt-get update && apt-get install -y python3
ENV DB_PASSWORD=Sup3rS3cret-Prod
COPY . /app
WORKDIR /app
USER root
EXPOSE 8080
CMD ["python3", "app.py"]
` }],
      },
      quick: ['cd /home/analyst/app', 'cat Dockerfile', 'grep -niE "password|secret|key" Dockerfile', 'grep -n "FROM" Dockerfile', 'grep -n "USER" Dockerfile'],
      tasks: [
        {
          q: 'Dockerfile にハードコードされてしまっている本番DBのパスワードを答えてください（grep で探す）。',
          narration: 'ENV や ARG に秘密を書くと、イメージのレイヤーに残り、イメージを入手した誰もが読める。grep で password を探す。',
          check: { type: 'answer', any: ['Sup3rS3cret-Prod'] },
          answerHint: 'DB_PASSWORD の値',
          hints: ['grep -niE "password|secret" Dockerfile', 'ENV DB_PASSWORD=___', 'Sup3rS3cret-Prod'],
          explain: 'ENV DB_PASSWORD=... はイメージレイヤーに焼き込まれ、docker history やイメージ展開で誰でも読める(削除してもレイヤーに残る)。秘密はビルド時シークレットや実行時の環境変数/シークレットマネージャで注入する。イメージに秘密を埋めないのが鉄則。',
        },
        {
          q: 'このDockerfileは再現性の観点で問題のあるベースイメージのタグを使っています。FROM 行で使われている、バージョンを固定しない不安定なタグ名を答えてください。',
          narration: 'FROM のタグに注目。:latest は「その時の最新」で、ビルド毎に中身が変わり再現性・脆弱性管理を損なう。',
          check: { type: 'answer', any: ['latest'], ci: true },
          hints: ['grep FROM Dockerfile', 'FROM ubuntu:___', 'latest(固定されないタグ)'],
          explain: ':latest はビルドの度に異なるイメージになりうる(再現性なし)うえ、どのバージョンか不明で脆弱性管理ができない。さらに USER root で特権実行、という問題もある。ベストプラクティスは【固定バージョンタグ(ubuntu:22.04)+非rootユーザー+秘密は埋め込まない+最小ベースイメージ】。これらは Advanced ステージのコンテナ理論の実践。',
        },
      ],
      review: { steps: ['grep で秘密(password/key)を探す', 'FROM のタグ(latest)を確認', 'USER root を確認', 'ベストプラクティスと照合'], commands: [{ cmd: 'grep -niE "password|secret|key" Dockerfile', meaning: '埋め込み秘密の検出' }, { cmd: 'grep -n "FROM\\|USER" Dockerfile', meaning: 'ベースイメージ/実行ユーザー確認' }], why: 'Dockerfileの不備は全コンテナに波及。秘密埋め込み・root実行・latestは本番前に必ず潰す。', practice: 'Dockerfileレビュー、イメージの秘密スキャン(trivy/grype)、非root化、タグ固定。', related: ['container-security', 'supply-chain', 'secret-scanning'] },
      learned: ['dockerfile-review', 'hardcoded-secret', 'latest-tag', 'container-best-practice'], solution: ['cd /home/analyst/app', 'grep -niE "password|secret|key" Dockerfile', 'grep -n "FROM" Dockerfile'],
    },

    {
      id: 'cl-04-escape',
      title: 'コンテナ脱出の兆候を探す',
      minutes: 12,
      objectives: ['コンテナ内にいることを判定する', '脱出に繋がる危険な構成を見つける'],
      prereq: ['cl-03-dockerfile'],
      briefing: '侵入したシェルが、コンテナの中かホストか分からない。コンテナ特有の痕跡を確認し、もしホストへ「脱出」できる危険な構成(特権・ホストマウント・危険なcapability)があれば特定する。',
      concepts: [{
        title: 'コンテナ脱出の兆候',
        why: 'コンテナはホストとカーネルを共有するため、危険な構成だと「脱出」してホストを奪取できる。まず自分がコンテナ内かを知る必要がある。',
        problem: 'コンテナ内かどうか、そしてホストへ脱出できる構成(特権モード・ホストFSマウント・危険なcapability)があるかを判定したい。',
        how: 'コンテナの痕跡: /.dockerenv ファイルの存在、/proc/1/cgroup に docker/containerd。脱出経路: 特権コンテナ、ホストの/がマウントされている、CAP_SYS_ADMIN等の危険なcapability(getcapで確認)、docker.sockのマウント。これらがあればホスト奪取が可能。',
        example: '$ ls -la /.dockerenv   # あればコンテナ内\n$ getcap -r / 2>/dev/null',
        relation: 'コンテナの痕跡と、脱出に使える危険な構成を特定する。',
      }],
      env: {
        hostname: 'webapp-container', user: 'analyst',
        dirs: ['/host', '/host/etc'],
        files: [
          { path: '/.dockerenv', owner: 'root', mode: 0o644, content: '' },
          { path: '/proc/1/cgroup', owner: 'root', mode: 0o444, content: '12:devices:/docker/3f9a2b1c\n11:memory:/docker/3f9a2b1c\n' },
          { path: '/host/etc/shadow', owner: 'root', mode: 0o640, content: 'root:$6$hostroot$HASH:19500:0:99999:7:::\n' },
          { path: '/usr/bin/toolbin', owner: 'root', mode: 0o755, caps: 'cap_sys_admin+ep' },
        ],
      },
      quick: ['ls -la /.dockerenv', 'cat /proc/1/cgroup', 'ls -la /host', 'getcap -r /usr/bin 2>/dev/null', 'cat /host/etc/shadow'],
      tasks: [
        {
          q: '自分がコンテナの中にいることを示す、ルート直下の特徴的なファイルがあります。そのファイル名(先頭のドット含む)を答えてください。',
          narration: 'Dockerコンテナのルートには目印のファイルが置かれる。ls -la / で隠しファイルも見る。',
          check: { type: 'answer', any: ['.dockerenv', '/.dockerenv'] },
          answerHint: '/ 直下のファイル',
          hints: ['ls -la / で隠しファイルを確認', 'docker 特有の目印ファイル', '/.dockerenv の存在＝コンテナ内'],
          explain: '/.dockerenv の存在はDockerコンテナ内にいる証拠。/proc/1/cgroup に docker/... とあるのも同じ兆候。侵入後まず「コンテナかホストか」を判定するのが脱出の第一歩。コンテナ内なら、脱出できる構成がないかを次に調べる。',
        },
        {
          q: 'このコンテナには、ホスト奪取に悪用できる危険なLinux capabilityを持つバイナリがあります。getcap で /usr/bin を調べ、その危険なcapability名を答えてください(cap_ で始まる)。',
          narration: 'getcap -r /usr/bin でcapability付きバイナリを探す。CAP_SYS_ADMIN は「ほぼroot」と言われる非常に強い権限で脱出に使える。',
          check: { type: 'answer', any: ['cap_sys_admin', 'cap_sys_admin+ep'], ci: true },
          answerHint: 'cap_ で始まる',
          hints: ['getcap -r /usr/bin 2>/dev/null', 'toolbin に付いている capability', 'cap_sys_admin(ほぼroot相当の危険な権限)'],
          explain: 'toolbin が cap_sys_admin+ep を持つ＝「ほぼroot」の強力な権限で、マウント操作等を通じてコンテナ脱出→ホスト奪取に悪用できる。さらに /host にホストのFSがマウントされ、/host/etc/shadow(ホストのパスワード)まで読める構成も致命的。対策は【不要なcapability削除(--cap-drop)、特権モード禁止、ホストFS/docker.sockをマウントしない、非root実行】。コンテナの分離はこうした構成次第で簡単に崩れる。',
        },
      ],
      review: { steps: ['/.dockerenv や /proc/1/cgroup でコンテナ判定', 'getcapで危険なcapabilityを探す', 'ホストマウント(/host)を確認', '脱出経路を特定し塞ぐ'], commands: [{ cmd: 'ls -la /.dockerenv', meaning: 'コンテナ内かの判定' }, { cmd: 'getcap -r /usr/bin 2>/dev/null', meaning: '危険なcapabilityの検出' }], why: 'コンテナ脱出はクラウドネイティブ環境の重大リスク。分離は構成次第で崩れる——危険な構成の検出が要。', practice: 'コンテナのセキュリティ診断、cap/privileged/マウントの監査、ランタイム保護(gVisor/seccomp)。', related: ['container-security', 'capabilities', 'privilege-escalation'] },
      learned: ['container-escape', 'dockerenv', 'linux-capabilities', 'host-mount'], solution: ['ls -la /.dockerenv', 'cat /proc/1/cgroup', 'getcap -r /usr/bin 2>/dev/null'],
    },
  ],
};
