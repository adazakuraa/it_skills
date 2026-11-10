// Stage 4: ネットワーク調査
export const stage4 = {
  id: 'stage4',
  title: 'Stage 4 — ネットワークを調べる',
  subtitle: '構成把握・ポートスキャン・DNS・Web偵察で攻撃面を可視化する',
  intro: '新しい内部ネットワークのセキュリティ評価を任された。どんな機器が、どんなサービスを、どのポートで公開しているか——攻撃者より先に「攻撃面(アタックサーフェス)」を把握する。',
  missions: [
    {
      id: 'n-01-recon-self',
      title: '自分のネットワークを知る',
      minutes: 8,
      objectives: ['ip コマンドで自ホストの構成を確認する', 'IPアドレス・サブネット・ゲートウェイ・DNSを読み解く'],
      prereq: ['f-02-grep'],
      briefing: 'ネットワーク調査は「自分がどこにいるか」から始まる。自ホストのIPアドレス、所属サブネット、出口(ゲートウェイ)、名前解決(DNS)を確認し、調査の起点を定める。',
      concepts: [
        {
          title: 'IPアドレス・サブネット・ゲートウェイ・DNS',
          why: 'ネットワーク上で通信するには、自分の住所(IP)と、外へ出る門(ゲートウェイ)、名前を住所に変える仕組み(DNS)が必要。',
          problem: '調査対象が同じネットワークにいるのか、どの範囲をスキャンすべきかを知るには、まず自分の構成を把握する必要がある。',
          how: 'ip a (ip addr) でインターフェースとIP/プレフィックスを表示。/24 は先頭24ビットがネットワーク部＝同一サブネットは256個分。ip r (ip route) でルーティング表とデフォルトゲートウェイ。dig +short 名前 でDNS正引き。',
          example: '$ ip a\n    inet 10.10.14.7/24 scope global eth0\n$ ip r\ndefault via 10.10.14.1 dev eth0',
          relation: 'このミッションで自ホストの住所・出口・名前解決を読み取り、調査範囲を定める。',
        },
      ],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: {
          self: '10.10.14.7', gateway: '10.10.14.1', prefix: 24,
          dns: { 'gateway.lab': '10.10.14.1', 'fileserver.lab': '10.10.14.30', 'web.lab': '10.10.14.50', 'dc01.lab': '10.10.14.10' },
        },
      },
      quick: ['ip a', 'ip addr', 'ip r', 'dig +short web.lab', 'nslookup fileserver.lab'],
      tasks: [
        {
          q: '自ホスト(eth0)のIPアドレスを答えてください（/プレフィックスは除く）。',
          narration: 'ip a でインターフェース一覧を表示する。lo はループバック(自分自身)なので、実際の通信は eth0 のIPを見る。',
          check: { type: 'answer', any: ['10.10.14.7'], normalizeIp: true },
          answerHint: 'eth0 の inet',
          hints: ['ip a を実行', 'eth0 の inet 行を見る', '10.10.14.7/24 の /24 を除いた部分'],
          explain: 'eth0 の inet 10.10.14.7/24 が自ホストの住所。/24 は同一サブネットが 10.10.14.0〜10.10.14.255 であることを意味し、スキャン範囲の目安になる。',
        },
        {
          q: 'このホストのデフォルトゲートウェイ（外部への出口ルータ）のIPアドレスを答えてください。',
          narration: '自分のサブネット外へ出る通信は、すべてデフォルトゲートウェイを通る。ip r（ルーティング表）の default 行に書かれている。',
          check: { type: 'answer', any: ['10.10.14.1'], normalizeIp: true },
          answerHint: 'default via のIP',
          hints: ['ip r または ip route を実行', 'default via ___ dev eth0 の形', '10.10.14.1 がゲートウェイ'],
          explain: 'default via 10.10.14.1 が外部への出口。攻撃者視点ではゲートウェイやDNSサーバーも調査対象になる。ルーティング表は通信経路の理解に不可欠。',
        },
        {
          q: 'ホスト名 web.lab が指すIPアドレスを、DNSで解決して答えてください。',
          narration: '人間はホスト名、機械はIPで通信する。その変換がDNS。dig +short 名前 で解決後のIPだけを手早く得られる。',
          check: { type: 'answer', any: ['10.10.14.50'], normalizeIp: true },
          answerHint: 'web.lab のIP',
          hints: ['dig +short web.lab を実行', 'nslookup web.lab でも可', '10.10.14.50 が解決結果'],
          explain: 'dig +short は余計な情報を省いてIPだけ返す。名前→IPの対応を押さえることで、次のポートスキャンの対象を特定できる。DNSは偵察の重要な情報源。',
        },
      ],
      review: {
        steps: ['ip a で自IP/サブネットを確認', 'ip r でゲートウェイを確認', 'dig +short で対象を名前解決'],
        commands: [
          { cmd: 'ip a', meaning: 'インターフェースとIPアドレス' },
          { cmd: 'ip r', meaning: 'ルーティング表とゲートウェイ' },
          { cmd: 'dig +short web.lab', meaning: 'ホスト名をIPに解決' },
        ],
        why: '自分の立ち位置とネットワーク範囲の把握は、すべてのネットワーク調査の前提。範囲を誤れば調査は的外れになる。',
        practice: 'ペネトレーションテストの初手は ip a / ip r / cat /etc/resolv.conf による環境把握。',
        related: ['ポートスキャン(nmap)', 'サブネット計算', 'ARP'],
      },
      learned: ['ip-addr', 'subnet', 'gateway', 'dns-lookup', 'network-recon'],
      solution: ['ip a', 'ip r', 'dig +short web.lab'],
    },

    {
      id: 'n-02-portscan',
      title: 'ポートスキャンでサービスを特定',
      minutes: 12,
      objectives: ['nmap でポートスキャンする', '開いているポートからサービスを推定する', 'ss で自ホストの不審な待ち受けを見つける'],
      prereq: ['n-01-recon-self'],
      briefing: '対象ホスト fileserver.lab の攻撃面を調べる。どのポートが開き、何のサービスが動いているか。さらに、自分のマシン自身に見覚えのない待ち受けポート（バックドアの兆候）がないかも確認する。',
      concepts: [
        {
          title: 'ポートとサービス、ポートスキャン',
          why: 'サーバーは「ポート」という番号付きの窓口でサービスを提供する(22=SSH, 80=HTTP, 443=HTTPS, 21=FTP, 445=SMB)。開いているポート＝攻撃できる入口。',
          problem: '対象がどんなサービスを公開しているか分からなければ、脆弱性も評価できない。',
          how: 'nmap 対象 で開いているTCPポートとサービス名を列挙。nmap -sV でバージョンまで推定し、既知の脆弱性と照合する。自ホスト側は ss -tlnp で「待ち受け(LISTEN)中のポートとプロセス」を確認でき、不審なポートの検出に使う。',
          example: '$ nmap fileserver.lab\nPORT    STATE SERVICE\n22/tcp  open  ssh\n445/tcp open  microsoft-ds',
          relation: 'このミッションで対象のサービスを洗い出し、自ホストのバックドアポートを見つける。',
        },
      ],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        network: {
          self: '10.10.14.7', gateway: '10.10.14.1',
          dns: { 'fileserver.lab': '10.10.14.30', 'web.lab': '10.10.14.50' },
          listening: [
            { proto: 'tcp', addr: '0.0.0.0', port: 22, state: 'LISTEN', process: 'sshd', pid: 801 },
            { proto: 'tcp', addr: '127.0.0.1', port: 631, state: 'LISTEN', process: 'cupsd', pid: 900 },
            { proto: 'tcp', addr: '0.0.0.0', port: 4444, state: 'LISTEN', process: 'nc', pid: 6671 },
          ],
          hosts: {
            '10.10.14.30': { ports: [
              { port: 21, proto: 'tcp', state: 'open', service: 'ftp', banner: 'vsftpd 3.0.3' },
              { port: 22, proto: 'tcp', state: 'open', service: 'ssh', banner: 'OpenSSH 8.9p1' },
              { port: 445, proto: 'tcp', state: 'open', service: 'microsoft-ds', banner: 'Samba smbd 4.15' },
            ] },
          },
        },
        processes: [{ pid: 6671, user: 'analyst', cmd: 'nc -lvnp 4444 -e /bin/bash', cpu: 0.0 }],
      },
      quick: ['nmap fileserver.lab', 'nmap -sV fileserver.lab', 'nmap -p 21 fileserver.lab', 'ss -tlnp', 'ss -tln'],
      tasks: [
        {
          q: 'fileserver.lab で開いているTCPポートはいくつありますか。nmap でスキャンして数を答えてください。',
          narration: 'nmap に対象のホスト名かIPを渡すとポートスキャンが走る。STATE が open の行が「開いている窓口」だ。',
          check: { type: 'answer', any: ['3', '３'] },
          hints: ['nmap fileserver.lab を実行', 'STATE が open の行を数える', '21, 22, 445 の3つ'],
          explain: '開いているポートは21(FTP)/22(SSH)/445(SMB)の3つ。それぞれが潜在的な侵入口。ポート番号から提供サービスを推定するのが基本。',
        },
        {
          q: 'ポート21で動いているサービス名を答えてください。',
          narration: 'ポート番号には慣例的なサービスの割り当てがある。nmap はサービス名も表示してくれる。-sV を付ければソフトウェア名やバージョンも推定できる。',
          check: { type: 'answer', any: ['ftp'], ci: true },
          answerHint: 'サービス名',
          hints: ['nmap fileserver.lab の 21/tcp の行を見る', 'nmap -sV fileserver.lab でバージョンも分かる', '21番は ftp（vsftpd 3.0.3）'],
          explain: '21/tcp は FTP。-sV が示す vsftpd 3.0.3 のようなバージョン情報は、既知のCVE(脆弱性)と突き合わせる材料になる。平文認証のFTPはそれ自体がリスク。',
        },
        {
          q: '自分のマシン(kali-ops)で待ち受け中(LISTEN)のポートを調べると、SSH(22)や印刷(631)に混じって、見覚えのない不審なポートが外部公開されています。そのポート番号を答えてください。',
          narration: '攻撃面は相手だけでなく自分にもある。ss -tlnp で自ホストのLISTENポートとプロセスを確認する。0.0.0.0 で待ち受ける見慣れないポートは、仕込まれたバックドアの可能性が高い。',
          check: { type: 'answer', any: ['4444'] },
          answerHint: 'ポート番号',
          hints: ['ss -tlnp を実行', '22(sshd)/631(cupsd) は正常。残りを見る', 'nc が 0.0.0.0:4444 で待ち受けている＝リバースシェル/バックドア'],
          explain: 'nc -lvnp 4444 -e /bin/bash は、接続してきた相手にシェルを渡す典型的なバックドア。ss -tlnp の p でプロセス名まで分かる。631(cupsd)は 127.0.0.1 のみでローカル限定だが、4444 は 0.0.0.0＝全公開で危険。防御では該当プロセスをkillし、永続化を調べる(Stage2/3の知識)。',
        },
      ],
      review: {
        steps: ['nmap で対象の開放ポートを列挙', '-sV でサービス/バージョン特定', 'ss -tlnp で自ホストの待ち受けを監査'],
        commands: [
          { cmd: 'nmap fileserver.lab', meaning: '対象のポートスキャン' },
          { cmd: 'nmap -sV fileserver.lab', meaning: 'サービスとバージョンの特定' },
          { cmd: 'ss -tlnp', meaning: '自ホストのLISTENポートとプロセス' },
        ],
        why: 'ポートスキャンは攻撃面の可視化そのもの。攻撃者も防御者も、まず開いているポートを把握する。',
        practice: 'nmap -sV -p- target でフルスキャン、ss -tlnp で自サーバーの不要な公開ポートを閉じる、は実務の定番。',
        related: ['バナーからのCVE調査', 'ファイアウォール', 'リバースシェル'],
      },
      learned: ['nmap', 'ports-services', 'ss', 'listening-ports', 'backdoor-port'],
      solution: ['nmap fileserver.lab', 'nmap -sV fileserver.lab', 'ss -tlnp'],
    },

    {
      id: 'n-03-web-recon',
      title: 'Webサーバーを偵察する',
      minutes: 12,
      objectives: ['curl でHTTPレスポンスを取得する', 'robots.txt から隠しパスを見つける', '情報漏洩ファイルを発見する'],
      prereq: ['n-02-portscan'],
      briefing: 'web.lab で80番(HTTP)が開いていた。Webサーバーは設定ミスで内部情報を漏らしがち。curl でレスポンスを直接読み、公開すべきでないファイルを探し当てる。',
      concepts: [
        {
          title: 'HTTPとcurlによるWeb偵察',
          why: 'ブラウザが見せるのは完成されたページだけ。調査では生のHTTPレスポンスやヘッダ、隠しパスを直接見たい。',
          problem: '管理画面やバックアップファイルが、リンクされていないだけで実は公開されている——という情報漏洩がよくある。',
          how: 'curl URL でHTMLを取得、curl -I でヘッダのみ。robots.txt は「クローラに見せたくないパス」を書くファイルで、皮肉にも隠しパスのヒントになる。見つけたパスに curl でアクセスして中身を確認する。',
          example: '$ curl http://web.lab/robots.txt\nUser-agent: *\nDisallow: /backup',
          relation: 'このミッションで robots.txt → バックアップ流出 → 認証情報漏洩、とたどる。',
        },
      ],
      env: {
        hostname: 'kali-ops', user: 'analyst',
        dirs: ['/home/analyst/loot'],
        network: {
          self: '10.10.14.7', gateway: '10.10.14.1',
          dns: { 'web.lab': '10.10.14.50' },
          hosts: {
            '10.10.14.50': { ports: [
              { port: 80, proto: 'tcp', state: 'open', service: 'http', banner: 'Apache/2.4.52', http: {
                routes: [
                  { path: '/', body: '<html><head><title>Acme Intranet</title></head><body><h1>Acme Internal Portal</h1><p>Authorized use only.</p></body></html>' },
                  { path: '/robots.txt', contentType: 'text/plain', body: 'User-agent: *\nDisallow: /admin\nDisallow: /backup\n' },
                  { path: '/admin', status: 401, body: '401 Unauthorized' },
                  { path: '/backup', body: '<html><body><a href="db_dump.sql">db_dump.sql</a></body></html>' },
                  { path: '/backup/db_dump.sql', contentType: 'text/plain', body: '-- Acme users dump\nINSERT INTO users (id,name,pass) VALUES (1,"admin","S3cr3t-Acme-2024");\nINSERT INTO users (id,name,pass) VALUES (2,"guest","guest");\n' },
                ],
                notFound: { body: '404 Not Found', status: 404 },
              } },
            ] },
          },
        },
      },
      quick: ['curl http://web.lab/', 'curl http://web.lab/robots.txt', 'curl http://web.lab/backup/db_dump.sql', 'curl -I http://web.lab/', 'curl -o /home/analyst/loot/dump.sql http://web.lab/backup/db_dump.sql'],
      tasks: [
        {
          q: 'web.lab の robots.txt には、クローラに隠しているパスが Disallow として何個書かれていますか。',
          narration: 'まず robots.txt を取得する。ここに書かれた Disallow のパスは「見られたくない場所」＝調査の狙い目だ。',
          check: { type: 'answer', any: ['2', '２'] },
          hints: ['curl http://web.lab/robots.txt を実行', 'Disallow: の行を数える', '/admin と /backup の2つ'],
          explain: 'robots.txt はクローラ向けの除外指示だが、攻撃者にとっては「隠したい場所の一覧」。/admin と /backup が候補として浮かぶ。リンクされていなくてもアクセスは可能。',
        },
        {
          q: '/backup を調べると db_dump.sql が置かれています。その中身から漏洩している admin ユーザーのパスワードを答えてください。',
          narration: 'robots.txt で見つけた /backup にアクセスし、さらにその中のファイルを curl で読む。データベースのダンプが公開されていれば、認証情報がそのまま手に入ってしまう。',
          check: { type: 'answer', any: ['S3cr3t-Acme-2024'] },
          answerHint: 'admin の pass 値',
          hints: ['curl http://web.lab/backup/ でファイル名を確認', 'curl http://web.lab/backup/db_dump.sql で中身を取得', 'admin の行の pass 値 "S3cr3t-Acme-2024"'],
          explain: '公開ディレクトリにDBダンプを置く設定ミスで、管理者パスワードが平文流出。これは深刻な情報漏洩で、ここから他サービスへの横展開(パスワード使い回し)に繋がる。防御は公開領域からの秘密ファイル排除とアクセス制御。',
        },
        {
          q: '証拠として db_dump.sql を手元の ~/loot/dump.sql に保存してください。保存できたら done と入力。',
          narration: '調査で得た証拠はローカルに保全する。curl -o 保存先 URL でレスポンスをファイルに書き出せる。',
          check: { type: 'all', of: [
            { type: 'state', path: '/home/analyst/loot/dump.sql', exists: true },
            { type: 'state', path: '/home/analyst/loot/dump.sql', contains: 'S3cr3t-Acme-2024' },
          ] },
          answerHint: '保存したら done',
          hints: ['curl の -o オプションで保存先を指定', 'curl -o /home/analyst/loot/dump.sql http://web.lab/backup/db_dump.sql', 'cat ~/loot/dump.sql で確認して done'],
          explain: 'curl -o はレスポンスをファイルに保存する（wget も同様）。インシデント調査やペネトレーションテストでは、発見した証拠を必ず保全し、報告書に添える。',
        },
      ],
      review: {
        steps: ['curl でトップページ/ヘッダを確認', 'robots.txt から隠しパスを拾う', '隠しパスを辿って情報漏洩を発見', 'curl -o で証拠保全'],
        commands: [
          { cmd: 'curl http://web.lab/robots.txt', meaning: '隠しパスの手がかりを取得' },
          { cmd: 'curl http://web.lab/backup/db_dump.sql', meaning: '漏洩ファイルの中身を確認' },
          { cmd: 'curl -o ~/loot/dump.sql URL', meaning: 'レスポンスをファイルに保存' },
        ],
        why: 'Web偵察は外部公開資産の評価に必須。設定ミスによる情報漏洩はOWASPでも頻出の実被害源。',
        practice: 'robots.txt・.git・バックアップファイルの露出確認は、Web診断の基本チェック項目。',
        related: ['ディレクトリ総当たり(gobuster)', 'OWASP Top10', 'SQLインジェクション'],
      },
      learned: ['curl', 'http-recon', 'robots-txt', 'information-disclosure', 'evidence-capture'],
      solution: ['curl http://web.lab/robots.txt', 'curl http://web.lab/backup/db_dump.sql', 'curl -o /home/analyst/loot/dump.sql http://web.lab/backup/db_dump.sql'],
    },
  ],
};
