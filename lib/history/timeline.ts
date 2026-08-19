/**
 * Google タイムライン (Android の locationhistory.json) を、地図に描ける軌跡へ変換する。
 *
 * このファイルは意図的に依存ゼロ・相対 import なしで書いてある。ブラウザ（アップロードした
 * ファイルをその場で解析する経路）と Node のスクリプト（事前に変換しておく経路）の両方から
 * 同じコードを使いたいため。Node からは拡張子つきで直接 import できる。
 */

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export type ModeId =
  | 'stay'
  | 'walk'
  | 'run'
  | 'bike'
  | 'car'
  | 'bus'
  | 'train'
  | 'subway'
  | 'tram'
  | 'ferry'
  | 'motorcycle'
  | 'ski'
  | 'plane'
  | 'unknown';

/** 速度推定に使う、区間ごとの特徴量。モードの再計算はこれだけあれば足りる。 */
export interface SegmentStats {
  /** 移動距離の合計 (m)。 */
  distanceM: number;
  /** 始点と終点の直線距離 (m)。 */
  netM: number;
  /** 所要時間 (秒)。 */
  durationS: number;
  /** 速度サンプルの中央値 (km/h)。 */
  medianKmh: number;
  /** 速度サンプルの 90 パーセンタイル (km/h)。外れ値に強い「最高速度」。 */
  peakKmh: number;
  /** netM / distanceM。1 に近いほど一直線、0 に近いほど行ったり来たり。 */
  straightness: number;
}

export interface Segment extends SegmentStats {
  id: number;
  /** 開始・終了時刻 (epoch ms)。 */
  t0: number;
  t1: number;
  /** 速度から推定した移動手段。 */
  mode: ModeId;
  /** Google 自身が付けていたラベル。無い区間は null。 */
  hint: ModeId | null;
  /** 推定の確からしさ 0–1。 */
  confidence: number;
  /** なぜそう推定したかの説明（ツールチップに出す）。 */
  reason: string;
  /** [lng, lat] の並び。deck.gl がこの順を要求する。 */
  path: [number, number][];
  /** path と同じ長さの epoch ms。 */
  times: number[];
}

/** 滞在（Google の visit）。移動ではないので軌跡とは別に持つ。 */
export interface Stay {
  t0: number;
  t1: number;
  lng: number;
  lat: number;
}

export interface Timeline {
  segments: Segment[];
  stays: Stay[];
  /** データ全体の期間。 */
  t0: number;
  t1: number;
}

export interface ClassifyOptions {
  /**
   * Google のラベルを補助的に使うか。false にすると純粋に速度と形だけで推定する。
   * 速度だけでは電車・バス・車・スキーを分けきれないので、既定では true。
   */
  useHint: boolean;
}

export const DEFAULT_CLASSIFY_OPTIONS: ClassifyOptions = { useHint: true };

// ---------------------------------------------------------------------------
// 幾何
// ---------------------------------------------------------------------------

const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;

