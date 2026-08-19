#!/usr/bin/env node
/**
 * デモ用のサンプル行動履歴を作る。
 *
 *   node scripts/make-history-sample.mjs
 *
 * 出力は public/history-sample.json。実在の人の記録ではなく、通勤・週末の自転車・
 * 車での遠出・スキー旅行・飛行機・フェリーを組み合わせて機械的に生成した架空のデータ。
 * 生の Google 形式を作ってから本番と同じ変換にかけているので、取り込み処理の確認も兼ねる。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTimeline, encodeTimeline } from '../lib/history/timeline.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'history-sample.json');

/** 再現性のある擬似乱数（同じ入力から毎回同じサンプルを作るため）。 */
let seed = 20260818;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const P = {
  home: [139.771, 35.698],
  stationA: [139.7526, 35.7078],
  stationB: [139.7671, 35.6812],
  office: [139.7745, 35.6795],
  busStop: [139.7666, 35.6926],
  park: [139.71, 35.6852],
  hakone: [139.1069, 35.2324],
  haneda: [139.7798, 35.5494],
  fukuoka: [130.4453, 33.5859],
  hakata: [130.4207, 33.5903],
  yuzawaStation: [138.8107, 36.9339],
  skiTop: [138.8305, 36.9128],
  skiBase: [138.8215, 36.9245],
  ferryA: [139.7712, 35.6535],
  ferryB: [139.8592, 35.6289],
};

const R = Math.PI / 180;
function distM(a, b) {
  const dLat = (b[1] - a[1]) * R;
  const dLng = (b[0] - a[0]) * R;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const entries = [];
const geo = (p) => `geo:${p[1].toFixed(6)},${p[0].toFixed(6)}`;
const iso = (ms) => new Date(ms).toISOString();

/**
 * A から B へ移動する 1 区間を作る。実際に通った点列 (timelinePath) と、
 * Google がラベルを付けた区間 (activity) の両方を出す。
 */
function leg(t0, from, to, kmh, type, { curve = 0.12, jitter = 0.0004 } = {}) {
  const meters = distM(from, to);
  const durationMs = Math.max(3, (meters / ((kmh * 1000) / 3600) / 60)) * 60_000;
  const steps = Math.max(2, Math.min(110, Math.round(durationMs / 60_000)));
  const bend = (rnd() - 0.5) * curve;

  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    // 直線だと不自然なので、垂直方向にふくらませてから小さく揺らす。
    const arc = Math.sin(f * Math.PI) * bend;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    points.push({
      point: geo([
        from[0] + dx * f - dy * arc + (rnd() - 0.5) * jitter,
        from[1] + dy * f + dx * arc + (rnd() - 0.5) * jitter,
      ]),
      durationMinutesOffsetFromStartTime: String(Math.round((f * durationMs) / 60_000)),
    });
  }

  const t1 = t0 + durationMs;
  entries.push({ startTime: iso(t0), endTime: iso(t1), timelinePath: points });
  entries.push({
    startTime: iso(t0),
    endTime: iso(t1),
    activity: {
      start: geo(from),
      end: geo(to),
      distanceMeters: meters.toFixed(6),
      topCandidate: { type, probability: '0.900000' },
    },
  });
  return t1;
}

/** 点列を持たない移動（飛行機など、記録が飛びがちなもの）。 */
function jump(t0, from, to, kmh, type) {
  const meters = distM(from, to);
  const t1 = t0 + (meters / ((kmh * 1000) / 3600)) * 1000;
  entries.push({
    startTime: iso(t0),
    endTime: iso(t1),
    activity: {
      start: geo(from),
      end: geo(to),
      distanceMeters: meters.toFixed(6),
      topCandidate: { type, probability: '0.900000' },
    },
  });
  return t1;
}

function stay(t0, at, minutes) {
  const t1 = t0 + minutes * 60_000;
  entries.push({
    startTime: iso(t0),
    endTime: iso(t1),
    visit: {
      hierarchyLevel: '0',
      probability: '0.930000',
      topCandidate: {
        probability: '0.900000',
        semanticType: 'Unknown',
        placeID: 'sample',
        placeLocation: geo(at),
      },
    },
  });
  return t1;
}

const DAY = 86_400_000;
const END = Date.parse('2026-08-18T00:00:00+09:00');
const START = END - 365 * DAY;
const at = (day, hour, min = 0) => START + day * DAY + (hour - 9) * 3_600_000 + min * 60_000;

