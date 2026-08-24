# IT Foundations — 個人用ITリテラシー学習アプリ

System Design Primer / TryHackMe / Killercoda / AWS Cloud Quest / Cloud Resume Challenge などから得られる知識を、
スマホで完結する疑似コーディング形式のクイズ/シナリオとして学べる、GitHub Pages用の静的Webアプリです。

- ビルド不要（Vanilla HTML/CSS/JS）
- コンテンツはすべて `data/` 以下のJSONファイル
- 進捗は端末のブラウザ内（localStorage）に保存。エクスポート/インポートで機種変更にも対応

---

## 1. GitHub Pagesへのデプロイ手順

1. GitHubで新しいリポジトリを作成する（例: `it-foundations`）
2. このフォルダの中身（`index.html`, `css/`, `js/`, `data/`）をリポジトリのルートにそのままアップロードする
   - PCがない場合: GitHubモバイルアプリ or ブラウザ版GitHubの「Add file → Upload files」からドラッグ&ドロップ、またはこのZIPを一度Google Drive等に置いてから1ファイルずつアップロード
3. リポジトリの **Settings → Pages** を開く
4. "Build and deployment" の Source を **Deploy from a branch** にし、Branch を `main` / `root` に設定して Save
5. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセスできるようになります
6. スマホのホーム画面に追加すると、アプリのように起動できます（Safari/Chromeの「ホーム画面に追加」）

---

## 2. コンテンツの追加・更新（新しいレッスンを増やす）

### 運用パターンA: GitHubモバイルアプリで直接編集
`data/phase{n}/{module-id}/xx-title.json` を新規作成 → 下記スキーマに沿って直接JSONを書く → `data/manifest.json` の該当モジュールの `lessons` 配列にパスを追加してコミット。

### 運用パターンB: Claudeとのチャットでレッスン生成
このチャットで「〇〇についてのレッスンJSONを作って」と頼めば、スキーマに沿ったJSONをそのまま出力できます。それをコピーしてGitHub上に新規ファイルとして貼り付け、manifest.jsonに1行パスを追記するだけで反映されます。

### レッスンJSONのスキーマ（ストーリー形式）

クイズを羅列するのではなく、**1つの状況を最初から最後まで解説しながら進める**構成にしています。

```json
{
  "id": "一意なID（英数字とハイフン）",
  "title": "レッスンのタイトル",
  "intro": "レッスン冒頭に一度だけ表示される状況設定（地の文）。例：あなたはECサイトの運用担当。ある日…",
  "tasks": [ /* 下記のいずれかの形式のタスクを、ストーリーの展開順に並べる */ ]
}
```

各タスクには共通で以下を追加できます（両方とも任意）：
- `narration`: そのタスクの直前に表示される、地の文・つなぎの解説。「なぜ今これを考える必要があるのか」をここで説明してから問題に入る
- `hint`: 詰まったときだけ見る、答えを教えない程度のヒント（トグルボタンで表示）

**タスク形式は5種類:**

| type | 用途 | 必須フィールド |
|---|---|---|
| `mcq` | 四択クイズ | `question`, `choices[]`, `answer`(index), `explain` |
| `fill` | 穴埋め（コマンド/コード） | `prompt`, `template`(`___`を含む), `options[]`, `answer`, `explain` |
| `terminal` | 疑似ターミナル操作 | `prompt`, `commandOptions[]`, `answer`, `output`, `explain`（`wrongOutput`は任意） |
| `order` | 手順の並べ替え | `prompt`, `items[]`, `answer[]`(正しい順序), `explain` |
| `scenario` | 状況判断＋構成図の変化 | `prompt`, `diagram.nodes[]`, `choices[]`（各choiceに `label`, `correct`, `resultText`, 任意で `diagramAfter[]`） |

**ストーリー形式で書くときのコツ**（`data/phase1/system-design-primer/01-caching.json` が実例）:
1. `intro` で「誰が・何に困っているか」を具体的に一文で設定する
2. 最初のタスクの `narration` で、その困りごとに関連する概念をまず言葉で説明する
3. タスクを重ねるごとに、前のタスクの `explain` が次の `narration` の前提になるようにつなげる（例：「キャッシュを入れた→でも古いデータが残る問題が出た→それを解決するには…」）
4. 最後のタスクの `explain` で軽く次のレッスンへの橋渡しをすると、レッスンをまたいだ連続性が出る

新しいタスク形式が欲しくなったら、Claudeに「新しいタスクタイプ `xxx` を追加して」と頼めば `js/app.js` に描画ロジックを追加できます。

### manifest.json への登録

```json
{
  "id": "module-id",
  "title": "モジュール名",
  "description": "説明",
  "lessons": [
    "data/phase1/module-id/01-xxx.json",
    "data/phase1/module-id/02-xxx.json"
  ]
}
```

Phase 2〜4はまだ `modules: []` の空箱です。Docker/k8s/AWS/Cloud Resume Challenge/AtCoderなどを進めたくなったタイミングで、同じ要領でモジュールを追加してください。

---

## 3. 進捗データについて

- 保存先: ブラウザのlocalStorage（`itlearn_progress_v1`というキー）
- トップ画面下部の「進捗をエクスポート」でJSONファイルとしてダウンロード可能
- 機種変更やブラウザのキャッシュ削除の前にエクスポートし、新環境で「インポート」すれば引き継げます

---

## 4. 今後の拡張アイデア（Phase 2以降）

- Phase 2: `docker`, `kubectl` コマンドを模した `terminal` タスクを増やす、AWSのサービス構成を `scenario` の diagram で表現
- Phase 3: Cloud Resume Challengeの各ステップ（HTML→API→IaC→CI/CD）を `order` タスクの大型版として構成
- Phase 4: `mcq`/`fill` でアルゴリズムの計算量やCPUの動作原理を問う

すべて既存の5タスク形式の組み合わせで表現できるはずです。
