import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 事前に変換しておいた行動履歴を返す。
 *
 * `npm run ingest:history` で作られる `data/timeline.json` は個人の位置情報そのものなので
 * リポジトリには入れていない（.gitignore 済み）。手元やセルフホストで置いた場合だけここから
 * 配られ、無ければ 204 を返してブラウザ側の読み込み画面に任せる。
 */
const FILE = path.join(process.cwd(), 'data', 'timeline.json');

export async function GET() {
  try {
    const body = await readFile(FILE, 'utf8');
    return new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // 個人データなので共有キャッシュには置かせない。
        'cache-control': 'private, max-age=60',
      },
    });
  } catch {
    return new Response(null, { status: 204 });
  }
}
