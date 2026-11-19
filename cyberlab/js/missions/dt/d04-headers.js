// DevTools 4: Network 詳細 — ヘッダ・ペイロード・レスポンス
const HTML = `<!DOCTYPE html>
<html><head><title>書店 Pageturn — ログイン</title></head>
<body>
<h1>Pageturn</h1>
<form id="login"><input name="email" type="email" placeholder="メールアドレス"><input name="password" type="password" placeholder="パスワード"><button type="submit">ログイン</button></form>
<div id="msg"></div>
<script src="/static/login.js"></script>
</body></html>`;

const net = [
  { id: 'doc', url: '/login', status: 200, mime: 'text/html', size: 2800, time: 140, start: 0, initiator: 'ナビゲーション', remote: '203.0.113.20:443',
    resHeaders: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'strict-transport-security': 'max-age=31536000', 'server': 'nginx' },
    reqHeaders: { 'accept': 'text/html', 'user-agent': 'Mozilla/5.0 (Linux; Android 13)' } },
  { id: 'js', url: '/static/login.js', status: 200, mime: 'application/javascript', size: 3100, time: 60, start: 150, initiator: '/login (HTML)',
    resHeaders: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=31536000, immutable' } },
  { id: 'login', url: '/api/v1/login', method: 'POST', status: 401, mime: 'application/json', size: 190, time: 220, start: 260, initiator: 'login.js:12', remote: '203.0.113.20:443',
    reqHeaders: { 'content-type': 'application/json', 'accept': 'application/json', 'origin': 'https://pageturn.example.com', 'x-request-id': 'req-5f3a91' },
    resHeaders: { 'content-type': 'application/json', 'www-authenticate': 'Bearer realm="pageturn"', 'x-ratelimit-remaining': '4' },
    reqBody: '{"email":"reader@example.com","password":"●●●●●●●●"}',
    resBody: '{"error":"invalid_credentials","message":"メールアドレスまたはパスワードが違います","attempts_left":4}',
    note: '401 Unauthorized: 認証に失敗しました。' },
  { id: 'search', url: '/api/v1/books?q=nature&page=2&sort=new', status: 200, mime: 'application/json', size: 2400, time: 180, start: 300, initiator: 'login.js:30',
    reqHeaders: { 'accept': 'application/json' }, resHeaders: { 'content-type': 'application/json', 'cache-control': 'private, max-age=60' },
    resBody: '{"page":2,"total":57,"books":[{"id":101,"title":"森の記録"},{"id":102,"title":"川の音"}]}' },
];

