export type RangeId = '1d' | '7d' | '1m' | '1y' | 'all';

export interface RangePreset {
  id: RangeId;
  label: string;
  /** 期間の長さ (ms)。全期間は null。 */
  ms: number | null;
  /** その期間で既定にする「軌跡を残す長さ」(ms)。 */
  defaultTrailMs: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const RANGE_PRESETS: RangePreset[] = [
  { id: '1d', label: '1日', ms: DAY, defaultTrailMs: 2 * HOUR },
  { id: '7d', label: '7日', ms: 7 * DAY, defaultTrailMs: 12 * HOUR },
  { id: '1m', label: '1ヶ月', ms: 30 * DAY, defaultTrailMs: 2 * DAY },
  { id: '1y', label: '1年', ms: 365 * DAY, defaultTrailMs: 21 * DAY },
  { id: 'all', label: '全期間', ms: null, defaultTrailMs: 180 * DAY },
];

export function rangePreset(id: RangeId): RangePreset {
  return RANGE_PRESETS.find((r) => r.id === id) ?? RANGE_PRESETS[0];
}

/**
 * 期間の実際の開始・終了時刻を出す。end は「期間の右端」で、既定はデータの最終時刻。
 */
export function resolveRange(
  id: RangeId,
  end: number,
  dataT0: number,
  dataT1: number,
): { start: number; end: number } {
  const preset = rangePreset(id);
  if (preset.ms === null) return { start: dataT0, end: dataT1 };
  const clampedEnd = Math.min(Math.max(end, dataT0 + preset.ms), dataT1);
  return { start: clampedEnd - preset.ms, end: clampedEnd };
}

const fmt = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const fmtDate = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });

export const formatDateTime = (ms: number) => fmt.format(new Date(ms));
export const formatDate = (ms: number) => fmtDate.format(new Date(ms));

/** 3600000 → "1時間" のような表示。 */
export function formatDuration(ms: number): string {
  const min = ms / 60_000;
  if (min < 60) return `${Math.round(min)}分`;
  const hours = min / 60;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)}時間`;
  const days = hours / 24;
  if (days < 60) return `${Math.round(days)}日`;
  return `${Math.round(days / 30)}ヶ月`;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)}km`;
}
