// HỆ THỐNG 3: Kinh tế & xây dựng theo lưới (Grid Building) + bàn ăn.
import * as THREE from 'three';
import { game } from './state.js';
import { grid, idx, tileCenter, isBuildable, isWalkable, reachableFrom, SPAWN, toTile, isPartitionWall, removeWall, hasRoomForTable, EXPANSIONS, isDemolishable, wallMeshList, wallTileOf } from './world.js';
import { Station } from './cooking.js';
import { matchRecipe, attachItem } from './items.js';

// ===== Bàn + 2 ghế (chiếm 3 ô) =====
let tableNo = 1;
const goldM = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.25 });
const marbleTop = new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.15, metalness: 0.05 });
const VELVET = [0x1f4a3c, 0x6e1f2b, 0x1d2b4f];
const glassM = new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.4, roughness: 0.05 });
const candleM = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffb84a, emissiveIntensity: 1.2 });

export function tableFootprint(x, z, rot) {
  return rot % 2 === 0 ? [[x - 1, z], [x, z], [x + 1, z]] : [[x, z - 1], [x, z], [x, z + 1]];
}

export class Table {
  constructor(x, z, rot = 0, no = null) {
    this.kind = 'table';
    this.no = no ?? tableNo++;
    this.x = x; this.z = z; this.rot = rot;
    this.tiles = tableFootprint(x, z, rot);
    this.group = new THREE.Group();
    this.group.position.copy(tileCenter(x, z));
    // bàn tròn mặt đá cẩm thạch, chân vàng, nến & ly thủy tinh
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 32), marbleTop);
    top.position.y = 0.78; top.castShadow = true; top.receiveShadow = true; this.group.add(top);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.012, 6, 40), goldM);
    edge.rotation.x = Math.PI / 2; edge.position.y = 0.78; this.group.add(edge);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.74, 10), goldM);
    leg.position.y = 0.38; leg.castShadow = true; this.group.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.03, 24), goldM);
    foot.position.y = 0.015; this.group.add(foot);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 10), candleM);
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 12), goldM);
    holder.position.y = 0.82; candle.position.y = 0.89;
    const along = rot % 2 === 0 ? new THREE.Vector3(0, 0, 0.18) : new THREE.Vector3(0.18, 0, 0);
    holder.position.add(along); candle.position.add(along);
    this.group.add(holder, candle);
    const velvet = new THREE.MeshStandardMaterial({ color: VELVET[this.no % VELVET.length], roughness: 0.95 });
    this.seats = [];
    const ends = [this.tiles[0], this.tiles[2]];
    for (const t of ends) {
      const dx = t[0] - x, dz = t[1] - z;
      const ch = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), velvet);
      seat.position.y = 0.46; seat.castShadow = true; ch.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.09), velvet);
      back.position.set(0, 0.8, 0.22); back.castShadow = true; ch.add(back);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, 0.1), goldM);
      trim.position.set(0, 1.11, 0.22); ch.add(trim);
      for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.42, 6), goldM);
        l.position.set(lx, 0.21, lz); ch.add(l);
      }
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.12, 10), glassM);
      glass.position.set(dx * 0.3 + along.x * 1.2, 0.87, dz * 0.3 + along.z * 1.2);
      this.group.add(glass);
      ch.position.set(dx * 0.85, 0, dz * 0.85);
      ch.rotation.y = Math.atan2(dx, dz); // lưng ghế quay ra ngoài
      this.group.add(ch);
      this.seats.push({
        table: this, tile: t, customer: null, plate: null, cleaningBy: null,
        platePos: tileCenter(x, z, 0.81).add(new THREE.Vector3(dx * 0.25, 0, dz * 0.25)),
      });
    }
    this.group.userData.interact = this;
    for (const [tx, tz] of this.tiles) grid.occ[idx(tx, tz)] = this;
    game.scene.add(this.group);
    game.interactables.push(this.group);
    game.tables.push(this);
  }
  get center() { return this.group.position; }
}

