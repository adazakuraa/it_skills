// Web脆弱性 II（コマンドインジェクション・XSS・IDOR・情報漏洩・アップロード）
// すべてゲーム内の仮想Webアプリが対象。実在サーバーには一切通信しない。
const H = (routes, notFound = { body: '404 Not Found', status: 404 }) => ({ routes, notFound });

export const stageWebAdv = {
  id: 'web-adv',
  title: 'Web II — 攻撃面を広げる',
  subtitle: 'コマンドインジェクション・XSS・IDOR・情報漏洩を体験し対策する',
  intro: 'SQLi・トラバーサルに続き、Webアプリの代表的な脆弱性をさらに掘る。いずれも「入力を信頼した」ことに起因する——その共通構造を掴む。',
  missions: [
    {
      id: 'wa-01-cmdi',
      title: 'コマンドインジェクション',
      minutes: 12,
      objectives: ['OSコマンドインジェクションの仕組みを理解する', '区切り文字でコマンドを連結する', '対策を説明する'],
      prereq: [],
      briefing: 'ネットワーク診断ツール /diag がホスト名を受け取り ping を実行する。もし入力をシェルコマンドに連結しているなら、; や | で別のコマンドを注入できる。',
      concepts: [{
        title: 'OSコマンドインジェクション',
        why: 'アプリが外部コマンド(ping等)を呼ぶ際、入力をコマンド文字列に連結すると、シェルのメタ文字で任意コマンドを実行されてしまう。',
        problem: '"ping " + $host をシェルで実行すると、host に "; id" を入れれば ping の後に id も実行される。',
        how: 'シェルの区切り文字 ; (順次) | (パイプ) && (成功時) を使い、本来のコマンドに自分のコマンドを継ぎ足す。SQLiがSQLへの注入なら、これはOSシェルへの注入。',
        example: '$ curl "http://web.lab/diag?host=127.0.0.1;id"\nPING ok\nuid=0(root) ...',
        relation: 'host パラメータに ;id を注入してコマンド実行を起こす。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'web.lab': '10.10.14.50' }, hosts: { '10.10.14.50': { ports: [
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'gunicorn', http: H([
            { path: '/', body: '<html><body>Network Diagnostics: /diag?host=</body></html>' },
            { path: '/diag', when: { param: 'host', regex: ';|\\||&&|`|\\$\\(' },
              body: 'PING 127.0.0.1: 1 packets\n--- result ---\nuid=0(root) gid=0(root) groups=0(root)\nFLAG{os_command_injection_a1f7}\n' },
            { path: '/diag', default: 'PING: 1 packets transmitted, 1 received\n' },
          ]) },
        ] } } },
      },
      quick: ['curl "http://web.lab/diag?host=127.0.0.1"', 'curl "http://web.lab/diag?host=127.0.0.1;id"', 'curl "http://web.lab/diag?host=x|whoami"'],
      tasks: [
        {
          q: 'まず正常に host=127.0.0.1 を診断します。レスポンスに含まれる、pingが送受信したパケットを表す英単語(複数形)を答えてください。',
          narration: '正常系を確認。? を含むURLはクォートで囲む。',
          check: { type: 'answer', any: ['packets'], ci: true },
          hints: ['curl "http://web.lab/diag?host=127.0.0.1"', 'PING ... 1 packets ...', 'packets'],
          explain: '正常時は ping の結果が返る。ここまでは無害。だが入力がシェルコマンドに連結されているかもしれない——それを次で検証する。',
        },
        {
          q: 'host パラメータに ;id のようなコマンド注入を仕込み、サーバー上でコマンドを実行させて、レスポンスに現れるフラグ FLAG{...} の中身を答えてください。',
          narration: 'host の値の後ろに ; を付けて別コマンドを継ぎ足す。シェルは ; で区切られた複数コマンドを順に実行する。',
          check: { type: 'answer', any: ['os_command_injection_a1f7'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['curl "http://web.lab/diag?host=127.0.0.1;id"', '; で ping の後に id を注入', 'レスポンスの uid=0(root) とともに出る FLAG を読む'],
          explain: '"ping $host" のようにシェルに入力を連結したため、;id が別コマンドとして実行され、しかもroot権限だった(危険)。根本対策は【シェルを経由せず引数配列でコマンドを実行する／入力を厳格に検証(ホワイトリスト)する】こと。シェル呼び出しに入力を混ぜないのが鉄則。SQLiと同じ「データをコードとして解釈させた」構造。',
        },
        {
          q: 'OSコマンドインジェクションの根本対策として最も適切なのはどれか。番号で答えてください。 1) 入力をHTMLエスケープする 2) シェルを介さず引数を配列で渡し入力を検証する 3) HTTPSを使う 4) エラーを非表示にする',
          narration: 'どの層で何を直すのが本質かを考える。',
          check: { type: 'answer', any: ['2'] },
          hints: ['原因はシェルに入力を連結したこと', 'シェルを経由しない実行方法は？', '2 が根本対策'],
          explain: '正解は2。シェル文字列に入力を混ぜず、引数配列(execve相当)で渡せばメタ文字が解釈されない。加えて入力の厳格な検証(ホワイトリスト)を行う。HTMLエスケープ(1)はXSS対策、HTTPS(3)は通信保護で、コマンドインジェクションには無効。',
        },
      ],
      review: { steps: ['正常系を観察', 'host に ;id を注入', 'コマンド実行(root)を確認', '対策=シェル非経由+入力検証'], commands: [{ cmd: 'curl "http://web.lab/diag?host=127.0.0.1;id"', meaning: 'コマンド注入' }], why: 'コマンドインジェクションはRCE(遠隔コード実行)に直結する最重大級の脆弱性。入力を外部コマンドに渡す箇所は要注意。', practice: 'ping/nslookup/画像変換等、外部コマンドを呼ぶ機能の診断。開発側は引数配列化・入力検証。', related: ['SQLi', 'RCE', '入力検証'] },
      learned: ['command-injection', 'rce', 'shell-metachar', 'input-validation'], solution: ['curl "http://web.lab/diag?host=127.0.0.1"', 'curl "http://web.lab/diag?host=127.0.0.1;id"'],
    },

    {
      id: 'wa-02-xss',
      title: '反射型XSS',
      minutes: 11,
      objectives: ['XSSの仕組みを理解する', '入力がエスケープされず反射されることを確認する', '対策を説明する'],
      prereq: ['wa-01-cmdi'],
      briefing: '検索機能 /search は検索語をそのままページに表示する。もしHTMLエスケープしていなければ、<script> を仕込んで他人のブラウザでスクリプトを実行させられる——反射型XSSだ。',
      concepts: [{
        title: 'クロスサイトスクリプティング(XSS)',
        why: 'ユーザー入力をHTMLに埋め込む際にエスケープしないと、入力がスクリプトとしてブラウザで実行され、Cookie窃取やなりすましが起きる。',
        problem: '検索語 <script>…</script> がそのままHTMLに出力されると、閲覧者のブラウザでそのスクリプトが動く。',
        how: '反射型XSSは、URLパラメータ等の入力が即座にレスポンスへ反映される箇所で起こる。攻撃者は細工したURLを被害者に踏ませ、被害者の権限でスクリプトを実行(セッションCookie窃取等)する。対策は出力時のHTMLエスケープ(< を &lt; に等)。',
        example: '/search?q=<script>alert(document.cookie)</script> が反射されると実行される',
        relation: '検索語に<script>を入れ、エスケープされず反射されることを確認する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'web.lab': '10.10.14.50' }, hosts: { '10.10.14.50': { ports: [
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'nginx', http: H([
            { path: '/search', when: { param: 'q', contains: '<script>' },
              body: '<html><body><h2>Results for: <script>alert(document.cookie)</script></h2><p>0 hits</p><!-- reflected without escaping: XSS! FLAG{reflected_xss_d4e8} --></body></html>' },
            { path: '/search', default: '<html><body><h2>Results for: (none)</h2></body></html>' },
          ]) },
        ] } } },
      },
      quick: ['curl "http://web.lab/search?q=hello"', 'curl "http://web.lab/search?q=<script>alert(document.cookie)</script>"'],
      tasks: [
        {
          q: '検索語 q に <script>alert(document.cookie)</script> を入れて /search を叩きます。レスポンスのHTMLを見ると、その <script> タグはエスケープ(無害化)されていますか。されているなら yes、生のまま反射されているなら no と答えてください。',
          narration: '入力した<script>がレスポンスにそのまま(生で)現れるか、&lt;script&gt;のように無害化されているかを確認する。生で出ていればXSS成立。',
          check: { type: 'answer', any: ['no', 'いいえ'], ci: true },
          answerHint: 'yes または no',
          hints: ['curl "http://web.lab/search?q=<script>alert(document.cookie)</script>"', 'レスポンス中に <script> がそのまま出ているか見る', 'エスケープされず生で反射→XSS成立→no'],
          explain: '入力した<script>がエスケープされず生のままHTMLに反射された＝反射型XSSが成立。実ブラウザならこのスクリプトが実行され、document.cookie(セッション)が盗まれうる。curlはスクリプトを実行しないが、反射の有無でXSSを判定できる。',
        },
        {
          q: 'このレスポンスのHTMLコメント内に脆弱性を示すフラグが埋め込まれています。FLAG{...} の中身を答えてください。',
          narration: 'レスポンス全体をよく読む。HTMLコメント(<!-- -->)の中にもヒントが隠れていることがある。',
          check: { type: 'answer', any: ['reflected_xss_d4e8'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['curl の出力全体を見る', '<!-- ... --> のコメント内', 'FLAG{reflected_xss_d4e8}'],
          explain: 'HTMLコメントにもソース情報が漏れることがある(開発メモ等)。反射型XSSの根本対策は【出力時のHTMLエスケープ】(< を &lt; に変換)と、Content-Security-Policyの導入。入力時でなく“出力時の文脈”に応じたエスケープが鍵。CyberLab自身も全出力をtextContentで描画しXSSを防いでいる。',
        },
      ],
      review: { steps: ['入力に<script>を仕込む', 'レスポンスで反射(未エスケープ)を確認', 'コメント等の情報も読む', '対策=出力エスケープ+CSP'], commands: [{ cmd: 'curl "http://web.lab/search?q=<script>alert(document.cookie)</script>"', meaning: 'XSSペイロードの反射確認' }], why: 'XSSはWeb最頻出級。セッション窃取やなりすましに繋がる。出力エスケープの徹底が要。', practice: '検索/コメント/プロフィール等の反射・保存箇所の診断。開発はテンプレートの自動エスケープとCSP。', related: ['CSP', 'Cookie/セッション', '出力エスケープ'] },
      learned: ['xss', 'reflected-xss', 'output-encoding', 'csp'], solution: ['curl "http://web.lab/search?q=<script>alert(document.cookie)</script>"'],
    },

    {
      id: 'wa-03-idor',
      title: 'IDOR：他人のデータを覗く',
      minutes: 10,
      objectives: ['アクセス制御不備(IDOR)を理解する', 'IDを変えて他人の資源へアクセスする', '対策を説明する'],
      prereq: ['wa-01-cmdi'],
      briefing: 'プロフィールAPI /api/profile?id=1 は自分の情報を返す。だがサーバーが「そのIDが本当に本人のものか」を確認していなければ、id を変えるだけで他人の情報が見られてしまう。',
      concepts: [{
        title: 'IDOR(安全でない直接オブジェクト参照)',
        why: '認証は通っても、個々の資源アクセスで認可(本人の資源か)を確認しないと、他人のデータに手が届く。',
        problem: 'id=1(自分)を id=2 に変えただけで、権限チェックがなければ他人(admin)のデータが返る。',
        how: 'URLやパラメータ中のID(ユーザーID・注文番号・ファイルID)を推測・変更して、本来アクセスできない他人の資源を参照する。OWASPの「アクセス制御の不備」の代表例。対策はサーバー側で毎回「この資源は要求者のものか」を検証すること。',
        example: '/api/profile?id=1 → 自分 / id=2 → 他人(チェックが無ければ見える)',
        relation: 'id を変えて管理者のプロフィールを読み出す。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'web.lab': '10.10.14.50' }, hosts: { '10.10.14.50': { ports: [
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'express', http: H([
            { path: '/api/profile', when: { param: 'id', equals: '1' }, body: '{"id":1,"user":"analyst","role":"user","email":"analyst@acme.local"}', contentType: 'application/json' },
            { path: '/api/profile', when: { param: 'id', equals: '2' }, body: '{"id":2,"user":"admin","role":"administrator","secret_note":"FLAG{idor_broken_access_5b2c}"}', contentType: 'application/json' },
            { path: '/api/profile', default: '{"error":"not found"}' },
          ]) },
        ] } } },
      },
      quick: ['curl "http://web.lab/api/profile?id=1"', 'curl "http://web.lab/api/profile?id=2"'],
      tasks: [
        {
          q: 'まず自分のプロフィール(id=1)を取得します。返ってきたJSONの role(権限)の値を答えてください。',
          narration: '正常系。自分のIDでAPIを叩き、返り値の構造を把握する。',
          check: { type: 'answer', any: ['user'], ci: true },
          hints: ['curl "http://web.lab/api/profile?id=1"', 'JSONの "role":"___"', 'user'],
          explain: 'id=1 では自分(analyst, role=user)の情報が返る。ここで「idを変えたら？」と考えるのが攻撃者の発想。IDが連番で推測可能な点も危険。',
        },
        {
          q: 'id を 2 に変えて他人(管理者)のプロフィールを取得し、その中の secret_note に入っているフラグ FLAG{...} の中身を答えてください。',
          narration: 'id=1 を id=2 に変えるだけ。サーバーが本人確認をしていなければ、管理者の情報が返ってくる。',
          check: { type: 'answer', any: ['idor_broken_access_5b2c'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['curl "http://web.lab/api/profile?id=2"', 'id を 2 にするだけ', 'secret_note の FLAG{idor_broken_access_5b2c}'],
          explain: 'id=2 で管理者(role=administrator)の情報が丸見え＝IDOR。認証は通っていても、各リクエストで「この資源は要求者本人のものか」を検証していないのが原因(アクセス制御の不備)。対策はサーバー側で所有者チェックを必ず行い、IDも推測困難なもの(UUID等)にする。クライアント任せの制御は無力。',
        },
      ],
      review: { steps: ['自分のIDで正常系を把握', 'IDを他人の値に変更', '他人の資源が返ることを確認', '対策=サーバー側の所有者チェック'], commands: [{ cmd: 'curl "http://web.lab/api/profile?id=2"', meaning: '他人のIDでアクセス(IDOR)' }], why: 'IDORは実被害の多い頻出脆弱性。パラメータ1つで情報漏洩に至る。認可の徹底が要。', practice: '注文番号・ユーザーID・ファイルIDを変えるテスト。開発はサーバー側所有者検証とランダムID。', related: ['アクセス制御', '認可', 'OWASP'] },
      learned: ['idor', 'broken-access-control', 'authorization', 'object-reference'], solution: ['curl "http://web.lab/api/profile?id=1"', 'curl "http://web.lab/api/profile?id=2"'],
    },

    {
      id: 'wa-04-headers',
      title: 'HTTPヘッダからの情報漏洩',
      minutes: 9,
      objectives: ['レスポンスヘッダを読む', 'バージョン開示のリスクを理解する'],
      prereq: ['wa-01-cmdi'],
      briefing: 'サーバーは応答ヘッダに自分のソフト名やバージョンを載せがち。攻撃者はそこから既知の脆弱性(CVE)を狙う。curl -I でヘッダを覗く。',
      concepts: [{
        title: 'バージョン開示と情報漏洩',
        why: 'ソフト名・バージョンが分かると、攻撃者はそのバージョンの既知脆弱性(CVE)を直接狙える。攻撃の下調べを助けてしまう。',
        problem: 'Server や X-Powered-By ヘッダに具体的なバージョンが出ていると、攻撃面が明確になる。',
        how: 'curl -I でレスポンスヘッダのみ取得。Server: Apache/2.4.29 のような開示を確認。対策はバージョン情報の抑制(server_tokens off 等)、セキュリティヘッダ(CSP, X-Frame-Options等)の付与。',
        example: '$ curl -I http://web.lab/\nServer: Apache/2.4.29 (Ubuntu)',
        relation: 'curl -I でServerヘッダのバージョンを読み取る。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'web.lab': '10.10.14.50' }, hosts: { '10.10.14.50': { ports: [
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'Apache/2.4.29 (Ubuntu)', http: H([
            { path: '/', body: '<html><body>Acme</body></html>' },
          ]) },
        ] } } },
      },
      quick: ['curl -I http://web.lab/', 'curl -I http://web.lab/ | grep -i server'],
      tasks: [
        {
          q: 'curl -I でレスポンスヘッダを取得し、Server ヘッダに開示されている Apache のバージョン番号を答えてください（例: 2.4.29）。',
          narration: 'curl -I はヘッダのみ取得する。Server 行にソフト名とバージョンが出る。',
          check: { type: 'answer', any: ['2.4.29'] },
          answerHint: 'x.y.z 形式',
          hints: ['curl -I http://web.lab/', 'Server: Apache/___ の行', '2.4.29'],
          explain: 'Server: Apache/2.4.29 とバージョンが開示されている。攻撃者はこの版の既知CVEを検索し、刺さる攻撃を選ぶ。対策は server_tokens off 等でバージョンを隠し(軽減策)、何より該当バージョンを最新に保つ(根本)。バージョン秘匿は「時間稼ぎ」であり、パッチ適用の代わりにはならない点に注意。',
        },
        {
          q: 'バージョン情報の開示が攻撃者にとって有用なのはなぜか。最も適切なものを番号で。 1) 通信を暗号化できるから 2) そのバージョンの既知の脆弱性(CVE)を狙えるから 3) パスワードが分かるから 4) DNSを書き換えられるから',
          narration: '情報漏洩が「次の一手」にどう繋がるかを考える。',
          check: { type: 'answer', any: ['2'] },
          hints: ['バージョンが分かると何を調べられる？', 'Sec基礎のCVEを思い出す', '2 が正解'],
          explain: '正解は2。ソフトとバージョンが分かれば、攻撃者はそのバージョンに該当するCVE(既知脆弱性)を調べ、確実に効く攻撃を選べる。偵察(recon)の精度が上がる。だから不要な情報開示は避け、かつ最新版へのパッチ適用で既知脆弱性自体を潰すのが本質対策。',
        },
      ],
      review: { steps: ['curl -I でヘッダ取得', 'Server/X-Powered-By のバージョンを確認', 'CVEとの関連を理解', '対策=開示抑制+パッチ'], commands: [{ cmd: 'curl -I http://web.lab/', meaning: 'レスポンスヘッダを取得' }], why: '情報漏洩は単体では軽微でも、攻撃の下調べを助け連鎖の起点になる。開示の最小化は基本。', practice: 'ヘッダ診断(Server/X-Powered-By)、セキュリティヘッダの有無確認、バージョン管理。', related: ['CVE/CVSS', '偵察', 'セキュリティヘッダ'] },
      learned: ['information-disclosure', 'version-banner', 'http-headers', 'recon'], solution: ['curl -I http://web.lab/'],
    },

    {
      id: 'wa-05-upload',
      title: '安全でないファイルアップロード',
      minutes: 11,
      objectives: ['アップロード検証不備のリスクを理解する', '拡張子チェックの甘さを突く', '対策を説明する'],
      prereq: ['wa-01-cmdi'],
      briefing: '画像アップロード機能 /upload が、ファイル名の拡張子を十分に検証していない。実行可能な .php を上げられれば、Webシェルを設置してサーバーを乗っ取れる。',
      concepts: [{
        title: '安全でないファイルアップロード',
        why: 'アップロードされたファイルの種類・内容・保存先を検証しないと、Webシェル等の実行可能ファイルを設置され、RCEに至る。',
        problem: '「画像だけ」のはずが、shell.php をアップロードでき、しかもWeb公開領域で実行可能になってしまう。',
        how: '拡張子やContent-Typeだけの検証は回避されやすい(shell.php, shell.php.jpg, 大文字PHP等)。対策は【許可拡張子のホワイトリスト+内容(マジックバイト)検証+アップロード先を実行不可にする+ファイル名をサーバー側で再生成】。',
        example: 'filename=shell.php を上げられ /uploads/shell.php?c=id でコマンド実行',
        relation: '画像以外(.php)を上げられてしまうことを確認する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'web.lab': '10.10.14.50' }, hosts: { '10.10.14.50': { ports: [
          { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'php', http: H([
            { path: '/upload', method: 'POST', when: { param: 'filename', regex: '\\.php' },
              body: 'Upload accepted. Stored at /uploads/shell.php (executable!)\nWarning: no server-side validation.\nFLAG{unrestricted_file_upload_c3a9}\n' },
            { path: '/upload', method: 'POST', default: 'Only .jpg/.png images are allowed.\n' },
          ]) },
        ] } } },
      },
      quick: ['curl -X POST http://web.lab/upload -d "filename=cat.jpg"', 'curl -X POST http://web.lab/upload -d "filename=shell.php"'],
      tasks: [
        {
          q: 'まず画像 filename=cat.jpg をアップロードします。サーバーの応答に出る、許可されているファイル形式の拡張子のうち jpg 以外のものを1つ答えてください（.を除く3文字）。',
          narration: '正常系。許可される形式がエラーメッセージから分かることがある。',
          check: { type: 'answer', any: ['png'], ci: true },
          hints: ['curl -X POST http://web.lab/upload -d "filename=cat.jpg"', '応答の "Only .jpg/.png ..." を見る', 'png'],
          explain: '.jpg/.png が許可形式。だが「許可リストをどう検証しているか」が問題。拡張子の文字列だけを見ているなら、回避の余地がある。',
        },
        {
          q: '画像以外の実行可能ファイル filename=shell.php をアップロードできてしまうことを確認し、応答に現れるフラグ FLAG{...} の中身を答えてください。',
          narration: '.php を上げてみる。サーバー側の検証が甘ければ受理されてしまう。',
          check: { type: 'answer', any: ['unrestricted_file_upload_c3a9'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['curl -X POST http://web.lab/upload -d "filename=shell.php"', '.php が受理される=検証不備', 'FLAG{unrestricted_file_upload_c3a9}'],
          explain: '.php が受理され、Web公開領域に実行可能な状態で保存された＝Webシェル設置が可能(Stage Forensicsの .shell.php と同じ構図)。原因は検証不備。対策は【拡張子ホワイトリスト+マジックバイト検証+保存先を実行不可(静的配信)に+ファイル名再生成+サイズ制限】を多層で。1つの検証だけに頼らないのが鉄則。',
        },
        {
          q: '安全でないアップロードの対策として適切でないものを番号で。 1) 許可拡張子のホワイトリスト検証 2) 保存先ディレクトリを実行不可にする 3) ファイルのマジックバイト(内容)を検証する 4) アップロードを全面的にHTTPSのみにすれば内容検証は不要',
          narration: '多層対策の中で「これは的外れ」を見抜く。',
          check: { type: 'answer', any: ['4'] },
          hints: ['HTTPSは通信を守るが中身は検証しない', '不適切なもの=役に立たない対策を選ぶ', '4 が不適切'],
          explain: '不適切なのは4。HTTPSは通信の暗号化であり、アップロード内容の検証とは無関係(悪性ファイルは暗号化されても悪性)。1(ホワイトリスト)・2(実行不可保存)・3(内容検証)は有効な多層対策。「HTTPSにしたから安全」はXSS/SQLi同様よくある誤解。',
        },
      ],
      review: { steps: ['許可形式を把握', '.php など実行可能ファイルを試す', '受理されれば検証不備', '対策=多層(ホワイトリスト/実行不可/内容検証)'], commands: [{ cmd: 'curl -X POST http://web.lab/upload -d "filename=shell.php"', meaning: '非画像ファイルのアップロード' }], why: 'アップロードの不備はWebシェル設置→サーバー乗っ取りに直結。多層検証が必須。', practice: 'アップロード機能の拡張子/内容/保存先の診断。開発は多層検証とファイル名再生成。', related: ['Webshell', 'RCE', 'ディレクトリ設定'] },
      learned: ['file-upload', 'webshell', 'whitelist-validation', 'defense-in-depth'], solution: ['curl -X POST http://web.lab/upload -d "filename=cat.jpg"', 'curl -X POST http://web.lab/upload -d "filename=shell.php"'],
    },
  ],
};
