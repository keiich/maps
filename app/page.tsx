import MapApp from '@/components/MapApp';
import { getOfficialData } from '@/lib/official';

export default function Home() {
  // 公式統計はリポジトリ同梱の静的データなので、サーバー側で読んでそのまま渡す。
  const official = getOfficialData();
  return <MapApp official={official} />;
}
