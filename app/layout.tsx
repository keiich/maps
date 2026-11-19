import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://chian-map.vercel.app'),
  title: '地域治安マップ | 公式統計とみんなの投稿',
  description:
    '東京都の公開統計と、地域の人が投稿した治安情報を OpenStreetMap 上にまとめて表示する地図サイトです。',
  openGraph: {
    title: '地域治安マップ | 公式統計とみんなの投稿',
    description:
      '警視庁の公式統計（令和7年）で東京53市区町村の犯罪認知件数を比較。あなたの街の治安を地図でチェック。',
    url: '/',
    siteName: '地域治安マップ',
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '地域治安マップ | 公式統計とみんなの投稿',
    description:
      '警視庁の公式統計（令和7年）で東京53市区町村の犯罪認知件数を比較。あなたの街の治安を地図でチェック。',
  },
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
