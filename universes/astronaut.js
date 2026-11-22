/* The Astronaut's Universe: one big, colorful space scene made only by code.
   Drag to look around, pinch to zoom, tap a planet, star or the black hole to fly to it. */
(function () {
  const T = THREE;
  let built = false, R, cam, S, raf = 0, last = 0, time = 0;
  const bodies = [];

  // ---------- page parts ----------
  const css = document.createElement("style");
  css.textContent =
    "#auWrap{position:fixed;inset:0;z-index:9000;display:none;background:#000;font-family:-apple-system,system-ui,sans-serif;color:#eef3ff}" +
    "#auWrap canvas{display:block;width:100%;height:100%;touch-action:none}" +
    "#auBar{position:absolute;top:max(14px,env(safe-area-inset-top));left:14px;right:14px;display:flex;justify-content:space-between;pointer-events:none}" +
    "#auBar button{pointer-events:auto;background:rgba(15,22,48,.55);color:#eef3ff;border:1px solid rgba(150,180,255,.35);border-radius:999px;padding:9px 16px;font:600 14px -apple-system,system-ui,sans-serif;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}" +
    "#auHint{position:absolute;left:0;right:0;bottom:max(20px,env(safe-area-inset-bottom));text-align:center;font-size:14px;opacity:.75;pointer-events:none;padding:0 20px}" +
    "#auCard{position:absolute;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translate(-50%,20px);width:min(420px,88vw);padding:14px 18px;border-radius:18px;background:rgba(12,18,42,.7);border:1px solid rgba(150,180,255,.3);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);opacity:0;transition:opacity .5s,transform .5s;pointer-events:none}" +
    "#auCard.on{opacity:1;transform:translate(-50%,0)}#auCard b{display:block;font-size:19px;margin-bottom:4px}#auCard small{display:block;font-size:11px;letter-spacing:.2em;text-transform:uppercase;opacity:.6;margin-bottom:6px}#auCard p{margin:0;font-size:14px;line-height:1.45;opacity:.9}" +
    "#auTitle{position:absolute;left:0;right:0;top:34%;text-align:center;pointer-events:none;opacity:0;transition:opacity 1.2s;text-shadow:0 2px 14px rgba(0,0,0,.7)}#auTitle span{font-size:12px;letter-spacing:.3em;text-transform:uppercase;opacity:.75}#auTitle b{display:block;font-size:32px;margin-top:6px}" +
    "#auFlash{position:fixed;inset:0;z-index:9001;background:#eaf2ff;opacity:0;pointer-events:none;transition:opacity .45s}";
  document.head.appendChild(css);
  const wrap = document.createElement("div"); wrap.id = "auWrap";
  wrap.innerHTML = '<div id="auBar"><button id="auBack" type="button">← Back to brain</button><button id="auHome" type="button">Overview</button></div>' +
    '<div id="auHint">Drag to look around · tap the donut</div><div id="auCard"><small></small><b></b><p></p></div>' +
    '<div id="auTitle"><span>Universe of the</span><b>Astronaut</b></div>';
  const flash = document.createElement("div"); flash.id = "auFlash";
  document.body.append(wrap, flash);
  const q = (s) => wrap.querySelector(s);

  // ---------- helpers ----------
  const gcv = document.createElement("canvas"); gcv.width = gcv.height = 128; const gx = gcv.getContext("2d");
  const gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64); gg.addColorStop(0, "rgba(255,255,255,1)"); gg.addColorStop(0.3, "rgba(255,255,255,.5)"); gg.addColorStop(1, "rgba(255,255,255,0)");
  gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
  const GLOW = new T.CanvasTexture(gcv);
  const glow = (color, size, op) => { const s = new T.Sprite(new T.SpriteMaterial({ map: GLOW, color: color, transparent: true, opacity: op === undefined ? 1 : op, blending: T.AdditiveBlending, depthWrite: false })); s.scale.setScalar(size); return s; };
  function paint(geo, fn) {
    const p = geo.attributes.position, c = new Float32Array(p.count * 3), col = new T.Color(), v = new T.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); fn(v, col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    geo.setAttribute("color", new T.BufferAttribute(c, 3)); return geo;
  }
  const atmos = (r, color, power) => new T.Mesh(new T.SphereGeometry(r, 48, 32), new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { c: { value: new T.Color(color) }, k: { value: power || 3 } },
    vertexShader: "varying vec3 n,v;void main(){n=normalize(normalMatrix*normal);vec4 m=modelViewMatrix*vec4(position,1.);v=normalize(-m.xyz);gl_Position=projectionMatrix*m;}",
    fragmentShader: "uniform vec3 c;uniform float k;varying vec3 n,v;void main(){float f=pow(1.-abs(dot(n,v)),k);gl_FragColor=vec4(c*f*1.6,f);}"
  }));
  function addBody(name, kind, fact, obj, r) {
    const hit = new T.Mesh(new T.SphereGeometry(Math.max(r * 1.3, 10), 10, 8), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    S.add(hit); bodies.push({ name, kind, fact, obj, r, hit });
  }
  function pts(n, fill, size, extra) {
    const p = new Float32Array(n * 3), c = new Float32Array(n * 3), col = new T.Color(), v = new T.Vector3();
    for (let i = 0; i < n; i++) { fill(i, v, col); p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z; c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(p, 3)); g.setAttribute("color", new T.BufferAttribute(c, 3));
    return new T.Points(g, new T.PointsMaterial(Object.assign({ size: size, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, map: GLOW }, extra || {})));
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- build the universe once ----------
  let planet;
  function build() {
    built = true;
    R = new T.WebGLRenderer({ antialias: true }); R.setPixelRatio(Math.min(devicePixelRatio, 2));
    wrap.insertBefore(R.domElement, wrap.firstChild);
    cam = new T.PerspectiveCamera(55, 1, 0.5, 4000);
    S = new T.Scene();

    // deep blue sky
    S.add(new T.Mesh(new T.SphereGeometry(2000, 32, 16), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false,
      vertexShader: "varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "varying vec3 p;void main(){float h=p.y*.5+.5;gl_FragColor=vec4(mix(vec3(.02,.06,.22),vec3(.10,.30,.62),pow(h,1.4)),1.);}" })));
    S.add(new T.AmbientLight(0xffffff, 0.75));
    const dl = new T.DirectionalLight(0xffffff, 0.9); dl.position.set(-0.5, 1, 0.6); S.add(dl);

    // glowing bubbles drifting in the background
    const bub = new T.Group(); S.add(bub); S.userData.bub = bub;
    const BC = [0x7fd4ff, 0xff8fc8, 0xb79bff, 0x8ff0e0, 0xfff1a8];
    for (let i = 0; i < 70; i++) { const g = glow(BC[i % 5], rnd(20, 90), rnd(0.25, 0.6)); g.position.set(rnd(-700, 700), rnd(-400, 400), rnd(-700, 700)); if (g.position.length() < 220) g.position.setLength(260); g.userData.ph = rnd(0, 6.3); bub.add(g); }

    // the donut planet with a ring of rainbow sprinkles
    planet = new T.Group(); S.add(planet);
    const RR = 30, rr = 14;
    const dg = new T.TorusGeometry(RR, rr, 64, 128); dg.rotateX(-Math.PI / 2);
    { const p = dg.attributes.position, n = dg.attributes.normal, c = new Float32Array(p.count * 3); const ic = new T.Color();
      for (let i = 0; i < p.count; i++) {
        const ny = n.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), drip = 0.12 * Math.sin(a * 9) + 0.08 * Math.sin(a * 23 + 1);
        if (ny > -0.15 + drip) { ic.setRGB(1, 0.36, 0.66); c[i * 3] = ic.r; c[i * 3 + 1] = ic.g; c[i * 3 + 2] = ic.b; }   // pink glaze, all one pink
        else { const b = 0.75 + 0.25 * Math.max(0, -ny); c[i * 3] = 0.86 * b; c[i * 3 + 1] = 0.58 * b; c[i * 3 + 2] = 0.3 * b; }   // golden dough
      }
      dg.setAttribute("color", new T.BufferAttribute(c, 3)); }
    planet.add(new T.Mesh(dg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 })));
    const SPR = [0xff4d6d, 0xffd23f, 0x3fa9ff, 0x4be37a, 0xff8c2a, 0xa66bff, 0xffffff, 0x2ee6d6];
    const sprGeo = new T.CylinderGeometry(0.35, 0.35, 2.2, 6);
    const icing = new T.InstancedMesh(sprGeo, new T.MeshStandardMaterial({ roughness: 0.4 }), 900);
    const starShape = new T.Shape(); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283 + 1.571, r = k % 2 ? 0.5 : 1.2; if (k) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const starGeo = new T.ExtrudeGeometry(starShape, { depth: 0.45, bevelEnabled: false }); starGeo.center();
    const ring = new T.InstancedMesh(starGeo, new T.MeshStandardMaterial({ roughness: 0.4, emissive: 0x222222 }), 1500);
    const m4 = new T.Matrix4(), qt = new T.Quaternion(), UPV = new T.Vector3(0, 1, 0), nv = new T.Vector3(), tv = new T.Vector3(), pv = new T.Vector3(), sc1 = new T.Vector3(1, 1, 1), col = new T.Color();
    for (let k = 0, tries = 0; k < 900 && tries < 9000; tries++) {      // sprinkles stuck on the icing
      const u = Math.random() * 6.283, v = Math.random() * 6.283;
      nv.set(Math.cos(u) * Math.cos(v), Math.sin(v), Math.sin(u) * Math.cos(v)); if (nv.y < 0.25) continue;
      pv.set(Math.cos(u) * (RR + rr * Math.cos(v)), rr * Math.sin(v), Math.sin(u) * (RR + rr * Math.cos(v))).addScaledVector(nv, 0.3);
      tv.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).cross(nv).normalize();
      m4.compose(pv, qt.setFromUnitVectors(UPV, tv), sc1); icing.setMatrixAt(k, m4); icing.setColorAt(k, col.set(SPR[k % SPR.length])); k++;
    }
    { let k = 0; const e = new T.Euler();                                  // the ring: 1,500 little stars in 10 even circles, all on one level, facing out
      for (let ri = 0; ri < 10 && k < 1500; ri++) {
        const r = 55 + ri * 5, n = Math.round(2 * Math.PI * r / 3.25);
        for (let q2 = 0; q2 < n && k < 1500; q2++, k++) {
          const a = (q2 + (ri % 2) * 0.5) / n * 6.283;
          pv.set(Math.cos(a) * r, 0, Math.sin(a) * r);
          m4.compose(pv, qt.setFromEuler(e.set(0, Math.PI / 2 - a, 0)), sc1.set(1.3, 1.3, 1.3)); ring.setMatrixAt(k, m4); ring.setColorAt(k, col.set(SPR[k % SPR.length]));
        }
      }
      ring.count = k; }
    sc1.set(1, 1, 1);
    planet.add(icing, ring);
    planet.rotation.set(0.42, 0, 0.18);
    addBody("Sprinkla", "Donut planet", "A planet shaped like a donut, with shiny pink glaze and a ring of little colorful stars. Scientists say donut-shaped planets could exist in theory, but no one has found one yet.", planet, 44);

  }

  // ---------- camera: drag to turn, pinch to zoom, tap to visit ----------
  const view = { target: new T.Vector3(), want: new T.Vector3(), dist: 520, wantDist: 240, yaw: 0.6, pitch: 0.18, idle: 0 };
  let focus = null;
  const ptrs = new Map(); let pinch = 0, downAt = null;
  function home() { focus = null; view.want.set(0, 0, 0); view.wantDist = 240; q("#auCard").classList.remove("on"); }
  function visit(b) {
    focus = b; view.wantDist = b.r * (b.kind === "Spiral galaxy" ? 3 : b.kind === "Star" ? 7 : 3.6);
    const c = q("#auCard"); c.querySelector("small").textContent = b.kind; c.querySelector("b").textContent = b.name; c.querySelector("p").textContent = b.fact; c.classList.add("on");
    q("#auHint").style.display = "none";
  }
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function tap(x, y) {
    ndc.set(x / innerWidth * 2 - 1, -y / innerHeight * 2 + 1); ray.setFromCamera(ndc, cam);
    const h = ray.intersectObjects(bodies.map((b) => b.hit))[0];
    if (h) visit(bodies.find((b) => b.hit === h.object));
  }
  function wire() {
    const el = R.domElement;
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); downAt = ptrs.size === 1 ? [e.clientX, e.clientY, performance.now()] : null; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    el.addEventListener("pointermove", (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 1) { view.yaw -= (e.clientX - p[0]) * 0.005; view.pitch = Math.max(-1.3, Math.min(1.3, view.pitch + (e.clientY - p[1]) * 0.004)); view.idle = 0; }
      p[0] = e.clientX; p[1] = e.clientY;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) view.wantDist = Math.max(12, Math.min(700, view.wantDist * pinch / d)); pinch = d; view.idle = 0; }
    });
    const up = (e) => { ptrs.delete(e.pointerId); if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 8 && performance.now() - downAt[2] < 500) tap(e.clientX, e.clientY); downAt = null; if (ptrs.size < 2) pinch = 0; };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => { e.preventDefault(); view.wantDist = Math.max(12, Math.min(700, view.wantDist * (1 + e.deltaY * 0.001))); }, { passive: false });
    q("#auHome").addEventListener("click", home);
    q("#auBack").addEventListener("click", () => flashTo(close));
    addEventListener("resize", size);
  }
  function size() { if (!R) return; R.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }

  // ---------- every frame ----------
  const tmp = new T.Vector3(), dir = new T.Vector3();
  function frame(now) {
    if (!window.siPortalOn) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; time += dt;
    // motion
    planet.rotation.y += dt * 0.05;
    S.userData.bub.rotation.y += dt * 0.01; S.userData.bub.children.forEach((g, i) => { g.material.opacity = 0.3 + 0.25 * Math.sin(time * 0.8 + g.userData.ph); });
    bodies.forEach((b) => b.obj.getWorldPosition(b.hit.position));
    // camera
    if (focus) view.want.copy(focus.hit.position);
    view.idle += dt; if (view.idle > 3 && !ptrs.size) view.yaw += dt * 0.04;
    view.target.lerp(view.want, Math.min(1, dt * 2)); view.dist += (view.wantDist - view.dist) * Math.min(1, dt * 1.6);
    cam.position.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch)).multiplyScalar(view.dist).add(view.target);
    cam.lookAt(view.target);
    R.render(S, cam);
    raf = requestAnimationFrame(frame);
  }

  // ---------- open / close ----------
  let busy = false;
  function flashTo(fn) { if (busy) return; busy = true; flash.style.opacity = 1; setTimeout(() => { fn(); flash.style.opacity = 0; busy = false; }, 450); }
  function open() {
    if (!built) { build(); wire(); }
    size(); home(); view.dist = 520; view.yaw = 0.6; view.pitch = 0.18;
    q("#auHint").style.display = "block";
    wrap.style.display = "block"; window.siPortalOn = true; last = performance.now(); raf = requestAnimationFrame(frame);
    const t = q("#auTitle"); t.style.opacity = 1; setTimeout(() => { t.style.opacity = 0; }, 2600);
  }
  function close() { window.siPortalOn = false; cancelAnimationFrame(raf); wrap.style.display = "none"; }
  window.siAstroUniverse = { open: () => flashTo(open) };
})();
