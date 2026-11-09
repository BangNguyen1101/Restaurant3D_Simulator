// Thế giới dạng lưới ô vuông + tìm đường A* (thay cho NavMesh của Unity/Godot).
import * as THREE from 'three';
import { game } from './state.js';

export const W = 24, H = 18;
export const T = { FLOOR: 0, WALL: 1, LOCKED: 2, STREET: 3 };

export const grid = {
  base: new Uint8Array(W * H),     // loại nền
  occ: new Array(W * H).fill(null) // đồ vật đang chiếm ô (station / table / decor)
};

export const SPAWN = [4, 17];          // ô ngoài đường, khách xuất hiện & rời đi
export const DOOR = [[4, 15], [5, 15]];

export const idx = (x, z) => z * W + x;
export const inB = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
export const tileCenter = (x, z, y = 0) => new THREE.Vector3(x + 0.5, y, z + 0.5);
export const toTile = (v) => [Math.floor(v.x), Math.floor(v.z)];

export function isWalkable(x, z) {
  if (!inB(x, z)) return false;
  const b = grid.base[idx(x, z)];
  if (b === T.WALL || b === T.LOCKED) return false;
  return grid.occ[idx(x, z)] === null;
}

export function isBuildable(x, z) {
  return inB(x, z) && grid.base[idx(x, z)] === T.FLOOR && grid.occ[idx(x, z)] === null && z < 15;
}

// ===== Các giai đoạn mở rộng =====
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const EXPANSIONS = [
  {
    no: 1, price: 300, name: 'Phòng ăn giữa',
    walls: range(6, 14).map((z) => [9, z]),
    area: { x0: 10, x1: 15, z0: 6, z1: 14 },
    sign: { x: 8.98, z: 10.5 },
  },
  {
    no: 2, price: 700, name: 'Phòng VIP phía đông',
    walls: range(6, 14).map((z) => [16, z]),
    area: { x0: 17, x1: 22, z0: 1, z1: 14 },
    sign: { x: 15.98, z: 10.5 },
  },
];
EXPANSIONS.forEach((e) => { e.kind = 'expansion'; e.unlocked = false; });

// Vách ngăn bếp (z=5): quầy ra món được phép đặt thay vào tường
export const isPartitionWall = (x, z) => z === 5 && x >= 1 && x <= 15 && inB(x, z) && grid.base[idx(x, z)] === T.WALL;
export function removeWall(x, z) {
  grid.base[idx(x, z)] = T.FLOOR;
  const m = wallMeshes.get(idx(x, z));
  if (m) { game.scene.remove(m); wallMeshes.delete(idx(x, z)); }
}

const wallMeshes = new Map();
const floorMeshes = new Map();
const mats = {};
const WINDOWS = [2, 7, 11, 14, 18, 21]; // các ô tường mặt tiền (z=15) làm cửa kính

function region(x, z) {
  if (z >= 16) return 'street';
  if (z < 5 && x < 16) return 'kitchen';
  return 'dining';
}

export function buildLayout() {
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    let t = T.FLOOR;
    if (z >= 16) t = T.STREET;
    else if (x === 0 || x === 23 || z === 0 || z === 15) t = T.WALL;
    if (DOOR.some(([a, b]) => a === x && b === z)) t = T.FLOOR; // cửa chính
    // vách bếp: chừa lối đi x=2 và 2 ô quầy ra món x=6,7
    if (z === 5 && x >= 1 && x <= 15 && x !== 2 && x !== 6 && x !== 7) t = T.WALL;
    if (x === 16 && z >= 1 && z <= 5) t = T.WALL; // tường đông của bếp
    grid.base[idx(x, z)] = t;
  }
  for (const e of EXPANSIONS) {
    for (const [x, z] of e.walls) grid.base[idx(x, z)] = T.WALL;
    for (let z = e.area.z0; z <= e.area.z1; z++) for (let x = e.area.x0; x <= e.area.x1; x++) grid.base[idx(x, z)] = T.LOCKED;
  }
}

// ===== Texture vẽ bằng canvas =====
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  return tex;
}

