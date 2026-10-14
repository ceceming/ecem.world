// Virtual Nostalgia — the virtual exhibition (prototype 1).
// Scene layers:  [ room scan (unlit) + object carousel ]  then  [ HUD: dim veil, catalogue, inspected object ].
// The HUD is drawn in a second pass over a cleared depth buffer, so the book / inspected object can never
// clip into the room's walls, wherever the visitor happens to stand.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBook, SPREAD_LABELS } from './catalogue.js';

const FOV = 62, EYE = 1.55, MAX_ZOOM = 5;      // read-mode zoom limit (the back page's Game Boy photo is small)
const rad = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (x) => x * x * (3 - 2 * x);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- content
const ITEMS = [
  { id: 'notebook', title: 'Pippi Longstocking Notebook', text: 'A notebook I bought as a kid at a family trip to Stockholm. Left at my grandma’s house, I filled with diary entries written during my stays there. Years later I realized it as a first person account of my days filled with childish playfulness spent at my grandma’s.' },
  { id: 'drawer', title: 'Drawer with Lace Tablecloth Heirlooms Inside', text: 'Grandma’s most prized collection of handmade lace tablecloths. Her collection was formed overtime, mostly during the latter part of 80s. She says she bought them from craftswoman, mostly nuns, touring neighbourhoods selling them. Survived decades, they still radiate charm. The drawer was part of the walnut living room set.' },
  { id: 'sidetable', title: 'Side Table with Ornamentations on Top', text: 'The walnut sidetable was an item from my grandma’s dowry. She still uses it, fifty years later. On it are gifted souvenirs and art objects from around the world. This setting never changed. I used to throw aluminum chocolate wraps inside the ceramic carafe in the middle. My grandma would discover them catching me mid act.' },
  { id: 'mirror', title: 'Hand Painted Mirror', text: 'Painted and gifted by a family friend, the mirror had a specific place of its own on the corridor wall. I would stare at my reflection everytime I passed by. Along with every item in the house, this was too, quite old. The scene depicted a woman with oriental clothing lounging on pillows. A feminine act paired with pale colors.' },
  { id: 'lantern', title: 'Glass Ceiling Lamp', text: 'The glass ceiling lamp welcomed visitors at the doorway. It marked our most sincere hellos and gloomy goodbyes. The light play shone underneath froze time and space inside the house.' },
  { id: 'plate', title: 'Hand Painted Plate', text: 'The turquoise plate had its own wall in my mother’s old room. The end of the corridor facing west, this room had the most beautiful sun downs. After her departure, the room became a guest room and laundry. It also featured grandma’s Singer machine, complete with a table and pedal. This room was also my sleepover bedroom.' },
  { id: 'armchair', title: 'Walnut Armchair with Velvet Upholstery', text: 'The silhouette of these sofas are engraved on my memory. The texture and color of green velvet and the glossy top coat of walnut are native to my fingertips. My childhood was spent with fortresses built with seat pillows of these armchairs, easy to grab and carry for a kid. Just like lego blocks, I would stack them on top of each other.' },
];

// Standing spots (taken from the scan; Blender coordinates, metres, Z-up) + how big the carousel may be there.
const PLACES = [
  { id: 'living',  label: 'Living room',    env: 'house', pos: [5.32, 0.20, 0.00],  yaw: 155, car: { d: 2.0,  r: 0.65, size: 0.34 } },   // faces the doorway to the corridor; carousel stands in front of it
  { id: 'kitchen', label: 'Kitchen',        env: 'house', pos: [1.07, 1.10, 0.00],  yaw: 270, car: { d: 1.4, r: 0.36, size: 0.2, h: 1.25 } },
  { id: 'bedroom', label: 'Bedroom',        env: 'house', pos: [-5.68, 1.20, 0.08], yaw: 90,  car: { d: 1.45, r: 0.55, size: 0.30 } },
  { id: 'wc',      label: 'WC',             env: 'wc',    pos: [-0.15, -0.55, 0.03], yaw: 270, car: { d: 0.7, r: 0.24, size: 0.14, h: 1.38 } },
];

