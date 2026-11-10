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

ステージは一本道で、前のミッションをクリアすると次が解放されます。

0. **チュートリアル** — ターミナルの基本（pwd / ls / cd / cat）
1. **ファイル調査** — find / grep / パイプ / 集計でログから異常を掘り出す
2. **権限とプロセス** — chmod / SUID / ps / kill / systemctl でシステムを堅牢化
3. **侵入の痕跡を追う** — 認証ログ解析・cron永続化の発見と除去（総合演習）
4. **ネットワークを調べる** — ip / nmap / ss / dig / curl で構成把握・ポートスキャン・Web偵察
5. **Webの脆弱性を突く** — SQLインジェクション・ディレクトリトラバーサルを仮想Webアプリで体験し対策まで理解

> 攻撃系の演習（ポートスキャン・SQLi・トラバーサル）はすべて**ゲーム内の仮想ホスト/仮想Webアプリ**が対象で、
> 実在のサーバーやIPへは一切通信しません（`js/netcommands.js` は `shell.net` のデータのみを参照）。

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
