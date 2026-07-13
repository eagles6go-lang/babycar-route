// ベビカルート アプリ本体
"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const LS_REVIEWS = "bcr_reviews_v1";
  const LS_EKISPERT = "bcr_ekispert_key";

  let facilities = {};
  let ready = false;

  // ---------- ユーティリティ ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function loadReviews() {
    try { return JSON.parse(localStorage.getItem(LS_REVIEWS)) || {}; } catch { return {}; }
  }
  function saveReviews(r) { localStorage.setItem(LS_REVIEWS, JSON.stringify(r)); }
  const nrm = (name) => (typeof Router !== "undefined" ? Router.normName(name) : name);
  function facOf(name) { return facilities[nrm(name)] || facilities[name]; }
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

  // ---------- データ読み込み ----------
  async function boot() {
    try {
      const DATA_V = "4";
      const [network, walks, fac] = await Promise.all([
        fetch(`data/network.json?v=${DATA_V}`).then((r) => r.json()),
        fetch(`data/walk_transfers.json?v=${DATA_V}`).then((r) => r.json()),
        fetch(`data/facilities.json?v=${DATA_V}`).then((r) => r.json()),
      ]);
      facilities = fac.stations || {};
      Router.init(network, walks, facilities, reviewsFor);
      ready = true;
      $("load-status").textContent =
        `関東 ${network.stations.length}駅 / ${network.lines.length}路線 に対応`;
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
        return `<button type="button" data-name="${esc(s.n)}">${esc(s.n)}<span class="sub">${esc(s.k)} | ${esc(lines)}</span></button>`;
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
  }

  // ---------- 検索・結果描画 ----------
  function facilityChips(name) {
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
    if (f?.transferGuides?.length) chips.push(`<button type="button" class="chip nav" data-station="${esc(name)}">🧭 乗換ナビ</button>`);
    const rv = reviewsFor(name).length;
    if (rv) chips.push(`<span class="chip">💬 口コミ${rv}件</span>`);
    return `<div class="facility-chips">${chips.join("")}</div>`;
  }

  // この駅×路線の号車おすすめ(carRecommend + 乗換ガイドのcarステップ + 口コミの号車メモ)
  function carHints(name, lineName) {
    const f = facOf(name);
    const hints = [];
    const matchLine = (l) => !lineName || !l || l.includes(lineName) || lineName.includes(l) ||
      Router.normName(l) === Router.normName(lineName || "");
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
    for (const rv of reviewsFor(name)) {
      if (rv.car) hints.push(`💬 ${rv.car}`);
    }
    return hints;
  }

  function carRecommendHtml(name, lineName) {
    return carHints(name, lineName).slice(0, 2).map((h) =>
      `<div class="chip good">🚃 ${esc(h)}</div>`).join("");
  }

  function renderRoutes(fromName, toName, routes) {
    const el = $("results");
    if (!routes.length) {
      el.innerHTML = `<p class="empty-note">ルートが見つかりませんでした。駅名を候補から選び直してください。</p>`;
      return;
    }
    const cards = routes.map((r, idx) => {
      const tl = [];
      r.legs.forEach((leg, i) => {
        const first = leg.stations[0], last = leg.stations[leg.stations.length - 1];
        if (i === 0) tl.push(stationRow(first.n, "start"));
        if (leg.isWalk) {
          tl.push(`<div class="tl-leg"><div class="walk-leg tl-leginfo">🚶 徒歩連絡 約${leg.time}分(ベビーカーはやや余裕を)</div></div>`);
        } else {
          tl.push(`<div class="tl-leg">
            <div class="tl-legline" style="background:${esc(leg.lineColor)}"></div>
            <div class="tl-leginfo"><b>${esc(leg.lineName)}</b> <span class="leg-direction">${esc(Router.normName(last.n))}方面</span> ${leg.stops}駅 / 約${leg.time}分
              ${carRecommendHtml(first.n, leg.lineName)}</div>
          </div>`);
        }
        tl.push(stationRow(last.n, i === r.legs.length - 1 ? "goal" : "transfer"));
      });

      const yahooUrl = `https://transit.yahoo.co.jp/search/result?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}`;
      return `<article class="route-card">
        <div class="route-head">
          <span class="route-label">${esc(r.label)}</span>
          <span class="route-time">約${r.est}分<small> (目安)</small></span>
          <span class="route-meta">乗換${r.transfers}回</span>
          <span class="ease-badge ease-${r.easeScore}">楽さ ${r.easeScore}</span>
        </div>
        <div class="timeline">${tl.join("")}</div>
        <div class="route-links">
          <a href="${yahooUrl}" target="_blank" rel="noopener">🕐 Yahoo!乗換で時刻を見る</a>
          <button type="button" data-ekispert="${esc(fromName)}|${esc(toName)}">🚉 駅すぱあとで見る</button>
        </div>
      </article>`;
    });
    el.innerHTML = `<h2 class="results-title">「${esc(fromName)} → ${esc(toName)}」のベビーカー向けルート</h2>` + cards.join("");

    el.querySelectorAll("button[data-ekispert]").forEach((b) => {
      b.addEventListener("click", () => openEkispert(...b.dataset.ekispert.split("|")));
    });
    el.querySelectorAll("button[data-station]").forEach((b) => {
      b.addEventListener("click", () => openStationSheet(b.dataset.station));
    });
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function stationRow(name, kind) {
    const kindLabel = { start: "出発", transfer: "乗換", goal: "到着" }[kind];
    return `<div class="tl-station">
      <div class="tl-dot"></div>
      <div class="tl-body">
        <div class="tl-name"><button type="button" data-station="${esc(name)}">${esc(name)}</button>
          <span class="tl-kind kind-${kind}">${kindLabel}</span></div>
        ${facilityChips(name)}
      </div>
    </div>`;
  }

  async function openEkispert(from, to) {
    const key = localStorage.getItem(LS_EKISPERT);
    if (!key) {
      alert("駅すぱあとAPIのアクセスキーが未設定です。設定(⚙️)から登録してください。\n代わりにYahoo!乗換のリンクをご利用いただけます。");
      return;
    }
    try {
      const url = `https://api.ekispert.jp/v1/json/search/course/light?key=${encodeURIComponent(key)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await fetch(url);
      const data = await res.json();
      const uri = data?.ResultSet?.ResourceURI;
      if (uri) window.open(uri, "_blank", "noopener");
      else throw new Error(data?.ResultSet?.Error?.Message || "URLを取得できませんでした");
    } catch (e) {
      alert("駅すぱあとの経路URL取得に失敗しました: " + e.message);
    }
  }

  // ---------- 駅詳細シート ----------
  let currentStation = null;
  let pendingStars = { tc: 0, ez: 0 };

  function openStationSheet(name) {
    currentStation = name;
    pendingStars = { tc: 0, ez: 0 };
    renderStationSheet();
    $("station-sheet").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSheets() {
    if (typeof Station3D !== "undefined") Station3D.disposeAll();
    $("station-sheet").hidden = true;
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

    const facHtml = f ? `
      ${f.elevator ? `<div class="fac-block"><div class="fac-title">🛗 エレベーター${f.verified ? "" : '<span class="unverified">参考情報・要現地確認</span>'}</div>
        <div class="fac-note">${esc(f.elevator.note || (f.elevator.available ? "あり" : "情報なし"))}</div></div>` : ""}
      ${f.babyToilet ? `<div class="fac-block"><div class="fac-title">🚻 おむつ替え・ベビールーム${f.verified ? "" : '<span class="unverified">参考情報・要現地確認</span>'}</div>
        <div class="fac-note">${esc(f.babyToilet.location || "")} ${f.babyToilet.note ? "— " + esc(f.babyToilet.note) : ""}</div>
        ${c ? `<div>きれいさ: <span class="stars">${stars(c)}</span> ${c}</div>` : ""}</div>` : ""}
      ${(f.carRecommend || []).length ? `<div class="fac-block"><div class="fac-title">🚃 おすすめ号車</div>
        ${f.carRecommend.map((r) => `<div class="fac-note">${esc(r.line || "")} ${esc(r.direction || "")}: <b>${esc(r.car || "")}</b> ${esc(r.reason || "")}</div>`).join("")}</div>` : ""}
      ${f.caution ? `<div class="fac-block fac-caution"><div class="fac-title">⚠️ 注意</div><div class="fac-note">${esc(f.caution)}</div></div>` : ""}
    ` : `<p class="empty-note">この駅の施設シードデータはまだありません。下の口コミ・メモで情報を追加できます。公式の駅構内図も確認してください。</p>`;

    const guidesHtml = (f?.transferGuides || []).map((g, gi) => {
      let evNo = 0;
      const steps = g.steps.map((st) => {
        if (st.type === "car") {
          return `<li><span class="step-no step-car">🚃</span><span><b>${esc(st.line || "")}</b> ${esc(st.direction || "")}は<b>${esc(st.car || "")}</b>へ${st.reason ? ` — ${esc(st.reason)}` : ""}</span></li>`;
        }
        if (st.type === "elevator") {
          evNo++;
          return `<li><span class="step-no ev">${evNo}</span><span>🛗 <b>${esc(st.fromFloor)} → ${esc(st.toFloor)}</b> ${esc(st.name || "エレベーター")}で移動</span></li>`;
        }
        return `<li><span class="step-no">🚶</span><span>${esc(st.note || "移動")}</span></li>`;
      }).join("");
      const svg = (typeof StationMap !== "undefined" && StationMap.render(f, g)) || "";
      return `<div class="guide-block" data-guide="${gi}">
        <div class="guide-title">${esc(g.from)} → ${esc(g.to)}</div>
        <ul class="guide-steps">${steps}</ul>
        <div class="map-area">${svg}</div>
        ${f.floors?.length ? `<button type="button" class="secondary-btn btn-3d" data-guide="${gi}">🧊 3Dで見る(指で回転)</button>` : ""}
      </div>`;
    }).join("");
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
      : `<p class="hint">まだ口コミがありません。使ってみた感想を残すと次回から表示されます。</p>`;

    $("station-sheet-body").innerHTML = `<div class="sheet-content">
      <h2>🚉 ${esc(name)}</h2>
      <p class="hint">${esc(lines)}</p>
      ${facHtml}
      ${navHtml}
      <div class="station-links">
        <a href="https://www.google.com/search?q=${encodeURIComponent(name + "駅 構内図 エレベーター")}" target="_blank" rel="noopener">🗺 構内図を検索</a>
        <a href="https://www.google.com/maps/search/${encodeURIComponent(name + "駅")}" target="_blank" rel="noopener">📍 地図</a>
        <a href="https://www.ecomo-rakuraku.jp/" target="_blank" rel="noopener">♿ らくらくおでかけネット</a>
      </div>
      <h3>💬 口コミ・メモ (${revs.length}件)</h3>
      ${revHtml}
      <h3>✏️ 口コミ・メモを追加</h3>
      <p class="hint">この端末のブラウザにのみ保存されます。</p>
      <div>🚻 トイレのきれいさ</div>
      <div class="star-input" data-kind="tc">${[1,2,3,4,5].map((i) => `<button type="button" data-v="${i}">★</button>`).join("")}</div>
      <div>🛗 ベビーカー移動のしやすさ</div>
      <div class="star-input" data-kind="ez">${[1,2,3,4,5].map((i) => `<button type="button" data-v="${i}">★</button>`).join("")}</div>
      <input type="text" id="rv-car" placeholder="号車メモ (例: 新宿方面は5号車付近がEV近い)">
      <textarea id="rv-text" placeholder="自由メモ (例: 南口EVは分かりにくい、◯◯のトイレがきれい 等)"></textarea>
      <button class="primary-btn" id="btn-add-review">保存する</button>
      <button class="secondary-btn" id="btn-close-station" style="width:100%;margin-top:8px;">閉じる</button>
    </div>`;

    // 星入力
    $("station-sheet-body").querySelectorAll(".star-input").forEach((box) => {
      box.addEventListener("click", (ev) => {
        const b = ev.target.closest("button[data-v]");
        if (!b) return;
        const kind = box.dataset.kind, v = Number(b.dataset.v);
        pendingStars[kind] = v;
        box.querySelectorAll("button").forEach((x) =>
          x.classList.toggle("on", Number(x.dataset.v) <= v));
      });
    });
    $("btn-add-review").addEventListener("click", addReview);
    $("btn-close-station").addEventListener("click", closeSheets);

    // 3D表示切替
    $("station-sheet-body").querySelectorAll(".btn-3d").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const block = btn.closest(".guide-block");
        const area = block.querySelector(".map-area");
        const guide = (f?.transferGuides || [])[Number(btn.dataset.guide)];
        if (btn.dataset.mode === "3d") {
          if (typeof Station3D !== "undefined") Station3D.disposeAll();
          renderStationSheet();
          return;
        }
        btn.disabled = true;
        btn.textContent = "3Dを読み込み中…";
        try {
          area.innerHTML = "";
          await Station3D.show(area, f, guide);
          btn.dataset.mode = "3d";
          btn.textContent = "📄 2Dの図に戻す";
        } catch (e) {
          area.innerHTML = `<p class="hint">3D表示に失敗しました(${esc(e.message)})。2D図をご利用ください。</p>`;
        }
        btn.disabled = false;
      });
    });
  }

  function addReview() {
    const car = $("rv-car").value.trim();
    const tx = $("rv-text").value.trim();
    if (!pendingStars.tc && !pendingStars.ez && !car && !tx) {
      alert("評価かメモを入力してください"); return;
    }
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

  // ---------- 設定 ----------
  function setupSettings() {
    $("btn-settings").addEventListener("click", () => {
      $("ekispert-key").value = localStorage.getItem(LS_EKISPERT) || "";
      $("settings-sheet").hidden = false;
      document.body.style.overflow = "hidden";
    });
    $("btn-save-key").addEventListener("click", () => {
      const v = $("ekispert-key").value.trim();
      if (v) localStorage.setItem(LS_EKISPERT, v);
      else localStorage.removeItem(LS_EKISPERT);
      alert("保存しました");
    });
    $("btn-close-settings").addEventListener("click", closeSheets);
    $("btn-export").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(loadReviews(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `babycar-reviews-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $("btn-import").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const cur = loadReviews();
        for (const [k, v] of Object.entries(data)) {
          cur[k] = [...(cur[k] || []), ...v];
        }
        saveReviews(cur);
        alert("インポートしました");
      } catch (e) {
        alert("インポートに失敗しました: " + e.message);
      }
      ev.target.value = "";
    });
  }

  // ---------- 起動 ----------
  function setup() {
    setupSuggest("from-input", "from-suggest");
    setupSuggest("to-input", "to-suggest");
    setupSettings();

    $("btn-swap").addEventListener("click", () => {
      const a = $("from-input").value;
      $("from-input").value = $("to-input").value;
      $("to-input").value = a;
    });

    $("btn-search").addEventListener("click", doSearch);
    $("to-input").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

    [$("station-sheet"), $("settings-sheet")].forEach((bd) => {
      bd.addEventListener("click", (ev) => { if (ev.target === bd) closeSheets(); });
    });

    boot();
  }

  function doSearch() {
    if (!ready) return;
    const fromName = resolveName($("from-input").value);
    const toName = resolveName($("to-input").value);
    if (!fromName || !toName) {
      $("results").innerHTML = `<p class="empty-note">出発駅・到着駅を候補から選んでください。</p>`;
      return;
    }
    $("from-input").value = fromName;
    $("to-input").value = toName;
    const { error, routes } = Router.search(fromName, toName);
    if (error) {
      $("results").innerHTML = `<p class="empty-note">${esc(error)}</p>`;
      return;
    }
    renderRoutes(fromName, toName, routes);
  }

  function resolveName(input) {
    const q = (input || "").trim();
    if (!q) return null;
    if (Router.stationByName(q)) return q;
    const sug = Router.suggest(q, 1);
    return sug.length ? sug[0].n : null;
  }

  document.addEventListener("DOMContentLoaded", setup);
})();
