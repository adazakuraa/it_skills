// DevTools 10: 総合演習 — 購入できない原因を突き止める
const HTML = `<!DOCTYPE html>
<html><head><title>Stagelink — チケット購入</title></head>
<body>
<h1>Stagelink</h1>
<p class="lead">春の音楽祭 S席 ¥8,500</p>
<form id="checkout" action="/api/checkout" method="post">
  <input type="hidden" name="csrf_token" value="">
  <input type="text" name="coupon" placeholder="クーポンコード">
  <button id="pay" type="submit">購入する</button>
</form>
<p id="err" style="color:red"></p>
<script src="/js/checkout.js"></script>
</body></html>`;

const JS = `// 購入処理
const token = localStorage.getItem('csrfToken');
document.querySelector('input[name=csrf_token]').value = token || '';

document.getElementById('checkout').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { coupon: e.target.coupon.value, csrf_token: token };
  const res = await fetch('/api/checkout', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    document.getElementById('err').textContent = '購入できませんでした';
    return;
  }
  location.href = '/thanks';
});`;

export const d10 = {
  id: 'dv-10-capstone',
  title: '総合演習: 購入できない原因を突き止める',
  minutes: 20,
  objectives: ['Console・Network・Sources・Application を連携させて原因を絞り込める', '画面の症状から、通信→コード→保存データの順に根本原因へたどれる', '調査結果を「現象・原因・対策」で説明できる'],
  prereq: ['dv-09-performance'],
  briefing: 'チケット販売サイト Stagelink で「購入ボタンを押すと『購入できませんでした』と出る」という報告が相次いでいる。画面に出るのは1行だけ。ここまで学んだ道具を総動員して、根本原因まで突き止めよう。調査の順番も大事だ。',
  concepts: [{
    title: '調査の流れ',
    why: '症状（画面のエラー文）は結果にすぎない。原因は、通信・コード・保存データのどこかにある。決まった順で調べれば、迷わず絞り込める。',
    problem: '闇雲に触ると、原因と無関係なところを直して時間を失う。',
    how: '1) Console で赤いエラー（種類と場所）を確認。2) Network で失敗した通信のステータスとレスポンスを確認。3) Sources でその通信を出しているコードを読む。4) Application で、コードが参照している保存データ（キー名・値）を確認。5) Elements で、画面に反映された値（hidden欄など）を確認。「現象→直接原因→根本原因」の順にたどる。',
    example: '現象: 購入できません → 通信: 403（csrf_token が空）→ コード: localStorage の csrfToken を読んでいる → 保存データ: 実際のキーは csrf_token（名前の食い違い）',
    relation: '5つの道具の読み方を一つの調査にまとめて使う。',
  }],
  browser: {
    url: 'https://stagelink.example.com/checkout',
    html: HTML,
    tabs: ['console', 'network', 'sources', 'application', 'elements'],
    storage: { local: { csrf_token: '7d2e-41ab-cc09', user_pref: 'compact' }, session: { cart_id: 'C-4471' }, cookies: [{ name: 'session', value: 'ST-00a1', httpOnly: true, secure: true, sameSite: 'Lax', path: '/' }] },
    console: [
      { level: 'log', text: 'checkout.js loaded', source: 'checkout.js:1' },
      { level: 'error', text: 'Failed to load resource: the server responded with a status of 403 ()', source: 'stagelink.example.com/api/checkout' },
    ],
    sources: { 'checkout.js': JS },
    network: [
      { url: '/checkout', status: 200, mime: 'text/html', size: 2100, time: 110, start: 0, initiator: 'ナビゲーション' },
      { url: '/js/checkout.js', status: 200, mime: 'application/javascript', size: 700, time: 50, start: 120, initiator: '/checkout (HTML)' },
      { id: 'pay', url: '/api/checkout', method: 'POST', status: 403, mime: 'application/json', size: 130, time: 90, start: 400, initiator: 'checkout.js:8',
        reqHeaders: { 'content-type': 'text/plain;charset=UTF-8' },
        reqBody: '{"coupon":"","csrf_token":null}',
        resBody: '{"error":"csrf_token_missing","message":"CSRFトークンが見つかりません"}',
        note: '403 Forbidden: サーバーがリクエストを拒否しました。' },
    ],
    quick: ["localStorage.getItem('csrfToken')", "localStorage.getItem('csrf_token')", "Object.keys(localStorage)"],
  },
  tasks: [
    {
      q: 'まず Network で失敗した購入リクエスト（/api/checkout）を開き、レスポンスの error の値を答えてください。',
      narration: '調査の起点は、失敗した通信。ステータス（403）と、サーバーの言い分（Response）を確認する。',
      check: { type: 'answer', any: ['csrf_token_missing'], ci: true },
      answerHint: 'エラーコード',
      hints: ['Network → /api/checkout の行（赤い）をタップ', 'Response タブを開く', 'csrf_token_missing'],
      explain: 'サーバーは「CSRFトークンが見つからない」と返している。つまり、ブラウザがトークンを送れていない。CSRFトークンは、他サイトからの勝手な購入リクエストを防ぐための合言葉で、無いリクエストは拒否されるのが正しい動作。',
    },
    {
      q: '送信したリクエストの本文（Payload）で、csrf_token にどんな値が送られていたか答えてください（JSON に書かれたそのままの値）。',
      narration: 'サーバーが「無い」と言うなら、ブラウザが何を送ったかを確かめる。Payload タブが答えを持っている。',
      check: { type: 'answer', any: ['null'], ci: true },
      answerHint: 'JSON の値',
      hints: ['同じ詳細画面の Payload タブ', '送信内容 (Request Payload) の csrf_token', 'null'],
      explain: 'null が送られていた。ブラウザ側で、トークンの値が取得できていないということ。次に、コード（Sources）で、トークンをどこから読んでいるかを確認する。',
    },
    {
      q: 'Sources の checkout.js で、トークンを localStorage から読んでいる行の「キー名」（getItem の引数）を答えてください。',
      narration: 'コードは localStorage の特定のキーを探しにいく。そのキー名が実際の保存と一致しているかが、次の確認ポイント。',
      check: { type: 'answer', any: ['csrfToken'], ci: false },
      answerHint: 'キー名（大文字小文字に注意）',
      hints: ['Sources → checkout.js を開く', '2行目の localStorage.getItem(…)', 'csrfToken'],
      explain: 'コードは csrfToken（キャメルケース）というキーを読んでいる。大文字小文字も含め、キー名は完全一致が必要。ここまでで「直接原因」の見当が付いた。実際に保存されているキー名と照らし合わせる。',
    },
    {
      q: 'Application の Local Storage に実際に保存されている CSRF トークンのキー名を答えてください。',
      narration: 'コードが探すキー(csrfToken)と、実際に保存されているキーを並べて比べる。',
      check: { type: 'answer', any: ['csrf_token'], ci: false },
      answerHint: 'キー名',
      hints: ['Application → Local Storage を開く', 'token を含むキーを探す', 'csrf_token'],
      explain: '保存側は csrf_token（スネークケース）、読む側は csrfToken。名前が食い違って null になっていた。これが根本原因で、「命名規則の不統一」という、ありがちな人為ミス。直すのはコード側（キー名を揃える）。',
    },
    {
      q: '原因の裏付けとして、ページ内のフォームの hidden 入力欄（name=csrf_token）に、正しいトークンの値を設定してください（Elements で value を編集するか、Console で setAttribute）。これは、直し方が正しいかの実験です。',
      narration: '仮説（キー名の食い違い）が正しければ、正しい値を入れたとき購入が通るはず。実験として、画面側に値を入れてみる。',
      check: { type: 'dev', dom: { sel: 'input[name=csrf_token]', attr: { value: '7d2e-41ab-cc09' } } },
      noInput: true,
      hints: ['Elements で input name="csrf_token" を探して選ぶ', '属性 value に Application で見たトークンを入力する', "Console: document.querySelector('input[name=csrf_token]').setAttribute('value', localStorage.getItem('csrf_token'))"],
      explain: '仮説の検証として、値を入れて挙動を確かめる。これは実験で、恒久対策は checkout.js の getItem(\'csrfToken\') を csrf_token に直すこと。本番では、直した後にテスト（自動テスト含む）で再発を防ぐ。',
    },
    {
      q: '調査のまとめです。このインシデントの「根本原因」として最も適切なものを選んでください。\n1) サーバーが落ちていた（5xx）\n2) ブラウザが CORS でブロックした\n3) JS が読むキー名と、保存されているキー名が一致していなかった\n4) ユーザーが Cookie を削除した',
      narration: '「現象（購入できない）」「直接原因（トークンが送られていない）」「根本原因（なぜ送られなかったか）」を区別するのが、調査の締め。',
      check: { type: 'answer', any: ['3'] },
      answerHint: '番号',
      hints: ['ステータスは 403（5xx ではない）、CORS のエラーは出ていない', 'Cookie の session は正常。問題はトークン', '3'],
      explain: '現象=購入できない、直接原因=トークンが null、根本原因=キー名の不一致。調査報告は、この3層で書くと伝わる。「403 だからサーバー側のバグ」と決めつけず、通信→コード→保存データと順に確かめた点が、実務的なデバッグの型になる。',
    },
  ],
  review: {
    steps: ['Console で赤いエラーの種類と場所を確認', 'Network で失敗した通信のステータスと Response/Payload を読む', 'Sources でその通信を出すコードを読む', 'Application で保存データの実際のキー・値と照合する', '現象→直接原因→根本原因で整理する'],
    commands: [{ cmd: 'Console → Network → Sources → Application', meaning: '症状から根本原因へたどる順番' }, { cmd: "localStorage.getItem('key')", meaning: 'コードが読む値を直接確かめる' }, { cmd: 'setAttribute', meaning: '仮説を検証するための一時的な変更' }],
    why: '道具の使い方より、「何を、どの順で、何のために見るか」が実務の力になる。',
    practice: '障害調査の報告は、現象・原因・対策・再発防止の4点で書く。スクリーンショット（機密は伏せて）を添えると、他の人が追体験しやすい。',
    related: ['CSRF', 'インシデント報告', '根本原因分析', 'デバッグの型'],
  },
  learned: ['devtools-investigation', 'root-cause-analysis', 'csrf-token', 'debug-flow'],
  solution: ["document.querySelector('input[name=csrf_token]').setAttribute('value', localStorage.getItem('csrf_token'))"],
};
