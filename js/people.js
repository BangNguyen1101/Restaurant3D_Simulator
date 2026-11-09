// Tạo nhân vật đa dạng: giàu / bình dân / sinh viên, nam / nữ, nhiều kiểu trang phục.
import * as THREE from 'three';

const R = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;
const matCache = {};
const M = (hex, o = {}) => (matCache[hex + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.75, ...o }));
const GOLD = M(0xd4af37, { metalness: 0.9, roughness: 0.25 });

const SKINS = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e];
const HAIR = [0x1b1b1b, 0x3b2314, 0x6a4325, 0xb07a3c, 0xd9b26a, 0x8a1f1f];
const GREY = 0xbdbdbd;

// Mỗi kiểu khách có trang phục, độ kiên nhẫn, tiền tip và khẩu vị riêng
export const WEALTH = {
  rich:    { label: '💎 Thượng lưu', patience: 55, tip: 0.8, likes: ['deluxe', 'burgerR', 'deluxe', 'salad'] },
  normal:  { label: 'Khách thường',  patience: 75, tip: 0.35, likes: ['burger', 'salad', 'burgerR', 'deluxe'] },
  student: { label: '🎒 Sinh viên',   patience: 95, tip: 0.1, likes: ['burger', 'salad', 'burger'] },
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m;
}

// Chân có khớp hông + khớp gối để đi bộ / ngồi
function leg(side, pantsMat, shoeMat, skinMat, bare) {
  const hip = new THREE.Group(); hip.position.set(side * 0.1, 0.78, 0);
  hip.add(mesh(new THREE.CylinderGeometry(0.078, 0.068, 0.38, 10), bare ? skinMat : pantsMat, 0, -0.19, 0));
  const knee = new THREE.Group(); knee.position.y = -0.38; hip.add(knee);
  knee.add(mesh(new THREE.CylinderGeometry(0.066, 0.056, 0.36, 10), bare ? skinMat : pantsMat, 0, -0.18, 0));
  knee.add(mesh(new THREE.BoxGeometry(0.11, 0.07, 0.22), shoeMat, 0, -0.37, 0.04));
  hip.userData.knee = knee;
  return hip;
}

export function randomProfile() {
  const r = Math.random();
  const wealth = r < 0.3 ? 'rich' : r < 0.8 ? 'normal' : 'student';
  const gender = chance(0.5) ? 'm' : 'f';
  const old = chance(0.15);
  return { wealth, gender, old };
}

