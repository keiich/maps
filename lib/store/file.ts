import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Report, ReportInput } from '../types';
import type { CreateMeta, FlagResult, ListQuery, ReportStore } from './types';

interface StoredReport extends Report {
  ipHash: string;
  flaggedBy: string[];
}

interface FileShape {
  version: 1;
  reports: StoredReport[];
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'reports.json');

/**
 * DATABASE_URL が無いときのフォールバック。ローカル開発と動作確認のためだけの実装で、
 * Vercel のようにファイルシステムが永続化されない環境では投稿が失われる。
 *
 * 書き込みは単一プロセス内の Promise チェーンで直列化し、
 * ファイル自体は一時ファイル経由の rename で置き換えて壊れた JSON が残らないようにする。
 */
export class FileReportStore implements ReportStore {
  readonly kind = 'file' as const;

  private cache: FileShape | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  async init(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<FileShape> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw) as FileShape;
      this.cache = { version: 1, reports: parsed.reports ?? [] };
    } catch {
      this.cache = { version: 1, reports: [] };
    }
    return this.cache;
  }

  private async persist(data: FileShape): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, DATA_FILE);
  }

  /** 書き込み処理を直列化して、同時リクエストによる取りこぼしを防ぐ。 */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async list(query: ListQuery): Promise<Report[]> {
    const data = await this.load();
    const sinceMs = query.since ? Date.parse(query.since) : null;

    return data.reports
      .filter((r) => {
        if (r.hidden) return false;
        if (query.categories?.length && !query.categories.includes(r.category)) return false;
        if (sinceMs !== null && Date.parse(r.occurredAt) < sinceMs) return false;
        if (query.bbox) {
          const [west, south, east, north] = query.bbox;
          if (r.lat < south || r.lat > north || r.lng < west || r.lng > east) return false;
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, query.limit)
      .map(toPublic);
  }

  async get(id: string): Promise<Report | null> {
    const data = await this.load();
    const found = data.reports.find((r) => r.id === id);
    return found ? toPublic(found) : null;
  }

  async create(input: ReportInput, meta: CreateMeta): Promise<Report> {
    return this.enqueue(async () => {
      const data = await this.load();
      const now = new Date().toISOString();
      const report: StoredReport = {
        id: randomUUID(),
        lat: input.lat,
        lng: input.lng,
        category: input.category,
        title: input.title,
        body: input.body,
        occurredAt: input.occurredAt ?? now,
        createdAt: now,
        flagCount: 0,
        hidden: false,
        ipHash: meta.ipHash,
        flaggedBy: [],
      };
      data.reports.push(report);
      await this.persist(data);
      return toPublic(report);
    });
  }

  async flag(id: string, ipHash: string, threshold: number): Promise<FlagResult | null> {
    return this.enqueue(async () => {
      const data = await this.load();
      const report = data.reports.find((r) => r.id === id);
      if (!report) return null;

      if (report.flaggedBy.includes(ipHash)) {
        return { flagCount: report.flagCount, hidden: report.hidden, alreadyFlagged: true };
      }

      report.flaggedBy.push(ipHash);
      report.flagCount = report.flaggedBy.length;
      report.hidden = report.hidden || report.flagCount >= threshold;
      await this.persist(data);
      return { flagCount: report.flagCount, hidden: report.hidden, alreadyFlagged: false };
    });
  }

  async countRecentByIp(ipHash: string, since: Date): Promise<number> {
    const data = await this.load();
    return data.reports.filter(
      (r) => r.ipHash === ipHash && Date.parse(r.createdAt) >= since.getTime(),
    ).length;
  }
}

/** 保存用レコードから、外部に出してはいけない項目を落とす。 */
function toPublic(r: StoredReport): Report {
  return {
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    category: r.category,
    title: r.title,
    body: r.body,
    occurredAt: r.occurredAt,
    createdAt: r.createdAt,
    flagCount: r.flagCount,
    hidden: r.hidden,
  };
}
