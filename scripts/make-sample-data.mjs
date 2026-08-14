/**
 * 公式統計レイヤーの「サンプル」データセットを生成する。
 *
 * 実データはネットワーク経由で取得する必要があり、環境によっては取れないため、
 * UI が最初から動くようにダミーの認知件数を持つデータセットを作っておく。
 * 件数は固定シードの疑似乱数で作った作り物で、実際の統計ではない。
 * dataStatus: 'sample' が付いている間、画面上にもその旨が表示される。
 *
 * 実データに差し替えるには `npm run ingest:tokyo` を使う。
 *
 *   node scripts/make-sample-data.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const municipalities = JSON.parse(
  readFileSync(path.join(root, 'data/tokyo-municipalities.json'), 'utf8'),
);

/** mulberry32: シードを固定して毎回同じサンプルを作る。 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 罪種ごとの、人口10万人あたりのおおよその発生規模（サンプル生成用の係数）
const CRIME_TYPES = [
  { key: 'violent', label: '凶悪犯', per100k: 6 },
  { key: 'assault', label: '粗暴犯', per100k: 55 },
  { key: 'burglary', label: '侵入窃盗', per100k: 40 },
  { key: 'theft', label: '非侵入窃盗', per100k: 480 },
  { key: 'fraud', label: '知能犯', per100k: 70 },
  { key: 'other', label: 'その他', per100k: 130 },
];

const random = rng(20240401);

const areas = municipalities.map((m) => {
  const counts = {};
  let total = 0;
  // 地域差を出すための倍率（0.6〜1.6倍）
  const localFactor = 0.6 + random() * 1.0;
  for (const type of CRIME_TYPES) {
    const base = (m.population / 100000) * type.per100k * localFactor;
    const n = Math.max(0, Math.round(base * (0.75 + random() * 0.5)));
    counts[type.key] = n;
    total += n;
  }
  return {
    code: m.code,
    name: m.name,
    lat: m.lat,
    lng: m.lng,
    population: m.population,
    counts,
    total,
  };
});

const dataset = {
  dataStatus: 'sample',
  period: 'サンプル',
  sourceName: 'サンプルデータ（実際の統計ではありません）',
  sourceUrl: 'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/jokyo_tokei/jokyo/ninchikensu.html',
  license: '-',
  retrievedAt: new Date('2024-04-01T00:00:00Z').toISOString(),
  crimeTypes: CRIME_TYPES.map(({ key, label }) => ({ key, label })),
  areas,
};

const out = path.join(root, 'data/official-crime.json');
writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`wrote ${out} (${areas.length} areas, dataStatus=sample)`);