for (let day = 0; day < 365; day += 1) {
  const date = new Date(START + day * DAY);
  const dow = date.getUTCDay();
  const md = `${date.getUTCMonth() + 1}-${date.getUTCDate()}`;

  // 冬に 3 日間のスキー旅行。
  if (md === '2-14') {
    let t = at(day, 7, 30);
    t = leg(t, P.home, P.stationA, 4.6, 'walking');
    t = leg(t, P.stationA, P.stationB, 30, 'in subway');
    t = leg(t, P.stationB, P.yuzawaStation, 165, 'in train', { curve: 0.02 });
    t = leg(t, P.yuzawaStation, P.skiBase, 26, 'in bus');
    stay(t, P.skiBase, 120);
    continue;
  }
  if (md === '2-15' || md === '2-16') {
    let t = at(day, 9, 0);
    for (let run = 0; run < 6; run += 1) {
      t = leg(t, P.skiBase, P.skiTop, 9, 'skiing', { curve: 0.02, jitter: 0.0002 });
      t = leg(t, P.skiTop, P.skiBase, 34, 'skiing', { curve: 0.5, jitter: 0.0006 });
      t = stay(t, P.skiBase, 12);
    }
    if (md === '2-16') {
      t = leg(t, P.skiBase, P.yuzawaStation, 26, 'in bus');
      t = leg(t, P.yuzawaStation, P.stationB, 165, 'in train', { curve: 0.02 });
      t = leg(t, P.stationB, P.home, 4.6, 'walking');
      stay(t, P.home, 600);
    }
    continue;
  }

  // 春に福岡へ 2 泊。行きは飛行機、帰りは新幹線。
  if (md === '5-20') {
    let t = at(day, 8, 0);
    t = leg(t, P.home, P.haneda, 32, 'in train', { curve: 0.05 });
    t = jump(t, P.haneda, P.fukuoka, 640, 'flying');
    t = leg(t, P.fukuoka, P.hakata, 45, 'in passenger vehicle');
    stay(t, P.hakata, 720);
    continue;
  }
  if (md === '5-21') {
    let t = at(day, 10, 0);
    t = leg(t, P.hakata, P.fukuoka, 38, 'in bus');
    t = leg(t, P.fukuoka, P.hakata, 12, 'cycling');
    stay(t, P.hakata, 600);
    continue;
  }
  if (md === '5-22') {
    let t = at(day, 11, 0);
    t = leg(t, P.hakata, P.stationB, 195, 'in train', { curve: 0.03 });
    t = leg(t, P.stationB, P.home, 4.6, 'walking');
    stay(t, P.home, 600);
    continue;
  }

  // 夏に東京湾のフェリー。
  if (md === '7-12') {
    let t = at(day, 10, 0);
    t = leg(t, P.home, P.ferryA, 30, 'in subway');
    t = leg(t, P.ferryA, P.ferryB, 22, 'in ferry', { curve: 0.08 });
    t = stay(t, P.ferryB, 180);
    t = leg(t, P.ferryB, P.home, 34, 'in passenger vehicle');
    stay(t, P.home, 600);
    continue;
  }

  if (dow === 0) {
    // 日曜は車で遠出。
    let t = at(day, 9, 30);
    t = leg(t, P.home, P.hakone, 62, 'in passenger vehicle', { curve: 0.06 });
    t = stay(t, P.hakone, 240);
    t = leg(t, P.hakone, P.home, 58, 'in passenger vehicle', { curve: 0.06 });
    stay(t, P.home, 600);
    continue;
  }

  if (dow === 6) {
    // 土曜は自転車と散歩。
    let t = at(day, 10, 0);
    t = leg(t, P.home, P.park, 17, 'cycling', { curve: 0.2 });
    t = leg(t, P.park, P.park.map((v, i) => v + (i ? 0.006 : 0.008)), 4.4, 'walking', { curve: 0.4 });
    t = stay(t, P.park, 90);
    t = leg(t, P.park, P.home, 16, 'cycling', { curve: 0.22 });
    stay(t, P.home, 600);
    continue;
  }

  // 平日の通勤。たまにバスに乗る。
  const bus = rnd() < 0.18;
  let t = at(day, 8, Math.round(rnd() * 20));
  if (bus) {
    t = leg(t, P.home, P.busStop, 4.7, 'walking');
    t = leg(t, P.busStop, P.stationB, 21, 'in bus', { curve: 0.1 });
  } else {
    t = leg(t, P.home, P.stationA, 4.8, 'walking');
    t = leg(t, P.stationA, P.stationB, 31, 'in subway', { curve: 0.04 });
  }
  t = leg(t, P.stationB, P.office, 4.5, 'walking');
  t = stay(t, P.office, 480 + Math.round(rnd() * 120));
  t = leg(t, P.office, P.stationB, 4.5, 'walking');
  t = leg(t, P.stationB, P.stationA, 31, 'in subway', { curve: 0.04 });
  t = leg(t, P.stationA, P.home, 4.6, 'walking');
  stay(t, P.home, 540);
}

entries.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));

const timeline = buildTimeline(entries);
const json = JSON.stringify(encodeTimeline(timeline));
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, json);

const byMode = new Map();
for (const s of timeline.segments) byMode.set(s.mode, (byMode.get(s.mode) ?? 0) + s.distanceM);
console.log(`出力: ${OUT} (${(json.length / 1024).toFixed(0)} KB)`);
console.log(`区間 ${timeline.segments.length} / 滞在 ${timeline.stays.length}`);
console.log(
  [...byMode]
    .sort((a, b) => b[1] - a[1])
    .map(([m, d]) => `${m} ${(d / 1000).toFixed(0)}km`)
    .join(' / '),
);
