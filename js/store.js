// ベビーカーナビ ローカルデータ基盤
// 要件定義書 7章(プロフィール) / 8章(履歴・お気に入り・よく使う駅) に対応。
// MVP段階は端末内(localStorage)保存。将来はバックエンドAPIに差し替える前提で
// このモジュールにデータアクセスを集約する。
"use strict";

const Store = (() => {
  const K = {
    profile: "bn_profile_v1",
    history: "bn_history_v1",
    favRoutes: "bn_fav_routes_v1",
    favStations: "bn_fav_stations_v1",
    pinned: "bn_pinned_stations_v1",
    hidden: "bn_hidden_stations_v1",
    reviews: "bcr_reviews_v1",      // 既存の口コミデータを継続利用
    ekispert: "bcr_ekispert_key",
    useExpress: "bcr_use_express",
  };

  const load = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const save = (key, v) => localStorage.setItem(key, JSON.stringify(v));

  // ---------- 利用者プロフィール(7.1) ----------
  const PROFILE_DEFAULT = {
    stroller: "single",     // single | twin | large | compact
    adults: "1",            // 1 | 2
    stairs: "avoid",        // avoid | some
    walk: "normal",         // short | normal | long
    crowd: "normal",        // avoid | normal
    toilet: "prefer",       // must | prefer | none
    policy: "ease",         // ease(負担最少) | fewer(乗換最少) | fast(時間優先)
  };
  const getProfile = () => ({ ...PROFILE_DEFAULT, ...load(K.profile, {}) });
  const setProfile = (p) => save(K.profile, { ...getProfile(), ...p });

  // ---------- 検索履歴(8.1) ----------
  function addHistory(entry) {
    const h = load(K.history, []);
    // 同一区間は最新のみ残す
    const filtered = h.filter((x) => !(x.from === entry.from && x.to === entry.to && x.via === entry.via));
    filtered.unshift({ ...entry, at: new Date().toISOString() });
    save(K.history, filtered.slice(0, 50));
  }
  const getHistory = () => load(K.history, []);
  function removeHistory(idx) {
    const h = load(K.history, []);
    h.splice(idx, 1);
    save(K.history, h);
  }
  const clearHistory = () => save(K.history, []);

  // ---------- お気に入り(8.5) ----------
  const getFavRoutes = () => load(K.favRoutes, []);
  function toggleFavRoute(r) {
    const favs = getFavRoutes();
    const i = favs.findIndex((x) => x.from === r.from && x.to === r.to && x.via === r.via);
    if (i >= 0) favs.splice(i, 1);
    else favs.unshift({ ...r, at: new Date().toISOString() });
    save(K.favRoutes, favs.slice(0, 30));
    return i < 0;
  }
  const isFavRoute = (r) => getFavRoutes().some((x) => x.from === r.from && x.to === r.to && x.via === r.via);

  const getFavStations = () => load(K.favStations, []);
  function toggleFavStation(name) {
    const favs = getFavStations();
    const i = favs.indexOf(name);
    if (i >= 0) favs.splice(i, 1); else favs.unshift(name);
    save(K.favStations, favs.slice(0, 30));
    return i < 0;
  }
  const isFavStation = (name) => getFavStations().includes(name);

  // ---------- よく使う駅(8.3): 検索回数×新しさで採点 ----------
  function frequentStations(limit = 6) {
    const h = getHistory();
    const pinned = load(K.pinned, []);
    const hiddenSet = new Set(load(K.hidden, []));
    const score = new Map();
    const now = Date.now();
    h.forEach((e) => {
      const age = (now - new Date(e.at).getTime()) / 86400000; // 日
      const w = Math.max(0.2, 1 - age / 60);                    // 60日で減衰
      for (const s of [e.from, e.to]) {
        if (!s) continue;
        score.set(s, (score.get(s) || 0) + w);
      }
    });
    for (const p of pinned) score.set(p, (score.get(p) || 0) + 100);
    return [...score.entries()]
      .filter(([n]) => !hiddenSet.has(n))
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([n]) => n);
  }
  const getPinned = () => load(K.pinned, []);
  function togglePinned(name) {
    const p = load(K.pinned, []);
    const i = p.indexOf(name);
    if (i >= 0) p.splice(i, 1); else p.unshift(name);
    save(K.pinned, p.slice(0, 10));
    return i < 0;
  }
  function hideStation(name) {
    const hd = load(K.hidden, []);
    if (!hd.includes(name)) { hd.push(name); save(K.hidden, hd); }
  }

  // ---------- 全データ管理(15.2) ----------
  function exportAll() {
    const out = {};
    for (const key of Object.values(K)) {
      const v = localStorage.getItem(key);
      if (v != null) out[key] = v;
    }
    return JSON.stringify(out, null, 2);
  }
  function importAll(json) {
    const data = JSON.parse(json);
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  }
  function wipeAll() {
    for (const key of Object.values(K)) localStorage.removeItem(key);
  }

  return {
    K, getProfile, setProfile,
    addHistory, getHistory, removeHistory, clearHistory,
    getFavRoutes, toggleFavRoute, isFavRoute,
    getFavStations, toggleFavStation, isFavStation,
    frequentStations, getPinned, togglePinned, hideStation,
    exportAll, importAll, wipeAll,
  };
})();
