# CyberLab 設計書

ブラウザ内で完結する Linux × サイバーセキュリティ学習ゲーム。
GitHub Pages（静的ホスティング）で配信し、ビルド工程なし・外部依存なしで動作する。

## 1. システムアーキテクチャ

```
index.html ── js/app.js (UI / ルーター / 画面描画)
                 │
                 ├─ js/storage.js   進捗・学習履歴・設定・環境スナップショット (localStorage)
                 ├─ js/missions/*.js カリキュラム & ミッション定義（純データ）
                 ├─ js/checker.js   ミッション達成判定（宣言的チェック）
                 └─ js/terminal.js  ターミナルUI（入力・補完・履歴・クイックキー）
                        │
                        └─ js/shell.js    字句解析・展開・パイプ/リダイレクト実行（独自パーサー）
                               ├─ js/vfs.js       仮想ファイルシステム・ユーザー・権限
                               ├─ js/commands.js  コマンド実装（ls, grep, find, ps …）
                               └─ js/manpages.js  man ページ
```

* すべての「実行」は JavaScript のデータ構造に対する操作であり、実OS・外部サーバーには一切触れない。
* ES Modules をそのまま読み込む（バンドラ不要）。スマホの GitHub アプリ/ブラウザからでも編集できる。

## 2. ディレクトリ構成

```
cyberlab/
  index.html
  css/style.css
  js/
    app.js  storage.js  checker.js  terminal.js
    shell.js  vfs.js  commands.js  manpages.js  util.js
    missions/
      index.js          ステージ構成・カリキュラム全体像
      env.js            全ミッション共通のベース環境
      stage0-tutorial.js ... stage6-incident.js
  tests/run.mjs        自動テスト（node tests/run.mjs）
  docs/DESIGN.md       本書
  docs/LIMITATIONS.md  実際のLinuxとの差異一覧
```

## 3. データ構造

### 仮想ファイルシステム (vfs.js)
```js
node = { type: 'd'|'f'|'l', mode: 0o755, uid, gid, mtime, content?: string, children?: {name: node} }
```
* 権限チェックは所有者/グループ/その他の rwx、ディレクトリの x（通過）・r（一覧）・w（作成/削除）、
  sticky bit（/tmp）、uid 0 の特権を実装。
* `/dev/null` は特殊ファイル（書き込み破棄・読み込み空）。
* `serialize()/deserialize()` で環境をJSONスナップショット化し、リロード後も演習状態を復元。

### ミッション
```js
{
  id, stage, title, summary, minutes,
  objectives: [],        // 学習目標
  prereq: [],            // 前提知識（ミッションID or 説明）
  briefing: '',          // 状況設定
  concepts: [{ title, why, problem, how, example, relation }], // 解説（5段構成）
  env: { hostname, user, cwd, sudo, files, dirs, processes, services, env },
  tasks: [{ q, check, hints: [方向性, 技術, 具体的操作], explain }],
  quick: ['ls -la', ...],  // 課題に応じたコマンド候補
  review: { steps, commands: [{cmd, meaning}], why, practice, related },
  solution: [...]          // 自動テスト用の模範操作
}
```

### 達成判定 (checker.js)
* `answer` … 入力した文字列（フラグ・IP・ユーザー名等）を正規化して照合
* `state` … 仮想環境の状態を検査（`mode` / `exists` / `absent` / `contains` / `notContains` /
  `owner` / `noProcess` / `service`）。プレイヤーが実際に設定を変更したかで判定する。

## 4. 仮想Linux環境の設計

* **字句解析**: シングル/ダブルクォート、バックスラッシュ、`$VAR` `${VAR}` `$?` 展開、`~` 展開、
  グロブ (`*` `?` `[...]`)、演算子 `|` `>` `>>` `2>` `2>>` `2>&1` `&>` `<` `;` `&&` `||`。
* **実行**: パイプラインごとに stdin 文字列を受け渡し。リダイレクト先は権限チェック付きで仮想FSへ書き込む。
* **コマンド**: 引数・オプション（結合 `-la`、値付き `-n 5` / `-n5`、`--long`）を共通パーサーで解析。
  不明なオプションや存在しないファイルには実際の GNU coreutils に近いエラーメッセージを返す。
* **シェルスクリプト**: 実行権限のある `#!/bin/bash` スクリプトは、行ごとに同じ安全なパーサーで解釈する
  （制御構文は未対応、`LIMITATIONS.md` に明記）。

## 5. セキュリティ上のリスクと対策

| リスク | 対策 |
|---|---|
| 任意コード実行 | `eval` / `new Function` / `setTimeout(string)` を一切使用しない。コマンドは名前→関数のホワイトリスト表で解決。 |
| 実OSへの到達 | シェルは JS オブジェクトだけを操作。`fetch` は使用しない（ミッションデータもJSモジュールとして同梱）。 |
| XSS | ターミナル出力・ユーザー入力・保存データはすべて `textContent` で描画。HTML を組み立てる箇所は固定テンプレート＋`escapeHtml()`。CSP で外部スクリプトとインライン script を禁止。 |
| 正規表現 DoS | `grep`/`sed` などでユーザーが入力した正規表現は自分の端末内でのみ評価され、入力長と行数に上限を設定。 |
| 保存データ改ざん | localStorage の読み込み時にスキーマ検証し、不正なら初期化。インポートも同じ検証を通す。 |
| 外部サービスへの影響 | 静的サイトのみ。ゲーム操作は GitHub や他サービスへ一切送信しない。 |
| 攻撃技術の悪用 | 演習対象はゲーム内の仮想ホストに限定。攻撃系の内容は「仕組みの理解」と「検知・防御」に重点を置く。 |

## 6. 開発フェーズと現状

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | スマホUI・ステージ/ミッション管理・ターミナル・仮想FS・基本コマンド・保存 | 実装済み |
| 2 | Linux基礎カリキュラム（ファイル・検索・テキスト処理・パイプ・権限・プロセス・cron・ログ） | 実装済み |
| 3 | 仮想ネットワーク・ネットワークコマンド（ip/nmap/ss/dig/curl 等） | 実装済み（Stage 4） |
| 4 | 仮想Webサーバー・脆弱性演習（SQLi/トラバーサル） | 実装済み（Stage 5） |
| 5 | フォレンジック・暗号・AD・クラウド/コンテナ 等の発展 | 継続 |

### 仮想ネットワーク (netcommands.js)
`mission.env.network` から `shell.net` を構築する。実在ホストへは一切通信せず、以下のデータだけを参照する。
```js
network = {
  interfaces, routes, dns,            // ip a / ip r / dig・nslookup
  listening: [{proto,addr,port,process,pid}],  // ss / netstat（自ホストの待ち受け）
  hosts: { 'ip': { names, ports:[{port,service,banner, http}] } }, // nmap / nc / curl
}
```
HTTPは宣言的ルーティング `http.routes[{ path, method?, when?, body, default? }]` で応答を出し分ける。
`when:{param,equals|contains|regex}` によって、SQLi（`' OR '1'='1`）やパストラバーサル（`../`）の
成功条件を**関数を使わずデータだけで**表現し、安全に攻撃演習を再現する。

## 7. ミッション追加手順
1. `js/missions/` にステージファイルを追加（または既存ファイルに追記）。
2. `js/missions/index.js` の `STAGES` に登録。
3. `solution` に模範操作を書き、`node cyberlab/tests/run.mjs` で解けることを確認。
