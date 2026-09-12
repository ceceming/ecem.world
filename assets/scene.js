/*
 * ecem.world — animated 3D object for the "coming soon" page.
 *
 * Renders a model on a fully TRANSPARENT canvas, so whatever is behind it
 * (the black page) shows through.
 *
 * Motion:
 *   a slow, continuous drift — six sine waves on unrelated periods, so
 *   nothing ever starts, lands, or repeats.
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
 * either model.glb (easiest — one single file) or model.obj. Capitalised
 * spellings work too. Everything below is tried in order; the first file
 * that exists wins. If nothing is found, a placeholder shape is shown.
 * ------------------------------------------------------------------ */
const MODEL_FILES = ['model.glb', 'model.gltf', 'model.obj'];

/* Web servers are case-sensitive about filenames, and a file saved straight
 * out of an export tool often arrives capitalised. Both spellings are tried
 * so "Model.glb" works exactly as well as "model.glb". */
export const MODEL_CANDIDATES = MODEL_FILES.flatMap((name) => [
  `model/${name}`,
  `model/${name[0].toUpperCase()}${name.slice(1)}`,
]);

/* Tweak these if your model comes in sideways or upside down. Values are
 * degrees, applied once when the model is loaded. */
export const MODEL_ORIENTATION = { x: 0, y: 0, z: 0 };

/* ------------------------------------------------------------------ *
 * 2. THE MOTION — a drift, not a loop
 *
 * Six independent waves, each with its own period. The periods share no
 * common multiple worth speaking of, so the combined motion takes weeks to
 * come back around: there is no beat to catch and nothing ever restarts.
 * The glyph simply keeps drifting, the way something suspended in water
 * does.
 *
 * Every channel is a plain sine, so position, velocity and acceleration are
 * all continuous — there is no frame anywhere at which something snaps,
 * accelerates or lands. That is the whole trick: serenity is the absence of
 * events, not slow events.
 *
 * Amplitudes are fractions of the glyph's height (normalised to 1), except
 * the three rotations, which are degrees. Periods are seconds. Raising a
 * period makes that channel slower and calmer; raising an amplitude makes it
 * travel further.
 * ------------------------------------------------------------------ */
const DRIFT = {
  rise:   { amplitude: 0.042, period:  9.3, phase: 0.0 },  // up and down
  sway:   { amplitude: 0.020, period: 19.7, phase: 1.7 },  // side to side
  turn:   { amplitude: 7.5,   period: 13.1, phase: 0.0 },  // left and right
  tilt:   { amplitude: 2.4,   period: 17.3, phase: 2.2 },  // lean
  nod:    { amplitude: 1.8,   period: 11.6, phase: 0.9 },  // toward and away
  breath: { amplitude: 0.005, period:  8.1, phase: 0.4 },  // barely-there scale
};

/* The glyph is normalised to 1 unit tall and centred on the origin, so it
 * turns about its own middle rather than pivoting on its base. How large it
 * then looks on the page is set by --stage in index.html, not here. */
const TARGET_HEIGHT = 1;

const wave = ({ amplitude, period, phase }, t) =>
  amplitude * Math.sin((2 * Math.PI * t) / period + phase);

/* The pose at any moment. No cycle, no segments, no special cases — the
 * same handful of sines evaluated at whatever time it happens to be. */
function poseAt(t) {
  const degrees = THREE.MathUtils.degToRad;
  return {
    x: wave(DRIFT.sway, t),
    y: wave(DRIFT.rise, t),
    yaw: degrees(wave(DRIFT.turn, t)),
    roll: degrees(wave(DRIFT.tilt, t)),
    pitch: degrees(wave(DRIFT.nod, t)),
    scale: 1 + wave(DRIFT.breath, t),
  };
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
  // Fit by height, but never let a wide or deep model spill out sideways.
  const scale = Math.min(
    TARGET_HEIGHT / Math.max(size.y, 1e-6),
    (TARGET_HEIGHT * 1.3) / Math.max(size.x, size.z, 1e-6)
  );

  const pivot = new THREE.Group();   // carries the drift
  const holder = new THREE.Group();  // holds the recentred model
  holder.add(object);
  // Centred on the origin, not stood on a floor: a floating glyph should
  // turn about its own middle, not pivot on its base.
  object.position.sub(centre);
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
  // The glyph sits centred on the origin, so the frame is symmetric about it:
  // just enough margin for the drift to move within, and no dead headroom.
  // A slight lift keeps us looking at it rather than straight on.
  camera.position.set(0, 0.08, 2.6);
  camera.lookAt(0, 0, 0);

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
    camera.position.z = 2.6 / Math.min(1, Math.max(0.62, camera.aspect));
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(resize).observe(container);
  }
  window.addEventListener('resize', resize);
  resize();

  function applyPose(pose) {
    pivot.position.set(pose.x, pose.y, 0);
    pivot.rotation.set(pose.pitch, pose.yaw, pose.roll);
    pivot.scale.setScalar(pose.scale);
  }

  const stillPlease = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Elapsed animation time is accumulated rather than read off the clock, so
  // coming back to a backgrounded tab picks up exactly where it left off
  // instead of snapping to wherever the wall clock has got to.
  let elapsed = 0;
  let previous = null;
  let running = false;
  let frame = 0;

  function tick(now) {
    frame = requestAnimationFrame(tick);
    if (previous !== null) {
      // Cap the step so a dropped or delayed frame nudges the drift forward
      // rather than teleporting it.
      elapsed += Math.min((now - previous) / 1000, 1 / 20);
    }
    previous = now;
    applyPose(poseAt(elapsed));
    renderer.render(scene, camera);
  }

  function start() {
    if (running || stillPlease.matches) return;
    running = true;
    previous = null;          // first frame back advances nothing
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
      applyPose(poseAt(0));
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
