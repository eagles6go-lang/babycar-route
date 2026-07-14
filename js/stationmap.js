// 駅の階構造をアイソメトリック(3D風)SVGで描画する
// facilities.json の floors / transferGuides から模式図を生成する。
// floors[].x / w (0-1) で水平位置・幅、level で同じ高さの別スラブを表現できる。
// EVステップの x で位置指定、徒歩は床の上の水平矢印として描く。
"use strict";

const StationMap = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // 幾何定数
  const W = 268;      // 描画領域の幅
  const SKEW = 22;    // 奥行きの斜めオフセット
  const DEPTH = 14;   // 床の見かけの奥行き
  const THICK = 7;    // 床の厚み
  const DY = 66;      // 階(行)の間隔
  const OX = 42;      // 左余白
  const OY = 30;      // 上余白
  const VBW = OX + W + SKEW + 10;

  const rowY = (r) => OY + r * DY;
  const px = (rel) => OX + SKEW + rel * (W - SKEW);

  // 床スラブ(平行四辺形+厚み)
  function slab(r, f, showLevel) {
    const y = rowY(r);
    const x0 = px(f.x ?? 0), w = (f.w ?? 1) * (W - SKEW);
    // 平行四辺形: 上辺(x0..x0+w, y) 下辺(x0-SKEW..x0+w-SKEW, y+DEPTH)
    const topPath = `M${x0},${y} l${w},0 l${-SKEW},${DEPTH} l${-w},0 z`;
    const front = `M${x0 - SKEW},${y + DEPTH} l${w},0 l0,${THICK} l${-w},0 z`;
    const side = `M${x0 - SKEW + w},${y + DEPTH} l${SKEW},${-DEPTH} l0,${THICK} l${-SKEW},${DEPTH} z`;
    return `
      <path d="${topPath}" class="sm-floor-top"/>
      <path d="${front}" class="sm-floor-front"/>
      <path d="${side}" class="sm-floor-side"/>
      ${showLevel ? `<text x="${OX - 6}" y="${y + DEPTH + 2}" text-anchor="end" class="sm-floor-id">${esc(f.level || f.id)}</text>` : ""}
      <text x="${x0 - SKEW + 4}" y="${y + DEPTH + THICK + 11}" class="sm-floor-label">${esc(f.label)}</text>`;
  }

  // エレベーターの縦シャフト
  function shaft(cx, rFrom, rTo, order, name) {
    const w = 24, d = 8;
    const x = cx - w / 2;
    const yTop = rowY(Math.min(rFrom, rTo)) + DEPTH / 2;
    const yBot = rowY(Math.max(rFrom, rTo)) + DEPTH / 2;
    const upward = rFrom > rTo;
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

  // 床面上の点(x: 0-1 横位置, d: 0-1 奥行き位置)をアイソメ座標へ
  function isoPt(r, xRel, d = 0.5) {
    return { x: px(xRel) - SKEW * d, y: rowY(r) + DEPTH * d };
  }

  // 床の上の徒歩移動(Situm風のドット経路)。pathPts で曲がり角も表現できる
  function walkDots(r, x1, x2, pathPts) {
    const pts = [];
    const y = rowY(r) + DEPTH / 2 + 1;
    pts.push({ x: x1, y });
    if (pathPts) for (const p of pathPts) pts.push(isoPt(r, p.x, p.d ?? 0.5));
    pts.push({ x: x2, y });
    if (!pathPts && Math.abs(x2 - x1) < 14) return "";
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const mid = pts[Math.floor(pts.length / 2)];
    return `
      <path d="${d}" class="sm-walk" marker-end="url(#smWalkArrow)"/>
      <text x="${mid.x}" y="${mid.y - 6}" text-anchor="middle" class="sm-walk-label">🚶</text>`;
  }

  // 床の上のマーカー(汎用)
  function markIcon(r, m) {
    const p = isoPt(r, m.x, m.d ?? 0.35);
    return `
      <circle cx="${p.x}" cy="${p.y}" r="3.2" class="sm-mark"/>
      <text x="${p.x}" y="${p.y - 5}" text-anchor="middle" class="sm-mark-label">${esc(m.label || "")}</text>`;
  }

  // 改札ゲートのマーカー
  function gateIcon(r, gx, d, name) {
    const p = { x: gx - SKEW * (d ?? 0.45), y: rowY(r) + DEPTH * (d ?? 0.45) };
    return `
      <rect x="${p.x - 4.5}" y="${p.y - 6}" width="9" height="10" rx="2" class="sm-gate"/>
      <text x="${p.x}" y="${p.y + 1.5}" text-anchor="middle" class="sm-gate-icon">🚪</text>
      <text x="${p.x}" y="${p.y - 9}" text-anchor="middle" class="sm-gate-label">${esc(name || "改札")}</text>`;
  }

  // 号車番号つき列車(ホームのスラブ内に描く)
  function train(r, f, cars, recCar, carText) {
    const y = rowY(r) + 1;
    const th = 12;
    const x0 = px(f.x ?? 0) - SKEW + 6;
    const tw = Math.max(80, (f.w ?? 1) * (W - SKEW) - 34);
    const cw = tw / cars;
    let cells = "";
    for (let i = 1; i <= cars; i++) {
      const cx = x0 + cw * (i - 1);
      const rec = recCar === i;
      cells += `<rect x="${cx + .8}" y="${y - th}" width="${cw - 1.6}" height="${th}" rx="2" class="sm-car${rec ? " sm-car-rec" : ""}"/>
        <text x="${cx + cw / 2}" y="${y - th / 2 + 2.5}" text-anchor="middle" class="sm-car-num${rec ? " sm-car-num-rec" : ""}">${i}</text>`;
    }
    let badge = "";
    const carCx = (i) => x0 + cw * (i - 0.5);
    if (recCar) {
      badge = babyBadge(carCx(recCar), y - th, carText || recCar + "号車");
    } else if (carText) {
      let pos = 0.5;
      if (/前/.test(carText)) pos = 0.15;
      else if (/後/.test(carText)) pos = 0.85;
      badge = babyBadge(x0 + tw * pos, y - th, carText);
    }
    return { svg: cells + badge, carX: recCar ? carCx(recCar) : x0 + tw * 0.5 };
  }
  function babyBadge(bx, yTop, text) {
    return `<circle cx="${bx}" cy="${yTop - 11}" r="8" class="sm-baby"/>
      <text x="${bx}" y="${yTop - 7.5}" text-anchor="middle" class="sm-baby-icon">👶</text>
      <text x="${Math.min(bx + 11, OX + W - 6)}" y="${yTop - 8}" class="sm-car-text">${esc(text)}</text>`;
  }

  // 階にあるトイレ(おむつ替え)マーカー
  function toilet(r, f, label) {
    const x0 = px(f.x ?? 0), w = (f.w ?? 1) * (W - SKEW);
    const x = x0 + w - 12, y = rowY(r) + 3;
    return `
      <circle cx="${x}" cy="${y}" r="9" class="sm-toilet"/>
      <text x="${x}" y="${y + 3.5}" text-anchor="middle" class="sm-toilet-icon">🚻</text>
      ${label ? `<text x="${x + 8}" y="${y + 16}" text-anchor="end" class="sm-toilet-label">${esc(label)}</text>` : ""}`;
  }

  function render(fac, guide) {
    const floors = fac?.floors;
    if (!floors || !floors.length) return null;

    // 同じlevelが連続するフロアは同じ行(高さ)に並べる
    const rowOf = new Map(), floorOf = new Map();
    let row = -1, prevLevel = null;
    for (const f of floors) {
      const level = f.level || f.id;
      if (level !== prevLevel) { row++; prevLevel = level; }
      rowOf.set(f.id, row);
      floorOf.set(f.id, f);
    }
    const rowCount = row + 1;

    const parts = [];
    {
      let seen = new Set();
      for (const f of floors) {
        const r = rowOf.get(f.id);
        const level = f.level || f.id;
        parts.push(slab(r, f, !seen.has(r)));
        seen.add(r);
      }
    }

    // carステップ: 最初のEVより前=乗車側、最後のEVより後=乗り継ぎ先(到着側)
    let carStep = null, destCar = null, sawElevator = false;
    for (const st of guide?.steps || []) {
      if (st.type === "elevator") sawElevator = true;
      if (st.type === "car") {
        if (!sawElevator && !carStep) carStep = st;
        else if (sawElevator) destCar = st;
      }
    }
    const cars = carStep?.cars || guide?.cars || 10;
    const recCar = Number.isFinite(carStep?.carNo) ? carStep.carNo : null;

    // ステップを順に追い、現在位置(x, 行)を更新しながら経路を描く
    let order = 0, fallbackX = px(0.25), curX = null, curRow = null;
    let trainDrawn = false, firstUnaligned = false, lastToFloor = null;
    let pendingWalk = null; // 直前のwalkステップ
    const later = [];

    for (const st of guide?.steps || []) {
      if (st.type === "walk") { pendingWalk = st; continue; }
      if (st.type === "gate") {
        if (curRow == null) continue;
        const gx = Number.isFinite(st.x) ? px(st.x) : (curX ?? px(0.4));
        parts.push(walkDots(curRow, curX, gx, pendingWalk?.path));
        pendingWalk = null;
        later.push(gateIcon(curRow, gx, st.d, st.name));
        curX = gx;
        continue;
      }
      if (st.type !== "elevator") continue;
      order++;
      const a = rowOf.get(st.fromFloor), b = rowOf.get(st.toFloor);
      if (a == null || b == null) continue;

      // 乗車ホームに列車を描く(最初のEVの乗り場)
      if (!trainDrawn) {
        const pf = floorOf.get(st.fromFloor);
        const t = train(a, pf, cars, recCar, carStep?.car);
        parts.push(t.svg);
        if (carStep && !Number.isFinite(st.atCar) && !recCar) firstUnaligned = true;
        if (!carStep) firstUnaligned = true;
        curX = t.carX;
        curRow = a;
        trainDrawn = true;
        if (firstUnaligned) {
          later.push(`<text x="${px(0.02)}" y="${rowY(a) - 22}" class="sm-note">※EV前の号車は未確認(メモ募集)</text>`);
        }
      }

      // EVの水平位置: 指定x > 号車位置 > フォールバック
      let evX;
      if (Number.isFinite(st.x)) evX = px(st.x);
      else if (order === 1 && Number.isFinite(st.atCar)) evX = curX;
      else { evX = fallbackX; fallbackX += 56; if (fallbackX > px(0.92)) fallbackX = px(0.2); }

      // 降りた後(または乗車前)の水平移動をドット経路で描く
      if (curX != null && curRow != null) {
        parts.push(walkDots(curRow, curX, evX, pendingWalk?.path));
      }
      pendingWalk = null;
      later.push(shaft(evX, a, b, order, st.name));
      curX = evX;
      curRow = b;
      lastToFloor = st.toFloor;
    }
    // 最後のEVの後に徒歩が残っている場合、目的方向へドット経路
    if (pendingWalk && curX != null && curRow != null) {
      const endX = curX < px(0.5) ? px(0.85) : px(0.12);
      parts.push(walkDots(curRow, curX, endX, pendingWalk.path));
      curX = endX;
    }
    // 乗り継ぎ先ホームの列車(EVを降りた位置に近い号車に👶)
    if (destCar && lastToFloor != null && curRow != null && curX != null) {
      const df = floorOf.get(lastToFloor);
      const carsD = destCar.cars || 10;
      const x0 = px(df.x ?? 0) - SKEW + 6;
      const tw = Math.max(80, (df.w ?? 1) * (W - SKEW) - 34);
      const idx = Math.min(carsD, Math.max(1, Math.round((curX - x0) / (tw / carsD) + 0.5)));
      const t = train(curRow, df, carsD, idx, destCar.car || "EV最寄り車両");
      parts.push(t.svg);
    }
    parts.push(...later);

    // 床上マーカー(改札など)
    for (const f of floors) {
      for (const m of f.marks || []) parts.push(markIcon(rowOf.get(f.id), m));
    }

    // トイレは最前面
    for (const f of floors) {
      if (f.toilet) parts.push(toilet(rowOf.get(f.id), f, f.toilet));
    }

    const h = rowY(rowCount - 1) + DEPTH + THICK + 30;
    return `<svg viewBox="0 0 ${VBW} ${h}" xmlns="http://www.w3.org/2000/svg" class="sm-svg" role="img" aria-label="駅の階構造と乗換経路図">
      <defs>
        <marker id="smArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" class="sm-arrowhead"/>
        </marker>
        <marker id="smWalkArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" class="sm-walk-arrowhead"/>
        </marker>
      </defs>
      ${parts.join("\n")}
    </svg>`;
  }

  return { render };
})();
