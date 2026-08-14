import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '地域治安マップ | 公式統計とみんなの投稿',
  description:
    '東京都の公開統計と、地域の人が投稿した治安情報を OpenStreetMap 上にまとめて表示する地図サイトです。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
