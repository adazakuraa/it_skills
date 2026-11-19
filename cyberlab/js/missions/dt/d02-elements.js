// DevTools 2: Elements — 「画面に見えるもの」と「HTMLにあるもの」の違い
const HTML = `<!DOCTYPE html>
<html><head><title>社内ポータル</title></head>
<body>
<header><h1>社内ポータル</h1><nav><a href="/news">お知らせ</a> <a href="/docs">資料</a> <a id="admin-link" href="/admin/console" style="display:none">管理コンソール</a></nav></header>
<main>
  <p class="notice">来週の定期メンテナンスは火曜 22:00 からです。</p>
  <!-- TODO: 公開前に削除 / 検証用の旧環境は stg-portal.example.com にある -->
  <form id="feedback" action="/feedback" method="post">
    <input type="text" name="comment" placeholder="ご意見をどうぞ">
    <input type="hidden" name="form_token" value="a91f-77c2-board-20">
    <button id="send" type="submit" disabled>送信</button>
  </form>
  <p id="status" hidden>送信を受け付けました。ありがとうございます。</p>
</main>
</body></html>`;

export const d02 = {
  id: 'dv-02-elements',
  title: 'Elements: 画面に見えないものを探す',
  minutes: 14,
  objectives: ['Elements でDOMツリーを開いて要素を探せる', '非表示の要素・HTMLコメント・hidden な入力欄が「誰にでも見える」ことを理解する', '属性を編集してページの挙動を確かめられる'],
  prereq: ['dv-01-console'],
  briefing: '社内ポータルのフィードバック欄で、送信ボタンが押せない。画面からは理由が分からない。Elements タブはページの「HTMLそのもの」を見せてくれる。画面に見えている部分だけでなく、隠れている部分もそこには全部ある。',
  concepts: [{
    title: 'Elements と DOM',
    why: '画面に見えているものは、HTML のごく一部。見えない要素・コメント・属性にこそ、不具合の原因や、公開すべきでない情報が残っていることがある。',
    problem: '「見えない = 存在しない」と思い込むと、ボタンが押せない理由も、うっかり公開されている情報も見落とす。',
    how: 'Elements タブは、ブラウザが組み立てた DOM（要素の木構造）を表示する。▸ をタップして展開、行をタップすると属性を確認・編集できる。検索欄にはセレクタ（#id、.class）やテキストが使える。「非表示」バッジは CSS や hidden 属性で隠されている要素。ここでの編集はその場のページにだけ反映され、サーバーには何も影響しない。',
    example: '<a id="admin-link" style="display:none">…</a>   ← 画面には出ないが HTML には存在\n<input type="hidden" name="form_token" value="…">   ← 画面には出ないが誰でも読める',
    relation: '画面→HTML の順で調べ、原因（disabled 属性など）と、公開すべきでない情報の両方に気づけるようになる。',
  }],
  browser: {
    url: 'https://portal.example.com/',
    html: HTML,
    tabs: ['elements', 'console'],
    console: [{ level: 'log', text: 'ポータルを読み込みました', source: 'portal.js:1' }],
    sources: { 'portal.js': "console.log('ポータルを読み込みました');" },
    quick: ["document.querySelector('#send').disabled", "document.querySelector('#send').getAttribute('disabled')"],
  },
  tasks: [
    {
      q: 'Elements タブで、画面には表示されていない（「非表示」バッジが付く）リンクの id を答えてください。',
      narration: 'nav の中のリンクは「お知らせ」「資料」の2つしか見えない。だが HTML には、もう1つ隠れたリンクがある。Elements なら、非表示の要素にも「非表示」バッジが付いて表示される。',
      check: { type: 'answer', any: ['admin-link'], ci: true },
      answerHint: 'id の値',
      hints: ['Elements タブで html → body → header → nav と ▸ を開く', '「非表示」バッジが付いた <a> を探す', 'id="admin-link"'],
      explain: '画面に出ないリンク（/admin/console 宛て）が HTML には残っていた。display:none は「見せない」だけで「アクセスできない」にはならない。管理画面を守るのはリンクを隠すことではなく、サーバー側の認証・認可。「隠す」と「守る」は別物、というのが最初の大事な理解。',
    },
    {
      q: 'HTML には開発者が残したコメント（<!-- … -->）があります。そこに書かれている「旧環境」のホスト名を答えてください。',
      narration: 'コメントは画面には一切出ないが、ブラウザには送られてくる。Elements では、灰色の <!-- … --> として表示される。',
      check: { type: 'answer', any: ['stg-portal.example.com'], ci: true },
      answerHint: 'ホスト名',
      hints: ['<main> の中を展開する。灰色で表示されている行がコメント', '検索欄に「TODO」と入れても探せる', 'stg-portal.example.com'],
      explain: '開発メモに検証用環境のホスト名が残っていた。コメントは「公開されるHTMLの一部」で、閲覧者全員に届く。社内の構成・TODO・パスワードなどをコメントに残したまま公開するのは、情報漏えいの典型的な原因。公開前にコメントを除去する（ビルドで自動削除する）運用が必要。',
    },
    {
      q: 'フォームには画面に出ない hidden の入力欄があります。その name が form_token の値を答えてください。',
      narration: 'type="hidden" の入力欄は、フォーム送信時にサーバーへ一緒に送られる「隠しデータ」。画面には出ないが、Elements で選べば value が読める。',
      check: { type: 'answer', any: ['a91f-77c2-board-20'], ci: true },
      answerHint: '値そのまま',
      hints: ['<form id="feedback"> を展開する', 'type="hidden" の <input> をタップして属性を見る', 'value="a91f-77c2-board-20"'],
      explain: 'hidden でも値は誰でも読めるし、書き換えもできる。hidden 欄を「ユーザーに見せない安全な入れ物」として使い、価格・権限・ユーザーIDなどをそこに置くと、書き換えられて悪用される（パラメータ改ざん）。サーバー側で必ず検証しよう。',
    },
    {
      q: '送信ボタン（#send）が押せない原因は、ボタンに付いたある属性です。その属性名を答えてください。',
      narration: 'ボタンが反応しない原因は、見た目ではなく属性にあることが多い。#send の行をタップして属性の一覧を確認する。',
      check: { type: 'answer', any: ['disabled'], ci: true },
      answerHint: '属性名',
      hints: ['検索欄に #send と入力して、該当の行をタップする', '属性一覧（タップして編集）を見る', 'disabled 属性'],
      explain: 'disabled 属性が付いていると、ボタンは押せない。属性の有無を確認できるのが Elements の強み。本物の不具合なら、なぜ disabled のままなのか（入力チェックのJSが動いていない等）を Console や Sources で追う。',
    },
    {
      q: 'Elements の属性編集を使って、#send ボタンから disabled 属性を削除してください（ページ内だけの変更で、サーバーには影響しません）。',
      narration: '属性の編集は「その場の実験」。原因の仮説が正しいかを、コードを直す前に確かめられる。',
      check: { type: 'dev', dom: { sel: '#send', attr: { disabled: null } } },
      noInput: true,
      hints: ['#send を選択して、属性一覧の disabled の横の「削除」をタップ', 'DevTools の Elements タブで、選択した要素の属性欄を操作する', 'Console でも document.querySelector(\'#send\').removeAttribute(\'disabled\') で同じことができる'],
      explain: 'disabled を外すとボタンが押せる状態になった。これは「原因の仮説を即座に検証する」ための操作で、元のソースは変わらない（再読み込みで元に戻る）。恒久的に直すには、HTML／JSを修正する必要がある。逆に言えば、画面側の制限（disabled・hidden・maxlength）はユーザー側で簡単に外せるので、サーバー側の検証が必須。',
    },
  ],
  review: {
    steps: ['Elements で html → body を展開して構造を見る', '「非表示」バッジ・コメント・hidden な入力欄を探す', '検索欄で #id / .class / テキストを検索する', '属性を編集して仮説を確かめる（サーバーには影響しない）'],
    commands: [{ cmd: "document.querySelector('#send')", meaning: 'セレクタで要素を取り出す' }, { cmd: "el.getAttribute('disabled')", meaning: '属性の値を読む' }, { cmd: "el.removeAttribute('disabled')", meaning: '属性を削除する' }],
    why: 'HTML は閲覧者全員に全文が届く。画面に出さないことは、守ることではない。',
    practice: 'リリース前に自分のページを Elements で見て、コメント・hidden欄・display:none の要素に「公開すべきでない情報」が無いか点検する。',
    related: ['Console', 'Sources', 'パラメータ改ざん', 'アクセス制御'],
  },
  learned: ['devtools-elements', 'dom-hidden-elements', 'html-comments-leak', 'hidden-input', 'attr-edit'],
  solution: ["document.querySelector('#send').removeAttribute('disabled')"],
};
