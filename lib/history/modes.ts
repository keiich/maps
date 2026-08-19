import type { ModeId } from '@/lib/history/timeline';

export interface ModeMeta {
  id: ModeId;
  label: string;
  /** 光らせる前提の、暗い背景で映える色。 */
  color: [number, number, number];
  /** 軌跡の太さの倍率。速い乗り物ほど太くして遠目でも分かるようにする。 */
  width: number;
  /** 24x24 の座標系で描いたアイコンの中身。白で描く。 */
  glyph: string;
}

const g = (body: string) => body;

/**
 * 表示順は「遅い順」。凡例もこの順で並ぶ。
 */
export const MODES: ModeMeta[] = [
  {
    id: 'walk',
    label: '徒歩',
    color: [74, 222, 128],
    width: 1,
    glyph: g(
      '<circle cx="12" cy="4" r="2.2" fill="#fff"/>' +
        '<path d="M12 6.6 L11 13 M11 13 L8 20 M11 13 L15.5 19 M11.6 9 L7.5 11 M11.6 9 L16 12" />',
    ),
  },
  {
    id: 'run',
    label: '走行',
    color: [163, 230, 53],
    width: 1,
    glyph: g(
      '<circle cx="14.5" cy="4" r="2.2" fill="#fff"/>' +
        '<path d="M14 6.6 L10 13 M10 13 L5 18 M10 13 L14 19.5 M11.8 9 L17 8 M11.8 9 L7 12" />',
    ),
  },
  {
    id: 'bike',
    label: '自転車',
    color: [34, 211, 238],
    width: 1.1,
    glyph: g(
      '<circle cx="5.5" cy="17" r="4"/><circle cx="18.5" cy="17" r="4"/>' +
        '<path d="M5.5 17 L10 8 L16 8 M10 8 L18.5 17 M14.5 6 L18 6" />',
    ),
  },
  {
    id: 'car',
    label: '自動車',
    color: [249, 115, 22],
    width: 1.5,
    glyph: g(
      '<path d="M6 11.5 L8 7 L16 7 L18 11.5 Z" fill="#fff" stroke="none"/>' +
        '<rect x="2.5" y="11" width="19" height="5.5" rx="2" fill="#fff" stroke="none"/>' +
        '<circle cx="7" cy="17.5" r="2.4" fill="#fff" stroke="none"/>' +
        '<circle cx="17" cy="17.5" r="2.4" fill="#fff" stroke="none"/>',
    ),
  },
  {
    id: 'motorcycle',
    label: 'バイク',
    color: [251, 113, 133],
    width: 1.3,
    glyph: g(
      '<circle cx="5" cy="16.5" r="4"/><circle cx="19" cy="16.5" r="4"/>' +
        '<path d="M5 16.5 L10 10 L15 10 L19 16.5 M14 7 L18 8" />',
    ),
  },
  {
    id: 'bus',
    label: 'バス',
    color: [251, 191, 36],
    width: 1.7,
    glyph: g(
      '<rect x="3" y="3.5" width="18" height="14" rx="2.5" fill="#fff" stroke="none"/>' +
        '<rect x="5.5" y="6" width="13" height="5" rx="1" fill="currentColor" stroke="none"/>' +
        '<circle cx="7.5" cy="19" r="1.9" fill="#fff" stroke="none"/>' +
        '<circle cx="16.5" cy="19" r="1.9" fill="#fff" stroke="none"/>',
    ),
  },
  {
    id: 'tram',
    label: '路面電車',
    color: [232, 121, 249],
    width: 1.7,
    glyph: g(
      '<path d="M3 2.5 L21 2.5" />' +
        '<rect x="5" y="5" width="14" height="12.5" rx="3" fill="#fff" stroke="none"/>' +
        '<rect x="7" y="7" width="10" height="4.5" rx="1" fill="currentColor" stroke="none"/>' +
        '<path d="M12 2.5 L12 5" />' +
        '<path d="M8 18 L6 21 M16 18 L18 21" />',
    ),
  },
  {
    id: 'subway',
    label: '地下鉄',
    color: [192, 132, 252],
    width: 1.9,
    glyph: g(
      '<path d="M2.5 7 A9.5 9.5 0 0 1 21.5 7" />' +
        '<rect x="5.5" y="9" width="13" height="9.5" rx="3" fill="#fff" stroke="none"/>' +
        '<rect x="7.5" y="10.8" width="9" height="3.6" rx="1" fill="currentColor" stroke="none"/>' +
        '<path d="M8.5 19 L7 21.5 M15.5 19 L17 21.5" />',
    ),
  },
  {
    id: 'train',
    label: '電車',
    color: [244, 114, 182],
    width: 2,
    glyph: g(
      '<rect x="5" y="2.5" width="14" height="14" rx="3.5" fill="#fff" stroke="none"/>' +
        '<rect x="7" y="5" width="10" height="5" rx="1" fill="currentColor" stroke="none"/>' +
        '<circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none"/>' +
        '<circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none"/>' +
        '<path d="M8.5 17 L6.5 21 M15.5 17 L17.5 21" />',
    ),
  },
  {
    id: 'ferry',
    label: '船',
    color: [56, 189, 248],
    width: 1.6,
    glyph: g(
      '<path d="M2.5 14 L21.5 14 L18.5 19.5 L5.5 19.5 Z" fill="#fff" stroke="none"/>' +
        '<rect x="8" y="7.5" width="8" height="5.5" rx="1" fill="#fff" stroke="none"/>' +
        '<path d="M12 3 L12 7.5 M2 21.8 q2.6 -1.6 5.2 0 t5.2 0 t5.2 0" />',
    ),
  },
  {
    id: 'ski',
    label: 'スキー',
    color: [226, 232, 240],
    width: 1.4,
    glyph: g(
      '<circle cx="15" cy="4" r="2.2" fill="#fff"/>' +
        '<path d="M15 6.5 L11.5 12 L9.5 16.5 M14 8.5 L18.5 11 M19 6 L19.5 17" />' +
        '<path d="M3 19.5 L20.5 15" />',
    ),
  },
  {
    id: 'plane',
    label: '飛行機',
    color: [96, 165, 250],
    width: 2.4,
    glyph: g(
      '<path d="M12 1.5 L13.8 9.5 L22 13.8 L22 15.8 L13.8 13.6 L13.2 19 L16 21.2 L16 22.5 L12 21 L8 22.5 L8 21.2 L10.8 19 L10.2 13.6 L2 15.8 L2 13.8 L10.2 9.5 Z" fill="#fff" stroke="none"/>',
    ),
  },
  {
    id: 'stay',
    label: '滞在',
    color: [148, 163, 184],
    width: 1,
    glyph: g(
      '<path d="M12 1.8 C7.9 1.8 4.8 5 4.8 9 c0 5.4 7.2 13.2 7.2 13.2 s7.2 -7.8 7.2 -13.2 c0 -4 -3.1 -7.2 -7.2 -7.2 z" fill="#fff" stroke="none"/>' +
        '<circle cx="12" cy="8.8" r="2.6" fill="currentColor" stroke="none"/>',
    ),
  },
  {
    id: 'unknown',
    label: '不明',
    color: [100, 116, 139],
    width: 1,
    glyph: g('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4" fill="#fff" stroke="none"/>'),
  },
];

export const MODE_MAP: Record<ModeId, ModeMeta> = MODES.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<ModeId, ModeMeta>,
);

export function modeMeta(id: ModeId): ModeMeta {
  return MODE_MAP[id] ?? MODE_MAP.unknown;
}

export const cssColor = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/**
 * deck.gl の IconLayer に渡すアイコンを SVG のデータ URI で作る。
 * 色つきの丸バッジの上に白いグリフを乗せる形。currentColor はバッジ色に解決される。
 */
export function modeIconUrl(id: ModeId): string {
  const m = modeMeta(id);
  const fill = cssColor(m.color);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">` +
    `<circle cx="22" cy="22" r="19" fill="${fill}" stroke="rgba(255,255,255,0.9)" stroke-width="2.5"/>` +
    `<g transform="translate(10 10)" color="${fill}" fill="none" stroke="#fff" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round">${m.glyph}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 凡例などで使う、単色の小さいアイコン。 */
export function modeGlyphSvg(id: ModeId): string {
  const m = modeMeta(id);
  const fill = cssColor(m.color);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `color="#0b0f19" fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round">${m.glyph.replace(/#fff/g, fill)}</svg>`
  );
}
