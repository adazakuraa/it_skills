# CyberLab — Linux × サイバーセキュリティ 実践学習ゲーム

スマートフォンだけで本格的に学べる、Linux と サイバーセキュリティの**実践型**学習シミュレーターです。
TryHackMe のように仮想環境のターミナルを操作し、調査・分析・防御の課題を自力で解いていきます。

- **ビルド不要** — Vanilla HTML/CSS/JS（ES Modules）。
- **外部依存ゼロ** — フォント・ライブラリ・API を一切使わず、完全オフラインで動作。
- **安全** — 実OSやシェルには一切触れません。`eval` 不使用の独自パーサーで仮想環境だけを操作します。
- **進捗保存** — ブラウザの localStorage に保存。エクスポート/インポートで機種変更にも対応。

## 公開（GitHub Pages）

このフォルダ（`cyberlab/`）はリポジトリ内で自己完結しています。GitHub Pages を有効化すると、

```
https://<ユーザー名>.github.io/<リポジトリ名>/cyberlab/
```

でアクセスできます（Settings → Pages → Deploy from a branch → `main` / `root`）。
スマホの「ホーム画面に追加」でアプリのように起動できます。

> ES Modules を使うため、`file://` で直接開くと動きません。GitHub Pages か、
> `python3 -m http.server` などの簡易サーバー経由で開いてください。

## 動作確認（開発者向け）

```bash
# 自動テスト（コマンド挙動＋全ミッションが模範解で解けるか）
node cyberlab/tests/run.mjs

# ローカルプレビュー
cd cyberlab && python3 -m http.server 8000
# → http://localhost:8000/
```

## 構成

| パス | 役割 |
|---|---|
| `index.html` | エントリ（CSPで外部スクリプト禁止） |
| `js/vfs.js` | 仮想ファイルシステム・ユーザー・権限 |
| `js/shell.js` | 字句解析・展開・パイプ/リダイレクト（独自パーサー） |
| `js/commands.js` | コマンド実装（ls, grep, find, chmod, ps, systemctl …） |
| `js/checker.js` | ミッション達成判定（結果の状態で判定） |
| `js/terminal.js` | ターミナルUI（補完・履歴・クイックキー） |
| `js/missions/` | ステージ／ミッション定義（純データ） |
| `js/app.js` | 画面遷移・演習の進行 |
| `tests/run.mjs` | 自動テスト |
| `docs/DESIGN.md` | 設計書（アーキテクチャ・データ構造・セキュリティ） |
| `docs/LIMITATIONS.md` | 実Linuxとの差異 |

## 学習の流れ

ステージは一本道で、前のミッションをクリアすると次が解放されます。**全20ステージ・100ミッション**。

| ステージ | 内容 |
|---|---|
| 0. チュートリアル | ターミナル基礎（pwd/ls/cd/cat）・パイプ入門・man での自習 |
| 1. ファイル調査 | find / grep / パイプ集計でログから異常を掘り出す |
| Text. テキスト処理 | head/tail・awk・cut/sort・sed/tr・uniq・複合パイプライン |
| Linux II | 作成/複製/移動・find応用(-perm/-size)・正規表現・ユーザー/所有権 |
| 2. 権限とプロセス | chmod / SUID / ps / kill / systemctl で堅牢化 |
| Shell. 自動化 | 環境変数/PATH・スクリプト読解・cron・リダイレクト |
| Linux III | ディスク(df/du)・ログローテーション・サービス/パッケージ監査 |
| Recon. 情報収集 | 秘密情報の横断検索・メタデータ漏洩・ユーザー列挙・OSINT/OPSEC |
| Net.基礎 | OSI/TCP-IP・サブネット・ARP・DNS・DHCP・ポート・ルーティング・HTTP/TLS・FW/VPN |
| 4. ネットワーク調査 | ip/nmap/ss/dig/curl・ポートスキャン・Web偵察・経路解析・地図化 |
| Net II | バナーグラビング・DNS列挙・iptables読解 |
| Sec.基礎 | CIA・認証認可・暗号・ハッシュ・署名・脆弱性管理・CVE/CVSS・OWASP・多層防御 |
| Crypto. 暗号 | base64・ハッシュ照合・shadow/ソルト・rot13・バイナリ文字列抽出 |
| 3. インシデント | 認証ログ解析・cron永続化除去・syslogトリアージ・報告書作成 |
| Forensics. | 隠しファイル・タイムライン・設定改ざん・Webシェル狩り・プロセス解析 |
| Defense. 防御 | C2検知(ss)・bash_history解析・堅牢化・バックアップ復旧・総当たり検知 |
| 5. Web脆弱性 I | SQLインジェクション・ディレクトリトラバーサル |
| Web II | コマンドインジェクション・XSS・IDOR・情報漏洩・アップロード |
| Advanced. 発展 | AD/Kerberos・Windows・クラウド・コンテナ・PKI・マルウェア・IR・ゼロトラスト |
| CTF. 総合演習 | 偵察→足がかり・権限昇格・Web→RCE・多重復号・総合フォレンジック |

各ミッションは「状況説明 → 事前解説（なぜ/何を解決/仕組み/例/関係）→ 演習 → 段階的ヒント → クリア後の振り返り」で構成し、
**コマンドの使い方だけでなく“使う理由”**、そして攻撃に対しては必ず**根本対策**まで理解できるようにしています。

> 攻撃系の演習（ポートスキャン・SQLi・トラバーサル・コマンドインジェクション等）はすべて**ゲーム内の仮想ホスト/仮想Webアプリ**が対象で、
> 実在のサーバーやIPへは一切通信しません（`js/netcommands.js` は `shell.net` のデータのみを参照、`eval` も不使用）。

各ミッションは「状況説明 → 事前解説（なぜ/何を解決/仕組み/例/関係）→ 演習 → 段階的ヒント → クリア後の振り返り」で構成し、
**コマンドの使い方だけでなく“使う理由”**を理解できるようにしています。

## ミッションの追加

1. `js/missions/` にステージを追加（既存ファイルへの追記も可）。
2. `js/missions/index.js` の `STAGES` に登録。
3. `solution`（模範操作）を書き、`node cyberlab/tests/run.mjs` で解けることを確認。

データ構造の詳細は `docs/DESIGN.md` を参照してください。

## 今後の拡張（設計済み）

- **Phase 3**: 仮想ネットワーク（ip/ping/ss/nmap/tcpdump/dig）、ポート・サービス調査
- **Phase 4**: 仮想Webサーバーと脆弱性演習（SQLi/XSS/ディレクトリトラバーサル）、CTF、フォレンジック

いずれもブラウザ内の仮想環境に閉じて実施し、実在のサーバーへの攻撃は一切行いません。