// Người chơi / bồi bàn tương tác với bàn: phục vụ món hoặc dọn đĩa bẩn
export function interactTable(holder, table, preferSeat = null) {
  const held = holder.held;
  if (held && held.kind === 'plate' && !held.dirty) {
    const r = matchRecipe(held.contents);
    if (!r) return null;
    const seats = table.seats.filter((s) => s.customer && s.customer.state === 'WAITING' && s.customer.order.recipe.id === r.id && !s.plate);
    if (!seats.length) return null;
    const s = seats.includes(preferSeat) ? preferSeat : seats[0];
    holder.setHeld(null);
    s.plate = held;
    attachItem(held, game.scene, s.platePos);
    s.customer.onServed();
    return `🍽️ Đã phục vụ ${r.name}`;
  }
  if (!held) {
    const dirty = table.seats.filter((s) => s.plate && s.plate.dirty && !s.customer);
    if (!dirty.length) return null;
    const s = dirty.includes(preferSeat) ? preferSeat : dirty[0];
    const p = s.plate; s.plate = null;
    holder.setHeld(p);
    return 'Dọn đĩa bẩn';
  }
  return null;
}

export function describeTable(t, held) {
  const lines = [`<b>Bàn ${t.no}</b>`];
  for (const s of t.seats) {
    if (s.customer && s.customer.state === 'WAITING') lines.push(`Khách gọi: ${s.customer.order.recipe.icon} ${s.customer.order.recipe.name}`);
    else if (s.customer && s.customer.state === 'EATING') lines.push('Khách đang ăn');
    else if (s.plate && s.plate.dirty) lines.push('Có đĩa bẩn');
  }
  if (held && held.kind === 'plate' && !held.dirty) {
    const r = matchRecipe(held.contents);
    if (r && t.seats.some((s) => s.customer && s.customer.state === 'WAITING' && s.customer.order.recipe.id === r.id)) lines.push('[E] Phục vụ món');
  } else if (!held && t.seats.some((s) => s.plate && s.plate.dirty && !s.customer)) lines.push('[E] Dọn đĩa bẩn');
  return lines.join('<br>');
}

// ===== Cửa hàng =====
export const SHOP = [
  { key: 'table',   name: 'Bàn + 2 ghế',   price: 60,  icon: '🪑' },
  { key: 'stove',   name: 'Bếp',           price: 100, icon: '🔥' },
  { key: 'board',   name: 'Thớt',          price: 60,  icon: '🔪' },
  { key: 'counter', name: 'Quầy ra món',   price: 40,  icon: '🛎️' },
  { key: 'chef',    name: 'Thuê đầu bếp',  price: 250, icon: '👨‍🍳', hire: true },
  { key: 'waiter',  name: 'Thuê bồi bàn',  price: 150, icon: '🤵', hire: true },
  { key: 'move',    name: 'Di chuyển đồ',  price: 0,   icon: '✋', tool: true },
  { key: 'wall',    name: 'Phá tường',     price: 30,  icon: '⛏️', tool: true },
];

export const build = { selected: 0, rot: 0, ghost: null, tile: null, valid: false, target: null, moving: null };

const ghostOk = new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.45, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.45, depthWrite: false });
const ghostBox = new THREE.BoxGeometry(0.96, 0.9, 0.96);
const ghostWall = new THREE.BoxGeometry(1.04, 3.04, 1.04);
let gridHelper;

export function footprintFor(key, x, z, rot) {
  return key === 'table' ? tableFootprint(x, z, rot) : [[x, z]];
}

function placementValid(tiles, key) {
  for (const [x, z] of tiles) if (!isBuildable(x, z) && !(key === 'counter' && isPartitionWall(x, z))) return false;
  // người chơi / bot không bị kẹt trong đồ
  const blockers = [game.player.tile, ...game.bots.map((b) => b.tile), ...game.customers.filter((c) => c.state !== 'WAITING' && c.state !== 'EATING' && c.state !== 'ORDER' && c.state !== 'PAY').map((c) => c.tile)];
  if (tiles.some(([x, z]) => blockers.some(([a, b]) => a === x && b === z))) return false;
  // tạm chiếm ô rồi kiểm tra mọi thứ vẫn đi tới được từ cửa
  for (const [x, z] of tiles) grid.occ[idx(x, z)] = 'tmp';
  const seen = reachableFrom(SPAWN[0], SPAWN[1]);
  const reach = (ents) => ents.every((e) => e.tiles.some(([x, z]) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isWalkable(x + dx, z + dz) && seen[idx(x + dx, z + dz)])));
  let ok = reach(game.stations) && game.tables.every((t) => t.seats.every((s) => reach([{ tiles: [s.tile] }])));
  // ghế của bàn mới cũng phải ngồi được
  if (ok && tiles.length === 3) ok = reach([{ tiles: [tiles[0]] }]) && reach([{ tiles: [tiles[2]] }]);
  const [px, pz] = game.player.tile;
  if (ok && !seen[idx(px, pz)]) ok = false;
  for (const [x, z] of tiles) grid.occ[idx(x, z)] = null;
  return ok;
}