// ---------------------------------------------------------------- renderer / scenes
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.autoClear = false;
renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
stage.appendChild(renderer.domElement);
const el = renderer.domElement;

const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdcd5d0);        // where the scan has no wall at all: plaster-coloured, not peach
const hud = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.03, 80); camera.rotation.order = 'YXZ';
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex; hud.environment = envTex; scene.environmentIntensity = hud.environmentIntensity = 0.85;
for (const s of [scene, hud]) { const d = new THREE.DirectionalLight(0xfff2e8, 1.4); d.position.set(-1.5, 3, 2); s.add(d); }

const envs = { house: new THREE.Group(), wc: new THREE.Group() };
scene.add(envs.house, envs.wc); envs.house.visible = envs.wc.visible = false;

// ---------------------------------------------------------------- loading (with real progress)
window.Intro.onEnter(() => {                 // fires once everything is loaded AND the visitor pressed Enter
  const L = $('loader'); L.classList.add('gone');
  requestAnimationFrame(frame);
  setTimeout(() => { L.remove(); }, 900);
  ensureWC();                                         // fetch the WC while the visitor settles in
  setTimeout(() => fetchPaper(PAPER === 'green' ? 'cream' : 'green'), 2500);     // and the other paper colour, so the switch is instant
});
const gltf = new GLTFLoader();
const files = {};                       // url -> loaded bytes
let totalBytes = 1;
async function fetchBuf(url, size) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  const reader = r.body.getReader(), chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; files[url] = got; progress(); }
  files[url] = size; progress();
  return new Blob(chunks);
}
function progress() {
  const got = Object.values(files).reduce((a, b) => a + b, 0), f = clamp(got / totalBytes, 0, 1);
  window.Intro.setProgress(f);
}
const texBlob = {};
async function loadGLB(url, size) { return (await gltf.parseAsync(await (await fetchBuf(url, size)).arrayBuffer(), '')).scene; }

const items = [];                       // { def, pivot, model, maxDim }
let bk;                                 // the catalogue
const manifest = await (await fetch('models/manifest.json')).json();
const sizeOf = (u) => manifest[u] || 0;
let PAPER = new URLSearchParams(location.search).get('paper') === 'cream' ? 'cream' : 'green';     // ?paper=cream | green (default); switchable in the experience
const PAGES = `textures/paper-${PAPER}`;
const ORIGINAL = new URLSearchParams(location.search).get('scan') === 'original';
const HOUSE = ORIGINAL ? 'models/house.glb' : 'models/house_clean.glb';   // ?scan=original shows the untouched scan
const critical = [HOUSE, ...ITEMS.map((i) => `models/${i.id}.glb`), ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((n) => `${PAGES}/${n}.webp`), 'textures/window_view.webp'];
totalBytes = critical.reduce((a, u) => a + sizeOf(u), 0) || 1;

function unlit(root) {                  // scans carry baked light: show them exactly as captured
  root.traverse((o) => {
    if (!o.isMesh) return;
    const map = o.material.map; if (map) map.anisotropy = 8;
    o.material = new THREE.MeshBasicMaterial({ map, color: map ? 0xffffff : o.material.color, side: THREE.DoubleSide });
  });
  return root;
}

