// DevTools 6: Sources — ソースの全文検索・整形表示（フロントに残る秘密）
const HTML = `<!DOCTYPE html>
<html><head><title>NoteBox</title></head>
<body><h1>NoteBox</h1><div id="app"></div>
<script src="/js/config.js"></script><script src="/js/app.min.js"></script>
</body></html>`;

const CONFIG = `// NoteBox 設定
const CONFIG = {
  apiBase: 'https://api.notebox.example.com',
  apiKey: 'demo-key-7f3a9c',   // TODO: サーバー側へ移す
  debug: false,
};`;

const MIN = `!function(){var c=window.CONFIG||{},u=c.apiBase;function g(p,o){return fetch(u+p,Object.assign({headers:{"X-Api-Key":c.apiKey}},o))}function l(){g("/v1/notes").then(function(r){return r.json()}).then(function(d){document.getElementById("app").textContent=d.length+" notes"})}function x(){g("/internal/v2/export",{method:"POST"})}window.NoteBox={load:l,exportAll:x};l()}();
//# sourceMappingURL=app.min.js.map`;

export const d06 = {
  id: 'dv-06-sources',
  title: 'Sources: ソースを検索・整形して読む',
  minutes: 15,
  objectives: ['Sources で JS ファイルを開き、全文検索できる', '圧縮(minify)されたコードを整形表示して読める', 'フロントのコードに残る機密（APIキー・内部URL・ソースマップ）の危険を理解する'],
  prereq: ['dv-05-application'],
  briefing: 'メモアプリ NoteBox のセキュリティ点検を頼まれた。ブラウザに届く JavaScript は、そのまま全部読める。つまり、そこに何が書かれているかが「世界に公開されている情報」。Sources タブで、公開されている情報を棚卸ししよう。',
  concepts: [{
    title: 'Sources と minify',
    why: 'ページを動かす JS はブラウザに全文が送られる。開発者が「見られないはず」と思っていても、実際は誰でも読める。',
    problem: 'ソース内に APIキー・内部URL・コメントの TODO などが残ると、そこから攻撃の手がかりが得られてしまう。',
    how: 'Sources タブでは、ページが読み込んだファイルを開ける。上部の検索欄は全ファイル横断の検索（key / token / password など）。サイズ削減のため1行に圧縮(minify)されたコードは、「{} 整形表示」で読みやすくできる。行番号をタップするとブレークポイントが置ける（次のミッション）。ファイル末尾の sourceMappingURL は、元のコードを復元できる「ソースマップ」の場所を示す。',
    example: "apiKey: 'demo-key-7f3a9c',   // フロントに置いた時点で公開情報\n//# sourceMappingURL=app.min.js.map  ← 元コードが復元できる",
    relation: '検索で気になる語を探し、整形して読み、機密が公開されていないかを点検する。',
  }],
  browser: {
    url: 'https://notebox.example.com/',
    html: HTML,
    tabs: ['sources', 'console', 'network'],
    sources: { 'config.js': CONFIG, 'app.min.js': MIN },
    network: [
      { url: '/', status: 200, mime: 'text/html', size: 900, time: 80 },
      { url: '/js/config.js', status: 200, mime: 'application/javascript', size: 230, time: 40, start: 90 },
      { url: '/js/app.min.js', status: 200, mime: 'application/javascript', size: 560, time: 40, start: 90 },
    ],
  },
  tasks: [
    {
      q: 'Sources タブの全文検索で「apiKey」を検索してください。',
      narration: '設定やキーのような文字列は、ファイルを1つずつ開くより、全ファイル検索のほうが速い。検索欄に語を入れて「検索」を押す。',
      check: { type: 'dev', searched: 'apikey' },
      noInput: true,
      hints: ['Sources タブの一番上の検索欄に入力する', '「apiKey」と入力して「検索」をタップ', '結果の行をタップすると、該当行が開く'],
      explain: '全文検索は、キー・トークン・パスワード・内部URL・TODO など、「置いてはいけない語」を探す最速の方法。セキュリティ点検（棚卸し）の基本動作。',
    },
    {
      q: '検索で見つかった apiKey の値（引用符の中身）を答えてください。',
      narration: 'config.js に、アプリが API を呼ぶときに使うキーが書かれている。コメントにも注目。',
      check: { type: 'answer', any: ['demo-key-7f3a9c'], ci: true },
      answerHint: 'キーの文字列',
      hints: ['検索結果の config.js の行をタップして開く', 'apiKey: の右側の引用符の中', 'demo-key-7f3a9c'],
      explain: 'ブラウザに届くコードに入れたキーは、全員に公開されているのと同じ。コメントの「TODO: サーバー側へ移す」が示す通り、秘密のキーはサーバー側に置き、フロントからはサーバー経由で呼ぶ設計にする。もし実運用でこうなっていたら、キーを失効させて再発行する。',
    },
    {
      q: 'app.min.js は1行に圧縮されて読みにくい状態です。「{} 整形表示」を使って読みやすくしてください。',
      narration: '本番のJSは、サイズを小さくするため改行や空白が削られている（minify）。整形表示は、読むための補助。',
      check: { type: 'dev', prettyPrinted: 'app.min.js' },
      noInput: true,
      hints: ['ファイル名 app.min.js をタップして開く', 'ファイル名の下の「{} 整形表示」ボタンを押す', 'ボタンを押すと改行・インデントされる'],
      explain: '整形（pretty print）は、元のコードの意味を変えずに見た目だけを整える。minify は「読みにくくする」だけで、「隠す」わけではない。難読化も、時間をかければ読み解ける。秘密を守る手段にはならない。',
    },
    {
      q: '整形したコードを読んで、「エクスポート」機能が呼んでいる API のパス（/ から始まる）を答えてください。',
      narration: 'ユーザー画面には出ていない機能の入口が、コードの中には残っていることがある。関数名 x が呼ぶ先を読んでみよう。',
      check: { type: 'answer', any: ['/internal/v2/export'], ci: true },
      answerHint: '/ から始まるパス',
      hints: ['整形表示で、POST を使っている行を探す', 'g("/…", {method:"POST"}) の最初の引数', '/internal/v2/export'],
      explain: '画面には出ない内部向け API（/internal/…）の存在が、フロントのコードから分かってしまう。URLを知られるだけでは問題ではないが、「内部用だから認証不要」にしていると悪用される。アクセス制御は常にサーバー側で行う。',
    },
    {
      q: 'app.min.js の最終行のコメントに書かれている、ソースマップのファイル名を答えてください。',
      narration: '最終行の `//# sourceMappingURL=…` は、「圧縮前の元コードを復元するための対応表」の場所。デバッグには便利だが、本番では扱いに注意が要る。',
      check: { type: 'answer', any: ['app.min.js.map'], ci: true },
      answerHint: 'ファイル名',
      hints: ['app.min.js を開き、一番下の行を見る', 'sourceMappingURL= の右側', 'app.min.js.map'],
      explain: 'ソースマップが公開されていると、圧縮前の元コード（変数名・コメント・ディレクトリ構造）が復元できてしまう。本番では非公開にするか、エラー監視サービスにだけ渡す運用が一般的。「見せたくないものは、そもそもフロントに置かない」が大原則。',
    },
  ],
  review: {
    steps: ['Sources で読み込まれているファイルを一覧する', '全文検索で key / token / password / TODO / internal を探す', '圧縮コードは整形表示して読む', 'ソースマップの公開状況を確認する'],
    commands: [{ cmd: '全文検索', meaning: '全ファイルから語を探す' }, { cmd: '{} 整形表示', meaning: '圧縮コードを読みやすくする' }, { cmd: 'sourceMappingURL', meaning: '元コード復元用の対応表の場所' }],
    why: 'フロントのコードは全公開。そこに秘密があれば、それは秘密ではない。',
    practice: 'リリース前に、ビルド成果物（minify後のJS）を全文検索して、キー・内部URL・コメントの残骸がないか確認する。',
    related: ['シークレット管理', 'アクセス制御', 'ソースマップ', 'ビルドパイプライン'],
  },
  learned: ['devtools-sources', 'source-search', 'pretty-print', 'frontend-secrets', 'source-maps'],
  solution: [{ do: 'searchSources', args: ['apiKey'] }, { do: 'prettyPrint', args: ['app.min.js'] }],
};
