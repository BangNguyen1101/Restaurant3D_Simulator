// Trang trí nhà hàng hiện đại sang trọng: đèn chùm, cây cảnh, tranh, biển OPEN/CLOSED.
import * as THREE from 'three';
import { game } from './state.js';
import { grid, idx, tileCenter } from './world.js';

const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.25 });
const black = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.6, roughness: 0.35 });
const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1cc, emissive: 0xffd58a, emissiveIntensity: 1.5 });
game.lamps = [];      // PointLight trong nhà (ngày đêm điều chỉnh)
game.bulbs = bulbMat; // để ban đêm sáng hơn

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function addChandelier(x, z, power = 9) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), gold); rod.position.y = 2.75; g.add(rod);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 32), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 2.5; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 24), gold); ring2.rotation.x = Math.PI / 2; ring2.position.y = 2.35; g.add(ring2);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), bulbMat);
    b.position.set(Math.cos(a) * 0.45, 2.56, Math.sin(a) * 0.45); g.add(b);
  }
  const light = new THREE.PointLight(0xffd9a0, power, 11, 1.6);
  light.position.y = 2.3; g.add(light);
  game.lamps.push(light);
  game.scene.add(g);
}

export function addPlant(x, z) {
  if (grid.occ[idx(x, z)]) return;
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.55, 20), black); pot.position.y = 0.28; g.add(pot);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 20), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.55; g.add(rim);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.8 });
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), leafMat);
    leaf.scale.set(0.45, 1.6, 0.25);
    const a = i * 2.4;
    leaf.position.set(Math.cos(a) * 0.14, 0.95 + (i % 3) * 0.28, Math.sin(a) * 0.14);
    leaf.rotation.z = Math.cos(a) * 0.5; leaf.rotation.x = Math.sin(a) * 0.5;
    leaf.castShadow = true; g.add(leaf);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x4a3420 }));
  stem.position.y = 0.95; g.add(stem);
  g.position.copy(tileCenter(x, z));
  game.scene.add(g);
  grid.occ[idx(x, z)] = { kind: 'decor', tiles: [[x, z]] };
}

const PALETTES = [
  ['#1f4a3c', '#d9b45c', '#e9e1d0', '#9c3d2e'],
  ['#14213d', '#fca311', '#e5e5e5', '#7a1f2b'],
  ['#2b2d42', '#c9a24a', '#edf2f4', '#3d6b5a'],
];
let pSeed = 3;
export function addPainting(x, y, z, rotY, w = 1.3, h = 0.9) {
  const pal = PALETTES[pSeed++ % PALETTES.length];
  const tex = canvasTex(260, 180, (g, W, H) => {
    g.fillStyle = pal[2]; g.fillRect(0, 0, W, H);
    g.fillStyle = pal[0]; g.beginPath(); g.arc(W * 0.35, H * 0.55, 60, 0, Math.PI * 2); g.fill();
    g.fillStyle = pal[3]; g.fillRect(W * 0.55, H * 0.15, 70, 110);
    g.strokeStyle = pal[1]; g.lineWidth = 6; g.beginPath(); g.moveTo(20, H - 30); g.bezierCurveTo(90, 20, 170, 160, W - 20, 30); g.stroke();
  });
  const grp = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.04), gold); grp.add(frame);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  art.position.z = 0.025; grp.add(art);
  grp.position.set(x, y, z); grp.rotation.y = rotY;
  game.scene.add(grp);
}

function addSconce(x, z, rotY) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.03), gold); g.add(plate);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.18, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf6e7c1, emissive: 0xffc87a, emissiveIntensity: 0.8, side: THREE.DoubleSide }));
  shade.position.set(0, 0.12, 0.1); g.add(shade);
  g.position.set(x, 1.9, z); g.rotation.y = rotY;
  game.scene.add(g);
}

// ===== Biển OPEN / CLOSED + mái hiên =====
let signMat;
const signTex = (open) => canvasTex(256, 96, (g) => {
  g.fillStyle = '#111'; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#c9a24a'; g.lineWidth = 6; g.strokeRect(4, 4, 248, 88);
  g.fillStyle = open ? '#6dff9a' : '#ff6b6b'; g.font = 'bold 54px "Times New Roman", serif'; g.textAlign = 'center';
  g.fillText(open ? 'OPEN' : 'CLOSED', 128, 68);
});
const signTexOpen = signTex(true), signTexClosed = signTex(false);
export function setOpenSign(open) { if (signMat) signMat.map = open ? signTexOpen : signTexClosed; }

function buildFacade() {
  const awn = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: 0x1f4a3c }));
  awn.position.set(5, 2.75, 16.5); awn.rotation.x = 0.18; awn.castShadow = true; game.scene.add(awn);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.04), gold); trim.position.set(5, 2.65, 17.05); game.scene.add(trim);
  signMat = new THREE.MeshBasicMaterial({ map: signTexClosed });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.52), signMat);
  sign.position.set(5, 2.35, 15.53); game.scene.add(sign);
  const nameTex = canvasTex(512, 96, (g) => {
    g.fillStyle = '#14281f'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#d9b45c'; g.font = 'italic bold 58px "Times New Roman", serif'; g.textAlign = 'center';
    g.fillText('Le Burger d\'Or', 256, 68);
  });
  const nameplate = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshBasicMaterial({ map: nameTex }));
  nameplate.position.set(8.5, 2.6, 15.53); game.scene.add(nameplate);
  // cây hai bên cửa ngoài đường
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.7, 16), black);
  const tree = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), new THREE.MeshStandardMaterial({ color: 0x2f6b3a }));
  for (const x of [2.6, 7.4]) {
    const p = pot.clone(); p.position.set(x, 0.35, 16.4); game.scene.add(p);
    const t = tree.clone(); t.position.set(x, 1.1, 16.4); t.castShadow = true; game.scene.add(t);
  }
}

// Trang trí theo từng khu
export function decorateStart() {
  buildFacade();
  addChandelier(4.5, 10);
  addChandelier(8, 2.6, 7);
  addPlant(1, 14); addPlant(8, 14); addPlant(1, 6);
  addPainting(1.02, 1.7, 10.5, Math.PI / 2);
  addPainting(4.5, 1.7, 6.02, 0, 1.1, 0.8);
  addSconce(1.03, 8, Math.PI / 2); addSconce(1.03, 13, Math.PI / 2);
}

game.on('expanded', (e) => {
  if (e.no === 1) {
    addChandelier(12.5, 10);
    addPlant(15, 14); addPlant(15, 6);
    addPainting(12.5, 1.7, 6.02, 0);
  } else if (e.no === 2) {
    addChandelier(19.5, 5); addChandelier(19.5, 11);
    addPlant(22, 1); addPlant(22, 14); addPlant(17, 1);
    addPainting(22.98, 1.7, 7.5, -Math.PI / 2); addPainting(22.98, 1.7, 11.5, -Math.PI / 2);
    addPainting(19.5, 1.7, 1.02, 0, 1.6, 1);
    addSconce(22.97, 4, -Math.PI / 2); addSconce(22.97, 9.5, -Math.PI / 2);
  }
});
