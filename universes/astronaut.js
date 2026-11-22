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
    '<div id="auHint">Drag to look around · tap a planet to visit it</div><div id="auCard"><small></small><b></b><p></p></div>' +
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
  let planet, moon, ocean, maw, disk, galaxy, comet, tail, tailPos, shoot = [];
  function build() {
    built = true;
    R = new T.WebGLRenderer({ antialias: true }); R.setPixelRatio(Math.min(devicePixelRatio, 2));
    wrap.insertBefore(R.domElement, wrap.firstChild);
    cam = new T.PerspectiveCamera(55, 1, 0.5, 4000);
    S = new T.Scene();

    // deep sky: violet to midnight blue
    S.add(new T.Mesh(new T.SphereGeometry(2000, 32, 16), new T.ShaderMaterial({ side: T.BackSide, depthWrite: false,
      vertexShader: "varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "varying vec3 p;void main(){float h=p.y*.5+.5;vec3 a=vec3(.01,.01,.05),b=vec3(.07,.02,.10);float band=exp(-pow(p.y*3.+p.x*.8,2.))*.6;gl_FragColor=vec4(mix(b,a,h)+vec3(.05,.03,.09)*band,1.);}" })));
    // stars: many small, some big and colorful
    S.add(pts(7000, (i, v, c) => { v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1200, 1800)); c.setHSL(Math.random() < 0.5 ? 0.6 : 0.08, 0.5, rnd(0.6, 1)); }, 7));
    const big = pts(300, (i, v, c) => { v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1100, 1600)); c.setHSL(Math.random(), 0.8, 0.75); }, 22);
    S.add(big); big.userData.tw = true;

    // the star that lights everything
    const sunPos = new T.Vector3(-520, 160, -700);
    const sun = new T.Group(); sun.position.copy(sunPos);
    sun.add(glow(0xfff1d6, 260)); sun.add(glow(0xffb45a, 520, 0.45)); sun.add(glow(0xff6a3d, 900, 0.18));
    S.add(sun);
    S.add(new T.AmbientLight(0x6070a0, 0.35));
    const sl = new T.PointLight(0xfff0dd, 2.2, 0, 0); sl.position.copy(sunPos); S.add(sl);
    addBody("Helios", "Star", "The star that lights this universe. All its planets travel around it, warmed by its light.", sun, 60);

    // space clouds (nebula) behind
    const neb = new T.Group(); S.add(neb);
    const nebC = [0xff3d9a, 0x7a4dff, 0x22d3ff, 0xff8a3d];
    for (let i = 0; i < 46; i++) { const s = glow(nebC[i % 4], rnd(180, 420), rnd(0.08, 0.22)); s.position.set(rnd(-600, 500), rnd(-250, 150) + (i % 4) * 30, rnd(-1100, -800)); neb.add(s); }

    // the donut planet with a ring of rainbow sprinkles
    planet = new T.Group(); S.add(planet);
    const RR = 30, rr = 14;
    const dg = new T.TorusGeometry(RR, rr, 64, 128); dg.rotateX(-Math.PI / 2);
    { const p = dg.attributes.position, n = dg.attributes.normal, c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const ny = n.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), drip = 0.12 * Math.sin(a * 9) + 0.08 * Math.sin(a * 23 + 1);
        if (ny > -0.15 + drip) { const sh = 0.9 + 0.1 * ny; c[i * 3] = 1 * sh; c[i * 3 + 1] = 0.42 * sh; c[i * 3 + 2] = 0.68 * sh; }   // pink icing
        else { const b = 0.75 + 0.25 * Math.max(0, -ny); c[i * 3] = 0.86 * b; c[i * 3 + 1] = 0.58 * b; c[i * 3 + 2] = 0.3 * b; }   // golden dough
      }
      dg.setAttribute("color", new T.BufferAttribute(c, 3)); }
    planet.add(new T.Mesh(dg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
    const SPR = [0xff4d6d, 0xffd23f, 0x3fa9ff, 0x4be37a, 0xff8c2a, 0xa66bff, 0xffffff, 0x2ee6d6];
    const sprGeo = new T.CylinderGeometry(0.35, 0.35, 2.2, 6);
    const icing = new T.InstancedMesh(sprGeo, new T.MeshStandardMaterial({ roughness: 0.4 }), 450);
    const ring = new T.InstancedMesh(sprGeo, new T.MeshStandardMaterial({ roughness: 0.4, emissive: 0x222222 }), 3000);
    const m4 = new T.Matrix4(), qt = new T.Quaternion(), UPV = new T.Vector3(0, 1, 0), nv = new T.Vector3(), tv = new T.Vector3(), pv = new T.Vector3(), sc1 = new T.Vector3(1, 1, 1), col = new T.Color();
    for (let k = 0, tries = 0; k < 450 && tries < 5000; tries++) {      // sprinkles stuck on the icing
      const u = Math.random() * 6.283, v = Math.random() * 6.283;
      nv.set(Math.cos(u) * Math.cos(v), Math.sin(v), Math.sin(u) * Math.cos(v)); if (nv.y < 0.25) continue;
      pv.set(Math.cos(u) * (RR + rr * Math.cos(v)), rr * Math.sin(v), Math.sin(u) * (RR + rr * Math.cos(v))).addScaledVector(nv, 0.3);
      tv.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).cross(nv).normalize();
      m4.compose(pv, qt.setFromUnitVectors(UPV, tv), sc1); icing.setMatrixAt(k, m4); icing.setColorAt(k, col.set(SPR[k % SPR.length])); k++;
    }
    for (let k = 0; k < 3000; k++) {                                     // the ring: rainbow sprinkles floating around
      const r = Math.sqrt(rnd(55 * 55, 100 * 100)), a = Math.random() * 6.283;
      pv.set(Math.cos(a) * r, rnd(-0.8, 0.8), Math.sin(a) * r);
      tv.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      m4.compose(pv, qt.setFromUnitVectors(UPV, tv), sc1.set(1.3, 1.3, 1.3)); ring.setMatrixAt(k, m4); ring.setColorAt(k, col.set(SPR[k % SPR.length]));
    }
    sc1.set(1, 1, 1);
    planet.add(icing, ring);
    planet.rotation.set(0.42, 0, 0.18);
    addBody("Sprinkla", "Donut planet", "A planet shaped like a donut, with pink icing and a ring of rainbow sprinkles. Scientists say donut-shaped planets could exist in theory, but no one has found one yet.", planet, 44);

    // its moon
    moon = new T.Mesh(paint(new T.SphereGeometry(7, 48, 32), (v, c) => {
      let g = 0.55 + 0.1 * Math.sin(v.x * 13) * Math.sin(v.y * 11 + v.z * 7);
      for (const d of [[0.5, 0.6, 0.6], [-0.7, 0.1, 0.7], [0.1, -0.8, 0.5], [0.8, -0.3, -0.5]]) { const dd = (v.x - d[0]) ** 2 + (v.y - d[1]) ** 2 + (v.z - d[2]) ** 2; if (dd < 0.06) g -= 0.18 * (1 - dd / 0.06); }
      c.setRGB(g, g, g * 1.03);
    }), new T.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    S.add(moon);
    addBody("Selene", "Moon", "Aurelia's moon. Its craters were made by space rocks crashing into it billions of years ago.", moon, 7);

    // the ocean world
    ocean = new T.Group(); ocean.position.set(185, -35, 95); S.add(ocean);
    const og = paint(new T.SphereGeometry(13, 72, 48), (v, c) => {
      const n = Math.sin(v.x * 4 + Math.sin(v.y * 5)) * Math.sin(v.z * 4 + Math.cos(v.x * 3)) + 0.35 * Math.sin(v.y * 9 + v.x * 7);
      if (Math.abs(v.y) > 0.86) c.setRGB(0.95, 0.97, 1);
      else if (n > 0.3) c.setRGB(0.25 + 0.2 * n, 0.55 - 0.1 * n, 0.25);
      else c.setRGB(0.05, 0.25 + 0.15 * n, 0.6 + 0.2 * n);
    });
    ocean.add(new T.Mesh(og, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 })));
    const clouds = new T.Mesh(paint(new T.SphereGeometry(13.4, 48, 32), (v, c) => { const k = Math.max(0, Math.sin(v.x * 7 + v.y * 3) * Math.sin(v.z * 6 - v.y * 4)); c.setRGB(k, k, k); }),
      new T.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })); ocean.add(clouds); ocean.userData.clouds = clouds;
    ocean.add(atmos(14.6, 0x5ab8ff, 2.2));
    addBody("Nerida", "Ocean world", "A blue planet almost fully covered by water, with white ice at the top and bottom. It looks a lot like Earth.", ocean, 13);

    // the black hole
    maw = new T.Group(); maw.position.set(-190, 45, 70); S.add(maw);
    maw.add(glow(0xff9a4a, 70, 0.55));
    maw.add(new T.Mesh(new T.SphereGeometry(9, 48, 32), new T.MeshBasicMaterial({ color: 0x000000 })));
    disk = new T.Mesh(new T.RingGeometry(12, 48, 160, 6), new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { t: { value: 0 } },
      vertexShader: "varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "uniform float t;varying vec2 p;void main(){float r=length(p),a=atan(p.y,p.x),k=(r-12.)/36.;float sw=sin(a*3.+log(r)*14.-t*2.5)*.5+.5;vec3 c=mix(vec3(1.,.97,.85),vec3(1.,.35,.08),k);c=mix(c,vec3(.6,.1,.4),k*k);gl_FragColor=vec4(c*(.7+.6*sw),(1.-k)*(1.-k)*smoothstep(0.,.06,k)*(.55+.45*sw));}" }));
    disk.rotation.x = Math.PI / 2 - 0.25; maw.add(disk);
    const halo = new T.Mesh(new T.RingGeometry(9.2, 11, 96), new T.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, side: T.DoubleSide, depthWrite: false }));
    maw.add(halo); maw.userData.halo = halo;
    addBody("The Maw", "Black hole", "Its pull is so strong that nothing can escape, not even light. The glowing ring is hot gas spinning around it, faster than anything on Earth.", maw, 12);

    // a spiral galaxy far away
    galaxy = new T.Group(); galaxy.position.set(140, 230, -650); galaxy.rotation.set(1.05, 0, 0.35); S.add(galaxy);
    galaxy.add(pts(14000, (i, v, c) => {
      const arm = i % 3, d = Math.pow(Math.random(), 0.55) * 200, a = arm / 3 * 6.283 + d * 0.028 + rnd(-0.35, 0.35) * (1 - d / 260);
      v.set(Math.cos(a) * d + rnd(-6, 6), rnd(-5, 5) * (1 - d / 200), Math.sin(a) * d + rnd(-6, 6));
      c.setHSL(d < 40 ? 0.1 : 0.62 - d / 900 + (Math.random() < 0.15 ? 0.3 : 0), 0.8, d < 40 ? 0.85 : 0.65);
    }, 5, { opacity: 0.85 }));
    galaxy.add(glow(0xffe2b0, 120, 0.8));
    addBody("Andros", "Spiral galaxy", "A spinning spiral of billions of stars. One turn takes it hundreds of millions of years.", galaxy, 120);

    // a comet crossing the sky
    comet = new T.Group(); S.add(comet);
    comet.add(glow(0xcff4ff, 9)); comet.add(new T.Mesh(new T.SphereGeometry(1.2, 16, 12), new T.MeshBasicMaterial({ color: 0xe8fbff })));
    tail = pts(400, (i, v, c) => { v.set(0, 0, 0); c.setHSL(0.53, 0.8, 0.8 - i / 700); }, 4, { opacity: 0.8 });
    tailPos = tail.geometry.attributes.position; S.add(tail);
    addBody("Kito", "Comet", "A big ball of ice and dust. When it gets close to the star, the ice turns to gas and makes a long glowing tail that points away from the star.", comet, 4);

    // shooting stars
    for (let i = 0; i < 4; i++) {
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(new Float32Array(6), 3));
      const l = new T.Line(g, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending }));
      l.userData = { life: rnd(0, 3), a: new T.Vector3(), d: new T.Vector3() }; S.add(l); shoot.push(l);
    }
    S.userData.big = big; S.userData.sunPos = sunPos;
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
    const ma = time * 0.12; moon.position.set(Math.cos(ma) * 125, Math.sin(ma) * 22, Math.sin(ma) * 125); moon.rotation.y += dt * 0.1;
    ocean.rotation.y += dt * 0.08; ocean.userData.clouds.rotation.y += dt * 0.03;
    disk.material.uniforms.t.value = time; maw.userData.halo.lookAt(cam.position);
    galaxy.rotation.y += dt * 0.02;
    S.userData.big.material.size = 20 + 4 * Math.sin(time * 2);
    const ct = (time * 0.018) % 1;
    comet.position.set(-650 + ct * 1300, 260 - ct * 300, -300 + Math.sin(ct * 3.14) * 380);
    dir.copy(comet.position).sub(S.userData.sunPos).normalize();
    for (let i = 0; i < 400; i++) { const k = i / 400 * 70, w = (i % 7 - 3) * 0.25 * (i / 400); tmp.copy(comet.position).addScaledVector(dir, k); tailPos.setXYZ(i, tmp.x + w * 3, tmp.y + w * 2, tmp.z + w); }
    tailPos.needsUpdate = true;
    shoot.forEach((l) => {
      const u = l.userData; u.life -= dt;
      if (u.life < -0.9) { u.life = rnd(1, 6); u.a.set(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).normalize().multiplyScalar(600); u.d.set(rnd(-1, 1), rnd(-1, -0.2), rnd(-1, 1)).normalize(); }
      if (u.life < 0) { const k = -u.life / 0.9, a = tmp.copy(u.a).addScaledVector(u.d, k * 300), p = l.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, a.x - u.d.x * 40, a.y - u.d.y * 40, a.z - u.d.z * 40); p.needsUpdate = true; l.material.opacity = Math.sin(k * 3.14); }
      else l.material.opacity = 0;
    });
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
