/** アプリ全体で共有するドメイン型。 */

/** 治安情報のカテゴリ ID。`lib/categories.ts` の定義と一対一で対応する。 */
export type CategoryId =
  | 'suspicious'
  | 'theft'
  | 'violence'
  | 'fraud'
  | 'traffic'
  | 'lighting'
  | 'other';

/** ユーザーが投稿した治安情報。 */
export interface Report {
  id: string;
  lat: number;
  lng: number;
  category: CategoryId;
  title: string;
  body: string;
  /** 出来事が起きた日時 (ISO 8601)。分からない場合は投稿日時と同じ。 */
  occurredAt: string;
  createdAt: string;
  /** 通報された回数。しきい値を超えると hidden になる。 */
  flagCount: number;
  /** 通報多数または管理操作で非表示になった投稿。地図には出さない。 */
  hidden: boolean;
}

/** 投稿 API が受け取る入力。 */
export interface ReportInput {
  lat: number;
  lng: number;
  category: CategoryId;
  title: string;
  body: string;
  occurredAt?: string;
}

/**
 * 自治体単位の公式統計。
 * 面データではなく代表点（役所の位置）に集約して円で表現する。
 */
export interface OfficialArea {
  /** 全国地方公共団体コード */
  code: string;
  name: string;
  lat: number;
  lng: number;
  /** 人口（統計の正規化に使う） */
  population: number;
  /** 罪種別の認知件数 */
  counts: Record<string, number>;
  /** 認知件数の合計 */
  total: number;
}

/** 公式統計データセット全体。出典と鮮度をデータ自身に持たせる。 */
export interface OfficialDataset {
  /** 'sample' の場合、実データではないことを UI 上で明示する。 */
  dataStatus: 'sample' | 'official';
  /** 統計の対象期間 (例: '2024') */
  period: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  /** データを取得・変換した日時 (ISO 8601) */
  retrievedAt: string;
  areas: OfficialArea[];
}
