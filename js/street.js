// Con phố bên ngoài quán: vỉa hè, lòng đường, vạch kẻ, nhà cửa, cửa hàng,
// đèn đường, cây xanh, xe cộ và người đi bộ qua lại.
import * as THREE from 'three';
import { game } from './state.js';
import { buildPerson, animatePerson, randomProfile } from './people.js';

// Toạ độ (đơn vị = 1 ô lưới). Mặt tiền quán ở z = 16.
export const STREET = {
  walkZ: 18.5,          // làn người đi bộ phía quán (ngoài lối vào của khách)
  curbZ: 19.2,
  road0: 19.4, road1: 26.6,
  farWalkZ: 27.7,       // vỉa hè bên kia đường
  farFront: 28.8,       // mặt tiền dãy nhà bên kia
  x0: -45, x1: 70,
};

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

const paverTex = () => canvasTex(64, 64, (g) => {
  g.fillStyle = '#b9b3a8'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#aaa398';
  g.fillRect(0, 0, 31, 31); g.fillRect(33, 33, 31, 31);
  g.fillStyle = '#8f897f'; g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64);
});

// Mặt tiền nhà: 4×4 ô cửa sổ / texture. Bản emissive là cửa sổ sáng đèn ban đêm.
function facadeTextures(wall, frame) {
  const lit = [];
  for (let i = 0; i < 16; i++) lit.push(Math.random() < 0.55);
  const draw = (night) => (g) => {
    g.fillStyle = night ? '#000' : wall; g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = c * 64 + 16, y = r * 64 + 12;
      if (night) { if (lit[r * 4 + c]) { g.fillStyle = pick(['#ffd27a', '#ffe7b0', '#fff2d0', '#ffc46b']); g.fillRect(x, y, 32, 40); } continue; }
      g.fillStyle = frame; g.fillRect(x - 3, y - 3, 38, 46);
      g.fillStyle = '#5d7a8c'; g.fillRect(x, y, 32, 40);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, 32, 8);
      g.fillStyle = frame; g.fillRect(x + 15, y, 2, 40);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 4, y + 42, 40, 4);
    }
  };
  return { map: canvasTex(256, 256, draw(false)), emissive: canvasTex(256, 256, draw(true)) };
}

const WALLS = [
  ['#c9b79c', '#f2ead8'], ['#a8574a', '#ead9c5'], ['#e3d4b5', '#6b4a36'], ['#7e8c8f', '#e9e9e2'],
  ['#d9c7a8', '#3d3d3d'], ['#9a6b4f', '#f1e2c8'], ['#e8e2d6', '#2f4f4f'], ['#b8c4bb', '#ffffff'],
];
const facadeSet = WALLS.map(([w, f]) => facadeTextures(w, f));
const cityMats = []; // material có cửa sổ sáng ban đêm
const shopGlass = []; // kính mặt tiền cửa hàng

function facadeMat(i, w, h) {
  const set = facadeSet[i % facadeSet.length];
  const map = set.map.clone(); map.needsUpdate = true; map.repeat.set(w / 4, h / 4);
  const em = set.emissive.clone(); em.needsUpdate = true; em.repeat.set(w / 4, h / 4);
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
  cityMats.push(m);
  return m;
}

const SHOPS = [
  ['CAFÉ', '#3b2a20', '#e8c07a'], ['BAKERY', '#8b3a2f', '#ffe8c8'], ['HOA TƯƠI', '#2f6b4a', '#ffffff'],
  ['NHÀ SÁCH', '#1f3a5f', '#f3e3b5'], ['PHARMACY', '#0f7a5a', '#ffffff'], ['MINI MART', '#c0392b', '#ffffff'],
  ['TIỆM TÓC', '#5b2a6b', '#ffd6f0'], ['BOUTIQUE', '#111111', '#d9b45c'], ['TRÀ SỮA', '#a0522d', '#fff1d6'],
];
const signMats = [];

