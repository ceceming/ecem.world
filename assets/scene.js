/*
 * ecem.world — animated 3D object for the "coming soon" page.
 *
 * Renders a model on a fully TRANSPARENT canvas, so whatever is behind it
 * (the black page) shows through.
 *
 * Animation loop:
 *   5 small hops  ->  a little left/right dance  ->  one big hop  ->  repeat
 */

import * as THREE from 'three';
import { OBJLoader } from '../vendor/three/loaders/OBJLoader.js';
import { MTLLoader } from '../vendor/three/loaders/MTLLoader.js';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { RoomEnvironment } from '../vendor/three/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------ *
 * 1. WHERE YOUR MODEL LIVES
 *
 * Drop your Meshy export into the /model folder and name the main file
 * either model.glb (easiest — one single file) or model.obj.
 * Everything below is tried in order; the first file that exists wins.
 * If nothing is found, a placeholder shape is shown instead.
 * ------------------------------------------------------------------ */
export const MODEL_CANDIDATES = [
  'model/model.glb',
  'model/model.gltf',
  'model/model.obj',
];

/* Tweak these if your model comes in sideways or upside down. Values are
 * degrees, applied once when the model is loaded. */
export const MODEL_ORIENTATION = { x: 0, y: 0, z: 0 };

/* ------------------------------------------------------------------ *
 * 2. THE CHOREOGRAPHY — all the timing knobs in one place
 * ------------------------------------------------------------------ */
const CHOREO = {
  smallHopsPerCycle: 5,
  smallHop: { duration: 0.62, height: 0.30, crouch: 0.16, air: 0.64 },
  dance:    { duration: 1.90, yaw: 24, wiggles: 2, bob: 0.05 },
  bigHop:   { duration: 1.25, height: 1.15, crouch: 0.24, air: 0.58 },
  beat:     0.16, // small breath between the dance and the big hop
};

/* The object is normalised so it is exactly 1 unit tall with its feet at
 * y = 0, which keeps the hop heights above meaningful for any model. */
const TARGET_HEIGHT = 1;

/* ------------------------------------------------------------------ *
 * Easing helpers
 * ------------------------------------------------------------------ */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInQuad = (t) => t * t;

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* ------------------------------------------------------------------ *
 * A single hop, expressed as a pose.
 *
 *   u  : 0 -> 1 progress through this hop
 * Returns { y, squash }, where squash is the vertical scale factor; the
 * horizontal scale is derived from it so the volume stays believable. The
 * curve is continuous across every sub-phase, so nothing visibly pops.
 * ------------------------------------------------------------------ */
function hopPose(u, { height, crouch, air }) {
  const land = 1 - crouch - air;
  const CROUCHED = 0.78;                       // how far it presses down
  const PUSH_OFF = 0.18;                       // slice of the jump spent unfolding
  const IMPACT = 0.34;                         // slice of the landing spent absorbing
  // Stretched along the direction of travel: tallest at take-off and landing,
  // very slightly squat at the apex where it is barely moving.
  const stretch = (speed) => 1 + 0.20 * speed - 0.05 * (1 - speed);

  // Anticipation: press down into the ground before pushing off.
  if (u < crouch) {
    const p = easeInQuad(u / crouch);
    return { y: 0, squash: 1 + (CROUCHED - 1) * p };
  }

  // Airborne: a clean parabola, unfolding out of the crouch as it leaves.
  if (u < crouch + air) {
    const a = (u - crouch) / air;
    const y = height * 4 * a * (1 - a);
    const speed = Math.abs(1 - 2 * a);         // 1 at take-off & landing, 0 at the apex
    const target = stretch(speed);
    const squash = a < PUSH_OFF
      ? CROUCHED + (target - CROUCHED) * easeOutCubic(a / PUSH_OFF)
      : target;
    return { y, squash };
  }

  // Landing: absorb the impact, then spring back with a little overshoot.
  const p = clamp((u - crouch - air) / land, 0, 1);
  const landedWith = stretch(1);
  const squash = p < IMPACT
    ? landedWith + (CROUCHED - landedWith) * easeOutCubic(p / IMPACT)
    : CROUCHED + (1 - CROUCHED) * easeOutBack((p - IMPACT) / (1 - IMPACT));
  return { y: 0, squash };
}

