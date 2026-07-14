// 新宿: フロア図に方面サイン(signs)とランドマーク(marks)を追加する(一回きり)
import fs from "node:fs";
const path = new URL("../data/facilities.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));
const s = data.stations["新宿"];
const floor = (id) => s.floors.find((f) => f.id === id);

// 京王線ホーム(B2F): 進行方向とJR乗換方向
floor("B2F京王").signs = [
  { side: "left", d: 0.75, label: "府中・京王八王子方面" },
  { side: "right", d: 0.25, label: "改札・JR乗換" },
];

// B1F 東西通路: 左右の方面と主要ランドマーク
const b1 = floor("B1F");
b1.signs = [
  { side: "left", d: 0.12, label: "都庁・大江戸線" },
  { side: "right", d: 0.12, label: "東口・丸ノ内線" },
];
b1.marks = [
  { x: 0.08, d: 0.85, icon: "🏬", label: "京王百貨店" },
  { x: 0.33, d: 0.85, icon: "🏬", label: "小田急百貨店" },
  { x: 0.57, d: 0.62, icon: "🎫", label: "JRきっぷうりば" },
];

// JRホーム(1F): 中央線の進行方向
floor("1F").signs = [
  { side: "left", d: 0.3, label: "立川・八王子方面" },
  { side: "right", d: 0.3, label: "東京・御茶ノ水方面" },
];

fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("新宿 signs/marks 追加");
