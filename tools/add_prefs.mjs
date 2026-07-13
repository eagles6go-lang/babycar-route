// facilities.json の各駅に都道府県コード(pref)を付与する一回きりのスクリプト
import fs from "node:fs";
const path = new URL("../data/facilities.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));
const prefs = {
  "東京": 13, "新宿": 13, "池袋": 13, "渋谷": 13, "横浜": 14, "品川": 13, "上野": 13,
  "大宮": 11, "北千住": 13, "押上": 13, "豊洲": 13, "二子玉川": 13, "武蔵小杉": 14,
  "吉祥寺": 13, "立川": 13, "川崎": 14, "船橋": 12, "海老名": 14, "表参道": 13,
  "銀座": 13, "大手町": 13, "秋葉原": 13, "飯田橋": 13, "中目黒": 13, "錦糸町": 13,
  "日暮里": 13, "溝の口": 14, "町田": 13, "西船橋": 12,
};
for (const [name, st] of Object.entries(data.stations)) {
  if (prefs[name] != null && st.pref == null) st.pref = prefs[name];
}
fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("done:", Object.keys(data.stations).length, "stations");
