// DevTools 9: Performance — 表示速度（Core Web Vitals）とスロットリング
const HTML = `<!DOCTYPE html>
<html><head><title>Aoba Travel</title></head>
<body><header><h1>Aoba Travel</h1></header>
<img id="hero" src="/img/hero-banner.png" alt="海辺の写真">
<section id="cards"><div class="card">プランA</div><div class="card">プランB</div></section>
<script src="/js/bundle.js"></script><script src="/js/vendor.js"></script></body></html>`;

export const d09 = {
  id: 'dv-09-performance',
  title: 'Performance: 遅い理由を数字で読む',
  minutes: 16,
  objectives: ['Core Web Vitals（FCP/LCP/CLS/TBT）の意味を説明できる', 'スロットリングで遅い回線を再現できる', '転送サイズの内訳から、重いリソースを特定できる'],
  prereq: ['dv-08-security'],
  briefing: '旅行サイト Aoba Travel は「スマホで開くのが遅い」と言われている。開発者のPC（高速回線）では速く見える。DevTools は、遅い回線を再現し、何に時間がかかっているかを数字で示してくれる。',
  concepts: [{
    title: '表示速度の指標とスロットリング',
    why: '体感の遅さは離脱の大きな原因。「なんとなく遅い」ではなく、どの指標が悪く、何が原因かを数字で示せば、直す優先順位が決められる。',
    problem: '開発環境は高速なので、遅さに気付けない。実際のユーザー（モバイル回線）の体験とは差がある。',
    how: 'Network タブの Throttling で回線速度を切り替える（Fast 4G / Slow 4G / Offline）。Performance タブは Core Web Vitals を表示する: FCP=最初に何か表示されるまで、LCP=最大の要素（画像・見出し）が表示されるまで（2.5秒以内が目安）、CLS=表示のガタつき（0.1以下が目安）、TBT=JSの処理で操作できない時間。下に種類別の転送サイズが出るので、重いものから対処する。',
    example: 'LCP 2.0s → Slow 4G で 10.00s\nCLS 0.31（画像に width/height が無く、後から押し下げられる）',
    relation: '遅い回線で再現し、指標と内訳から重いものを特定して、効果の大きい順に直す。',
  }],
  browser: {
    url: 'https://aoba-travel.example.com/',
    html: HTML,
    tabs: ['performance', 'network'],
    perf: { fcp: 900, lcp: 2000, cls: 0.31, tbt: 450, lcpElement: '<img id="hero" src="/img/hero-banner.png" alt="海辺の写真">' },
    network: [
      { url: '/', status: 200, mime: 'text/html', size: 6100, time: 130, start: 0, initiator: 'ナビゲーション' },
      { url: '/img/hero-banner.png', status: 200, mime: 'image/png', size: 2400000, time: 700, start: 140, initiator: '/ (HTML)', note: '表示幅は 400px 程度なのに、約2.4MBのPNGを読み込んでいます。' },
      { url: '/js/bundle.js', status: 200, mime: 'application/javascript', size: 280000, time: 260, start: 140 },
      { url: '/js/vendor.js', status: 200, mime: 'application/javascript', size: 890000, time: 420, start: 140, note: '使われていないライブラリも含んだ大きなファイルです。' },
      { url: '/css/site.css', status: 200, mime: 'text/css', size: 24000, time: 60, start: 140 },
    ],
  },
  tasks: [
    {
      q: 'Network タブの Throttling（回線速度）を「Slow 4G」に切り替えてください。',
      narration: '開発者の回線は速すぎて、遅さに気づけない。スロットリングは「遅い回線の人の体験」を再現する機能。',
      check: { type: 'dev', throttle: 'slow4g' },
      noInput: true,
      hints: ['Network タブを開く', '右上のプルダウン（No throttling）を選ぶ', '「Slow 4G」を選択'],
      explain: 'Slow 4G にすると、通信にかかる時間が約5倍になる。同じページでも、電波の弱い場所のスマホでは、これくらい遅く感じられる。速度の検証は、必ず遅い回線で行う。',
    },
    {
      q: 'Slow 4G にした状態で Performance タブを開き、LCP（最大要素の描画）の値を答えてください（例: 3.00 s の場合は 3）。',
      narration: '通常 2.0秒だった LCP が、遅い回線ではどうなるか。目安は2.5秒以内。それを超えると「遅い」と判定される。',
      check: { type: 'answer', any: ['10', '10.0', '10.00', '10秒', '10.00 s', '10s', '10000'], ci: true },
      answerHint: '秒数',
      hints: ['まず Slow 4G を選ぶ（前の課題）。次に Performance タブを開く', 'LCP のカード。赤くなる（遅い）', '10.00 s → 10'],
      explain: 'LCP が 10 秒。目安の 2.5 秒を大きく超えていて、ユーザーは待ちきれず離脱する。この数字が「改善の根拠」になる。「速くしたい」ではなく「LCP を 2.5 秒以内に」と目標を数字で置ける。',
    },
    {
      q: '種類別の転送サイズの内訳（Performance タブ）を見て、JavaScript ファイルの中で最も大きいファイル名を答えてください（Network タブで確認できます）。',
      narration: '遅さの原因は、ほとんどの場合「大きなもの」。大きい順に見ていくのが、改善の定石。',
      check: { type: 'answer', any: ['vendor.js'], ci: true },
      answerHint: 'ファイル名',
      hints: ['Network タブで、フィルタ「JS」を使う', '各行のサイズを比べる', 'vendor.js（約890kB）'],
      explain: 'vendor.js は外部ライブラリをまとめたファイルで、未使用コードが多いことが多い。コード分割（必要な画面でだけ読み込む）、不要なライブラリの削除、tree shaking などで縮められる。',
    },
    {
      q: 'LCP（最大要素）になっている HTML 要素の「タグ名」を答えてください（Performance タブの LCP 要素）。',
      narration: 'LCP を決めているのは「画面で最も大きく表示される要素」。それが画像なら、画像の最適化が一番効く。',
      check: { type: 'answer', any: ['img'], ci: true },
      answerHint: 'タグ名',
      hints: ['Performance タブの「LCP 要素」を見る', '< の次に書かれているタグ名', 'img'],
      explain: 'LCP 要素が img（約2.4MBのPNG）。画像を適切なサイズに縮小して WebP/AVIF に変換するだけで、LCP が大きく改善する典型例。画像は最も効果が出やすい改善対象。',
    },
    {
      q: 'CLS（レイアウトのズレ）の値を答えてください。目安は 0.1 以下です。',
      narration: 'CLS は、読み込み中に画面の要素がずれて動く度合い。画像のサイズ指定がないと、画像が読み込まれた瞬間に下の文章が押し下げられる。',
      check: { type: 'answer', any: ['0.31'] },
      answerHint: '小数',
      hints: ['Performance タブの CLS のカード', '数値だけを読む', '0.31'],
      explain: '0.31 は目安（0.1以下）の3倍以上で、ボタンを押そうとした瞬間にずれて誤タップする、といった体験につながる。対策は、画像に width/height を指定して場所をあらかじめ確保すること。',
    },
  ],
  review: {
    steps: ['Throttling で遅い回線（Slow 4G）を再現する', 'Performance で FCP/LCP/CLS/TBT を読む', '種類別サイズと Network で、重いリソースを探す', '効果の大きい順（画像→JS→CSS）に対策する'],
    commands: [{ cmd: 'LCP', meaning: '最大の要素が表示されるまで（目安 2.5秒以内）' }, { cmd: 'CLS', meaning: '表示のずれ（目安 0.1以下）' }, { cmd: 'Throttling', meaning: '遅い回線を再現する機能' }],
    why: '速度は数字で測り、目標を決めて改善する。ユーザーの体験は開発者の環境とは違う。',
    practice: '大きい画像の圧縮、画像サイズの指定、使っていないJSの削除は、費用対効果の高い定番の改善策。',
    related: ['Core Web Vitals', '画像最適化', 'コード分割', 'キャッシュ'],
  },
  learned: ['devtools-performance', 'core-web-vitals', 'network-throttling', 'resource-weight', 'cls-causes'],
  solution: [{ do: 'setThrottle', args: ['slow4g'] }],
};