export const d04 = {
  id: 'dv-04-headers',
  title: 'Network 詳細: ヘッダ・送信内容・レスポンス',
  minutes: 15,
  objectives: ['リクエストを開き、Headers / Payload / Response / Timing の見方を理解する', 'リクエストヘッダとレスポンスヘッダの違いを説明できる', 'ログイン失敗などの原因を、通信の中身から読み取る'],
  prereq: ['dv-03-network'],
  briefing: '書店 Pageturn のログインで「パスワードを正しく入れたのに失敗する」という問い合わせが来た。画面には「違います」としか出ない。Network の詳細を開けば、実際に何を送り、サーバーが何と返したかが読める。',
  concepts: [{
    title: 'リクエストとレスポンスの中身',
    why: '通信は「送った内容（リクエスト）」と「返ってきた内容（レスポンス）」の往復。不具合は、どちらかの中身が想定と違うことで起きる。',
    problem: '画面のエラー文は要約でしかない。実際に何が送られたか・返ったかを見ないと、原因を断定できない。',
    how: '行をタップすると詳細が開き、4つのタブがある。Headers=URL・メソッド・ステータスと、リクエスト/レスポンス両方のヘッダ。Payload=クエリ文字列（?q=… の分解）と送信した本文。Response=サーバーが返した本文。Timing=所要時間。ヘッダは「通信の取扱説明書」で、種類・認証・キャッシュ方針などが書かれる。',
    example: 'POST /api/v1/login   Status: 401\nRequest Headers: content-type: application/json\nPayload: {"email": …}\nResponse: {"error":"invalid_credentials"}',
    relation: 'まず Headers で成否と条件を確認し、Payload で送った内容、Response でサーバーの言い分を読む。',
  }],
  browser: {
    url: 'https://pageturn.example.com/login',
    html: HTML,
    tabs: ['network', 'console'],
    console: [{ level: 'error', text: 'Failed to load resource: the server responded with a status of 401 ()', source: 'pageturn.example.com/api/v1/login' }],
    sources: { 'login.js': '// ログイン処理\n' },
    network: net,
  },
  tasks: [
    {
      q: 'Network タブで、ログイン API（/api/v1/login）の行をタップして詳細を開いてください。',
      narration: '詳細は、一覧の行をタップすると開く。「‹ 一覧へ」で戻れる。',
      check: { type: 'dev', viewedRequest: 'login' },
      noInput: true,
      hints: ['Network タブを開く', '名前が login の行を探す（メソッドは POST）', '行をタップする'],
      explain: '詳細を開くと、ヘッダ・送信内容・レスポンス・タイミングが見られる。まずは Headers の「General」で、URL・メソッド・ステータスを確認するのが定番の入口。',
    },
    {
      q: 'このログイン通信のステータスコードを答えてください（Headers タブの Status Code）。',
      narration: 'ステータスは成否の第一声。数字だけでなく、その後ろの文言（Unauthorized など）も大事な情報。',
      check: { type: 'answer', any: ['401'] },
      answerHint: '3桁の数字',
      hints: ['詳細の Headers タブ、全般 (General) を見る', 'Status Code の行', '401（Unauthorized）'],
      explain: '401 Unauthorized は「認証が通っていない（誰か分からない／資格情報が違う）」。似た 403 Forbidden は「誰かは分かったが、権限がない」。この区別は、認証（あなたは誰か）と認可（何をしてよいか）の違いそのもの。',
    },
    {
      q: 'Payload タブでサーバーに送られた内容を見て、送信された JSON の email の値を答えてください。',
      narration: 'Payload には、ブラウザがサーバーへ送った本文が出る。ログインフォームの入力が、どう送られたかが分かる。',
      check: { type: 'answer', any: ['reader@example.com'], ci: true },
      answerHint: 'メールアドレス',
      hints: ['詳細の Payload タブを開く', '「送信内容 (Request Payload)」を読む', 'reader@example.com'],
      explain: '入力した値がそのまま送られている（このデモではパスワードは伏せ字）。通信が HTTPS でなければ、この内容は経路上で盗み見られる。パスワードを URL のクエリに載せるのも厳禁（履歴・ログに残る）。ここで「POST の本文に入れる」理由が分かる。',
    },
    {
      q: 'Response タブで、サーバーが返した JSON の attempts_left（残り試行回数）の値を答えてください。',
      narration: 'サーバーは画面に出ない詳しい情報も返していることがある。ログインのやり直しが何回できるか、ここに書かれている。',
      check: { type: 'answer', any: ['4'] },
      answerHint: '数字',
      hints: ['詳細の Response タブ', '返ってきた JSON の中の attempts_left', '4'],
      explain: 'パスワード試行の残り回数（ロックアウト）が返っている。総当たりを防ぐ仕組みの一部。ただし「ユーザーが存在するか」を示すメッセージの出し分けは、アカウント列挙に使われかねないので、エラー文は同じ内容に揃えるのが定石。',
    },
    {
      q: 'この通信のレスポンスヘッダ x-ratelimit-remaining の値を答えてください（Headers タブのレスポンスヘッダ）。',
      narration: 'ヘッダは「本文以外のメタ情報」。レート制限（一定時間内の回数制限）の残りなども、ヘッダで通知される。',
      check: { type: 'answer', any: ['4'] },
      answerHint: '数字',
      hints: ['Headers タブの「レスポンスヘッダ (Response Headers)」を見る', 'x-ratelimit-remaining の行', '4'],
      explain: 'レスポンスヘッダでは、キャッシュ方針（cache-control）、認証方式（www-authenticate）、制限の残り（x-ratelimit-*）などが分かる。リクエストヘッダ（ブラウザ→サーバー）とは向きが違う、という点を押さえておこう。',
    },
    {
      q: '別の通信 /api/v1/books?q=nature&page=2&sort=new の Payload で、クエリパラメータ page の値を答えてください。',
      narration: 'URL の ? 以降（クエリ文字列）は、Payload タブで1項目ずつ分解して表示される。検索や並び替えの条件が一目で分かる。',
      check: { type: 'answer', any: ['2'] },
      answerHint: '数字',
      hints: ['一覧の books の行をタップする（「‹ 一覧へ」で戻れる）', 'Payload タブのクエリパラメータ', 'page = 2'],
      explain: 'クエリパラメータは、URL を見るより分解表示のほうが読みやすい。GET でデータを取る通信では、パラメータが条件のすべて。変な値が送られている／想定した値が送られていない、という原因を見つけるのに役立つ。',
    },
  ],
  review: {
    steps: ['一覧から対象のリクエストを開く', 'Headers: URL・メソッド・ステータス・各ヘッダを見る', 'Payload: クエリと送信本文を確認する', 'Response: サーバーの返答と、期待との差を探す'],
    commands: [{ cmd: 'Headers', meaning: 'URL・ステータス・リクエスト/レスポンスのヘッダ' }, { cmd: 'Payload', meaning: 'クエリパラメータと送信した本文' }, { cmd: 'Response', meaning: 'サーバーが返した本文' }],
    why: '「送ったもの」と「返ってきたもの」を直接見れば、画面のメッセージに頼らず原因を断定できる。',
    practice: 'API の不具合報告では、該当リクエストの Headers/Payload/Response（機密は伏せて）を共有してもらうと、フロントとサーバーのどちらの問題かがすぐ分かる。',
    related: ['HTTP ヘッダ', '401 と 403', 'レート制限', '認証と認可'],
  },
  learned: ['network-detail', 'request-response-headers', 'payload-vs-response', 'status-401-403', 'query-params'],
  solution: [{ do: 'openRequest', args: ['login'] }],
};
