// DevTools 5: Application — Storage と Cookie
const HTML = `<!DOCTYPE html>
<html><head><title>Mochi Market</title></head>
<body>
<header><h1>Mochi Market</h1><button id="theme-toggle">テーマ切替</button></header>
<main><p>カートに入っている商品を確認できます。</p><div id="cart-count"></div></main>
<script src="/js/shop.js"></script>
</body></html>`;

export const d05 = {
  id: 'dv-05-application',
  title: 'Application: Storage と Cookie を読む',
  minutes: 15,
  objectives: ['Local Storage / Session Storage / Cookie の違いを説明できる', 'Cookie の HttpOnly / Secure / SameSite を読める', '「ブラウザに保存した秘密は読まれうる」という前提を理解する'],
  prereq: ['dv-04-headers'],
  briefing: 'ECサイト Mochi Market では、カートの中身やログイン状態がブラウザ内に保存されている。ページを閉じても残るのはなぜか？ どこに何が入っているのか？ Application タブで保存領域を直接のぞいてみよう。',
  concepts: [{
    title: 'ブラウザが覚えている場所',
    why: 'ログイン状態・カート・設定は、ブラウザ側に保存されている。セキュリティ設計の多くは「何を、どこに、どの保護付きで置くか」の判断。',
    problem: '保存場所ごとに性質が違う。選択を間違えると、他人に盗まれたり、勝手に送信されたりする。',
    how: 'Local Storage=閉じても残る・JSから読み書き自由。Session Storage=タブを閉じると消える・JSから読める。Cookie=サーバーへ自動送信される小さな値。Cookie には保護の属性がある: HttpOnly(JSから読めない)、Secure(HTTPSでだけ送信)、SameSite(他サイトからの送信を制限)。Application タブでは、これらの中身と属性が一覧できる。',
    example: 'localStorage: theme = "dark"\nCookie: sid  HttpOnly✓ Secure✓ SameSite=Lax\nCookie: auth_token  HttpOnly✗  ← JSから読める！',
    relation: '保存の中身と属性を確認し、ユーザーのJSが読めるもの・盗まれたら困るものを見分ける。',
  }],
  browser: {
    url: 'https://mochi-market.example.com/',
    html: HTML,
    tabs: ['application', 'console'],
    storage: {
      local: { theme: 'dark', cart: '[{"id":11,"qty":1},{"id":24,"qty":2},{"id":31,"qty":1}]', access_token: 'mm_at_5c1e90aa77' },
      session: { checkout_step: '2' },
      cookies: [
        { name: 'sid', value: 'S-4b7d0e19c2', httpOnly: true, secure: true, sameSite: 'Lax', path: '/' },
        { name: 'auth_token', value: 'mm_ck_77aa31d0', httpOnly: false, secure: true, sameSite: '', path: '/' },
        { name: 'pref_lang', value: 'ja', httpOnly: false, secure: false, sameSite: 'Lax', path: '/', expires: '2027-01-01' },
      ],
    },
    sources: { 'shop.js': "const theme = localStorage.getItem('theme');" },
    quick: ["localStorage.getItem('theme')", "JSON.parse(localStorage.getItem('cart')).length", 'document.cookie', "Object.keys(localStorage)"],
  },
  tasks: [
    {
      q: 'Application タブの Local Storage を開き、キー theme の値を答えてください。',
      narration: 'Local Storage は、サイトごとに用意された「ブラウザ内の小さな保存庫」。設定の記憶によく使われる。',
      check: { type: 'answer', any: ['dark'], ci: true },
      answerHint: '値',
      hints: ['Application タブ → Local Storage', 'キー theme の行を読む', 'dark'],
      explain: 'テーマ設定のような「見られても困らない」ものの保存は、Local Storage の正しい使い道。ブラウザを閉じても残る。逆に、見られたら困るものを置くべきではない。',
    },
    {
      q: 'キー cart の値は JSON です。Console で JSON.parse(localStorage.getItem(\'cart\')).length を実行して、カートの商品種類数を答えてください。',
      narration: 'Storage の値は文字列だけ。配列や辞書は JSON 文字列にして保存される。JSON.parse で戻せば、Console から中身を数えられる。',
      check: { type: 'answer', any: ['3'] },
      answerHint: '数字',
      hints: ['Console タブで localStorage.getItem(\'cart\') を実行すると文字列が見える', 'JSON.parse(…) で配列に戻し、.length で個数', '3'],
      explain: '3件。ブラウザ内に保存したデータは、ユーザー自身がいつでも書き換えられる。カートの単価や割引率をここに置いて信用すると、改ざんされる。金額計算はサーバー側で行うのが原則。',
    },
    {
      q: 'Local Storage に、ログイン用のトークンらしき項目があります。そのキー名を答えてください。',
      narration: 'トークンは「ログイン済みであること」を示す合言葉のようなもの。持っている人は、本人として扱われる。',
      check: { type: 'answer', any: ['access_token'], ci: true },
      answerHint: 'キー名',
      hints: ['Local Storage の一覧を上から読む', 'token という語が入ったキー', 'access_token'],
      explain: 'Local Storage のトークンは、同じサイトで動くJS（XSSで混入した悪意あるスクリプトも）から読める。盗まれると、パスワードなしで本人になりすまされる。認証情報は、HttpOnly Cookie など JS から読めない場所に置く設計が安全寄り。',
    },
    {
      q: 'Cookies の中で、「認証用に見えるのに HttpOnly が付いていない」Cookie の名前を答えてください。',
      narration: 'Cookie の下に、HttpOnly / Secure / SameSite の3つの属性が出ている。✓ が付いていれば保護あり、✗ は保護なし。',
      check: { type: 'answer', any: ['auth_token'], ci: true },
      answerHint: 'Cookie 名',
      hints: ['Application → Cookies を開く', '各 Cookie の HttpOnly の ✓/✗ を見る', 'auth_token'],
      explain: 'HttpOnly が無い認証 Cookie は、XSS でスクリプトを仕込まれたとき document.cookie で盗める。sid のように HttpOnly+Secure+SameSite が揃っているのが理想の姿。pref_lang のような言語設定なら、保護が弱くても被害は小さい。',
    },
    {
      q: 'Console で document.cookie を実行すると、現在のページから読める Cookie が出ます。そこに表示される Cookie の「個数」を答えてください。',
      narration: 'HttpOnly の Cookie は、JavaScript からは見えない（それが保護の仕組み）。Console の結果から、何個見えるか数えてみよう。',
      check: { type: 'answer', any: ['2'] },
      answerHint: '数字',
      hints: ['Console で document.cookie を実行し、「;」で区切られた項目を数える', 'HttpOnly の Cookie は結果に含まれない', '2（sid は見えない）'],
      explain: 'Cookie は3つあるのに、JS から見えるのは2つだけ。HttpOnly の sid は JS から隠されている。これが「XSS が起きても、セッションCookieは盗めない」という保護。属性ひとつの差が、被害の大きさを分ける。',
    },
    {
      q: '「テーマ設定をリセットする」操作として、Local Storage の theme を削除してください（Application タブの削除、または Console の localStorage.removeItem で）。',
      narration: 'ストレージの編集は、デバッグでよく使う。「初回アクセス時の状態」を再現したいときなどに便利。',
      check: { type: 'dev', storage: { local: { theme: null } } },
      noInput: true,
      hints: ['Application → Local Storage の theme 行', '行の右の「削除」をタップ', "Console なら localStorage.removeItem('theme')"],
      explain: '保存データを消して「初回の状態」でテストするのは、再現テストの基本。ただし本物のサイトで Cookie やストレージを消すとログアウトするので、操作の影響は考えてから行うこと。',
    },
  ],
  review: {
    steps: ['Application タブで Local / Session Storage と Cookie を開く', '保存されている値の種類・機密性を見る', 'Cookie の HttpOnly / Secure / SameSite を確認する', 'JS から読めるものに秘密が入っていないか点検する'],
    commands: [{ cmd: "localStorage.getItem('key')", meaning: 'Local Storage の値を読む' }, { cmd: 'document.cookie', meaning: 'JS から見える Cookie（HttpOnly は除く）' }, { cmd: "localStorage.removeItem('key')", meaning: '項目を削除する' }],
    why: '「ブラウザに置いたものは、持ち主（ユーザー）と、同じページで動くJSに読まれる」。何をどこに置くかは設計上の重大な判断。',
    practice: '認証Cookieは HttpOnly + Secure + SameSite を付ける。トークンの置き場所と属性は、レビューで必ず確認する項目。',
    related: ['XSS', 'セッション管理', 'CSRF と SameSite', 'JWT'],
  },
  learned: ['devtools-application', 'web-storage', 'cookie-flags', 'httponly', 'token-storage-risk'],
  solution: ["JSON.parse(localStorage.getItem('cart')).length", 'document.cookie', "localStorage.removeItem('theme')"],
};