// Một toà nhà. face = +1: mặt tiền nhìn về +z (dãy phía quán), -1: nhìn về -z (dãy bên kia đường)
function building(x0, x1, zFront, depth, floors, face, shop, upperOnly = false, facadeIdx = null) {
  const w = x1 - x0, h = floors * 3.2;
  const g = new THREE.Group();
  const cx = (x0 + x1) / 2, cz = zFront - face * depth / 2;
  const by = upperOnly ? 3.0 : 3.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - by, depth), facadeMat(facadeIdx ?? Math.floor(Math.random() * 99), w, h - by));
  body.position.set(cx, by + (h - by) / 2, cz); body.castShadow = true; body.receiveShadow = true; g.add(body);
  if (upperOnly) {
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.25, depth + 0.2), new THREE.MeshStandardMaterial({ color: 0x5b534a }));
    cornice.position.set(cx, h + 0.12, cz); g.add(cornice);
    game.scene.add(g);
    return;
  }
  // tầng trệt: cửa hàng mặt kính
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, depth), new THREE.MeshStandardMaterial({ color: pick([0x8a8178, 0x6f6a64, 0x9b8f80, 0x7a6f66]), roughness: 0.8 }));
  base.position.set(cx, 1.6, cz); base.receiveShadow = true; g.add(base);
  // kính cửa hàng: luôn hơi sáng (đèn trong tiệm), tối thì sáng rõ
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 2.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x3b4b58, emissive: 0xffd9a0, emissiveIntensity: 0.25, roughness: 0.1, metalness: 0.3 }));
  glass.userData.minGlow = 0.25;
  glass.position.set(cx, 1.4, zFront + face * 0.03); g.add(glass);
  shopGlass.push(glass.material);
  // mái che + biển hiệu
  if (shop) {
    const [name, bg, fg] = shop;
    const awn = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.08, 1.2), new THREE.MeshStandardMaterial({ color: bg }));
    awn.position.set(cx, 2.75, zFront + face * 0.6); awn.rotation.x = face * 0.22; awn.castShadow = true; g.add(awn);
    const tex = canvasTex(512, 96, (c) => {
      c.fillStyle = bg; c.fillRect(0, 0, 512, 96);
      c.fillStyle = fg; c.font = 'bold 60px "Segoe UI", sans-serif'; c.textAlign = 'center'; c.fillText(name, 256, 70);
    });
    const smat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });
    signMats.push(smat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.6, 4), 0.7), smat);
    sign.position.set(cx, 3.0, zFront + face * 0.06);
    if (face < 0) sign.rotation.y = Math.PI;
    g.add(sign);
  }
  // mái nhà
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.25, depth + 0.2), new THREE.MeshStandardMaterial({ color: 0x5b534a }));
  cornice.position.set(cx, h + 0.12, cz); g.add(cornice);
  game.scene.add(g);
}

// Dựng một dãy nhà liên tiếp từ xa → xb
function row(xa, xb, zFront, face, skip = null) {
  let x = xa;
  while (x < xb) {
    const w = Math.min(xb - x, Math.round(rnd(5, 9)));
    if (!(skip && x < skip[1] && x + w > skip[0])) {
      building(x, x + w, zFront, 10, Math.floor(rnd(2, 6)), face, Math.random() < 0.75 ? pick(SHOPS) : null);
    }
    x += w;
  }
}

// ===== Đèn đường =====
const lampLights = [];
const lampBulb = new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffd58a, emissiveIntensity: 0.2 });
function streetLamp(x, z, face, withLight) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2226, metalness: 0.6, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.6, 8), dark); pole.position.set(x, 2.3, z); pole.castShadow = true;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.0), dark); arm.position.set(x, 4.55, z + face * 0.5);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.5), dark); head.position.set(x, 4.5, z + face * 1.0);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.4), lampBulb); bulb.position.set(x, 4.43, z + face * 1.0);
  game.scene.add(pole, arm, head, bulb);
  if (withLight) {
    const l = new THREE.PointLight(0xffd9a0, 0, 14, 1.5);
    l.position.set(x, 4.2, z + face * 1.0);
    game.scene.add(l); lampLights.push(l);
  }
}

