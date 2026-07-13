// 駅の階構造をアイソメトリック(3D風)SVGで描画する
// facilities.json の floors / transferGuides から模式図を生成する。
"use strict";

const StationMap = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 幾何定数
  const W = 250;      // 床スラブの幅
  const SKEW = 26;    // 奥行きの斜め方向オフセット
  const DEPTH = 16;   // 床スラブの見かけの奥行き
  const THICK = 7;    // 床スラブの厚み
  const DY = 62;      // 階と階の間隔
  const OX = 66;      // 左余白(階ラベル用)
  const OY = 26;      // 上余白

  function floorY(i) { return OY + i * DY; }

  // 床スラブ(平行四辺形+厚み)
  function slab(i, label, id) {
    const y = floorY(i);
    const top = `M${OX + SKEW},${y} l${W},0 l${-SKEW},${DEPTH} l${-W},0 z`;
    const front = `M${OX},${y + DEPTH} l${W},0 l0,${THICK} l${-W},0 z`;
    const side = `M${OX + W},${y + DEPTH} l${SKEW},${-DEPTH} l0,${THICK} l${-SKEW},${DEPTH} z`;
    return `
      <path d="${top}" class="sm-floor-top"/>
      <path d="${front}" class="sm-floor-front"/>
      <path d="${side}" class="sm-floor-side"/>
      <text x="${OX - 8}" y="${y + DEPTH}" text-anchor="end" class="sm-floor-id">${esc(id)}</text>
      <text x="${OX - 8}" y="${y + DEPTH + 12}" text-anchor="end" class="sm-floor-label">${esc(label)}</text>`;
  }

  // エレベーターの縦シャフト
  function shaft(x, iFrom, iTo, order, name) {
    const yTop = floorY(Math.min(iFrom, iTo)) + DEPTH / 2;
    const yBot = floorY(Math.max(iFrom, iTo)) + DEPTH / 2;
    const w = 26, d = 9;
    const upward = iFrom > iTo; // 下の階から上の階へ
    const yArrowFrom = upward ? yBot - 6 : yTop + 20;
    const yArrowTo = upward ? yTop + 20 : yBot - 6;
    return `
      <path d="M${x},${yTop} l${w},0 l0,${yBot - yTop} l${-w},0 z" class="sm-shaft"/>
      <path d="M${x},${yTop} l${d},${-d} l${w},0 l${-d},${d} z" class="sm-shaft-top"/>
      <path d="M${x + w},${yTop} l${d},${-d} l0,${yBot - yTop} l${-d},${d} z" class="sm-shaft-side"/>
      <line x1="${x + w / 2}" y1="${yArrowFrom}" x2="${x + w / 2}" y2="${yArrowTo}" class="sm-ev-arrow" marker-end="url(#smArrow)"/>
      <text x="${x + w / 2}" y="${(yTop + yBot) / 2 + 4}" text-anchor="middle" class="sm-ev-label">EV</text>
      <circle cx="${x - 2}" cy="${yTop - 2}" r="9" class="sm-order"/>
      <text x="${x - 2}" y="${yTop + 1.5}" text-anchor="middle" class="sm-order-num">${order}</text>
      ${name ? `<text x="${x + w / 2}" y="${yBot + 16}" text-anchor="middle" class="sm-ev-name">${esc(name)}</text>` : ""}`;
  }

  // ホーム上の列車と乗車位置バッジ
  function train(iFloor, carText) {
    const y = floorY(iFloor) - 3;
    const tx = OX + SKEW + 26, tw = 150, th = 12, cars = 5;
    let pos = 0.5;
    if (/前/.test(carText)) pos = 0.15;
    else if (/後/.test(carText)) pos = 0.85;
    const bx = tx + tw * pos;
    const cells = Array.from({ length: cars }, (_, i) =>
      `<rect x="${tx + (tw / cars) * i + 1}" y="${y - th}" width="${tw / cars - 2}" height="${th}" rx="2" class="sm-car"/>`).join("");
    return `
      ${cells}
      <circle cx="${bx}" cy="${y - th - 12}" r="8" class="sm-baby"/>
      <text x="${bx}" y="${y - th - 8.5}" text-anchor="middle" class="sm-baby-icon">👶</text>
      <text x="${bx + 12}" y="${y - th - 9}" class="sm-car-text">${esc(carText)}</text>`;
  }

  // 階にあるトイレ(おむつ替え)マーカー
  function toilet(i, label) {
    const x = OX + W - 14, y = floorY(i) + DEPTH / 2 + 1;
    return `
      <circle cx="${x}" cy="${y - 4}" r="9" class="sm-toilet"/>
      <text x="${x}" y="${y - .5}" text-anchor="middle" class="sm-toilet-icon">🚻</text>
      ${label ? `<text x="${x + 12}" y="${y + 10}" text-anchor="end" class="sm-toilet-label">${esc(label)}</text>` : ""}`;
  }

  // guide(transferGuide)1件をSVGにする
  function render(fac, guide) {
    const floors = fac?.floors;
    if (!floors || !floors.length) return null;
    const idx = new Map(floors.map((f, i) => [f.id, i]));

    const parts = [];
    floors.forEach((f, i) => parts.push(slab(i, f.label, f.id)));
    floors.forEach((f, i) => { if (f.toilet) parts.push(toilet(i, f.toilet)); });

    let order = 0, x = OX + SKEW + 46, carDrawn = false, pendingCar = null;
    for (const st of guide?.steps || []) {
      if (st.type === "car") { pendingCar = st.car || ""; continue; }
      if (st.type === "elevator") {
        order++;
        const a = idx.get(st.fromFloor), b = idx.get(st.toFloor);
        if (a == null || b == null) continue;
        if (pendingCar != null && !carDrawn) {
          parts.push(train(a, pendingCar));
          carDrawn = true;
        }
        parts.push(shaft(x, a, b, order, st.name));
        x += 66;
        if (x > OX + W - 20) x = OX + SKEW + 46;
      }
    }
    if (pendingCar != null && !carDrawn && floors.length) {
      parts.push(train(floors.length - 1, pendingCar));
    }

    const h = floorY(floors.length - 1) + DEPTH + THICK + 34;
    return `<svg viewBox="0 0 ${OX + W + SKEW + 14} ${h}" xmlns="http://www.w3.org/2000/svg" class="sm-svg" role="img" aria-label="駅の階構造図">
      <defs>
        <marker id="smArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" class="sm-arrowhead"/>
        </marker>
      </defs>
      ${parts.join("\n")}
    </svg>`;
  }

  return { render };
})();
