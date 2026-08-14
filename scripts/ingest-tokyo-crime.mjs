/**
 * 警視庁が公開している「市区町村別・罪種別 認知件数」の CSV を
 * data/official-crime.json（アプリが読む形式）に変換する。
 *
 * 公開ページ:
 *   https://www.keishicho.metro.tokyo.lg.jp/about_mpd/jokyo_tokei/jokyo/ninchikensu.html
 * 東京都オープンデータカタログにも同種のデータがある:
 *   https://catalog.data.metro.tokyo.lg.jp/
 *
 * CSV のファイル名・列名は年度ごとに変わるため、URL やファイルは引数で渡す。
 *
 *   # ダウンロード済みのファイルから変換
 *   node scripts/ingest-tokyo-crime.mjs --file ./ninchikensu2024.csv --period 2024
 *
 *   # URL から直接取得
 *   node scripts/ingest-tokyo-crime.mjs --url https://example.metro.tokyo.lg.jp/xxx.csv --period 2024
 *
 * 列の対応が自動判定に失敗する場合は --columns で明示する:
 *   --columns "name=市区町村,violent=凶悪犯,assault=粗暴犯,burglary=侵入窃盗,theft=非侵入窃盗,fraud=知能犯"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));

if (!args.file && !args.url) {
  console.error('--file か --url のどちらかを指定してください。詳しくはこのファイルの先頭コメントを参照。');
  process.exit(1);
}

const root = process.cwd();
const municipalities = JSON.parse(
  readFileSync(path.join(root, 'data/tokyo-municipalities.json'), 'utf8'),
);

/** アプリ側が使う罪種キーと、CSV 列名に現れやすい表記。 */
const CRIME_TYPES = [
  { key: 'violent', label: '凶悪犯', aliases: ['凶悪犯', '凶悪'] },
  { key: 'assault', label: '粗暴犯', aliases: ['粗暴犯', '粗暴'] },
  { key: 'burglary', label: '侵入窃盗', aliases: ['侵入窃盗', '侵入盗'] },
  { key: 'theft', label: '非侵入窃盗', aliases: ['非侵入窃盗', 'その他の窃盗', '乗り物盗'] },
  { key: 'fraud', label: '知能犯', aliases: ['知能犯', '詐欺'] },
  { key: 'other', label: 'その他', aliases: ['その他', '風俗犯', 'その他の刑法犯'] },
];

const buffer = args.file
  ? readFileSync(path.resolve(args.file))
  : Buffer.from(await (await fetchOrDie(args.url)).arrayBuffer());

const text = decode(buffer);
const rows = parseCsv(text);
if (rows.length < 2) {
  console.error('CSV を解釈できませんでした。ファイルの中身を確認してください。');
  process.exit(1);
}

const { headerIndex, header } = findHeaderRow(rows);
const columnMap = buildColumnMap(header, args.columns);

if (columnMap.name < 0) {
  console.error('市区町村名の列が見つかりません。--columns "name=<列名>" で指定してください。');
  console.error(`検出したヘッダー: ${header.join(' | ')}`);
  process.exit(1);
}

const byName = new Map(municipalities.map((m) => [normalizeName(m.name), m]));
const areas = [];
const unmatched = [];

for (const row of rows.slice(headerIndex + 1)) {
  const rawName = (row[columnMap.name] ?? '').trim();
  if (!rawName) continue;
  const municipality = byName.get(normalizeName(rawName));
  if (!municipality) {
    // 「合計」「都内総数」など集計行はここに落ちる
    unmatched.push(rawName);
    continue;
  }

  const counts = {};
  let total = 0;
  for (const type of CRIME_TYPES) {
    const idx = columnMap[type.key];
    if (idx === undefined || idx < 0) continue;
    const n = toNumber(row[idx]);
    counts[type.key] = n;
    total += n;
  }
  if (total === 0 && Object.keys(counts).length === 0) continue;

  areas.push({
    code: municipality.code,
    name: municipality.name,
    lat: municipality.lat,
    lng: municipality.lng,
    population: municipality.population,
    counts,
    total,
  });
}

