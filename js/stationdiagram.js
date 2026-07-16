// 駅階層図レンダラー
// facilities.json の mapDetail(フロア×エリア×設備×推奨経路)から、
// 鉄道会社の構内図PDFに近い、フロア切替式の詳細マップを描く。
"use strict";

const StationDiagram = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const W = 400; // 論理座標系の幅(データはこの座標で記述)

  function areaRect(a) {
    const cls = a.kind === "platform" ? "sd-platform" : a.kind === "corridor" ? "sd-corridor" : "sd-zone";
    const hl = a.hl ? " sd-hl" : "";
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    const vertical = a.h > a.w * 1.4;
    const label = a.label ? `<text x="${cx}" y="${cy}" text-anchor="middle" class="sd-area-label"
      ${vertical ? `transform="rotate(90 ${cx} ${cy})"` : ""}>${esc(a.label)}</text>` : "";
    return `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="4" class="${cls}${hl}"/>` + label;
  }

  function gateMark(g) {
    const w = g.w || 26;
    return `<rect x="${g.x - w / 2}" y="${g.y - 4}" width="${w}" height="8" class="sd-gate"/>
      ${Array.from({ length: Math.max(2, Math.floor(w / 8)) }, (_, i) =>
        `<line x1="${g.x - w / 2 + 4 + i * 8}" y1="${g.y - 4}" x2="${g.x - w / 2 + 4 + i * 8}" y2="${g.y + 4}" class="sd-gate-slit"/>`).join("")}
      <text x="${g.x}" y="${g.y - 8}" text-anchor="middle" class="sd-gate-label">${esc(g.label || "改札")}</text>`;
  }

  function itemMark(it) {
    return `<circle cx="${it.x}" cy="${it.y}" r="9" class="sd-item ${it.icon === "🛗" ? "sd-item-ev" : ""}"/>
      <text x="${it.x}" y="${it.y + 3.5}" text-anchor="middle" class="sd-item-icon">${esc(it.icon || "📍")}</text>
      ${it.label ? `<text x="${it.x}" y="${it.y + 20}" text-anchor="middle" class="sd-item-label">${esc(it.label)}</text>` : ""}`;
  }

  // 経路のフロア内セグメント + フロア間バッジ
  function routeOverlay(route, floorIdx) {
    if (!route) return "";
    const segs = route.path.filter((p) => p.f === floorIdx);
    if (!segs.length) return "";
    let out = "";
    let badgeNo = 0;
    for (const p of route.path) {
      if (p.f > floorIdx) break;
      if (p.f === floorIdx) break;
      badgeNo++;
    }
    segs.forEach((seg) => {
      const d = seg.pts.map((q, i) => `${i ? "L" : "M"}${q[0]},${q[1]}`).join(" ");
      out += `<path d="${d}" class="sd-route" marker-end="url(#sdArrow)"/>`;
      const first = seg.pts[0], last = seg.pts[seg.pts.length - 1];
      const segIdx = route.path.indexOf(seg);
      // 開始点: 前のフロアから来た場合はEVバッジ
      if (segIdx === 0) {
        out += `<circle cx="${first[0]}" cy="${first[1]}" r="9" class="sd-pt-start"/>
          <text x="${first[0]}" y="${first[1] + 3.5}" text-anchor="middle" class="sd-pt-icon">👶</text>`;
        if (route.carFrom) out += `<text x="${first[0] + 12}" y="${first[1] - 8}" class="sd-route-note">${esc(route.carFrom)}</text>`;
      } else {
        out += `<circle cx="${first[0]}" cy="${first[1]}" r="8.5" class="sd-pt-ev"/>
          <text x="${first[0]}" y="${first[1] + 3}" text-anchor="middle" class="sd-pt-no">${segIdx}</text>`;
      }
      // 終了点: 次のフロアへ行く場合はEVバッジ+行先
      if (segIdx < route.path.length - 1) {
        const next = route.path[segIdx + 1];
        out += `<circle cx="${last[0]}" cy="${last[1]}" r="8.5" class="sd-pt-ev"/>
          <text x="${last[0]}" y="${last[1] + 3}" text-anchor="middle" class="sd-pt-no">${segIdx + 1}</text>
          <text x="${last[0]}" y="${last[1] + 20}" text-anchor="middle" class="sd-route-note">🛗 ${esc(next.floorLabel || "次の階")}へ</text>`;
      } else {
        out += `<circle cx="${last[0]}" cy="${last[1]}" r="9" class="sd-pt-goal"/>
          <text x="${last[0]}" y="${last[1] + 3.5}" text-anchor="middle" class="sd-pt-icon">🚃</text>`;
        if (route.carTo) out += `<text x="${last[0] + 12}" y="${last[1] - 8}" class="sd-route-note">${esc(route.carTo)}</text>`;
      }
    });
    return out;
  }

  function floorSvg(md, floorIdx, route) {
    const fl = md.floors[floorIdx];
    const H = fl.h || 240;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="sd-svg" role="img" aria-label="${esc(fl.label)}の構内図">
      <defs>
        <marker id="sdArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" class="sd-arrowhead"/>
        </marker>
      </defs>
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" class="sd-bg"/>
      ${(fl.areas || []).map(areaRect).join("")}
      ${(fl.gates || []).map(gateMark).join("")}
      ${(fl.items || []).map(itemMark).join("")}
      ${routeOverlay(route, floorIdx)}
      <text x="10" y="16" class="sd-floor-tag">${esc(fl.label)}</text>
      ${fl.compass ? `<text x="${W - 10}" y="16" text-anchor="end" class="sd-compass">${esc(fl.compass)}</text>` : ""}
    </svg>`;
  }

  // route.path の各セグメントに floorLabel を補完
  function prepRoute(md, route) {
    if (!route) return null;
    const r = { ...route, path: route.path.map((p) => ({ ...p, floorLabel: md.floors[p.f]?.label?.split("(")[0] || "" })) };
    return r;
  }

  // メイン: フロアタブ + 選択フロアのSVG。activeFloor省略時は経路の最初のフロア
  function render(md, route, activeFloor) {
    if (!md || !md.floors?.length) return null;
    const r = prepRoute(md, route);
    const start = activeFloor != null ? activeFloor : (r ? r.path[0].f : 0);
    const tabs = md.floors.map((fl, i) =>
      `<button type="button" class="sd-tab${i === start ? " on" : ""}" data-floor="${i}">${esc(fl.short || fl.label)}</button>`).join("");
    const routeFloors = r ? new Set(r.path.map((p) => p.f)) : new Set();
    const dots = md.floors.map((fl, i) => routeFloors.has(i) ? `<span class="sd-dot" data-floor="${i}"></span>` : "").join("");
    return `<div class="sd-wrap" data-active="${start}">
      <div class="sd-tabs">${tabs}${r ? `<span class="sd-route-legend">‥‥ おすすめ経路</span>` : ""}</div>
      <div class="sd-canvas">${floorSvg(md, start, r)}</div>
      ${r ? `<p class="hint sd-note">👶=乗車位置 / ①②=エレベーター(番号順に進む) / 🚃=乗り継ぎ先の乗車位置。フロアタブで階を切り替えられます。</p>` : ""}
    </div>`;
  }

  return { render, floorSvg, prepRoute };
})();