const loadAll = (async () => {
  const [house] = await Promise.all([
    loadGLB(HOUSE, sizeOf(HOUSE)),
    ...ITEMS.map(async (def) => {
      const model = await loadGLB(`models/${def.id}.glb`, sizeOf(`models/${def.id}.glb`));
      const box = new THREE.Box3().setFromObject(model), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      model.position.sub(c);
      if (def.id === 'drawer') model.traverse((o) => { if (o.isMesh) o.material.roughness = 1; });   // cloth, not satin
      const pivot = new THREE.Group(); pivot.add(model); scene.add(pivot);
      items.push({ def, pivot, model, maxDim: Math.max(sz.x, sz.y, sz.z), size: sz });
    }),
    ...['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(async (n) => { texBlob[n] = URL.createObjectURL(await fetchBuf(`${PAGES}/${n}.webp`, sizeOf(`${PAGES}/${n}.webp`))); }),
    (async () => { texBlob.window = URL.createObjectURL(await fetchBuf('textures/window_view.webp', sizeOf('textures/window_view.webp'))); })(),
  ]);
  addWindowView(await new THREE.TextureLoader().loadAsync(texBlob.window));       // kitchen window photo (the other windows' photos are built into house_clean.glb)
  envs.house.add(unlit(house));
  hangEntrywayLamp();
  if (ORIGINAL) placeSidetable();                                  // the clean house already has its clean side table, armchairs and TV unit
  items.sort((a, b) => ITEMS.indexOf(a.def) - ITEMS.indexOf(b.def));
  await new Promise((res) => {
    bk = createBook({ textureUrl: (n) => texBlob[n], onChange: syncUI, onReady: res, anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
    hud.add(rig); rig.add(bk.group);
  });
})();

// The kitchen window is open glass in the scan: your photo of the view from that window sits just outside it,
// so it shows through the gaps (the wall in front hides everything else). Blender coords (-0.55, -2.65, 1.55), faces the room.
let windowView;
function addWindowView(tex) {
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  windowView = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2 * tex.image.height / tex.image.width), new THREE.MeshBasicMaterial({ map: tex }));
  windowView.position.set(-0.55, 1.55, 2.65); windowView.rotation.y = Math.PI; windowView.visible = false;
  scene.add(windowView);
}

// The glass ceiling lamp also hangs where it hung: the brass fixture in the entryway ceiling
// (found in the scan at Blender (1.37, 2.66), ceiling height 2.69 m). Same model as the carousel's lamp.
function hangEntrywayLamp() {
  const it = items.find((i) => i.def.id === 'lantern'); if (!it) return;
  const s = 0.6 / it.size.x, holder = new THREE.Group();
  holder.add(it.model.clone(true));
  holder.scale.setScalar(s); holder.position.set(1.37, 2.69 - (it.size.y / 2) * s, -2.66);
  envs.house.add(holder);
}

// The scanned side table next to the armchair (right of the corridor door) came out melted, so that patch of the scan is
// cut away in Blender (CUT_BOXES in tools/build_model.py: x 3.88-4.42, y 2.05-2.98) and the clean model stands there instead.
const SIDETABLE = { x: 4.15, y: 2.5, height: 0.82, yaw: 0.47 };       // Blender metres; yaw faces the living-room standing spot
let sidetableHolder;
function placeSidetable() {
  const it = items.find((i) => i.def.id === 'sidetable'); if (!it) return;
  const s = SIDETABLE.height / it.size.y; sidetableHolder = new THREE.Group();
  sidetableHolder.add(it.model.clone(true));
  sidetableHolder.scale.setScalar(s); sidetableHolder.rotation.y = SIDETABLE.yaw;
  sidetableHolder.position.set(SIDETABLE.x, (it.size.y / 2) * s, -SIDETABLE.y);
  envs.house.add(sidetableHolder);
}

let wcPromise = null;                   // the WC loads quietly after the visitor has entered
function ensureWC() {
  return wcPromise ??= loadGLB('models/wc.glb', sizeOf('models/wc.glb')).then((m) => { envs.wc.add(unlit(m)); dirty = true; });
}

// ---------------------------------------------------------------- HUD pieces
const rig = new THREE.Group();
const dim = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0x2a1a1a, transparent: true, opacity: 0, depthWrite: false }));
dim.renderOrder = -10; dim.frustumCulled = false; hud.add(dim);

