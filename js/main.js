// Khởi động game: renderer, người chơi góc nhìn thứ nhất, input, HUD, vòng lặp.
import * as THREE from 'three';
import { game } from './state.js';
import { buildLayout, buildWorldMeshes, unlockExpansion, isWalkable, toTile, inB, EXPANSIONS } from './world.js';
import { buildDefaultKitchen, interact, chop, describeStation } from './cooking.js';
import { updateCustomers } from './customers.js';
import { buildDefaultDining, interactTable, describeTable, SHOP, build, setBuildMode, selectShop, updateBuild, buyShop } from './building.js';
import { updateStaff, tasks } from './staff.js';
import { itemName, attachItem, ING } from './items.js';
import { updateFloaters } from './labels.js';
import { decorateStart } from './decor.js';
import { stock, SUPPLY, LOW, buySupply } from './inventory.js';
import { initDayNight, updateDayNight, nextDay, clockText, OPEN_H, LAST_GUEST_H, CLOSE_H, WAGE } from './daynight.js';
import { recipeBookHTML } from './recipebook.js';
import { buildStreet, updateStreet } from './street.js';
import { checkDb, listSaves, deleteSave, startNew, startLoad, saveGame } from './save.js';

// ===== Renderer & scene =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3f0);
scene.fog = new THREE.Fog(0x9fd3f0, 35, 85);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 100);
scene.add(camera);
Object.assign(game, { scene, camera, renderer });

const hemi = new THREE.HemisphereLight(0xfff6e8, 0x5a4a3a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3dd, 1.6);
sun.target.position.set(12, 0, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
scene.add(sun, sun.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

buildLayout();
buildWorldMeshes(scene);
buildStreet();
decorateStart(); // bếp + bàn ghế được dựng khi người chơi chọn Chơi mới / Tiếp tục (xem save.js)
initDayNight(sun, hemi);

// ===== Người chơi =====
const player = {
  pos: new THREE.Vector3(8.5, 0, 3.5),
  yaw: 0, pitch: -0.2,
  held: null,
  hand: new THREE.Vector3(0.38, -0.42, -0.85),
  get tile() { return toTile(this.pos); },
  setHeld(item) {
    this.held = item;
    if (item) { attachItem(item, camera, this.hand); item.mesh.rotation.x = 0.35; }
  },
};
game.player = player;

const keys = {};
const R = 0.28;
function blocked(x, z) {
  for (const [ox, oz] of [[R, R], [R, -R], [-R, R], [-R, -R]]) {
    const tx = Math.floor(x + ox), tz = Math.floor(z + oz);
    if (!inB(tx, tz) || !isWalkable(tx, tz)) return true;
  }
  return false;
}
function updatePlayer(dt) {
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const speed = keys.ShiftLeft ? 6 : 4;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let dx = (fx * f - fz * s) * speed * dt;
  let dz = (fz * f + fx * s) * speed * dt;
  const len = Math.hypot(dx, dz), max = speed * dt;
  if (len > max) { dx *= max / len; dz *= max / len; }
  if (!blocked(player.pos.x + dx, player.pos.z)) player.pos.x += dx;
  if (!blocked(player.pos.x, player.pos.z + dz)) player.pos.z += dz;
  camera.position.set(player.pos.x, 1.6, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

// ===== Nhìn vào vật gì? =====
const ray = new THREE.Raycaster();
ray.far = 2.8;
let target = null;
function updateTarget() {
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = ray.intersectObjects(game.interactables, true);
  target = null;
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.interact) o = o.parent;
    if (o) { target = o.userData.interact; break; }
  }
}

function doInteract() {
  if (!target) return;
  let msg = null;
  if (target.kind === 'station') msg = interact(player, target);
  else if (target.kind === 'table') msg = interactTable(player, target);
  else if (target.kind === 'expansion') unlockExpansion(target);
  if (msg) flashPrompt(msg);
}

// ===== Các chế độ giao diện: xây dựng (B), nhập hàng (N), sổ công thức (C) =====
let mode = 'play';
function setMode(m) {
  mode = mode === m ? 'play' : m;
  setBuildMode(mode === 'build');
  $('supply').style.display = mode === 'supply' ? 'flex' : 'none';
  $('recipes').style.display = mode === 'recipes' ? 'flex' : 'none';
  if (mode === 'recipes') $('recipes').innerHTML = recipeBookHTML();
  if (mode === 'supply') renderSupply();
}

// ===== Input =====
const canvas = renderer.domElement;
const overlay = document.getElementById('overlay');
const lockPointer = () => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* trình duyệt từ chối khoá chuột */ } };
document.querySelector('#paused .go').addEventListener('click', () => lockPointer());
document.getElementById('btnSave').addEventListener('click', () => saveGame());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  game.paused = !locked;
  overlay.style.display = locked ? 'none' : 'flex';
  if (!locked && game.started) {
    document.getElementById('ovTitle').textContent = '⏸ Tạm dừng';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('paused').style.display = 'block';
  }
});

