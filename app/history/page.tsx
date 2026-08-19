import type { Metadata } from 'next';

import HistoryApp from '@/components/history/HistoryApp';

import './history.css';

export const metadata: Metadata = {
  title: '行動履歴ビューア | 光る軌跡と移動手段',
  description:
    'Google タイムラインの記録を OpenStreetMap の上に光る軌跡として描き、期間を絞り込み、速度から移動手段を推定して、3D でも見られるビューアです。',
};

export default function HistoryPage() {
  // データはブラウザ側でしか触らない（位置情報をサーバーに送らないため）。
  return <HistoryApp />;
}
