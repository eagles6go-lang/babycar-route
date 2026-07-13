// 駅の階構造をアイソメトリック(3D風)SVGで描画する
// facilities.json の floors / transferGuides から模式図を生成する。
"use strict";

const StationMap = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 幾何定数
  const W = 264;      // 床スラブの幅
  const SKEW = 24;    // 奥行きの斜め方向オフセット
  const DEPTH = 15;   // 床スラブの見かけの奥行き
  const THICK = 7;    // 床スラブの厚み
  const DY = 64;      // 階と階の間隔
  const OX = 42;      // 左余白(階数表示用)
  const OY = 30;      // 上余白
  const VBW = OX + W + SKEW + 10;

  function floorY(i) { return OY + i * DY; }

  // 床スラブ(平行四辺形+厚み)。ラベルはスラブの手前側に載せる
  function slab(i, label, id) {
    const y = floorY(i);
    const top = `M${OX + SKEW},${y} l${W},0 l${-SKEW},${DEPTH} l${-W},0 z`;
    const front = `M${OX},${y + DEPTH} l${W},0 l0,${THICK} l${-W},0 z`;
    const side = `M${OX + W},${y + DEPTH} l${SKEW},${-DEPTH} l0,${THICK} l${-SKEW},${DEPTH} z`;
    return `
      <path d="${top}" class="sm-floor-top"/>
      <path d="${front}" class="sm-floor-front"/>
      <path d="${side}" class="sm-floor-side"/>
      <text x="${OX - 6}" y="${y + DEPTH + 2}" text-anchor="end" class="sm-floor-id">${esc(id)}</text>
      <text x="${OX + 4}" y="${y + DEPTH + THICK + 11}" class="sm-floor-label">${esc(label)}</text>`;
  }

  // エレベーターの縦シャフト。x は中央線の位置
  function shaft(cx, iFrom, iTo, order, name) {
    const w = 24, d = 8;
    const x = cx - w / 2;
    const yTop = floorY(Math.min(iFrom, iTo)) + DEPTH / 2;
    const yBot = floorY(Math.max(iFrom, iTo)) + DEPTH / 2;
    const upward = iFrom > iTo;
    const yArrowFrom = upward ? yBot - 6 : yTop + 20;
    const yArrowTo = upward ? yTop + 20 : yBot - 6;
    return `
      <path d="M${x},${yTop} l${w},0 l0,${yBot - yTop} l${-w},0 z" class="sm-shaft"/>
      <path d="M${x},${yTop} l${d},${-d} l${w},0 l${-d},${d} z" class="sm-shaft-top"/>
      <path d="M${x + w},${yTop} l${d},${-d} l0,${yBot - yTop} l${-d},${d} z" class="sm-shaft-side"/>
      <line x1="${cx}" y1="${yArrowFrom}" x2="${cx}" y2="${yArrowTo}" class="sm-ev-arrow" marker-end="url(#smArrow)"/>
      <text x="${cx}" y="${(yTop + yBot) / 2 + 4}" text-anchor="middle" class="sm-ev-label">EV</text>
      <circle cx="${x - 1}" cy="${yTop - 3}" r="9" class="sm-order"/>
      <text x="${x - 1}" y="${yTop + .5}" text-anchor="middle" class="sm-order-num">${order}</text>
      ${name ? `<text x="${cx}" y="${yBot + 15}" text-anchor="middle" class="sm-ev-name">${esc(name)}</text>` : ""}`;
  }

  // 号車番号つき列車。ホーム階のスラブ上に描く
  const TRAIN_X = OX + SKEW + 8;
  const TRAIN_W = W - 60;
  function carCenterX(car, cars) {
    return TRAIN_X + (TRAIN_W / cars) * (car - 0.5);
  }
  function train(iFloor, cars, recCar, carText) {
    const y = floorY(iFloor) + 1;
    const th = 13;
    const cw = TRAIN_W / cars;
    let cells = "";
    for (let i = 1; i <= cars; i++) {
      const cx = TRAIN_X + cw * (i - 1);
      const rec = recCar === i;
      cells += `<rect x="${cx + .8}" y="${y - th}" width="${cw - 1.6}" height="${th}" rx="2" class="sm-car${rec ? " sm-car-rec" : ""}"/>
        <text x="${cx + cw / 2}" y="${y - th / 2 + 2.5}" text-anchor="middle" class="sm-car-num${rec ? " sm-car-num-rec" : ""}">${i}</text>`;
    }
    let badge = "";
    if (recCar) {
      const bx = carCenterX(recCar, cars);
      badge = `<circle cx="${bx}" cy="${y - th - 11}" r="8" class="sm-baby"/>
        <text x="${bx}" y="${y - th - 7.5}" text-anchor="middle" class="sm-baby-icon">👶</text>
        <text x="${Math.min(bx + 11, OX + W - 4)}" y="${y - th - 8}" class="sm-car-text">${esc(carText || recCar + "号車")}</text>`;
    } else if (carText) {
      let pos = 0.5;
      if (/前/.test(carText)) pos = 0.15;
      else if (/後/.test(carText)) pos = 0.85;
      const bx = TRAIN_X + TRAIN_W * pos;
      badge = `<circle cx="${bx}" cy="${y - th - 11}" r="8" class="sm-baby"/>
        <text x="${bx}" y="${y - th - 7.5}" text-anchor="middle" class="sm-baby-icon">👶</text>
        <text x="${bx + 11}" y="${y - th - 8}" class="sm-car-text">${esc(carText)}</text>`;
    }
    return cells + badge;
  }

  // 階にあるトイレ(おむつ替え)マーカー。最後に描いて隠れないようにする
  function toilet(i, label) {
    const x = OX + W + SKEW - 12, y = floorY(i) + 3;
    return `
      <circle cx="${x}" cy="${y}" r="9" class="sm-toilet"/>
      <text x="${x}" y="${y + 3.5}" text-anchor="middle" class="sm-toilet-icon">🚻</text>
      ${label ? `<text x="${x + 8}" y="${y + 16}" text-anchor="end" class="sm-toilet-label">${esc(label)}</text>` : ""}`;
  }

  // guide(transferGuide)1件をSVGにする
  function render(fac, guide) {
    const floors = fac?.floors;
    if (!floors || !floors.length) return null;
    const idx = new Map(floors.map((f, i) => [f.id, i]));

    const parts = [];
    floors.forEach((f, i) => parts.push(slab(i, f.label, f.id)));

    // carステップの情報(何号車か)を拾う
    let carStep = null;
    for (const st of guide?.steps || []) {
      if (st.type === "car") { carStep = st; break; }
    }
    const cars = carStep?.cars || guide?.cars || 10;
    const recCar = Number.isFinite(carStep?.carNo) ? carStep.carNo : null;

    let order = 0, fallbackX = OX + SKEW + 52, trainFloor = null, firstShaftUnaligned = false;
    const shafts = [];
    for (const st of guide?.steps || []) {
      if (st.type !== "elevator") continue;
      order++;
      const a = idx.get(st.fromFloor), b = idx.get(st.toFloor);
      if (a == null || b == null) continue;
      if (trainFloor == null) trainFloor = Math.max(a, b) === a ? a : a; // 最初のEVの乗り場側
      let cx;
      if (order === 1 && Number.isFinite(st.atCar)) {
        cx = carCenterX(st.atCar, cars);
      } else if (order === 1 && recCar) {
        cx = carCenterX(recCar, cars);
      } else {
        if (order === 1) firstShaftUnaligned = true;
        cx = fallbackX;
      }
      shafts.push(shaft(cx, a, b, order, st.name));
      fallbackX += 68;
      if (fallbackX > OX + W - 24) fallbackX = OX + SKEW + 52;
    }

    // 最初のEVの乗り場階に号車つき列車を描く(号車が分からない駅もその旨を明示)
    if (trainFloor != null) {
      parts.push(train(trainFloor, cars, recCar, carStep?.car));
      if (firstShaftUnaligned) {
        parts.push(`<text x="${OX + SKEW + 4}" y="${floorY(trainFloor) - 20}" class="sm-note">※EV前の号車は未確認(メモ募集)</text>`);
      }
    }
    parts.push(...shafts);
    floors.forEach((f, i) => { if (f.toilet) parts.push(toilet(i, f.toilet)); });

    const h = floorY(floors.length - 1) + DEPTH + THICK + 30;
    return `<svg viewBox="0 0 ${VBW} ${h}" xmlns="http://www.w3.org/2000/svg" class="sm-svg" role="img" aria-label="駅の階構造図">
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
