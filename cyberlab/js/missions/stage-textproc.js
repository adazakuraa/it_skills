// テキスト処理の深掘り（実技中心）
export const stageTextproc = {
  id: 'textproc',
  title: 'Text — テキスト処理を極める',
  subtitle: 'sort/uniq/cut/awk/sed/tr/wc で“データを整形して読む”力をつける',
  intro: 'ログも設定も、Linuxの世界はテキストでできている。テキストを自在に切り・並べ・数え・変換できれば、調査の速度が段違いになる。',
  missions: [
    {
      id: 't-01-view',
      title: 'ファイルを部分的に読む',
      minutes: 7,
      objectives: ['head/tail で先頭・末尾を見る', '大きなファイルを効率的に把握する'],
      prereq: [],
      briefing: '数万行のログをすべて cat するのは無駄。先頭で書式を掴み、末尾で最新の状況を見る——head と tail を使い分ける。',
      concepts: [{
        title: 'head / tail',
        why: '巨大ファイルは全部読む必要はない。要点は先頭(書式・ヘッダ)と末尾(最新)にあることが多い。',
        problem: '最新のログ数行だけ見たい。あるいは書式を知るため先頭だけ見たい。',
        how: 'head -n N で先頭N行、tail -n N で末尾N行。tail は「最新のログ」を見る定番。パイプの最後に付けてランキングのトップだけ見るのにも使う。',
        example: '$ tail -n 5 app.log   # 直近5行',
        relation: '先頭・末尾を切り出してログの要点を素早く掴む。',
      }],
      env: {
        user: 'analyst', dirs: ['/var/log/app'],
        files: [{ path: '/var/log/app/app.log', owner: 'analyst', content: Array.from({ length: 20 }, (_, i) => `2026-10-14 10:${String(i).padStart(2, '0')}:00 INFO request ${i + 1} handled`).join('\n') + '\n2026-10-14 10:20:00 ERROR database timeout\n' }],
      },
      quick: ['cd /var/log/app', 'head -n 3 app.log', 'tail -n 1 app.log', 'wc -l app.log'],
      tasks: [
        {
          q: 'app.log の最後の1行には何らかの異常が記録されています。末尾1行を表示し、そのログレベル(INFO/ERROR等)を答えてください。',
          narration: '最新の状況は末尾にある。tail -n 1 で最後の行だけ取り出す。',
          check: { type: 'answer', any: ['ERROR'], ci: true },
          hints: ['tail -n 1 app.log', '行の中のログレベル表記を見る', 'ERROR database timeout'],
          explain: 'tail -n 1 で末尾の最新ログだけを確認。実運用では tail -f でリアルタイム追従する(本シミュレーターは静的)。末尾にERRORが出ていれば直近に障害が起きたと分かる。',
        },
        {
          q: 'このログは全部で何行ありますか。wc で数えてください。',
          narration: '規模の把握には wc -l(行数カウント)。',
          check: { type: 'answer', any: ['21'] },
          hints: ['wc -l app.log', '出力の数値', 'INFO 20行 + ERROR 1行 = 21'],
          explain: 'wc -l は行数を数える。ログの規模把握やパイプでの件数集計に多用する。cat file | wc -l の形でも使える。',
        },
      ],
      review: { steps: ['head で書式を把握', 'tail で最新を確認', 'wc -l で規模を把握'], commands: [{ cmd: 'tail -n 1 app.log', meaning: '末尾1行' }, { cmd: 'wc -l app.log', meaning: '行数カウント' }], why: 'ログ調査は「全部読む」のではなく「必要な部分だけ切り出す」のが基本。head/tail/wcはその最小道具。', practice: 'tail -n 50 /var/log/syslog で直近を確認するのは日常運用の定番。', related: ['grep', 'パイプ'] },
      learned: ['head', 'tail', 'wc', 'log-basics'], solution: ['cd /var/log/app', 'tail -n 1 app.log', 'wc -l app.log'],
    },

    {
      id: 't-02-awk-fields',
      title: 'awkで列を切り出す',
      minutes: 11,
      objectives: ['awkでフィールドを抽出する', '条件でフィルタする'],
      prereq: ['t-01-view'],
      briefing: '構造化されたログ(列が決まっているログ)は、awk で特定の列だけを抜き出すと一気に読みやすくなる。',
      concepts: [{
        title: 'awk によるフィールド処理',
        why: 'ログの各行は空白や区切りで列に分かれている。欲しい列(IP, ステータス, URL…)だけを取り出したい。',
        problem: 'アクセスログから「ステータスコードの列」や「3行目」だけを見たい。',
        how: "awk '{print $N}' でN番目の列を表示($0は行全体)。-F で区切り文字を指定(-F:)。NR==N で行番号指定、/pattern/ でパターン一致行に絞れる。cut より柔軟。",
        example: "$ awk '{print $1, $3}' access.log   # 1列目と3列目",
        relation: 'awkでアクセスログから必要な列・行を抽出する。',
      }],
      env: {
        user: 'analyst', dirs: ['/var/log/web'],
        files: [{ path: '/var/log/web/access.log', owner: 'analyst', content: `10.0.0.1 GET /index 200
10.0.0.2 GET /login 200
10.0.0.1 POST /login 401
10.0.0.3 GET /admin 403
10.0.0.1 POST /login 401
10.0.0.2 GET /home 200
` }],
      },
      quick: ['cd /var/log/web', "awk '{print $1}' access.log", "awk '{print $4}' access.log", "awk '{print $1, $3}' access.log", "awk 'NR==3' access.log"],
      tasks: [
        {
          q: "access.log の4列目(ステータスコード)だけを awk で抽出します。最初の行のステータスコードを答えてください。",
          narration: "各行は空白区切り。awk '{print $4}' で4列目(ステータス)だけ取り出せる。",
          check: { type: 'answer', any: ['200'] },
          hints: ["awk '{print $4}' access.log", '出力の1行目', '200'],
          explain: "awk '{print $4}' は空白区切りの4列目を表示する。ステータスだけ抜き出せば、sort|uniq -c と組み合わせて「200が何件、401が何件」と集計できる。列指向ログ解析の基本。",
        },
        {
          q: "3行目のログを awk 'NR==3' で表示します。その行のHTTPメソッド(GET/POST)を答えてください。",
          narration: 'NR は行番号を表す組み込み変数。NR==3 で3行目だけに絞れる。',
          check: { type: 'answer', any: ['POST'], ci: true },
          hints: ["awk 'NR==3' access.log", '2列目(メソッド)を見る', '3行目は POST /login 401'],
          explain: 'awk の NR(Number of Record)は現在の行番号。NR==3 で特定行、NR>=10 で範囲指定もできる。sed -n 3p でも同様の抽出が可能。',
        },
        {
          q: "401(認証失敗)の行だけを抽出し、その件数を数えてください（awk で /401/ に絞って wc -l、またはgrep -c）。",
          narration: '条件で絞ってから数える。awk \'/401/\' か grep 401 で401の行だけにし、wc -l で数える。',
          check: { type: 'answer', any: ['2'] },
          hints: ["awk '/401/' access.log | wc -l", 'grep -c 401 access.log でも可', '401 は2行'],
          explain: 'パターン絞り込み(awk /401/ や grep 401)と件数カウント(wc -l や grep -c)を組み合わせた。10.0.0.1 が /login に401を2回＝総当たりの兆候(Stage1と同じ着眼)。道具を組み替えるだけで観点を変えられる。',
        },
      ],
      review: { steps: ["awk '{print $N}' で列抽出", "awk 'NR==N' で行指定", "awk '/pat/' でフィルタ", 'wc -l で集計'], commands: [{ cmd: "awk '{print $4}' access.log", meaning: 'ステータス列を抽出' }, { cmd: "awk '/401/' access.log | wc -l", meaning: '401行を数える' }], why: 'awkは列指向データの万能ナイフ。ログ解析・集計で最も使うツールの一つ。', practice: "awk '{print $1}' access.log | sort | uniq -c | sort -rn はアクセス元ランキングの定番。", related: ['cut', 'sort/uniq', 'grep'] },
      learned: ['awk', 'fields', 'nr', 'pattern-filter'], solution: ['cd /var/log/web', "awk '{print $4}' access.log", "awk 'NR==3' access.log", "awk '/401/' access.log | wc -l"],
    },

    {
      id: 't-03-cut-sort',
      title: 'cut と sort で集計する',
      minutes: 10,
      objectives: ['cut で区切り列を抜く', 'sort -k/-t で列ソートする'],
      prereq: ['t-02-awk-fields'],
      briefing: '/etc/passwd のような「:区切り」のデータは cut が得意。ユーザー一覧から必要な情報だけを取り出す。',
      concepts: [{
        title: 'cut と sort のオプション',
        why: 'CSVや :区切りのデータから、特定フィールドを取り出し、任意の列で並べたい。',
        problem: '/etc/passwd からユーザー名(1列目)やUID(3列目)だけ欲しい。UID順に並べたい。',
        how: 'cut -d: -f1 で「:区切りの1列目」。sort -t: -k3 -n で「:区切りの3列目を数値ソート」。cut は固定区切り、awk はより柔軟、と使い分ける。',
        example: '$ cut -d: -f1 /etc/passwd   # ユーザー名一覧',
        relation: 'cut でフィールド抽出、sort で列ソートを実践する。',
      }],
      env: { user: 'analyst', users: [{ name: 'alice' }, { name: 'bob' }, { name: 'carol' }] },
      quick: ['cut -d: -f1 /etc/passwd', 'cut -d: -f1,3 /etc/passwd', 'sort -t: -k3 -n /etc/passwd', 'cut -d: -f1 /etc/passwd | sort'],
      tasks: [
        {
          q: '/etc/passwd から1列目(ユーザー名)だけを cut で取り出します。先頭に来るユーザー名を答えてください。',
          narration: 'passwd は : 区切り。cut -d: -f1 で1列目のユーザー名だけ抜ける。',
          check: { type: 'answer', any: ['root'] },
          hints: ['cut -d: -f1 /etc/passwd', '-d で区切り文字、-f で列番号', '先頭(UID 0)は root'],
          explain: 'cut -d: -f1 で /etc/passwd の1列目=ユーザー名一覧が得られる。-f1,3 なら1列目と3列目(名前とUID)。固定区切りのデータ抽出は cut が簡潔。',
        },
        {
          q: 'UID(3列目)が最も大きい一般ユーザーの名前を答えてください（sort -t: -k3 -n で3列目を数値ソートし、末尾を見る）。',
          narration: '列でソートするには sort の -t(区切り)と -k(キー列)と -n(数値)を組み合わせる。',
          check: { type: 'answer', any: ['carol'] },
          answerHint: 'ユーザー名',
          hints: ['sort -t: -k3 -n /etc/passwd で UID 順', '末尾(最大UID)を tail -n 1 で見る', '最後に作られた carol が最大UID'],
          explain: 'sort -t: -k3 -n は「:区切りの3列目(UID)を数値として昇順」。末尾が最大UID。一般ユーザーは通常UID 1000以降に作られるので、末尾が最後に追加されたユーザー。cut -d: -f1,3 | sort -t: -k2 -n と組み合わせても良い。',
        },
      ],
      review: { steps: ['cut -d SEP -f N で列抽出', 'sort -t SEP -k N -n で列ソート', 'tail/head で端を見る'], commands: [{ cmd: 'cut -d: -f1 /etc/passwd', meaning: ':区切り1列目=ユーザー名' }, { cmd: 'sort -t: -k3 -n /etc/passwd', meaning: 'UID(3列目)で数値ソート' }], why: '構造化テキストの抽出・整列は調査の基礎動作。passwdやCSVの解析で日常的に使う。', practice: 'cut -d: -f1,7 /etc/passwd でログインシェルを確認し、不審なシェルのアカウントを洗う、など。', related: ['awk', 'uniq', 'grep'] },
      learned: ['cut', 'sort-key', 'delimiter', 'passwd-analysis'], solution: ['cut -d: -f1 /etc/passwd', 'sort -t: -k3 -n /etc/passwd'],
    },

    {
      id: 't-04-sed-tr',
      title: 'sedとtrで置換・変換',
      minutes: 11,
      objectives: ['sed で文字列置換する', 'tr で文字集合を変換する'],
      prereq: ['t-02-awk-fields'],
      briefing: 'ログの整形やデータのクレンジングでは、文字列の置換(sed)や文字種の変換(tr)が役立つ。設定ファイルの一括修正にも使う。',
      concepts: [{
        title: 'sed(置換)と tr(文字変換)',
        why: 'テキストの一括置換・整形を手作業なしで行いたい。設定変更の自動化にも不可欠。',
        problem: 'ログ中の文字列を置き換えたい。大文字を小文字に揃えたい。余分な空白を潰したい。',
        how: "sed 's/old/new/g' で行内の全置換(g無しは各行最初の1回)。sed -i でファイルを直接書き換え。tr 'a-z' 'A-Z' で文字集合の変換、tr -d で削除、tr -s で連続文字の圧縮。",
        example: "$ echo 'HELLO' | tr 'A-Z' 'a-z'\nhello",
        relation: 'sed で置換、tr で変換を実践し、設定ファイルも修正する。',
      }],
      env: {
        user: 'analyst', sudo: false, dirs: ['/home/analyst/work'],
        files: [
          { path: '/home/analyst/work/config.ini', owner: 'analyst', content: 'debug=true\nloglevel=verbose\nhost=localhost\n' },
          { path: '/home/analyst/work/names.txt', owner: 'analyst', content: 'Alice\nBOB\nCarol\n' },
        ],
      },
      quick: ['cd /home/analyst/work', "sed 's/true/false/' config.ini", "cat names.txt | tr 'A-Z' 'a-z'", "sed -i 's/debug=true/debug=false/' config.ini", 'cat config.ini'],
      tasks: [
        {
          q: "config.ini の debug=true を debug=false に sed -i で書き換えてください（本番化のためデバッグを無効にする）。",
          narration: "sed 's/A/B/' で置換、-i を付けるとファイルを直接書き換える。設定の一括変更の定番。",
          check: { type: 'state', path: '/home/analyst/work/config.ini', contains: 'debug=false', notContains: 'debug=true' },
          noInput: true,
          hints: ["sed -i 's/debug=true/debug=false/' config.ini", '-i でファイルを直接編集', 'cat config.ini で確認'],
          explain: "sed -i 's/debug=true/debug=false/' でファイルを直接書き換えた。設定の一括変更やデプロイ自動化で多用する。-i は破壊的なので、重要ファイルは事前にバックアップ(cp)するのが安全。",
        },
        {
          q: "names.txt の全行を小文字に変換した結果、2行目は何になりますか（tr 'A-Z' 'a-z' を使う）。",
          narration: "tr は文字集合を1対1で変換する。'A-Z' を 'a-z' に対応させれば小文字化。",
          check: { type: 'answer', any: ['bob'], ci: true },
          hints: ["cat names.txt | tr 'A-Z' 'a-z'", '2行目 BOB が変換される', 'bob'],
          explain: "tr 'A-Z' 'a-z' は大文字→小文字変換。BOB → bob に。tr -d '0-9' で数字削除、tr -s ' ' で連続空白を1つに圧縮、など整形に便利。sed と違い行ではなく文字単位で動く。",
        },
      ],
      review: { steps: ["sed 's/old/new/' で置換", 'sed -i でファイル直接編集', "tr で文字種変換"], commands: [{ cmd: "sed -i 's/debug=true/debug=false/' config.ini", meaning: '設定を直接書き換え' }, { cmd: "tr 'A-Z' 'a-z'", meaning: '大文字を小文字に変換' }], why: 'テキスト整形・設定変更の自動化は運用の基本スキル。手作業を減らしミスを防ぐ。', practice: "設定テンプレートを sed で環境ごとに書き換える、ログを tr で正規化してから集計する、など。", related: ['awk', 'grep', 'シェルスクリプト'] },
      learned: ['sed', 'tr', 'in-place-edit', 'text-transform'], solution: ['cd /home/analyst/work', "sed -i 's/debug=true/debug=false/' config.ini", "cat names.txt | tr 'A-Z' 'a-z'"],
    },
  ],
};
