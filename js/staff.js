// HỆ THỐNG 4: Nhân viên AI chạy theo "Hàng đợi công việc" (Task Queue).
// Mỗi công việc là một generator function: chạy từng bước qua nhiều frame (yield = đợi frame sau).
import * as THREE from 'three';
import { game } from './state.js';
import { Agent } from './world.js';
import { Label } from './labels.js';
import { buildPerson, animatePerson } from './people.js';
import { stock } from './inventory.js';
import { interact, chop } from './cooking.js';
import { interactTable } from './building.js';
import { ING, matchRecipe, attachItem, destroyItem } from './items.js';

// ===== Task Queue =====
let taskId = 1;
export const tasks = {
  list: [],
  push(t) { t.id = taskId++; this.list.push(t); },
  // Lấy task hợp lệ, sẵn sàng và ƯU TIÊN NHẤT cho vai trò này (khách gọi món trước → làm trước).
  // Task hết hiệu lực (người chơi đã tự làm, khách đã bỏ về) bị bỏ.
  take(role) {
    let best = null, bestKey = Infinity;
    for (let i = 0; i < this.list.length; i++) {
      const t = this.list[i];
      if (t.role !== role) continue;
      if (!t.valid()) { this.list.splice(i--, 1); continue; }
      if (t.ready && !t.ready()) continue;
      const k = priority(t);
      if (k < bestKey) { best = t; bestKey = k; }
    }
    if (best) this.list.splice(this.list.indexOf(best), 1);
    return best;
  },
  prune() { this.list = this.list.filter((t) => t.valid()); },
  // Danh sách việc còn hiệu lực của một vai trò, theo đúng thứ tự nhân viên sẽ nhận
  pending(role) {
    return this.list.filter((t) => t.role === role && t.valid())
      .map((t) => ({ t, k: (t.ready && !t.ready() ? 2e9 : 0) + priority(t) }))
      .sort((a, b) => a.k - b.k).map((x) => x.t);
  },
};

// Khách đang chờ món này, ai gọi trước thì được phục vụ trước
const findWaitingCustomer = (recipe) => {
  let best = null;
  for (const c of game.customers) {
    if (c.state !== 'WAITING' || c.targetedBy || c.order.recipe.id !== recipe.id) continue;
    if (!best || c.order.seq < best.order.seq) best = c;
  }
  return best;
};

// Khoá ưu tiên (nhỏ = làm trước): nấu theo thứ tự gọi món; bưng món theo thứ tự gọi của khách
// sẽ nhận đĩa đó; dọn bàn xếp sau mọi việc bưng món (nhưng vẫn làm khi rảnh).
const CLEAN_BASE = 1e9;
function priority(t) {
  if (t.type === 'cook') return t.order.seq;
  if (t.type === 'deliver') { const c = findWaitingCustomer(matchRecipe(t.plate.contents)); return c ? c.order.seq : CLEAN_BASE - 1; }
  return CLEAN_BASE + t.id;
}

// Sự kiện từ các hệ thống khác -> tạo task
game.on('newOrder', (order) => tasks.push({
  role: 'chef', type: 'cook', order,
  text: `Nấu ${order.recipe.icon} ${order.recipe.name} (bàn ${order.table.no})`,
  valid: () => order.active && !order.claimed,
  // chỉ nấu khi kho còn đủ nguyên liệu
  ready: () => order.recipe.parts.every((p) => stock[p] > 0),
}));
game.on('plateReady', (counter, plate) => {
  if (tasks.list.some((t) => t.type === 'deliver' && t.plate === plate)) return;
  const r = matchRecipe(plate.contents);
  tasks.push({
    role: 'waiter', type: 'deliver', counter, plate,
    text: `Bưng ${r.icon} ${r.name}`,
    valid: () => counter.item === plate && !!matchRecipe(plate.contents),
    ready: () => !!findWaitingCustomer(matchRecipe(plate.contents)) && !counter.reservedBy,
  });
});
game.on('dirtyPlate', (seat) => tasks.push({
  role: 'waiter', type: 'clean', seat,
  text: `Dọn bàn ${seat.table.no}`,
  valid: () => !!(seat.plate && seat.plate.dirty),
  ready: () => !seat.customer, // chờ khách đứng dậy rồi mới dọn
}));