function marble(g, w, h, base, vein, seed) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  g.strokeStyle = vein; g.lineWidth = 1.2; g.globalAlpha = 0.35;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = rnd() * w, y = 0;
    g.moveTo(x, y);
    while (y < h) { x += (rnd() - 0.5) * 30; y += 10 + rnd() * 14; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
}

function makeFloorTex(kind) {
  if (kind === 'dining') return canvasTex(128, 128, (g, w, h) => {
    marble(g, w, h, '#ece6dc', '#8d8478', 7);
    g.fillStyle = '#c9a24a'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); // ron vàng
  });
  if (kind === 'kitchen') return canvasTex(64, 64, (g) => {
    g.fillStyle = '#3b3f45'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#34383d'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    g.fillStyle = '#2a2d31'; g.fillRect(0, 0, 64, 1); g.fillRect(0, 0, 1, 64); g.fillRect(0, 32, 64, 1); g.fillRect(32, 0, 1, 64);
  });
  if (kind === 'street') return canvasTex(64, 64, (g) => { // gạch lát vỉa hè (khớp với street.js)
    g.fillStyle = '#b9b3a8'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#aaa398'; g.fillRect(0, 0, 31, 31); g.fillRect(33, 33, 31, 31);
    g.fillStyle = '#8f897f'; g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64);
  });
  return canvasTex(32, 32, (g) => { g.fillStyle = '#262422'; g.fillRect(0, 0, 32, 32); });
}

function floorMat(kind) {
  return (mats['f_' + kind] ||= new THREE.MeshStandardMaterial({ map: makeFloorTex(kind), roughness: kind === 'dining' ? 0.25 : 0.85, metalness: 0.05 }));
}

// Tường phòng ăn: ốp gỗ óc chó phía dưới, viền vàng, phía trên xanh ngọc lục bảo
const luxWallTex = () => canvasTex(128, 384, (g, w, h) => {
  g.fillStyle = '#1f4a3c'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h * 0.65);
  g.fillStyle = '#c9a24a'; g.fillRect(0, h * 0.06, w, 4);
  g.fillStyle = '#4a2f1d'; g.fillRect(0, h * 0.66, w, h * 0.34);
  g.strokeStyle = '#6b4730'; g.lineWidth = 3; g.strokeRect(14, h * 0.7, w - 28, h * 0.26);
  g.fillStyle = '#d9b45c'; g.fillRect(0, h * 0.655, w, 5);
});
const kitchenWallTex = () => canvasTex(128, 384, (g, w, h) => {
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#d4d6d8';
  for (let y = 0; y < h; y += 20) { g.fillRect(0, y, w, 2); for (let x = (y / 20) % 2 ? 0 : 20; x < w; x += 40) g.fillRect(x, y, 2, 20); }
  g.fillStyle = '#2f3338'; g.fillRect(0, h * 0.8, w, h * 0.2);
});

