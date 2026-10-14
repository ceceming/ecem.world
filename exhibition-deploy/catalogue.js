// Virtual Nostalgia — the 3D page-turning catalogue as a reusable object.
// Each sheet = two thin planes (front + back face) bent in a vertex shader around the spine.
// Unlit shader: texture colours are output untouched, so the pages look like the digital files.
// This module only owns the book (geometry, page physics, page picking). The host owns camera,
// renderer, placement and zoom, so the book can live in any scene (here: a HUD layer over the room).
import * as THREE from 'three';

export const H = 2;          // page height in book units
const SEGMENTS = 40;         // bend resolution along the page width
const STACK_GAP = 0.008;     // z distance between sheets in a stack
const FACE_EPS = 0.0015;     // front/back face offset along the sheet normal
const TILT = -0.16;          // resting tilt (rad) so stack edges read as layers

const SHEETS = [
  { front: 'p1', back: 'p2' },
  { front: 'p3', back: 'p4' },
  { front: 'p5', back: 'p6' },
];
export const SPREAD_LABELS = ['Cover', 'Pages 2–3', 'Pages 4–5', 'Back page'];

const VERT = /* glsl */`
  uniform float uTheta;   // base angle of the sheet around the spine: 0 = flat right, PI = flat left
  uniform float uK;       // bend: change of angle per unit length (signed)
  uniform float uZ0;      // height of the sheet in the stack
  uniform float uSide;    // +1 front face, -1 back face
  varying vec2 vUv;
  varying float vShade;
  void main() {
    float d = position.x;
    float a = uTheta + uK * d;
    vec2 p;
    if (abs(uK) < 1e-4) p = d * vec2(cos(uTheta), sin(uTheta));
    else p = vec2(sin(a) - sin(uTheta), cos(uTheta) - cos(a)) / uK;
    vec2 n = vec2(-sin(a), cos(a)) * uSide;          // face normal in the x-z plane
    vec3 pos = vec3(p.x, position.y, p.y + uZ0) + vec3(n.x, 0.0, n.y) * ${FACE_EPS};
    vec2 L = normalize(vec2(-0.45, 1.0));
    vShade = clamp(1.0 + 0.32 * (dot(n, L) - L.y), 0.7, 1.05);   // exactly 1.0 when flat
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;
const FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec2 vUv;
  varying float vShade;
  void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb * vShade, 1.0); }
`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);
const range = (x, a, b) => smooth(clamp((x - a) / (b - a), 0, 1));

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.filter = 'blur(14px)'; g.fillStyle = '#000';
  g.fillRect(24, 24, 80, 80);
  return new THREE.CanvasTexture(c);
}

/**
 * @param {object} o
 * @param {(name:string)=>string} [o.textureUrl]  maps 'p1'..'p6' to a URL (lets the host preload/track them)
 * @param {(state:{turned:number,total:number})=>void} [o.onChange]
 * @param {()=>void} [o.onReady]
 * @param {number} [o.anisotropy]
 */
