import MapApp from '@/components/MapApp';
import { getOfficialData } from '@/lib/official';
import { getStore } from '@/lib/store';

export default function Home() {
  // 公式統計はリポジトリ同梱の静的データなので、サーバー側で読んでそのまま渡す。
  const official = getOfficialData();
  // DB 未設定のまま公開されていると投稿が消える。利用者にもその旨を伝える。
  const persistent = getStore().kind === 'postgres';
  return <MapApp official={official} persistent={persistent} />;
}
