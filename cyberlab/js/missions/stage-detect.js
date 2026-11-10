// 脅威インテリジェンス & 検知エンジニアリング
import { mcq } from './_shared.js';

export const stageDetect = {
  id: 'detection',
  title: 'Detect — 脅威分析と検知',
  subtitle: 'MITRE ATT&CK・検知ルール作成・IoC抽出で“守りを設計”する',
  intro: '守りは「気合い」ではなく設計。攻撃を枠組み(ATT&CK)で整理し、ログから検知ルールを起こし、脅威情報(IoC)を共有する——現代ブルーチームの中核スキル。',
  missions: [
    {
      id: 'dt-01-attack',
      title: 'MITRE ATT&CKで攻撃を整理する',
      minutes: 9,
      objectives: ['ATT&CKの戦術(Tactics)を理解する', '観測事象を戦術に対応づける'],
      prereq: [],
      briefing: 'これまで見てきた攻撃(総当たり・権限昇格・C2・永続化…)を、共通の枠組み MITRE ATT&CK で整理する。共通言語で語れると、検知の抜け漏れが見える。',
      concepts: [{
        title: 'MITRE ATT&CK',
        why: '攻撃者の行動を「戦術(目的)×技術(手口)」で体系化した世界標準。共通言語で、検知カバレッジや攻撃段階を議論できる。',
        problem: '個々の攻撃をバラバラに扱うと、防御の抜けが見えない。段階ごとに整理したい。',
        how: 'ATT&CKは攻撃を戦術(Tactics)の連なりで表す: 初期アクセス→実行→永続化(Persistence)→権限昇格(Privilege Escalation)→防御回避→認証情報アクセス→探索→横移動(Lateral Movement)→収集→C2(Command and Control)→持ち出し(Exfiltration)。各戦術に多数の技術(T番号)がある。観測事象をこの枠にマップすると、どの段階が検知できていないか分かる。',
        example: 'authorized_keysに鍵追加 → Persistence / cap_setuid悪用 → Privilege Escalation',
        relation: 'これまでの演習で見た攻撃を、ATT&CKの戦術に対応づける。',
      }],
      env: {}, quick: [],
      tasks: [
        mcq('攻撃者がcrontabやsystemd timer、authorized_keysに仕掛けを残して「再起動後も居座る」行為は、ATT&CKのどの戦術か。',
          ['初期アクセス', '永続化(Persistence)', '持ち出し(Exfiltration)', '探索(Discovery)'], 2,
          '再起動や再ログイン後もアクセスを維持する行為は永続化(Persistence)。cron/systemd timer/authorized_keys/サービスはいずれもこの戦術の技術。防御は各永続化ポイントの監視と完全性チェック。これまでのStage3/PowerToolsの演習がこれに当たる。'),
        mcq('SUIDやcap_setuidの悪用、sudo設定ミスで一般ユーザーからrootになる行為はどの戦術か。',
          ['権限昇格(Privilege Escalation)', 'C2(Command and Control)', '収集(Collection)', '初期アクセス'], 1,
          '低い権限から高い権限を得るのは権限昇格(Privilege Escalation)。SUID/capability/sudo誤設定/カーネルExploitが代表技術。Stage2/CTF/PowerToolsで扱った。防御は最小権限・SUID/cap棚卸し・sudoers監査。'),
        mcq('侵害ホストが外部サーバーから指令を受け取り続ける通信(beacon.sh や curl|bash のループ)はどの戦術か。',
          ['探索', '永続化', 'C2(Command and Control)', '認証情報アクセス'], 3,
          '攻撃者の制御サーバーとの通信維持はC2(Command and Control)。ビーコン通信が典型で、ss -tnp での確立接続監視やegressフィルタ、脅威インテルのIoC(C2 IP/ドメイン)で検知・遮断する。Defenseステージで実際に検知した。'),
      ],
      review: { steps: ['攻撃を戦術(目的)で分類', '技術(手口)を戦術に紐付け', '検知カバレッジの抜けを把握'], commands: [], why: 'ATT&CKは防御設計の共通言語。攻撃を段階で整理すると、どこが検知できていないかが見える。', practice: '検知カバレッジのATT&CKマッピング、レッド/ブルーの共通言語、脅威ハンティングの計画。', related: ['detection', 'threat-intel', 'incident-response'] },
      learned: ['mitre-attack', 'tactics', 'persistence', 'detection-coverage'], solution: [],
    },

    {
      id: 'dt-02-detection-eng',
      title: '検知ルールを作る',
      minutes: 13,
      objectives: ['攻撃ログから検知シグネチャを導く', '誤検知と検知漏れを考える'],
      prereq: ['dt-01-attack'],
      briefing: '「攻撃を見つける」には、その痕跡を的確に捉えるルールが要る。Webシェルのアクセスログを分析し、この攻撃を捉える検知シグネチャ(grepパターン)を自分で設計する。',
      concepts: [{
        title: '検知エンジニアリング',
        why: '検知は「攻撃の痕跡を、誤検知少なく・漏れなく捉えるルール」を作る工学。良いシグネチャが監視の質を決める。',
        problem: '大量の正常アクセスの中から、Webシェル経由の攻撃だけを捉えるパターンを見つけたい。広すぎれば誤検知、狭すぎれば見逃す。',
        how: '攻撃ログと正常ログを見比べ、攻撃に特有で正常には出ない文字列(シグネチャ)を特定する。grep で候補を試し、攻撃だけにヒットし正常は拾わないかを検証(誤検知/検知漏れの評価)。それをSIEMルールやアラートにする。',
        example: '$ grep "cmd=" access.log   # Webシェルのコマンド実行を捉える',
        relation: 'ログからWebシェル攻撃のシグネチャを導き、検証する。',
      }],
      env: {
        hostname: 'soc', user: 'analyst', dirs: ['/var/log/web'],
        files: [{ path: '/var/log/web/access.log', owner: 'analyst', content: `10.0.0.5 GET /index.html 200
10.0.0.6 GET /about.html 200
203.0.113.9 GET /uploads/avatar.php?cmd=id 200
10.0.0.7 GET /products.html 200
203.0.113.9 GET /uploads/avatar.php?cmd=whoami 200
10.0.0.8 GET /contact.html 200
203.0.113.9 GET /uploads/avatar.php?cmd=cat+/etc/passwd 200
10.0.0.9 GET /index.html 200
` }],
      },
      quick: ['cd /var/log/web', 'grep "cmd=" access.log', 'grep -c "cmd=" access.log', 'grep "\\.php" access.log', 'grep "cmd=" access.log | cut -d" " -f1 | sort -u'],
      tasks: [
        {
          q: 'access.log を分析し、Webシェル経由のコマンド実行を最も的確に捉える検知シグネチャ(正常アクセスには出ず攻撃だけに出る文字列)を、次から選んで答えてください: .html / GET / cmd= / 200',
          narration: '攻撃行(avatar.php?cmd=...)と正常行(*.html)を見比べ、攻撃だけに現れる文字列を探す。広すぎる(GET/200)と全部ヒットして誤検知だらけ。',
          check: { type: 'answer', any: ['cmd=', 'cmd'], ci: true },
          answerHint: 'シグネチャ文字列',
          hints: ['grep "cmd=" access.log と grep "GET" access.log を比べる', 'GET/200/.html は正常にも出る(誤検知)', 'cmd= は攻撃行だけに出る'],
          explain: 'cmd= はWebシェルのコマンド実行に特有で、正常な静的ページ(.html)には出ない＝良いシグネチャ。GET/200/.htmlは正常にも出るので検知ルールにすると誤検知だらけ。「攻撃に特有で正常に出ない」文字列を選ぶのが検知エンジニアリングの核心。',
        },
        {
          q: 'その検知ルール(grep "cmd=")でヒットする行数(=検知されるアクセス数)はいくつですか。',
          narration: 'grep -c で、作ったルールが何件検知するかを測る。これが「このルールが捉える攻撃イベント数」。',
          check: { type: 'answer', any: ['3'] },
          hints: ['grep -c "cmd=" access.log', 'avatar.php?cmd= の行を数える', '3件(id/whoami/cat)'],
          explain: 'cmd= ルールは攻撃3件(id/whoami/cat /etc/passwd)を捉え、正常アクセスは1件も拾わない(誤検知ゼロ)。検知ルールは「検知数」と「誤検知」の両方で評価する。実務ではこれをSIEM(Splunk/Elastic)やSigmaルールに落とし、アラート化する。さらに発信元(203.0.113.9)を cut で抽出すれば攻撃元も特定できる。',
        },
      ],
      review: { steps: ['攻撃ログと正常ログを比較', '攻撃特有の文字列を特定', 'grepで誤検知/検知漏れを検証', 'SIEM/Sigmaルール化'], commands: [{ cmd: 'grep "cmd=" access.log', meaning: 'Webシェル検知シグネチャ' }, { cmd: 'grep -c "cmd=" access.log', meaning: '検知数の測定' }], why: '検知ルールの質が監視の質を決める。誤検知と検知漏れのバランス設計が検知エンジニアリング。', practice: 'SIEMルール作成、Sigmaルール、アラートチューニング、脅威ハンティング。', related: ['detection', 'log-analysis', 'webshell'] },
      learned: ['detection-engineering', 'signature', 'false-positive', 'siem'], solution: ['cd /var/log/web', 'grep "cmd=" access.log', 'grep -c "cmd=" access.log'],
    },

    {
      id: 'dt-03-ioc',
      title: 'IoCを抽出して共有する',
      minutes: 11,
      objectives: ['インシデントからIoCを抽出する', '脅威情報として整理する'],
      prereq: ['dt-02-detection-eng'],
      briefing: 'インシデント調査の成果は、IoC(侵害指標)として抽出・共有されて初めて、組織全体の防御に活きる。調査メモからIP・ドメイン・ハッシュを機械的に拾い出す。',
      concepts: [{
        title: 'IoC(侵害指標)と脅威インテリジェンス',
        why: 'ある組織で観測された攻撃の痕跡(IoC)を共有すれば、他組織・他システムが同じ攻撃を事前に検知・遮断できる。',
        problem: '調査結果から、再利用可能な指標(攻撃元IP・C2ドメイン・マルウェアのハッシュ)を漏れなく抽出したい。',
        how: 'IoCの типичな種類: IPアドレス、ドメイン、ファイルハッシュ(SHA256)、URL、ファイルパス。grep -oE で正規表現パターンに一致する部分だけを抽出(IP: [0-9.]+ 、ドメイン、ハッシュ: [0-9a-f]{64})。抽出したIoCはブロックリストやSIEM、脅威共有基盤(MISP)に登録する。',
        example: '$ grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" notes.txt | sort -u',
        relation: '調査メモからIP・ドメイン・ハッシュのIoCを抽出する。',
      }],
      env: {
        hostname: 'soc', user: 'analyst', dirs: ['/home/analyst/case'],
        files: [{ path: '/home/analyst/case/notes.txt', owner: 'analyst', content: `インシデント調査メモ:
- 侵入元IP: 203.0.113.9 (SSH総当たり)
- C2ドメイン: cmd.evil-c2.example
- 2台目の攻撃元: 198.51.100.13
- ドロッパーのSHA256: a3f1c9e4b2d7f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d1f2a4c6e8b0d2f4a6
- 設置Webshell: /var/www/html/uploads/avatar.php
- 再度 203.0.113.9 から横移動試行
` }],
      },
      quick: ['cd /home/analyst/case', 'cat notes.txt', 'grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" notes.txt | sort -u', 'grep -oE "[0-9a-f]{64}" notes.txt', 'grep -oE "[a-z0-9.-]+\\.example" notes.txt'],
      tasks: [
        {
          q: '調査メモから、IPアドレスのIoCを重複なく抽出します。ユニークなIPアドレスは何個ありますか（grep -oE で抽出し sort -u）。',
          narration: 'grep -oE でIPパターンに一致する部分だけ抜き、sort -u で重複排除して数える。203.0.113.9 は2回出るが1個と数える。',
          check: { type: 'answer', any: ['2'] },
          hints: ['grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" notes.txt | sort -u', '203.0.113.9 は重複→1個に', '203.0.113.9 と 198.51.100.13 の2個'],
          explain: 'grep -oE(一致部分のみ)+ sort -u(重複排除)で、ユニークなIP 2個(203.0.113.9, 198.51.100.13)を抽出。-o は正規表現の一致部分だけを出すのでIoC抽出に最適。これらをファイアウォール/SIEMのブロックリストに登録すれば、同じ攻撃元を全システムで遮断できる。',
        },
        {
          q: 'メモに記録されたマルウェア(ドロッパー)のSHA256ハッシュを grep で抽出して答えてください。',
          narration: 'SHA256は64桁の16進数。grep -oE "[0-9a-f]{64}" で抽出できる。これはファイルベースのIoC。',
          check: { type: 'answer', any: ['a3f1c9e4b2d7f8a1c3e5b7d9f0a2c4e6b8d0f1a3c5e7b9d1f2a4c6e8b0d2f4a6'], ci: true },
          answerHint: '64桁の16進',
          hints: ['grep -oE "[0-9a-f]{64}" notes.txt', 'SHA256は64文字の16進数', 'a3f1c9e4...d2f4a6'],
          explain: 'SHA256ハッシュ(64桁16進)はファイルベースのIoC。これを他システムやEDR、VirusTotal、脅威共有基盤(MISP)で照合すれば、同じマルウェアを検出できる。IoCにはIP/ドメイン/ハッシュ/URL/パスがあり、grep -oE で種類別に機械抽出できる。抽出したIoCの共有が、組織を越えた防御の連携を生む。',
        },
      ],
      review: { steps: ['調査メモ/ログを対象に', 'grep -oE で種類別にIoC抽出', 'sort -u で重複排除', 'ブロックリスト/SIEM/MISPで共有'], commands: [{ cmd: 'grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" notes.txt | sort -u', meaning: 'IPのIoC抽出' }, { cmd: 'grep -oE "[0-9a-f]{64}" notes.txt', meaning: 'ハッシュのIoC抽出' }], why: 'IoC抽出・共有は調査を組織全体の防御に変える。脅威インテリジェンスの基礎動作。', practice: 'IoC抽出とブロックリスト登録、MISP/脅威フィード連携、EDR/SIEMでのIoC照合。', related: ['ioc', 'threat-intel', 'incident-response'] },
      learned: ['ioc-extraction', 'threat-intelligence', 'grep-oE', 'misp'], solution: ['cd /home/analyst/case', 'grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" notes.txt | sort -u', 'grep -oE "[0-9a-f]{64}" notes.txt'],
    },
  ],
};
