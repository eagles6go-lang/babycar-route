// ベビーカー向けルート検索エンジン
// (駅, 路線) を状態としたダイクストラ法。乗換にペナルティを課し、
// 駅のバリアフリー度(エレベーター等)でペナルティを増減する。
"use strict";

const Router = (() => {
  let net = null;            // network.json
  let stationByCode = new Map();
  let stationsByName = new Map(); // name -> station
  let lineByCode = new Map();
  let adj = new Map();       // stationCode -> [{to, line, time}]  line=0 は徒歩連絡
  let facilities = {};       // 駅名 -> 施設情報
  let reviewsProvider = null; // 駅名 -> 口コミ配列を返す関数
  let expressLines = new Set(); // 特急券が必要な路線コード

  const WALK = 0;

  // 「押上（スカイツリー前）」「明治神宮前〈原宿〉」「浅草(つくばエクスプレス)」等の
  // 付記を除いた正規化名。施設データ・徒歩連絡・検索入力の照合に使う。
  function normName(name) {
    return String(name).replace(/[（(〈].*?[）)〉]/g, "").trim();
  }

  function haversineKm(a, b) {
    const R = 6371, d2r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function addEdge(from, to, line, time) {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, line, time });
  }

  function init(network, walkTransfers, facilityData, getReviews) {
    net = network;
    facilities = facilityData || {};
    reviewsProvider = getReviews || (() => []);
    stationByCode = new Map(net.stations.map((s) => [s.c, s]));
    lineByCode = new Map(net.lines.map((l) => [l.c, l]));
    adj = new Map();

    // 路線数(主要度)を数えてから、正式名とエイリアス(正規化名)を登録する
    const lineCount = new Map();
    for (const l of net.lines) for (const c of l.s) lineCount.set(c, (lineCount.get(c) || 0) + 1);
    stationsByName = new Map();
    for (const s of net.stations) stationsByName.set(s.n, s);
    for (const s of net.stations) {
      const alias = normName(s.n);
      if (alias === s.n) continue;
      const cur = stationsByName.get(alias);
      if (cur && cur.n === alias) continue; // 正式名がその名前の駅を優先
      if (!cur || (lineCount.get(s.c) || 0) > (lineCount.get(cur.c) || 0)) {
        stationsByName.set(alias, s);
      }
    }

    // 特急券が必要な路線(オプションで利用可)
    const EXPRESS = /新幹線|成田エクスプレス|スカイライナー/;
    expressLines = new Set(net.lines.filter((l) => EXPRESS.test(l.n)).map((l) => l.c));
    for (const line of net.lines) {
      const isExp = expressLines.has(line.c);
      for (let i = 0; i + 1 < line.s.length; i++) {
        const a = stationByCode.get(line.s[i]);
        const b = stationByCode.get(line.s[i + 1]);
        if (!a || !b) continue;
        const km = haversineKm(a, b);
        if (km > (isExp ? 170 : 60)) continue; // 異常な飛び区間は接続しない
        const t = isExp
          ? Math.max(3, km / 3.4 + 1)          // 新幹線 約200km/h + 停車
          : Math.max(1.4, km / 0.75 + 0.6);    // 在来線 約45km/h + 停車
        addEdge(a.c, b.c, line.c, t);
        addEdge(b.c, a.c, line.c, t);
      }
    }
    // 徒歩連絡: 同名駅が全国にあるため(例: 三田は東京と兵庫)、
    // 名前に合致する候補の中から最も近いペアを選び、2km超は誤マッチとして捨てる
    const candidates = new Map(); // 正規化名 -> station[]
    for (const s of net.stations) {
      for (const key of new Set([s.n, normName(s.n)])) {
        if (!candidates.has(key)) candidates.set(key, []);
        candidates.get(key).push(s);
      }
    }
    for (const p of (walkTransfers?.pairs || [])) {
      const as = candidates.get(p.a) || [], bs = candidates.get(p.b) || [];
      let best = null, bestKm = Infinity;
      for (const a of as) for (const b of bs) {
        if (a.c === b.c) continue;
        const km = haversineKm(a, b);
        if (km < bestKm) { bestKm = km; best = [a, b]; }
      }
      if (!best || bestKm > 2) continue;
      addEdge(best[0].c, best[1].c, WALK, p.minutes);
      addEdge(best[1].c, best[0].c, WALK, p.minutes);
    }
  }

  // 駅のバリアフリー度: 1=楽そう 0=不明 -1=注意
  function easeLevel(name) {
    const f = facilities[normName(name)] || facilities[name];
    if (!f) return 0;
    if (f.elevator && f.elevator.available === false) return -1;
    if (f.elevator) return 1;
    return 0;
  }

  // 乗換ペナルティ係数
  function transferFactor(name) {
    const lv = easeLevel(name);
    return lv > 0 ? 0.75 : lv < 0 ? 1.4 : 1.0;
  }

  class Heap {
    constructor() { this.a = []; }
    push(x) {
      const a = this.a; a.push(x);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].d <= a[i].d) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l].d < a[m].d) m = l;
          if (r < a.length && a[r].d < a[m].d) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    }
    get size() { return this.a.length; }
  }

  // (駅,路線)状態のダイクストラ。penalty=乗換基本ペナルティ(分)
  function dijkstra(fromCode, toCode, penalty, boardCost, useExpress) {
    const dist = new Map(), prev = new Map();
    const key = (s, l) => s * 100000 + l;
    const heap = new Heap();
    const k0 = key(fromCode, WALK);
    dist.set(k0, 0);
    heap.push({ d: 0, s: fromCode, l: WALK });

    while (heap.size) {
      const cur = heap.pop();
      const ck = key(cur.s, cur.l);
      if (cur.d > (dist.get(ck) ?? Infinity)) continue;
      if (cur.s === toCode) {
        // 到着(どの路線で着いてもよい)
        return reconstruct(prev, ck, fromCode);
      }
      const st = stationByCode.get(cur.s);
      for (const e of adj.get(cur.s) || []) {
        if (!useExpress && expressLines.has(e.line)) continue;
        let cost = e.time;
        let transferred = false;
        if (e.line !== cur.l) {
          transferred = true;
          if (e.line === WALK) {
            cost += 2; // 徒歩連絡への出場
          } else if (cur.l === WALK && cur.s === fromCode) {
            cost += boardCost; // 出発駅での乗車
          } else {
            cost += penalty * transferFactor(st.n);
          }
        }
        const nk = key(e.to, e.line);
        const nd = cur.d + cost;
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          prev.set(nk, { pk: ck, s: cur.s, l: e.line, to: e.to, time: e.time, transferred });
          heap.push({ d: nd, s: e.to, l: e.line });
        }
      }
    }
    return null;
  }

  function reconstruct(prev, endKey, fromCode) {
    const steps = [];
    let k = endKey;
    while (prev.has(k)) {
      const p = prev.get(k);
      steps.unshift({ from: p.s, to: p.to, line: p.l, time: p.time });
      k = p.pk;
    }
    if (!steps.length) return null;
    // 連続する同一路線をレッグにまとめる
    const legs = [];
    for (const st of steps) {
      const last = legs[legs.length - 1];
      if (last && last.line === st.line) {
        last.stations.push(st.to);
        last.time += st.time;
      } else {
        legs.push({ line: st.line, stations: [st.from, st.to], time: st.time });
      }
    }
    return { legs, fromCode };
  }

  function summarize(path) {
    if (!path) return null;
    const legs = path.legs.map((leg) => {
      const line = leg.line === WALK ? null : lineByCode.get(leg.line);
      return {
        isWalk: leg.line === WALK,
        lineCode: leg.line,
        lineName: line ? line.n : "徒歩",
        lineColor: line ? line.col : "#9aa0a6",
        stations: leg.stations.map((c) => stationByCode.get(c)),
        stops: leg.stations.length - 1,
        time: Math.round(leg.time),
      };
    });
    const rideTime = legs.reduce((a, l) => a + l.time, 0);
    const transfers = legs.length - 1;
    // 乗換1回あたりベビーカー移動 約7分を目安に加算
    const est = Math.round(rideTime + transfers * 7);
    // 乗換駅リスト(発駅・着駅も施設表示対象)
    const points = [];
    legs.forEach((leg, i) => {
      if (i === 0) points.push({ station: leg.stations[0], kind: "start" });
      const last = leg.stations[leg.stations.length - 1];
      points.push({ station: last, kind: i === legs.length - 1 ? "goal" : "transfer" });
    });
    // 楽さスコア: 乗換ポイントの施設充実度
    let known = 0, good = 0, bad = 0;
    for (const p of points) {
      const lv = easeLevel(p.station.n);
      if (lv !== 0) known++;
      if (lv > 0) good++;
      if (lv < 0) bad++;
    }
    const easeScore = bad > 0 ? "C" : transfers === 0 ? "A" :
      good >= Math.max(1, points.length - 1) ? "A" : good > 0 ? "B" : "B";
    return { legs, transfers, est, points, easeScore,
      signature: legs.map((l) => `${l.lineCode}:${l.stations[l.stations.length - 1].c}`).join(">") };
  }

  function search(fromName, toName, opts = {}) {
    const from = stationsByName.get(fromName);
    const to = stationsByName.get(toName);
    if (!from || !to) return { error: "駅が見つかりません", routes: [] };
    if (from.c === to.c) return { error: "出発駅と到着駅が同じです", routes: [] };
    const useExpress = !!opts.useExpress;

    const configs = [
      { label: "バランス", penalty: 8, boardCost: 3 },
      { label: "乗換少なめ(楽さ優先)", penalty: 18, boardCost: 3 },
      { label: "移動時間優先", penalty: 4, boardCost: 2 },
    ];
    const routes = [];
    const seen = new Set();
    for (const cfg of configs) {
      const path = dijkstra(from.c, to.c, cfg.penalty, cfg.boardCost, useExpress);
      const sum = summarize(path);
      if (!sum) continue;
      if (seen.has(sum.signature)) continue;
      seen.add(sum.signature);
      sum.label = cfg.label;
      routes.push(sum);
    }
    // 楽さ優先(乗換少・スコア高)順に並べる
    routes.sort((a, b) => (a.transfers - b.transfers) || (a.est - b.est));
    return { error: null, routes };
  }

  function suggest(query, limit = 8) {
    if (!query) return [];
    const q = query.trim();
    const res = [];
    for (const s of net.stations) {
      if (s.n.startsWith(q) || s.k.startsWith(q) || normName(s.n).startsWith(q)) res.push(s);
      if (res.length >= limit * 3) break;
    }
    // 前方一致を優先し、路線数が多い駅(主要駅)を上に
    res.sort((a, b) => {
      const ax = a.n === q ? 0 : 1, bx = b.n === q ? 0 : 1;
      if (ax !== bx) return ax - bx;
      return linesOf(b).length - linesOf(a).length;
    });
    return res.slice(0, limit);
  }

  function linesOf(station) {
    return net.lines.filter((l) => l.s.includes(station.c));
  }

  return { init, search, suggest, linesOf, easeLevel, normName,
    get stations() { return net ? net.stations : []; },
    stationByName: (n) => stationsByName.get(n) };
})();
