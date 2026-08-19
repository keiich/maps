'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import HistoryLoader from '@/components/history/HistoryLoader';
import type { BasemapId } from '@/components/history/HistoryMap';
import { MODES, cssColor, modeGlyphSvg } from '@/lib/history/modes';
import {
  RANGE_PRESETS,
  formatDate,
  formatDateTime,
  formatDistance,
  formatDuration,
  rangePreset,
  resolveRange,
} from '@/lib/history/ranges';
import type { RangeId } from '@/lib/history/ranges';
import { clearStored, loadStored, saveStored } from '@/lib/history/store';
import { decodeTimeline, reclassify } from '@/lib/history/timeline';
import type { CompactTimeline, ModeId, Timeline } from '@/lib/history/timeline';

// deck.gl は WebGL を触るのでサーバー側では読み込まない。
const HistoryMap = dynamic(() => import('@/components/history/HistoryMap'), {
  ssr: false,
  loading: () => <div className="map-loading">地図を準備しています…</div>,
});

const MIN_TRAIL_MS = 5 * 60_000;

const PLAY_SPEEDS = [
  { label: 'ゆっくり', sec: 90 },
  { label: '標準', sec: 40 },
  { label: '速い', sec: 15 },
  { label: '一気に', sec: 6 },
];

function trailFromSlider(slider: number, span: number): number {
  const max = Math.max(MIN_TRAIL_MS * 2, span);
  return Math.round(MIN_TRAIL_MS * (max / MIN_TRAIL_MS) ** (slider / 100));
}

function sliderFromTrail(trail: number, span: number): number {
  const max = Math.max(MIN_TRAIL_MS * 2, span);
  const v = (100 * Math.log(Math.max(MIN_TRAIL_MS, trail) / MIN_TRAIL_MS)) / Math.log(max / MIN_TRAIL_MS);
  return Math.min(100, Math.max(0, Math.round(v)));
}