export function setBuildMode(on) {
  game.buildMode = on;
  if (!gridHelper) {
    gridHelper = new THREE.GridHelper(24, 24, 0xffffff, 0xffffff);
    gridHelper.position.set(12, 0.01, 12);
    gridHelper.material.transparent = true; gridHelper.material.opacity = 0.25;
    game.scene.add(gridHelper);
  }
  gridHelper.visible = on;
  if (!on && build.ghost) { game.scene.remove(build.ghost); build.ghost = null; }
  if (!on) cancelMove();
  game.emit('buildChanged');
}

export function selectShop(i) {
  if (build.moving) cancelMove();
  build.selected = i;
  game.emit('buildChanged');
  const item = SHOP[i];
  if (item.hire) buyShop();
}

const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function updateBuild() {
  if (!game.buildMode) return;
  const item = SHOP[build.selected];
  if (build.ghost) { game.scene.remove(build.ghost); build.ghost = null; }
  if (item.hire) return;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
  if (item.key === 'wall') return updateWallTool();
  if (item.key === 'move' && !build.moving) return updatePickTool();
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(floorPlane, hit) || hit.distanceTo(game.camera.position) > 14) { build.tile = null; return; }
  const [x, z] = toTile(hit);
  const key = build.moving ? movingKey(build.moving) : item.key;
  const tiles = footprintFor(key, x, z, build.rot);
  build.tile = [x, z];
  build.valid = build.moving
    ? lifted(build.moving, () => placementValid(tiles, key))
    : placementValid(tiles, item.key) && game.money >= item.price;
  showGhost(tiles, build.valid);
}

function showGhost(tiles, ok, geo = ghostBox, y = 0.45) {
  const g = new THREE.Group();
  for (const [tx, tz] of tiles) {
    const b = new THREE.Mesh(geo, ok ? ghostOk : ghostBad);
    b.position.copy(tileCenter(tx, tz, y));
    g.add(b);
  }
  build.ghost = g;
  game.scene.add(g);
}

// ===== Công cụ: di chuyển bàn ghế / thiết bị =====
const movingKey = (o) => (o.kind === 'table' ? 'table' : o.type);
const objName = (o) => (o.kind === 'table' ? `bàn ${o.no}` : o.def.name.toLowerCase());
// Chỉ nhấc được đồ đang không có ai dùng
export function canMove(o) {
  if (o.kind === 'table') return o.seats.every((s) => !s.customer && !s.plate && !s.cleaningBy);
  return !o.item && !o.reservedBy && !o.working;
}
function pickTarget() {
  const objs = [...game.tables, ...game.stations].map((o) => o.group);
  const hit = raycaster.intersectObjects(objs, true).find((h) => h.distance < 6);
  if (!hit) return null;
  let o = hit.object;
  while (o && !o.userData.interact) o = o.parent;
  return o ? o.userData.interact : null;
}
function updatePickTool() {
  const t = pickTarget();
  build.target = t;
  build.tile = null;
  if (t) showGhost(t.tiles, canMove(t), ghostBox, 0.5);
}
// Tạm "nhấc" đồ ra khỏi lưới để kiểm tra chỗ đặt mới (cho phép đặt lại chồng lên chỗ cũ / xoay tại chỗ)
function lifted(o, fn) {
  const saved = o.tiles.map(([x, z]) => grid.occ[idx(x, z)]);
  for (const [x, z] of o.tiles) grid.occ[idx(x, z)] = null;
  const list = o.kind === 'table' ? game.tables : game.stations;
  const i = list.indexOf(o);
  if (i >= 0) list.splice(i, 1);
  try { return fn(); } finally {
    if (i >= 0) list.splice(i, 0, o);
    o.tiles.forEach(([x, z], k) => { grid.occ[idx(x, z)] = saved[k]; });
  }
}
function cancelMove() {
  if (!build.moving) return;
  build.moving.group.visible = true;
  build.moving = null;
  game.emit('buildChanged');
}
function removeObject(o) {
  game.scene.remove(o.group);
  const k = game.interactables.indexOf(o.group);
  if (k >= 0) game.interactables.splice(k, 1);
  for (const [x, z] of o.tiles) if (grid.occ[idx(x, z)] === o) grid.occ[idx(x, z)] = null;
  const list = o.kind === 'table' ? game.tables : game.stations;
  const i = list.indexOf(o);
  if (i >= 0) list.splice(i, 1);
  if (o.label) o.label.destroy();
}
function relocate(o, x, z, rot) {
  const list = o.kind === 'table' ? game.tables : game.stations;
  const at = list.indexOf(o);
  removeObject(o);
  if (o.kind === 'table') {
    const t = new Table(x, z, rot, o.no);
    list.splice(list.indexOf(t), 1); list.splice(at, 0, t); // giữ thứ tự để số bàn không đổi khi tải lại
    return t;
  }
  if (isPartitionWall(x, z)) removeWall(x, z);
  return new Station(o.type, x, z);
}

