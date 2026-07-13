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

  const FLOOR_W = 26, FLOOR_D = 11, FLOOR_T = 0.5, GAP = 4.2;
  const TRAIN_W = 20, CARS_DEF = 10;

  function floorYpos(i) { return -i * GAP; }
  function carX(car, cars) { return -TRAIN_W / 2 + (TRAIN_W / cars) * (car - 0.5); }

  function buildScene(fac, guide) {
    const floors = fac.floors;
    const idx = new Map(floors.map((f, i) => [f.id, i]));
    const scene = new THREE.Scene();

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(18, 30, 22);
    scene.add(dir);

    const slabMat = new THREE.MeshLambertMaterial({ color: 0xd7e3ee });
    const slabEdge = new THREE.LineBasicMaterial({ color: 0x90a4ae });

    floors.forEach((f, i) => {
      const y = floorYpos(i);
      const geo = new THREE.BoxGeometry(FLOOR_W, FLOOR_T, FLOOR_D);
      const mesh = new THREE.Mesh(geo, slabMat);
      mesh.position.set(0, y, 0);
      scene.add(mesh);
      scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), slabEdge).translateY(y));

      const label = textSprite(`${f.id} ${f.label}`, { size: 15 });
      label.position.set(-FLOOR_W / 2 - 1.2, y + 0.9, FLOOR_D / 2 + 0.6);
      label.center.set(0, 0.5);
      scene.add(label);

      if (f.toilet) {
        const t = textSprite("🚻", { size: 20, bg: "#e8f5e9" });
        t.position.set(FLOOR_W / 2 - 1.5, y + 1.5, FLOOR_D / 2 - 1.5);
        scene.add(t);
        const tl = textSprite(f.toilet, { size: 11, color: "#2e7d32" });
        tl.position.set(FLOOR_W / 2 - 1.5, y + 0.55, FLOOR_D / 2 - 0.2);
        tl.center.set(1, 0.5);
        scene.add(tl);
      }
    });

    // carステップと号車
    let carStep = null;
    for (const st of guide?.steps || []) if (st.type === "car") { carStep = st; break; }
    const cars = carStep?.cars || guide?.cars || CARS_DEF;
    const recCar = Number.isFinite(carStep?.carNo) ? carStep.carNo : null;

    // EVシャフト
    const shaftMat = new THREE.MeshLambertMaterial({ color: 0xffd54f, transparent: true, opacity: 0.62 });
    const shaftRecMat = new THREE.MeshLambertMaterial({ color: 0xffb300, transparent: true, opacity: 0.75 });
    let order = 0, fallbackX = -6, trainFloor = null, firstUnaligned = false;
    for (const st of guide?.steps || []) {
      if (st.type !== "elevator") continue;
      order++;
      const a = idx.get(st.fromFloor), b = idx.get(st.toFloor);
      if (a == null || b == null) continue;
      if (trainFloor == null) trainFloor = a;
      let x;
      const aligned = order === 1 && (Number.isFinite(st.atCar) || recCar);
      if (aligned) x = carX(st.atCar || recCar, cars);
      else { if (order === 1) firstUnaligned = true; x = fallbackX; fallbackX += 6; }
      const yA = floorYpos(Math.min(a, b)), yB = floorYpos(Math.max(a, b));
      const h = yA - yB + FLOOR_T;
      const geo = new THREE.BoxGeometry(2.4, h, 2.4);
      const mesh = new THREE.Mesh(geo, aligned ? shaftRecMat : shaftMat);
      mesh.position.set(x, (yA + yB) / 2, -1.5);
      scene.add(mesh);

      const badge = textSprite(String(order), { size: 15, color: "#ffffff", bg: "#26a69a" });
      badge.position.set(x - 1.8, yA + 1.6, -1.5);
      scene.add(badge);
      const ev = textSprite(st.name || "EV", { size: 11, color: "#795548" });
      ev.position.set(x, yB - 0.9, -0.2);
      scene.add(ev);
    }

    // 号車つき列車(最初のEVの乗り場階)
    if (trainFloor != null) {
      const y = floorYpos(trainFloor) + FLOOR_T / 2;
      const cw = TRAIN_W / cars;
      for (let i = 1; i <= cars; i++) {
        const rec = recCar === i;
        const geo = new THREE.BoxGeometry(cw * 0.86, 1.5, 2.2);
        const mat = new THREE.MeshLambertMaterial({ color: rec ? 0xfb8c00 : 0xeceff1 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(carX(i, cars), y + 0.85, 2.6);
        scene.add(mesh);
        const num = textSprite(String(i), { size: 10, color: rec ? "#ffffff" : "#78909c", bold: rec });
        num.position.set(carX(i, cars), y + 0.9, 3.9);
        scene.add(num);
      }
      if (carStep?.car || recCar) {
        const bx = recCar ? carX(recCar, cars)
          : /前/.test(carStep.car) ? carX(2, cars)
          : /後/.test(carStep.car) ? carX(cars - 1, cars) : 0;
        const baby = textSprite(`👶 ${carStep?.car || recCar + "号車"}`, { size: 14, color: "#e65100", bg: "#fff3e0" });
        baby.position.set(bx, y + 3.1, 2.6);
        scene.add(baby);
      }
      if (firstUnaligned) {
        const note = textSprite("※EV前の号車は未確認(メモ募集)", { size: 11, color: "#b26a00" });
        note.position.set(0, y + 4.6, 2.6);
        scene.add(note);
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
    const n = fac.floors.length;
    const midY = floorYpos((n - 1) / 2);
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
