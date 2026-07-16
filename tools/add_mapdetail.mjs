// 新宿・東京の駅階層図データ(mapDetail)を facilities.json に追加する(一回きり)
// 座標系: 幅400固定 / 高さはフロアごと(h)。x: 左=西, 右=東 / y: 上=北, 下=南。
// 実際の構内配置を模式化した参考図(要現地確認)。
import fs from "node:fs";
const path = new URL("../data/facilities.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));

// ================= 新宿 =================
data.stations["新宿"].mapDetail = {
  floors: [
    {
      short: "1F", label: "1F JRホーム階", h: 240, compass: "←西 ・ 東→ / 上=北",
      areas: [
        { x: 150, y: 30, w: 20, h: 160, kind: "platform", label: "7・8番線" },
        { x: 180, y: 30, w: 20, h: 160, kind: "platform", label: "9・10番線" },
        { x: 210, y: 30, w: 20, h: 160, kind: "platform", label: "11・12番線 中央線快速", hl: true },
        { x: 240, y: 30, w: 20, h: 160, kind: "platform", label: "13・14番線" },
        { x: 270, y: 30, w: 20, h: 160, kind: "platform", label: "15・16番線 山手線ほか" },
        { x: 60, y: 200, w: 280, h: 30, kind: "corridor", label: "南口コンコース(甲州街道)" },
      ],
      items: [
        { x: 220, y: 60, icon: "🛗", label: "11・12番線EV" },
        { x: 280, y: 60, icon: "🛗" },
        { x: 320, y: 130, icon: "🚻", label: "改札内トイレ" },
      ],
      gates: [{ x: 200, y: 215, w: 40, label: "南口改札" }],
    },
    {
      short: "B1F", label: "B1F 通路・各改札(メインフロア)", h: 260, compass: "←西 ・ 東→ / 上=北",
      areas: [
        { x: 30, y: 40, w: 90, h: 60, kind: "zone", label: "小田急線 のりば" },
        { x: 30, y: 130, w: 100, h: 90, kind: "zone", label: "京王線 改札内", hl: true },
        { x: 140, y: 95, w: 220, h: 45, kind: "corridor", label: "東西自由通路" },
        { x: 165, y: 140, w: 175, h: 90, kind: "zone", label: "JR線 改札内", hl: true },
        { x: 355, y: 90, w: 40, h: 60, kind: "zone", label: "丸ノ内線" },
      ],
      items: [
        { x: 55, y: 205, icon: "🛗", label: "京王ホームEV" },
        { x: 255, y: 155, icon: "🛗", label: "11・12番線EV" },
        { x: 300, y: 200, icon: "🚻", label: "多機能トイレ" },
        { x: 70, y: 115, icon: "🏬", label: "京王百貨店" },
        { x: 180, y: 80, icon: "🎫", label: "きっぷうりば" },
      ],
      gates: [
        { x: 120, y: 165, w: 30, label: "京王百貨店口改札" },
        { x: 195, y: 140, w: 36, label: "JR中央西口改札" },
        { x: 330, y: 140, w: 30, label: "中央東口改札" },
      ],
    },
    {
      short: "B2F", label: "B2F 京王線ホーム", h: 200, compass: "←調布・府中方面 ・ 東→",
      areas: [
        { x: 40, y: 50, w: 200, h: 24, kind: "platform", label: "京王線 1・2番線" },
        { x: 40, y: 100, w: 200, h: 24, kind: "platform", label: "京王線 3番線(降車)", hl: true },
        { x: 250, y: 40, w: 60, h: 110, kind: "zone", label: "改札階への階段・EV" },
      ],
      items: [
        { x: 265, y: 112, icon: "🛗", label: "ホームEV(先頭側)" },
      ],
      gates: [],
    },
  ],
  routes: [
    {
      from: "京王", to: "JR中央",
      label: "京王線 → JR中央線(11・12番線)",
      carFrom: "先頭寄り車両で降車",
      carTo: "EV最寄り車両に乗車",
      path: [
        { f: 2, pts: [[220, 112], [258, 112]] },
        { f: 1, pts: [[60, 200], [90, 178], [120, 168], [160, 150], [193, 143], [230, 150], [252, 152]] },
        { f: 0, pts: [[222, 68], [221, 100]] },
      ],
    },
  ],
};

// ================= 東京 =================
data.stations["東京"].mapDetail = {
  floors: [
    {
      short: "1F", label: "1F 在来線ホーム・丸の内/八重洲", h: 260, compass: "←丸の内(西) ・ 八重洲(東)→ / 上=北",
      areas: [
        { x: 120, y: 30, w: 20, h: 170, kind: "platform", label: "1・2番線 中央線", hl: true },
        { x: 150, y: 30, w: 20, h: 170, kind: "platform", label: "3〜6番線 山手・京浜東北" },
        { x: 180, y: 30, w: 20, h: 170, kind: "platform", label: "7・8番線" },
        { x: 210, y: 30, w: 20, h: 170, kind: "platform", label: "9・10番線 東海道線" },
        { x: 260, y: 30, w: 90, h: 170, kind: "zone", label: "新幹線のりば" },
        { x: 60, y: 205, w: 300, h: 30, kind: "corridor", label: "中央通路" },
      ],
      items: [
        { x: 130, y: 60, icon: "🛗", label: "中央線ホームEV" },
        { x: 190, y: 60, icon: "🛗" },
        { x: 240, y: 220, icon: "🚻" },
      ],
      gates: [
        { x: 75, y: 220, w: 34, label: "丸の内中央口" },
        { x: 350, y: 220, w: 34, label: "八重洲中央口" },
      ],
    },
    {
      short: "B1F", label: "B1F 地下コンコース・グランスタ", h: 260, compass: "←丸の内(西) ・ 八重洲(東)→",
      areas: [
        { x: 40, y: 60, w: 130, h: 80, kind: "zone", label: "丸の内地下コンコース" },
        { x: 180, y: 60, w: 180, h: 80, kind: "zone", label: "グランスタ(改札内)", hl: true },
        { x: 180, y: 150, w: 45, h: 90, kind: "corridor", label: "京葉線連絡通路(動く歩道)" },
        { x: 40, y: 160, w: 90, h: 50, kind: "zone", label: "総武・横須賀線のりば(B5F)へ" },
      ],
      items: [
        { x: 250, y: 100, icon: "🚼", label: "ベビー休憩室" },
        { x: 320, y: 100, icon: "🚻", label: "多機能トイレ" },
        { x: 200, y: 225, icon: "🛗", label: "京葉線EV" },
        { x: 140, y: 100, icon: "🛗", label: "1・2番線EV" },
      ],
      gates: [{ x: 90, y: 145, w: 34, label: "丸の内地下中央口" }],
    },
    {
      short: "B4F", label: "B4F 京葉線ホーム", h: 180, compass: "←舞浜・蘇我方面",
      areas: [
        { x: 40, y: 60, w: 240, h: 24, kind: "platform", label: "京葉線 1・2番線", hl: true },
        { x: 40, y: 110, w: 240, h: 24, kind: "platform", label: "京葉線 3・4番線" },
        { x: 300, y: 50, w: 70, h: 90, kind: "zone", label: "コンコースへ" },
      ],
      items: [{ x: 315, y: 95, icon: "🛗", label: "ホームEV" }],
      gates: [],
    },
  ],
  routes: [
    {
      from: "中央", to: "京葉",
      label: "中央線 → 京葉線(ディズニー・舞浜方面)",
      carFrom: "EV最寄り車両で降車",
      carTo: "EV最寄り車両に乗車",
      path: [
        { f: 0, pts: [[132, 70], [131, 62]] },
        { f: 1, pts: [[142, 105], [180, 110], [230, 105], [255, 108], [202, 160], [201, 218]] },
        { f: 2, pts: [[312, 92], [260, 72]] },
      ],
    },
    {
      from: "JR", to: "総武",
      label: "在来線 → 総武・横須賀線",
      carFrom: "EV最寄り車両で降車",
      path: [
        { f: 0, pts: [[132, 70], [131, 62]] },
        { f: 1, pts: [[142, 105], [110, 140], [85, 180]] },
      ],
    },
  ],
};

fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log("mapDetail added: 新宿, 東京");