// ===== Công cụ: phá tường =====
function updateWallTool() {
  const hit = raycaster.intersectObjects(wallMeshList(), true).find((h) => h.distance < 6);
  build.tile = null; build.valid = false;
  if (!hit) return;
  let m = hit.object;
  while (m.parent && m.parent !== game.scene) m = m.parent;
  const t = wallTileOf(m);
  if (!t) return;
  build.tile = t;
  build.valid = isDemolishable(...t) && game.money >= SHOP.find((s) => s.key === 'wall').price;
  showGhost([t], build.valid, ghostWall, 1.5);
}

export function buyShop() {
  const item = SHOP[build.selected];
  if (game.money < item.price) { game.toast(`Không đủ tiền! Cần $${item.price}`); return; }
  if (item.hire) {
    game.money -= item.price;
    game.daily.spent += item.price;
    game.emit('hire', item.key);
    return;
  }
  if (item.key === 'move') return useMoveTool();
  if (item.key === 'wall') return useWallTool(item);
  if (!build.tile || !build.valid) { game.toast('Không đặt được ở đây (ô bị chiếm hoặc chặn lối đi)'); return; }
  const [x, z] = build.tile;
  game.money -= item.price;
  game.daily.spent += item.price;
  if (item.key === 'table') new Table(x, z, build.rot);
  else {
    if (isPartitionWall(x, z)) removeWall(x, z);
    new Station(item.key, x, z);
  }
  game.toast(`Đã đặt ${item.name} (-$${item.price})`);
  if (item.key === 'table' && !hasRoomForTable()) {
    const next = EXPANSIONS.find((e) => !e.unlocked);
    game.toast(next ? `Hết chỗ đặt bàn! Tích $${next.price} để mở "${next.name}"` : 'Quán đã kín chỗ!');
  }
}

function useMoveTool() {
  if (!build.moving) {
    const t = build.target;
    if (!t) { game.toast('Nhìn vào bàn ghế hoặc thiết bị muốn di chuyển rồi click'); return; }
    if (!canMove(t)) { game.toast(`Không nhấc được ${objName(t)} — đang có người dùng hoặc có đồ trên đó`); return; }
    build.moving = t;
    build.rot = t.rot || 0;
    t.group.visible = false;
    game.toast(`✋ Đã nhấc ${objName(t)} — chọn chỗ mới rồi click${t.kind === 'table' ? ', R để xoay' : ''} (bấm 7 để huỷ)`);
    game.emit('buildChanged');
    return;
  }
  const o = build.moving;
  if (!canMove(o)) { cancelMove(); game.toast('Đồ vừa có người dùng — huỷ di chuyển'); return; }
  if (!build.tile || !build.valid) { game.toast('Không đặt được ở đây (ô bị chiếm hoặc chặn lối đi)'); return; }
  const [x, z] = build.tile;
  build.moving = null;
  relocate(o, x, z, build.rot);
  game.toast(`Đã chuyển ${objName(o)} sang chỗ mới`);
  game.emit('buildChanged');
}

function useWallTool(item) {
  if (!build.tile) { game.toast('Nhìn vào bức tường muốn phá rồi click'); return; }
  const [x, z] = build.tile;
  if (!isDemolishable(x, z)) { game.toast('Không phá được tường này (tường bao ngoài hoặc tường khu chưa mở rộng)'); return; }
  if (game.money < item.price) { game.toast(`Không đủ tiền! Cần $${item.price}`); return; }
  game.money -= item.price;
  game.daily.spent += item.price;
  removeWall(x, z);
  game.toast(`⛏️ Đã phá tường (-$${item.price})`);
}

// Mới đầu chỉ có 2 bàn, mỗi bàn 2 người
export function buildDefaultDining() {
  new Table(3, 8, 0);
  new Table(6, 11, 0);
}
