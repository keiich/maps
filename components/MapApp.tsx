'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ReportForm from '@/components/ReportForm';
import Sidebar from '@/components/Sidebar';
import type { OfficialPayload } from '@/lib/official';
import type { CategoryId, Report } from '@/lib/types';

// Leaflet は window に依存するのでサーバー側では読み込まない。
const MapCanvas = dynamic(() => import('@/components/MapCanvas'), {
  ssr: false,
  loading: () => <div className="map-loading">地図を読み込んでいます…</div>,
});

export type Metric = 'total' | 'rate';

export interface Filters {
  categories: Set<CategoryId>;
  /** 直近何日分の投稿を表示するか。0 は全期間。 */
  days: number;
}

export interface LayerState {
  official: boolean;
  reports: boolean;
}

export type Bbox = [number, number, number, number];

export default function MapApp({ official }: { official: OfficialPayload }) {
  const [layers, setLayers] = useState<LayerState>({ official: true, reports: true });
  const [metric, setMetric] = useState<Metric>('rate');
  const [filters, setFilters] = useState<Filters>({ categories: new Set(), days: 0 });

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);

  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 表示範囲が変わるたびに投稿を取り直す。連続した moveend はまとめる。
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBoundsChange = useCallback((next: Bbox) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setBbox(next), 300);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const fetchReports = useCallback(async (signal?: AbortSignal) => {
    if (!bbox) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ bbox: bbox.join(',') });
      if (filters.days > 0) params.set('days', String(filters.days));
      const res = await fetch(`/api/reports?${params}`, { signal });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { reports: Report[] };
      setReports(data.reports);
      setLoadError(null);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setLoadError('投稿の読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [bbox, filters.days]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchReports(controller.signal);
    return () => controller.abort();
  }, [fetchReports]);

  const visibleReports = useMemo(() => {
    if (filters.categories.size === 0) return reports;
    return reports.filter((r) => filters.categories.has(r.category));
  }, [reports, filters.categories]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (!placing) return;
      setDraft({ lat, lng });
      setPlacing(false);
    },
    [placing],
  );

  const handleCreated = useCallback((report: Report) => {
    setReports((prev) => [report, ...prev]);
    setDraft(null);
    setToast('投稿しました。地図に反映されています。');
  }, []);

  const handleFlagged = useCallback((id: string, hidden: boolean, already: boolean) => {
    if (hidden) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      setToast('通報が一定数に達したため、この投稿は非表示になりました。');
    } else {
      setToast(already ? 'この投稿はすでに通報済みです。' : '通報を受け付けました。');
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="app">
      <header className="header">
        <h1>🗺 地域治安マップ</h1>
        <p className="tagline">公開統計 + みんなの投稿</p>
        <div className="header-spacer" />
        <button
          type="button"
          className="btn btn-sm sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          {sidebarOpen ? '地図' : '表示設定'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          aria-pressed={placing}
          onClick={() => {
            setPlacing((v) => !v);
            setSidebarOpen(false);
          }}
        >
          {placing ? 'キャンセル' : '+ 情報を投稿'}
        </button>
      </header>

      <div className="body">
        <Sidebar
          open={sidebarOpen}
          official={official}
          layers={layers}
          onLayersChange={setLayers}
          metric={metric}
          onMetricChange={setMetric}
          filters={filters}
          onFiltersChange={setFilters}
          reportCount={visibleReports.length}
          loading={loading}
          loadError={loadError}
        />

        <div className="map-wrap">
          {placing && <div className="map-hint">地図上をタップして場所を指定してください</div>}
          {toast && <div className="toast">{toast}</div>}
          <MapCanvas
            official={official}
            metric={metric}
            layers={layers}
            reports={visibleReports}
            placing={placing}
            draft={draft}
            onMapClick={handleMapClick}
            onBoundsChange={handleBoundsChange}
            onFlagged={handleFlagged}
          />
        </div>
      </div>

      {draft && (
        <ReportForm
          lat={draft.lat}
          lng={draft.lng}
          onCancel={() => setDraft(null)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
