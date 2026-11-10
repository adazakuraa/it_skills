// ネットワーク調査 II（バナー・DNS列挙・経路・バージョン評価・FW）
const web = (routes) => ({ routes, notFound: { body: '404', status: 404 } });

export const stageNetAdv = {
  id: 'net-adv',
  title: 'Net II — 深掘り偵察',
  subtitle: 'バナーグラビング・DNS列挙・経路解析・バージョン評価・FW読解',
  intro: '開いているポートを見つけた先に、「何が・どのバージョンで動くか」まで踏み込む。深い偵察が、的確な攻撃と防御を生む。',
  missions: [
    {
      id: 'na-01-banner',
      title: 'バナーグラビング',
      minutes: 10,
      objectives: ['nc/nmapでサービスバナーを取得する', 'バナーからソフトを特定する'],
      prereq: [],
      briefing: 'ポートが開いているだけでは不十分。接続して返ってくる「バナー」から、動いているソフトとバージョンを突き止める。これがバナーグラビングだ。',
      concepts: [{
        title: 'バナーグラビング',
        why: 'サービスは接続時に自己紹介(バナー)を返すことが多い。そこからソフト名・バージョンが分かり、既知脆弱性の調査に繋がる。',
        problem: '22番が開いているが、SSHの実装は何で、バージョンはいくつか？を知りたい。',
        how: 'nc ホスト ポート で接続するとバナーが返る。nmap -sV はこれを自動化しバージョンを推定する。得たバージョンをCVEデータベースと照合する。',
        example: '$ nc files.lab 22\nSSH-2.0-OpenSSH_7.4',
        relation: 'nc と nmap -sV でバナーを取得し、ソフトを特定する。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: { 'files.lab': '10.10.14.30' }, hosts: { '10.10.14.30': { ports: [
          { port: 21, proto: 'tcp', state: 'open', service: 'ftp', banner: 'vsftpd 2.3.4' },
          { port: 22, proto: 'tcp', state: 'open', service: 'ssh', banner: 'SSH-2.0-OpenSSH_7.4' },
          { port: 25, proto: 'tcp', state: 'open', service: 'smtp', banner: '220 mail.acme ESMTP Postfix' },
        ] } } },
      },
      quick: ['nmap -sV files.lab', 'nc files.lab 22', 'nc files.lab 21', 'nc files.lab 25'],
      tasks: [
        {
          q: 'files.lab の22番(SSH)に nc で接続し、返ってきたバナーからSSH実装のバージョンを答えてください（例: OpenSSH_7.4 の 7.4 部分）。',
          narration: 'nc ホスト ポート で生のバナーが見える。SSHは接続時に SSH-2.0-OpenSSH_x.y を返す。',
          check: { type: 'answer', any: ['7.4', 'OpenSSH_7.4', 'OpenSSH 7.4'], ci: true },
          answerHint: 'バージョン番号',
          hints: ['nc files.lab 22', 'SSH-2.0-OpenSSH_7.4 が返る', '7.4'],
          explain: 'nc で取得したバナー SSH-2.0-OpenSSH_7.4 からバージョンが判明。バージョンが分かれば、その版の既知CVEを調べて攻撃可否を評価できる(攻撃側)、あるいは古い版を更新する(防御側)。nmap -sV は多数のサービスを一括でバナー取得する。',
        },
        {
          q: 'nmap -sV で全サービスのバージョンを取得します。21番で動いているFTPソフトは、バックドアが仕込まれた版として悪名高い「vsftpd」の、あるバージョンです。そのバージョン番号を答えてください。',
          narration: 'nmap -sV はバナーからバージョンを推定する。21番のFTPソフト名とバージョンに注目(有名なバックドア入り版がある)。',
          check: { type: 'answer', any: ['2.3.4'] },
          answerHint: 'x.y.z',
          hints: ['nmap -sV files.lab', '21/tcp の VERSION 列を見る', 'vsftpd 2.3.4(バックドア入りで有名な版)'],
          explain: 'vsftpd 2.3.4 は、配布物にバックドアが混入した事件で有名な版(接続時に特定の入力で6200番にシェルが開く)。バナー/バージョンの特定が、既知の深刻な脆弱性の発見に直結する好例。防御側はこうした既知の危険な版を即座に更新・隔離する。',
        },
      ],
      review: { steps: ['nc でバナー取得', 'nmap -sV でバージョン一括推定', 'バージョンをCVEと照合'], commands: [{ cmd: 'nc files.lab 22', meaning: 'SSHバナーを取得' }, { cmd: 'nmap -sV files.lab', meaning: '全サービスのバージョン推定' }], why: 'バージョン特定は脆弱性評価の入口。攻撃側は既知CVEを狙い、防御側は古い版を更新する。', practice: 'サービスの棚卸しとバージョン管理、EOLソフトの検出、既知脆弱版の隔離。', related: ['CVE/CVSS', 'ポートスキャン', '脆弱性管理'] },
      learned: ['banner-grabbing', 'nc', 'nmap-sV', 'version-detection'], solution: ['nc files.lab 22', 'nmap -sV files.lab'],
    },

    {
      id: 'na-02-dns-enum',
      title: 'DNS列挙と逆引き',
      minutes: 10,
      objectives: ['複数のサブドメインを列挙する', '逆引きでIPから名前を得る'],
      prereq: ['na-01-banner'],
      briefing: '対象組織の攻撃面は、サブドメインの数だけ広がる。DNSを引いて、どんなホストが存在するかを地図化する。',
      concepts: [{
        title: 'DNS列挙(サブドメイン探索)',
        why: '組織は web/mail/vpn/dev など多数のサブドメインを持つ。列挙すると攻撃面(ホスト)の全体像が見える。',
        problem: '対象ドメイン配下にどんなホストがあり、それぞれどのIPかを把握したい。',
        how: '既知のサブドメイン候補(www, mail, dev, admin, vpn...)を dig/host で引いて存在を確認(ブルートフォース列挙)。逆引き(host IP)でIPから名前を得る。内部では /etc/hosts も情報源。',
        example: '$ for s in www mail dev; do dig +short $s.acme.lab; done   # (概念)',
        relation: 'dig/host で複数ホストを解決し、逆引きも行う。',
      }],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: { self: '10.10.14.7', dns: {
          'www.acme.lab': '10.10.14.50', 'mail.acme.lab': '10.10.14.25',
          'dev.acme.lab': '10.10.14.60', 'vpn.acme.lab': '10.10.14.5',
        } },
      },
      quick: ['dig +short www.acme.lab', 'dig +short dev.acme.lab', 'host mail.acme.lab', 'host 10.10.14.60', 'nslookup vpn.acme.lab'],
      tasks: [
        {
          q: '開発用サーバーらしき dev.acme.lab のIPアドレスを解決して答えてください。',
          narration: 'サブドメイン名は役割を示唆する(dev=開発)。開発環境は本番より手薄なことが多く狙われやすい。',
          check: { type: 'answer', any: ['10.10.14.60'], normalizeIp: true },
          hints: ['dig +short dev.acme.lab', 'host dev.acme.lab でも可', '10.10.14.60'],
          explain: 'dev.acme.lab = 10.10.14.60。開発/ステージング環境はセキュリティが緩いことが多く、攻撃者の格好の標的。DNS列挙でこうした「手薄なホスト」を見つけるのが偵察の狙い。防御側は不要なサブドメイン公開を避ける。',
        },
        {
          q: 'IPアドレス 10.10.14.60 を逆引きして、対応するホスト名を answer に入れてください（host コマンドを使う）。',
          narration: 'host IP で逆引き(PTR)——IPから名前を得られる。正引きと逆引きを突き合わせると構成把握が進む。',
          check: { type: 'answer', any: ['dev.acme.lab'], ci: true },
          answerHint: 'ホスト名',
          hints: ['host 10.10.14.60', 'IP→名前の逆引き', 'dev.acme.lab が返る'],
          explain: 'host 10.10.14.60 で逆引きし dev.acme.lab を確認。正引き(名前→IP)と逆引き(IP→名前)を組み合わせると、スキャンで見つけたIPの正体が分かる。ネットワーク全体の地図化に有効。',
        },
      ],
      review: { steps: ['サブドメイン候補を dig で確認', '役割を名前から推測', 'host で逆引き', '攻撃面を地図化'], commands: [{ cmd: 'dig +short dev.acme.lab', meaning: 'サブドメインのIP解決' }, { cmd: 'host 10.10.14.60', meaning: 'IPの逆引き' }], why: 'DNS列挙は攻撃面の全体把握に不可欠。手薄なホスト(dev/staging)の発見に繋がる。', practice: 'サブドメイン列挙(amass/gobuster)、逆引き調査、公開DNSの棚卸し。', related: ['DNS', '偵察', 'アタックサーフェス'] },
      learned: ['dns-enumeration', 'subdomain', 'reverse-dns', 'attack-surface-mapping'], solution: ['dig +short dev.acme.lab', 'host 10.10.14.60'],
    },

    {
      id: 'na-03-firewall-read',
      title: 'ファイアウォールのルールを読む',
      minutes: 11,
      objectives: ['iptables形式のルールを読む', '許可/拒否のポリシーを理解する'],
      prereq: ['na-01-banner'],
      briefing: 'サーバーのファイアウォール設定(iptablesルール)を渡された。どのポートが外部に開いていて、何が拒否されているか——設定を読んで攻撃面を評価する。',
      concepts: [{
        title: 'iptables ルールの読み方',
        why: 'ファイアウォールのルールを読めれば、実際に外部からどのサービスに到達できるか(=攻撃面)を正確に評価できる。',
        problem: '設定ファイルの許可(ACCEPT)/拒否(DROP)から、開いているポートと既定ポリシーを把握したい。',
        how: '各ルールは「チェーン ターゲット プロトコル 条件」。-A INPUT ... --dport 22 -j ACCEPT は「22番への入力を許可」。既定ポリシー(policy DROP)が拒否なら、明示的にACCEPTされたものだけ通る(デフォルト拒否=安全)。',
        example: '-A INPUT -p tcp --dport 443 -j ACCEPT   # 443を許可',
        relation: 'ルールファイルを読み、外部に開いているポートを特定する。',
      }],
      env: {
        hostname: 'srv-fw', user: 'analyst',
        files: [{ path: '/etc/iptables/rules.v4', owner: 'root', mode: 0o644, content:
`# Acme firewall policy
*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]
-A INPUT -i lo -j ACCEPT
-A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 22 -s 10.10.14.0/24 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 3306 -j DROP
COMMIT
` }],
      },
      quick: ['cat /etc/iptables/rules.v4', 'grep ACCEPT /etc/iptables/rules.v4', 'grep dport /etc/iptables/rules.v4', 'grep -i policy /etc/iptables/rules.v4'],
      tasks: [
        {
          q: 'INPUTチェーンの既定ポリシー(:INPUT の行)は ACCEPT と DROP のどちらですか。',
          narration: 'まず既定ポリシーを確認する。:INPUT DROP なら「明示的に許可されたもの以外は拒否」=デフォルト拒否で安全。',
          check: { type: 'answer', any: ['DROP'], ci: true },
          hints: ['cat /etc/iptables/rules.v4', ':INPUT の後ろを見る', ':INPUT DROP = デフォルト拒否'],
          explain: ':INPUT DROP は「デフォルト拒否」——明示的にACCEPTされた通信以外はすべて遮断。これはファイアウォール設計の理想形(Sec基礎で学んだホワイトリスト方式)。あとはACCEPT行だけを見れば「何が開いているか」が完全に分かる。',
        },
        {
          q: 'このルールでは、誰からでも(送信元制限なしで)アクセスを許可しているTCPポートが2つあります。そのうち、暗号化されたWeb通信のポート番号を答えてください。',
          narration: 'ACCEPTルールのうち -s(送信元指定)が無いものは「全世界に開放」。--dport がそのポート。22はソース制限付き、443/80はソース制限なし。',
          check: { type: 'answer', any: ['443'] },
          hints: ['grep ACCEPT /etc/iptables/rules.v4', '--dport があり -s が無い行(全開放)', '443(HTTPS)と80(HTTP)が全開放。暗号化Webは443'],
          explain: '22番は -s 10.10.14.0/24 で内部のみ許可(良い設計)。一方80/443は送信元制限なしで全世界に開放＝公開Web。3306(MySQL)は明示的にDROPで保護。デフォルト拒否＋必要なものだけ許可＋管理ポートは内部限定、という堅牢な設計を読み取れる。',
        },
      ],
      review: { steps: ['既定ポリシー(policy)を確認', 'ACCEPT行で許可ポートを把握', '-s の有無で公開範囲を判断', '攻撃面を評価'], commands: [{ cmd: 'grep -i policy /etc/iptables/rules.v4', meaning: '既定ポリシー確認' }, { cmd: 'grep ACCEPT /etc/iptables/rules.v4', meaning: '許可ルールを抽出' }], why: 'FWルールの読解は、実際の攻撃面の正確な評価に不可欠。設定ミス(過剰な開放)の発見にも繋がる。', practice: 'iptables/nftables/クラウドSGの監査、過剰開放ポートの是正、デフォルト拒否の徹底。', related: ['ファイアウォール', 'デフォルト拒否', 'ポート管理'] },
      learned: ['iptables', 'firewall-rules', 'default-deny', 'attack-surface'], solution: ['cat /etc/iptables/rules.v4', 'grep ACCEPT /etc/iptables/rules.v4'],
    },
  ],
};
