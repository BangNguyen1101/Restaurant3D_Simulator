// HỆ THỐNG 2: AI khách hàng — một State Machine đơn giản.
// FIND_SEAT -> WALK_TO_SEAT -> ORDER -> WAITING -> EATING -> PAY -> LEAVE -> GONE
import * as THREE from 'three';
import { game } from './state.js';
import { Agent, SPAWN, tileCenter } from './world.js';
import { Label, bar, floatText } from './labels.js';
import { RECIPES, refreshMesh } from './items.js';
import { buildPerson, animatePerson, randomProfile, WEALTH } from './people.js';

const EAT_TIME = 7;
let nextId = 1;
let orderSeq = 1;

export class Customer extends Agent {
  constructor() {
    super(SPAWN[0], SPAWN[1], 1.7 + Math.random() * 0.6);
    this.id = nextId++;
    this.kind = 'customer';
    this.profile = randomProfile();
    this.type = WEALTH[this.profile.wealth];
    this.maxPatience = this.type.patience;
    // xuất hiện ở xa trên vỉa hè rồi đi bộ tới cửa quán
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.group.position.x += this.side * (14 + Math.random() * 8);
    this.state = 'ARRIVE';
    this.seat = null; this.table = null;
    this.order = null;
    this.patience = this.maxPatience;
    this.timer = 0;
    this.angry = false;
    this.targetedBy = null; // bồi bàn đang mang món tới
    this.body = buildPerson(this.profile);
    this.group.add(this.body);
    this.label = new Label('bubble');
    game.scene.add(this.group);
    game.customers.push(this);
  }

  setState(s) { this.state = s; this.timer = 0; }

  // Đi thẳng trên vỉa hè (ngoài lưới tìm đường). Trả về true khi tới nơi.
  walkStraight(target, dt) {
    const p = this.group.position;
    const d = target.clone().sub(p); d.y = 0;
    const len = d.length(), mv = this.speed * dt;
    this.walkAnim = (this.walkAnim || 0) + dt * 9;
    if (len <= mv) { p.x = target.x; p.z = target.z; return true; }
    p.add(d.multiplyScalar(mv / len));
    this.faceDir(d.x, d.z, dt);
    return false;
  }

  update(dt) {
    this.timer += dt;
    switch (this.state) {
      case 'ARRIVE':
        if (this.walkStraight(tileCenter(SPAWN[0], SPAWN[1]), dt)) this.setState('FIND_SEAT');
        break;
      case 'WALK_AWAY':
        if (this.walkStraight(new THREE.Vector3(SPAWN[0] + 0.5 + this.side * 24, 0, SPAWN[1] + 0.5), dt)) this.setState('GONE');
        break;
      case 'FIND_SEAT': {
        const free = [];
        for (const t of game.tables) for (const s of t.seats) if (!s.customer && !s.plate) free.push([t, s]);
        if (!free.length) { this.setState('LEAVE'); this.goTo(SPAWN[0], SPAWN[1]); break; }
        // khách giàu thích ngồi phòng VIP (bàn ở xa cửa nhất)
        if (this.profile.wealth === 'rich') free.sort((a, b) => b[0].x - a[0].x);
        const [t, s] = this.profile.wealth === 'rich' ? free[0] : free[Math.floor(Math.random() * free.length)];
        this.table = t; this.seat = s; s.customer = this;
        if (!this.goTo(s.tile[0], s.tile[1], true)) { s.customer = null; this.setState('LEAVE'); break; }
        this.setState('WALK_TO_SEAT');
        break;
      }
      case 'WALK_TO_SEAT':
        if (this.step(dt)) {
          this.group.position.copy(tileCenter(...this.seat.tile).lerp(this.table.center, 0.12));
          this.facePoint(this.table.center);
          this.body.position.y = -0.28; // ngồi xuống
          this.setState('ORDER');
        }
        break;
      case 'ORDER':
        if (this.timer > 2) {
          const likes = this.type.likes;
          const id = likes[Math.floor(Math.random() * likes.length)];
          const recipe = RECIPES.find((r) => r.id === id);
          // seq: số thứ tự gọi món — khách gọi trước được nấu và bưng trước
          this.order = { recipe, customer: this, table: this.table, seat: this.seat, active: true, claimed: false, id: this.id, seq: orderSeq++ };
          game.orders.push(this.order);
          game.emit('newOrder', this.order);
          this.patience = this.maxPatience;
          this.setState('WAITING');
        }
        break;
      case 'WAITING':
        this.patience -= dt;
        if (this.patience <= 0) {
          this.angry = true;
          game.lost++; game.daily.lost++;
          game.toast(`😡 ${this.type.label} ở bàn ${this.table.no} bỏ về vì chờ quá lâu!`);
          game.emit('customerAngry', this);
          this.leaveSeat();
        }
        break;
      case 'EATING':
        if (this.timer >= EAT_TIME) {
          const p = this.seat.plate;
          p.dirty = true; p.contents = []; refreshMesh(p);
          game.emit('dirtyPlate', this.seat);
          const price = this.order.recipe.price;
          const tip = Math.round(price * this.type.tip * (this.patienceAtServe / this.maxPatience));
          this.paid = price + tip;
          game.money += this.paid;
          game.served++;
          game.daily.served++; game.daily.revenue += price; game.daily.tips += tip;
          floatText(`+$${this.paid}${tip ? ` (tip $${tip})` : ''}`, this.group.position.clone().setY(2));
          this.setState('PAY');
        }
        break;
      case 'PAY':
        if (this.timer > 1.2) this.leaveSeat();
        break;
      case 'LEAVE':
        if (this.step(dt)) { this.side = Math.random() < 0.5 ? -1 : 1; this.setState('WALK_AWAY'); }
        break;
    }
    const seated = ['ORDER', 'WAITING', 'EATING', 'PAY'].includes(this.state);
    const walking = this.path.length || this.state === 'ARRIVE' || this.state === 'WALK_AWAY';
    animatePerson(this.body, seated ? 'sit' : walking ? 'walk' : 'idle', this.walkAnim || 0);
    this.updateLabel();
  }

