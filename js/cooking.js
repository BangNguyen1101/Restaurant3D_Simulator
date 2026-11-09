// HỆ THỐNG 1: Nấu ăn & tương tác.
// "holder" là bất kỳ ai cầm được đồ: người chơi hoặc bot. Cả hai dùng chung hàm interact()/chop().
import * as THREE from 'three';
import { game } from './state.js';
import { grid, idx, tileCenter } from './world.js';
import { Label, bar } from './labels.js';
import {
  ING, newIng, newPlate, finalKey, canAddToPlate, matchRecipe,
  refreshMesh, attachItem, destroyItem, itemName,
} from './items.js';
import { stock, takeStock, returnStock, LOW } from './inventory.js';

export const COOK_TIME = 5;   // sống -> chín
export const BURN_TIME = 8;   // chín -> cháy
export const CHOP_TIME = 2.5;

export const STATION_DEFS = {
  crate_bun:     { name: 'Thùng bánh mì', ing: 'bun',     color: 0xc89b5a },
  crate_meat:    { name: 'Tủ lạnh (thịt)', ing: 'meat',   color: 0xdde6ee, tall: true },
  crate_lettuce: { name: 'Thùng rau',      ing: 'lettuce', color: 0x5f9a46 },
  crate_tomato:  { name: 'Thùng cà chua',  ing: 'tomato',  color: 0xb5473a },
  board:   { name: 'Thớt',        slot: true },
  stove:   { name: 'Bếp',         slot: true },
  counter: { name: 'Quầy ra món', slot: true },
  plates:  { name: 'Chồng đĩa sạch' },
  sink:    { name: 'Bồn rửa' },
  trash:   { name: 'Thùng rác' },
};

const mats = {};
const m = (hex, opts = {}) => (mats[hex + JSON.stringify(opts)] ||= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, ...opts }));
const box = (w, h, d, hex, y, opts) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(hex, opts));
  b.position.y = y; b.castShadow = true; b.receiveShadow = true; return b;
};

