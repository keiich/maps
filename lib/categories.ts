import type { CategoryId } from './types';

export interface CategoryDef {
  id: CategoryId;
  label: string;
  /** 地図上のマーカー色 */
  color: string;
  emoji: string;
  /** 投稿フォームで表示する具体例 */
  hint: string;
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'suspicious',
    label: '不審者・声かけ',
    color: '#e8590c',
    emoji: '👁',
    hint: '声かけ、つきまとい、のぞき、露出など',
  },
  {
    id: 'theft',
    label: '窃盗・ひったくり',
    color: '#c92a2a',
    emoji: '🎒',
    hint: '自転車盗、置き引き、ひったくり、車上ねらいなど',
  },
  {
    id: 'violence',
    label: '暴力・傷害',
    color: '#862e9c',
    emoji: '⚠️',
    hint: '暴行、傷害、恐喝など',
  },
  {
    id: 'fraud',
    label: '詐欺・悪質勧誘',
    color: '#1971c2',
    emoji: '📞',
    hint: '特殊詐欺の予兆電話、点検商法、しつこい勧誘など',
  },
  {
    id: 'traffic',
    label: '交通の危険',
    color: '#2f9e44',
    emoji: '🚗',
    hint: '見通しの悪い交差点、暴走運転の多い道路など',
  },
  {
    id: 'lighting',
    label: '暗い・見通しが悪い',
    color: '#5c7cfa',
    emoji: '💡',
    hint: '街灯が少ない、人通りがない、死角が多いなど',
  },
  {
    id: 'other',
    label: 'その他',
    color: '#495057',
    emoji: '📍',
    hint: '上のどれにも当てはまらない気になる情報',
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): CategoryDef {
  return BY_ID.get(id as CategoryId) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && BY_ID.has(value as CategoryId);
}
