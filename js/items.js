// Nguyên liệu, trạng thái, công thức và hình 3D của vật phẩm.
import * as THREE from 'three';

// process: cách biến đổi nguyên liệu. finalState: trạng thái được phép lên đĩa.
export const ING = {
  bun:     { name: 'Bánh mì',  process: null,   finalState: 'raw' },
  meat:    { name: 'Thịt',     process: 'cook', finalState: 'cooked' },
  lettuce: { name: 'Rau',      process: 'chop', finalState: 'chopped' },
  tomato:  { name: 'Cà chua',  process: 'chop', finalState: 'chopped' },
};

export const STATE_NAME = { raw: 'sống', cooked: 'chín', burnt: 'cháy', chopped: 'đã cắt' };

export const RECIPES = [
  { id: 'burger',  name: 'Burger',          icon: '🍔', parts: ['bun', 'meat'],                       price: 18 },
  { id: 'salad',   name: 'Salad',           icon: '🥗', parts: ['lettuce', 'tomato'],                 price: 14 },
  { id: 'burgerR', name: 'Burger rau',      icon: '🥬', parts: ['bun', 'meat', 'lettuce'],            price: 26 },
  { id: 'deluxe',  name: 'Burger đặc biệt', icon: '⭐', parts: ['bun', 'meat', 'lettuce', 'tomato'],  price: 35 },
];

export const newIng = (type) => ({ kind: 'ing', type, state: 'raw', mesh: null });
export const newPlate = () => ({ kind: 'plate', contents: [], dirty: false, mesh: null });

// Nguyên liệu đã sẵn sàng lên đĩa chưa? trả về key ('meat'...) hoặc null
export function finalKey(item) {
  if (!item || item.kind !== 'ing') return null;
  return ING[item.type].finalState === item.state ? item.type : null;
}

export function canAddToPlate(plate, key) {
  if (!plate || plate.kind !== 'plate' || plate.dirty || !key) return false;
  if (plate.contents.includes(key)) return false;
  const next = [...plate.contents, key];
  return RECIPES.some((r) => next.every((k) => r.parts.includes(k)));
}

export function matchRecipe(contents) {
  return RECIPES.find((r) => r.parts.length === contents.length && r.parts.every((p) => contents.includes(p))) || null;
}

export function itemName(item) {
  if (!item) return '';
  if (item.kind === 'plate') {
    if (item.dirty) return 'Đĩa bẩn';
    if (!item.contents.length) return 'Đĩa trống';
    const r = matchRecipe(item.contents);
    const list = item.contents.map((k) => ING[k].name).join(' + ');
    return r ? `${r.icon} ${r.name} (hoàn thành)` : `Đĩa: ${list}`;
  }
  const def = ING[item.type];
  return def.process ? `${def.name} ${STATE_NAME[item.state]}` : def.name;
}

// ===== Mesh =====
const M = {};
const mat = (hex) => (M[hex] ||= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7 }));
const geo = {
  bunBottom: new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16),
  bunTop: new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  patty: new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16),
  ball: new THREE.SphereGeometry(0.13, 14, 10),
  leaf: new THREE.CylinderGeometry(0.19, 0.19, 0.02, 9),
  slice: new THREE.CylinderGeometry(0.14, 0.14, 0.025, 14),
  piece: new THREE.BoxGeometry(0.08, 0.03, 0.08),
  plate: new THREE.CylinderGeometry(0.28, 0.22, 0.04, 24),
};
const meatColor = { raw: 0xe58a8a, cooked: 0x7a4a2a, burnt: 0x1d1612 };

function mesh(g, hex, y = 0) {
  const m = new THREE.Mesh(g, mat(hex));
  m.position.y = y; m.castShadow = true;
  return m;
}

function ingMesh(type, state, onPlate = false) {
  const g = new THREE.Group();
  if (type === 'bun') {
    g.add(mesh(geo.bunBottom, 0xd9a05b, 0.03));
    if (!onPlate) g.add(mesh(geo.bunTop, 0xd9a05b, 0.07));
  } else if (type === 'meat') {
    g.add(mesh(geo.patty, meatColor[state], 0.03));
  } else if (type === 'lettuce') {
    if (state === 'chopped' || onPlate) g.add(mesh(geo.leaf, 0x5fb54a, 0.01));
    else { const b = mesh(geo.ball, 0x6fc25a, 0.12); b.scale.set(1.1, 0.9, 1.1); g.add(b); }
  } else if (type === 'tomato') {
    if (state === 'chopped' && !onPlate) {
      for (let i = 0; i < 3; i++) { const s = mesh(geo.slice, 0xd8352a, 0.015 + i * 0.03); s.position.x = (i - 1) * 0.05; g.add(s); }
    } else if (onPlate) g.add(mesh(geo.slice, 0xd8352a, 0.012));
    else g.add(mesh(geo.ball, 0xe0442f, 0.12));
  }
  return g;
}

const STACK = ['bun', 'meat', 'lettuce', 'tomato'];
const THICK = { bun: 0.06, meat: 0.06, lettuce: 0.025, tomato: 0.03 };

function plateMesh(p) {
  const g = new THREE.Group();
  g.add(mesh(geo.plate, p.dirty ? 0xb8ad94 : 0xf7f7f2, 0.02));
  if (p.dirty) {
    for (let i = 0; i < 4; i++) {
      const c = mesh(geo.piece, 0x6b4a2a, 0.05);
      c.position.x = Math.cos(i * 1.7) * 0.12; c.position.z = Math.sin(i * 1.7) * 0.12;
      g.add(c);
    }
    return g;
  }
  let y = 0.04;
  for (const k of STACK) {
    if (!p.contents.includes(k)) continue;
    const m = ingMesh(k, ING[k].finalState, true);
    m.position.y = y; g.add(m); y += THICK[k];
  }
  if (p.contents.includes('bun')) {
    const top = mesh(geo.bunTop, 0xd9a05b, y); g.add(top);
  }
  return g;
}

// Tạo/cập nhật mesh của item, giữ nguyên vị trí & cha hiện tại
export function refreshMesh(item) {
  const old = item.mesh;
  const m = item.kind === 'plate' ? plateMesh(item) : ingMesh(item.type, item.state);
  m.userData.item = item;
  if (old && old.parent) {
    m.position.copy(old.position);
    m.rotation.copy(old.rotation);
    old.parent.add(m);
    old.parent.remove(old);
  }
  item.mesh = m;
  return m;
}

export function attachItem(item, parent, local) {
  if (!item.mesh) refreshMesh(item);
  parent.add(item.mesh);
  item.mesh.position.copy(local);
  item.mesh.rotation.set(0, 0, 0);
}

export function destroyItem(item) {
  if (item && item.mesh && item.mesh.parent) item.mesh.parent.remove(item.mesh);
}
