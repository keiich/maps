import { getOfficialData } from '@/lib/official';

export const runtime = 'nodejs';

/** 公式統計はビルド時点で固定なので長めにキャッシュする。 */
export async function GET() {
  return Response.json(getOfficialData(), {
    headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' },
  });
}
