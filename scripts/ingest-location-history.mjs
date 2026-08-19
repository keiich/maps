#!/usr/bin/env node
/**
 * Google タイムラインの書き出し (locationhistory.json) を、地図が読む圧縮形式に変換する。
 *
 *   node scripts/ingest-location-history.mjs --file ~/Downloads/locationhistory.json
 *
 * 既定の出力先は data/timeline.json で、これは .gitignore に入れてある。位置情報そのもの
 * なのでリポジトリに入れない。手元やセルフホストで動かすときだけ /api/history がこれを配る。
 *
 * ブラウザにファイルを落とすだけでも同じことができる（そちらはサーバーを一切通らない）。
 * このスクリプトは「毎回読み込ませたくない」「自分だけの環境に置いておきたい」場合向け。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTimeline, encodeTimeline } from '../lib/history/timeline.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { file: null, out: path.join(ROOT, 'data', 'timeline.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--file' || a === '-f') args.file = argv[++i];
    else if (a === '--out' || a === '-o') args.out = path.resolve(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-') && !args.file) args.file = a;
  }
  return args;
}

const USAGE = `使い方: node scripts/ingest-location-history.mjs --file <locationhistory.json> [--out <出力先>]`;

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.file) {
  console.log(USAGE);
  process.exit(args.help ? 0 : 1);
}

const src = path.resolve(args.file);
console.log(`読み込み: ${src}`);

let raw;
try {
  raw = JSON.parse(await readFile(src, 'utf8'));
} catch (e) {
  console.error(`読み込めませんでした: ${e.message}`);
  process.exit(1);
}

const timeline = buildTimeline(raw);
if (!timeline.segments.length) {
  console.error('移動の記録が見つかりませんでした。ファイルの中身を確認してください。');
  process.exit(1);
}

const compact = encodeTimeline(timeline);
const json = JSON.stringify(compact);

await mkdir(path.dirname(args.out), { recursive: true });
await writeFile(args.out, json);

const byMode = new Map();
let distanceM = 0;
let points = 0;
for (const s of timeline.segments) {
  byMode.set(s.mode, (byMode.get(s.mode) ?? 0) + s.distanceM);
  distanceM += s.distanceM;
  points += s.path.length;
}

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
console.log(`\n出力: ${args.out} (${(json.length / 1e6).toFixed(2)} MB)`);
console.log(`期間: ${iso(timeline.t0)} 〜 ${iso(timeline.t1)}`);
console.log(`区間: ${timeline.segments.length} / 点: ${points} / 滞在: ${timeline.stays.length}`);
console.log(`総距離: ${(distanceM / 1000).toFixed(0)} km`);
console.log('\n移動手段ごとの距離:');
for (const [mode, m] of [...byMode].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${mode.padEnd(11)} ${(m / 1000).toFixed(0).padStart(7)} km`);
}