// ===== Tiện ích cho generator =====
function* wait(sec) { let t = 0; while (t < sec) { t += game.dt; yield; } }
function* waitUntil(fn, timeout = 60) { let t = 0; while (!fn()) { t += game.dt; if (t > timeout) return false; yield; } return true; }
function* walkTo(bot, ent) {
  while (!bot.goToEntity(ent)) { bot.status = '⛔ Không tìm được đường'; yield* wait(1); }
  while (!bot.step(game.dt)) yield;
  bot.facePoint(ent.center);
}
const findStation = (pred) => game.stations.find(pred);
function nearestFree(bot, type, extra = () => true) {
  const p = bot.group.position;
  return game.stations
    .filter((s) => s.type === type && !s.item && !s.reservedBy && extra(s))
    .sort((a, b) => a.center.distanceTo(p) - b.center.distanceTo(p))[0];
}

// ===== Đầu bếp =====
function* chefCook(bot, task) {
  const order = task.order;
  const recipe = order.recipe;
  order.claimed = true;
  const held = [];
  let counter = null;
  const fail = function* (why) {
    bot.status = '⚠️ ' + why;
    if (bot.held) { const tr = findStation((s) => s.type === 'trash'); yield* walkTo(bot, tr); interact(bot, tr); }
    if (order.active) { order.claimed = false; game.emit('newOrder', order); }
    yield* wait(1);
  };
  try {
    bot.status = `Chờ quầy trống cho ${recipe.name}`;
    while (!(counter = nearestFree(bot, 'counter'))) yield* wait(0.5);
    counter.reservedBy = bot;

    bot.status = `🍽️ Lấy đĩa (${recipe.name})`;
    yield* walkTo(bot, findStation((s) => s.type === 'plates'));
    interact(bot, findStation((s) => s.type === 'plates'));
    yield* walkTo(bot, counter);
    if (counter.item) { yield* fail('Quầy bị chiếm'); return; }
    interact(bot, counter);
    const plate = counter.item;

    for (const part of recipe.parts) {
      const crate = findStation((s) => s.def.ing === part);
      bot.status = `Lấy ${ING[part].name}`;
      yield* walkTo(bot, crate);
      interact(bot, crate);
      if (!bot.held) { yield* fail(`Hết ${ING[part].name} trong kho!`); return; }
      const proc = ING[part].process;
      if (proc) {
        const type = proc === 'chop' ? 'board' : 'stove';
        let st;
        bot.status = `Chờ ${type === 'board' ? 'thớt' : 'bếp'} trống`;
        while (!(st = nearestFree(bot, type))) yield* wait(0.5);
        st.reservedBy = bot; held.push(st);
        yield* walkTo(bot, st);
        if (st.item) { yield* fail('Chỗ đã bị chiếm'); return; }
        interact(bot, st);
        if (proc === 'chop') { bot.status = `🔪 Cắt ${ING[part].name}`; chop(bot, st); }
        else bot.status = `🔥 Nấu ${ING[part].name}`;
        const want = ING[part].finalState;
        yield* waitUntil(() => !st.item || st.item.state === want);
        if (!st.item) { yield* fail('Nguyên liệu bị lấy mất'); return; }
        interact(bot, st);
        st.reservedBy = null;
      }
      bot.status = `Bày ${ING[part].name} lên đĩa`;
      yield* walkTo(bot, counter);
      if (counter.item !== plate) { yield* fail('Đĩa bị lấy mất'); return; }
      interact(bot, counter);
      if (bot.held) { yield* fail('Không ghép được'); return; }
    }
    bot.status = `✅ Xong ${recipe.name}`;
    yield* wait(0.4);
  } finally {
    if (counter && counter.reservedBy === bot) counter.reservedBy = null;
    for (const s of held) if (s.reservedBy === bot) s.reservedBy = null;
  }
}

