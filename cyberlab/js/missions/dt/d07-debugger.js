// DevTools 7: Sources のデバッガ — ブレークポイントで実行を止めて変数を読む
const HTML = `<!DOCTYPE html>
<html><head><title>Shop Cart</title></head>
<body><h1>カート</h1><ul id="lines"></ul><p>合計: <span id="total">-</span></p><button id="checkout">購入手続きへ</button>
<script src="/js/cart.js"></script></body></html>`;

const CART = `// カートの合計金額を計算する
const COUPON_RATE = 0.2;          // 20% 割引

function calcTotal(items, coupon) {
  let subtotal = 0;
  for (const it of items) {
    subtotal += it.price * it.qty;
  }
  const discount = coupon ? COUPON_RATE * 100 : 0;
  const total = subtotal - discount * subtotal;
  document.getElementById('total').textContent = total + '円';
  return total;
}

function onCheckout() {
  const items = loadCart();
  return calcTotal(items, 'SPRING');
}`;

export const d07 = {
  id: 'dv-07-debugger',
  title: 'デバッガ: ブレークポイントで実行を止める',
  minutes: 16,
  objectives: ['ブレークポイントを設定して実行を一時停止できる', 'Scope で変数の「その瞬間の値」を読める', 'Call Stack で「誰が呼んだか」をたどれる'],
  prereq: ['dv-06-sources'],
  briefing: 'ショップのカートで、クーポンを使うと合計がマイナスになるというバグ報告。コードを眺めても原因が分からない。そこで、計算の途中で実行を止めて、変数の値を直接見る。これがデバッガ(ブレークポイント)の使い方。',
  concepts: [{
    title: 'ブレークポイントとスコープ',
    why: 'console.log を足して再実行する方法は遅く、必要な値を見落としやすい。止めて直接見れば、その瞬間のすべての変数が分かる。',
    problem: '計算結果が想定と違うとき、どの時点で値がおかしくなったかを特定したい。',
    how: 'Sources でコードを開き、行番号をタップするとブレークポイントが付く。その行が実行される直前にプログラムが一時停止し、下に「Scope」（その時点の変数の値）と「Call Stack」（どの関数がどの順で呼んだか）が出る。「▶ 再開」で実行を続ける。止めた行は、まだ実行される前という点に注意。',
    example: '行 10 にブレークポイント → 一時停止\nScope (Local): subtotal = 6000, discount = 20\nCall Stack: calcTotal ← onCheckout',
    relation: '怪しい行の手前に止め、変数の値を読み、期待値とのズレから原因の行を特定する。',
  }],
  browser: {
    url: 'https://shop.example.com/cart',
    html: HTML,
    tabs: ['sources', 'console', 'elements'],
    sources: { 'cart.js': CART },
    breakpoints: {
      'cart.js:10': {
        scope: { 'Local': { items: '[3 items]', coupon: 'SPRING', subtotal: 6000, discount: 20 }, 'Global': { COUPON_RATE: 0.2 } },
        stack: ['calcTotal (cart.js:10)', 'onCheckout (cart.js:17)', '(anonymous) (cart.js:21)'],
        note: '10行目の直前で停止中。まだ total は計算されていません。',
      },
    },
  },
  tasks: [
    {
      q: 'Sources タブで cart.js を開き、合計金額を計算している行（const total = …、10行目）にブレークポイントを設定してください。',
      narration: '行番号をタップすると、その行でプログラムが止まる印（ブレークポイント）が付く。止まった瞬間のすべての変数が見られる。',
      check: { type: 'dev', pausedAt: { file: 'cart.js', line: 10 } },
      noInput: true,
      hints: ['Sources → ファイル名 cart.js をタップして開く', '10行目の行番号をタップする', '「一時停止しました」と表示され、下に Scope が出る'],
      explain: 'ブレークポイントは「ここまで来たら止まれ」という指示。本番ほぼ同じ状態を再現できるのが、ログ出力より便利な点。止まる行は、実行される「直前」である点を覚えておこう。',
    },
    {
      q: '停止中の Scope（Local）にある discount の値を答えてください。',
      narration: 'Scope は、止まった瞬間の変数の値一覧。期待している値と実際の値を並べて見ると、バグの場所が見えてくる。',
      check: { type: 'answer', any: ['20'] },
      answerHint: '数字',
      hints: ['下の「一時停止中」の枠を見る', 'スコープ (Scope) の Local の discount', '20'],
      explain: '割引率 0.2（20%）のはずが discount=20 になっていた。9行目で COUPON_RATE * 100 としたのが原因で、「割引率」と「パーセント表記」が混ざっている。原因の行は、期待値と実際の値のズレを辿ると特定できる。',
    },
    {
      q: 'この値で total を計算すると subtotal - discount * subtotal になります。subtotal が 6000 のときの total を答えてください。',
      narration: '止まっているのは total が計算される直前。頭の中（または Console）で計算して、結果が想定と違うことを確かめよう。',
      check: { type: 'answer', any: ['-114000', '−114000'] },
      answerHint: '数字（マイナスもあり）',
      hints: ['discount * subtotal を先に計算する（20 × 6000）', '6000 - 120000', '-114000'],
      explain: '合計がマイナス 114,000 円になる。これがユーザーに見えていた不具合の正体。直し方は、割引率 0.2 をそのまま使う（discount = COUPON_RATE）か、パーセントで持つなら 100 で割る。値を止めて見ることで、推測ではなく根拠付きで直せる。',
    },
    {
      q: 'Call Stack を見て、calcTotal を呼び出している関数の名前を答えてください。',
      narration: 'Call Stack は「いまの関数を、誰が、どの順で呼んだか」の履歴。上が現在、下ほど呼び出し元。',
      check: { type: 'answer', any: ['onCheckout'], ci: true },
      answerHint: '関数名',
      hints: ['停止中の枠の「コールスタック (Call Stack)」を見る', '一番上が calcTotal。その次の行が呼び出し元', 'onCheckout'],
      explain: 'Call Stack を使うと「この値はどこから渡されたか」を遡れる。今回なら、coupon の \'SPRING\' は onCheckout が渡している。呼び出し元までたどれると、原因が引数なのか内部ロジックなのかを切り分けられる。',
    },
  ],
  review: {
    steps: ['怪しい処理の行番号をタップしてブレークポイントを置く', '停止した Scope で変数の値を期待値と比べる', 'Call Stack で呼び出し元をたどる', '直したら、ブレークポイントを外して「▶ 再開」'],
    commands: [{ cmd: 'ブレークポイント', meaning: '実行を行の手前で止める印' }, { cmd: 'Scope', meaning: '止まった瞬間の変数の値' }, { cmd: 'Call Stack', meaning: '関数の呼び出しの履歴' }],
    why: '値を直接見るデバッグは、推測を減らし、根拠のある修正につなげる。',
    practice: 'バグ報告を受けたら、まず再現手順を確認し、怪しい行にブレークポイントを置いて期待値との差を探す。',
    related: ['console.log デバッグ', 'ユニットテスト', '単位の取り違え（率とパーセント）'],
  },
  learned: ['devtools-debugger', 'breakpoints', 'scope-callstack', 'debug-method'],
  solution: [{ do: 'toggleBreakpoint', args: ['cart.js', 10] }],
};
