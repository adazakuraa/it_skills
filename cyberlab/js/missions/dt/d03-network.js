// DevTools 3: Network — リクエスト一覧とステータスコード
const HTML = `<!DOCTYPE html>
<html><head><title>カフェ Leaf — メニュー</title><link rel="stylesheet" href="/css/main.css"></head>
<body>
<h1>カフェ Leaf</h1>
<img src="/img/hero.jpg" alt="店内の写真">
<ul id="menu"></ul>
<script src="/js/menu.js"></script>
<script src="https://cdn.tracker-example.net/t.js"></script>
</body></html>`;

const net = [
  { url: '/', status: 200, mime: 'text/html', size: 4200, time: 120, start: 0, initiator: 'ナビゲーション', resHeaders: { 'content-type': 'text/html; charset=utf-8' } },
  { url: '/css/main.css', status: 200, mime: 'text/css', size: 9800, time: 60, start: 130, initiator: '/ (HTML)' },
  { url: '/img/hero.jpg', status: 200, mime: 'image/jpeg', size: 1840000, resourceSize: 1840000, time: 900, start: 130, initiator: '/ (HTML)', note: '約1.8MB の画像です。表示サイズに対して大きすぎます。' },
  { url: '/js/menu.js', status: 200, mime: 'application/javascript', size: 14200, time: 80, start: 130, initiator: '/ (HTML)' },
  { url: '/api/menu', status: 200, mime: 'application/json', size: 1900, time: 200, start: 230, initiator: 'menu.js:3', resBody: '{"items":[{"name":"ブレンド","price":450},{"name":"カフェラテ","price":520}]}' },
  { url: '/img/logo.png', status: 404, mime: 'text/html', size: 310, time: 40, start: 140, initiator: '/ (HTML)' },
  { url: '/api/recommend', status: 500, mime: 'application/json', size: 120, time: 300, start: 240, initiator: 'menu.js:9', method: 'POST', reqBody: '{"area":"tokyo"}', resBody: '{"error":"internal server error"}' },
  { url: 'https://cdn.tracker-example.net/t.js', status: 200, mime: 'application/javascript', size: 31000, time: 350, start: 140, initiator: '/ (HTML)' },
  { url: '/js/old-widget.js', status: 304, mime: 'application/javascript', size: 180, time: 25, start: 135, initiator: '/ (HTML)', fromCache: false },
];

