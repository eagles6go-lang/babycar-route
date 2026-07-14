// three.js による回転できる3D駅マップ
// facilities.json の floors / transferGuides から立体模式図を組み立てる。
// three.js 本体はボタンが押された時に遅延読み込みする(vendor/three.min.js)。
"use strict";

const Station3D = (() => {
  const active = []; // {renderer, scene, controls, frame, container}

  function loadThree() {
    if (typeof THREE !== "undefined" && THREE.OrbitControls) return Promise.resolve();
    return Promise.reject(new Error("three.jsが読み込まれていません"));
  }

  // 文字スプライト(キャンバステクスチャ)
  function textSprite(text, { size = 24, color = "#37474f", bg = null, bold = true } = {}) {
    const pad = 8;
    const cv = document.createElement("canvas");
    const ctx = cv.getContext("2d");
    const font = `${bold ? "700" : "400"} ${size * 2}px "Hiragino Sans","Yu Gothic UI",sans-serif`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    const h = size * 2 + pad * 2;
    cv.width = w; cv.height = h;
    const c2 = cv.getContext("2d");
    if (bg) {
      c2.fillStyle = bg;
      const r = h / 2;
      c2.beginPath();
      c2.moveTo(r, 0); c2.lineTo(w - r, 0); c2.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2);
      c2.lineTo(r, h); c2.arc(r, r, r, Math.PI / 2, -Math.PI / 2);
      c2.fill();
    } else {
      c2.strokeStyle = "rgba(248,250,252,.9)";
      c2.lineWidth = 6;
      c2.font = font; c2.textBaseline = "middle";
      c2.strokeText(text, pad, h / 2);
    }
    c2.font = font; c2.textBaseline = "middle";
    c2.fillStyle = color;
    c2.fillText(text, pad, h / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    const scale = 0.014 * size;
    sp.scale.set((w / h) * scale, scale, 1);
    return sp;
  }

  const FLOOR_W = 30, FLOOR_D = 11, FLOOR_T = 0.5, GAP = 4.6;
  const CARS_DEF = 10;

  // フロアの水平配置(x,w は0-1)をワールド座標に変換
  const wx = (rel) => -FLOOR_W / 2 + rel * FLOOR_W;

  function buildScene(fac, guide) {
    const floors = fac.floors;
    const scene = new THREE.Scene();

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(18, 30, 22);
    scene.add(dir);

    const slabMat = new THREE.MeshLambertMaterial({ color: 0xd7e3ee });
    const slabEdge = new THREE.LineBasicMaterial({ color: 0x90a4ae });

    // 同じlevelが連続するフロアは同じ高さに並べる
    const rowOf = new Map(), floorOf = new Map();
    let row = -1, prevLevel = null;
    for (const f of floors) {
      const level = f.level || f.id;
      if (level !== prevLevel) { row++; prevLevel = level; }
      rowOf.set(f.id, row);
      floorOf.set(f.id, f);
    }
    const rowYpos = (r) => -r * GAP;

    const labeledRows = new Set();
    for (const f of floors) {
      const r = rowOf.get(f.id);
      const y = rowYpos(r);
      const fw = (f.w ?? 1) * FLOOR_W;
      const cx = wx(f.x ?? 0) + fw / 2;
      const geo = new THREE.BoxGeometry(fw, FLOOR_T, FLOOR_D);
      const mesh = new THREE.Mesh(geo, slabMat);
      mesh.position.set(cx, y, 0);
      scene.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), slabEdge);
      edges.position.set(cx, y, 0);
      scene.add(edges);

      const labelText = labeledRows.has(r) ? f.label : `${f.level || f.id} ${f.label}`;
      labeledRows.add(r);
      const label = textSprite(labelText, { size: 14 });
      label.position.set(cx - fw / 2, y + 0.9, FLOOR_D / 2 + 0.6);
      label.center.set(0, 0.5);
      scene.add(label);

      if (f.toilet) {
        const t = textSprite("🚻", { size: 18, bg: "#e8f5e9" });
        t.position.set(cx + fw / 2 - 1.5, y + 1.5, FLOOR_D / 2 - 1.5);
        scene.add(t);
        const tl = textSprite(f.toilet, { size: 10, color: "#2e7d32" });
        tl.position.set(cx + fw / 2 - 1.5, y + 0.5, FLOOR_D / 2 - 0.2);
        tl.center.set(1, 0.5);
        scene.add(tl);
      }
    }

    // carステップと号車
    let carStep = null;
    for (const st of guide?.steps || []) if (st.type === "car") { carStep = st; break; }
    const cars = carStep?.cars || guide?.cars || CARS_DEF;
    const recCar = Number.isFinite(carStep?.carNo) ? carStep.carNo : null;

    const shaftMat = new THREE.MeshLambertMaterial({ color: 0xffd54f, transparent: true, opacity: 0.62 });
    const shaftRecMat = new THREE.MeshLambertMaterial({ color: 0xffb300, transparent: true, opacity: 0.75 });
    const walkMat = new THREE.MeshLambertMaterial({ color: 0x26a69a });

    // 徒歩のドット経路(床上・Situm風)。pathPts({x, d})で曲がり角を表現
    const dotGeo = new THREE.SphereGeometry(0.32, 10, 10);
    function addWalkDots(r, x1, x2, pathPts) {
      const y = rowYpos(r) + FLOOR_T / 2 + 0.4;
      const zOf = (d) => ((d ?? 0.5) - 0.5) * FLOOR_D * 0.8;
      const pts = [{ x: x1, z: 0 }];
      if (pathPts) for (const p of pathPts) pts.push({ x: wx(p.x), z: zOf(p.d) });
      pts.push({ x: x2, z: 0 });
      if (!pathPts && Math.abs(x2 - x1) < 1.6) return;
      // 線分に沿って一定間隔でドットを置く
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.round(len / 0.95));
        for (let k = i === 0 ? 0 : 1; k <= n; k++) {
          const t = k / n;
          const dot = new THREE.Mesh(dotGeo, walkMat);
          dot.position.set(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t);
          scene.add(dot);
        }
      }
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      const ang = Math.atan2(last.x - prev.x, last.z - prev.z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 12), walkMat);
      cone.rotation.set(Math.PI / 2 * Math.cos(ang) * 0, 0, -Math.sign(last.x - prev.x) * Math.PI / 2);
      cone.position.set(last.x, y, last.z);
      scene.add(cone);
      const mid = pts[Math.floor(pts.length / 2)];
      const w = textSprite("🚶", { size: 14 });
      w.position.set(mid.x, y + 1.3, mid.z + 0.3);
      scene.add(w);
    }

    // ステップを順に追い、現在位置を更新しながら経路を組み立てる
    let order = 0, fallbackRel = 0.25, curX = null, curRow = null;
    let trainDrawn = false, firstUnaligned = false, pendingWalk = null;
    const trainCarX = (pf, i) => {
      const fw = (pf.w ?? 1) * FLOOR_W;
      const x0 = wx(pf.x ?? 0) + 1.2;
      const tw = fw - 2.4;
      return x0 + (tw / cars) * (i - 0.5);
    };

    for (const st of guide?.steps || []) {
      if (st.type === "walk") { pendingWalk = st; continue; }
      if (st.type !== "elevator") continue;
      order++;
      const a = rowOf.get(st.fromFloor), b = rowOf.get(st.toFloor);
      if (a == null || b == null) continue;

      if (!trainDrawn) {
        const pf = floorOf.get(st.fromFloor);
        const y = rowYpos(a) + FLOOR_T / 2;
        const fw = (pf.w ?? 1) * FLOOR_W;
        const x0 = wx(pf.x ?? 0) + 1.2;
        const tw = fw - 2.4;
        const cw = tw / cars;
        for (let i = 1; i <= cars; i++) {
          const rec = recCar === i;
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(cw * 0.86, 1.4, 2.1),
            new THREE.MeshLambertMaterial({ color: rec ? 0xfb8c00 : 0xeceff1 }));
          mesh.position.set(x0 + cw * (i - 0.5), y + 0.8, 2.7);
          scene.add(mesh);
          const num = textSprite(String(i), { size: 9, color: rec ? "#ffffff" : "#78909c", bold: rec });
          num.position.set(x0 + cw * (i - 0.5), y + 0.85, 3.9);
          scene.add(num);
        }
        if (carStep?.car || recCar) {
          const bx = recCar ? trainCarX(pf, recCar)
            : /前/.test(carStep?.car || "") ? trainCarX(pf, 2)
            : /後/.test(carStep?.car || "") ? trainCarX(pf, cars - 1) : x0 + tw / 2;
          const baby = textSprite(`👶 ${carStep?.car || recCar + "号車"}`, { size: 13, color: "#e65100", bg: "#fff3e0" });
          baby.position.set(bx, y + 3.0, 2.7);
          scene.add(baby);
          curX = bx;
        } else {
          curX = x0 + tw / 2;
        }
        if (!carStep || (!Number.isFinite(st.atCar) && !recCar)) firstUnaligned = true;
        if (firstUnaligned) {
          const note = textSprite("※EV前の号車は未確認(メモ募集)", { size: 10, color: "#b26a00" });
          note.position.set(wx(0.35), y + 4.6, 2.7);
          scene.add(note);
        }
        curRow = a;
        trainDrawn = true;
      }

      let x;
      const aligned = Number.isFinite(st.x);
      if (aligned) x = wx(st.x);
      else if (order === 1 && Number.isFinite(st.atCar)) x = curX;
      else { x = wx(fallbackRel); fallbackRel += 0.2; if (fallbackRel > 0.92) fallbackRel = 0.2; }

      if (curX != null && curRow != null) addWalkDots(curRow, curX, x, pendingWalk?.path);
      pendingWalk = null;

      const yA = rowYpos(Math.min(a, b)), yB = rowYpos(Math.max(a, b));
      const h = yA - yB + FLOOR_T;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 2.4),
        Number.isFinite(st.x) || (order === 1 && Number.isFinite(st.atCar)) ? shaftRecMat : shaftMat);
      mesh.position.set(x, (yA + yB) / 2, -1.5);
      scene.add(mesh);

      const badge = textSprite(String(order), { size: 15, color: "#ffffff", bg: "#26a69a" });
      badge.position.set(x - 1.8, yA + 1.6, -1.5);
      scene.add(badge);
      const ev = textSprite(st.name || "EV", { size: 10, color: "#795548" });
      ev.position.set(x, yB - 0.9, -0.2);
      scene.add(ev);

      curX = x;
      curRow = b;
    }
    if (pendingWalk && curX != null && curRow != null) {
      addWalkDots(curRow, curX, curX < 0 ? wx(0.85) : wx(0.12), pendingWalk.path);
    }

    // 床上マーカー(改札など)
    const markMat = new THREE.MeshLambertMaterial({ color: 0x5c6bc0 });
    for (const f of floors) {
      const r = rowOf.get(f.id);
      for (const m of f.marks || []) {
        const y = rowYpos(r) + FLOOR_T / 2;
        const zz = ((m.d ?? 0.35) - 0.5) * FLOOR_D * 0.8;
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10), markMat);
        pin.position.set(wx(m.x), y + 0.45, zz);
        scene.add(pin);
        if (m.label) {
          const lb = textSprite(m.label, { size: 10, color: "#3f51b5" });
          lb.position.set(wx(m.x), y + 1.7, zz);
          scene.add(lb);
        }
      }
    }
    return scene;
  }

  function mount(container, fac, guide) {
    const w = container.clientWidth || 320;
    const h = 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);

    const scene = buildScene(fac, guide);
    // 行数(同じlevelの連続は1行)からカメラ中心を決める
    let rows = 0, prevLevel = null;
    for (const f of fac.floors) {
      const level = f.level || f.id;
      if (level !== prevLevel) { rows++; prevLevel = level; }
    }
    const midY = -((rows - 1) / 2) * GAP;
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 400);
    camera.position.set(26, midY + 16, 34);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, midY, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 14;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI * 0.6;
    controls.update();

    const state = { renderer, scene, controls, container, frame: 0 };
    const loop = () => {
      state.frame = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    active.push(state);
    return state;
  }

  function disposeAll() {
    for (const s of active) {
      cancelAnimationFrame(s.frame);
      s.controls.dispose();
      s.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      s.renderer.dispose();
      s.renderer.forceContextLoss?.();
      s.renderer.domElement.remove();
    }
    active.length = 0;
  }

  async function show(container, fac, guide) {
    await loadThree();
    return mount(container, fac, guide);
  }

  return { show, disposeAll };
})();
