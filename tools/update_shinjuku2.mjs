// 新宿駅の徒歩経路(ドット経路の曲がり角)と改札マーカーを追加する(一回きり)
import fs from "node:fs";
const path = new URL("../data/facilities.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));
const s = data.stations["新宿"];

// B1F(東西通路)に改札マーカー
const b1 = s.floors.find((f) => f.id === "B1F");
b1.marks = [
  { x: 0.16, d: 0.6, label: "京王百貨店口改札" },
  { x: 0.52, d: 0.35, label: "JR中央西口改札" },
];

// 京王線→JRガイドの徒歩に曲がり角つき経路
const keio = s.transferGuides.find((g) => g.from === "京王線");
const walk = keio.steps.find((st) => st.type === "walk");
walk.path = [
  { x: 0.18, d: 0.62 },
  { x: 0.34, d: 0.62 },
  { x: 0.36, d: 0.38 },
  { x: 0.52, d: 0.38 },
];

fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("新宿 path/marks updated");
