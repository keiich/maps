'use client';

import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

import type { Bbox, LayerState, Metric } from '@/components/MapApp';
import { getCategory } from '@/lib/categories';
import type { OfficialAreaWithRate, OfficialPayload } from '@/lib/official';
import { buildBreaks, colorForValue } from '@/lib/scale';
import type { Report } from '@/lib/types';

const TOKYO_CENTER: [number, number] = [35.6895, 139.6917];
const DEFAULT_ZOOM = 11;

interface Props {
  official: OfficialPayload;
  metric: Metric;
  layers: LayerState;
  reports: Report[];
  placing: boolean;
  draft: { lat: number; lng: number } | null;
  onMapClick: (lat: number, lng: number) => void;
  onBoundsChange: (bbox: Bbox) => void;
  onFlagged: (id: string, hidden: boolean, alreadyFlagged: boolean) => void;
}

export default function MapCanvas({
  official,
  metric,
  layers,
  reports,
  placing,
  draft,
  onMapClick,
  onBoundsChange,
  onFlagged,
}: Props) {
  const values = useMemo(
    () => official.areas.map((a) => (metric === 'rate' ? a.ratePer100k : a.total)),
    [official.areas, metric],
  );
  const breaks = useMemo(() => buildBreaks(values), [values]);
  const maxValue = useMemo(() => Math.max(1, ...values), [values]);

  return (
    <MapContainer
      center={TOKYO_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={8}
      maxZoom={18}
      scrollWheelZoom
      className={placing ? 'placing' : undefined}
    >
      <TileLayer
        // OpenStreetMap の標準タイル。帰属表示は利用規約上必須。
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      <MapEvents onMapClick={onMapClick} onBoundsChange={onBoundsChange} />
      <CursorMode placing={placing} />

      {layers.official &&
        official.areas.map((area) => (
          <OfficialCircle
            key={area.code}
            area={area}
            metric={metric}
            maxValue={maxValue}
            breaks={breaks}
            dataStatus={official.dataStatus}
            crimeTypes={official.crimeTypes}
          />
        ))}

      {layers.reports &&
        reports.map((report) => (
          <ReportMarker key={report.id} report={report} onFlagged={onFlagged} />
        ))}

      {draft && (
        <Marker
          position={[draft.lat, draft.lng]}
          icon={pinIcon('#c92a2a', '📍', true)}
          interactive={false}
        />
      )}

      <LocateControl />
    </MapContainer>
  );
}

/** 現在地へ移動するボタン。位置情報が拒否された場合は静かに諦める。 */
function LocateControl() {
  const map = useMap();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 地図コンテナの内側に置いているので、ボタンのクリックが
  // 「投稿位置の指定」として拾われないよう伝播を止める。
  useEffect(() => {
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, []);

  function locate() {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 15);
        setBusy(false);
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div className="map-actions" ref={ref}>
      <button
        type="button"
        className="btn btn-sm"
        onClick={locate}
        disabled={busy}
        title="現在地を表示"
      >
        {busy ? '取得中…' : '📍 現在地'}
      </button>
    </div>
  );
}

/** 地図のクリックと表示範囲の変化を親に伝えるだけのコンポーネント。 */
function MapEvents({
  onMapClick,
  onBoundsChange,
}: {
  onMapClick: (lat: number, lng: number) => void;
  onBoundsChange: (bbox: Bbox) => void;
}) {
  const map = useMapEvents({
    click: (e) => onMapClick(e.latlng.lat, e.latlng.lng),
    moveend: () => emit(),
    zoomend: () => emit(),
  });

  function emit() {
    const b = map.getBounds();
    onBoundsChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
  }

  // 初期表示ぶんを一度だけ通知する
  useEffect(() => {
    const b = map.getBounds();
    onBoundsChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** 投稿モード中はカーソルを十字にして、クリックが「場所の指定」だと分かるようにする。 */
function CursorMode({ placing }: { placing: boolean }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = placing ? 'crosshair' : '';
    return () => {
      el.style.cursor = '';
    };
  }, [map, placing]);
  return null;
}

function OfficialCircle({
  area,
  metric,
  maxValue,
  breaks,
  dataStatus,
  crimeTypes,
}: {
  area: OfficialAreaWithRate;
  metric: Metric;
  maxValue: number;
  breaks: number[];
  dataStatus: OfficialPayload['dataStatus'];
  crimeTypes: OfficialPayload['crimeTypes'];
}) {
  const value = metric === 'rate' ? area.ratePer100k : area.total;
  // 面積が値に比例するように半径は平方根でスケールさせる
  const radius = 6 + 20 * Math.sqrt(value / maxValue);
  const color = colorForValue(value, breaks);

  return (
    <CircleMarker
      center={[area.lat, area.lng]}
      radius={radius}
      pathOptions={{ color, fillColor: color, fillOpacity: 0.45, weight: 1.5 }}
    >
      <Popup>
        <div className="popup">
          <h3>{area.name}</h3>
          <div className="meta">
            {dataStatus === 'sample' && <strong>⚠️ サンプルデータ ・ </strong>}
            人口 約{area.population.toLocaleString()}人
          </div>
          <table>
            <tbody>
              <tr>
                <td>認知件数（合計）</td>
                <td>
                  <strong>{area.total.toLocaleString()}</strong> 件
                </td>
              </tr>
              <tr>
                <td>人口10万人あたり</td>
                <td>
                  <strong>{area.ratePer100k.toLocaleString()}</strong> 件
                </td>
              </tr>
              {crimeTypes.map((type) => (
                <tr key={type.key}>
                  <td className="muted">{type.label}</td>
                  <td className="muted">{(area.counts[type.key] ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function ReportMarker({
  report,
  onFlagged,
}: {
  report: Report;
  onFlagged: Props['onFlagged'];
}) {
  const category = getCategory(report.category);
  const [flagging, setFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);

  async function flag() {
    setFlagging(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/flag`, { method: 'POST' });
      const data = (await res.json()) as {
        hidden?: boolean;
        alreadyFlagged?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? '通報に失敗しました');
      setFlagged(true);
      onFlagged(report.id, Boolean(data.hidden), Boolean(data.alreadyFlagged));
    } catch {
      onFlagged(report.id, false, false);
    } finally {
      setFlagging(false);
    }
  }

  return (
    <Marker
      position={[report.lat, report.lng]}
      icon={pinIcon(category.color, category.emoji, false)}
    >
      <Popup>
        <div className="popup">
          <div className="meta">
            {category.emoji} {category.label} ・ {formatDate(report.occurredAt)}
          </div>
          <h3>{report.title}</h3>
          {report.body && <p>{report.body}</p>}
          <div className="popup-footer">
            <span className="muted">投稿: {formatDate(report.createdAt)}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={flag}
              disabled={flagging || flagged}
              title="不適切・虚偽と思われる投稿を通報します"
            >
              {flagged ? '通報済み' : '🚩 通報'}
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

/**
 * 既定のマーカー画像はバンドラごとにパス解決が壊れやすいので、
 * CSS で描ける divIcon を使う。
 */
function pinIcon(color: string, emoji: string, isDraft: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="pin${isDraft ? ' pin-draft' : ''}" style="background:${color}"><span>${emoji}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