// ---------------------------------------------------------------- state
let mode = 'explore';                   // explore | read | inspect
let m = 0;                              // 0 = catalogue held low, 1 = catalogue open in front of the face
let place = null, basePos = new THREE.Vector3(), baseYaw = 0, ringC = new THREE.Vector3(), ringF = new THREE.Vector3(), ringR = new THREE.Vector3();
const look = { yaw: 0, pitch: 0 }, lookS = { yaw: 0, pitch: 0 };
let zoom = 1, zoomT = 1, pan = { x: 0, y: 0 }, panT = { x: 0, y: 0 }, tiltT = { x: 0, y: 0 }, tilt = { x: 0, y: 0 };
let ringAuto = 0, ringSpeed = 0, ringStep = 0, ringStepT = 0, hoverIdx = -1, dirty = true, time = 0;
let insp = null;

function placeNow(p) {
  place = p;
  envs.house.visible = p.env === 'house'; envs.wc.visible = p.env === 'wc';
  if (windowView) windowView.visible = p.id === 'kitchen';
  const th = p.yaw * rad;
  baseYaw = Math.atan2(-Math.cos(th), Math.sin(th));                     // Blender heading -> three.js yaw
  basePos.set(p.pos[0], p.pos[2] + EYE, -p.pos[1]);
  ringF.set(-Math.sin(baseYaw), 0, -Math.cos(baseYaw)); ringR.set(Math.cos(baseYaw), 0, -Math.sin(baseYaw));
  ringC.copy(basePos).addScaledVector(ringF, p.car.d); ringC.y = p.pos[2] + (p.car.h ?? 1.2);
  items.forEach((it) => it.pivot.scale.setScalar(p.car.size / it.maxDim));
  look.yaw = lookS.yaw = (p.start || 0) * rad;      // opening view can differ from the carousel's axis (+ = turn left)
  look.pitch = lookS.pitch = p.pitch || 0;
  document.querySelectorAll('#places button').forEach((b) => b.classList.toggle('on', b.dataset.id === p.id));
  dirty = true;
}
async function goPlace(p) {
  if (p === place) return;
  if (mode === 'inspect') closeInspect(true);
  if (mode === 'read') setMode('explore');
  const fade = $('fade'); fade.classList.add('on');
  await new Promise((r) => setTimeout(r, 290));
  if (p.env === 'wc') await ensureWC();
  placeNow(p);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  fade.classList.remove('on');
}

function setMode(next) {
  mode = next; document.body.dataset.mode = next;
  $('hint').textContent = next === 'explore' ? 'Drag to look around · click the catalogue to read it · click an object to inspect it'
    : next === 'read' ? 'Drag a page or click it to turn · scroll to zoom · click outside to put it down' : 'Drag to turn the object · Esc to put it back';
  dirty = true;
}

// ---------------------------------------------------------------- inspect (object comes to the visitor)
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpE = new THREE.Euler();
function startInspect(i) {
  const it = items[i]; it.pivot.updateWorldMatrix(true, false);
  const obj = it.pivot.clone(true); obj.visible = true; hud.add(obj);
  it.pivot.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
  it.pivot.visible = false;
  insp = { i, obj, t: 0, dir: 1, spinY: 0, spinX: 0.12, grab: false };
  $('capTitle').textContent = it.def.title; $('capText').textContent = it.def.text || '';
  setMode('inspect'); hoverIdx = -1; $('tip').style.opacity = 0;
}
function closeInspect(instant) {
  if (!insp) return;
  if (instant) { endInspect(); return; }
  insp.dir = -1; $('caption').classList.remove('on');
}
function endInspect() {
  if (!insp) return;
  hud.remove(insp.obj); items[insp.i].pivot.visible = true; insp = null; setMode('explore'); $('caption').classList.remove('on');
}
function updateInspect(dt) {
  if (!insp) return false;
  insp.t = clamp(insp.t + insp.dir * dt * 2.2, 0, 1);
  if (!insp.grab) insp.spinY += dt * 0.45;
  const e = ease(insp.t), it = items[insp.i], D = 0.85;
  // target pose, in camera space
  tmpV.set(0, 0.015, -D).applyQuaternion(camera.quaternion).add(camera.position);
  tmpE.set(insp.spinX, insp.spinY, 0); tmpQ.setFromEuler(tmpE); tmpQ.premultiply(camera.quaternion);
  const sTarget = 0.5 / it.maxDim;
  const from = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
  it.pivot.matrixWorld.decompose(from.p, from.q, from.s);
  insp.obj.position.copy(from.p).lerp(tmpV, e);
  insp.obj.quaternion.copy(from.q).slerp(tmpQ, e);
  insp.obj.scale.setScalar(lerp(from.s.x, sTarget, e));
  if (insp.t >= 1 && !$('caption').classList.contains('on') && insp.dir > 0) $('caption').classList.add('on');
  if (insp.t <= 0 && insp.dir < 0) { endInspect(); return false; }
  return true;
}