/* ------------------------------------------------------------------ *
 * The dance: two right/left sways, easing in and out of stillness.
 * ------------------------------------------------------------------ */
function dancePose(u, cfg) {
  const envelope = Math.sin(Math.PI * clamp(u, 0, 1)); // 0 -> 1 -> 0
  const sway = Math.sin(2 * Math.PI * cfg.wiggles * u);
  const yaw = THREE.MathUtils.degToRad(cfg.yaw) * sway * envelope;
  const roll = -0.30 * yaw;                       // lean into the turn
  const y = cfg.bob * envelope * (1 - Math.cos(4 * Math.PI * cfg.wiggles * u)) / 2;
  const squash = 1 - 0.05 * envelope * Math.cos(4 * Math.PI * cfg.wiggles * u);
  return { y, yaw, roll, squash };
}

/* ------------------------------------------------------------------ *
 * The full cycle, as a list of timed segments.
 * ------------------------------------------------------------------ */
function buildCycle() {
  const segments = [];
  for (let i = 0; i < CHOREO.smallHopsPerCycle; i++) {
    segments.push({ kind: 'hop', duration: CHOREO.smallHop.duration, cfg: CHOREO.smallHop });
  }
  segments.push({ kind: 'dance', duration: CHOREO.dance.duration, cfg: CHOREO.dance });
  segments.push({ kind: 'rest', duration: CHOREO.beat });
  segments.push({ kind: 'hop', duration: CHOREO.bigHop.duration, cfg: CHOREO.bigHop });
  segments.push({ kind: 'rest', duration: CHOREO.beat });
  return segments;
}

const CYCLE = buildCycle();
const CYCLE_LENGTH = CYCLE.reduce((sum, s) => sum + s.duration, 0);

/* Pose for any point in time, in seconds, looping forever. */
function poseAt(time) {
  let t = time % CYCLE_LENGTH;
  for (const segment of CYCLE) {
    if (t < segment.duration) {
      const u = t / segment.duration;
      if (segment.kind === 'hop') {
        const { y, squash } = hopPose(u, segment.cfg);
        return { y, yaw: 0, roll: 0, squash };
      }
      if (segment.kind === 'dance') {
        return dancePose(u, segment.cfg);
      }
      return { y: 0, yaw: 0, roll: 0, squash: 1 };
    }
    t -= segment.duration;
  }
  return { y: 0, yaw: 0, roll: 0, squash: 1 };
}

/* ------------------------------------------------------------------ *
 * Model loading
 * ------------------------------------------------------------------ */
async function fileExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    return res.ok;
  } catch (err) {
    return false; // offline, or opened straight from the filesystem
  }
}

async function loadOBJ(url) {
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const source = await fetch(url, { cache: 'no-cache' }).then((r) => r.text());

  // The .obj names its own material file on an "mtllib" line — follow it, so
  // the Meshy filenames can stay exactly as they were exported.
  const declared = source.match(/^\s*mtllib\s+(.+)$/m);
  const mtlNames = [];
  if (declared) mtlNames.push(declared[1].trim());
  mtlNames.push('model.mtl');

  const objLoader = new OBJLoader();
  for (const name of mtlNames) {
    if (!(await fileExists(dir + name))) continue;
    try {
      const materials = await new MTLLoader()
        .setPath(dir)
        .setResourcePath(dir)
        .loadAsync(name);
      materials.preload();
      objLoader.setMaterials(materials);
      break;
    } catch (err) {
      console.warn('Could not read material file', name, err);
    }
  }

  return objLoader.parse(source);
}

async function loadGLTF(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.scene;
}

function makePlaceholder() {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5, 1),
    new THREE.MeshStandardMaterial({
      color: 0xf4f2ee,
      roughness: 0.34,
      metalness: 0.04,
      flatShading: true,
    })
  );
  // Deliberately not a sphere: a pebble with a front and a side, so the
  // little dance is actually visible until the real model arrives.
  mesh.scale.set(1, 0.94, 0.78);
  mesh.rotation.set(0.18, 0.42, 0.06);

  const group = new THREE.Group();
  group.add(mesh);
  group.userData.isPlaceholder = true;
  return group;
}

