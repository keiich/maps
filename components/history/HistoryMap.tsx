'use client';

import { WebMercatorViewport } from '@deck.gl/core';
import { TileLayer, TripsLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { modeIconUrl, modeMeta } from '@/lib/history/modes';
import { formatDateTime, formatDistance, formatDuration } from '@/lib/history/ranges';
import type { Segment, Stay } from '@/lib/history/timeline';

export type BasemapId = 'osm' | 'dark' | 'none';

const BASEMAPS: Record<Exclude<BasemapId, 'none'>, { urls: string[]; maxZoom: number }> = {
  // どちらも OpenStreetMap のデータ。dark は暗い配色に焼き直したタイルで、軌跡の発光が映える。
  osm: { urls: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], maxZoom: 19 },
  dark: {
    urls: [
      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    ],
    maxZoom: 19,
  },
};

export interface ViewStateLike {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const INITIAL_VIEW: ViewStateLike = {
  longitude: 139.7671,
  latitude: 35.6812,
  zoom: 9,
  pitch: 0,
  bearing: 0,
};

/** 加算合成。重なった軌跡ほど明るくなるので、よく通る道が自然に浮かび上がる。 */
const ADDITIVE = {
  blend: true,
  blendColorOperation: 'add',
  blendColorSrcFactor: 'src-alpha',
  blendColorDstFactor: 'one',
  blendAlphaOperation: 'add',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one',
  depthWriteEnabled: false,
} as const;

interface Trip {
  seg: Segment;
  path: [number, number, number][];
  timestamps: number[];
}

export interface HistoryMapProps {
  segments: Segment[];
  stays: Stay[];
  rangeStart: number;
  rangeEnd: number;
  /** 再生ヘッドの時刻 (ms)。 */
  currentTime: number;
  /** 軌跡を残す長さ (ms)。 */
  trailMs: number;
  is3D: boolean;
  /** 3D のとき、時間を高さに置き換えて時空間キューブにする。 */
  spaceTime: boolean;
  /** 時空間キューブの高さ (m)。 */
  cubeHeightM: number;
  basemap: BasemapId;
  basemapOpacity: number;
  showStays: boolean;
  showIcons: boolean;
  glow: number;
  /** 変わるたびに軌跡全体が画面に収まるよう寄せ直す。 */
  fitKey: number;
}

export default function HistoryMap({
  segments,
  stays,
  rangeStart,
  rangeEnd,
  currentTime,
  trailMs,
  is3D,
  spaceTime,
  cubeHeightM,
  basemap,
  basemapOpacity,
  showStays,
  showIcons,
  glow,
  fitKey,
}: HistoryMapProps) {
  const [viewState, setViewState] = useState<ViewStateLike>(INITIAL_VIEW);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ width: r.width, height: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 3D を切るときは必ず真上から見た状態に戻す。傾いたまま「2D」と表示されると混乱する。
  useEffect(() => {
    if (!is3D) setViewState((v) => ({ ...v, pitch: 0, bearing: 0 }));
    else setViewState((v) => (v.pitch === 0 ? { ...v, pitch: 50 } : v));
  }, [is3D]);

  const zScale = spaceTime && is3D ? cubeHeightM / Math.max(1, rangeEnd - rangeStart) : 0;

  const trips = useMemo<Trip[]>(
    () =>
      segments.map((seg) => ({
        seg,
        // TripsLayer の時刻は float32 で GPU に渡るので、epoch ms のままだと桁が足りない。
        // 期間の先頭からの秒数に直してから渡す。
        path: seg.path.map(
          (p, i) => [p[0], p[1], (seg.times[i] - rangeStart) * zScale] as [number, number, number],
        ),
        timestamps: seg.times.map((t) => (t - rangeStart) / 1000),
      })),
    [segments, rangeStart, zScale],
  );

  const nowSec = (currentTime - rangeStart) / 1000;
  const trailSec = Math.max(1, trailMs / 1000);

  /** 軌跡の先頭（＝いまの位置）に置くアイコン。多すぎると邪魔なので新しいものから間引く。 */
  const heads = useMemo(() => {
    const windowStart = currentTime - trailMs;
    const out: { seg: Segment; position: [number, number, number]; t: number }[] = [];
    for (const seg of segments) {
      const t = Math.min(currentTime, seg.t1);
      if (t < windowStart || seg.t0 > currentTime) continue;
      out.push({ seg, position: positionAt(seg, t, rangeStart, zScale), t });
    }
    out.sort((a, b) => b.t - a.t);
    // 全部出すと駅や自宅にアイコンが積み上がって読めなくなるので、新しい順に打ち切る。
    return out.slice(0, 150);
  }, [segments, currentTime, trailMs, rangeStart, zScale]);

  const visibleStays = useMemo(() => {
    if (!showStays) return [];
    const windowStart = currentTime - trailMs;
    return stays.filter((s) => s.t1 >= windowStart && s.t0 <= currentTime).slice(-1500);
  }, [stays, showStays, currentTime, trailMs]);

  // 期間やデータが変わったら、その中身が画面に収まる位置へ寄せ直す。
  useEffect(() => {
    if (!segments.length || size.width < 40 || size.height < 40) return;

    // まずは全部が入る矩形。ふつうはこれでいい。
    const lngs: number[] = [];
    const lats: number[] = [];
    let total = 0;
    for (const seg of segments) total += seg.path.length;
    const stride = Math.max(1, Math.floor(total / 20000));
    let i = 0;
    for (const seg of segments) {
      for (const [lng, lat] of seg.path) {
        if (i++ % stride === 0) {
          lngs.push(lng);
          lats.push(lat);
        }
      }
    }
    if (lngs.length < 2) return;
    lngs.sort((a, b) => a - b);
    lats.sort((a, b) => a - b);
    const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.round((arr.length - 1) * p))];

    // 大陸をまたぐ飛行機が混ざると、全部入れようとして地球規模まで引いてしまい、
    // 毎日を過ごしている範囲が数ピクセルに潰れる。そのときだけ分布の 2〜98% に寄せる
    // （飛行機は画面の外にはみ出す）。国内で収まっているうちは全部入れたままにする。
    const wide = q(lngs, 1) - q(lngs, 0) > 20 || q(lats, 1) - q(lats, 0) > 20;
    const lo = wide ? 0.02 : 0;
    const hi = wide ? 0.98 : 1;
    let minLng = q(lngs, lo);
    let maxLng = q(lngs, hi);
    let minLat = q(lats, lo);
    let maxLat = q(lats, hi);

    // 1 日ぶんなど、ほとんど動いていないときは潰れないように広げる。
    if (maxLng - minLng < 0.004) {
      const c = (maxLng + minLng) / 2;
      minLng = c - 0.002;
      maxLng = c + 0.002;
    }
    if (maxLat - minLat < 0.004) {
      const c = (maxLat + minLat) / 2;
      minLat = c - 0.002;
      maxLat = c + 0.002;
    }
    const pad = 0.002;
    try {
      // 凡例・設定パネル・時間バーが地図の上に重なっているので、その分を空けて寄せる。
      // そうしないと軌跡の端がパネルの裏に隠れる。
      const clamp = (v: number, limit: number) => Math.max(16, Math.min(v, limit * 0.38));
      const padding = {
        top: clamp(70, size.height),
        bottom: clamp(size.width <= 720 ? 250 : 120, size.height),
        left: clamp(size.width <= 720 ? 24 : 246, size.width),
        right: clamp(size.width >= 1180 ? 352 : 24, size.width),
      };
      const fitted = new WebMercatorViewport({ width: size.width, height: size.height }).fitBounds(
        [
          [minLng - pad, minLat - pad],
          [maxLng + pad, maxLat + pad],
        ],
        { padding, maxZoom: 15 },
      );
      // 傾けると画面の奥行きを使う分だけはみ出すので、その分だけ引いて見せる。
      // 時間を高さにしているときは縦にも伸びるので、さらに引く。
      const back = is3D ? (spaceTime ? 0.8 : 0.3) : 0;
      setViewState((v) => ({
        ...v,
        longitude: fitted.longitude,
        latitude: fitted.latitude,
        zoom: Math.max(1, fitted.zoom - back),
      }));
    } catch {
      // 1 点しかない等で収まりを計算できないときは動かさない。
    }
    // fitKey が変わったときだけ寄せ直す。地図を動かすたびに戻されると操作できない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.width, size.height]);

  const layers = useMemo(() => {
    const list: unknown[] = [];

    if (basemap !== 'none') {
      const conf = BASEMAPS[basemap];
      list.push(
        new TileLayer({
          id: `basemap-${basemap}`,
          data: conf.urls,
          minZoom: 0,
          maxZoom: conf.maxZoom,
          tileSize: 256,
          opacity: basemapOpacity,
          renderSubLayers: (props: any) => {
            const { boundingBox } = props.tile;
            return new BitmapLayer(props, {
              data: undefined,
              image: props.data,
              bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
            });
          },
        }),
      );
    }

    const common = {
      data: trips,
      getPath: (d: Trip) => d.path,
      getTimestamps: (d: Trip) => d.timestamps,
      getColor: (d: Trip) => modeMeta(d.seg.mode).color,
      currentTime: nowSec,
      trailLength: trailSec,
      fadeTrail: true,
      capRounded: true,
      jointRounded: true,
      widthUnits: 'pixels' as const,
      parameters: ADDITIVE,
      updateTriggers: { getColor: segments },
    };

    // 太くて淡い層と細くて明るい層を重ねると、光が滲んでいるように見える。
    list.push(
      new TripsLayer<Trip>({
        ...common,
        id: 'trails-glow',
        getWidth: (d: Trip) => modeMeta(d.seg.mode).width * 5.5,
        widthMinPixels: 3,
        widthMaxPixels: 15,
        opacity: 0.1 + 0.28 * glow,
      }),
      new TripsLayer<Trip>({
        ...common,
        id: 'trails-core',
        getWidth: (d: Trip) => modeMeta(d.seg.mode).width * 1.6,
        widthMinPixels: 1.2,
        widthMaxPixels: 5,
        opacity: 0.55 + 0.45 * glow,
        pickable: true,
      }),
    );

    if (visibleStays.length) {
      list.push(
        new ScatterplotLayer<Stay>({
          id: 'stays',
          data: visibleStays,
          getPosition: (d: Stay) => [d.lng, d.lat, (d.t0 - rangeStart) * zScale],
          // 長く居た場所ほど大きく。ただし軌跡より目立たせない。
          getRadius: (d: Stay) => 3 + Math.sqrt(Math.max(0, d.t1 - d.t0) / 60_000) / 2.5,
          radiusUnits: 'pixels',
          radiusMinPixels: 2,
          radiusMaxPixels: 13,
          getFillColor: [226, 240, 255, 20],
          getLineColor: [226, 240, 255, 70],
          lineWidthMinPixels: 1,
          stroked: true,
          filled: true,
          parameters: { depthWriteEnabled: false },
        }),
      );
    }

    if (showIcons && heads.length) {
      list.push(
        new IconLayer<(typeof heads)[number]>({
          id: 'mode-icons',
          data: heads,
          getPosition: (d) => d.position,
          getIcon: (d) => ({
            id: d.seg.mode,
            url: modeIconUrl(d.seg.mode),
            width: 44,
            height: 44,
            anchorX: 22,
            anchorY: 22,
          }),
          getSize: 23,
          sizeUnits: 'pixels',
          sizeMinPixels: 14,
          sizeMaxPixels: 30,
          billboard: true,
          pickable: true,
          parameters: { depthWriteEnabled: false },
          updateTriggers: { getIcon: heads },
        }),
      );
    }

    return list;
  }, [
    basemap,
    basemapOpacity,
    trips,
    segments,
    nowSec,
    trailSec,
    glow,
    visibleStays,
    heads,
    showIcons,
    rangeStart,
    zScale,
  ]);

  const getTooltip = useCallback(({ object }: { object?: unknown }) => {
    const seg = (object as Trip | { seg: Segment } | undefined)?.seg;
    if (!seg) return null;
    const meta = modeMeta(seg.mode);
    const label = `${meta.label}${seg.hint && seg.hint !== seg.mode ? `（Googleのラベル: ${modeMeta(seg.hint).label}）` : ''}`;
    return {
      html:
        `<div class="hm-tip"><b>${label}</b>` +
        `<span>${formatDateTime(seg.t0)} → ${formatDateTime(seg.t1)}</span>` +
        `<span>${formatDistance(seg.distanceM)} / ${formatDuration(seg.t1 - seg.t0)}</span>` +
        `<span>中央値 ${seg.medianKmh.toFixed(1)} km/h・最高 ${seg.peakKmh.toFixed(1)} km/h</span>` +
        `<span class="hm-tip-reason">${seg.reason}</span></div>`,
      style: { background: 'transparent', boxShadow: 'none', padding: '0' },
    };
  }, []);

  return (
    <div ref={hostRef} className="history-map">
      <DeckGL
        viewState={viewState as never}
        onViewStateChange={(e: { viewState: unknown }) => setViewState(e.viewState as ViewStateLike)}
        controller={{ dragRotate: is3D, touchRotate: is3D, inertia: 250 }}
        layers={layers as never}
        getTooltip={getTooltip as never}
        style={{ position: 'absolute', inset: '0' }}
      />
      <div className="map-attribution">
        {basemap === 'none' ? (
          <>データ: Google タイムライン</>
        ) : (
          <>
            地図: ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{' '}
            contributors
            {basemap === 'dark' && (
              <>
                {' '}
                / タイル ©{' '}
                <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">
                  CARTO
                </a>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 区間の中で時刻 t の位置を線形補間する。 */
function positionAt(seg: Segment, t: number, rangeStart: number, zScale: number): [number, number, number] {
  const times = seg.times;
  if (t <= times[0]) return [seg.path[0][0], seg.path[0][1], (times[0] - rangeStart) * zScale];
  const last = times.length - 1;
  if (t >= times[last]) return [seg.path[last][0], seg.path[last][1], (times[last] - rangeStart) * zScale];

  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo];
  const f = span > 0 ? (t - times[lo]) / span : 0;
  return [
    seg.path[lo][0] + (seg.path[hi][0] - seg.path[lo][0]) * f,
    seg.path[lo][1] + (seg.path[hi][1] - seg.path[lo][1]) * f,
    (t - rangeStart) * zScale,
  ];
}