// ---------------------------------------------------------------- input
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let ptr = null;
const rect = () => el.getBoundingClientRect();
function pickItem(x, y) {
  const r = rect(); ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  camera.updateMatrixWorld();
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(items.filter((it) => it.pivot.visible).map((it) => it.pivot), true);
  if (!hits.length) return -1;
  let o = hits[0].object; while (o && !items.some((it) => it.pivot === o)) o = o.parent;
  return items.findIndex((it) => it.pivot === o);
}
const bookPoint = (x, y) => { camera.updateMatrixWorld(); rig.updateMatrixWorld(true); return bk.localPoint(x, y, camera, rect()); };

el.addEventListener('pointerdown', (e) => {
  if (!bk || e.button > 0 || $('loader')) return;
  el.setPointerCapture(e.pointerId);
  ptr = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, kind: 'look', item: -1 };
  if (mode === 'read') { ptr.kind = bk.press(bookPoint(e.clientX, e.clientY), e.clientX, e.clientY) ? 'book' : 'bg'; }
  else if (mode === 'inspect') { ptr.kind = 'inspect'; insp && (insp.grab = true); }
  else if (bk.isOver(bookPoint(e.clientX, e.clientY))) ptr.kind = 'bookopen';
  else ptr.item = pickItem(e.clientX, e.clientY);
  dirty = true;
});
el.addEventListener('pointermove', (e) => {
  const r = rect(); tiltT = { x: ((e.clientX - r.left) / r.width * 2 - 1) * 0.07, y: ((e.clientY - r.top) / r.height * 2 - 1) * 0.04 };
  if (mode === 'read' && zoomT > 1 && !(ptr && ptr.kind === 'book')) panT = { x: (e.clientX - r.left) / r.width * 2 - 1, y: -((e.clientY - r.top) / r.height * 2 - 1) };
  if (ptr) {
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr.x = e.clientX; ptr.y = e.clientY;
    if (!ptr.moved && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 6) ptr.moved = true;
    if (ptr.kind === 'book') bk.dragTo(bookPoint(e.clientX, e.clientY), e.clientX, e.clientY);
    else if (ptr.kind === 'look' && ptr.moved) { look.yaw += dx * 0.0042; look.pitch = clamp(look.pitch + dy * 0.0035, -0.8, 0.8); }
    else if (ptr.kind === 'inspect' && insp) { insp.spinY += dx * 0.01; insp.spinX = clamp(insp.spinX + dy * 0.008, -1.2, 1.2); }
  } else if (mode === 'explore') {
    const over = bk && bk.isOver(bookPoint(e.clientX, e.clientY));
    const hi = over ? -1 : pickItem(e.clientX, e.clientY);
    hoverIdx = hi; el.style.cursor = over || hi >= 0 ? 'pointer' : 'grab';
    const tip = $('tip'); tip.style.opacity = hi >= 0 ? 1 : 0;
    if (hi >= 0) { tip.textContent = items[hi].def.title; tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`; }
  } else if (mode === 'read') {
    const p = bookPoint(e.clientX, e.clientY); el.style.cursor = bk.canGrab(p) ? 'grab' : 'default';
  }
  dirty = true;
});
const up = () => {
  if (!ptr) return; const p = ptr; ptr = null;
  if (insp) insp.grab = false;
  if (p.kind === 'book') bk.release();
  else if (p.kind === 'bg' && !p.moved && mode === 'read') setMode('explore');
  else if (p.kind === 'bookopen' && !p.moved) setMode('read');
  else if (p.kind === 'look' && !p.moved && p.item >= 0) startInspect(p.item);
  else if (p.kind === 'inspect' && !p.moved) closeInspect();
  dirty = true;
};
el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
el.addEventListener('pointerleave', () => { tiltT = { x: 0, y: 0 }; hoverIdx = -1; $('tip').style.opacity = 0; dirty = true; });
el.addEventListener('wheel', (e) => { e.preventDefault(); if (mode === 'read') { zoomT = clamp(zoomT * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM); if (zoomT === 1) panT = { x: 0, y: 0 }; dirty = true; } }, { passive: false });
const stepRing = (d) => { ringStepT += d * (Math.PI * 2 / ITEMS.length); ringAuto = performance.now() + 4000; dirty = true; };
window.addEventListener('keydown', (e) => {
  if (!bk || $('loader')) return;
  if (e.key === 'Escape') { mode === 'inspect' ? closeInspect() : mode === 'read' && setMode('explore'); }
  else if (e.key === 'ArrowRight') mode === 'read' ? bk.next() : mode === 'explore' && stepRing(1);
  else if (e.key === 'ArrowLeft') mode === 'read' ? bk.prev() : mode === 'explore' && stepRing(-1);
  else if (e.key === 'Enter' && mode === 'explore') setMode('read');
  else if (e.key === 'p' || e.key === 'P') setPaper(PAPER === 'green' ? 'cream' : 'green');
  else if (e.key === 't' || e.key === 'T') setGrain(!grain);
  else if (mode === 'read' && (e.key === '+' || e.key === '=')) { zoomT = clamp(zoomT * 1.25, 1, MAX_ZOOM); }
  else if (mode === 'read' && e.key === '-') { zoomT = clamp(zoomT / 1.25, 1, MAX_ZOOM); if (zoomT === 1) panT = { x: 0, y: 0 }; }
  dirty = true;
});

// ---------------------------------------------------------------- paper colour switch
const paperBlobs = { [PAPER]: texBlob };                    // paper -> { p1..p6: blob url }; the other paper is fetched on demand
async function fetchPaper(paper) {
  if (paperBlobs[paper]) return paperBlobs[paper];
  const out = {};
  await Promise.all(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map(async (n) => { out[n] = URL.createObjectURL(await (await fetch(`textures/paper-${paper}/${n}.webp`)).blob()); }));
  return (paperBlobs[paper] = out);
}
async function setPaper(paper) {
  if (paper === PAPER || !bk) return;
  const blobs = await fetchPaper(paper);
  if (await bk.setPaper((n) => blobs[n])) {
    PAPER = paper; dirty = true;
    document.querySelectorAll('#paper button[data-paper]').forEach((b) => b.classList.toggle('on', b.dataset.paper === paper));
    try { const u = new URL(location.href); u.searchParams.set('paper', paper); history.replaceState(null, '', u); } catch (_) { /* file:// etc. */ }
  }
}
document.querySelectorAll('#paper button[data-paper]').forEach((b) => { b.classList.toggle('on', b.dataset.paper === PAPER); b.onclick = () => setPaper(b.dataset.paper); });

// ---------------------------------------------------------------- tactile paper layer (CSS blend layers, see index.html)
// ?grain=<0..1>  layer opacity (0 = off, default 0.8)    ?grainsize=<0.25..1.5>  grain size relative to the scan tile (default 0.5; smaller = finer)
const Q = new URLSearchParams(location.search), num = (k, d, lo, hi) => { const v = parseFloat(Q.get(k)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const TILE_PX = 512;                                                              // texture size of paper-grain.webp
let grainOpacity = num('grain', 0.8, 0, 1), grainSize = num('grainsize', 0.5, 0.25, 1.5), grain = grainOpacity > 0;
function applyGrain() {
  const root = document.documentElement.style, dpr = Math.min(2, window.devicePixelRatio || 1);
  root.setProperty('--grain', String(grainOpacity || 0.8));
  root.setProperty('--tile', (TILE_PX * grainSize / dpr).toFixed(1) + 'px');     // 1.0 = one texture pixel per device pixel; 0.75 = grain 25 % smaller
  $('gbuild').textContent = `texture build 4 · tile ${(TILE_PX * grainSize / dpr).toFixed(0)} px · screen x${(window.devicePixelRatio || 1).toFixed(2)}`;
  $('gsize').value = Math.round(grainSize * 100); $('gsizev').textContent = Math.round(grainSize * 100) + '%';
  $('gop').value = Math.round(grainOpacity * 100); $('gopv').textContent = Math.round(grainOpacity * 100) + '%';
  document.body.classList.toggle('grain-off', !grain); $('grainbtn').classList.toggle('on', grain);
  try { const u = new URL(location.href); u.searchParams.set('grain', grain ? grainOpacity.toFixed(2) : '0'); u.searchParams.set('grainsize', grainSize.toFixed(2)); history.replaceState(null, '', u); } catch (_) { /* file:// etc. */ }
  dirty = true;
}
const setGrain = (on) => { grain = on; if (on && grainOpacity <= 0) grainOpacity = 0.8; applyGrain(); };
$('grainbtn').onclick = () => setGrain(!grain);
$('gearbtn').onclick = () => { const o = $('gpanel').classList.toggle('open'); $('gearbtn').classList.toggle('on', o); };
$('gsize').oninput = (ev) => { grainSize = ev.target.value / 100; applyGrain(); };
$('gop').oninput = (ev) => { grainOpacity = ev.target.value / 100; grain = grainOpacity > 0; applyGrain(); };
window.addEventListener('resize', applyGrain);
applyGrain();

// ---------------------------------------------------------------- UI wiring
function syncUI() { if (!bk) return; $('label').textContent = SPREAD_LABELS[bk.turned]; $('pprev').disabled = bk.turned === 0; $('pnext').disabled = bk.turned === bk.total; dirty = true; }
$('pprev').onclick = () => bk.prev(); $('pnext').onclick = () => bk.next();
$('rprev').onclick = () => stepRing(-1); $('rnext').onclick = () => stepRing(1);
$('open').onclick = () => setMode('read'); $('close').onclick = () => setMode('explore'); $('putback').onclick = () => closeInspect();
$('zin').onclick = () => { zoomT = clamp(zoomT * 1.4, 1, MAX_ZOOM); dirty = true; };
$('zout').onclick = () => { zoomT = clamp(zoomT / 1.4, 1, MAX_ZOOM); if (zoomT === 1) panT = { x: 0, y: 0 }; dirty = true; };
PLACES.forEach((p) => { const b = document.createElement('button'); b.textContent = p.label; b.dataset.id = p.id; b.onclick = () => goPlace(p); $('places').appendChild(b); });
setMode('explore');

// ---------------------------------------------------------------- frame
const vTmp = new THREE.Vector3(), qTmp = new THREE.Quaternion(), eTmp = new THREE.Euler();
let last = performance.now(), running = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 20); last = now; time += dt;
  let active = dirty; dirty = false;

  // look
  const kl = 1 - Math.exp(-dt * 12);
  lookS.yaw += (look.yaw - lookS.yaw) * kl; lookS.pitch += (look.pitch - lookS.pitch) * kl;
  if (Math.abs(look.yaw - lookS.yaw) + Math.abs(look.pitch - lookS.pitch) > 1e-4) active = true;
  camera.position.copy(basePos); camera.rotation.set(lookS.pitch, baseYaw + lookS.yaw, 0);

  // carousel
  const wantAuto = mode === 'explore' && performance.now() > ringAuto ? (hoverIdx >= 0 ? 0.03 : 0.22) : 0;
  ringSpeed += (wantAuto - ringSpeed) * (1 - Math.exp(-dt * 3));
  ringStep += (ringStepT - ringStep) * (1 - Math.exp(-dt * 5));
  const ringMoving = ringSpeed > 0.002 || Math.abs(ringStepT - ringStep) > 1e-3;
  if (ringMoving) active = true;
  ringStepT += ringSpeed * dt;
  const ra = ringStep, N = items.length;
  items.forEach((it, i) => {
    const a = ra + (i * Math.PI * 2) / N, R = place.car.r;
    it.pivot.position.copy(ringC).addScaledVector(ringF, -Math.cos(a) * R).addScaledVector(ringR, Math.sin(a) * R);
    it.pivot.position.y += Math.sin(time * 0.9 + i * 1.7) * 0.012;
    it.pivot.rotation.y = time * 0.5 + i;
  });

  // book + HUD
  const tk = 1 - Math.exp(-dt * 7); const mT = mode === 'read' ? 1 : 0;
  if (Math.abs(m - mT) > 0.0005) { m += (mT - m) * tk; active = true; } else m = mT;
  zoom += (zoomT - zoom) * tk; pan.x += (panT.x - pan.x) * tk; pan.y += (panT.y - pan.y) * tk;
  tilt.x += (tiltT.x - tilt.x) * tk; tilt.y += (tiltT.y - tilt.y) * tk;
  if (Math.abs(zoom - zoomT) + Math.abs(pan.x - panT.x) + Math.abs(pan.y - panT.y) + Math.abs(tilt.x - tiltT.x) + Math.abs(tilt.y - tiltT.y) > 5e-4) active = true;
  rig.visible = mode !== 'inspect';
  bk.setTilt(tilt.x, tilt.y); bk.setShadow(ease(m));
  if (bk.update(dt) || bk.dragging) active = true;
  if (updateInspect(dt)) active = true;

  const visH = 2 * Math.tan(FOV * rad / 2), visW = visH * camera.aspect, cs = bk.contentSize(), e = ease(m);
  const sRead = Math.min((visH * 0.86) / cs.h, (visW * 0.95) / cs.w) * zoom;
  const sExp = Math.min((visH * 0.36) / 2.2, (visW * 0.36) / 2.6);
  const openK = clamp((cs.w - 1.4) / 1.5, 0, 1);
  const s = lerp(sExp, sRead, e);
  const exX = visW / 2 - 0.16 * visH - openK * 0.1 * visH, exY = -visH / 2 + 0.23 * visH;
  const extraX = Math.max(0, cs.w * s / 2 - visW * 0.46), extraY = Math.max(0, cs.h * s / 2 - visH * 0.46);
  vTmp.set(lerp(exX, -pan.x * extraX * e, e), lerp(exY, 0.035 * visH - pan.y * extraY * e, e), -1);
  rig.position.copy(camera.position).add(vTmp.applyQuaternion(camera.quaternion));
  eTmp.set(lerp(-0.32, 0, e), lerp(-0.3, 0, e), lerp(0.08, 0, e)); qTmp.setFromEuler(eTmp);
  rig.quaternion.copy(camera.quaternion).multiply(qTmp); rig.scale.setScalar(s);
  dim.position.copy(camera.position).add(vTmp.set(0, 0, -1.5).applyQuaternion(camera.quaternion)); dim.quaternion.copy(camera.quaternion);
  const dimTarget = (mode === 'read' ? 0.55 : mode === 'inspect' ? 0.35 : 0) * (mode === 'inspect' ? (insp ? ease(insp.t) : 0) : e);
  dim.material.opacity = dimTarget; dim.visible = dimTarget > 0.002;

  if (active || mode === 'explore') {
    renderer.clear(); renderer.render(scene, camera); renderer.clearDepth(); renderer.render(hud, camera);
  }
}

function resize() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
}
new ResizeObserver(resize).observe(stage); resize();

// ---------------------------------------------------------------- loader screen -> enter
await loadAll;
syncUI(); placeNow(PLACES[0]);
Intro.setReady();

if (location.search.includes('debug')) window.__ex = { items, startInspect, closeInspect, goPlace, PLACES, camera, look, basePos, get sidetableHolder() { return sidetableHolder; } };   // dev handle (?debug)
