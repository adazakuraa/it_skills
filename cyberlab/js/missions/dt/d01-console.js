// DevTools 1: Console を読む・使う
const HTML = `<!DOCTYPE html>
<html><head><title>ミニショップ</title></head>
<body>
<header><h1>ミニショップ</h1></header>
<div id="app">
  <p class="lead">今日のおすすめ商品</p>
  <ul id="items"><li class="item">キーボード</li><li class="item">マウス</li><li class="item">モニター</li></ul>
  <button id="buy">購入する</button>
</div>
<script src="/js/app.js"></script>
</body></html>`;

const APP_JS = `// ミニショップ アプリ本体
const items = document.querySelectorAll('.item');
const user = null;

function showWelcome() {
  // ユーザー名を表示する
  const label = 'ようこそ、' + user.name + ' さん';
  document.title = label;
}

document.getElementById('buy').addEventListener('click', () => {
  fetch('/api/cart/add', { method: 'POST' });
});

showWelcome();`;

export const d01 = {
  id: 'dv-01-console',
  title: 'Console でエラーを読み、式を試す',
  minutes: 12,
  objectives: ['Console のエラー・警告メッセージを読む', 'エラー文から原因の場所（ファイルと行）をたどる', 'Console で式を実行してページの状態を調べる'],
  prereq: [],
  briefing: '同僚が作った「ミニショップ」のページで、ボタンが反応しない。画面を見ても原因は分からない。そこで開発者ツールの Console を開く。エラーが赤く出ていれば、そこに「何が」「どこで」起きたかが書かれている。まずは読み方から覚えよう。',
  concepts: [{
    title: 'Console の役割',
    why: '画面に表示されない「内部の失敗」は、まず Console に出る。ブラウザは問題が起きるたびに、種類・内容・発生場所を Console に記録している。',
    problem: 'ページが動かないとき、画面を眺めても原因は分からない。どこで何が失敗したかを知る手がかりが必要になる。',
    how: 'メッセージは重要度で色分けされる: エラー(赤)=処理が止まった、警告(黄)=問題の可能性、ログ(白)=開発者が出した情報。エラー文は「種類: 内容」の形(例: TypeError: Cannot read properties of null)で、右端の「ファイル名:行番号」を押すと該当のソースを開ける。入力欄(›)に式を書けば、そのページの中身をその場で調べられる。',
    example: "Uncaught TypeError: Cannot read properties of null (reading 'name')  app.js:7\n> document.title\n'ミニショップ'",
    relation: 'エラー文を読んで原因の行を特定し、Console の式でページの状態を確かめる。',
  }],
  browser: {
    url: 'https://minishop.example.com/',
    html: HTML,
    tabs: ['console', 'elements', 'sources'],
    console: [
      { level: 'warn', text: "[Deprecation] 'DOMNodeInserted' イベントは非推奨です。MutationObserver を使ってください。", source: 'legacy.js:12' },
      { level: 'log', text: 'ミニショップを初期化しています…', source: 'app.js:1' },
      { level: 'error', text: "Uncaught TypeError: Cannot read properties of null (reading 'name')", source: 'app.js:7' },
      { level: 'error', text: 'Failed to load resource: the server responded with a status of 404 ()  /img/banner.png', source: 'minishop.example.com/:1' },
    ],
    sources: { 'app.js': APP_JS },
    globals: { shopConfig: { name: 'ミニショップ', currency: 'JPY', tax: 0.1, version: '2.4.1' } },
    quick: ['document.title', "document.querySelectorAll('.item').length", 'shopConfig.version', 'shopConfig', "document.querySelector('#buy').textContent"],
  },
  tasks: [
    {
      q: 'Console には赤いエラーが2件あります。そのうち、JavaScript の実行が失敗したエラー（Uncaught で始まるもの）の「エラーの種類」を答えてください（例: ○○Error）。',
      narration: 'Console を開き、赤いメッセージを探す。エラー文は「種類: 内容」の形で書かれていて、コロンの前が種類にあたる。',
      check: { type: 'answer', any: ['TypeError'], ci: true },
      answerHint: '○○Error の形式',
      hints: ['Console タブの赤いメッセージ（⛔）を読む', '「Uncaught」で始まる方のエラー。コロンの前に種類が書かれている', 'Uncaught TypeError: … の「TypeError」'],
      explain: 'TypeError は「値の型が合わない操作をした」エラー。今回は null（値が無い）に対して .name を読もうとして失敗している。エラーの種類を見るだけで、原因の見当がつく: TypeError=値の型・存在の問題、ReferenceError=存在しない変数の参照、SyntaxError=文法ミス。',
    },
    {
      q: 'そのエラーが発生しているファイル名と行番号が、メッセージの右端にリンクで表示されています。エラーが起きている行番号を答えてください。',
      narration: 'メッセージ右端の「ファイル名:行番号」はボタンになっていて、押すと Sources タブで該当ソースが開く。原因の行を直接見に行ける。',
      check: { type: 'answer', any: ['7'] },
      answerHint: '数字',
      hints: ['エラー文の右端にある「app.js:◯」のリンクを見る', 'リンクをタップすると該当行が開く（Sources タブ）', 'app.js:7 → 7行目'],
      explain: 'エラーの発生場所（app.js の7行目）が分かった。実際に開くと `user.name` を読む行で、直前で `const user = null;` と定義されている。「エラー文の種類＋発生場所」の2つが分かれば、原因はほぼ特定できる。これがデバッグの基本の動き。',
    },
    {
      q: 'Console の入力欄に式を入力して、ページのタイトル（document.title）の値を調べてください。表示された文字列（引用符は除く）を答えてください。',
      narration: 'Console の入力欄（›）は、そのページの中身を直接調べる道具。document はページ全体を表す特別な名前で、document.title でタイトルが取れる。',
      check: { type: 'answer', any: ['ミニショップ'] },
      answerHint: 'タイトルの文字列',
      hints: ['Console タブ下部の入力欄に式を入力して「実行」', '入力するのは document.title', "結果は 'ミニショップ' （引用符は文字列であることを示す記号）"],
      explain: 'Console では、ページの状態を式で直接確認できる。document.title の結果が引用符付きで表示されるのは「文字列」という印。画面を見て分かることも、式なら確実に取れる。デバッグでは「いま変数や画面の状態がどうなっているか」を式で確かめながら原因を絞る。',
    },
    {
      q: 'このページは .item というクラスの要素が商品リストになっています。Console で document.querySelectorAll(\'.item\').length を実行して、商品の数を答えてください。',
      narration: 'querySelectorAll はセレクタ（CSSと同じ書き方）に一致する要素をすべて取り出す。.length で個数が分かる。Elements タブでも確認できるが、式なら一瞬で数えられる。',
      check: { type: 'answer', any: ['3'] },
      hints: ["document.querySelectorAll('.item') は要素の一覧を返す", '一覧の個数は .length で取れる', "document.querySelectorAll('.item').length → 3"],
      explain: '3件。セレクタ（#id、.class、タグ名）で要素を取り出す書き方は、Elements タブでの検索やスクレイピング、テストコードでもそのまま使える共通の知識。Console は「ページに対する電卓」のように使えるのがポイント。',
    },
    {
      q: 'このページは設定オブジェクト shopConfig を持っています。Console で shopConfig.version を実行して、バージョン番号を答えてください。',
      narration: '開発者はアプリの設定や状態を、グローバル変数（どこからでも見える変数）に置くことがある。Console からは、その中身を直接読める。',
      check: { type: 'answer', any: ['2.4.1'] },
      answerHint: 'x.y.z 形式',
      hints: ['Console では、ページが持つ変数の名前をそのまま入力すると値が見られる', 'shopConfig と入力すると設定全体、.version でその中の1項目が読める', "shopConfig.version → '2.4.1'"],
      explain: 'グローバル変数の中身は、誰でも Console から読めてしまう。便利な反面、設定にAPIキーや内部URLを入れておくと筒抜けになる、というセキュリティ上の落とし穴にもなる。「ブラウザに渡したものは、ユーザーに見られる前提」で設計することが大切。',
    },
  ],
  review: {
    steps: ['Console の赤いエラー（⛔）を見つける', 'エラーの種類（TypeError など）と内容を読む', '右端の ファイル名:行番号 で発生場所を特定する', '入力欄の式で、ページの状態を確かめる'],
    commands: [{ cmd: 'document.title', meaning: 'ページのタイトルを調べる' }, { cmd: "document.querySelectorAll('.item').length", meaning: 'セレクタに一致する要素の数' }, { cmd: 'shopConfig.version', meaning: 'ページが持つ変数の中身を読む' }],
    why: 'Console は、画面に出ない失敗の最初の手がかり。エラーの種類と場所を読めれば、原因の切り分けが一気に早くなる。',
    practice: '不具合報告を受けたら、まず Console のエラーを確認する。スマホ実機でのデバッグやサポート対応でも、エラー文を共有してもらえば原因の見当がつく。',
    related: ['Elements', 'Sources', 'Network', 'エラーの種類（TypeError/ReferenceError）'],
  },
  learned: ['devtools-console', 'console-errors', 'js-error-types', 'console-eval', 'document-queryselector'],
  solution: ["document.title", "document.querySelectorAll('.item').length", 'shopConfig.version'],
};
