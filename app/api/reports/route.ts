import { isCategoryId } from '@/lib/categories';
import { LIMITS, moderateBody, moderateTitle } from '@/lib/moderation';
import { envInt, getIpHash, jsonError } from '@/lib/request';
import { getStore } from '@/lib/store';
import type { CategoryId, ReportInput } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 500;

/** ピンを置ける範囲。日本国内からおおきく外れた座標は受け付けない。 */
const JAPAN_BOUNDS = { minLat: 20, maxLat: 46, minLng: 122, maxLng: 154 };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const store = getStore();

  let bbox: [number, number, number, number] | undefined;
  const bboxParam = url.searchParams.get('bbox');
  if (bboxParam) {
    const parts = bboxParam.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return jsonError(400, 'bbox は "西,南,東,北" の数値4つで指定してください。');
    }
    bbox = [parts[0], parts[1], parts[2], parts[3]];
  }

  const categories = (url.searchParams.get('categories') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(isCategoryId) as CategoryId[];

  const days = Number.parseInt(url.searchParams.get('days') ?? '', 10);
  const since =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() - days * 86400000).toISOString()
      : undefined;

  const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
    : MAX_LIMIT;

  try {
    const reports = await store.list({ bbox, categories, since, limit });
    return Response.json({ reports }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('[GET /api/reports]', err);
    return jsonError(500, '投稿の取得に失敗しました。');
  }
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, 'リクエストの形式が正しくありません。');
  }

  const parsed = parseInput(payload);
  if ('error' in parsed) return jsonError(400, parsed.error);

  const store = getStore();
  const ipHash = getIpHash(req);
  const perHour = envInt('RATE_LIMIT_PER_HOUR', 5);

  try {
    const recent = await store.countRecentByIp(ipHash, new Date(Date.now() - 3600_000));
    if (recent >= perHour) {
      return jsonError(
        429,
        `投稿が多すぎます。1時間あたり${perHour}件までです。しばらく待ってからお試しください。`,
      );
    }

    const report = await store.create(parsed.value, { ipHash });
    return Response.json({ report }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/reports]', err);
    return jsonError(500, '投稿の保存に失敗しました。');
  }
}

type ParseResult = { value: ReportInput } | { error: string };

function parseInput(payload: unknown): ParseResult {
  if (typeof payload !== 'object' || payload === null) {
    return { error: 'リクエストの形式が正しくありません。' };
  }
  const input = payload as Record<string, unknown>;

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: '地図上の位置が指定されていません。' };
  }
  if (
    lat < JAPAN_BOUNDS.minLat ||
    lat > JAPAN_BOUNDS.maxLat ||
    lng < JAPAN_BOUNDS.minLng ||
    lng > JAPAN_BOUNDS.maxLng
  ) {
    return { error: '対象範囲外の位置です。' };
  }

  if (!isCategoryId(input.category)) {
    return { error: 'カテゴリを選択してください。' };
  }

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const titleCheck = moderateTitle(title);
  if (!titleCheck.ok) return { error: titleCheck.reason! };

  const body = typeof input.body === 'string' ? input.body.trim() : '';
  const bodyCheck = moderateBody(body);
  if (!bodyCheck.ok) return { error: bodyCheck.reason! };

  let occurredAt: string | undefined;
  if (typeof input.occurredAt === 'string' && input.occurredAt) {
    const ts = Date.parse(input.occurredAt);
    if (!Number.isFinite(ts)) return { error: '発生日時の形式が正しくありません。' };
    // 未来の日時と、極端に古い日時は受け付けない
    if (ts > Date.now() + 86400000) return { error: '発生日時に未来の日付は指定できません。' };
    if (ts < Date.now() - 5 * 365 * 86400000) {
      return { error: '発生日時が古すぎます。5年以内の情報を投稿してください。' };
    }
    occurredAt = new Date(ts).toISOString();
  }

  return {
    value: {
      // 位置は小数第5位（約1m）で丸める。それ以上の精度は不要で、住居特定に近づくのを避ける。
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      category: input.category,
      title: title.slice(0, LIMITS.MAX_TITLE),
      body: body.slice(0, LIMITS.MAX_BODY),
      occurredAt,
    },
  };
}