// ===== Menu đầu game: Chơi mới / Tiếp tục (đọc danh sách ô lưu từ SQL Server) =====
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function renderMenu() {
  const online = await checkDb();
  let saves = [];
  if (online) { try { saves = await listSaves(); } catch { /* bỏ qua */ } }
  const menu = $('menu');
  menu.innerHTML = `
    <div class="db ${online ? 'ok' : 'off'}">${online
      ? '🟢 Đã kết nối SQL Server — tự lưu cuối mỗi ngày, bấm K để lưu bất cứ lúc nào'
      : '🔴 Không kết nối được SQL Server — vẫn chơi được nhưng tiến trình sẽ không được lưu'}</div>
    ${saves.length ? '<h3>📂 Tiếp tục</h3>' + saves.map((s) => `
      <div class="srow"><div><b>${esc(s.SlotName)}</b><br>
        <small>Ngày ${s.Day} · $${s.Money} · ${s.Tables} bàn · ${s.Staff} nhân viên · lưu lúc ${new Date(s.UpdatedAt).toLocaleString('vi-VN')}</small></div>
        <button data-load="${esc(s.SlotName)}">▶ Tiếp tục</button><button class="del" data-del="${esc(s.SlotName)}" title="Xoá">🗑</button></div>`).join('') : ''}
    <h3>✨ Chơi mới</h3>
    <div class="srow"><input id="slotName" maxlength="50" placeholder="Tên ô lưu" value="Người chơi ${saves.length + 1}">
      <button id="btnNew">Bắt đầu</button></div>
    <div class="err" id="menuErr"></div>`;
  menu.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.id === 'btnNew') {
        const name = $('slotName').value.trim();
        if (!name) { $('menuErr').textContent = 'Hãy nhập tên ô lưu.'; return; }
        if (saves.some((s) => s.SlotName.toLowerCase() === name.toLowerCase())) { $('menuErr').textContent = 'Tên này đã có — chọn "Tiếp tục" hoặc đặt tên khác.'; return; }
        startNew(name);
      } else if (b.dataset.load) {
        await startLoad(b.dataset.load);
      } else if (b.dataset.del) {
        if (confirm(`Xoá vĩnh viễn ô lưu "${b.dataset.del}" khỏi SQL Server?`)) { await deleteSave(b.dataset.del); renderMenu(); }
        return;
      }
      lockPointer();
    } catch (err) { $('menuErr').textContent = '⚠️ ' + err.message; }
  };
}
renderMenu();
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - e.movementY * 0.0022));
});
document.addEventListener('mousedown', (e) => {
  if (game.paused) return;
  if (e.button === 0) { if (mode === 'build') buyShop(); else if (mode === 'play') doInteract(); }
});
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (game.paused) return;
  if (e.code === 'KeyE' && mode === 'play') doInteract();
  if (e.code === 'KeyF' && target && target.kind === 'station' && chop(player, target)) flashPrompt('🔪 Bắt đầu cắt');
  if (e.code === 'KeyB') setMode('build');
  if (e.code === 'KeyN') setMode('supply');
  if (e.code === 'KeyC') setMode('recipes');
  if (e.code === 'KeyK') saveGame();
  if (e.code === 'Enter' && nextDay()) $('summary').style.display = 'none';
  const n = parseInt(e.key, 10);
  if (mode === 'build') {
    if (n >= 1 && n <= SHOP.length) selectShop(n - 1);
    if (e.code === 'KeyR') build.rot = (build.rot + 1) % 2;
  }
  if (mode === 'supply' && n >= 1 && n <= SUPPLY.length) { buySupply(n - 1); renderSupply(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

// ===== HUD =====
const $ = (id) => document.getElementById(id);
let flash = { text: '', t: 0 };
function flashPrompt(t) { flash = { text: t, t: 1.4 }; }
let toastT = 0;
game.on('toast', (msg) => { $('toast').textContent = msg; $('toast').style.opacity = 1; toastT = 3.5; });

function renderShop() {
  $('shop').style.display = game.buildMode ? 'flex' : 'none';
  $('shop').innerHTML = SHOP.map((s, i) =>
    `<div class="slot ${i === build.selected ? 'sel' : ''} ${game.money < s.price ? 'poor' : ''}">
      <div class="k">${i + 1}</div><div class="ic">${s.icon}</div><div>${s.name}</div><div class="pr">$${s.price}</div></div>`).join('');
}
game.on('buildChanged', renderShop);

function renderSupply() {
  $('supply').innerHTML = '<div class="stitle">🚚 NHẬP HÀNG — bấm số để mua (N để đóng)</div>' + SUPPLY.map((s, i) => {
    const n = stock[s.type];
    return `<div class="slot ${game.money < s.price ? 'poor' : ''}"><div class="k">${i + 1}</div><div class="ic">${s.icon}</div>
      <div>${ING[s.type].name} ×${s.qty}</div><div class="pr">$${s.price}</div>
      <div class="stk ${n === 0 ? 'out' : n <= LOW ? 'low' : ''}">Tồn: ${n}</div></div>`;
  }).join('');
}

game.on('dayEnd', (s) => {
  $('summary').innerHTML = `<h2>🌙 Kết thúc ngày ${s.day}</h2>
    <table>
      <tr><td>Khách đã phục vụ</td><td>${s.served}</td></tr>
      <tr><td>Khách bỏ về</td><td class="${s.lost ? 'neg' : ''}">${s.lost}</td></tr>
      <tr><td>Doanh thu món ăn</td><td class="pos">+$${s.revenue}</td></tr>
      <tr><td>Tiền tip</td><td class="pos">+$${s.tips}</td></tr>
      <tr><td>Chi tiêu (nhập hàng, mua đồ, mở rộng, thuê người)</td><td class="neg">-$${s.spent}</td></tr>
      <tr><td>Lương nhân viên (${game.bots.length} người)</td><td class="neg">-$${s.wages}</td></tr>
      <tr class="tot"><td>Lãi / lỗ trong ngày</td><td class="${s.profit >= 0 ? 'pos' : 'neg'}">${s.profit >= 0 ? '+' : '-'}$${Math.abs(s.profit)}</td></tr>
    </table>
    <div class="hint">Ban đêm quán đóng cửa — tranh thủ nhập hàng (N), mua đồ (B), mở rộng quán.<br><b>Bấm Enter để bắt đầu ngày mới</b></div>`;
  $('summary').style.display = 'block';
});

let hudT = 0;
function updateHUD(dt) {
  $('money').textContent = `$${game.money}`;
  $('stats').textContent = `Đã phục vụ: ${game.served} · Khách bỏ về: ${game.lost} · Nhân viên: ${game.bots.length}`;
  $('held').innerHTML = player.held ? `Đang cầm: <b>${itemName(player.held)}</b>` : 'Tay không';
  const h = game.hour;
  const status = game.isOpen ? (game.acceptingGuests ? '<span class="open">● ĐANG MỞ CỬA</span>' : '<span class="closing">● Sắp đóng cửa</span>')
    : h < OPEN_H ? '<span class="closing">● Chuẩn bị mở cửa</span>' : '<span class="closed">● ĐÃ ĐÓNG CỬA</span>';
  const icon = h < 6 || h >= 19.5 ? '🌙' : h < 9 ? '🌅' : h < 17 ? '☀️' : '🌇';
  $('clock').innerHTML = `${icon} Ngày ${game.day} · <b>${clockText()}</b> ${status}`;

  let p = '';
  if (mode === 'build') {
    const s = SHOP[build.selected];
    p = s.hire ? `Bấm ${build.selected + 1} để thuê (lương $${WAGE[s.key]}/ngày)` : `<b>CHẾ ĐỘ XÂY</b> — Click để đặt ${s.name} ($${s.price})${s.key === 'table' ? ' · R: xoay' : ''}`;
  } else if (target) {
    if (target.kind === 'station') p = describeStation(target, player.held);
    else if (target.kind === 'table') p = describeTable(target, player.held);
    else if (target.kind === 'expansion') p = `<b>${target.name}</b><br>[E] Mở rộng quán ($${target.price})`;
  }
  if (flash.t > 0) { flash.t -= dt; p = `<span class="flash">${flash.text}</span>` + (p ? '<br>' + p : ''); }
  if ($('prompt').innerHTML !== p) $('prompt').innerHTML = p;
  $('cross').classList.toggle('on', !!target && mode === 'play');

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }

  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.2;
  if (mode === 'build') renderShop();
  // kho
  $('inv').innerHTML = '<h3>📦 Kho <small>(N: nhập hàng)</small></h3>' + SUPPLY.map((s) => {
    const n = stock[s.type];
    return `<span class="ist ${n === 0 ? 'out' : n <= LOW ? 'low' : ''}">${s.icon} ${n}</span>`;
  }).join('');
  // bảng đơn hàng
  $('orders').innerHTML = '<h3>📋 Đơn hàng</h3>' + (game.orders.length ? game.orders.map((o) => {
    const k = o.customer.patience / o.customer.maxPatience;
    const col = k > 0.5 ? '#4cd964' : k > 0.25 ? '#ffcc00' : '#ff3b30';
    const vip = o.customer.profile.wealth === 'rich' ? '💎' : '';
    return `<div class="o"><span>${vip}${o.recipe.icon} ${o.recipe.name}</span><span class="tb">Bàn ${o.table.no}</span>
      <div class="bar"><i style="width:${k * 100}%;background:${col}"></i></div></div>`;
  }).join('') : '<div class="empty">Chưa có đơn</div>');
  $('tasks').innerHTML = '<h3>🗂️ Task Queue</h3>' +
    (tasks.list.length ? tasks.list.slice(0, 8).map((t) => `<div class="t">${t.role === 'chef' ? '👨‍🍳' : '🤵'} ${t.text}</div>`).join('') : '<div class="empty">Trống</div>') +
    (game.bots.length ? '<h3>👥 Nhân viên</h3>' + game.bots.map((b) => `<div class="t"><b>${b.name}:</b> ${b.status}</div>`).join('') : '');
}

// ===== Vòng lặp =====
function tick(dt) {
  game.dt = dt;
  game.time += dt;
  updatePlayer(dt);
  camera.updateMatrixWorld();
  updateTarget();
  updateDayNight(dt);
  for (const s of game.stations) s.update(dt);
  updateCustomers(dt);
  updateStaff(dt);
  updateBuild();
  updateFloaters(dt);
  updateStreet(dt);
}
// Debug: tua nhanh mô phỏng N giây (gõ trong console: game.simulate(60))
game.simulate = (sec) => { for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30); };
game.renderNow = () => { hudT = 0; updateHUD(0); for (const c of game.customers) c.updateLabel(); for (const s of game.stations) s.update(0); renderer.render(scene, camera); };
game.nextDay = () => { if (nextDay()) $('summary').style.display = 'none'; };

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  game.dt = dt;
  if (!game.paused && game.started) tick(dt);
  else {
    camera.position.set(player.pos.x, 1.6, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    for (const s of game.stations) s.label.hide();
  }
  updateHUD(dt);
  renderer.render(scene, camera);
}
renderShop();
loop();
