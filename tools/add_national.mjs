// 全国主要駅・空港の施設シードデータを facilities.json に追加する(一回きり)
import fs from "node:fs";
const path = new URL("../data/facilities.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(path, "utf8"));

const fac = (pref, o) => ({
  verified: false,
  pref,
  elevator: { available: true, note: o.ev },
  babyToilet: { available: true, cleanliness: o.clean ?? 4, location: o.baby },
  carRecommend: [],
  ...(o.caution ? { caution: o.caution } : {}),
  ...(o.floors ? { floors: o.floors } : {}),
  ...(o.guides ? { transferGuides: o.guides } : {}),
});

const airport = (pref, name, extra = "") => fac(pref, {
  ev: "空港直結駅。エレベーター完備でベビーカー動線良好。" + extra,
  baby: "各ターミナルにベビールーム(授乳室・おむつ替え)完備。空港は設備が充実してきれい。",
  clean: 5,
});

const add = {
  "大阪": fac(27, {
    ev: "JR各ホームにエレベーターあり。梅田エリアの地下街は広大なので案内表示に注意。",
    baby: "ルクア・大丸梅田・グランフロント等直結ビルのベビールームが充実。",
    caution: "梅田エリアは地下街が広大で迷いやすい。乗換は時間に余裕を。",
    floors: [
      { id: "2F", label: "JRホーム(高架)" },
      { id: "1F", label: "改札・コンコース", toilet: "ルクア/大丸梅田 ベビールーム" },
      { id: "B1F", label: "地下街・梅田各駅連絡" },
      { id: "B2F", label: "御堂筋線 梅田ホーム" },
    ],
    guides: [
      { from: "JR各線", to: "御堂筋線(梅田)", steps: [
        { type: "elevator", fromFloor: "2F", toFloor: "1F", name: "ホームEV" },
        { type: "walk", note: "御堂筋口から地下街へ、御堂筋線梅田駅方面" },
        { type: "elevator", fromFloor: "1F", toFloor: "B2F", name: "御堂筋線EV" },
      ]},
    ],
  }),
  "新大阪": fac(27, {
    ev: "新幹線・在来線・御堂筋線ともエレベーターあり。乗換動線は比較的分かりやすい。",
    baby: "新幹線改札内・エキマルシェ新大阪にベビールームあり。",
    floors: [
      { id: "3F", label: "新幹線ホーム" },
      { id: "2F", label: "コンコース・改札", toilet: "新幹線改札内 ベビールーム" },
      { id: "1F", label: "在来線ホーム・御堂筋線連絡" },
    ],
    guides: [
      { from: "新幹線", to: "在来線・御堂筋線", steps: [
        { type: "elevator", fromFloor: "3F", toFloor: "2F", name: "新幹線ホームEV" },
        { type: "walk", note: "コンコースを在来線/御堂筋線改札へ" },
        { type: "elevator", fromFloor: "2F", toFloor: "1F", name: "在来線EV" },
      ]},
    ],
  }),
  "名古屋": fac(23, {
    ev: "JR・新幹線・地下鉄ともエレベーターあり。名鉄・近鉄へは一度地上/地下街経由。",
    baby: "JRセントラルタワーズ・ゲートタワーのベビールームが充実。",
    caution: "駅周辺が広大。名鉄/近鉄乗換は徒歩移動あり。",
    floors: [
      { id: "1F", label: "JR・新幹線ホーム/コンコース", toilet: "ゲートタワー/タワーズ ベビールーム" },
      { id: "B1F", label: "地下街・東山線ホーム" },
      { id: "B3F", label: "桜通線ホーム" },
    ],
    guides: [
      { from: "JR・新幹線", to: "東山線", steps: [
        { type: "walk", note: "中央コンコースから地下街方面へ" },
        { type: "elevator", fromFloor: "1F", toFloor: "B1F", name: "東山線EV" },
      ]},
    ],
  }),
  "京都": fac(26, {
    ev: "新幹線・在来線・地下鉄烏丸線ともエレベーターあり。",
    baby: "駅ビル(ジェイアール京都伊勢丹等)・新幹線改札内にベビールームあり。",
    floors: [
      { id: "2F", label: "新幹線ホーム" },
      { id: "1F", label: "在来線ホーム・中央口", toilet: "駅ビル ベビールーム" },
      { id: "B2F", label: "地下鉄烏丸線ホーム" },
    ],
    guides: [
      { from: "新幹線・在来線", to: "烏丸線", steps: [
        { type: "elevator", fromFloor: "2F", toFloor: "1F", name: "新幹線ホームEV" },
        { type: "walk", note: "中央口から地下鉄入口へ" },
        { type: "elevator", fromFloor: "1F", toFloor: "B2F", name: "烏丸線EV" },
      ]},
    ],
  }),
  "札幌": fac(1, {
    ev: "JRホームにエレベーターあり。地下鉄さっぽろ駅へは地下歩行空間経由。",
    baby: "JRタワー・ステラプレイス・大丸札幌のベビールームが充実。",
    floors: [
      { id: "2F", label: "JRホーム(高架)" },
      { id: "1F", label: "改札・コンコース", toilet: "ステラプレイス/大丸 ベビールーム" },
      { id: "B1F", label: "地下歩行空間" },
      { id: "B2F", label: "南北線さっぽろホーム" },
    ],
    guides: [
      { from: "JR各線", to: "地下鉄南北線(さっぽろ)", steps: [
        { type: "elevator", fromFloor: "2F", toFloor: "1F", name: "ホームEV" },
        { type: "walk", note: "地下歩行空間をさっぽろ駅方面へ" },
        { type: "elevator", fromFloor: "B1F", toFloor: "B2F", name: "南北線EV" },
      ]},
    ],
  }),
  "仙台": fac(4, {
    ev: "JR・地下鉄ともエレベーターあり。地下鉄仙台駅へは地下自由通路経由。",
    baby: "エスパル仙台のベビールームが充実。",
    floors: [
      { id: "3F", label: "新幹線ホーム" },
      { id: "2F", label: "中央改札・コンコース", toilet: "エスパル仙台 ベビールーム" },
      { id: "1F", label: "在来線ホーム" },
      { id: "B1F", label: "地下自由通路・地下鉄改札" },
    ],
    guides: [
      { from: "JR各線", to: "地下鉄南北線・東西線", steps: [
        { type: "elevator", fromFloor: "1F", toFloor: "2F", name: "在来線ホームEV" },
        { type: "elevator", fromFloor: "2F", toFloor: "B1F", name: "地下通路EV" },
        { type: "walk", note: "地下自由通路を地下鉄改札へ" },
      ]},
    ],
  }),
  "博多": fac(40, {
    ev: "新幹線・在来線・地下鉄空港線ともエレベーターあり。空港線で福岡空港へ2駅(約6分)。",
    baby: "アミュプラザ博多・博多阪急のベビールームが充実。",
    floors: [
      { id: "1F", label: "新幹線・在来線コンコース", toilet: "アミュプラザ/阪急 ベビールーム" },
      { id: "B1F", label: "博多口地下" },
      { id: "B2F", label: "地下鉄空港線ホーム" },
    ],
    guides: [
      { from: "新幹線・在来線", to: "地下鉄空港線(福岡空港へ)", steps: [
        { type: "walk", note: "博多口方面から地下鉄入口へ" },
        { type: "elevator", fromFloor: "1F", toFloor: "B2F", name: "空港線EV" },
      ]},
    ],
  }),
  "三ノ宮": fac(28, {
    ev: "JR・阪急・阪神・地下鉄・ポートライナーともエレベーターあり。",
    baby: "ミント神戸・さんちか等にベビー設備あり。",
  }),
  "広島": fac(34, {
    ev: "新幹線・在来線ともエレベーターあり。路面電車へは南口すぐ。",
    baby: "ekie(エキエ)のベビールームが充実。",
  }),
  "天神": fac(40, {
    ev: "地下鉄・西鉄ともエレベーターあり。地下街経由で移動可。",
    baby: "ソラリアプラザ・三越等にベビールームあり。",
  }),
  "羽田空港第１・第２ターミナル": airport(13, "京急線。ホームからターミナル直結EVあり。"),
  "羽田空港第３ターミナル": airport(13, "京急・モノレール。国際線ターミナル直結。"),
  "羽田空港第１ターミナル": airport(13, "東京モノレール。"),
  "羽田空港第２ターミナル": airport(13, "東京モノレール。"),
  "成田空港": airport(12, "JR・京成。第1ターミナル直結。"),
  "空港第２ビル": airport(12, "JR・京成。第2・第3ターミナル。"),
  "関西空港": airport(27, "JR・南海。ターミナル直結。"),
  "大阪空港": airport(27, "大阪モノレール。伊丹空港ターミナル直結。"),
  "中部国際空港": airport(23, "名鉄。セントレア直結。"),
  "新千歳空港": airport(1, "JR。ターミナル地下直結。"),
  "福岡空港": airport(40, "地下鉄空港線。国内線ターミナル直結、博多駅から2駅。"),
  "仙台空港": airport(4, "仙台空港アクセス線。ターミナル直結。"),
  "那覇空港": airport(47, "ゆいレール。ターミナル連絡通路直結。"),
};

let added = 0;
for (const [name, entry] of Object.entries(add)) {
  if (!data.stations[name]) { data.stations[name] = entry; added++; }
}
fs.writeFileSync(path, JSON.stringify(data, null, 2));
console.log(`added ${added}, total ${Object.keys(data.stations).length}`);
