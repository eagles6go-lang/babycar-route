// 関東の鉄道ネットワークデータを station_database (CC BY 4.0) から生成する
// 出典: https://github.com/Seo-4d696b75/station_database
// 使い方: node tools/build_network.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, "tools", ".cache");
const OUT = path.join(ROOT, "data", "network.json");
const BASE = "https://raw.githubusercontent.com/Seo-4d696b75/station_database/main/out/main";

// 関東: 茨城8 栃木9 群馬10 埼玉11 千葉12 東京13 神奈川14
const KANTO = new Set([8, 9, 10, 11, 12, 13, 14]);

async function fetchJson(url, cacheName) {
  const cachePath = path.join(CACHE, cacheName);
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {}
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const data = await res.json();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(data));
  return data;
}

const lines = await fetchJson(`${BASE}/line.json`, "line.json");
const stations = await fetchJson(`${BASE}/station.json`, "station.json");

const stationByCode = new Map(stations.map((s) => [s.code, s]));

// 関東に駅を持つ路線を対象にする(新幹線は在来乗換の比較対象として含める)
const kantoLineCodes = new Set();
for (const s of stations) {
  if (s.closed || !KANTO.has(s.prefecture)) continue;
  for (const lc of s.lines) kantoLineCodes.add(lc);
}

const outLines = [];
const usedStationCodes = new Set();
let done = 0;
const targets = lines.filter((l) => kantoLineCodes.has(l.code) && !l.closed);
console.log(`対象路線: ${targets.length}`);

// 並列しすぎない程度に取得
const queue = [...targets];
async function worker() {
  while (queue.length) {
    const line = queue.shift();
    let detail;
    try {
      detail = await fetchJson(`${BASE}/line/${line.code}.json`, `line_${line.code}.json`);
    } catch (e) {
      console.warn(`skip ${line.name}: ${e.message}`);
      continue;
    }
    // 関東内の駅だけ残す(路線の端が関東外に伸びる場合は切り詰め)
    const seq = detail.station_list
      .filter((s) => !s.closed && KANTO.has(s.prefecture))
      .map((s) => s.code);
    if (seq.length < 2) continue;
    for (const c of seq) usedStationCodes.add(c);
    outLines.push({ c: line.code, n: line.name, col: line.color || "#888888", s: seq });
    done++;
    if (done % 40 === 0) console.log(`  ${done}/${targets.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const outStations = [...usedStationCodes]
  .map((c) => stationByCode.get(c))
  .filter(Boolean)
  .map((s) => ({
    c: s.code,
    n: s.name,
    k: s.name_kana,
    p: s.prefecture,
    lat: Math.round(s.lat * 1e5) / 1e5,
    lng: Math.round(s.lng * 1e5) / 1e5,
  }));

const out = {
  source: "station_database (https://github.com/Seo-4d696b75/station_database) CC BY 4.0",
  generated: new Date().toISOString().slice(0, 10),
  stations: outStations,
  lines: outLines,
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(out));
console.log(`駅 ${outStations.length} / 路線 ${outLines.length} -> ${OUT}`);