function tree(x, z) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x5a3e2b }));
  trunk.position.set(x, 1.1, z); trunk.castShadow = true;
  const leaves = new THREE.MeshStandardMaterial({ color: pick([0x3f7d3a, 0x4a8a42, 0x356b32]), roughness: 0.9 });
  game.scene.add(trunk);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.7, 1.0), 10, 8), leaves);
    b.position.set(x + rnd(-0.5, 0.5), 2.6 + rnd(0, 0.8), z + rnd(-0.5, 0.5)); b.castShadow = true;
    game.scene.add(b);
  }
  const pit = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1), new THREE.MeshStandardMaterial({ color: 0x3b2e24 }));
  pit.position.set(x, 0.02, z); game.scene.add(pit);
}

function bench(x, z, rotY) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.45), wood); seat.position.y = 0.45; g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.05), wood); back.position.set(0, 0.7, -0.2); g.add(back);
  for (const s of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), iron); l.position.set(s, 0.22, 0); g.add(l); }
  g.position.set(x, 0, z); g.rotation.y = rotY;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  game.scene.add(g);
}

// ===== Xe cộ =====
const CAR_COLORS = [0xc0392b, 0x2c3e50, 0xf1c40f, 0xecf0f1, 0x2980b9, 0x16a085, 0x7f8c8d, 0x111111];
const headMat = new THREE.MeshStandardMaterial({ color: 0xfffbe6, emissive: 0xfff2c0, emissiveIntensity: 0.2 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.3 });
function makeCar() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: pick(CAR_COLORS), metalness: 0.5, roughness: 0.35 });
  const isVan = Math.random() < 0.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(isVan ? 4.4 : 3.8, 0.7, 1.7), paint); body.position.y = 0.6; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(isVan ? 3.2 : 2.0, 0.6, 1.55), isVan ? paint : new THREE.MeshStandardMaterial({ color: 0x24313d, metalness: 0.6, roughness: 0.1 }));
  cab.position.set(isVan ? -0.4 : -0.2, 1.22, 0); g.add(cab);
  const wheelM = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const [x, z] of [[1.2, 0.85], [-1.2, 0.85], [1.2, -0.85], [-1.2, -0.85]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 14), wheelM);
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.33, z); g.add(w);
  }
  const L = isVan ? 2.2 : 1.9;
  for (const z of [-0.55, 0.55]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.3), headMat); hl.position.set(L, 0.7, z); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.3), tailMat); tl.position.set(-L, 0.7, z); g.add(tl);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  game.scene.add(g);
  return g;
}

const cars = [];
function spawnCars() {
  const lanes = [{ z: 21.2, dir: 1 }, { z: 24.8, dir: -1 }];
  for (const lane of lanes) for (let i = 0; i < 3; i++) {
    const m = makeCar();
    const c = { m, dir: lane.dir, z: lane.z, x: rnd(STREET.x0, STREET.x1), speed: rnd(5, 9) };
    m.rotation.y = lane.dir > 0 ? 0 : Math.PI;
    cars.push(c);
  }
}

// ===== Người đi bộ =====
const walkers = [];
function spawnWalker(initial) {
  const far = Math.random() < 0.5;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const body = buildPerson(randomProfile());
  const g = new THREE.Group(); g.add(body);
  const w = {
    g, body, dir, speed: rnd(1.1, 1.8), t: Math.random() * 10,
    z: (far ? STREET.farWalkZ : STREET.walkZ) + rnd(-0.15, 0.15),
    x: initial ? rnd(STREET.x0, STREET.x1) : (dir > 0 ? STREET.x0 : STREET.x1),
  };
  g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  game.scene.add(g);
  walkers.push(w);
}

