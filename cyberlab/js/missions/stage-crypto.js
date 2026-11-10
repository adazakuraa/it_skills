// 暗号・エンコーディングの実技
export const stageCrypto = {
  id: 'crypto-lab',
  title: 'Crypto — エンコードとハッシュ',
  subtitle: 'base64・ハッシュ・パスワード保護を手を動かして理解する',
  intro: 'エンコードと暗号・ハッシュは混同されがち。手を動かして「可逆/不可逆」「秘匿/変換」の違いを体で覚える。',
  missions: [
    {
      id: 'c-01-base64',
      title: 'base64は暗号ではない',
      minutes: 9,
      objectives: ['base64エンコード/デコードを行う', 'エンコードと暗号化の違いを理解する'],
      prereq: [],
      briefing: 'マルウェアやトークンでよく見かける base64。これは「暗号」ではなく、バイナリを文字に変換するだけの「エンコード」。鍵なしで誰でも元に戻せる。',
      concepts: [{
        title: 'base64エンコーディング',
        why: 'バイナリデータをテキストしか通らない経路(メール/URL/JSON)で運ぶために、64種類の文字へ変換する。',
        problem: 'エンコードされた文字列を見て「暗号化されている」と誤解しがち。実は誰でも復号できる。',
        how: 'base64 でエンコード、base64 -d でデコード。鍵は不要＝秘匿性はゼロ。難読化(見えにくくする)にはなるが暗号化(鍵がないと読めない)ではない。攻撃者はペイロードをbase64で隠すことが多い。',
        example: '$ echo "hello" | base64\naGVsbG8K\n$ echo "aGVsbG8K" | base64 -d\nhello',
        relation: 'base64された文字列をデコードして、隠された内容を読む。',
      }],
      env: {
        user: 'analyst', dirs: ['/home/analyst/case'],
        files: [{ path: '/home/analyst/case/payload.txt', owner: 'analyst', content: 'ZWF0LXRoZS1mbGFnLTdhOWM=\n' }],
      },
      quick: ['cd /home/analyst/case', 'cat payload.txt', 'cat payload.txt | base64 -d', 'echo "hello" | base64'],
      tasks: [
        {
          q: 'case/payload.txt にはbase64エンコードされた文字列が入っています。デコードして、元の文字列を答えてください。',
          narration: 'base64 -d でデコードする。鍵は要らない——これがエンコードが暗号でない証拠。',
          check: { type: 'answer', any: ['eat-the-flag-7a9c'], ci: true },
          answerHint: 'デコード結果',
          hints: ['cat payload.txt | base64 -d', 'base64 -d でデコード', 'eat-the-flag-7a9c'],
          explain: 'base64 -d で誰でも復号できた。base64は可逆変換で秘匿性がない。マルウェア解析ではbase64された文字列を見たらまずデコードして中身を確認する。「base64 = 暗号化」という誤解は危険。',
        },
        {
          q: 'base64は「暗号化」か「エンコード(変換)」か。正しい方を答えてください（暗号化 または エンコード）。',
          narration: '概念を言葉で確定させる。鍵の有無がポイント。',
          check: { type: 'answer', any: ['エンコード', 'encode', 'エンコーディング'], ci: true },
          hints: ['鍵がなくても元に戻せた', '秘匿性があるかどうか', 'エンコード(変換)であり暗号化ではない'],
          explain: 'base64はエンコード(可逆変換)。暗号化は鍵がなければ復元できないが、base64は誰でもデコードできる。秘密を守りたいなら暗号化を使う。エンコードは「運搬・難読化」、暗号化は「秘匿」と目的が違う。',
        },
      ],
      review: { steps: ['base64 -d でデコード', '中身を確認', 'エンコードと暗号化を区別'], commands: [{ cmd: 'cat payload.txt | base64 -d', meaning: 'base64デコード' }, { cmd: 'echo text | base64', meaning: 'base64エンコード' }], why: 'エンコードと暗号化の混同は実務の誤判断に直結する。可逆/不可逆・鍵の有無で正しく区別する。', practice: 'マルウェアのペイロード解析、JWTやdataURIの読解、など。', related: ['ハッシュ', '暗号化', 'マルウェア解析'] },
      learned: ['base64', 'encoding-vs-encryption', 'payload-decode'], solution: ['cd /home/analyst/case', 'cat payload.txt | base64 -d'],
    },

    {
      id: 'c-02-hash-id',
      title: 'ハッシュを計算して照合する',
      minutes: 10,
      objectives: ['各種ハッシュを計算する', '既知の正解と照合して本人性/完全性を確認する'],
      prereq: ['c-01-base64'],
      briefing: 'ファイルの同一性確認や、パスワードの保存にハッシュが使われる。計算して照合する一連を実践する。',
      concepts: [{
        title: 'ハッシュの計算と照合',
        why: '同じ入力は必ず同じハッシュになる性質を使い、改ざん検知やパスワード照合を行う。',
        problem: '2つのファイルが同一か、入力したパスワードが正しいかを、元データを比較せず確かめたい。',
        how: 'md5sum / sha1sum / sha256sum でハッシュを計算。配布物の照合はSHA-256が主流(MD5/SHA1は衝突が見つかり非推奨)。パスワードは「平文を保存せず、ハッシュを保存して照合」する。',
        example: '$ echo -n "password123" | sha256sum',
        relation: '複数ファイルのハッシュを計算し、同一性を照合する。',
      }],
      env: {
        user: 'analyst', dirs: ['/home/analyst/verify'],
        files: [
          { path: '/home/analyst/verify/a.bin', owner: 'analyst', content: 'acme-agent-v2.1-release\n' },
          { path: '/home/analyst/verify/b.bin', owner: 'analyst', content: 'acme-agent-v2.1-release\n' },
          { path: '/home/analyst/verify/c.bin', owner: 'analyst', content: 'acme-agent-v2.1-release-TAMPERED\n' },
        ],
      },
      quick: ['cd /home/analyst/verify', 'sha256sum a.bin', 'sha256sum a.bin b.bin c.bin', 'md5sum a.bin'],
      tasks: [
        {
          q: 'a.bin, b.bin, c.bin のSHA256を計算します。a.bin と「同じ」内容なのはどちらですか（b または c）。',
          narration: '3ファイルのハッシュを一度に計算して見比べる。同じ内容なら同じハッシュになる。',
          check: { type: 'answer', any: ['b'], ci: true },
          hints: ['sha256sum a.bin b.bin c.bin', 'a と同じハッシュ値のものを探す', 'b.bin が一致(c.binはTAMPEREDで別物)'],
          explain: 'a と b は同一内容なのでハッシュが一致、c は改ざんされており不一致。ハッシュ照合は「元データを比較せず同一性を判定」できる。大きなファイルや配布物の検証で威力を発揮する。',
        },
        mcq2('配布ファイルの完全性検証に現在推奨されるハッシュはどれか。',
          ['MD5', 'SHA-1', 'SHA-256', 'CRC32'], 3,
          'SHA-256が主流。MD5とSHA-1は衝突(異なる入力で同じ値)が現実的に作れてしまい、改ざん検証には非推奨。CRC32は誤り検出用でセキュリティ用途ではない。強い衝突耐性を持つSHA-2系/SHA-3系を使う。'),
      ],
      review: { steps: ['sha256sum で計算', '複数ファイルをまとめて計算', '値を照合して同一性判定'], commands: [{ cmd: 'sha256sum a.bin b.bin c.bin', meaning: '複数ファイルのハッシュ比較' }], why: '完全性検証はセキュリティの基本動作。配布物・証拠・パスワードの扱いで日常的に使う。', practice: 'ISOやツール配布物のSHA256照合、フォレンジックでの証拠ハッシュ保全、など。', related: ['デジタル署名', 'パスワード保護', 'フォレンジック'] },
      learned: ['sha256sum', 'hash-compare', 'md5-weakness'], solution: ['cd /home/analyst/verify', 'sha256sum a.bin b.bin c.bin'],
    },

    {
      id: 'c-03-passwd-hash',
      title: 'パスワードはなぜハッシュで保存するか',
      minutes: 10,
      objectives: ['/etc/shadow の意味を理解する', 'ハッシュ保存とソルトの役割を知る'],
      prereq: ['c-02-hash-id'],
      briefing: 'パスワードを平文でDBに保存するのは最悪の設計。漏洩時に全員が即アウトだ。だからハッシュ化して保存する。/etc/shadow を題材にその仕組みを見る。',
      concepts: [{
        title: 'パスワードのハッシュ保存とソルト',
        why: 'DBが漏洩しても元のパスワードを復元されないようにするため。一方向のハッシュで保存する。',
        problem: '平文保存は漏洩=全アウト。単純ハッシュも「レインボーテーブル」で逆引きされる。',
        how: 'ログイン時は入力をハッシュ化して保存値と照合(平文は保存しない)。さらにユーザーごとに異なるソルト(ランダム値)を足してからハッシュ化すると、同じパスワードでも違うハッシュになり、事前計算攻撃を無効化できる。/etc/shadow の $6$ はSHA-512、$ で挟まれた部分がソルト。',
        example: '/etc/shadow: alice:$6$XsaltX$hashhash...:19500:...',
        relation: '/etc/shadow を読み、ハッシュ方式とソルトの位置を理解する。',
      }],
      env: {
        user: 'analyst', sudo: true,
        env: {},
        files: [{ path: '/etc/shadow', owner: 'root', group: 'root', mode: 0o640, content: 'root:$6$Hx7kQ$9aZ...rootHASH:19500:0:99999:7:::\nalice:$6$Ab3dE$k2Lm...aliceHASH:19600:0:99999:7:::\nbob:$1$oldmd5$abcdefgHASH:19400:0:99999:7:::\n' }],
      },
      quick: ['sudo cat /etc/shadow', 'sudo cut -d: -f1,2 /etc/shadow', 'cat /etc/passwd'],
      tasks: [
        {
          q: '/etc/shadow は一般ユーザーには読めません(mode 640, root所有)。なぜ権限を厳しくするのか——この厳格な権限が守っている情報は何か、一言で答えてください（ヒント: パスワードの…）。',
          narration: 'まず /etc/shadow の権限を ls -l /etc/shadow で確認する。なぜ /etc/passwd(644)と違い厳しいのかを考える。',
          check: { type: 'answer', any: ['ハッシュ', 'パスワードハッシュ', 'hash', 'パスワード'], ci: true },
          answerHint: '守っている情報',
          hints: ['ls -l /etc/shadow で権限を見る(640, root)', 'passwd と違い一般ユーザーは読めない', '守っているのはパスワードのハッシュ'],
          explain: '/etc/shadow はパスワードハッシュを格納するため root のみ読める(640)。もし誰でも読めれば、ハッシュをオフラインで総当たりされてしまう。/etc/passwd(公開情報)とshadow(秘匿情報)を分離する設計自体が防御。',
        },
        {
          q: 'sudo で /etc/shadow を読むと、各ユーザーのハッシュ方式が $数字$ で示されます。bob のハッシュは古い弱い方式($1$=MD5)です。alice と root が使っている、より強い方式を示す番号は $何$ ですか（数字のみ）。',
          narration: 'システム変更ではないが閲覧に sudo が要る。$1$=MD5(弱), $6$=SHA-512(強)。方式を読み分ける。',
          check: { type: 'answer', any: ['6'] },
          hints: ['sudo cat /etc/shadow', 'alice/root のハッシュ先頭の $数字$ を見る', '$6$ = SHA-512(bobの$1$=MD5は弱い)'],
          explain: '$1$=MD5(非推奨), $5$=SHA-256, $6$=SHA-512, $y$=yescrypt等。bobの$1$は時代遅れで危険、alice/rootの$6$は強い。$ で挟まれた次の部分がソルトで、同じパスワードでもユーザーごとに異なるハッシュになる。弱い方式のアカウントはパスワード再設定で更新させる。',
        },
      ],
      review: { steps: ['ls -l で shadow の厳格な権限を確認', 'sudo で中身を閲覧', '$N$ でハッシュ方式を読み分け', 'ソルトの役割を理解'], commands: [{ cmd: 'ls -l /etc/shadow', meaning: '権限(640 root)を確認' }, { cmd: 'sudo cat /etc/shadow', meaning: 'ハッシュ方式を確認' }], why: '認証情報の保護設計(ハッシュ・ソルト・権限分離)はあらゆるシステムの土台。弱い方式の検出は監査の実務。', practice: 'パスワードポリシー策定、弱いハッシュ方式の棚卸し、漏洩DBのリスク評価、など。', related: ['ハッシュ', 'レインボーテーブル', '最小権限'] },
      learned: ['etc-shadow', 'password-hashing', 'salt', 'hash-algorithms'], solution: ['ls -l /etc/shadow', 'sudo cat /etc/shadow'],
    },
  ],
};

// 選択肢ヘルパー（このファイル内専用。_shared の mcq と同等）
function mcq2(question, choices, answerNum, explain) {
  return {
    q: `${question}\n${choices.map((c, i) => `${i + 1}) ${c}`).join('  ')}`,
    check: { type: 'answer', any: [String(answerNum)] },
    answerHint: '番号で回答',
    hints: ['各選択肢を吟味する', '消去法で絞る', `正解は ${answerNum} 番`],
    explain,
  };
}