async function loadModel() {
  for (const url of MODEL_CANDIDATES) {
    if (!(await fileExists(url))) continue;
    try {
      const object = url.endsWith('.obj') ? await loadOBJ(url) : await loadGLTF(url);
      console.info('Loaded model:', url);
      return object;
    } catch (err) {
      console.warn('Found but could not load', url, err);
    }
  }
  console.info('No model found in /model — showing the placeholder shape.');
  return makePlaceholder();
}

/* Centre the object on the origin, stand it on y = 0 and scale it to a
 * predictable height, whatever units it was exported in. */
function normalise(object) {
  object.rotation.set(
    THREE.MathUtils.degToRad(MODEL_ORIENTATION.x),
    THREE.MathUtils.degToRad(MODEL_ORIENTATION.y),
    THREE.MathUtils.degToRad(MODEL_ORIENTATION.z)
  );
  object.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = TARGET_HEIGHT / Math.max(size.y, 1e-6);

  const pivot = new THREE.Group();   // rotates and squashes
  const holder = new THREE.Group();  // holds the recentred model
  holder.add(object);
  object.position.sub(centre);
  object.position.y += size.y / 2;   // feet on the floor
  holder.scale.setScalar(scale);
  pivot.add(holder);

  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material) continue;
        if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
        // Exported meshes are often not watertight and some faces end up
        // wound backwards; drawing both sides keeps the model from looking
        // hollow, at no meaningful cost for a single object.
        material.side = THREE.DoubleSide;
      }
    }
  });

  return pivot;
}

/* ------------------------------------------------------------------ *
 * The scene
 * ------------------------------------------------------------------ */
export async function createScene(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,             // transparent background
    powerPreference: 'high-performance',
  });
  renderer.setClearAlpha(0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  // Framed so the object fills the stage at rest but the big hop still has
  // room at the top, with a slight downward tilt so we look at it, not up at it.
  camera.position.set(0, 1.15, 4.9);
  camera.lookAt(0, 0.95, 0);

  // A soft studio environment so PBR (.glb) materials have something to
  // reflect, plus explicit lights that also flatter plain .obj materials.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose(); // the generated texture outlives the generator

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 0.6));

  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(3, 5, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.55);
  fill.position.set(-4, 2, 3);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.set(-2.5, 3, -5);
  scene.add(rim);

  const pivot = normalise(await loadModel());
  scene.add(pivot);

  function resize() {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Pull back on narrow, portrait containers so nothing clips at the sides.
    camera.position.z = 4.9 / Math.min(1, Math.max(0.62, camera.aspect));
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0.95, 0);
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(container);
  }
  window.addEventListener('resize', resize);
  resize();

  function applyPose(pose) {
    const squash = pose.squash ?? 1;
    const spread = 1 / Math.sqrt(Math.max(squash, 1e-3)); // keep the volume
    pivot.position.y = pose.y ?? 0;
    pivot.rotation.y = pose.yaw ?? 0;
    pivot.rotation.z = pose.roll ?? 0;
    pivot.scale.set(spread, squash, spread);
  }

  const stillPlease = window.matchMedia('(prefers-reduced-motion: reduce)');

  let clockStart = performance.now();
  let running = false;
  let frame = 0;

  function tick(now) {
    frame = requestAnimationFrame(tick);
    applyPose(poseAt((now - clockStart) / 1000));
    renderer.render(scene, camera);
  }

  function start() {
    if (running || stillPlease.matches) return;
    running = true;
    clockStart = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
  }

  // Don't burn a phone battery animating a tab nobody is looking at.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  stillPlease.addEventListener?.('change', () => {
    if (stillPlease.matches) {
      stop();
      applyPose({ y: 0, yaw: 0, roll: 0, squash: 1 });
      renderer.render(scene, camera);
    } else {
      start();
    }
  });

  applyPose(poseAt(0));
  renderer.render(scene, camera);
  start();

  return { scene, camera, renderer, pivot, start, stop };
}