export function buildWorldMeshes(scene) {
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.rotateX(-Math.PI / 2);
  const wallGeo = new THREE.BoxGeometry(1, 3, 1);
  const luxMat = new THREE.MeshStandardMaterial({ map: luxWallTex(), roughness: 0.6 });
  const kitMat = new THREE.MeshStandardMaterial({ map: kitchenWallTex(), roughness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc7d8, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.6 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.8, roughness: 0.3 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.25 });

  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const b = grid.base[idx(x, z)];
    const kind = b === T.LOCKED ? 'locked' : region(x, z);
    const f = new THREE.Mesh(plane, floorMat(kind));
    f.position.set(x + 0.5, 0, z + 0.5);
    f.receiveShadow = true;
    scene.add(f);
    floorMeshes.set(idx(x, z), f);
    if (b !== T.WALL) continue;
    const exp = EXPANSIONS.find((e) => e.walls.some(([a, c]) => a === x && c === z));
    let m;
    if (z === 15 && WINDOWS.includes(x)) {
      // cửa kính mặt tiền
      m = new THREE.Group();
      const low = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1), luxMat); low.position.y = 0.4; m.add(low);
      const up = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), luxMat); up.position.y = 2.75; m.add(up);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.7, 0.05), glassMat); glass.position.y = 1.65; m.add(glass);
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.7, 0.08), frameMat); bar1.position.y = 1.65; m.add(bar1);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 1.06), goldMat); sill.position.y = 0.81; m.add(sill);
      m.position.set(x + 0.5, 0, z + 0.5);
    } else {
      m = new THREE.Mesh(wallGeo, z < 5 && x < 17 ? kitMat : luxMat);
      m.position.set(x + 0.5, 1.5, z + 0.5);
      m.castShadow = true; m.receiveShadow = true;
    }
    m.traverse?.((o) => { if (o.isMesh) { o.castShadow = o.material !== glassMat; o.receiveShadow = true; } });
    scene.add(m);
    wallMeshes.set(idx(x, z), m);
    if (exp) { m.userData.interact = exp; game.interactables.push(m); }
  }

  // Trần nhà (không đổ bóng để nắng vẫn chiếu qua) + đèn âm trần
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), new THREE.MeshStandardMaterial({ color: 0x2b2522, roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(12, 3, 8);
  scene.add(ceil);

  // Biển "MỞ RỘNG" trên các bức tường khóa
  for (const e of EXPANSIONS) {
    const tex = canvasTex(512, 256, (g) => {
      g.fillStyle = '#14281f'; g.fillRect(0, 0, 512, 256);
      g.strokeStyle = '#d9b45c'; g.lineWidth = 10; g.strokeRect(10, 10, 492, 236);
      g.fillStyle = '#f3e7c4'; g.font = 'bold 54px "Times New Roman", serif'; g.textAlign = 'center';
      g.fillText(`MỞ RỘNG ${e.no}`, 256, 95);
      g.font = '32px "Times New Roman", serif'; g.fillText(e.name, 256, 145);
      g.fillStyle = '#d9b45c'; g.font = 'bold 50px "Times New Roman", serif';
      g.fillText(`$${e.price}  [E]`, 256, 212);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(e.sign.x, 1.8, e.sign.z);
    sign.rotation.y = -Math.PI / 2;
    scene.add(sign);
    e.signMesh = sign;
  }
}

// free = true khi khôi phục từ file lưu (không trừ tiền, không thông báo)
export function unlockExpansion(e, free = false) {
  if (e.unlocked) return false;
  const prev = EXPANSIONS[EXPANSIONS.indexOf(e) - 1];
  if (!free) {
    if (prev && !prev.unlocked) { game.toast(`Phải mở "${prev.name}" trước!`); return false; }
    if (game.money < e.price) { game.toast(`Cần $${e.price} để mở rộng (đang có $${game.money})`); return false; }
    game.money -= e.price;
    game.daily.spent += e.price;
  }
  e.unlocked = true;
  for (const [x, z] of e.walls) {
    grid.base[idx(x, z)] = T.FLOOR;
    const m = wallMeshes.get(idx(x, z));
    if (m) { game.scene.remove(m); game.interactables.splice(game.interactables.indexOf(m), 1); wallMeshes.delete(idx(x, z)); }
    floorMeshes.get(idx(x, z)).material = floorMat('dining');
  }
  for (let z = e.area.z0; z <= e.area.z1; z++) for (let x = e.area.x0; x <= e.area.x1; x++) {
    grid.base[idx(x, z)] = T.FLOOR;
    floorMeshes.get(idx(x, z)).material = floorMat('dining');
  }
  game.scene.remove(e.signMesh);
  game.emit('expanded', e);
  if (!free) game.toast(`🎉 Đã mở "${e.name}"! Bấm B để đặt thêm bàn ghế.`);
  return true;
}

// Còn chỗ đặt thêm 1 bàn (3 ô ngang hoặc dọc) không?
export function hasRoomForTable() {
  for (let z = 6; z < 15; z++) for (let x = 1; x < 23; x++) {
    if ([[x - 1, z], [x, z], [x + 1, z]].every(([a, b]) => isBuildable(a, b))) return true;
    if ([[x, z - 1], [x, z], [x, z + 1]].every(([a, b]) => isBuildable(a, b))) return true;
  }
  return false;
}

// ===== A* trên lưới, 8 hướng, không cắt góc =====
export function findPath(sx, sz, tx, tz, allowTarget = false) {
  if (!inB(tx, tz)) return null;
  if (!allowTarget && !isWalkable(tx, tz)) return null;
  if (sx === tx && sz === tz) return [];
  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const f = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = [];
  const hfn = (x, z) => { const dx = Math.abs(x - tx), dz = Math.abs(z - tz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const s = idx(sx, sz), t = idx(tx, tz);
  g[s] = 0; f[s] = hfn(sx, sz); open.push(s);
  const pass = (x, z) => isWalkable(x, z) || (allowTarget && x === tx && z === tz);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (cur === t) {
      const path = [];
      let c = cur;
      while (c !== s) { path.push([c % W, Math.floor(c / W)]); c = came[c]; }
      return path.reverse();
    }
    closed[cur] = 1;
    const cx = cur % W, cz = Math.floor(cur / W);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (!inB(nx, nz) || !pass(nx, nz)) continue;
      if (dx && dz && (!isWalkable(cx + dx, cz) || !isWalkable(cx, cz + dz))) continue;
      const n = idx(nx, nz);
      if (closed[n]) continue;
      const ng = g[cur] + (dx && dz ? 1.414 : 1);
      if (ng < g[n]) {
        g[n] = ng; f[n] = ng + hfn(nx, nz); came[n] = cur;
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  return null;
}

// BFS: các ô đi tới được từ cửa (dùng để kiểm tra đặt đồ không chặn đường)
export function reachableFrom(sx, sz) {
  const seen = new Uint8Array(W * H);
  const q = [[sx, sz]]; seen[idx(sx, sz)] = 1;
  while (q.length) {
    const [x, z] = q.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (isWalkable(nx, nz) && !seen[idx(nx, nz)]) { seen[idx(nx, nz)] = 1; q.push([nx, nz]); }
    }
  }
  return seen;
}

// Các ô đứng được xung quanh một vật chiếm nhiều ô
export function accessTiles(tiles) {
  const out = [];
  for (const [x, z] of tiles) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, nz = z + dz;
    if (isWalkable(nx, nz) && !out.some(([a, b]) => a === nx && b === nz)) out.push([nx, nz]);
  }
  return out;
}

// ===== Agent: thứ gì tự đi theo đường (khách, nhân viên) =====
export class Agent {
  constructor(x, z, speed = 2.2) {
    this.group = new THREE.Group();
    this.group.position.copy(tileCenter(x, z));
    this.path = [];
    this.speed = speed;
  }
  get tile() { return toTile(this.group.position); }
  goTo(tx, tz, allowTarget = false) {
    const [sx, sz] = this.tile;
    const p = findPath(sx, sz, tx, tz, allowTarget);
    if (!p) return false;
    this.path = p;
    return true;
  }
  goToEntity(ent) {
    const pos = this.group.position;
    const cands = accessTiles(ent.tiles).sort((a, b) =>
      (a[0] + 0.5 - pos.x) ** 2 + (a[1] + 0.5 - pos.z) ** 2 - ((b[0] + 0.5 - pos.x) ** 2 + (b[1] + 0.5 - pos.z) ** 2));
    for (const [x, z] of cands) if (this.goTo(x, z)) return true;
    return false;
  }
  step(dt) {
    if (!this.path.length) return true;
    const [x, z] = this.path[0];
    const target = tileCenter(x, z);
    const pos = this.group.position;
    const d = target.clone().sub(pos); d.y = 0;
    const len = d.length();
    const mv = this.speed * dt;
    if (len <= mv) { pos.x = target.x; pos.z = target.z; this.path.shift(); }
    else { d.multiplyScalar(mv / len); pos.add(d); }
    if (len > 0.001) this.faceDir(d.x, d.z, dt);
    this.walkAnim = (this.walkAnim || 0) + dt * 9;
    return this.path.length === 0;
  }
  faceDir(dx, dz, dt = 1) {
    const a = Math.atan2(dx, dz);
    let diff = a - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * Math.min(1, dt * 12);
  }
  facePoint(v) {
    const p = this.group.position;
    this.group.rotation.y = Math.atan2(v.x - p.x, v.z - p.z);
  }
}
