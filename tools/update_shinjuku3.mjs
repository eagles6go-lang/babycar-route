// 新宿: 京王線→JR中央線の完全導線ガイド(改札ゲート・到着側号車つき)に更新する(一回きり)
import fs from "node:fs";
const path = new URL("../data/facilities.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));
const s = data.stations["新宿"];

// B1Fの汎用マーカーはゲートステップに置き換えるため削除
const b1 = s.floors.find((f) => f.id === "B1F");
delete b1.marks;

// 京王線→JR各線 ガイドを「京王線→JR中央線」の完全導線に置き換え
const idx = s.transferGuides.findIndex((g) => g.from === "京王線");
s.transferGuides[idx] = {
  from: "京王線",
  to: "JR中央線・各線",
  steps: [
    { type: "car", line: "京王線", direction: "新宿方面", car: "先頭寄りの車両",
      reason: "終点新宿は先頭(進行方向前方)が改札・EVに近い(要確認)" },
    { type: "elevator", fromFloor: "B2F京王", toFloor: "B1F", name: "京王ホームEV", x: 0.12 },
    { type: "gate", name: "京王百貨店口改札(出場)", x: 0.2, d: 0.6 },
    { type: "walk", note: "連絡通路を東(JR方面)へ徒歩3〜5分",
      path: [{ x: 0.3, d: 0.6 }, { x: 0.33, d: 0.38 }] },
    { type: "gate", name: "JR中央西口改札(入場)", x: 0.45, d: 0.38 },
    { type: "walk", note: "中央線(11・12番線)ホームのEVへ" },
    { type: "elevator", fromFloor: "B1F", toFloor: "1F", name: "中央線ホームEV", x: 0.62 },
    { type: "car", line: "JR中央線", direction: "東京方面", car: "EV最寄りの車両",
      reason: "降車駅での移動も楽(号車は未確認・メモ募集)" },
  ],
};

fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("新宿 京王→中央線 完全導線に更新");