export default function HistoryApp() {
  const [base, setBase] = useState<Timeline | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [booting, setBooting] = useState(true);
  const [showLoader, setShowLoader] = useState(false);

  // ---- 表示設定 -----------------------------------------------------------
  const [rangeId, setRangeId] = useState<RangeId>('1m');
  const [anchor, setAnchor] = useState<number | null>(null);
  const [useHint, setUseHint] = useState(true);
  const [hidden, setHidden] = useState<Set<ModeId>>(() => new Set());
  const [trailSlider, setTrailSlider] = useState(60);
  const [playing, setPlaying] = useState(false);
  const [playSec, setPlaySec] = useState(40);
  const [currentTime, setCurrentTime] = useState(0);
  const [is3D, setIs3D] = useState(false);
  const [spaceTime, setSpaceTime] = useState(true);
  const [cubeHeightM, setCubeHeightM] = useState(20_000);
  const [basemap, setBasemap] = useState<BasemapId>('dark');
  const [basemapOpacity, setBasemapOpacity] = useState(0.55);
  const [glow, setGlow] = useState(0.55);
  const [showStays, setShowStays] = useState(true);
  const [showIcons, setShowIcons] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fitKey, setFitKey] = useState(0);

  // ---- 起動時の読み込み ---------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await loadStored();
      if (!alive) return;
      if (stored) {
        try {
          setBase(decodeTimeline(stored.compact));
          setSourceName(stored.sourceName);
          setBooting(false);
          return;
        } catch {
          // 形式が古い等で読めなければ、置いてある方 / 読み込み画面に落とす。
        }
      }
      try {
        const res = await fetch('/api/history');
        if (alive && res.status === 200) {
          const compact = (await res.json()) as CompactTimeline;
          setBase(decodeTimeline(compact));
          setSourceName('data/timeline.json');
          setBooting(false);
          return;
        }
      } catch {
        /* 置いてなければブラウザから読み込んでもらう。 */
      }
      if (alive) {
        setBooting(false);
        setShowLoader(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 傾き方が変わると収まりも変わるので、寄せ直す。
  useEffect(() => {
    setFitKey((k) => k + 1);
  }, [is3D, spaceTime]);

  const handleLoaded = useCallback(
    (timeline: Timeline, compact: CompactTimeline, name: string) => {
      setBase(timeline);
      setSourceName(name);
      setShowLoader(false);
      setAnchor(null);
      setFitKey((k) => k + 1);
      void saveStored({ compact, sourceName: name, importedAt: Date.now() });
    },
    [],
  );

  // ---- 推定のやり直し -----------------------------------------------------
  const timeline = useMemo(() => {
    if (!base) return null;
    return useHint ? base : reclassify(base, { useHint: false });
  }, [base, useHint]);

  // ---- 期間 ---------------------------------------------------------------
  const range = useMemo(() => {
    if (!timeline) return { start: 0, end: 0 };
    return resolveRange(rangeId, anchor ?? timeline.t1, timeline.t0, timeline.t1);
  }, [timeline, rangeId, anchor]);

  const span = Math.max(1, range.end - range.start);
  const trailMs = useMemo(() => trailFromSlider(trailSlider, span), [trailSlider, span]);
  const wholeRangeTrail = trailSlider >= 100;

  // 期間が変わったら、再生ヘッドを右端に戻して全体が見える状態にする。
  const rangeKey = `${rangeId}:${range.start}:${range.end}`;
  const lastRangeKey = useRef('');
  useEffect(() => {
    if (!timeline || lastRangeKey.current === rangeKey) return;
    lastRangeKey.current = rangeKey;
    setCurrentTime(range.end);
    setPlaying(false);
    // 期間を選んだ直後は、その期間ぶんの軌跡を丸ごと出す。尾を引かせるのは再生を押してから。
    setTrailSlider(100);
    setFitKey((k) => k + 1);
  }, [rangeKey, range.end, timeline]);

  // ---- 再生 ---------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setCurrentTime((t) => {
        const next = t + (span / (playSec * 1000)) * dt;
        if (next >= range.end) {
          setPlaying(false);
          return range.end;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, span, playSec, range.end]);

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      if (p) return false;
      if (currentTime >= range.end - 1) setCurrentTime(range.start);
      // 全部出したままだと尾が引かないので、再生を始めるときだけ既定の長さに縮める。
      setTrailSlider((t) => {
        if (t < 100) return t;
        const preset = rangePreset(rangeId);
        return sliderFromTrail(preset.defaultTrailMs, preset.ms ?? span);
      });
      return true;
    });
  }, [currentTime, range.end, range.start, rangeId, span]);

  // ---- 期間内の区間と集計 -------------------------------------------------
  const inRange = useMemo(() => {
    if (!timeline) return [];
    return timeline.segments.filter((s) => s.t1 >= range.start && s.t0 <= range.end);
  }, [timeline, range.start, range.end]);

  const stats = useMemo(() => {
    const acc = new Map<ModeId, { count: number; distanceM: number; durationMs: number }>();
    let distanceM = 0;
    for (const s of inRange) {
      const cur = acc.get(s.mode) ?? { count: 0, distanceM: 0, durationMs: 0 };
      cur.count += 1;
      cur.distanceM += s.distanceM;
      cur.durationMs += s.t1 - s.t0;
      acc.set(s.mode, cur);
      distanceM += s.distanceM;
    }
    return { byMode: acc, distanceM, count: inRange.length };
  }, [inRange]);

  const visibleSegments = useMemo(
    () => (hidden.size ? inRange.filter((s) => !hidden.has(s.mode)) : inRange),
    [inRange, hidden],
  );

  const visibleStays = useMemo(() => {
    if (!timeline || !showStays) return [];
    return timeline.stays.filter((s) => s.t1 >= range.start && s.t0 <= range.end);
  }, [timeline, showStays, range.start, range.end]);

  const toggleMode = useCallback((id: ModeId) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---- 期間をずらす -------------------------------------------------------
  const shiftRange = useCallback(
    (dir: -1 | 1) => {
      if (!timeline) return;
      const preset = rangePreset(rangeId);
      if (preset.ms === null) return;
      const cur = anchor ?? timeline.t1;
      setAnchor(Math.min(timeline.t1, Math.max(timeline.t0 + preset.ms, cur + dir * preset.ms)));
    },
    [anchor, rangeId, timeline],
  );

  const resetData = useCallback(async () => {
    await clearStored();
    setBase(null);
    setSourceName('');
    setShowLoader(true);
  }, []);

  if (booting) {
    return (
      <div className="history-shell">
        <div className="map-loading">読み込んでいます…</div>
      </div>
    );
  }

  const activePreset = rangePreset(rangeId);
  const modesWithData = MODES.filter((m) => stats.byMode.has(m.id));

  return (
    <div className="history-shell">
      {timeline && (
        <HistoryMap
          segments={visibleSegments}
          stays={visibleStays}
          rangeStart={range.start}
          rangeEnd={range.end}
          currentTime={currentTime}
          trailMs={wholeRangeTrail ? span * 1.05 : trailMs}
          is3D={is3D}
          spaceTime={spaceTime}
          cubeHeightM={cubeHeightM}
          basemap={basemap}
          basemapOpacity={basemapOpacity}
          showStays={showStays}
          showIcons={showIcons}
          glow={glow}
          fitKey={fitKey}
        />
      )}

      <header className="history-top">
        <div className="history-brand">
          <span className="history-dot" aria-hidden />
          行動履歴ビューア
        </div>

        <nav className="range-tabs" aria-label="表示する期間">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === rangeId ? 'is-active' : ''}
              onClick={() => {
                setRangeId(p.id);
                setAnchor(null);
              }}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <div className="history-top-right">
          <button
            type="button"
            className={`btn-toggle${is3D ? ' is-on' : ''}`}
            onClick={() => setIs3D((v) => !v)}
            title="地図を傾けて立体表示に切り替えます"
          >
            {is3D ? '3D' : '2D'}
          </button>
          <button
            type="button"
            className="btn-toggle panel-toggle"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
          >
            設定
          </button>
        </div>
      </header>

      {timeline && (
        <aside className={`history-panel${panelOpen ? ' is-open' : ''}`}>
          <button type="button" className="panel-close" onClick={() => setPanelOpen(false)}>
            閉じる
          </button>

          <section className="panel-section">
            <h2>期間</h2>
            <div className="range-nav">
              <button type="button" onClick={() => shiftRange(-1)} disabled={activePreset.ms === null}>
                ←
              </button>
              <span>
                {formatDate(range.start)} 〜 {formatDate(range.end)}
              </span>
              <button
                type="button"
                onClick={() => shiftRange(1)}
                disabled={activePreset.ms === null || range.end >= timeline.t1}
              >
                →
              </button>
            </div>
            <p className="panel-note">
              記録全体: {formatDate(timeline.t0)} 〜 {formatDate(timeline.t1)}
            </p>
          </section>

          <section className="panel-section">
            <h2>軌跡</h2>
            <label className="ctl">
              <span>
                残す長さ
                <b>{wholeRangeTrail ? '期間まるごと' : formatDuration(trailMs)}</b>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={trailSlider}
                onChange={(e) => setTrailSlider(Number(e.target.value))}
              />
            </label>
            <label className="ctl">
              <span>
                発光の強さ<b>{Math.round(glow * 100)}%</b>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(glow * 100)}
                onChange={(e) => setGlow(Number(e.target.value) / 100)}
              />
            </label>
            <label className="ctl-check">
              <input type="checkbox" checked={showIcons} onChange={(e) => setShowIcons(e.target.checked)} />
              移動手段のアイコンを出す
            </label>
            <label className="ctl-check">
              <input type="checkbox" checked={showStays} onChange={(e) => setShowStays(e.target.checked)} />
              滞在した場所を出す
            </label>
          </section>

          <section className="panel-section">
            <h2>立体表示</h2>
            <label className="ctl-check">
              <input type="checkbox" checked={is3D} onChange={(e) => setIs3D(e.target.checked)} />
              3D にする（右ドラッグ / 2本指で回転）
            </label>
            <label className="ctl-check">
              <input
                type="checkbox"
                checked={spaceTime}
                disabled={!is3D}
                onChange={(e) => setSpaceTime(e.target.checked)}
              />
              時間を高さにする（時空間キューブ）
            </label>
            <label className="ctl">
              <span>
                高さの倍率<b>{Math.round(cubeHeightM / 1000)}km</b>
              </span>
              <input
                type="range"
                min={2}
                max={200}
                value={Math.round(cubeHeightM / 1000)}
                disabled={!is3D || !spaceTime}
                onChange={(e) => setCubeHeightM(Number(e.target.value) * 1000)}
              />
            </label>
            <p className="panel-note">
              期間の古い方が下、新しい方が上に積み上がります。毎日の通勤のような繰り返しは、縦に並んだ
              同じ形として見えます。
            </p>
          </section>

          <section className="panel-section">
            <h2>移動手段の推定</h2>
            <label className="ctl-check">
              <input type="checkbox" checked={useHint} onChange={(e) => setUseHint(e.target.checked)} />
              Google のラベルも参考にする
            </label>
            <p className="panel-note">
              速度と直進度だけでは、15〜45km/h に重なる 車・バス・電車・スキー を分けきれません。
              off にすると速度と形だけで推定します（バス・スキーはほぼ出なくなります）。
            </p>
          </section>

          <section className="panel-section">
            <h2>地図</h2>
            <div className="seg-buttons">
              {(
                [
                  ['dark', 'OSM(暗)'],
                  ['osm', 'OSM'],
                  ['none', 'なし'],
                ] as [BasemapId, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={basemap === id ? 'is-active' : ''}
                  onClick={() => setBasemap(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="ctl">
              <span>
                地図の濃さ<b>{Math.round(basemapOpacity * 100)}%</b>
              </span>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(basemapOpacity * 100)}
                disabled={basemap === 'none'}
                onChange={(e) => setBasemapOpacity(Number(e.target.value) / 100)}
              />
            </label>
          </section>

          <section className="panel-section">
            <h2>データ</h2>
            <p className="panel-note">
              読み込み元: {sourceName || '不明'}
              <br />
              位置情報はこの端末から出ていません。
            </p>
            <div className="panel-buttons">
              <button type="button" className="btn-ghost" onClick={() => setShowLoader(true)}>
                別のファイルを読む
              </button>
              <button type="button" className="btn-ghost" onClick={() => void resetData()}>
                保存を消す
              </button>
            </div>
          </section>
        </aside>
      )}

      {timeline && (
        <section className="history-legend" aria-label="移動手段の内訳">
          <div className="legend-head">
            <b>{formatDistance(stats.distanceM)}</b>
            <span>{stats.count.toLocaleString('ja-JP')} 区間</span>
          </div>
          <ul>
            {modesWithData.map((m) => {
              const s = stats.byMode.get(m.id)!;
              const off = hidden.has(m.id);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={off ? 'is-off' : ''}
                    onClick={() => toggleMode(m.id)}
                    title={`${m.label}を${off ? '表示' : '非表示に'}`}
                  >
                    <span
                      className="legend-icon"
                      style={{ borderColor: cssColor(m.color) }}
                      dangerouslySetInnerHTML={{ __html: modeGlyphSvg(m.id) }}
                    />
                    <span className="legend-label">{m.label}</span>
                    <span className="legend-value">{formatDistance(s.distanceM)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {timeline && inRange.length === 0 && (
        <div className="history-empty">
          <b>この期間には移動の記録がありません</b>
          <span>設定パネルの ← → で期間をずらすか、上のタブで長い期間を選んでください。</span>
        </div>
      )}

      {timeline && (
        <footer className="history-timebar">
          <button type="button" className="btn-play" onClick={togglePlay} aria-label={playing ? '一時停止' : '再生'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="timebar-main">
            <input
              type="range"
              min={range.start}
              max={range.end}
              step={Math.max(1000, Math.round(span / 2000))}
              value={Math.round(currentTime)}
              onChange={(e) => {
                setPlaying(false);
                setCurrentTime(Number(e.target.value));
              }}
              aria-label="時刻"
            />
            <div className="timebar-labels">
              <span>{formatDate(range.start)}</span>
              <b>{formatDateTime(currentTime)}</b>
              <span>{formatDate(range.end)}</span>
            </div>
          </div>
          <div className="speed-buttons">
            {PLAY_SPEEDS.map((s) => (
              <button
                key={s.sec}
                type="button"
                className={playSec === s.sec ? 'is-active' : ''}
                onClick={() => setPlaySec(s.sec)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </footer>
      )}

      {(showLoader || !timeline) && (
        <HistoryLoader onLoaded={handleLoaded} onCancel={timeline ? () => setShowLoader(false) : undefined} />
      )}
    </div>
  );
}
