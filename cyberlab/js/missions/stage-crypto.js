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

    {
      id: 'c-04-rot',
      title: '古典暗号とrot13',
      minutes: 9,
      objectives: ['換字式暗号の仕組みを理解する', 'tr でrot13を復号する'],
      prereq: ['c-01-base64'],
      briefing: 'CTFやマルウェアで時々見かける rot13。文字を13個ずらすだけの古典暗号で、tr で簡単に復号できる。暗号の「鍵と変換」の最も素朴な形だ。',
      concepts: [{
        title: '換字式暗号(rot13/シーザー暗号)',
        why: '最も単純な暗号で、換字(文字の置き換え)という暗号の基本操作を理解できる。難読化によく使われる。',
        problem: 'アルファベットを一定数ずらしただけの文字列を元に戻したい。',
        how: 'シーザー暗号は各文字を一定数ずらす。rot13 は13ずらす方式で、2回かけると元に戻る(対称)。tr \'A-Za-z\' \'N-ZA-Mn-za-m\' で復号できる。鍵空間が狭く容易に解けるため、暗号としては弱く「難読化」の域を出ない。',
        example: "$ echo 'Uryyb' | tr 'A-Za-z' 'N-ZA-Mn-za-m'\nHello",
        relation: 'tr で rot13 を復号し、換字暗号の弱さを体感する。',
      }],
      env: {
        user: 'analyst', dirs: ['/home/analyst/ctf'],
        files: [{ path: '/home/analyst/ctf/note.rot13', owner: 'analyst', content: 'SYNT{ebg13_vf_abg_pelcgb_8h2x}\n' }],
      },
      quick: ['cd /home/analyst/ctf', 'cat note.rot13', "cat note.rot13 | tr 'A-Za-z' 'N-ZA-Mn-za-m'"],
      tasks: [
        {
          q: 'ctf/note.rot13 は rot13 で変換されています。tr で復号し、現れるフラグ FLAG{...} の中身を答えてください。',
          narration: "tr 'A-Za-z' 'N-ZA-Mn-za-m' で各文字を13ずらし戻す。SYNT が FLAG に戻るはず。",
          check: { type: 'answer', any: ['rot13_is_not_crypto_8u2k'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ["cat note.rot13 | tr 'A-Za-z' 'N-ZA-Mn-za-m'", 'SYNT{...} が FLAG{...} に戻る', 'FLAG{rot13_is_not_crypto_8u2k}'],
          explain: "tr の文字範囲マッピングで rot13 を復号。SYNT→FLAG と戻った。rot13 は鍵が固定で誰でも戻せる＝暗号ではなく難読化。マルウェアが検知回避に使うこともあるが、解読は一瞬。base64 同様「可逆で鍵なし=秘匿性なし」の典型例。",
        },
      ],
      review: { steps: ["tr 'A-Za-z' 'N-ZA-Mn-za-m' で13ずらす", 'SYNT→FLAGを確認', '換字暗号の弱さを理解'], commands: [{ cmd: "cat note.rot13 | tr 'A-Za-z' 'N-ZA-Mn-za-m'", meaning: 'rot13を復号' }], why: '古典暗号は現代では使えないが、換字という基本操作と「鍵が弱い暗号の危うさ」を学べる。', practice: 'CTFの古典暗号問、マルウェアの簡易難読化の解除。', related: ['base64', 'エンコード', '暗号の強度'] },
      learned: ['rot13', 'caesar-cipher', 'substitution', 'tr-mapping'], solution: ['cd /home/analyst/ctf', "cat note.rot13 | tr 'A-Za-z' 'N-ZA-Mn-za-m'"],
    },

    {
      id: 'c-05-strings-hunt',
      title: 'バイナリから文字列を拾う',
      minutes: 9,
      objectives: ['ファイル種別を見分ける', 'grep で可読文字列から秘密を探す'],
      prereq: ['c-01-base64'],
      briefing: '一見読めないデータファイルにも、設定文字列やURL、埋め込まれた秘密が紛れていることがある。file で種別を確かめ、可読部分を拾い出す。',
      concepts: [{
        title: 'ファイル種別と埋め込み文字列',
        why: 'マルウェアや設定の入ったファイルには、C2 URL・パスワード・フラグなどの可読文字列が埋め込まれていることが多い。',
        problem: 'テキストかデータか分からないファイルから、意味のある文字列だけ拾いたい。',
        how: 'file で種別を判定(ASCII text / data / ELF等)。可読文字列は grep で特定パターン(http/flag/key)を拾う。実機では strings コマンドで印字可能文字の連続を抽出する。',
        example: '$ file blob.dat\n$ grep -aoE "https?://[^ ]+" blob.dat',
        relation: 'file で種別を見て、grep で埋め込まれたURLやフラグを探す。',
      }],
      env: {
        user: 'analyst', dirs: ['/home/analyst/sample'],
        files: [
          { path: '/home/analyst/sample/dropper.dat', owner: 'analyst', content: '\u0001\u0002binary\u0000garbage\u0003 config: c2=http://evil.example/gate flag=FLAG{strings_in_binary_3a9f} \u0000\u0004more\u0005' },
          { path: '/home/analyst/sample/readme.txt', owner: 'analyst', content: 'ただのテキストです。\n' },
        ],
      },
      quick: ['cd /home/analyst/sample', 'file dropper.dat', 'file readme.txt', 'grep -ao "FLAG{[^}]*}" dropper.dat', 'grep -aoE "http://[^ ]+" dropper.dat'],
      tasks: [
        {
          q: 'file コマンドで dropper.dat の種別を調べます。テキスト(ASCII text)ですか、それともバイナリ等のデータ(data)ですか。text か data で答えてください。',
          narration: 'file はファイルの中身から種別を推定する。制御文字を含むと data と判定される。',
          check: { type: 'answer', any: ['data'], ci: true },
          hints: ['file dropper.dat を実行', '制御文字を含むと "data" と判定', 'dropper.dat は data'],
          explain: 'file は拡張子でなく中身で種別を判定する。dropper.dat は制御文字を含むため data。拡張子を偽装したマルウェア(.jpg に見せかけた実行ファイル等)を file で見破れる。種別確認は解析の第一歩。',
        },
        {
          q: 'バイナリ風の dropper.dat に埋め込まれたフラグ FLAG{...} を grep で拾い出し、中身を答えてください。',
          narration: 'grep -a はバイナリも対象に検索する。grep -ao "FLAG{[^}]*}" で埋め込まれたフラグだけを抜ける。',
          check: { type: 'answer', any: ['strings_in_binary_3a9f'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ['grep -ao "FLAG{[^}]*}" dropper.dat', '-a はバイナリも検索、-o は一致部分のみ', 'FLAG{strings_in_binary_3a9f}'],
          explain: 'grep -a(バイナリも検索)と -o(一致部分のみ)で、データに埋もれたフラグとC2 URL(http://evil.example/gate)を抽出できた。マルウェア解析では、実行せずとも埋め込み文字列からC2・パスワード・機能の手がかりが得られる(静的解析)。実機の strings コマンドも同じ目的で使う。',
        },
      ],
      review: { steps: ['file で種別判定', 'grep -a でバイナリも検索', 'grep -o で一致部分抽出', 'URL/フラグ/秘密を拾う'], commands: [{ cmd: 'file dropper.dat', meaning: 'ファイル種別の判定' }, { cmd: 'grep -ao "FLAG{[^}]*}" dropper.dat', meaning: '埋め込み文字列の抽出' }], why: '埋め込み文字列の抽出はマルウェア静的解析の基本。実行せず安全に手がかりを得られる。', practice: 'strings/grep -a でのマルウェア解析、拡張子偽装の検出、設定の抽出。', related: ['file', 'grep', 'マルウェア解析'] },
      learned: ['file-type', 'strings', 'grep-binary', 'static-analysis'], solution: ['cd /home/analyst/sample', 'file dropper.dat', 'grep -ao "FLAG{[^}]*}" dropper.dat'],
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
