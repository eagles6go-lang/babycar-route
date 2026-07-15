// ベビーカーナビ アプリ本体 (要件定義書 v0.3 準拠の再構築版)
// 画面: ①検索ホーム ②経路一覧 ③経路詳細(タブ) ④構内マップ ⑤乗車位置
//       ⑥設備 ⑦立寄り ⑧行程共有 ⑨案内モード ⑩マイページ
"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  let facilities = {};
  let trains = [];
  let ready = false;

  // ---------- ユーティリティ ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nrm = (name) => (typeof Router !== "undefined" ? Router.normName(name) : name);
  const PREF_NAMES = ["", "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島", "茨城", "栃木",
    "群馬", "埼玉", "千葉", "東京", "神奈川", "新潟", "富山", "石川", "福井", "山梨",
    "長野", "岐阜", "静岡", "愛知", "三重", "滋賀", "京都", "大阪", "兵庫", "奈良",
    "和歌山", "鳥取", "島根", "岡山", "広島", "山口", "徳島", "香川", "愛媛", "高知",
    "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄"];

  function facOf(name) {
    const exact = facilities[name];
    if (exact) return exact;
    const f = facilities[nrm(name)];
    if (!f) return undefined;
    const st = Router.stationByName(name);
    if (f.pref != null && st && st.p !== f.pref) return undefined;
    return f;
  }
  function trainInfo(lineName) {
    if (!lineName) return null;
    return trains.find((t) => lineName.includes(t.match)) || null;
  }

  // ---------- 口コミ ----------
  function loadReviews() {
    try { return JSON.parse(localStorage.getItem(Store.K.reviews)) || {}; } catch { return {}; }
  }
  function saveReviews(r) { localStorage.setItem(Store.K.reviews, JSON.stringify(r)); }
  function reviewsFor(name) { return loadReviews()[nrm(name)] || []; }

  function cleanlinessOf(name) {
    const seed = facOf(name)?.babyToilet?.cleanliness;
    const vals = reviewsFor(name).map((r) => r.tc).filter((v) => v >= 1);
    if (seed) vals.push(seed);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }
  function stars(v) {
    if (!v) return "";
    const full = Math.round(v);
    return "★".repeat(full) + "☆".repeat(5 - full);
  }

  // ---------- 対応レベル(要件4.3) ----------
  function stationLevel(name) {
    const f = facOf(name);
    if (!f) return 1;
    const hasGuide = f.transferGuides?.length && f.floors?.length;
    if (hasGuide && f.floors.some((fl) => fl.signs?.length || fl.marks?.length)) return 5;
    if (hasGuide) return 4;
    if (f.carRecommend?.length || (f.transferGuides || []).some((g) => g.steps.some((s) => s.type === "car"))) return 3;
    if (f.elevator || f.babyToilet) return 2;
    return 1;
  }
  const levelChip = (name) => {
    const lv = stationLevel(name);
    return `<span class="chip lv lv${lv}">情報Lv${lv}</span>`;
  };

  // ---------- 情報信頼度(要件11.9) ----------
  function reliabilityHtml(name) {
    const f = facOf(name);
    const rv = reviewsFor(name).length;
    const updated = f?.updated || null;
    return `<p class="hint">情報の確認状況: ${updated ? `最終確認 ${esc(updated)}` : "現地未確認(公式構内図ベースの参考情報)"} ・ 利用者メモ ${rv}件</p>`;
  }

  // ---------- データ読み込み ----------
  async function fetchJsonRetry(url, tries = 3) {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        if (i >= tries - 1) throw e;
        await new Promise((res) => setTimeout(res, 800 * (i + 1)));
      }
    }
  }

  async function boot() {
    try {
      const DATA_V = "16";
      const [network, walks, fac, tr] = await Promise.all([
        fetchJsonRetry(`data/network.json?v=${DATA_V}`),
        fetchJsonRetry(`data/walk_transfers.json?v=${DATA_V}`),
        fetchJsonRetry(`data/facilities.json?v=${DATA_V}`),
        fetchJsonRetry(`data/trains.json?v=${DATA_V}`),
      ]);
      facilities = fac.stations || {};
      trains = tr.lines || [];
      Router.init(network, walks, facilities, reviewsFor);
      ready = true;
      $("load-status").textContent = `関東 ${network.stations.length}駅 / ${network.lines.length}路線に対応`;
      renderShortcuts();
      applyUrlParams();
    } catch (e) {
      $("load-status").textContent = "データの読み込みに失敗しました: " + e.message;
    }
  }

  // ---------- 駅サジェスト ----------
  function setupSuggest(inputId, boxId) {
    const input = $(inputId), box = $(boxId);
    input.addEventListener("input", () => {
      if (!ready) return;
      const list = Router.suggest(input.value);
      if (!list.length || (list.length === 1 && list[0].n === input.value)) {
        box.classList.remove("open"); box.innerHTML = ""; return;
      }
      box.innerHTML = list.map((s) => {
        const lines = Router.linesOf(s).slice(0, 3).map((l) => l.n).join("・");
        const pref = PREF_NAMES[s.p] || "";
        return `<button type="button" data-name="${esc(s.n)}">${esc(s.n)} <span class="pref">${esc(pref)}</span><span class="sub">${esc(s.k)} | ${esc(lines)}</span></button>`;
      }).join("");
      box.classList.add("open");
    });
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-name]");
      if (!b) return;
      input.value = b.dataset.name;
      box.classList.remove("open"); box.innerHTML = "";
    });
    input.addEventListener("blur", () => setTimeout(() => box.classList.remove("open"), 200));
    // 8.4: 入力欄タップでよく使う駅・最近の駅を候補表示
    input.addEventListener("focus", () => {
      if (!ready || input.value.trim()) return;
      const freq = Store.frequentStations(6);
      if (!freq.length) return;
      box.innerHTML = `<div class="suggest-head">よく使う駅</div>` + freq.map((n) =>
        `<button type="button" data-name="${esc(n)}">${esc(n)}</button>`).join("");
      box.classList.add("open");
    });
  }

  function resolveName(input) {
    const q = (input || "").trim();
    if (!q) return null;
    if (Router.stationByName(q)) return q;
    const sug = Router.suggest(q, 1);
    return sug.length ? sug[0].n : null;
  }

  // ---------- 状況モード(要件9.1) ----------
  let activeModes = new Set();
  function modeEffects() {
    const p = Store.getProfile();
    let penaltyFactor = 1;
    if (p.policy === "ease") penaltyFactor *= 1.3;
    if (p.policy === "fewer") penaltyFactor *= 1.8;
    if (p.stroller === "twin" || p.stroller === "large") penaltyFactor *= 1.3;
    if (activeModes.has("sleeping")) penaltyFactor *= 1.8;
    if (activeModes.has("solo")) penaltyFactor *= 1.5;
    if (activeModes.has("luggage")) penaltyFactor *= 1.4;
    if (activeModes.has("crowd")) penaltyFactor *= 1.2;
    return { penaltyFactor: Math.min(3, penaltyFactor), wantDiaper: activeModes.has("diaper") };
  }

  // ---------- 検索 ----------
  let lastResult = null;

  function doSearch(auto = false) {
    if (!ready) return;
    const fromName = resolveName($("from-input").value);
    const toName = resolveName($("to-input").value);
    if (!fromName || !toName) {
      if (!auto) $("results").innerHTML = `<p class="empty-note">出発地・目的地を候補から選んでください。</p>`;
      return;
    }
    $("from-input").value = fromName;
    $("to-input").value = toName;
    let viaName = null;
    if ($("via-input").value.trim()) {
      viaName = resolveName($("via-input").value);
      if (viaName) $("via-input").value = viaName;
    }
    const useExpress = $("use-express").checked;
    localStorage.setItem(Store.K.useExpress, useExpress ? "1" : "");
    const eff = modeEffects();
    const { error, routes } = Router.search(fromName, toName,
      { useExpress, viaNames: viaName ? [viaName] : [], penaltyFactor: eff.penaltyFactor });
    if (error) {
      $("results").innerHTML = `<p class="empty-note">${esc(error)}</p>`;
      return;
    }
    Store.addHistory({ from: fromName, to: toName, via: viaName || "", modes: [...activeModes], express: useExpress });
    renderRoutes(fromName, toName, viaName, routes);
    renderShortcuts();
  }

  // ---------- ②経路一覧 ----------
  function sortRoutes(routes, mode) {
    const rs = [...routes];
    if (mode === "fast") rs.sort((a, b) => a.est - b.est);
    else if (mode === "cheap") rs.sort((a, b) => a.fare - b.fare);
    else if (mode === "easy") rs.sort((a, b) => b.ease - a.ease || a.est - b.est);
    return rs;
  }
  const scoreBadge = (ease) => {
    const cls = ease >= 80 ? "low" : ease >= 60 ? "mid" : "high";
    const label = ease >= 80 ? "低負担" : ease >= 60 ? "標準" : "やや高負担";
    return `<div class="score ${cls}"><span class="score-label">${label}</span><span class="score-num">${ease}<small>/100</small></span></div>`;
  };

  function renderRoutes(fromName, toName, viaName, routes, sortMode = "rec") {
    lastResult = { fromName, toName, viaName, routes };
    const el = $("results");
    if (!routes.length) {
      el.innerHTML = `<p class="empty-note">ルートが見つかりませんでした。</p>`;
      return;
    }
    const fastest = Math.min(...routes.map((r) => r.est));
    const cheapest = Math.min(...routes.map((r) => r.fare));
    const easiest = Math.max(...routes.map((r) => r.ease));
    const sorted = sortRoutes(routes, sortMode);
    const favKey = { from: fromName, to: toName, via: viaName || "" };
    const isFav = Store.isFavRoute(favKey);

    const cards = sorted.map((r, idx) => {
      const badges = [
        r.ease === easiest ? `<span class="best-badge">👶最ラク</span>` : "",
        r.est === fastest ? `<span class="best-badge">⚡最速</span>` : "",
        r.fare === cheapest ? `<span class="best-badge">💰最安</span>` : "",
      ].join("");
      const evUse = r.points.filter((p) => p.kind === "transfer" && Router.easeLevel(p.station.n) > 0).length;
      const lineSummary = r.legs.filter((l) => !l.isWalk).map((l) =>
        `<span class="line-pill" style="border-color:${esc(l.lineColor)}">${esc(nrm(l.lineName))}</span>`).join("<span class='line-arrow'>›</span>");
      const transferNames = r.points.filter((p) => p.kind === "transfer").map((p) => nrm(p.station.n));
      const carHint = r.legs.filter((l) => !l.isWalk).map((l) => carHints(l.stations[0].n, l.lineName)[0]).find(Boolean);
      const rt = routeTimes(r);
      return `<article class="route-card" data-ridx="${idx}">
        <div class="route-head">
          <span class="route-label">${esc(r.label)}</span>${badges}
          ${scoreBadge(r.ease)}
        </div>
        <div class="route-timerange">${fmtTime(rt.start)} <span class="tr-arrow">→</span> ${fmtTime(rt.end)}
          <span class="tr-dur">(${rt.total}分)</span><small class="hint-inline"> 今すぐ出発の目安</small></div>
        <div class="route-stats">
          <span class="route-meta">乗換${r.transfers}回</span>
          <span class="route-meta">🛗 EV情報あり ${evUse}/${Math.max(1, r.transfers)}駅</span>
          <span class="route-meta">約${r.fare.toLocaleString()}円<small>(概算)</small></span>
        </div>
        <div class="route-lines">${lineSummary}</div>
        ${transferNames.length ? `<div class="route-meta">乗換: ${transferNames.map((n) => esc(n)).join("・")}</div>` : ""}
        ${carHint ? `<div class="chip good">🚃 ${esc(carHint)}</div>` : ""}
        <div class="route-actions">
          <button type="button" class="primary-btn slim" data-detail="${idx}">この経路の詳細を見る</button>
        </div>
      </article>`;
    });

    const sortChip = (m, label) => `<button type="button" class="sort-chip${sortMode === m ? " on" : ""}" data-sort="${m}">${label}</button>`;
    el.innerHTML = `
      <div class="results-head">
        <h2 class="results-title">${esc(fromName)}${viaName ? ` →(${esc(viaName)})` : " "}→ ${esc(toName)}</h2>
        <button type="button" class="fav-btn${isFav ? " on" : ""}" id="btn-fav-route" aria-label="お気に入り">${isFav ? "♥" : "♡"}</button>
      </div>
      <p class="hint" style="margin:0 4px 8px;">ベビーカーにやさしい順に並んでいます(負担スコアは乗換回数・EV情報から算出)</p>
      <div class="sort-bar">${sortChip("rec", "おすすめ順")}${sortChip("easy", "負担が少ない順")}${sortChip("fast", "時間が早い順")}${sortChip("cheap", "安い順")}</div>
      ${cards.join("")}`;

    el.querySelectorAll(".sort-chip").forEach((b) =>
      b.addEventListener("click", () => renderRoutes(fromName, toName, viaName, routes, b.dataset.sort)));
    el.querySelectorAll("[data-detail]").forEach((b) =>
      b.addEventListener("click", () => openDetail(sorted[Number(b.dataset.detail)], fromName, toName, viaName)));
    $("btn-fav-route").addEventListener("click", () => {
      const on = Store.toggleFavRoute(favKey);
      $("btn-fav-route").textContent = on ? "♥" : "♡";
      $("btn-fav-route").classList.toggle("on", on);
    });
    if (sortMode === "rec") el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- 号車ヒント ----------
  function carHints(name, lineName) {
    const f = facOf(name);
    const hints = [];
    const matchLine = (l) => !lineName || !l || l.includes(lineName) || lineName.includes(l) ||
      nrm(l) === nrm(lineName || "");
    for (const r of f?.carRecommend || []) {
      if (matchLine(r.line)) hints.push(`${r.direction || ""} ${r.car || ""}${r.reason ? `(${r.reason})` : ""}`);
    }
    for (const g of f?.transferGuides || []) {
      for (const st of g.steps) {
        if (st.type === "car" && matchLine(st.line)) {
          hints.push(`${st.direction || ""} ${st.car || ""}${st.reason ? `(${st.reason})` : ""}`);
        }
      }
    }
    for (const rv of reviewsFor(name)) if (rv.car) hints.push(`💬 ${rv.car}`);
    return hints;
  }

  // ---------- 路線名トークン・ガイドマッチ ----------
  function lineTokens(lineName) {
    if (!lineName) return [];
    const n = nrm(lineName);
    const t = [];
    const m = n.match(/^(JR|東京メトロ|都営|東急|京王|小田急|京成|京急|西武|東武|相鉄|つくばエクスプレス|東京モノレール|多摩モノレール|ゆりかもめ|りんかい|横浜市営)/);
    if (m) t.push(m[1]);
    let core = n.replace(m ? m[1] : "", "").replace(/(本線|線|ライン|ライナー).*$/, "");
    if (core.length >= 2) t.push(core);
    return t;
  }
  function guideMatchScore(guide, arrive, depart) {
    const sc = (str, line) => lineTokens(line).filter((tok) => (str || "").includes(tok)).length;
    return sc(guide.from, arrive) + sc(guide.to, depart);
  }
  function bestGuideFor(name, arrive, depart) {
    const f = facOf(name);
    const gs = f?.transferGuides || [];
    if (!gs.length) return null;
    if (!arrive && !depart) return gs[0];
    let best = null, bestSc = 0;
    for (const g of gs) {
      const sc = guideMatchScore(g, arrive, depart);
      if (sc > bestSc) { bestSc = sc; best = g; }
    }
    return best || gs[0];
  }
  function guideStepsHtml(f, g) {
    let evNo = 0;
    return g.steps.map((st) => {
      if (st.type === "car") {
        return `<li><span class="step-no step-car">🚃</span><span><b>${esc(st.line || "")}</b> ${esc(st.direction || "")}は<b>${esc(st.car || "")}</b>へ${st.reason ? ` — ${esc(st.reason)}` : ""}</span></li>`;
      }
      if (st.type === "elevator") {
        evNo++;
        const lv = (id) => {
          const fl = (f?.floors || []).find((x) => x.id === id);
          return fl?.level || id;
        };
        return `<li><span class="step-no ev">${evNo}</span><span>🛗 <b>${esc(lv(st.fromFloor))} → ${esc(lv(st.toFloor))}</b> ${esc(st.name || "エレベーター")}で移動</span></li>`;
      }
      if (st.type === "gate") {
        return `<li><span class="step-no step-gate">🚪</span><span><b>${esc(st.name || "改札")}</b>を通る${st.note ? ` — ${esc(st.note)}` : ""}</span></li>`;
      }
      return `<li><span class="step-no">🚶</span><span>${esc(st.note || "移動")}</span></li>`;
    }).join("");
  }

  // ルートの通過目安時刻(今すぐ出発した場合)を算出する
  function routeTimes(r) {
    const start = new Date();
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 3); // 駅到着までの3分を見込む
    let t = new Date(start);
    const pts = [];
    r.legs.forEach((leg, i) => {
      const first = leg.stations[0], last = leg.stations[leg.stations.length - 1];
      if (i === 0) pts.push({ time: new Date(t), kind: "start", name: first.n });
      t = new Date(t.getTime() + leg.time * 60000);
      const isGoal = i === r.legs.length - 1;
      if (isGoal) {
        pts.push({ time: new Date(t), kind: "goal", name: last.n });
      } else {
        const nextLeg = r.legs[i + 1];
        const g = bestGuideFor(last.n, leg.isWalk ? "" : leg.lineName,
          nextLeg && !nextLeg.isWalk ? nextLeg.lineName : "");
        const bd = transferBreakdown(g);
        pts.push({ time: new Date(t), kind: "transfer", name: last.n, wait: bd.total, bd });
        t = new Date(t.getTime() + bd.total * 60000);
      }
    });
    const total = Math.round((t - start) / 60000);
    return { start, end: t, total, pts };
  }
  const fmtTime = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

  // ベビーカー向け乗換時間の内訳(FR-021/025)
  function transferBreakdown(guide) {
    if (!guide) return { total: 7, rows: [["標準の乗換余裕", 7]] };
    const ev = guide.steps.filter((s) => s.type === "elevator").length;
    const walks = guide.steps.filter((s) => s.type === "walk").length;
    const gates = guide.steps.filter((s) => s.type === "gate").length;
    const rows = [];
    if (ev) rows.push([`エレベーター${ev}回(待ち時間込み)`, ev * 2]);
    if (walks) rows.push([`通路の移動`, walks * 3]);
    if (gates) rows.push([`改札の通過`, gates * 1]);
    rows.push(["安全に乗車するための余裕", 2]);
    const total = rows.reduce((a, r) => a + r[1], 0);
    return { total, rows };
  }

  // ---------- 設備チップ ----------
  function facilityChips(name, arrive = "", depart = "") {
    const f = facOf(name);
    const chips = [];
    if (f?.elevator?.available) chips.push(`<span class="chip good">🛗 EVあり</span>`);
    else if (f && f.elevator && f.elevator.available === false) chips.push(`<span class="chip warn">🛗 EVなし?</span>`);
    else chips.push(`<span class="chip unknown">🛗 情報なし</span>`);
    if (f?.babyToilet?.available) {
      const c = cleanlinessOf(name);
      chips.push(`<span class="chip good">🚻 おむつ替え◯${c ? ` <span class="stars">${stars(c)}</span>` : ""}</span>`);
    } else {
      chips.push(`<span class="chip unknown">🚻 情報なし</span>`);
    }
    if (f?.caution) chips.push(`<span class="chip warn">⚠️ 注意あり</span>`);
    chips.push(levelChip(name));
    if (f?.transferGuides?.length) chips.push(`<button type="button" class="chip nav" data-station="${esc(name)}" data-arrive="${esc(arrive)}" data-depart="${esc(depart)}">🗺 構内マップ</button>`);
    return `<div class="facility-chips">${chips.join("")}</div>`;
  }

  // ---------- ③経路詳細(タブ付きシート) ----------
  let detailCtx = null; // {route, fromName, toName, viaName}

  function openDetail(route, fromName, toName, viaName) {
    detailCtx = { route, fromName, toName, viaName, tab: "all" };
    renderDetail();
    $("detail-sheet").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function renderDetail() {
    const { route: r, fromName, toName, viaName, tab } = detailCtx;
    const tabBtn = (t, label) => `<button type="button" class="dtab${tab === t ? " on" : ""}" data-tab="${t}">${label}</button>`;
    let body = "";
    if (tab === "all") body = detailAll(r);
    else if (tab === "car") body = detailCars(r);
    else if (tab === "transfer") body = detailTransfers(r);
    else body = detailFacilities(r);

    $("detail-body").innerHTML = `<div class="sheet-content">
      <div class="detail-head">
        <div>
          <div class="detail-title">${esc(fromName)} → ${esc(toName)}</div>
          <div class="route-stats"><span class="route-time">約${r.est}分<small>(目安)</small></span>
            <span class="route-meta">乗換${r.transfers}回・約${r.fare.toLocaleString()}円(概算)</span></div>
        </div>
        ${scoreBadge(r.ease)}
      </div>
      <div class="dtabs">${tabBtn("all", "全体")}${tabBtn("car", "乗車位置")}${tabBtn("transfer", "乗換詳細")}${tabBtn("fac", "トイレ・設備")}</div>
      <div id="detail-tab-body">${body}</div>
      <div class="btn-row detail-actions">
        <button type="button" class="primary-btn slim" id="btn-walkthrough">▶ 案内を開始(移動中モード)</button>
        <button type="button" class="secondary-btn" id="btn-share">📤 行程を共有</button>
        <a class="secondary-btn linklike" href="https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}${viaName ? `&via=${encodeURIComponent(viaName)}` : ""}" target="_blank" rel="noopener">🕐 時刻を確認</a>
        <button type="button" class="secondary-btn" id="btn-close-detail">閉じる</button>
      </div>
    </div>`;

    $("detail-body").querySelectorAll(".dtab").forEach((b) =>
      b.addEventListener("click", () => { detailCtx.tab = b.dataset.tab; renderDetail(); }));
    $("detail-body").querySelectorAll("button[data-station]").forEach((b) =>
      b.addEventListener("click", () => {
        closeSheets();
        openStationSheet(b.dataset.station, { arrive: b.dataset.arrive || "", depart: b.dataset.depart || "" });
      }));
    $("btn-walkthrough").addEventListener("click", () => startWalkthrough());
    $("btn-share").addEventListener("click", shareRoute);
    $("btn-close-detail").addEventListener("click", closeSheets);
  }

  // タブ: 全体(時刻つき縦タイムライン)
  function detailAll(r) {
    const rt = routeTimes(r);
    const out = [`<p class="hint" style="margin:2px 0 8px;">時刻は「今すぐ出発した場合」の目安です(ベビーカー乗換時間込み)。実際の発車時刻は時刻リンクで確認してください。</p>`];
    let p = 0; // rt.pts index
    r.legs.forEach((leg, i) => {
      const first = leg.stations[0], last = leg.stations[leg.stations.length - 1];
      const nextLeg = r.legs[i + 1];
      if (i === 0) out.push(tlPoint(rt.pts[p++], "", leg.isWalk ? "" : leg.lineName));
      // 区間
      if (leg.isWalk) {
        out.push(`<div class="tl2-row">
          <div class="tl2-time"></div>
          <div class="tl2-line walkline"></div>
          <div class="tl2-body seg">🚶 徒歩連絡 約${leg.time}分(ベビーカーはやや余裕を)</div>
        </div>`);
      } else {
        const ti = trainInfo(leg.lineName);
        const hint = carHints(first.n, leg.lineName)[0];
        out.push(`<div class="tl2-row">
          <div class="tl2-time"></div>
          <div class="tl2-line" style="background:${esc(leg.lineColor)}"></div>
          <div class="tl2-body seg">
            <div class="seg-line"><b>${esc(leg.lineName)}</b> <span class="leg-direction">${esc(nrm(last.n))}方面</span></div>
            <div class="seg-meta">${leg.stops}駅 ・ 約${leg.time}分</div>
            ${hint ? `<div class="chip good">🚃 ${esc(hint)}</div>` : ""}
            ${ti?.freeSpace ? `<div class="chip freespace">🚼 ${esc(ti.freeSpace)}${ti.verified ? "" : " ※"}</div>` : ""}
          </div>
        </div>`);
      }
      // 到着ポイント
      out.push(tlPoint(rt.pts[p++], leg.isWalk ? "" : leg.lineName,
        nextLeg && !nextLeg.isWalk ? nextLeg.lineName : ""));
    });
    return `<div class="tl2">${out.join("")}</div>`;
  }

  // タイムライン上の駅ポイント(出発/乗換/到着)
  function tlPoint(pt, arrive, depart) {
    if (!pt) return "";
    const kindLabel = { start: "出発", transfer: "乗換", goal: "到着" }[pt.kind];
    const f = facOf(pt.name);
    let extra = "";
    if (pt.kind === "transfer") {
      const g = bestGuideFor(pt.name, arrive, depart);
      extra = `<div class="tl2-wait">🛗 ベビーカー乗換 約${pt.wait}分
        <span class="hint-inline">(${pt.bd.rows.map((x) => `${x[0].replace(/\(.*\)/, "")}${x[1]}分`).join("・")})</span></div>`;
      if (g) extra += `<details class="tl2-steps"><summary>乗換手順を見る(${g.steps.length}ステップ)</summary>
        <ul class="guide-steps">${guideStepsHtml(f, g)}</ul></details>`;
    } else if (pt.kind === "goal" && f?.babyToilet?.location) {
      extra = `<div class="hint">🚻 ${esc(f.babyToilet.location)}</div>`;
    }
    return `<div class="tl2-row">
      <div class="tl2-time on">${fmtTime(pt.time)}</div>
      <div class="tl2-node kind-${pt.kind}"></div>
      <div class="tl2-body">
        <div class="tl2-name"><b>${esc(nrm(pt.name))}</b>
          <span class="tl-kind kind-${pt.kind}">${kindLabel}</span></div>
        ${facilityChips(pt.name, arrive, depart)}
        ${extra}
      </div>
    </div>`;
  }

  function stationBlock(kindLabel, name, arrive, depart, isTransfer) {
    const f = facOf(name);
    let inner = "";
    if (isTransfer) {
      const g = bestGuideFor(name, arrive, depart);
      const bd = transferBreakdown(g);
      inner = `<div class="hint">ベビーカー乗換時間の目安: <b>約${bd.total}分</b></div>`;
      if (g) inner += `<div class="it-guide"><ul class="guide-steps">${guideStepsHtml(f, g)}</ul></div>`;
      else if (f?.elevator?.note) inner += `<div class="hint">🛗 ${esc(f.elevator.note)}</div>`;
    } else if (f?.babyToilet?.location) {
      inner = `<div class="hint">🚻 ${esc(f.babyToilet.location)}</div>`;
    }
    return `<div class="it-station">
      <div class="it-station-head"><span class="tl-kind ${kindLabel.includes("出発") ? "kind-start" : kindLabel.includes("到着") ? "kind-goal" : "kind-transfer"}">${esc(kindLabel)}</span>
        <b>${esc(name)}</b></div>
      ${facilityChips(name, arrive, depart)}
      ${inner}
    </div>`;
  }

  // タブ: ⑤乗車位置
  function detailCars(r) {
    const out = [];
    r.legs.filter((l) => !l.isWalk).forEach((leg) => {
      const first = leg.stations[0], last = leg.stations[leg.stations.length - 1];
      const ti = trainInfo(leg.lineName);
      const cars = ti?.cars || 10;
      const hints = carHints(first.n, leg.lineName);
      // ガイドから号車番号が取れれば強調
      let recCar = null;
      const g = facOf(first.n)?.transferGuides?.find((gg) => gg.steps.some((s) => s.type === "car" && Number.isFinite(s.carNo)));
      if (g) recCar = g.steps.find((s) => s.type === "car" && Number.isFinite(s.carNo)).carNo;
      const strip = Array.from({ length: cars }, (_, i) =>
        `<span class="car-cell${recCar === i + 1 ? " rec" : ""}">${i + 1}</span>`).join("");
      out.push(`<div class="car-panel">
        <div class="car-panel-head"><b>${esc(leg.lineName)}</b> <span class="leg-direction">${esc(nrm(last.n))}方面</span></div>
        <div class="car-strip">${strip}<span class="car-dir">→ 進行方向</span></div>
        ${hints.length ? hints.slice(0, 2).map((h) => `<div class="chip good">🚃 ${esc(h)}</div>`).join("") : `<div class="chip unknown">🚃 号車位置は未確認(利用時のメモ募集)</div>`}
        ${ti?.freeSpace ? `<div class="chip freespace">🚼 ベビーカースペース: ${esc(ti.freeSpace)}${ti.verified ? "" : " ※"}</div>` : ""}
        ${ti?.note ? `<div class="hint">${esc(ti.note)}</div>` : ""}
      </div>`);
    });
    out.push(`<p class="hint">※印は車種・編成による参考値です。乗車位置の実測メモは各駅の口コミから登録できます。</p>`);
    return out.join("");
  }

  // タブ: 乗換詳細
  function detailTransfers(r) {
    const out = [];
    r.legs.forEach((leg, i) => {
      const nextLeg = r.legs[i + 1];
      if (!nextLeg || leg.isWalk) return;
      const name = leg.stations[leg.stations.length - 1].n;
      if (i === r.legs.length - 1) return;
      const g = bestGuideFor(name, leg.lineName, nextLeg.isWalk ? "" : nextLeg.lineName);
      const f = facOf(name);
      const bd = transferBreakdown(g);
      out.push(`<div class="it-station">
        <div class="it-station-head"><span class="tl-kind kind-transfer">🔁 乗換</span><b>${esc(name)}</b></div>
        <div class="hint">ベビーカー乗換時間 <b>約${bd.total}分</b>: ${bd.rows.map((x) => `${esc(x[0])} ${x[1]}分`).join(" / ")}</div>
        ${g ? `<ul class="guide-steps">${guideStepsHtml(f, g)}</ul>` : `<p class="hint">この駅の詳細導線は未整備です(情報Lv${stationLevel(name)})。エレベーター位置は公式構内図で確認してください。</p>`}
        ${reliabilityHtml(name)}
        ${facilityChips(name, leg.lineName, nextLeg.isWalk ? "" : nextLeg.lineName)}
      </div>`);
    });
    return out.join("") || `<p class="empty-note">乗換のないルートです。</p>`;
  }

  // タブ: ⑥トイレ・設備 + ⑦立寄り
  function detailFacilities(r) {
    const out = [];
    for (const p of r.points) {
      const f = facOf(p.station.n);
      if (!f?.babyToilet) continue;
      const c = cleanlinessOf(p.station.n);
      out.push(`<div class="it-station">
        <div class="it-station-head"><b>${esc(p.station.n)}</b>
          <span class="chip">${p.kind === "start" ? "出発駅" : p.kind === "goal" ? "到着駅" : "乗換駅 +4分目安"}</span></div>
        <div class="fac-note">🚻 ${esc(f.babyToilet.location || "")}${f.babyToilet.note ? " — " + esc(f.babyToilet.note) : ""}</div>
        ${c ? `<div>きれいさ: <span class="stars">${stars(c)}</span> ${c}</div>` : ""}
        ${reliabilityHtml(p.station.n)}
      </div>`);
    }
    // 7: 途中駅での立寄り候補
    const mids = new Set();
    for (const leg of r.legs) for (const s of leg.stations.slice(1, -1)) {
      if (facOf(s.n)?.babyToilet?.available) mids.add(s.n);
    }
    if (mids.size) {
      out.push(`<h3>途中下車での立寄り候補 <span class="hint-inline">(+15分目安)</span></h3>` +
        [...mids].slice(0, 5).map((n) => {
          const c = cleanlinessOf(n);
          return `<div class="it-station"><div class="it-station-head"><b>${esc(n)}</b>${c ? `<span class="stars">${stars(c)}</span>` : ""}</div>
            <div class="fac-note">🚻 ${esc(facOf(n).babyToilet.location || "")}</div></div>`;
        }).join(""));
    }
    return out.join("") || `<p class="empty-note">このルート上の設備情報はまだ登録されていません。</p>`;
  }

  // ---------- ⑧行程共有 ----------
  function shareUrl() {
    const { fromName, toName, viaName } = detailCtx;
    const u = new URL(location.href.split("?")[0]);
    u.searchParams.set("f", fromName);
    u.searchParams.set("t", toName);
    if (viaName) u.searchParams.set("v", viaName);
    if ($("use-express").checked) u.searchParams.set("x", "1");
    return u.toString();
  }
  async function shareRoute() {
    const { route: r, fromName, toName } = detailCtx;
    const lines = r.legs.filter((l) => !l.isWalk).map((l) => `${nrm(l.lineName)}(${nrm(l.stations[l.stations.length - 1].n)}方面)`).join(" → ");
    const text = `【ベビーカーナビ】${fromName} → ${toName}\n約${r.est}分・乗換${r.transfers}回\n${lines}\n${shareUrl()}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); alert("行程をコピーしました。LINEやメールに貼り付けて共有できます。"); }
    } catch {}
  }
  function applyUrlParams() {
    const q = new URLSearchParams(location.search);
    if (!q.get("f") || !q.get("t")) return;
    $("from-input").value = q.get("f");
    $("to-input").value = q.get("t");
    if (q.get("v")) $("via-input").value = q.get("v");
    if (q.get("x")) $("use-express").checked = true;
    doSearch(true);
  }

  // ---------- ⑨案内モード(移動中画面) ----------
  function buildWalkSteps(r) {
    const steps = [];
    r.legs.forEach((leg, i) => {
      const first = leg.stations[0], last = leg.stations[leg.stations.length - 1];
      const nextLeg = r.legs[i + 1];
      if (i === 0) steps.push({ icon: "🏁", main: `${nrm(first.n)}駅からスタート`, sub: "改札・ホームへはエレベーターを利用" });
      if (leg.isWalk) {
        steps.push({ icon: "🚶", main: `徒歩連絡 約${leg.time}分`, sub: `${nrm(last.n)}へ移動` });
      } else {
        const hint = carHints(first.n, leg.lineName)[0];
        const ti = trainInfo(leg.lineName);
        steps.push({ icon: "🚃", main: `${nrm(leg.lineName)} ${nrm(last.n)}方面に乗車`, sub: `${leg.stops}駅・約${leg.time}分${hint ? ` / ${hint}` : ""}${ti?.freeSpace ? ` / 🚼${ti.freeSpace}` : ""}` });
      }
      const isGoal = i === r.legs.length - 1;
      if (isGoal) {
        steps.push({ icon: "🎯", main: `${nrm(last.n)}に到着`, sub: facOf(last.n)?.babyToilet?.location ? `🚻 ${facOf(last.n).babyToilet.location}` : "おつかれさまでした" });
      } else {
        const g = bestGuideFor(last.n, leg.isWalk ? "" : leg.lineName, nextLeg && !nextLeg.isWalk ? nextLeg.lineName : "");
        steps.push({ icon: "🔁", main: `${nrm(last.n)}で降車`, sub: `乗換 約${transferBreakdown(g).total}分`, station: last.n });
        if (g) {
          for (const st of g.steps) {
            if (st.type === "car") continue;
            if (st.type === "elevator") steps.push({ icon: "🛗", main: `${st.name || "エレベーター"}`, sub: `${st.fromFloor} → ${st.toFloor}`, station: last.n });
            else if (st.type === "gate") steps.push({ icon: "🚪", main: st.name || "改札を通る", sub: st.note || "", station: last.n });
            else steps.push({ icon: "🚶", main: "歩いて移動", sub: st.note || "", station: last.n });
          }
        }
      }
    });
    return steps;
  }
  let walkState = null;
  function startWalkthrough() {
    const steps = buildWalkSteps(detailCtx.route);
    walkState = { steps, i: 0 };
    closeSheets();
    $("walkthrough").hidden = false;
    document.body.style.overflow = "hidden";
    renderWalkthrough();
  }
  function renderWalkthrough() {
    const { steps, i } = walkState;
    const st = steps[i];
    $("walkthrough-body").innerHTML = `
      <div class="wt-head">
        <span>案内 ${i + 1}/${steps.length}</span>
        <button type="button" id="wt-close" class="icon-btn" aria-label="閉じる">✕</button>
      </div>
      <div class="wt-main">
        <div class="wt-icon">${st.icon}</div>
        <div class="wt-text">${esc(st.main)}</div>
        ${st.sub ? `<div class="wt-sub">${esc(st.sub)}</div>` : ""}
        ${st.station && facOf(st.station)?.transferGuides?.length ? `<button type="button" class="secondary-btn" id="wt-map">🗺 構内マップを見る</button>` : ""}
      </div>
      <div class="wt-nav">
        <button type="button" class="secondary-btn" id="wt-prev" ${i === 0 ? "disabled" : ""}>← 前へ</button>
        <button type="button" class="primary-btn slim" id="wt-next">${i === steps.length - 1 ? "案内を終了" : "次へ →"}</button>
      </div>`;
    $("wt-close").addEventListener("click", endWalkthrough);
    $("wt-prev").addEventListener("click", () => { if (walkState.i > 0) { walkState.i--; renderWalkthrough(); } });
    $("wt-next").addEventListener("click", () => {
      if (walkState.i >= walkState.steps.length - 1) endWalkthrough();
      else { walkState.i++; renderWalkthrough(); }
    });
    const mapBtn = $("wt-map");
    if (mapBtn) mapBtn.addEventListener("click", () => {
      $("walkthrough").hidden = true;
      openStationSheet(walkState.steps[walkState.i].station, {});
    });
  }
  function endWalkthrough() {
    $("walkthrough").hidden = true;
    document.body.style.overflow = "";
  }

  // ---------- ④駅構内マップ(既存資産) ----------
  let currentStation = null;
  let currentCtx = {};
  let pendingStars = { tc: 0, ez: 0 };

  function openStationSheet(name, ctx = {}) {
    currentStation = name;
    currentCtx = ctx;
    pendingStars = { tc: 0, ez: 0 };
    renderStationSheet();
    $("station-sheet").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSheets() {
    if (typeof Station3D !== "undefined") Station3D.disposeAll();
    $("station-sheet").hidden = true;
    $("detail-sheet").hidden = true;
    $("settings-sheet").hidden = true;
    document.body.style.overflow = "";
  }

  function renderStationSheet() {
    if (typeof Station3D !== "undefined") Station3D.disposeAll();
    const name = currentStation;
    const f = facOf(name);
    const st = Router.stationByName(name);
    const lines = st ? Router.linesOf(st).map((l) => l.n).join("・") : "";
    const c = cleanlinessOf(name);
    const revs = reviewsFor(name);
    const favOn = Store.isFavStation(name);

    const facHtml = f ? `
      ${f.elevator ? `<div class="fac-block"><div class="fac-title">🛗 エレベーター${f.verified ? "" : '<span class="unverified">参考情報・要現地確認</span>'}</div>
        <div class="fac-note">${esc(f.elevator.note || (f.elevator.available ? "あり" : "情報なし"))}</div></div>` : ""}
      ${f.babyToilet ? `<div class="fac-block"><div class="fac-title">🚻 おむつ替え・ベビールーム${f.verified ? "" : '<span class="unverified">参考情報・要現地確認</span>'}</div>
        <div class="fac-note">${esc(f.babyToilet.location || "")} ${f.babyToilet.note ? "— " + esc(f.babyToilet.note) : ""}</div>
        ${c ? `<div>きれいさ: <span class="stars">${stars(c)}</span> ${c}</div>` : ""}</div>` : ""}
      ${f.caution ? `<div class="fac-block fac-caution"><div class="fac-title">⚠️ 注意</div><div class="fac-note">${esc(f.caution)}</div></div>` : ""}
    ` : `<p class="empty-note">この駅の施設データはまだありません(情報Lv1)。口コミ・メモで情報を追加できます。</p>`;

    const allGuides = (f?.transferGuides || []).map((g, gi) => ({ g, gi }));
    let matched = [], others = allGuides;
    if (currentCtx.arrive || currentCtx.depart) {
      const scored = allGuides.map((x) => ({ ...x, sc: guideMatchScore(x.g, currentCtx.arrive, currentCtx.depart) }));
      const best = Math.max(0, ...scored.map((x) => x.sc));
      if (best > 0) {
        matched = scored.filter((x) => x.sc === best);
        others = scored.filter((x) => x.sc !== best);
      }
    }
    const renderGuide = ({ g, gi }, hit) => {
      const steps = guideStepsHtml(f, g);
      const plan = (typeof StationMap !== "undefined" && StationMap.renderPlan && StationMap.renderPlan(f, g)) || "";
      const iso = (typeof StationMap !== "undefined" && StationMap.render(f, g)) || "";
      const hasMap = !!(plan || iso);
      return `<div class="guide-block${hit ? " guide-hit" : ""}" data-guide="${gi}">
        <div class="guide-title">${hit ? '<span class="hit-badge">このルートの乗換</span>' : ""}${esc(g.from)} → ${esc(g.to)}</div>
        <ul class="guide-steps">${steps}</ul>
        ${hasMap ? `<div class="map-tabs">
          <button type="button" class="map-tab on" data-mode="plan" data-guide="${gi}">🗺 フロア図</button>
          <button type="button" class="map-tab" data-mode="iso" data-guide="${gi}">📐 断面図</button>
          <button type="button" class="map-tab" data-mode="3d" data-guide="${gi}">🧊 3D(回転)</button>
        </div>` : ""}
        <div class="map-area">${plan || iso}</div>
      </div>`;
    };
    let guidesHtml = "";
    if (matched.length) {
      guidesHtml = matched.map((x) => renderGuide(x, true)).join("");
      if (others.length) {
        guidesHtml += `<details class="other-guides"><summary>他の乗換パターンを見る(${others.length}件)</summary>${others.map((x) => renderGuide(x, false)).join("")}</details>`;
      }
    } else {
      guidesHtml = allGuides.map((x) => renderGuide(x, false)).join("");
    }
    const navHtml = guidesHtml
      ? `<h3>🧭 乗換ナビ<span class="unverified">参考情報・要現地確認</span></h3>${guidesHtml}`
      : "";

    const revHtml = revs.length
      ? revs.slice().reverse().map((r) => `<div class="review">
          ${r.tc ? `<div>🚻 きれいさ <span class="stars">${stars(r.tc)}</span></div>` : ""}
          ${r.ez ? `<div>🛗 移動しやすさ <span class="stars">${stars(r.ez)}</span></div>` : ""}
          ${r.car ? `<div>🚃 号車メモ: ${esc(r.car)}</div>` : ""}
          ${r.tx ? `<div>${esc(r.tx)}</div>` : ""}
          <div class="rv-meta">${esc(r.d)}</div>
        </div>`).join("")
      : `<p class="hint">まだメモがありません。利用時の気づき(EV前の号車・改札名など)を残すと案内が正確になります。</p>`;

    $("station-sheet-body").innerHTML = `<div class="sheet-content">
      <div class="results-head"><h2>🚉 ${esc(name)} ${levelChip(name)}</h2>
        <button type="button" class="fav-btn${favOn ? " on" : ""}" id="btn-fav-station">${favOn ? "♥" : "♡"}</button></div>
      <p class="hint">${esc(lines)}</p>
      ${reliabilityHtml(name)}
      ${facHtml}
      ${navHtml}
      <div class="station-links">
        <a href="https://www.google.com/search?q=${encodeURIComponent(name + "駅 構内図 エレベーター")}" target="_blank" rel="noopener">🗺 公式構内図を検索</a>
        <a href="https://www.google.com/maps/search/${encodeURIComponent(name + "駅")}" target="_blank" rel="noopener">📍 地図</a>
      </div>
      <h3>💬 利用メモ (${revs.length}件)</h3>
      ${revHtml}
      <h3>✏️ メモを追加</h3>
      <div>🚻 トイレのきれいさ</div>
      <div class="star-input" data-kind="tc">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-v="${i}">★</button>`).join("")}</div>
      <div>🛗 ベビーカー移動のしやすさ</div>
      <div class="star-input" data-kind="ez">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-v="${i}">★</button>`).join("")}</div>
      <input type="text" id="rv-car" placeholder="号車メモ (例: 東京方面は6号車がEV前)">
      <textarea id="rv-text" placeholder="自由メモ (例: 中央西口改札はベビーカーで通りやすい)"></textarea>
      <button class="primary-btn slim" id="btn-add-review">保存する</button>
      <button class="secondary-btn" id="btn-close-station" style="width:100%;margin-top:8px;">閉じる</button>
    </div>`;

    $("station-sheet-body").querySelectorAll(".star-input").forEach((box) => {
      box.addEventListener("click", (ev) => {
        const b = ev.target.closest("button[data-v]");
        if (!b) return;
        const kind = box.dataset.kind, v = Number(b.dataset.v);
        pendingStars[kind] = v;
        box.querySelectorAll("button").forEach((x) => x.classList.toggle("on", Number(x.dataset.v) <= v));
      });
    });
    $("btn-add-review").addEventListener("click", addReview);
    $("btn-close-station").addEventListener("click", closeSheets);
    $("btn-fav-station").addEventListener("click", () => {
      const on = Store.toggleFavStation(name);
      $("btn-fav-station").textContent = on ? "♥" : "♡";
      $("btn-fav-station").classList.toggle("on", on);
    });

    $("station-sheet-body").querySelectorAll(".map-tab").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const block = btn.closest(".guide-block");
        const area = block.querySelector(".map-area");
        const guide = (f?.transferGuides || [])[Number(btn.dataset.guide)];
        block.querySelectorAll(".map-tab").forEach((b) => b.classList.toggle("on", b === btn));
        if (typeof Station3D !== "undefined") Station3D.disposeAll();
        const mode = btn.dataset.mode;
        if (mode === "plan") {
          area.innerHTML = (StationMap.renderPlan && StationMap.renderPlan(f, guide)) || StationMap.render(f, guide) || "";
        } else if (mode === "iso") {
          area.innerHTML = StationMap.render(f, guide) || "";
        } else {
          btn.disabled = true;
          try {
            area.innerHTML = "";
            await Station3D.show(area, f, guide);
          } catch (e) {
            area.innerHTML = `<p class="hint">3D表示に失敗しました(${esc(e.message)})。フロア図をご利用ください。</p>`;
          }
          btn.disabled = false;
        }
      });
    });
  }

  function addReview() {
    const car = $("rv-car").value.trim();
    const tx = $("rv-text").value.trim();
    if (!pendingStars.tc && !pendingStars.ez && !car && !tx) { alert("評価かメモを入力してください"); return; }
    const all = loadReviews();
    (all[nrm(currentStation)] ||= []).push({
      d: new Date().toISOString().slice(0, 10),
      tc: pendingStars.tc || null,
      ez: pendingStars.ez || null,
      car: car || null,
      tx: tx || null,
    });
    saveReviews(all);
    renderStationSheet();
  }

  // ---------- ショートカット(8.2/8.4) ----------
  function renderShortcuts() {
    const freq = Store.frequentStations(6);
    const hist = Store.getHistory().slice(0, 3);
    if (!freq.length && !hist.length) { $("shortcuts").innerHTML = ""; return; }
    $("shortcuts").innerHTML = `<div class="shortcut-card">
      ${freq.length ? `<div class="mode-label">よく使う駅</div>
        <div class="mode-chips">${freq.map((n) => `<button type="button" class="mode-chip" data-fill="${esc(n)}">${esc(nrm(n))}</button>`).join("")}</div>` : ""}
      ${hist.length ? `<div class="mode-label">最近の検索</div>
        ${hist.map((h, i) => `<button type="button" class="hist-row" data-hist="${i}">
          <span>${esc(nrm(h.from))} → ${esc(nrm(h.to))}${h.via ? `(${esc(nrm(h.via))}経由)` : ""}</span><span class="hist-go">再検索 ›</span></button>`).join("")}` : ""}
    </div>`;
    $("shortcuts").querySelectorAll("[data-fill]").forEach((b) =>
      b.addEventListener("click", () => {
        if (!$("from-input").value.trim()) $("from-input").value = b.dataset.fill;
        else $("to-input").value = b.dataset.fill;
      }));
    $("shortcuts").querySelectorAll("[data-hist]").forEach((b) =>
      b.addEventListener("click", () => {
        const h = Store.getHistory()[Number(b.dataset.hist)];
        $("from-input").value = h.from; $("to-input").value = h.to; $("via-input").value = h.via || "";
        doSearch();
      }));
  }

  // ---------- ⑩マイページ / お気に入り ----------
  function renderMyPage() {
    const p = Store.getProfile();
    const sel = (id, opts, cur) =>
      `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`).join("")}</select>`;
    const hist = Store.getHistory();
    $("my-body").innerHTML = `
      <section class="search-card">
        <h2>利用者プロフィール</h2>
        <p class="hint">検索の優先順位に反映されます(この端末に保存)。</p>
        <div class="profile-grid">
          <label>ベビーカー ${sel("pf-stroller", [["single", "1人用"], ["twin", "双子用"], ["large", "大型"], ["compact", "コンパクト"]], p.stroller)}</label>
          <label>大人の人数 ${sel("pf-adults", [["1", "1人"], ["2", "2人以上"]], p.adults)}</label>
          <label>階段 ${sel("pf-stairs", [["avoid", "絶対回避"], ["some", "一部許容"]], p.stairs)}</label>
          <label>乗換方針 ${sel("pf-policy", [["ease", "負担最少"], ["fewer", "乗換最少"], ["fast", "時間優先"]], p.policy)}</label>
        </div>
        <button class="primary-btn slim" id="btn-save-profile">プロフィールを保存</button>
      </section>
      <section class="search-card">
        <h2>検索履歴 (${hist.length}件)</h2>
        ${hist.length ? hist.slice(0, 10).map((h, i) => `<button type="button" class="hist-row" data-hist="${i}">
          <span>${esc(nrm(h.from))} → ${esc(nrm(h.to))}<br><small class="hint-inline">${esc(h.at.slice(0, 10))}</small></span><span class="hist-go">再検索 ›</span></button>`).join("") : `<p class="hint">まだ履歴がありません。</p>`}
        ${hist.length ? `<button class="secondary-btn" id="btn-clear-history">履歴をすべて削除</button>` : ""}
      </section>
      <section class="search-card">
        <h2>データ管理</h2>
        <p class="hint">履歴・お気に入り・プロフィールはこの端末にのみ保存されます。機種変更時はエクスポートしてください。アカウント・端末間同期は今後のバックエンド対応で提供予定です。</p>
        <button class="secondary-btn" id="btn-open-settings">⚙️ 設定(バックアップ・APIキー)</button>
      </section>`;
    $("btn-save-profile").addEventListener("click", () => {
      Store.setProfile({
        stroller: $("pf-stroller").value, adults: $("pf-adults").value,
        stairs: $("pf-stairs").value, policy: $("pf-policy").value,
      });
      alert("保存しました。次回の検索から反映されます。");
    });
    $("my-body").querySelectorAll("[data-hist]").forEach((b) =>
      b.addEventListener("click", () => {
        const h = Store.getHistory()[Number(b.dataset.hist)];
        switchView("home");
        $("from-input").value = h.from; $("to-input").value = h.to; $("via-input").value = h.via || "";
        doSearch();
      }));
    const clr = $("btn-clear-history");
    if (clr) clr.addEventListener("click", () => {
      if (confirm("検索履歴をすべて削除しますか?")) { Store.clearHistory(); renderMyPage(); renderShortcuts(); }
    });
    $("btn-open-settings").addEventListener("click", openSettings);
  }

  function renderFavPage() {
    const routes = Store.getFavRoutes();
    const stations = Store.getFavStations();
    $("fav-body").innerHTML = `
      <section class="search-card">
        <h2>お気に入りの経路</h2>
        ${routes.length ? routes.map((r, i) => `<button type="button" class="hist-row" data-favr="${i}">
          <span>${esc(nrm(r.from))} → ${esc(nrm(r.to))}${r.via ? `(${esc(nrm(r.via))}経由)` : ""}</span><span class="hist-go">今すぐ検索 ›</span></button>`).join("") : `<p class="hint">経路検索の結果画面の ♡ から登録できます。</p>`}
      </section>
      <section class="search-card">
        <h2>お気に入りの駅</h2>
        ${stations.length ? `<div class="mode-chips">${stations.map((n) => `<button type="button" class="mode-chip" data-favst="${esc(n)}">${esc(nrm(n))}</button>`).join("")}</div>` : `<p class="hint">駅マップ画面の ♡ から登録できます。</p>`}
      </section>`;
    $("fav-body").querySelectorAll("[data-favr]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = Store.getFavRoutes()[Number(b.dataset.favr)];
        switchView("home");
        $("from-input").value = r.from; $("to-input").value = r.to; $("via-input").value = r.via || "";
        doSearch();
      }));
    $("fav-body").querySelectorAll("[data-favst]").forEach((b) =>
      b.addEventListener("click", () => openStationSheet(b.dataset.favst, {})));
  }

  // ---------- ビュー切替 ----------
  function switchView(v) {
    for (const id of ["home", "my", "fav"]) $(`view-${id}`).hidden = id !== v;
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    if (v === "my") renderMyPage();
    if (v === "fav") renderFavPage();
    window.scrollTo(0, 0);
  }

  // ---------- 設定 ----------
  function openSettings() {
    $("ekispert-key").value = localStorage.getItem(Store.K.ekispert) || "";
    $("settings-sheet").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function setupSettings() {
    $("btn-settings").addEventListener("click", openSettings);
    $("btn-save-key").addEventListener("click", () => {
      const v = $("ekispert-key").value.trim();
      if (v) localStorage.setItem(Store.K.ekispert, v);
      else localStorage.removeItem(Store.K.ekispert);
      alert("保存しました");
    });
    $("btn-close-settings").addEventListener("click", closeSheets);
    $("btn-export").addEventListener("click", () => {
      const blob = new Blob([Store.exportAll()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `babycarnavi-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("btn-import").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try { Store.importAll(await file.text()); alert("インポートしました"); }
      catch (e) { alert("インポートに失敗しました: " + e.message); }
      ev.target.value = "";
    });
  }

  // ---------- 起動 ----------
  function setup() {
    setupSuggest("from-input", "from-suggest");
    setupSuggest("to-input", "to-suggest");
    setupSuggest("via-input", "via-suggest");
    setupSettings();

    $("btn-swap").addEventListener("click", () => {
      const a = $("from-input").value;
      $("from-input").value = $("to-input").value;
      $("to-input").value = a;
    });
    $("use-express").checked = localStorage.getItem(Store.K.useExpress) === "1";
    $("btn-search").addEventListener("click", () => doSearch());
    $("to-input").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

    $("mode-chips").querySelectorAll(".mode-chip").forEach((b) => {
      b.addEventListener("click", () => {
        const m = b.dataset.mode;
        if (activeModes.has(m)) activeModes.delete(m); else activeModes.add(m);
        b.classList.toggle("on", activeModes.has(m));
      });
    });

    document.querySelectorAll(".nav-btn").forEach((b) =>
      b.addEventListener("click", () => switchView(b.dataset.view)));

    [$("station-sheet"), $("detail-sheet"), $("settings-sheet")].forEach((bd) => {
      bd.addEventListener("click", (ev) => { if (ev.target === bd) closeSheets(); });
    });

    boot();
  }

  document.addEventListener("DOMContentLoaded", setup);
})();
