import type { CategoryId, Report, ReportInput } from '../types';

export interface ListQuery {
  /** [西, 南, 東, 北] の順。指定するとその範囲内の投稿だけを返す。 */
  bbox?: [number, number, number, number];
  categories?: CategoryId[];
  /** この日時以降に発生した投稿だけを返す (ISO 8601)。 */
  since?: string;
  limit: number;
}

export interface CreateMeta {
  ipHash: string;
}

export interface FlagResult {
  flagCount: number;
  hidden: boolean;
  /** 同じ利用者が既に通報済みだった場合 true（カウントは増やさない）。 */
  alreadyFlagged: boolean;
}

/**
 * 投稿の永続化インターフェース。
 * Postgres 実装とローカルファイル実装が同じ契約を満たす。
 */
export interface ReportStore {
  readonly kind: 'postgres' | 'file';
  init(): Promise<void>;
  list(query: ListQuery): Promise<Report[]>;
  get(id: string): Promise<Report | null>;
  create(input: ReportInput, meta: CreateMeta): Promise<Report>;
  flag(id: string, ipHash: string, threshold: number): Promise<FlagResult | null>;
  /** レート制限用。指定時刻以降にその利用者が作成した投稿数。 */
  countRecentByIp(ipHash: string, since: Date): Promise<number>;
}