function buildMesh(type) {
  const g = new THREE.Group();
  const def = STATION_DEFS[type];
  let top = 0.9;
  if (def.ing) {
    if (def.tall) {
      g.add(box(0.9, 1.9, 0.85, def.color, 0.95, { metalness: 0.3 }));
      const handle = box(0.05, 0.5, 0.05, 0x888888, 1.2); handle.position.set(0.3, 1.2, 0.44); g.add(handle);
      top = 1.9;
    } else {
      g.add(box(0.9, 0.9, 0.9, 0x7a5532, 0.45));
      g.add(box(0.8, 0.12, 0.8, def.color, 0.92));
    }
    // vài nguyên liệu trưng trên nóc
    const sample = newIng(def.ing);
    if (def.ing === 'meat') sample.state = 'raw';
    const s = refreshMesh(sample);
    s.position.y = top + (def.tall ? 0 : 0.06);
    g.add(s);
  } else if (type === 'board') {
    g.add(box(0.95, 0.9, 0.95, 0x9a9a9a, 0.45, { metalness: 0.4 }));
    g.add(box(0.7, 0.05, 0.5, 0xd8b07a, 0.925));
    top = 0.95;
  } else if (type === 'stove') {
    g.add(box(0.95, 0.9, 0.95, 0x3b3b3f, 0.45, { metalness: 0.5 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 24), m(0xff5a1f, { emissive: 0x991800 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.91; g.add(ring);
    g.userData.ring = ring;
    top = 0.92;
  } else if (type === 'counter') {
    g.add(box(0.95, 0.9, 0.95, 0x8b5a2b, 0.45));
    g.add(box(1.0, 0.06, 1.0, 0xeeeeee, 0.93));
    top = 0.96;
  } else if (type === 'plates') {
    g.add(box(0.95, 0.9, 0.95, 0x9a9a9a, 0.45, { metalness: 0.4 }));
    for (let i = 0; i < 5; i++) {
      const p = refreshMesh(newPlate()); p.position.y = 0.9 + i * 0.045; g.add(p);
    }
  } else if (type === 'sink') {
    g.add(box(0.95, 0.9, 0.95, 0x9a9a9a, 0.45, { metalness: 0.4 }));
    g.add(box(0.7, 0.04, 0.7, 0x4aa3df, 0.9));
    const tap = box(0.06, 0.35, 0.06, 0xcccccc, 1.07); tap.position.z = -0.35; g.add(tap);
  } else if (type === 'trash') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.28, 0.8, 16), m(0x3d6b45));
    c.position.y = 0.4; c.castShadow = true; g.add(c);
  }
  g.userData.top = top;
  return g;
}

export class Station {
  constructor(type, x, z, rotY = 0) {
    this.kind = 'station';
    this.type = type;
    this.def = STATION_DEFS[type];
    this.x = x; this.z = z;
    this.tiles = [[x, z]];
    this.item = null;
    this.progress = 0;    // cắt / nấu
    this.burn = 0;        // độ cháy
    this.working = false; // thớt đang cắt
    this.reservedBy = null; // bot đã giữ chỗ
    this.group = buildMesh(type);
    this.group.position.copy(tileCenter(x, z));
    this.group.rotation.y = rotY;
    this.group.userData.interact = this;
    this.slot = new THREE.Vector3(0, this.group.userData.top, 0);
    this.label = new Label('station');
    grid.occ[idx(x, z)] = this;
    game.scene.add(this.group);
    game.interactables.push(this.group);
    game.stations.push(this);
  }

  get center() { return this.group.position; }

  setItem(item) {
    this.item = item;
    this.progress = 0; this.burn = 0; this.working = false;
    if (item) attachItem(item, this.group, this.slot);
    if (this.type === 'counter') checkPlateReady(this);
  }

  takeItem() {
    const it = this.item;
    this.item = null; this.progress = 0; this.burn = 0; this.working = false;
    return it;
  }

  update(dt) {
    const it = this.item;
    if (this.type === 'stove' && it && it.type === 'meat') {
      if (it.state === 'raw') {
        this.progress += dt / COOK_TIME;
        if (this.progress >= 1) { it.state = 'cooked'; refreshMesh(it); this.progress = 1; }
      } else if (it.state === 'cooked') {
        this.burn += dt / BURN_TIME;
        if (this.burn >= 1) { it.state = 'burnt'; refreshMesh(it); }
      }
    }
    if (this.type === 'stove' && this.group.userData.ring) {
      this.group.userData.ring.material = m(it ? 0xff5a1f : 0x552222, it ? { emissive: 0x991800 } : {});
    }
    if (this.type === 'board' && this.working && it) {
      this.progress += dt / CHOP_TIME;
      if (this.progress >= 1) { it.state = 'chopped'; refreshMesh(it); this.working = false; this.progress = 0; }
    }
    // thanh tiến trình
    let html = '';
    if (this.type === 'stove' && it && it.type === 'meat') {
      if (it.state === 'raw') html = `🔥 Đang nấu${bar(this.progress, '#4cd964')}`;
      else if (it.state === 'cooked') html = `✅ Chín! <b style="color:#ffb347">Lấy ra kẻo cháy</b>${bar(this.burn, this.burn > 0.6 ? '#ff3b30' : '#ff9500')}`;
      else html = `💀 <b style="color:#ff6b6b">Cháy rồi!</b>`;
    } else if (this.type === 'board' && this.working) {
      html = `🔪 Đang cắt${bar(this.progress, '#5ac8fa')}`;
    } else if (this.def.ing) {
      const n = stock[this.def.ing];
      html = `📦 Còn <b style="color:${n === 0 ? '#ff6b6b' : n <= LOW ? '#ffcc00' : '#7CFC7C'}">${n}</b>`;
    } else if (this.type === 'counter' && it && it.kind === 'plate' && matchRecipe(it.contents)) {
      html = `🛎️ ${matchRecipe(it.contents).name}`;
    }
    this.label.set(html);
    this.label.show(this.center.clone().setY(this.def.tall ? 2.2 : 1.55), this.def.ing ? 7 : 18);
  }
}

const HAND = new THREE.Vector3();

// ===== Hành động E (lấy / đặt / ghép) =====
// Trả về câu thông báo (string) nếu có gì xảy ra, null nếu không làm được gì.
export function interact(holder, st) {
  const held = holder.held;
  const def = st.def;

  if (def.ing) { // thùng nguyên liệu (trừ tồn kho)
    if (!held) {
      if (!takeStock(def.ing)) return null;
      holder.setHeld(newIng(def.ing)); return `Lấy ${ING[def.ing].name} (còn ${stock[def.ing]})`;
    }
    if (held.kind === 'plate') {
      const k = finalKey(newIng(def.ing));
      if (canAddToPlate(held, k)) {
        if (!takeStock(def.ing)) return null;
        held.contents.push(k); refreshMesh(held); return `Thêm ${ING[k].name} vào đĩa`;
      }
      return null;
    }
    if (held.kind === 'ing' && held.type === def.ing && held.state === 'raw') {
      returnStock(def.ing); destroyItem(held); holder.setHeld(null); return 'Cất lại vào kho';
    }
    return null;
  }

  if (st.type === 'plates') {
    if (!held) { holder.setHeld(newPlate()); return 'Lấy đĩa sạch'; }
    if (held.kind === 'plate' && !held.dirty && !held.contents.length) { destroyItem(held); holder.setHeld(null); return 'Cất đĩa'; }
    return null;
  }

  if (st.type === 'trash') {
    if (!held) return null;
    if (held.kind === 'plate' && !held.dirty && held.contents.length) {
      held.contents = []; refreshMesh(held); return 'Đổ thức ăn vào thùng rác';
    }
    destroyItem(held); holder.setHeld(null); return 'Vứt bỏ';
  }

  if (st.type === 'sink') {
    if (held && held.kind === 'plate' && held.dirty) { destroyItem(held); holder.setHeld(null); return '🧽 Đã rửa đĩa'; }
    return null;
  }

  // Các station có 1 ô đặt đồ: thớt, bếp, quầy
  if (held && !st.item) {
    if (st.type === 'stove' && !(held.kind === 'ing' && held.type === 'meat')) return null;
    if (st.type === 'board' && held.kind !== 'ing') return null;
    holder.setHeld(null);
    st.setItem(held);
    return `Đặt ${itemName(held)}`;
  }
  if (held && st.item) {
    // ghép nguyên liệu vào đĩa (cả 2 chiều)
    if (held.kind === 'plate' && canAddToPlate(held, finalKey(st.item))) {
      const ing = st.takeItem();
      held.contents.push(finalKey(ing)); destroyItem(ing); refreshMesh(held);
      return `Thêm ${ING[ing.type].name} vào đĩa`;
    }
    if (st.item.kind === 'plate' && canAddToPlate(st.item, finalKey(held))) {
      st.item.contents.push(finalKey(held)); destroyItem(held); holder.setHeld(null); refreshMesh(st.item);
      if (st.type === 'counter') checkPlateReady(st);
      return `Thêm ${ING[held.type].name} vào đĩa`;
    }
    return null;
  }
  if (!held && st.item) {
    if (st.working) return null;
    const it = st.takeItem();
    holder.setHeld(it);
    return `Lấy ${itemName(it)}`;
  }
  return null;
}

// ===== Hành động F: cắt trên thớt =====
export function chop(holder, st) {
  if (st.type !== 'board' || !st.item || st.working) return false;
  const it = st.item;
  if (it.kind !== 'ing' || ING[it.type].process !== 'chop' || it.state !== 'raw') return false;
  st.working = true; st.progress = 0;
  return true;
}

function checkPlateReady(st) {
  const it = st.item;
  if (it && it.kind === 'plate' && !it.dirty && matchRecipe(it.contents)) game.emit('plateReady', st, it);
}

export function describeStation(st, held) {
  const lines = [`<b>${st.def.name}</b>`];
  if (st.item) lines.push(`Đang có: ${itemName(st.item)}`);
  const hints = [];
  if (st.def.ing) hints.push(held ? (held.kind === 'plate' ? '[E] Thêm vào đĩa' : '[E] Cất lại') : `[E] Lấy ${ING[st.def.ing].name}`);
  else if (st.type === 'plates') hints.push('[E] Lấy đĩa');
  else if (st.type === 'trash') { if (held) hints.push('[E] Vứt'); }
  else if (st.type === 'sink') { if (held && held.dirty) hints.push('[E] Rửa đĩa'); }
  else {
    if (held && !st.item) hints.push('[E] Đặt xuống');
    else if (st.item && !held) hints.push('[E] Lấy lên');
    else if (st.item && held) hints.push('[E] Ghép vào đĩa');
    if (st.type === 'board' && st.item && st.item.kind === 'ing' && ING[st.item.type].process === 'chop' && st.item.state === 'raw' && !st.working) hints.push('[F] Cắt');
  }
  if (hints.length) lines.push(hints.join(' &nbsp; '));
  return lines.join('<br>');
}

export function buildDefaultKitchen() {
  // dãy sát tường sau bếp (z = 1)
  new Station('crate_bun', 1, 1);
  new Station('crate_meat', 3, 1);
  new Station('crate_lettuce', 4, 1);
  new Station('crate_tomato', 5, 1);
  new Station('board', 7, 1);
  new Station('stove', 10, 1);
  new Station('plates', 12, 1);
  new Station('sink', 14, 1);
  new Station('trash', 15, 1);
  // quầy ra món nằm trên vách bếp, tiếp cận được từ 2 phía
  new Station('counter', 6, 5);
  new Station('counter', 7, 5);
}
