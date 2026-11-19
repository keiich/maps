import { ImageResponse } from 'next/og';

import crimeData from '../data/official-crime.json';

export const alt =
  '東京53市区町村 犯罪認知件数ランキング（警視庁 令和7年公式統計）';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Area = { name: string; total: number; population: number };

const areas = (crimeData.areas as Area[]).map((a) => ({
  ...a,
  per100k: (a.total / a.population) * 100000,
}));
const worst = [...areas].sort((x, y) => y.per100k - x.per100k).slice(0, 5);
const best = [...areas].sort((x, y) => x.per100k - y.per100k).slice(0, 5);

const STRINGS = {
  badge: '警視庁 令和7年（2025年）公式統計',
  title1: '東京53市区町村',
  title2: '犯罪認知件数ランキング',
  subtitle: '人口10万人あたりの認知件数で比較',
  worstTitle: '多い順 ワースト5',
  bestTitle: '少ない順 ベスト5',
  unit: '件',
  footnote: '※ 千代田区は昼間人口が多いため、人口あたりでは突出します',
  cta: 'あなたの街は何位？  地域治安マップ',
  url: 'chian-map.vercel.app',
};

// All glyphs rendered in the image, used to fetch a subset font.
const FONT_TEXT =
  Object.values(STRINGS).join('') +
  worst.map((a) => a.name).join('') +
  best.map((a) => a.name).join('') +
  '0123456789,.';

async function loadFont(weight: 400 | 700): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(
      FONT_TEXT,
    )}&display=swap`;
    const css = await (
      await fetch(cssUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
      })
    ).text();
    const match = css.match(/url\((https:[^)]+?\.woff2)\)/);
    if (!match) return null;
    return await (await fetch(match[1])).arrayBuffer();
  } catch {
    return null;
  }
}

const BG = '#0D1426';
const PANEL = '#17213A';
const LINE = '#344468';
const WHITE = '#F0F4FA';
const SUB = '#A0AFC8';
const RED = '#FF6B6B';
const TEAL = '#2DD4BF';
const GOLD = '#FACC15';
const BLUE = '#AAC8FF';

function Panel({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: typeof worst;
  accent: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        backgroundColor: PANEL,
        border: `2px solid ${LINE}`,
        borderRadius: 18,
        padding: '16px 28px 8px',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: accent }}>{title}</div>
      {rows.map((a, i) => (
        <div
          key={a.name}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '5px 0',
            borderBottom: i < rows.length - 1 ? `1px solid ${LINE}` : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: accent, width: 32 }}
            >
              {i + 1}
            </div>
            <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: WHITE }}>
              {a.name}
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: WHITE }}>
            {`${Math.round(a.per100k).toLocaleString('en-US')}${STRINGS.unit}`}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function Image() {
  const [regular, bold] = await Promise.all([loadFont(400), loadFont(700)]);
  const fonts = [
    regular && {
      name: 'Noto Sans JP',
      data: regular,
      weight: 400 as const,
      style: 'normal' as const,
    },
    bold && {
      name: 'Noto Sans JP',
      data: bold,
      weight: 700 as const,
      style: 'normal' as const,
    },
  ].filter(Boolean) as {
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: 'normal';
  }[];

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: BG,
          color: WHITE,
          fontFamily: 'Noto Sans JP',
          padding: '28px 48px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            backgroundColor: '#1E2D50',
            borderRadius: 20,
            padding: '6px 20px',
            fontSize: 21,
            fontWeight: 700,
            color: BLUE,
          }}
        >
          {STRINGS.badge}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 46,
            fontWeight: 700,
            height: 64,
            marginTop: 10,
          }}
        >
          {STRINGS.title1}
          {STRINGS.title2}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: SUB, marginTop: 4 }}>
          {STRINGS.subtitle}
        </div>
        <div style={{ display: 'flex', gap: 32, marginTop: 16 }}>
          <Panel title={STRINGS.worstTitle} rows={worst} accent={RED} />
          <Panel title={STRINGS.bestTitle} rows={best} accent={TEAL} />
        </div>
        <div style={{ display: 'flex', fontSize: 20, color: SUB, marginTop: 12 }}>
          {STRINGS.footnote}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: GOLD }}>
            {STRINGS.cta}
          </div>
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: BLUE }}>
            {STRINGS.url}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