// ===== Bồi bàn =====
function* waiterDeliver(bot, task) {
  const recipe = matchRecipe(task.plate.contents);
  let cust = findWaitingCustomer(recipe);
  if (!cust) return;
  cust.targetedBy = bot;
  task.counter.reservedBy = bot;
  try {
    bot.status = `Lấy ${recipe.name} ở quầy`;
    yield* walkTo(bot, task.counter);
    if (task.counter.item !== task.plate) return;
    interact(bot, task.counter);
    task.counter.reservedBy = null;
    for (let tries = 0; tries < 3 && bot.held; tries++) {
      if (!cust || cust.state !== 'WAITING') { cust && (cust.targetedBy = null); cust = findWaitingCustomer(recipe); if (cust) cust.targetedBy = bot; }
      if (!cust) break;
      bot.status = `🍽️ Bưng ${recipe.name} → bàn ${cust.table.no}`;
      yield* walkTo(bot, cust.table);
      interactTable(bot, cust.table, cust.seat);
    }
    if (bot.held) { // không còn ai gọi món này: trả lại quầy
      bot.status = 'Trả món về quầy';
      const c = nearestFree(bot, 'counter');
      if (c) { yield* walkTo(bot, c); interact(bot, c); }
      else { const tr = findStation((s) => s.type === 'trash'); yield* walkTo(bot, tr); interact(bot, tr); interact(bot, tr); }
    }
  } finally {
    if (cust && cust.targetedBy === bot) cust.targetedBy = null;
    if (task.counter.reservedBy === bot) task.counter.reservedBy = null;
  }
}

function* waiterClean(bot, task) {
  const seat = task.seat;
  seat.cleaningBy = bot;
  try {
    bot.status = `🧹 Dọn bàn ${seat.table.no}`;
    yield* walkTo(bot, seat.table);
    if (!interactTable(bot, seat.table, seat)) return;
    bot.status = '🧽 Mang đĩa đi rửa';
    const sink = findStation((s) => s.type === 'sink');
    yield* walkTo(bot, sink);
    interact(bot, sink);
  } finally { seat.cleaningBy = null; }
}

// ===== Bot =====
const HOME = { chef: [9, 3], waiter: [8, 7] };

export class Bot extends Agent {
  constructor(role) {
    super(2, 4, 2.6);
    this.role = role;
    this.kind = 'bot';
    this.held = null;
    this.job = null;
    this.status = 'Rảnh';
    this.hand = new THREE.Vector3(0, 1.05, 0.38);
    const isChef = role === 'chef';
    this.body = buildPerson({
      wealth: 'normal', gender: Math.random() < 0.5 ? 'm' : 'f', old: false,
      uniform: isChef
        ? { top: 0xffffff, pants: 0x2f3338, extras: ['chefhat', 'apron'] }
        : { top: 0xffffff, pants: 0x111111, extras: ['vest', 'bowtie'] },
    });
    this.group.add(this.body);
    this.label = new Label('botlabel');
    this.name = isChef ? `Đầu bếp ${game.bots.filter((b) => b.role === 'chef').length + 1}` : `Bồi bàn ${game.bots.filter((b) => b.role === 'waiter').length + 1}`;
    game.scene.add(this.group);
    game.bots.push(this);
  }
  setHeld(item) {
    this.held = item;
    if (item) attachItem(item, this.group, this.hand);
  }
  update(dt) {
    if (!this.job) {
      const t = tasks.take(this.role);
      if (t) {
        this.task = t;
        this.job = this.role === 'chef' ? chefCook(this, t) : t.type === 'deliver' ? waiterDeliver(this, t) : waiterClean(this, t);
      } else {
        this.task = null;
        this.status = '💤 Rảnh';
        const [hx, hz] = HOME[this.role];
        const [x, z] = this.tile;
        if ((x !== hx || z !== hz) && !this.path.length) this.goTo(hx, hz);
        this.step(dt);
      }
    }
    if (this.job && this.job.next().done) { this.job = null; this.task = null; }
    if (!this.job && !this.task && tasks.list.some((t) => t.role === this.role && t.type === 'cook' && t.valid() && !t.ready())) this.status = '📦 Hết nguyên liệu — cần nhập hàng!';
    animatePerson(this.body, this.path.length ? 'walk' : 'idle', this.walkAnim || 0);
    this.label.set(`<b>${this.name}</b><br>${this.status}`);
    this.label.show(this.group.position.clone().setY(2.35), 14);
  }
}

game.on('hire', (role) => {
  new Bot(role);
  game.toast(role === 'chef' ? '👨‍🍳 Đã thuê đầu bếp mới!' : '🤵 Đã thuê bồi bàn mới!');
});

export function updateStaff(dt) {
  for (const b of game.bots) b.update(dt);
  if (Math.random() < 0.02) tasks.prune();
}

export { destroyItem };