export const d03 = {
  id: 'dv-03-network',
  title: 'Network: 通信の一覧を読む',
  minutes: 14,
  objectives: ['Network タブでリクエスト一覧を読める', 'ステータスコード（2xx/3xx/4xx/5xx）の意味と失敗の見分け方を理解する', 'フィルタで知りたい種類の通信を絞り込める'],
  prereq: ['dv-02-elements'],
  briefing: 'カフェのメニューページで、ロゴが出ない・おすすめ欄が空になる、と報告があった。画面を作るために、ブラウザは裏で何十もの通信（リクエスト）をしている。Network タブはそのすべてを時系列で一覧にしてくれる。',
  concepts: [{
    title: 'Network タブとステータスコード',
    why: '画面が壊れる原因の多くは通信の失敗。「どのリクエストが」「どんなステータスで」失敗したかが分かれば、サーバー側か、ブラウザ側か、場所を絞れる。',
    problem: '画像が出ない・データが空、という症状だけでは、URLの間違い・サーバーの障害・権限・ネットワークのどれなのか分からない。',
    how: '一覧の1行が1リクエスト。左からメソッド・名前・ステータス。ステータスは 2xx=成功、3xx=転送/キャッシュ、4xx=リクエスト側の問題（404 見つからない、401 未認証、403 権限なし）、5xx=サーバー側の障害（500 内部エラー）。赤い行は失敗。上のフィルタ（Fetch/XHR、JS、CSS、Img…）で種類を絞れる。行をタップすると詳細が開く。',
    example: 'GET  logo.png       404   ← URLが違う／ファイルが無い\nPOST recommend      500   ← サーバー側の障害',
    relation: '失敗した行を見つけ、ステータスの桁で原因の側（クライアント／サーバー）を切り分ける。',
  }],
  browser: {
    url: 'https://leaf-cafe.example.com/menu',
    html: HTML,
    tabs: ['network', 'console'],
    console: [
      { level: 'error', text: 'Failed to load resource: the server responded with a status of 404 ()', source: 'leaf-cafe.example.com/img/logo.png' },
      { level: 'error', text: 'Failed to load resource: the server responded with a status of 500 ()', source: 'leaf-cafe.example.com/api/recommend' },
    ],
    network: net,
  },
  tasks: [
    {
      q: 'Network タブで、ステータスが 404 になっているリクエストの「名前」（ファイル名）を答えてください。',
      narration: '一覧の中で、赤い行を探す。404 は「そのURLには何も無い」というステータス。',
      check: { type: 'answer', any: ['logo.png'], ci: true },
      answerHint: 'ファイル名',
      hints: ['Network タブを開き、一覧の赤い行（ステータスが赤）を探す', '404 と書かれた行の名前欄を読む', 'logo.png'],
      explain: '404 Not Found は「URLが間違っているか、ファイルが存在しない」。画像が出ない原因はこれ。参照パスのタイプミス、デプロイ漏れ、ファイル名の大文字小文字の違いなどが定番の原因。',
    },
    {
      q: 'おすすめ欄が空になる原因のリクエスト（/api/recommend）のステータスコードを答えてください。',
      narration: 'データを取りに行く通信（Fetch/XHR）の失敗は、画面の「空」として現れる。種類のフィルタを使うと見つけやすい。',
      check: { type: 'answer', any: ['500'] },
      answerHint: '3桁の数字',
      hints: ['フィルタの「Fetch/XHR」を押して、データ取得の通信だけにする', 'recommend の行の右端のステータスを読む', '500'],
      explain: '500 Internal Server Error は「サーバー側で何か失敗した」。4xx とは違い、リクエストを送った側（ブラウザ）の問題ではないので、直すのはサーバー側。フロントエンドとしては、失敗時の表示（エラー表示・再試行）を用意しておくのも大事。',
    },
    {
      q: 'Network のフィルタ「Fetch/XHR」を使い、API の通信だけを表示してください。',
      narration: '通信が何十件もあると、目的のものが埋もれる。フィルタは Network を使いこなす最初の一歩。',
      check: { type: 'dev', filterUsed: 'fetch' },
      noInput: true,
      hints: ['Network タブ上部のチップ（すべて／Fetch/XHR／JS…）を見る', '「Fetch/XHR」をタップする', 'タップするとフィルタが有効になる'],
      explain: 'Fetch/XHR は、JavaScriptが裏でAPIを呼ぶ通信。SPA（画面遷移なしで動くアプリ）の不具合調査では、まずここを見る。JS・CSS・Img などで絞れば、読み込み漏れや巨大ファイルも探しやすい。',
    },
    {
      q: 'このページが読み込んでいる、別ドメイン（第三者）のスクリプトのホスト名を答えてください。第三者のホストはオレンジ色で表示されます。',
      narration: 'ページは自分のサーバーだけでなく、広告・解析・CDN など外部のサービスからも読み込む。Host 欄で自分以外のドメインを探す。',
      check: { type: 'answer', any: ['cdn.tracker-example.net'], ci: true },
      answerHint: 'ホスト名',
      hints: ['一覧の各行の右端にホスト名がある', 'leaf-cafe.example.com 以外のものを探す（オレンジ色）', 'cdn.tracker-example.net'],
      explain: '外部ドメインのスクリプトは、読み込んだ時点でそのページ上で動く強い権限を持つ（Cookie以外のページ内容は全部読める）。便利だが、相手が改ざんされると自分のサイトも巻き込まれる（サプライチェーンリスク）。どこの外部サービスを使っているか、Network で棚卸しできる。',
    },
    {
      q: 'もっとも転送サイズの大きいリクエストの名前を答えてください（Img フィルタで画像を絞って確認できます）。',
      narration: '表示が遅いときは「何が重いか」を探す。サイズの大きいものから見ていくのが定石。',
      check: { type: 'answer', any: ['hero.jpg'], ci: true },
      answerHint: 'ファイル名',
      hints: ['各行の2段目にサイズ（kB/MB）が出ている', '1つだけ MB 単位のものがある', 'hero.jpg（約1.8MB）'],
      explain: 'hero.jpg が約1.8MB で、ページ全体の大半を占めている。画像の圧縮・サイズ縮小・新形式（WebP/AVIF）への変更は、表示速度改善で最も効果が大きい施策のひとつ。次のミッション以降で、通信量を回線速度別にも見ていく。',
    },
  ],
  review: {
    steps: ['Network で読み込み直し、赤い行（失敗）を探す', 'ステータスの桁（4xx / 5xx）で切り分ける', 'フィルタ（Fetch/XHR・JS・Img）で種類を絞る', 'ホスト欄で第三者ドメインを確認、サイズで重いものを探す'],
    commands: [{ cmd: '404', meaning: '見つからない（URL・ファイルの問題）' }, { cmd: '500', meaning: 'サーバー内部の障害' }, { cmd: 'Fetch/XHR', meaning: 'JavaScript が行うデータ取得だけを表示するフィルタ' }],
    why: '画面の不具合の多くは「通信のどこかが失敗している」。一覧を見れば、原因の場所（クライアント／サーバー／外部）が一目で分かる。',
    practice: '不具合報告に「Network のスクリーンショット」を添えてもらうと、再現できない問題でも原因の目星が付く。',
    related: ['ステータスコード', 'Headers', 'サプライチェーンリスク', 'パフォーマンス'],
  },
  learned: ['devtools-network', 'http-status-codes', 'network-filter', 'third-party-requests', 'resource-size'],
  solution: [{ do: 'setFilter', args: ['fetch'] }],
};