if (areas.length === 0) {
  console.error('1件も変換できませんでした。--columns で列名を指定してみてください。');
  console.error(`検出したヘッダー: ${header.join(' | ')}`);
  process.exit(1);
}

const dataset = {
  dataStatus: 'official',
  period: args.period ?? '不明',
  sourceName: args.sourceName ?? '警視庁 市区町村別・罪種別 認知件数',
  sourceUrl:
    args.url ??
    args.sourceUrl ??
    'https://www.keishicho.metro.tokyo.lg.jp/about_mpd/jokyo_tokei/jokyo/ninchikensu.html',
  license: args.license ?? 'CC BY 4.0 (出典元のライセンスを確認して設定してください)',
  retrievedAt: new Date().toISOString(),
  crimeTypes: CRIME_TYPES.filter((t) => columnMap[t.key] >= 0).map(({ key, label }) => ({
    key,
    label,
  })),
  areas,
};

const out = path.join(root, 'data/official-crime.json');
writeFileSync(out, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`wrote ${out} (${areas.length} areas)`);
if (unmatched.length) {
  console.log(`対応する市区町村が無かった行 (${unmatched.length}件): ${unmatched.slice(0, 10).join(', ')}`);
}
const missing = municipalities.filter((m) => !areas.some((a) => a.code === m.code));
if (missing.length) {
  console.log(`CSV に無かった市区町村 (${missing.length}件): ${missing.map((m) => m.name).join(', ')}`);
}

// ---------------------------------------------------------------- helpers

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq > -1) {
      out[camel(arg.slice(2, eq))] = arg.slice(eq + 1);
    } else {
      out[camel(arg.slice(2))] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function camel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

async function fetchOrDie(url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`取得に失敗しました: ${res.status} ${res.statusText} (${url})`);
    process.exit(1);
  }
  return res;
}

/** 官公庁の CSV は Shift_JIS が多いので、UTF-8 で壊れたら Shift_JIS を試す。 */
function decode(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.subarray(3));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('shift_jis').decode(buf);
}

/** ダブルクォート対応の最小限の CSV パーサ。 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** 先頭に説明行が入っている CSV があるので、市区町村っぽい列を持つ行を探す。 */
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    if (rows[i].some((c) => /市区町村|区市町村|警察署|市町村/.test(c))) {
      return { headerIndex: i, header: rows[i].map((c) => c.trim()) };
    }
  }
  return { headerIndex: 0, header: rows[0].map((c) => c.trim()) };
}

function buildColumnMap(header, overrides) {
  const map = { name: -1 };
  for (const type of CRIME_TYPES) map[type.key] = -1;

  header.forEach((col, idx) => {
    const c = col.replace(/\s/g, '');
    if (map.name < 0 && /市区町村|区市町村|市町村名|地域/.test(c)) map.name = idx;
    for (const type of CRIME_TYPES) {
      if (map[type.key] < 0 && type.aliases.some((a) => c.includes(a))) map[type.key] = idx;
    }
  });

  if (overrides) {
    for (const pair of overrides.split(',')) {
      const [key, label] = pair.split('=').map((s) => s.trim());
      if (!key || !label) continue;
      const idx = header.findIndex((c) => c.replace(/\s/g, '').includes(label));
      if (idx < 0) {
        console.warn(`--columns の "${label}" に一致する列が見つかりませんでした。`);
        continue;
      }
      map[key] = idx;
    }
  }
  return map;
}

/** 「1,234」「-」「1234件」などをまとめて数値化する。 */
function toNumber(value) {
  if (!value) return 0;
  const n = Number.parseInt(String(value).replace(/[,\s件]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 表記ゆれ（全角スペース、東京都プレフィックス）を吸収して突き合わせる。 */
function normalizeName(name) {
  return name
    .replace(/^東京都/, '')
    .replace(/[\s　]/g, '')
    .normalize('NFKC');
}