export function buildStreet() {
  const S = STREET;
  // nền xa
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 200), new THREE.MeshStandardMaterial({ color: 0x55604f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(12, -0.03, 10); ground.receiveShadow = true; game.scene.add(ground);
  // vỉa hè phía quán (phần ngoài lưới) + bên kia đường
  const pav = (x0, x1, z0, z1) => {
    const w = x1 - x0, d = z1 - z0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: paverTex(), roughness: 0.9 }));
    m.material.map.repeat.set(w, d);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.005, (z0 + z1) / 2); m.receiveShadow = true;
    game.scene.add(m);
  };
  pav(S.x0, 0, 16, S.curbZ); pav(24, S.x1, 16, S.curbZ); pav(0, 24, 18, S.curbZ);
  pav(S.x0, S.x1, S.road1, S.farFront);
  // bó vỉa
  const curbM = new THREE.MeshStandardMaterial({ color: 0x9a958c });
  for (const z of [S.curbZ, S.road1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0, 0.15, 0.25), curbM);
    c.position.set((S.x0 + S.x1) / 2, 0.07, z + (z === S.curbZ ? 0.1 : -0.1)); game.scene.add(c);
  }
  // lòng đường nhựa + vạch
  const asphalt = canvasTex(128, 128, (g) => {
    g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.06)`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  }, (S.x1 - S.x0) / 4, (S.road1 - S.road0) / 4);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0, S.road1 - S.road0), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2; road.position.set((S.x0 + S.x1) / 2, 0.0, (S.road0 + S.road1) / 2); road.receiveShadow = true;
  game.scene.add(road);
  const white = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xf2c94c });
  const midZ = (S.road0 + S.road1) / 2;
  for (let x = S.x0; x < S.x1; x += 4) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.15), yellow);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.01, midZ); game.scene.add(d);
  }
  // vạch qua đường trước cửa quán
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, S.road1 - S.road0 - 0.6), white);
    s.rotation.x = -Math.PI / 2; s.position.set(2.6 + i * 0.85, 0.012, midZ); game.scene.add(s);
  }
  // nhà cửa: dãy bên kia đường + hai bên quán
  row(S.x0, S.x1, S.farFront, -1);
  row(S.x0, 0, 16, 1);
  row(24, S.x1, 16, 1);
  // tầng trên của chính toà nhà nhà hàng
  building(0, 24, 16, 16, 3, 1, null, true, 2);
  // đèn đường, cây, ghế đá
  let n = 0;
  for (let x = S.x0 + 4; x < S.x1; x += 10) {
    const near = Math.abs(x - 12) < 28;
    streetLamp(x, S.curbZ - 0.3, 1, near && n++ < 3);
    streetLamp(x + 5, S.road1 + 0.3, -1, near && n++ < 5);
    if (Math.abs(x + 3 - 5) > 3) tree(x + 3, S.curbZ - 0.2);
    tree(x + 8, S.road1 + 0.5);
  }
  bench(-3, 16.4, 0); bench(28, 16.4, 0); bench(14, S.road1 + 0.6, Math.PI);
  spawnCars();
  for (let i = 0; i < 14; i++) spawnWalker(true);
}

export function updateStreet(dt) {
  const night = game.night || 0;
  for (const m of cityMats) m.emissiveIntensity = night * 1.1;
  for (const m of shopGlass) m.emissiveIntensity = 0.25 + night * 0.35;
  for (const m of signMats) m.emissiveIntensity = 0.15 + night * 0.9;
  for (const l of lampLights) l.intensity = night * 22;
  lampBulb.emissiveIntensity = 0.2 + night * 2.5;
  headMat.emissiveIntensity = 0.2 + night * 2;
  tailMat.emissiveIntensity = 0.3 + night * 1.5;
  for (const c of cars) {
    c.x += c.dir * c.speed * dt;
    if (c.x > STREET.x1 + 5) c.x = STREET.x0 - 5;
    if (c.x < STREET.x0 - 5) c.x = STREET.x1 + 5;
    c.m.position.set(c.x, 0, c.z);
  }
  // ban ngày đông người, ban đêm vắng hơn
  const want = Math.round(14 - night * 9);
  for (let i = walkers.length - 1; i >= 0; i--) {
    const w = walkers[i];
    w.x += w.dir * w.speed * dt; w.t += dt * w.speed * 5;
    w.g.position.set(w.x, 0, w.z);
    animatePerson(w.body, 'walk', w.t);
    if (w.x > STREET.x1 + 2 || w.x < STREET.x0 - 2) {
      game.scene.remove(w.g); walkers.splice(i, 1);
      if (walkers.length < want) spawnWalker(false);
    }
  }
  if (walkers.length < want && Math.random() < dt * 0.5) spawnWalker(false);
}