export function createBook({ textureUrl = (n) => `textures/${n}.webp`, onChange, onReady, anisotropy = 8 } = {}) {
  const group = new THREE.Group();          // host positions / scales this
  const book = new THREE.Group();           // centred + tilted inside
  group.add(book);

  const N = SHEETS.length;
  const t = new Array(N).fill(0), vel = new Array(N).fill(0), target = new Array(N).fill(0);
  const dirOf = new Array(N).fill(1);
  const sheets = [];
  let drag = null;               // {i, side, grabD, startX, startY, moved, lastT, lastTime, tv, tTarget}
  let ready = false, widest = 1, openF = 0;
  let shadowR, shadowL, shadowK = 1;
  let tilt = { x: 0, y: 0 };

  // ---------- load ----------
  const loader = new THREE.TextureLoader();
  const loadUrl = (url) => new Promise((res, rej) => loader.load(url, (tx) => {
    tx.anisotropy = anisotropy; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; res(tx);
  }, undefined, rej));
  const load = (name) => loadUrl(textureUrl(name));

  Promise.all(SHEETS.map(async (s) => ({ f: await load(s.front), b: await load(s.back) }))).then((tex) => {
    SHEETS.forEach((s, i) => {
      const shared = { uTheta: { value: 0 }, uK: { value: 0 }, uZ0: { value: 0 } };
      const mk = (tx, side) => {
        const w = (tx.image.width / tx.image.height) * H;
        const g = new THREE.PlaneGeometry(w, H, SEGMENTS, 1); g.translate(w / 2, 0, 0);
        if (side < 0) { const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k)); }
        const m = new THREE.ShaderMaterial({
          vertexShader: VERT, fragmentShader: FRAG,
          side: side > 0 ? THREE.FrontSide : THREE.BackSide,
          uniforms: { ...shared, uSide: { value: side }, map: { value: tx } },
        });
        const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; book.add(mesh);
        return { mesh, w };
      };
      const front = mk(tex[i].f, 1), back = mk(tex[i].b, -1);
      sheets.push({ shared, front, back, w: Math.max(front.w, back.w) });
    });
    widest = Math.max(...sheets.map((s) => s.w));
    const st = shadowTexture();
    const mkShadow = () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(widest * 1.25, H * 1.12),
        new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, opacity: 0 }));
      m.renderOrder = -1; m.position.z = -0.03; m.frustumCulled = false; book.add(m); return m;
    };
    shadowR = mkShadow(); shadowL = mkShadow();
    shadowR.position.x = widest / 2; shadowL.position.x = -widest / 2;
    ready = true; update(0); onReady && onReady();
  });

  /** swap every page's artwork (e.g. another paper colour). urlFn: 'p1'..'p6' -> url. Geometry is kept: both papers share the page sizes. */
  async function setPaper(urlFn) {
    if (!ready) return false;
    const names = SHEETS.flatMap((s) => [s.front, s.back]);
    const txs = await Promise.all(names.map((n) => loadUrl(urlFn(n))));
    sheets.forEach((s, i) => [s.front, s.back].forEach((f, k) => {
      const u = f.mesh.material.uniforms.map, old = u.value; u.value = txs[i * 2 + k]; old && old.dispose();
    }));
    return true;
  }

  // ---------- state / api ----------
  const turned = () => target.reduce((n, v) => n + (v > 0.5 ? 1 : 0), 0);
  const notify = () => onChange && onChange({ turned: turned(), total: N });
  function next() { const i = target.findIndex((v) => v < 0.5); if (i >= 0) { target[i] = 1; dirOf[i] = 1; notify(); } }
  function prev() { for (let i = N - 1; i >= 0; i--) if (target[i] > 0.5) { target[i] = 0; dirOf[i] = -1; notify(); return; } }
  function goTo(n) { for (let i = 0; i < N; i++) { const want = i < n ? 1 : 0; if (target[i] !== want) { target[i] = want; dirOf[i] = want ? 1 : -1; } } notify(); }

  // ---------- picking (host passes pointer + its camera) ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  function localPoint(clientX, clientY, camera, rect) {       // pointer -> book-local point on the page plane
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    book.updateWorldMatrix(true, false); ray.setFromCamera(ndc, camera);
    inv.copy(book.matrixWorld).invert();
    const lr = ray.ray.clone().applyMatrix4(inv);
    return lr.intersectPlane(plane, hit) ? hit.clone() : null;
  }
  const rightCount = () => N - turned(), leftCount = () => turned();
  function rightExtent() { let w = 0; for (let i = turned(); i < N; i++) w = Math.max(w, sheets[i].w); return w; }
  function leftExtent() { let w = 0; for (let i = 0; i < turned(); i++) w = Math.max(w, sheets[i].w); return w; }
  const sideAt = (p) => (!ready || !p || Math.abs(p.y) > H / 2) ? 0
    : (p.x > 0 && p.x < rightExtent() && rightCount() > 0) ? 1
    : (p.x < 0 && -p.x < leftExtent() && leftCount() > 0) ? -1 : 0;
  /** is this book-local point on a page? */
  const isOver = (p) => ready && !!p && Math.abs(p.y) <= H / 2 && ((p.x > -leftExtent() && p.x < 0 && leftCount() > 0) || (p.x > 0 && p.x < rightExtent() && rightCount() > 0));
  /** is this book-local point on a page that can be turned? (same as isOver, kept for readability) */
  const canGrab = (p) => sideAt(p) !== 0;

  function press(p, x, y) {
    const side = sideAt(p); if (!side) return false;
    const i = side > 0 ? turned() : turned() - 1;
    drag = { i, side, grabD: clamp(Math.abs(p.x), 0.08, sheets[i].w), startX: x, startY: y, moved: false, lastT: t[i], lastTime: performance.now(), tv: 0 };
    return true;
  }
  function dragTo(p, x, y) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > 6) drag.moved = true;
    if (drag.moved && p) { drag.tTarget = Math.acos(clamp(p.x / drag.grabD, -1, 1)) / Math.PI; target[drag.i] = drag.tTarget > 0.5 ? 1 : 0; }
  }
  function release() {
    if (!drag) return false;
    const d = drag; drag = null;
    if (!d.moved) { d.side > 0 ? next() : prev(); return true; }
    const fwd = Math.abs(d.tv) > 0.9 ? d.tv > 0 : t[d.i] > 0.5;      // flick direction wins over position
    target[d.i] = fwd ? 1 : 0; dirOf[d.i] = fwd ? 1 : -1; vel[d.i] = clamp(d.tv, -4, 4) * 0.5;
    notify(); return true;
  }

  // ---------- per frame ----------
  /** advances physics, writes shader uniforms. returns true while anything is still moving. */
  function update(dt) {
    if (!ready) return false;
    dt = Math.min(dt, 1 / 30);
    let moving = !!drag;
    if (dt > 0) for (let i = 0; i < N; i++) {
      if (drag && drag.i === i && drag.moved && drag.tTarget !== undefined) {
        const now = performance.now();
        const nt = t[i] + (drag.tTarget - t[i]) * Math.min(1, dt * 28);
        const v = (nt - t[i]) / dt; vel[i] += (v - vel[i]) * 0.5; t[i] = nt;
        const pv = (t[i] - drag.lastT) / Math.max(1, now - drag.lastTime) * 1000;
        drag.tv += (pv - drag.tv) * 0.35; drag.lastT = t[i]; drag.lastTime = now; moving = true;
      } else {
        const K = 75, C = 15;
        vel[i] += (K * (target[i] - t[i]) - C * vel[i]) * dt;
        t[i] += vel[i] * dt;
        if (t[i] < 0) { t[i] = 0; vel[i] = 0; } else if (t[i] > 1) { t[i] = 1; vel[i] = 0; }
        if (Math.abs(target[i] - t[i]) > 0.0005 || Math.abs(vel[i]) > 0.002) moving = true; else { t[i] = target[i]; vel[i] = 0; }
      }
    }
    sheets.forEach((s, i) => {
      const ti = t[i], th = Math.PI * ti;
      if (Math.abs(vel[i]) > 0.05) dirOf[i] = Math.sign(vel[i]);
      const kw = -(0.5 * Math.sin(Math.PI * ti) * dirOf[i] + vel[i] * 0.12);       // trailing free edge
      let k = kw / s.w;
      k = clamp(k, -th / s.w * 0.97, (Math.PI - th) / s.w * 0.97);                // never dips into the stacks
      const zr = (N - 1 - i) * STACK_GAP, zl = i * STACK_GAP;
      s.shared.uTheta.value = th; s.shared.uK.value = k; s.shared.uZ0.value = zr + (zl - zr) * range(ti, 0.35, 0.65);
    });
    // the book re-centres as it opens / closes
    const e0 = smooth(t[0]), e2 = smooth(t[N - 1]);
    openF = e0 * (1 - e2);
    book.position.x = -(widest / 2) * (1 - e0) + (widest / 2) * e2;
    book.rotation.x = TILT + tilt.y; book.rotation.y = tilt.x;
    shadowR.material.opacity = 0.2 * (1 - e2) * shadowK; shadowL.material.opacity = 0.2 * e0 * shadowK;
    return moving;
  }

  return {
    group, next, prev, goTo, update, setPaper, localPoint, press, dragTo, release, isOver, canGrab,
    get ready() { return ready; },
    get turned() { return turned(); },
    get dragging() { return !!drag; },
    total: N,
    /** size of what is currently visible (book units), for framing */
    contentSize() { return { w: widest * (1 + openF) * 1.12 + 0.1, h: H * 1.08 }; },
    setTilt(x, y) { tilt = { x, y }; },
    setShadow(k) { shadowK = k; },
    dispose() { sheets.forEach((s) => { [s.front, s.back].forEach((f) => { f.mesh.geometry.dispose(); f.mesh.material.uniforms.map.value.dispose(); f.mesh.material.dispose(); }); }); },
  };
}