/** 2 点間の大円距離 (m)。 */
export function haversine(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLng = (lng2 - lng1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "geo:35.681236,139.767125" → [lng, lat]。壊れていれば null。 */
function parseGeo(value: unknown): [number, number] | null {
  if (typeof value !== 'string') return null;
  const body = value.startsWith('geo:') ? value.slice(4) : value;
  const comma = body.indexOf(',');
  if (comma < 0) return null;
  const lat = Number(body.slice(0, comma));
  const lng = Number(body.slice(comma + 1));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

function parseTime(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  return Date.parse(value);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ---------------------------------------------------------------------------
// Google のラベル正規化
// ---------------------------------------------------------------------------

const HINT_TABLE: Record<string, ModeId> = {
  walking: 'walk',
  'on foot': 'walk',
  hiking: 'walk',
  'in wheelchair': 'walk',
  running: 'run',
  cycling: 'bike',
  'in passenger vehicle': 'car',
  'in vehicle': 'car',
  'in taxi': 'car',
  driving: 'car',
  'in bus': 'bus',
  'in train': 'train',
  'in subway': 'subway',
  'in tram': 'tram',
  'in ferry': 'ferry',
  boating: 'ferry',
  sailing: 'ferry',
  motorcycling: 'motorcycle',
  skiing: 'ski',
  snowboarding: 'ski',
  flying: 'plane',
  still: 'stay',
};

function normalizeHint(type: unknown): ModeId | null {
  if (typeof type !== 'string') return null;
  return HINT_TABLE[type.trim().toLowerCase()] ?? null;
}

/** 速度帯だけでは分けきれない手段。ラベルがあれば素直に採用する。 */
const VEHICLE_HINTS: ReadonlySet<ModeId> = new Set<ModeId>([
  'car',
  'bus',
  'train',
  'subway',
  'tram',
  'ferry',
  'motorcycle',
  'ski',
]);

// ---------------------------------------------------------------------------
// 速度から移動手段を推定する
// ---------------------------------------------------------------------------

export interface Classification {
  mode: ModeId;
  confidence: number;
  reason: string;
}

const kmh = (v: number) => `${v.toFixed(1)}km/h`;

/**
 * 区間の速度と形から移動手段を決める。
 *
 * 速度が主役。ただし 15–45km/h の帯には車・バス・電車・スキーが全部入ってしまい、
 * 速度だけでは原理的に分離できない。そこで「速度で候補を絞り、同じ帯の中で迷ったときだけ
 * Google のラベルで決める」という順序にしている。opts.useHint = false ならラベルを一切見ず、
 * 速度と直進度だけで決める（UI から切り替えられる）。
 */
export function classify(
  s: SegmentStats,
  hint: ModeId | null,
  opts: ClassifyOptions = DEFAULT_CLASSIFY_OPTIONS,
): Classification {
  const v = s.medianKmh;
  const peak = s.peakKmh;
  const straight = s.straightness;
  const km = s.distanceM / 1000;
  const useHint = opts.useHint && hint !== null;

  // 飛行機。地上の乗り物では出ない速度域。
  // 新幹線は長距離だと平均 200km/h を超えるので、平均ではなく最高速度で切る。
  if (peak >= 260 || v >= 300) {
    // 短い区間で急に速いのは、トンネルなどで GPS が飛んだだけのことが多い。
    if (useHint && VEHICLE_HINTS.has(hint as ModeId) && km < 80) {
      return { mode: hint as ModeId, confidence: 0.4, reason: `最高${kmh(peak)} — 短距離で不自然に速く、測位の飛びとみなした` };
    }
    return { mode: 'plane', confidence: 0.95, reason: `最高${kmh(peak)} — 航空機以外では出ない速度` };
  }

  // ほぼ動いていない。
  if (v < 1.2 && s.netM < 250) {
    return { mode: 'stay', confidence: 0.9, reason: `中央値${kmh(v)} — ほぼ移動なし` };
  }

  // 徒歩帯。
  if (v < 6.5) {
    if (useHint && hint === 'run' && peak >= 8) {
      return { mode: 'run', confidence: 0.6, reason: `中央値${kmh(v)} — 徒歩帯だがラベルは走行` };
    }
    return { mode: 'walk', confidence: 0.9, reason: `中央値${kmh(v)} — 徒歩の速度域` };
  }

  // 走る・自転車帯。
  if (v < 15) {
    if (useHint && (hint === 'run' || hint === 'walk' || hint === 'bike')) {
      return { mode: hint, confidence: 0.75, reason: `中央値${kmh(v)} — 自転車/走行の速度域、ラベルで確定` };
    }
    if (useHint && VEHICLE_HINTS.has(hint as ModeId)) {
      return { mode: hint as ModeId, confidence: 0.5, reason: `中央値${kmh(v)} — 低速だが乗り物のラベルあり（渋滞・徐行）` };
    }
    return { mode: 'bike', confidence: 0.6, reason: `中央値${kmh(v)} — 徒歩より速く車より遅い` };
  }

  // 15–45km/h。市街地の車・バス・各停の電車・スキーが重なる、いちばん厄介な帯。
  if (v < 45) {
    if (useHint && VEHICLE_HINTS.has(hint as ModeId)) {
      return { mode: hint as ModeId, confidence: 0.8, reason: `中央値${kmh(v)} — 車/バス/電車が重なる速度帯、ラベルで確定` };
    }
    if (useHint && (hint === 'bike' || hint === 'run')) {
      return { mode: hint, confidence: 0.6, reason: `中央値${kmh(v)} — 下り坂などで速い自転車/走行` };
    }
    if (straight > 0.9 && km > 8) {
      return { mode: 'train', confidence: 0.55, reason: `中央値${kmh(v)}・直進度${straight.toFixed(2)} — 線路のように真っ直ぐ` };
    }
    // 短い距離を行ったり来たりしながらそこそこ速い＝ゲレンデを何本も滑っている形。
    if (straight < 0.15 && peak >= 25 && km > 1.5 && km < 25 && s.durationS > 1800) {
      return { mode: 'ski', confidence: 0.4, reason: `最高${kmh(peak)}・直進度${straight.toFixed(2)} — 同じ斜面の往復` };
    }
    if (peak < 35) {
      return { mode: 'bus', confidence: 0.35, reason: `中央値${kmh(v)}・最高${kmh(peak)} — 停車が多く伸びない` };
    }
    return { mode: 'car', confidence: 0.5, reason: `中央値${kmh(v)}・直進度${straight.toFixed(2)} — 市街地の自動車` };
  }

  // 45–130km/h。車（幹線・高速）と電車。
  if (v < 130) {
    if (useHint && VEHICLE_HINTS.has(hint as ModeId)) {
      return { mode: hint as ModeId, confidence: 0.85, reason: `中央値${kmh(v)} — 車/電車が重なる速度帯、ラベルで確定` };
    }
    if (straight > 0.85 && km > 15) {
      return { mode: 'train', confidence: 0.6, reason: `中央値${kmh(v)}・直進度${straight.toFixed(2)} — 高速で真っ直ぐ` };
    }
    return { mode: 'car', confidence: 0.6, reason: `中央値${kmh(v)} — 自動車の巡航速度` };
  }

  // 130–250km/h。日本では新幹線がここ。
  if (useHint && hint === 'plane') {
    return { mode: 'plane', confidence: 0.7, reason: `中央値${kmh(v)} — 離着陸中の航空機` };
  }
  return { mode: 'train', confidence: 0.75, reason: `中央値${kmh(v)} — 新幹線・特急の速度域` };
}

// ---------------------------------------------------------------------------
// 特徴量の計算
// ---------------------------------------------------------------------------

/**
 * 速度サンプルを作る。timelinePath の時刻は「分」刻みなので、隣り合う点をそのまま割ると
 * 0 除算や桁違いの値が出る。最低 window ミリ秒ぶん進んでからサンプルを 1 つ出す。
 */
function speedSamples(path: [number, number][], times: number[], window = 45_000): number[] {
  const out: number[] = [];
  let anchor = 0;
  let dist = 0;
  for (let i = 1; i < path.length; i += 1) {
    dist += haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
    const dt = times[i] - times[anchor];
    if (dt >= window) {
      out.push((dist / dt) * 3600); // m/ms → km/h
      anchor = i;
      dist = 0;
    }
  }
  return out;
}

export function computeStats(path: [number, number][], times: number[]): SegmentStats {
  let distanceM = 0;
  for (let i = 1; i < path.length; i += 1) {
    distanceM += haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  const last = path.length - 1;
  const netM = path.length > 1 ? haversine(path[0][0], path[0][1], path[last][0], path[last][1]) : 0;
  const durationS = Math.max(0, (times[last] - times[0]) / 1000);

  const samples = speedSamples(path, times).sort((a, b) => a - b);
  const avgKmh = durationS > 0 ? (distanceM / durationS) * 3.6 : 0;
  // サンプルが取れないほど短い区間は、全体の平均速度で代用する。
  const medianKmh = samples.length ? percentile(samples, 0.5) : avgKmh;
  const peakKmh = samples.length ? percentile(samples, 0.9) : avgKmh;

  return {
    distanceM,
    netM,
    durationS,
    medianKmh,
    peakKmh,
    straightness: distanceM > 0 ? Math.min(1, netM / distanceM) : 0,
  };
}

// ---------------------------------------------------------------------------
// 生 JSON → Timeline
// ---------------------------------------------------------------------------

interface RawPoint {
  t: number;
  lng: number;
  lat: number;
}

interface RawActivity {
  t0: number;
  t1: number;
  from: [number, number];
  to: [number, number];
  hint: ModeId | null;
}

/** 移動が途切れたとみなす間隔。これ以上空いたら別の区間に切る。 */
const GAP_MS = 20 * 60 * 1000;
/** これ以下しか動いていない区間は捨てる（GPS の揺れ）。 */
const MIN_SEGMENT_M = 60;

export interface BuildOptions {
  classify?: ClassifyOptions;
  /** 0–1 の進捗を返す。重いので数回しか呼ばない。 */
  onProgress?: (ratio: number, label: string) => void;
}

/**
 * Google の書き出した配列から Timeline を作る。
 *
 * 3 種類のレコードを組み合わせている。
 * - timelinePath: 実際に通った点列。軌跡の形はここから来る。
 * - activity: A→B の移動と Google のラベル。点列が無い区間（飛行機など）はこれで直線を引く。
 * - visit: 滞在。移動ではないので別枠。
 */
export function buildTimeline(raw: unknown, options: BuildOptions = {}): Timeline {
  const entries = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { semanticSegments?: unknown[] })?.semanticSegments)
      ? (raw as { semanticSegments: unknown[] }).semanticSegments
      : null;
  if (!entries) {
    throw new Error('見覚えのない形式です。Google タイムラインの locationhistory.json を渡してください。');
  }

  const progress = options.onProgress ?? (() => {});
  const points: RawPoint[] = [];
  const activities: RawActivity[] = [];
  const stays: Stay[] = [];

  progress(0.05, 'レコードを読んでいます');

  for (const entry of entries as Record<string, any>[]) {
    if (!entry || typeof entry !== 'object') continue;
    const t0 = parseTime(entry.startTime);
    const t1 = parseTime(entry.endTime);
    if (!Number.isFinite(t0)) continue;

    if (Array.isArray(entry.timelinePath)) {
      for (const p of entry.timelinePath) {
        const geo = parseGeo(p?.point);
        if (!geo) continue;
        const offset = Number(p?.durationMinutesOffsetFromStartTime ?? 0);
        if (!Number.isFinite(offset)) continue;
        points.push({ t: t0 + offset * 60_000, lng: geo[0], lat: geo[1] });
      }
      continue;
    }

    if (entry.activity) {
      const from = parseGeo(entry.activity.start);
      const to = parseGeo(entry.activity.end);
      if (!from || !to || !Number.isFinite(t1)) continue;
      activities.push({ t0, t1, from, to, hint: normalizeHint(entry.activity.topCandidate?.type) });
      continue;
    }

    if (entry.visit) {
      const at = parseGeo(entry.visit.topCandidate?.placeLocation);
      if (!at || !Number.isFinite(t1)) continue;
      stays.push({ t0, t1, lng: at[0], lat: at[1] });
    }
  }

  points.sort((a, b) => a.t - b.t);
  activities.sort((a, b) => a.t0 - b.t0);
  stays.sort((a, b) => a.t0 - b.t0);
  progress(0.4, '軌跡を組み立てています');

  // activity の期間に入る点列を割り当てる。どちらも時刻順なので線形に舐められる。
  const used = new Uint8Array(points.length);
  const rawSegments: { t0: number; t1: number; path: [number, number][]; times: number[]; hint: ModeId | null }[] = [];
  let cursor = 0;

  for (const act of activities) {
    while (cursor < points.length && points[cursor].t < act.t0) cursor += 1;
    const path: [number, number][] = [];
    const times: number[] = [];
    for (let i = cursor; i < points.length && points[i].t <= act.t1; i += 1) {
      path.push([points[i].lng, points[i].lat]);
      times.push(points[i].t);
      used[i] = 1;
    }
    if (path.length >= 2) {
      // 点列が activity の端をカバーしていなければ、始点・終点を継ぎ足して線をつなぐ。
      if (times[0] - act.t0 > 60_000) {
        path.unshift(act.from);
        times.unshift(act.t0);
      }
      if (act.t1 - times[times.length - 1] > 60_000) {
        path.push(act.to);
        times.push(act.t1);
      }
    } else {
      // 点列が無い区間（典型的には飛行機）は直線で結ぶ。
      path.length = 0;
      times.length = 0;
      path.push(act.from, act.to);
      times.push(act.t0, act.t1);
    }
    rawSegments.push({ t0: times[0], t1: times[times.length - 1], path, times, hint: act.hint });
  }

  // activity に拾われなかった点列は、時間の切れ目で区切って独立した区間にする。
  let run: RawPoint[] = [];
  const flushRun = () => {
    if (run.length >= 2) {
      rawSegments.push({
        t0: run[0].t,
        t1: run[run.length - 1].t,
        path: run.map((p) => [p.lng, p.lat] as [number, number]),
        times: run.map((p) => p.t),
        hint: null,
      });
    }
    run = [];
  };
  for (let i = 0; i < points.length; i += 1) {
    if (used[i]) continue;
    if (run.length && points[i].t - run[run.length - 1].t > GAP_MS) flushRun();
    run.push(points[i]);
  }
  flushRun();

  progress(0.7, '移動手段を推定しています');

  rawSegments.sort((a, b) => a.t0 - b.t0);
  const segments: Segment[] = [];
  for (const rs of rawSegments) {
    if (rs.t1 <= rs.t0) continue;
    const stats = computeStats(rs.path, rs.times);
    if (stats.distanceM < MIN_SEGMENT_M) continue;
    const c = classify(stats, rs.hint, options.classify);
    if (c.mode === 'stay') continue;
    segments.push({
      id: segments.length,
      t0: rs.t0,
      t1: rs.t1,
      path: rs.path,
      times: rs.times,
      hint: rs.hint,
      mode: c.mode,
      confidence: c.confidence,
      reason: c.reason,
      ...stats,
    });
  }

  progress(1, '完了');

  const t0 = segments.length ? segments[0].t0 : stays.length ? stays[0].t0 : Date.now();
  let t1 = segments.length ? segments[segments.length - 1].t1 : t0;
  for (const s of stays) if (s.t1 > t1) t1 = s.t1;

  return { segments, stays, t0, t1 };
}

/** モードだけを引き直す。UI で「ラベルを使う / 使わない」を切り替えたときに使う。 */
export function reclassify(timeline: Timeline, opts: ClassifyOptions): Timeline {
  return {
    ...timeline,
    segments: timeline.segments.map((seg) => {
      const c = classify(seg, seg.hint, opts);
      return { ...seg, mode: c.mode, confidence: c.confidence, reason: c.reason };
    }),
  };
}

// ---------------------------------------------------------------------------
// 圧縮形式（ファイルに保存する / API で配る用）
// ---------------------------------------------------------------------------

/** 添字で持ち回るのでこの並びは変えない。変えるなら FORMAT_VERSION を上げること。 */
export const MODE_IDS: ModeId[] = [
  'stay',
  'walk',
  'run',
  'bike',
  'car',
  'bus',
  'train',
  'subway',
  'tram',
  'ferry',
  'motorcycle',
  'ski',
  'plane',
  'unknown',
];

export const FORMAT_VERSION = 1;

const COORD_SCALE = 1e5; // 約 1m。軌跡の見た目には十分。

/**
 * [t0 の前区間からの差(秒), hint 添字, 距離m, 直線距離m, 中央値*10, 最高*10, 直進度*1000,
 *  座標(初回は絶対値・以降は差分), 各点の間隔(秒)]
 */
type CompactSegment = [number, number, number, number, number, number, number, number[], number[]];

export interface CompactTimeline {
  v: number;
  t0: number;
  t1: number;
  seg: CompactSegment[];
  /** [t0 差分(秒), 滞在秒, lng 差分, lat 差分] の繰り返し。 */
  stay: number[];
}

export function encodeTimeline(timeline: Timeline): CompactTimeline {
  const seg: CompactSegment[] = [];
  let prevT0 = timeline.t0;

  for (const s of timeline.segments) {
    const pts: number[] = [];
    let prevLng = 0;
    let prevLat = 0;
    for (let i = 0; i < s.path.length; i += 1) {
      const lng = Math.round(s.path[i][0] * COORD_SCALE);
      const lat = Math.round(s.path[i][1] * COORD_SCALE);
      pts.push(i === 0 ? lng : lng - prevLng, i === 0 ? lat : lat - prevLat);
      prevLng = lng;
      prevLat = lat;
    }
    // 差分は「復元後の値」からとる。元の値から引くと丸め誤差が積み上がって時刻がずれていく。
    const dts: number[] = [];
    let prevTime = s.times[0];
    for (let i = 1; i < s.times.length; i += 1) {
      const d = Math.round((s.times[i] - prevTime) / 1000);
      dts.push(d);
      prevTime += d * 1000;
    }
    const dt0 = Math.round((s.t0 - prevT0) / 1000);
    seg.push([
      dt0,
      s.hint ? MODE_IDS.indexOf(s.hint) : -1,
      Math.round(s.distanceM),
      Math.round(s.netM),
      Math.round(s.medianKmh * 10),
      Math.round(s.peakKmh * 10),
      Math.round(s.straightness * 1000),
      pts,
      dts,
    ]);
    prevT0 += dt0 * 1000;
  }

  const stay: number[] = [];
  let prevStayT = timeline.t0;
  let prevStayLng = 0;
  let prevStayLat = 0;
  for (const s of timeline.stays) {
    const lng = Math.round(s.lng * COORD_SCALE);
    const lat = Math.round(s.lat * COORD_SCALE);
    const d = Math.round((s.t0 - prevStayT) / 1000);
    stay.push(d, Math.round((s.t1 - s.t0) / 1000), lng - prevStayLng, lat - prevStayLat);
    prevStayT += d * 1000;
    prevStayLng = lng;
    prevStayLat = lat;
  }

  return { v: FORMAT_VERSION, t0: timeline.t0, t1: timeline.t1, seg, stay };
}

export function decodeTimeline(
  data: CompactTimeline,
  opts: ClassifyOptions = DEFAULT_CLASSIFY_OPTIONS,
): Timeline {
  if (data?.v !== FORMAT_VERSION) {
    throw new Error(`対応していない形式です (v${data?.v})。データを作り直してください。`);
  }

  const segments: Segment[] = [];
  let prevT0 = data.t0;

  for (const c of data.seg) {
    const [dt0, hintIdx, distanceM, netM, med10, peak10, str1000, pts, dts] = c;
    const t0 = prevT0 + dt0 * 1000;
    prevT0 = t0;

    const path: [number, number][] = [];
    let lng = 0;
    let lat = 0;
    for (let i = 0; i < pts.length; i += 2) {
      lng = i === 0 ? pts[0] : lng + pts[i];
      lat = i === 0 ? pts[1] : lat + pts[i + 1];
      path.push([lng / COORD_SCALE, lat / COORD_SCALE]);
    }

    const times: number[] = [t0];
    for (let i = 0; i < dts.length; i += 1) times.push(times[i] + dts[i] * 1000);
    const t1 = times[times.length - 1];

    const stats: SegmentStats = {
      distanceM,
      netM,
      durationS: (t1 - t0) / 1000,
      medianKmh: med10 / 10,
      peakKmh: peak10 / 10,
      straightness: str1000 / 1000,
    };
    const hint = hintIdx >= 0 ? MODE_IDS[hintIdx] : null;
    const cls = classify(stats, hint, opts);

    segments.push({
      id: segments.length,
      t0,
      t1,
      path,
      times,
      hint,
      mode: cls.mode,
      confidence: cls.confidence,
      reason: cls.reason,
      ...stats,
    });
  }

  const stays: Stay[] = [];
  let stayT = data.t0;
  let stayLng = 0;
  let stayLat = 0;
  for (let i = 0; i + 3 < data.stay.length; i += 4) {
    stayT += data.stay[i] * 1000;
    stayLng += data.stay[i + 2];
    stayLat += data.stay[i + 3];
    stays.push({
      t0: stayT,
      t1: stayT + data.stay[i + 1] * 1000,
      lng: stayLng / COORD_SCALE,
      lat: stayLat / COORD_SCALE,
    });
  }

  return { segments, stays, t0: data.t0, t1: data.t1 };
}
