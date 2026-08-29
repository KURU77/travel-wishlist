/* data/presets.csv（手入力するソース）から js/presets.js を生成する。
 *
 *   node tools/build-presets.mjs          … 生成する
 *   node tools/build-presets.mjs --check  … 生成せず、CSV の書式だけ検査する
 *
 * CSV を直せば、GitHub Actions がこれを走らせて presets.js を作り直す。
 * presets.js は生成物なので、手で編集しないこと。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = path.join(ROOT, 'data', 'presets.csv');
const OUT_PATH = path.join(ROOT, 'js', 'presets.js');
const SW_PATH = path.join(ROOT, 'sw.js');

const CHECK_ONLY = process.argv.includes('--check');
const BUMP_SW = process.argv.includes('--bump-sw');

/* app.js の既定の分類と揃えること */
const CATEGORIES = [
  'heritage', 'monument', 'temple', 'castle', 'museum', 'nature',
  'park', 'onsen', 'gourmet', 'activity', 'shop', 'city', 'other',
];

const COLUMNS = ['名称', '検索キー', '所在地', '緯度', '経度', '分類', '世界遺産', 'OSM_ID'];

// ---------- CSV ----------

/** ダブルクォート対応の CSV パーサ（依存を増やさないため自前） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function toCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- 読み込みと検査 ----------

const errors = [];
const warnings = [];

function readPresets() {
  if (!fs.existsSync(CSV_PATH)) {
    errors.push(`${path.relative(ROOT, CSV_PATH)} がありません`);
    return [];
  }
  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  if (!rows.length) { errors.push('CSV が空です'); return []; }

  const header = rows[0].map((h) => h.trim());
  COLUMNS.forEach((name, i) => {
    if (header[i] !== name) {
      errors.push(`1行目の見出しが違います。${i + 1}列目は「${name}」のはずが「${header[i] || '(空)'}」です`);
    }
  });
  if (errors.length) return [];

  const seen = new Map();
  const out = [];

  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2; // CSV 上の行番号（見出し込み）
    const at = (i) => String(cells[i] == null ? '' : cells[i]).trim();

    const n = at(0);
    const k = at(1);
    const c = at(2);
    const latRaw = at(3);
    const lngRaw = at(4);
    const cat = at(5) || 'other';
    const whcRaw = at(6).toLowerCase();
    const osm = at(7);

    if (!n) { errors.push(`${line}行目: 名称が空です`); return; }

    if (seen.has(n)) {
      errors.push(`${line}行目: 名称「${n}」が ${seen.get(n)}行目 と重複しています`);
      return;
    }
    seen.set(n, line);

    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push(`${line}行目「${n}」: 緯度が -90〜90 の数値ではありません（"${latRaw}"）`);
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push(`${line}行目「${n}」: 経度が -180〜180 の数値ではありません（"${lngRaw}"）`);
      return;
    }
    if (lat === 0 && lng === 0) {
      warnings.push(`${line}行目「${n}」: 座標が 0,0 です。入れ忘れていませんか`);
    }

    if (!CATEGORIES.includes(cat)) {
      errors.push(`${line}行目「${n}」: 分類「${cat}」は使えません。${CATEGORIES.join(' / ')} のどれかにしてください`);
      return;
    }

    if (osm && !/^[NWR]\d+$/.test(osm)) {
      errors.push(`${line}行目「${n}」: OSM_ID は N/W/R + 数字の形にしてください（"${osm}"）`);
      return;
    }

    if (!['', 'yes', 'y', 'true', '1', 'no', 'n', 'false', '0'].includes(whcRaw)) {
      errors.push(`${line}行目「${n}」: 世界遺産の欄は yes か空にしてください（"${at(6)}"）`);
      return;
    }

    if (!c) warnings.push(`${line}行目「${n}」: 所在地が空です。エリア別ページで分類できません`);

    out.push({
      n,
      k,
      c,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      cat,
      whc: ['yes', 'y', 'true', '1'].includes(whcRaw),
      o: osm,
    });
  });

  return out;
}

// ---------- 出力 ----------

function toPresetsJs(list) {
  const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const line = (p) => `  { n: '${esc(p.n)}', k: '${esc(p.k)}', c: '${esc(p.c)}', `
    + `lat: ${p.lat}, lng: ${p.lng}, cat: '${esc(p.cat)}', whc: ${p.whc}`
    + `${p.o ? `, o: '${esc(p.o)}'` : ''} },`;

  return [
    '/* 自動生成ファイル — 直接編集しないこと。',
    '   手で足したり直したりするのは data/presets.csv のほう。',
    '   保存すると GitHub Actions がこのファイルを作り直す。',
    '   手元で作り直すときは: node tools/build-presets.mjs',
    '',
    '   n: 名称 / k: 検索キー / c: 所在地 / lat,lng: 座標',
    `   cat: 分類 / whc: 世界遺産 / o: OSM ID   （全${list.length}件） */`,
    'window.SPOT_PRESETS = [',
    ...list.map(line),
    '];',
    '',
  ].join('\n');
}

/** Service Worker のバージョンを1つ上げて、更新を確実に配る */
function bumpServiceWorker() {
  const src = fs.readFileSync(SW_PATH, 'utf8');
  const m = src.match(/const VERSION = 'v(\d+)';/);
  if (!m) { warnings.push('sw.js の VERSION を見つけられませんでした'); return null; }
  const next = `v${Number(m[1]) + 1}`;
  fs.writeFileSync(SW_PATH, src.replace(m[0], `const VERSION = '${next}';`));
  return next;
}

// ---------- 実行 ----------

const presets = readPresets();

if (errors.length) {
  console.error(`\n✗ data/presets.csv に ${errors.length} 件の問題があります\n`);
  errors.forEach((e) => console.error('  ・' + e));
  console.error('\n直してから保存してください。presets.js は作り直していません。\n');
  process.exit(1);
}

warnings.forEach((w) => console.warn('  ! ' + w));

const byCat = {};
presets.forEach((p) => { byCat[p.cat] = (byCat[p.cat] || 0) + 1; });

if (CHECK_ONLY) {
  console.log(`✓ ${presets.length} 件、書式に問題なし`);
  process.exit(0);
}

const next = toPresetsJs(presets);
const prev = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';

if (prev === next) {
  console.log('変更なし（presets.js は最新です）');
  process.exit(0);
}

fs.writeFileSync(OUT_PATH, next);
const bumped = BUMP_SW ? bumpServiceWorker() : null;

console.log(`✓ js/presets.js を書き出しました（${presets.length}件）`);
console.log('  分類別:', Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' / '));
if (bumped) console.log(`  sw.js の VERSION を ${bumped} に上げました`);
