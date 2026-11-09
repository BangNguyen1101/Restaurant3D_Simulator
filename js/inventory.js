// Kho nguyên liệu: tồn kho + nhập hàng.
import { game } from './state.js';
import { ING } from './items.js';

export const stock = { bun: 8, meat: 8, lettuce: 8, tomato: 8 };
export const LOW = 3; // dưới mức này thì cảnh báo

// Gói nhập hàng: 10 phần / gói
export const SUPPLY = [
  { type: 'bun',     qty: 10, price: 15, icon: '🍞' },
  { type: 'meat',    qty: 10, price: 40, icon: '🥩' },
  { type: 'lettuce', qty: 10, price: 12, icon: '🥬' },
  { type: 'tomato',  qty: 10, price: 12, icon: '🍅' },
];
export const unitCost = (type) => { const s = SUPPLY.find((x) => x.type === type); return s.price / s.qty; };

export function takeStock(type) {
  if (stock[type] <= 0) {
    game.toast(`📦 Hết ${ING[type].name}! Bấm N để nhập hàng.`);
    return false;
  }
  stock[type]--;
  if (stock[type] === LOW) game.toast(`⚠️ ${ING[type].name} sắp hết (còn ${LOW}). Bấm N để nhập thêm.`);
  return true;
}
export function returnStock(type) { stock[type]++; }

export function buySupply(i) {
  const s = SUPPLY[i];
  if (!s) return;
  if (game.money < s.price) { game.toast(`Không đủ tiền nhập ${ING[s.type].name} (cần $${s.price})`); return; }
  game.money -= s.price;
  game.daily.spent += s.price;
  stock[s.type] += s.qty;
  game.toast(`🚚 Đã nhập ${s.qty} ${ING[s.type].name} (-$${s.price}) · Tồn: ${stock[s.type]}`);
}
