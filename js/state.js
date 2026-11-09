// Trạng thái dùng chung của toàn bộ game + event bus nhỏ.
export const game = {
  scene: null,
  camera: null,
  renderer: null,
  dt: 0,
  time: 0,
  paused: true,

  money: 150,
  served: 0,
  lost: 0,
  daily: { revenue: 0, tips: 0, spent: 0, served: 0, lost: 0 }, // thống kê trong ngày

  stations: [],     // Hệ thống 1
  tables: [],       // Hệ thống 3 (đồ nội thất có ghế)
  customers: [],    // Hệ thống 2
  orders: [],       // đơn đang chờ
  bots: [],         // Hệ thống 4
  interactables: [],// mesh có thể nhìn vào & bấm E

  player: null,
  buildMode: false,

  _handlers: {},
  on(name, fn) { (this._handlers[name] ||= []).push(fn); },
  emit(name, ...args) { (this._handlers[name] || []).forEach((fn) => fn(...args)); },

  toast(msg) { this.emit('toast', msg); },
};

window.game = game; // tiện debug trong console