  leaveSeat() {
    if (this.order) { this.order.active = false; removeOrder(this.order); }
    if (this.seat) this.seat.customer = null;
    this.body.position.y = 0;
    this.setState('LEAVE');
    if (!this.goTo(SPAWN[0], SPAWN[1])) this.setState('GONE');
  }

  // Gọi khi người chơi / bồi bàn đặt đĩa đúng món xuống bàn
  onServed() {
    this.patienceAtServe = this.patience;
    this.order.active = false;
    removeOrder(this.order);
    this.targetedBy = null;
    this.setState('EATING');
  }

  updateLabel() {
    let html = '';
    const r = this.order && this.order.recipe;
    const vip = this.profile.wealth === 'rich' ? '💎 ' : '';
    if (this.state === 'ORDER') html = `${vip}🤔 Đang xem menu...`;
    else if (this.state === 'WAITING') {
      const k = this.patience / this.maxPatience;
      html = `<div class="ord">${vip}${r.icon} ${r.name}</div>${bar(k, k > 0.5 ? '#4cd964' : k > 0.25 ? '#ffcc00' : '#ff3b30')}`;
    } else if (this.state === 'EATING') html = `😋 Đang ăn${bar(this.timer / EAT_TIME, '#5ac8fa')}`;
    else if (this.state === 'PAY') html = `💵 Trả $${this.paid}`;
    else if (this.state === 'LEAVE' && this.angry) html = '😡';
    this.label.set(html);
    this.label.show(this.group.position.clone().setY(this.body.position.y + 2.15));
  }

  destroy() {
    game.scene.remove(this.group);
    this.label.destroy();
  }
}

function removeOrder(o) {
  const i = game.orders.indexOf(o);
  if (i >= 0) game.orders.splice(i, 1);
}

// ===== Sinh khách (chỉ khi quán mở cửa) =====
let spawnTimer = 3;
export function updateCustomers(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const hasFreeSeat = game.tables.some((t) => t.seats.some((s) => !s.customer && !s.plate));
    if (game.isOpen && game.acceptingGuests && hasFreeSeat) new Customer();
    // càng nhiều ghế, khách đến càng nhanh
    const seats = game.tables.reduce((n, t) => n + t.seats.length, 0);
    spawnTimer = Math.max(5, 20 - seats * 1.2) * (0.7 + Math.random() * 0.6);
  }
  for (let i = game.customers.length - 1; i >= 0; i--) {
    const c = game.customers[i];
    c.update(dt);
    if (c.state === 'GONE') { c.destroy(); game.customers.splice(i, 1); }
  }
}
