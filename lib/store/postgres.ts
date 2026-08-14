import { Pool } from 'pg';

import type { CategoryId, Report, ReportInput } from '../types';
import type { CreateMeta, FlagResult, ListQuery, ReportStore } from './types';

/**
 * Neon / Vercel Postgres / Supabase いずれでも動く実装。
 * 接続文字列はプール用（`-pooler` 付き等）を推奨。
 */
export class PostgresReportStore implements ReportStore {
  readonly kind = 'postgres' as const;

  private pool: Pool;
  private initPromise: Promise<void> | null = null;

  constructor(connectionString: string) {
    this.pool = getPool(connectionString);
  }

  /** テーブルが無ければ作る。初回リクエストで一度だけ実行される。 */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.migrate().catch((err) => {
        // 失敗したら次のリクエストで再試行できるようにする
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        lat           double precision NOT NULL,
        lng           double precision NOT NULL,
        category      text NOT NULL,
        title         text NOT NULL,
        body          text NOT NULL DEFAULT '',
        occurred_at   timestamptz NOT NULL DEFAULT now(),
        created_at    timestamptz NOT NULL DEFAULT now(),
        flag_count    integer NOT NULL DEFAULT 0,
        hidden        boolean NOT NULL DEFAULT false,
        ip_hash       text
      );
      CREATE INDEX IF NOT EXISTS reports_latlng_idx ON reports (lat, lng);
      CREATE INDEX IF NOT EXISTS reports_occurred_idx ON reports (occurred_at DESC);
      CREATE INDEX IF NOT EXISTS reports_ip_recent_idx ON reports (ip_hash, created_at DESC);

      CREATE TABLE IF NOT EXISTS report_flags (
        report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
        ip_hash    text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (report_id, ip_hash)
      );
    `);
  }

  async list(query: ListQuery): Promise<Report[]> {
    await this.init();

    const where: string[] = ['hidden = false'];
    const params: unknown[] = [];

    if (query.bbox) {
      const [west, south, east, north] = query.bbox;
      params.push(west, south, east, north);
      where.push(
        `lng >= $${params.length - 3} AND lat >= $${params.length - 2} AND lng <= $${params.length - 1} AND lat <= $${params.length}`,
      );
    }
    if (query.categories?.length) {
      params.push(query.categories);
      where.push(`category = ANY($${params.length}::text[])`);
    }
    if (query.since) {
      params.push(query.since);
      where.push(`occurred_at >= $${params.length}::timestamptz`);
    }
    params.push(query.limit);

    const { rows } = await this.pool.query(
      `SELECT id, lat, lng, category, title, body, occurred_at, created_at, flag_count, hidden
         FROM reports
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${params.length}`,
      params,
    );
    return rows.map(toReport);
  }

  async get(id: string): Promise<Report | null> {
    await this.init();
    if (!isUuid(id)) return null;
    const { rows } = await this.pool.query(
      `SELECT id, lat, lng, category, title, body, occurred_at, created_at, flag_count, hidden
         FROM reports WHERE id = $1`,
      [id],
    );
    return rows[0] ? toReport(rows[0]) : null;
  }

  async create(input: ReportInput, meta: CreateMeta): Promise<Report> {
    await this.init();
    const { rows } = await this.pool.query(
      `INSERT INTO reports (lat, lng, category, title, body, occurred_at, ip_hash)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), $7)
       RETURNING id, lat, lng, category, title, body, occurred_at, created_at, flag_count, hidden`,
      [
        input.lat,
        input.lng,
        input.category,
        input.title,
        input.body,
        input.occurredAt ?? null,
        meta.ipHash,
      ],
    );
    return toReport(rows[0]);
  }

  async flag(id: string, ipHash: string, threshold: number): Promise<FlagResult | null> {
    await this.init();
    if (!isUuid(id)) return null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const inserted = await client.query(
        `INSERT INTO report_flags (report_id, ip_hash) VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING report_id`,
        [id, ipHash],
      );

      if (inserted.rowCount === 0) {
        // 対象が存在しないのか、既に通報済みなのかを区別する
        const existing = await client.query(
          'SELECT flag_count, hidden FROM reports WHERE id = $1',
          [id],
        );
        await client.query('COMMIT');
        if (existing.rowCount === 0) return null;
        return {
          flagCount: existing.rows[0].flag_count,
          hidden: existing.rows[0].hidden,
          alreadyFlagged: true,
        };
      }

      const updated = await client.query(
        `UPDATE reports
            SET flag_count = flag_count + 1,
                hidden = hidden OR flag_count + 1 >= $2
          WHERE id = $1
          RETURNING flag_count, hidden`,
        [id, threshold],
      );
      await client.query('COMMIT');

      return {
        flagCount: updated.rows[0].flag_count,
        hidden: updated.rows[0].hidden,
        alreadyFlagged: false,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async countRecentByIp(ipHash: string, since: Date): Promise<number> {
    await this.init();
    const { rows } = await this.pool.query(
      'SELECT count(*)::int AS n FROM reports WHERE ip_hash = $1 AND created_at >= $2',
      [ipHash, since.toISOString()],
    );
    return rows[0].n as number;
  }
}

interface ReportRow {
  id: string;
  lat: number;
  lng: number;
  category: string;
  title: string;
  body: string;
  occurred_at: Date;
  created_at: Date;
  flag_count: number;
  hidden: boolean;
}

function toReport(row: ReportRow): Report {
  return {
    id: row.id,
    lat: Number(row.lat),
    lng: Number(row.lng),
    category: row.category as CategoryId,
    title: row.title,
    body: row.body,
    occurredAt: new Date(row.occurred_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    flagCount: row.flag_count,
    hidden: row.hidden,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 不正な id で Postgres の型エラーを起こさないための事前チェック。 */
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * サーバーレスでは実行環境が使い回されるので、Pool も globalThis に載せて再利用する。
 * 毎リクエスト new Pool すると接続数がすぐ上限に達する。
 */
const globalForPool = globalThis as unknown as { __chianMapPool?: Pool };

function getPool(connectionString: string): Pool {
  if (!globalForPool.__chianMapPool) {
    globalForPool.__chianMapPool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: needsSsl(connectionString) ? { rejectUnauthorized: true } : undefined,
    });
    // アイドル接続がサーバー側から切られてもプロセスを落とさない
    globalForPool.__chianMapPool.on('error', (err) => {
      console.error('[db] idle client error', err);
    });
  }
  return globalForPool.__chianMapPool;
}

function needsSsl(connectionString: string): boolean {
  if (/sslmode=disable/.test(connectionString)) return false;
  return !/^postgres(ql)?:\/\/[^/]*localhost/.test(connectionString);
}
