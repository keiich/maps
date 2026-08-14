/** 公式統計レイヤーの色分け。緑（少ない）→ 赤（多い）の5段階。 */
export const RATE_COLORS = ['#2b8a3e', '#94d82d', '#fcc419', '#fd7e14', '#e03131'];

/**
 * 分位点で区切りを作る。
 * 東京23区と山間部では桁が違うので、等間隔で切ると色がほぼ1色になってしまう。
 */
export function buildBreaks(values: number[]): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0, 0];

  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return [at(0.2), at(0.4), at(0.6), at(0.8)];
}

/** 値がどの段階に入るかを返す（0 が最少、RATE_COLORS.length - 1 が最多）。 */
export function bucketFor(value: number, breaks: number[]): number {
  let i = 0;
  while (i < breaks.length && value > breaks[i]) i += 1;
  return i;
}

export function colorForValue(value: number, breaks: number[]): string {
  return RATE_COLORS[bucketFor(value, breaks)];
}