export function buildPerson(p) {
  const g = new THREE.Group();
  const skin = M(R(SKINS));
  const hairCol = p.old ? GREY : R(HAIR);
  const hair = M(hairCol, { roughness: 0.9 });
  const f = p.gender === 'f';
  let top, pants, shoe, outfit = 'pants';
  const extras = [];

  if (p.wealth === 'rich') {
    shoe = M(f ? R([0x111111, 0x8b0000, 0xc9a24a]) : 0x111111, { roughness: 0.3 });
    if (f) {
      top = M(R([0x8b0000, 0x0b0b0b, 0x0f5132, 0x2b1d5c, 0xc9a24a]), { roughness: 0.4, metalness: 0.15 });
      outfit = 'dress'; pants = top;
      extras.push('necklace', 'handbag');
      if (chance(0.4)) extras.push('sunglasses');
    } else {
      top = M(R([0x14213d, 0x111111, 0x3a3a3a, 0x4b2e1e]), { roughness: 0.5 });
      pants = top; outfit = 'suit';
      extras.push('tie', 'watch');
      if (chance(0.3)) extras.push(R(['tophat', 'fedora']));
      if (chance(0.3)) extras.push('sunglasses');
    }
  } else if (p.wealth === 'normal') {
    shoe = M(R([0xffffff, 0x333333, 0x7a4a2a]));
    top = M(R([0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b, 0xec4899, 0xf5f5f5, 0x6b7280, 0x0ea5e9]));
    if (f && chance(0.5)) { outfit = 'skirt'; pants = M(R([0x1f2937, 0x7c3aed, 0xbe185d, 0xd6c7a1])); }
    else pants = M(R([0x1e3a8a, 0x334155, 0xa3906a, 0x1f2937]));
    if (chance(0.25)) extras.push('glasses');
    if (!f && chance(0.25)) extras.push('cap');
    if (f && chance(0.4)) extras.push('handbag');
  } else {
    shoe = M(R([0xffffff, 0xff4d4d, 0x222222]));
    top = M(R([0x6b7280, 0x16a34a, 0x9333ea, 0xf97316, 0x0f172a]));
    pants = M(R([0x1e3a8a, 0x111827, 0x4b5563]));
    outfit = 'hoodie';
    extras.push('backpack');
    if (chance(0.4)) extras.push('glasses');
    if (chance(0.3)) extras.push(f ? 'beanie' : 'cap');
  }

  // đồng phục nhân viên
  if (p.uniform) {
    top = M(p.uniform.top); pants = M(p.uniform.pants); shoe = M(0x111111);
    outfit = p.uniform.outfit || 'pants';
    extras.length = 0; extras.push(...(p.uniform.extras || []));
  }

  // --- chân / váy ---
  const bareLegs = outfit === 'skirt' || outfit === 'dress';
  const legL = leg(-1, pants, shoe, skin, bareLegs), legR = leg(1, pants, shoe, skin, bareLegs);
  g.add(legL, legR);
  if (outfit === 'skirt') g.add(mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.38, 14), pants, 0, 0.62, 0));
  if (outfit === 'dress') g.add(mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.7, 16), top, 0, 0.55, 0));

  // --- thân ---
  const bodyW = f ? 0.2 : 0.24;
  g.add(mesh(new THREE.CylinderGeometry(bodyW, bodyW - 0.03, 0.62, 14), top, 0, 1.1, 0));
  if (outfit === 'suit') {
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.42, 0.02), M(0xffffff), 0, 1.2, bodyW - 0.01));
  }
  if (outfit === 'hoodie') {
    const hood = mesh(new THREE.TorusGeometry(0.15, 0.06, 8, 16), top, 0, 1.4, -0.06);
    hood.rotation.x = Math.PI / 2.6; g.add(hood);
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.12, 0.03), top, 0, 0.95, bodyW - 0.02));
  }
  // --- tay ---
  const sleeve = outfit === 'dress' ? skin : top;
  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.56, 8), sleeve, s * (bodyW + 0.06), 1.1, 0);
    arm.rotation.z = s * 0.08; g.add(arm);
    g.add(mesh(new THREE.SphereGeometry(0.055, 8, 6), skin, s * (bodyW + 0.08), 0.8, 0));
  }
  // --- đầu ---
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skin, 0, 1.45, 0));
  const head = mesh(new THREE.SphereGeometry(0.17, 18, 14), skin, 0, 1.62, 0);
  head.scale.set(1, 1.08, 1); g.add(head);
  const eye = M(0x111111);
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.022, 6, 6), eye, s * 0.06, 1.65, 0.155));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), M(0x9c4a4a), 0, 1.55, 0.165));

  // --- tóc ---
  const bald = !f && p.old && chance(0.5);
  if (!bald) {
    const cap = mesh(new THREE.SphereGeometry(0.178, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.65, -0.01);
    cap.scale.set(1.03, 1.05, 1.06); g.add(cap);
    if (f) {
      const style = p.wealth === 'rich' ? R(['bun', 'long']) : R(['long', 'ponytail', 'bob']);
      if (style === 'long') g.add(mesh(new THREE.BoxGeometry(0.34, 0.42, 0.12), hair, 0, 1.47, -0.12));
      if (style === 'bob') g.add(mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.2, 14, 1, true), hair, 0, 1.6, -0.01));
      if (style === 'bun') g.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), hair, 0, 1.8, -0.12));
      if (style === 'ponytail') { const pt = mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.3, 8), hair, 0, 1.55, -0.2); pt.rotation.x = 0.4; g.add(pt); }
    }
  }
  // --- phụ kiện ---
  for (const e of extras) {
    if (e === 'tie') g.add(mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), M(R([0x8b0000, 0xc9a24a, 0x1d3557])), 0, 1.18, bodyW + 0.005));
    if (e === 'watch') g.add(mesh(new THREE.TorusGeometry(0.055, 0.015, 6, 12), GOLD, bodyW + 0.08, 0.88, 0));
    if (e === 'necklace') { const n = mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 20), R([GOLD, M(0xf8f8f0, { roughness: 0.2 })]), 0, 1.38, 0.07); n.rotation.x = Math.PI / 2.3; g.add(n); }
    if (e === 'handbag') { const b = mesh(new THREE.BoxGeometry(0.2, 0.16, 0.08), M(R([0x111111, 0xc9a24a, 0x8b0000, 0xf5e6c8]), { roughness: 0.4 }), -(bodyW + 0.14), 0.85, 0); g.add(b); }
    if (e === 'backpack') g.add(mesh(new THREE.BoxGeometry(0.32, 0.4, 0.16), M(R([0x1f2937, 0xdc2626, 0x2563eb, 0x059669])), 0, 1.12, -bodyW - 0.06));
    if (e === 'glasses' || e === 'sunglasses') {
      const gm = e === 'sunglasses' ? M(0x050505, { roughness: 0.1, metalness: 0.5 }) : M(0x222222);
      for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.08, e === 'sunglasses' ? 0.05 : 0.04, 0.01), gm, s * 0.06, 1.65, 0.168));
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), gm, 0, 1.66, 0.168));
    }
    if (e === 'tophat') {
      g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), M(0x0a0a0a), 0, 1.78, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.28, 20), M(0x0a0a0a), 0, 1.92, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.04, 20), M(0x8b0000), 0, 1.81, 0));
    }
    if (e === 'fedora') {
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), M(0x3b3127), 0, 1.78, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 20), M(0x3b3127), 0, 1.85, 0));
    }
    if (e === 'cap') {
      g.add(mesh(new THREE.SphereGeometry(0.185, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(R([0xdc2626, 0x111827, 0x2563eb, 0xffffff])), 0, 1.68, 0));
      g.add(mesh(new THREE.BoxGeometry(0.22, 0.02, 0.16), M(0x111827), 0, 1.69, 0.2));
    }
    if (e === 'chefhat') {
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.25, 14), M(0xffffff), 0, 1.86, 0));
      g.add(mesh(new THREE.SphereGeometry(0.21, 14, 10), M(0xffffff), 0, 2.02, 0));
    }
    if (e === 'apron') g.add(mesh(new THREE.BoxGeometry(0.34, 0.6, 0.02), M(0x2f3338), 0, 0.92, bodyW + 0.01));
    if (e === 'bowtie') {
      for (const s of [-1, 1]) { const b = mesh(new THREE.ConeGeometry(0.04, 0.07, 4), M(0x111111), s * 0.035, 1.38, bodyW + 0.01); b.rotation.z = s * Math.PI / 2; g.add(b); }
    }
    if (e === 'vest') g.add(mesh(new THREE.CylinderGeometry(bodyW + 0.01, bodyW - 0.02, 0.5, 14, 1, true, Math.PI * 0.15, Math.PI * 1.7), M(0x111111), 0, 1.08, 0));
    if (e === 'beanie') g.add(mesh(new THREE.SphereGeometry(0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), M(R([0xf59e0b, 0x7c3aed, 0x111827])), 0, 1.67, 0));
  }

  g.userData.legs = [legL, legR];
  return g;
}

// Hoạt ảnh: đi bộ / đứng / ngồi
export function animatePerson(body, mode, t) {
  const [l, r] = body.userData.legs;
  if (mode === 'sit') {
    l.rotation.x = r.rotation.x = -1.5;
    l.userData.knee.rotation.x = r.userData.knee.rotation.x = 1.5;
    return;
  }
  const a = mode === 'walk' ? Math.sin(t) * 0.5 : 0;
  l.rotation.x = a; r.rotation.x = -a;
  l.userData.knee.rotation.x = Math.max(0, -Math.sin(t)) * (mode === 'walk' ? 0.6 : 0);
  r.userData.knee.rotation.x = Math.max(0, Math.sin(t)) * (mode === 'walk' ? 0.6 : 0);
}
