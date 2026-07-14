// 新宿駅のフロア構造を水平配置つきに更新し、京王線→JRのガイドを追加する(一回きり)
import fs from "node:fs";
const path = new URL("../data/facilities.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));
const s = data.stations["新宿"];

// x/w は 0-1 の相対位置(左=西側)。同じ level が連続すると同じ高さに横並びで描画される
s.floors = [
  { id: "2F", label: "南口改札・甲州街道", x: 0.34, w: 0.5 },
  { id: "1F", label: "JRホーム(中央)", x: 0.38, w: 0.55 },
  { id: "B1F", label: "東西通路・西口/東口改札", x: 0.04, w: 0.93, toilet: "改札内多機能トイレ・駅ビルベビールーム" },
  { id: "B2F京王", level: "B2F", label: "京王線ホーム(西側)", x: 0.0, w: 0.3 },
  { id: "B2F", level: "B2F", label: "丸ノ内線ホーム(東側)", x: 0.72, w: 0.27 },
  { id: "B5F", label: "都営新宿線・京王新線ホーム(南西側)", x: 0.03, w: 0.42 },
  { id: "B7F", label: "大江戸線ホーム(都庁側・最深部)", x: 0.0, w: 0.3 },
];
s.transferGuides = [
  {
    from: "京王線",
    to: "JR各線",
    steps: [
      { type: "car", line: "京王線", direction: "新宿方面", car: "前寄り車両", reason: "終点新宿は前方が改札に近い(要確認)" },
      { type: "elevator", fromFloor: "B2F京王", toFloor: "B1F", name: "京王ホームEV", x: 0.14 },
      { type: "walk", note: "京王百貨店口改札を出て東へ。JR中央西口方面へ通路を徒歩3〜5分" },
      { type: "elevator", fromFloor: "B1F", toFloor: "1F", name: "JRホームEV(各ホームごと)", x: 0.6 },
    ],
  },
  {
    from: "JR各線",
    to: "丸ノ内線",
    steps: [
      { type: "elevator", fromFloor: "1F", toFloor: "B1F", name: "JRホームEV", x: 0.6 },
      { type: "walk", note: "東口方面へ地下通路を進む" },
      { type: "elevator", fromFloor: "B1F", toFloor: "B2F", name: "丸ノ内線EV", x: 0.82 },
    ],
  },
  {
    from: "JR各線",
    to: "大江戸線",
    steps: [
      { type: "elevator", fromFloor: "1F", toFloor: "B1F", name: "JRホームEV", x: 0.5 },
      { type: "walk", note: "西口から都庁方面へ。大江戸線は非常に深いのでEVを乗り継ぐ" },
      { type: "elevator", fromFloor: "B1F", toFloor: "B7F", name: "大江戸線EV(乗継)", x: 0.08 },
    ],
  },
];
fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("新宿 updated:", s.floors.length, "floors /", s.transferGuides.length, "guides");
