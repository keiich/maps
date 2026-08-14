import { FileReportStore } from './file';
import { PostgresReportStore } from './postgres';
import type { ReportStore } from './types';

export type { ListQuery, ReportStore } from './types';

const globalForStore = globalThis as unknown as { __chianMapStore?: ReportStore };

/**
 * 接続文字列があれば Postgres、無ければローカルファイルに保存する。
 * Vercel の Storage 連携は POSTGRES_URL を、手動設定は DATABASE_URL を使うことが多いので両方見る。
 */
export function getStore(): ReportStore {
  if (globalForStore.__chianMapStore) return globalForStore.__chianMapStore;

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    '';

  if (connectionString) {
    globalForStore.__chianMapStore = new PostgresReportStore(connectionString);
  } else {
    if (process.env.VERCEL) {
      console.warn(
        '[store] DATABASE_URL が未設定です。投稿はインスタンスごとの一時ファイルに保存され、永続化されません。',
      );
    }
    globalForStore.__chianMapStore = new FileReportStore();
  }
  return globalForStore.__chianMapStore;
}
