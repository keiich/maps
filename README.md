# 地域治安マップ

OpenStreetMap の上に、**自治体が公開している犯罪統計**と**利用者が書き込んだ治安情報**を重ねて表示する地図サイトです。Next.js (App Router) で作られており、Vercel にそのままデプロイできます。

## できること

- **公式統計レイヤー** — 市区町村ごとの認知件数を円の大きさと色で表示。「総件数」と「人口10万人あたり」を切り替えて比較できます。
- **投稿レイヤー** — 誰でも地図をタップして治安情報を書き込めます。カテゴリと期間で絞り込み可能。
- **通報による自動非表示** — 一定数の通報が集まった投稿は自動で地図から消えます。
- **投稿前チェック** — 電話番号・メールアドレス・URL・番地などが含まれる投稿は保存前に弾きます。
- **レート制限** — 同一利用者からの連続投稿を時間あたりの件数で制限します。

## 動かす

```bash
npm install
npm run dev     # http://localhost:3000
```

`DATABASE_URL` が未設定のときは `.data/reports.json` に保存するフォールバックが動くので、DB なしでもそのまま触れます。

## Vercel にデプロイする

1. このリポジトリを Vercel にインポートします（フレームワークは Next.js が自動検出されます）。
2. **Storage → Create Database** から Neon (Vercel Postgres) を作成し、プロジェクトに接続します。`POSTGRES_URL` が自動で環境変数に入ります。
   - 別の Postgres（Supabase など）を使う場合は、環境変数 `DATABASE_URL` にプール用の接続文字列を設定してください。
3. `IP_HASH_SALT` にランダムな文字列を設定します（レート制限に使う識別子のソルト）。
4. デプロイ。テーブルは初回リクエスト時に自動作成されます。

> **注意:** DB を設定せずに Vercel へデプロイすると、投稿はインスタンスごとの一時ファイルに書かれるだけで永続化されません。本番では必ず接続文字列を設定してください。

### 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` / `POSTGRES_URL` | なし | Postgres 接続文字列。未設定ならローカルファイルに保存。 |
| `IP_HASH_SALT` | `chian-map-dev-salt` | 利用者識別子のハッシュに使うソルト。本番では必ず変更。 |
| `RATE_LIMIT_PER_HOUR` | `5` | 同一利用者が1時間に投稿できる件数。 |
| `FLAG_HIDE_THRESHOLD` | `3` | この件数の通報が集まると投稿を自動的に非表示にする。 |

## 公式統計データについて

同梱の `data/official-crime.json` は **動作確認用のサンプル**です（`dataStatus: "sample"`）。件数は固定シードの疑似乱数で生成した作り物で、実際の統計ではありません。サンプルを表示している間は画面上部にもその旨が出ます。

### 実データへの差し替え

警視庁が公開している「市区町村別・罪種別 認知件数」の CSV を取得して変換します。

- 公開ページ: <https://www.keishicho.metro.tokyo.lg.jp/about_mpd/jokyo_tokei/jokyo/ninchikensu.html>
- 東京都オープンデータカタログ: <https://catalog.data.metro.tokyo.lg.jp/>

```bash
# ダウンロード済みの CSV から変換
node scripts/ingest-tokyo-crime.mjs --file ./ninchikensu2024.csv --period 2024

# URL から直接取得
node scripts/ingest-tokyo-crime.mjs --url https://.../xxx.csv --period 2024
```

CSV の列名は年度ごとに変わります。自動判定に失敗した場合は列名を明示してください。

```bash
node scripts/ingest-tokyo-crime.mjs --file ./data.csv --period 2024 \
  --columns "name=区市町村,violent=凶悪犯,assault=粗暴犯,burglary=侵入窃盗,theft=非侵入窃盗,fraud=知能犯"
```

変換に成功すると `dataStatus` が `official` になり、サンプル表示の警告が消えます。生成された JSON はコミットして使う想定です。

Shift_JIS の CSV は自動判別してデコードします。市区町村名は `data/tokyo-municipalities.json` の一覧と突き合わせるので、東京都以外に広げる場合はまずこのファイルに市区町村コード・名称・代表点の緯度経度・人口を追加してください。

サンプルを作り直したい場合は `node scripts/make-sample-data.mjs` を実行します。

## 構成

```
app/
  page.tsx                     公式統計をサーバー側で読み込んで地図に渡す
  api/reports/route.ts         投稿の取得 (GET) と作成 (POST)
  api/reports/[id]/flag/       通報
  api/official/route.ts        公式統計の配信
components/
  MapApp.tsx                   画面全体の状態管理
  MapCanvas.tsx                Leaflet の地図本体（クライアント専用）
  Sidebar.tsx                  レイヤー切り替え・絞り込み・凡例
  ReportForm.tsx               投稿フォーム
lib/
  store/                       保存層（Postgres / ファイルの2実装）
  moderation.ts                投稿前チェック
  official.ts                  公式統計の読み込みと人口比の計算
  scale.ts                     色分けのスケール
data/
  tokyo-municipalities.json    市区町村コード・代表点・人口
  official-crime.json          公式統計（既定はサンプル）
scripts/
  ingest-tokyo-crime.mjs       公式 CSV → JSON 変換
  make-sample-data.mjs         サンプルデータ生成
db/schema.sql                  投稿テーブルのスキーマ（参照用）
```

## 運用上の注意

投稿は検証されていない匿名の書き込みです。特定の個人・店舗・住居を名指しする投稿や、事実と異なる投稿は、実際の被害につながり得ます。公開して運用する場合は、少なくとも以下を検討してください。

- 通報された投稿を人が確認する運用（`db/schema.sql` 末尾のクエリを参照）
- 利用規約と削除方針の掲示
- 投稿数が増えてきた段階での認証の導入

緊急時は 110 番へ。このサイトは通報の代わりにはなりません。

## ライセンス・出典

- 地図タイル: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors — [タイル利用ポリシー](https://operations.osmfoundation.org/policies/tiles/)に従ってください。アクセスが増える場合は独自のタイルサーバーや商用タイル提供者への切り替えが必要です。
- 犯罪統計: 警視庁 / 東京都オープンデータカタログ（実データに差し替えた場合は、出典元のライセンス表記を `data/official-crime.json` の `license` に設定してください）
