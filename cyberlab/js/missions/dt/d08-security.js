// DevTools 8: Security / Issues — HTTPS・証明書・混在コンテンツ・CORS・CSP
const HTML = `<!DOCTYPE html>
<html><head><title>Maple Bank — マイページ</title></head>
<body><h1>Maple Bank マイページ</h1>
<img src="http://images.legacy-cdn.example.net/banner.png" alt="キャンペーン">
<div id="profile">読み込み中…</div>
<script src="/js/mypage.js"></script></body></html>`;

export const d08 = {
  id: 'dv-08-security',
  title: 'Security と Issues: 保護の状態を読む',
  minutes: 15,
  objectives: ['Security タブで HTTPS と証明書の情報を読める', '混在コンテンツ・Cookie 属性・CSP/CORS の警告を読み解ける', 'ブロックされた通信の原因と、守るべき意図を理解する'],
  prereq: ['dv-07-debugger'],
  briefing: 'ネットバンキング風のデモページ「Maple Bank マイページ」で、プロフィールが表示されない。Console には赤い警告が並ぶ。ブラウザは危険な通信を自動でブロックしてくれる。その警告は「守ろうとしている意図」を伝えている。Security タブと Issues で読み解こう。',
  concepts: [{
    title: 'ブラウザが守ってくれること',
    why: 'ブラウザには、盗聴・改ざん・なりすましから利用者を守る仕組みがある。ブロックされたときの警告を理解すれば、直し方と、守るべき理由の両方が分かる。',
    problem: '赤い警告を見ても、「なぜ駄目なのか」が分からないと、設定を緩めて無理に動かしてしまい、かえって危険になる。',
    how: 'Security タブは、HTTPS か・証明書の発行先/期限・暗号方式を示す。Issues は、混在コンテンツ（HTTPSなのにHTTPの部品がある）、Cookie の属性不足、CSP/CORS によるブロックなどを一覧する。CORS=他ドメインの API をブラウザが読めるかを、サーバーが許可する仕組み（Access-Control-Allow-Origin ヘッダ）。CSP=読み込んでよい元を制限する、ページの防御ルール。',
    example: 'Access to fetch at \'https://api…\' from origin \'https://…\' has been blocked by CORS policy: No \'Access-Control-Allow-Origin\' header is present.',
    relation: '警告の文面から原因（ヘッダの欠落・HTTPの部品）を特定し、「緩める」のではなく正しく直す。',
  }],
  browser: {
    url: 'https://mypage.maple-bank.example.com/',
    html: HTML,
    tabs: ['security', 'console', 'network', 'application'],
    security: { cert: { subject: 'mypage.maple-bank.example.com', issuer: 'Example Trust CA G2', validFrom: '2026-03-15', validTo: '2027-03-14', cipher: 'TLS_AES_128_GCM_SHA256' }, protocol: 'TLS 1.3' },
    storage: { cookies: [{ name: 'bank_session', value: 'B-91ac7f', httpOnly: true, secure: false, sameSite: 'Lax', path: '/' }] },
    console: [
      { level: 'warn', text: "Mixed Content: The page at 'https://mypage.maple-bank.example.com/' was loaded over HTTPS, but requested an insecure image 'http://images.legacy-cdn.example.net/banner.png'." },
      { level: 'error', text: "Access to fetch at 'https://api.partner-data.example.org/profile' from origin 'https://mypage.maple-bank.example.com' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.", source: 'mypage.js:8' },
    ],
    sources: { 'mypage.js': "fetch('https://api.partner-data.example.org/profile');" },
    network: [
      { url: '/', status: 200, mime: 'text/html', size: 1900, time: 120, resHeaders: { 'content-type': 'text/html', 'strict-transport-security': 'max-age=31536000', 'content-security-policy': "default-src 'self'; img-src 'self' https:" } },
      { url: 'http://images.legacy-cdn.example.net/banner.png', status: 200, mime: 'image/png', size: 22000, time: 140, start: 130, protocol: 'http/1.1' },
      { url: 'https://api.partner-data.example.org/profile', status: 0, blocked: 'cors', mime: '', size: 0, time: 90, start: 140, initiator: 'mypage.js:8', note: 'サーバーのレスポンスに Access-Control-Allow-Origin ヘッダが無いため、ブラウザがこのページに結果を渡しませんでした。' },
    ],
  },
  tasks: [
    {
      q: 'Security タブで、この証明書の有効期限（有効期間の終わり）の日付を答えてください（例: 2027-01-31 の形式）。',
      narration: 'HTTPS は「証明書」で通信相手の正しさを保証する。期限切れの証明書は、ブラウザが警告を出す。',
      check: { type: 'answer', any: ['2027-03-14'] },
      answerHint: 'YYYY-MM-DD',
      hints: ['Security タブを開く', '「証明書 (Certificate)」の「有効期間」', '2026-03-15 〜 2027-03-14 の終わり側'],
      explain: '証明書の期限切れは、サイト停止の定番の原因（ブラウザが「安全ではありません」を出す）。期限を監視し、自動更新（ACME/Let\'s Encrypt など）を整えるのが運用の基本。',
    },
    {
      q: '混在コンテンツ（HTTPS ページ内の HTTP のリソース）になっている画像のホスト名を答えてください。',
      narration: 'HTTPS のページに HTTP の部品が混ざると、その部分だけ盗聴・改ざんされうる。Security タブの「Issues」にも出る。',
      check: { type: 'answer', any: ['images.legacy-cdn.example.net'], ci: true },
      answerHint: 'ホスト名',
      hints: ['Security タブの Issues の「混在コンテンツ」を見る', 'detail に URL が出ている', 'images.legacy-cdn.example.net'],
      explain: '画像だけでも、HTTPの部品があれば通信路上で差し替えられる。ブラウザは警告やブロックで保護する。直し方は、読み込み元を https:// にする（相手が対応していなければ、自分のサーバーに置き直す）。',
    },
    {
      q: 'Cookie の警告で、「Secure 属性がない」と指摘されている Cookie の名前を答えてください。',
      narration: 'Issues の Cookie の項目は、属性の不足を教えてくれる。Secure が無いと、HTTP でも送信されうる。',
      check: { type: 'answer', any: ['bank_session'], ci: true },
      answerHint: 'Cookie 名',
      hints: ['Security タブの Issues の Cookie の項目を見る', 'Secure 属性がない旨の行', 'bank_session'],
      explain: 'Secure が無い認証 Cookie は、誤って HTTP で接続した際にそのまま送信され、盗聴される恐れがある。HTTPS 専用のサイトでは、Cookie に Secure を付け、HSTS（strict-transport-security）で常に HTTPS を強制するのが定番の組み合わせ。',
    },
    {
      q: 'Network タブで、CORS ポリシーによりブロックされたリクエストの URL の「パス」（/ から始まる部分）を答えてください。',
      narration: 'ブロックされた通信は、ステータスが（blocked:cors）と表示される。画面に表示されない原因の1つ。',
      check: { type: 'answer', any: ['/profile'], ci: true },
      answerHint: '/ から始まるパス',
      hints: ['Network タブを開き、ステータス欄が（blocked:cors）の行を探す', '詳細を開いて Request URL を読む', '/profile'],
      explain: 'CORS は「他のドメインの API を、このページの JS から読んでいいか」をサーバーが許可する仕組み。ここでは相手サーバーが許可ヘッダを返していないので、ブラウザが結果を渡さない。直すのは API 側の設定で、フロントで回避する裏技ではない。',
    },
    {
      q: 'Console の CORS エラー文に書かれている、「無い」と指摘されているレスポンスヘッダ名（Access-Control-… で始まる）を答えてください。',
      narration: 'エラー文には、足りないものが具体的に書かれている。長い文だが、「No ... header is present」の部分を探す。',
      check: { type: 'answer', any: ['access-control-allow-origin'], ci: true },
      answerHint: 'ヘッダ名',
      hints: ['Console の赤いエラーを読む', '「No」と「header is present」の間の引用符の中', 'Access-Control-Allow-Origin'],
      explain: 'このヘッダで、サーバーが「どのオリジン(ドメイン)からの読み取りを許すか」を宣言する。無暗に * (全許可)にせず、必要なドメインだけを許可するのが安全。エラー文に直し方のヒントが書かれているので、まず全文を読む癖を付けよう。',
    },
  ],
  review: {
    steps: ['Security タブで HTTPS・証明書の発行先と期限を確認する', 'Issues で混在コンテンツ・Cookie の属性を確認する', 'Console/Network のブロック（CORS・CSP）の文面から原因を読む', '設定を緩めず、サーバー/配信側を正しく直す'],
    commands: [{ cmd: 'Mixed Content', meaning: 'HTTPS ページ内の HTTP 部品' }, { cmd: 'CORS', meaning: '他ドメイン API を読む許可の仕組み' }, { cmd: 'Secure / HttpOnly / SameSite', meaning: 'Cookie を守る3つの属性' }],
    why: 'ブラウザの警告は「利用者を守るために止めた」というサイン。意図を理解すれば、直し方も分かる。',
    practice: 'リリース前に Security/Issues を確認する。証明書期限・混在コンテンツ・Cookie 属性は、機械的に点検できる項目。',
    related: ['HTTPS/TLS', 'HSTS', 'CORS', 'CSP', 'Cookie 属性'],
  },
  learned: ['devtools-security', 'https-cert', 'mixed-content', 'cors', 'csp-basics'],
  solution: [{ do: 'visit', args: ['security'] }],
};
