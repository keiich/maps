import { envInt, getIpHash, jsonError } from '@/lib/request';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 投稿の通報。同じ利用者からの重複は数えない。
 * FLAG_HIDE_THRESHOLD 件に達した投稿は自動的に地図から消える。
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = getStore();
  const threshold = envInt('FLAG_HIDE_THRESHOLD', 3);

  try {
    const result = await store.flag(id, getIpHash(_req), threshold);
    if (!result) return jsonError(404, '対象の投稿が見つかりません。');

    return Response.json({
      flagCount: result.flagCount,
      hidden: result.hidden,
      alreadyFlagged: result.alreadyFlagged,
    });
  } catch (err) {
    console.error('[POST /api/reports/:id/flag]', err);
    return jsonError(500, '通報の記録に失敗しました。');
  }
}
