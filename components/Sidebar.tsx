'use client';

import type { Filters, LayerState, Metric } from '@/components/MapApp';
import { CATEGORIES } from '@/lib/categories';
import type { OfficialPayload } from '@/lib/official';
import { RATE_COLORS } from '@/lib/scale';
import type { CategoryId } from '@/lib/types';

const PERIODS: Array<{ label: string; days: number }> = [
  { label: '7日', days: 7 },
  { label: '30日', days: 30 },
  { label: '1年', days: 365 },
  { label: '全期間', days: 0 },
];

interface Props {
  open: boolean;
  official: OfficialPayload;
  persistent: boolean;
  layers: LayerState;
  onLayersChange: (next: LayerState) => void;
  metric: Metric;
  onMetricChange: (next: Metric) => void;
  filters: Filters;
  onFiltersChange: (next: Filters) => void;
  reportCount: number;
  loading: boolean;
  loadError: string | null;
}

export default function Sidebar({
  open,
  official,
  persistent,
  layers,
  onLayersChange,
  metric,
  onMetricChange,
  filters,
  onFiltersChange,
  reportCount,
  loading,
  loadError,
}: Props) {
  function toggleCategory(id: CategoryId) {
    const next = new Set(filters.categories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onFiltersChange({ ...filters, categories: next });
  }

  return (
    <aside className="sidebar" data-open={open}>
      {!persistent && (
        <div className="notice">
          <strong>データベースが設定されていません。</strong>
          <br />
          投稿は一時的に保存されるだけで、しばらくすると消えます。永続化するには環境変数
          <code> DATABASE_URL </code>
          に Postgres の接続文字列を設定してください。
        </div>
      )}

      {official.dataStatus === 'sample' && (
        <div className="notice">
          <strong>サンプルデータを表示しています。</strong>
          <br />
          公式統計レイヤーの件数は動作確認用のダミー値です。実際の統計に差し替えるには
          <code> npm run ingest:tokyo </code>
          を実行してください。
        </div>
      )}

      <section>
        <h2 className="section-title">レイヤー</h2>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={layers.official}
            onChange={(e) => onLayersChange({ ...layers, official: e.target.checked })}
          />
          <span>公式統計（市区町村別）</span>
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={layers.reports}
            onChange={(e) => onLayersChange({ ...layers, reports: e.target.checked })}
          />
          <span>みんなの投稿（{loading ? '…' : reportCount}件）</span>
        </label>
        {loadError && <p className="form-error">{loadError}</p>}
      </section>

      {layers.official && (
        <section>
          <h2 className="section-title">統計の指標</h2>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={metric === 'rate'}
              onClick={() => onMetricChange('rate')}
            >
              人口10万人あたり
            </button>
            <button
              type="button"
              aria-pressed={metric === 'total'}
              onClick={() => onMetricChange('total')}
            >
              総件数
            </button>
          </div>
          <div className="legend-scale">
            {RATE_COLORS.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </div>
          <div className="legend-ends">
            <span>少ない</span>
            <span>多い</span>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            円の大きさと色が{metric === 'rate' ? '人口10万人あたりの認知件数' : '認知件数の合計'}
            を表します。総件数は人口の多い地域ほど大きくなるため、地域間の比較には人口10万人あたりの値が向いています。
            統計は市区町村単位なので、円はその市区町村の代表点にまとめて描かれています。円の位置そのものに意味はありません。
          </p>
        </section>
      )}

      {layers.reports && (
        <section>
          <h2 className="section-title">投稿のカテゴリ</h2>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={filters.categories.has(c.id)}
                onClick={() => toggleCategory(c.id)}
                style={filters.categories.has(c.id) ? { color: c.color } : undefined}
              >
                <span className="dot" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            {filters.categories.size === 0
              ? 'すべてのカテゴリを表示中'
              : `${filters.categories.size}カテゴリを選択中`}
          </p>

          <h2 className="section-title" style={{ marginTop: 14 }}>
            投稿の期間
          </h2>
          <div className="segmented">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                aria-pressed={filters.days === p.days}
                onClick={() => onFiltersChange({ ...filters, days: p.days })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">出典</h2>
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            統計: {official.sourceName}
            {official.period !== '不明' && `（${official.period}）`}
            <br />
            <a href={official.sourceUrl} target="_blank" rel="noreferrer noopener">
              出典ページを開く
            </a>
            <br />
            地図: © OpenStreetMap contributors
          </p>
        </div>
      </section>

      <section>
        <h2 className="section-title">この地図の見方</h2>
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            投稿はどなたでも自由に書き込めるもので、内容の正確性は確認されていません。
            誤りや誹謗中傷を含む投稿を見つけた場合は、吹き出し内の「通報」から知らせてください。
            一定数の通報が集まった投稿は自動的に非表示になります。
            <br />
            <br />
            <strong>犯罪の被害に遭った、または現に危険がある場合は110番へ通報してください。</strong>
            このサイトは通報の代わりにはなりません。
          </p>
        </div>
      </section>
    </aside>
  );
}
