// Hệ thống ngày đêm: mở cửa 08:00, ngừng đón khách 17:30, đóng cửa 18:00, tổng kết cuối ngày.
import * as THREE from 'three';
import { game } from './state.js';
import { setOpenSign } from './decor.js';

export const OPEN_H = 8, LAST_GUEST_H = 17.5, CLOSE_H = 18, NIGHT_H = 21;
export const SEC_PER_HOUR = 30;        // 1 giờ trong game = 30 giây thật → 1 ngày mở cửa = 5 phút
export const WAGE = { chef: 40, waiter: 25 };

game.day = 1;
game.hour = OPEN_H - 0.25;             // bắt đầu 07:45, 15 phút chuẩn bị
game.isOpen = false;
game.acceptingGuests = false;
game.dayOver = false;

let sun, hemi;
export function initDayNight(s, h) { sun = s; hemi = h; apply(); }

const C = (h) => new THREE.Color(h);
// mốc màu bầu trời theo giờ
const SKY = [
  [5, C(0x0b1530)], [7, C(0xf2b48a)], [9, C(0x9fd3f0)], [16, C(0x9fd3f0)],
  [17.5, C(0xf4a460)], [18.5, C(0xc0587a)], [19.5, C(0x1b2350)], [21, C(0x070b1d)],
];
function skyAt(h) {
  if (h <= SKY[0][0]) return SKY[0][1].clone();
  for (let i = 0; i < SKY.length - 1; i++) {
    const [a, ca] = SKY[i], [b, cb] = SKY[i + 1];
    if (h <= b) return ca.clone().lerp(cb, (h - a) / (b - a));
  }
  return SKY[SKY.length - 1][1].clone();
}
// 0 = đêm, 1 = trưa
function daylight(h) {
  if (h < 6 || h > 19.5) return 0;
  if (h < 9) return (h - 6) / 3;
  if (h > 17) return Math.max(0, 1 - (h - 17) / 2.5);
  return 1;
}

function apply() {
  const h = game.hour;
  const d = daylight(h);
  const sky = skyAt(h);
  game.scene.background = sky;
  game.scene.fog.color = sky;
  // mặt trời đi từ đông sang tây
  const a = ((h - 6) / 13) * Math.PI;
  sun.position.set(12 - Math.cos(a) * 20, 4 + Math.sin(a) * 16, 22);
  sun.intensity = 1.7 * d;
  sun.color.setHSL(0.1, 0.6, 0.6 + 0.3 * d);
  hemi.intensity = 0.35 + 0.8 * d;
  // đèn trong nhà sáng hơn khi trời tối
  const night = 1 - d;
  game.night = night; // con phố dùng để bật đèn đường, cửa sổ, đèn xe
  for (const l of game.lamps) l.intensity = 4 + 14 * night;
  game.bulbs.emissiveIntensity = 0.8 + 2.2 * night;
}

export function updateDayNight(dt) {
  if (game.hour < NIGHT_H) game.hour = Math.min(NIGHT_H, game.hour + dt / SEC_PER_HOUR);
  const h = game.hour;
  const open = h >= OPEN_H && h < CLOSE_H;
  if (open !== game.isOpen) {
    game.isOpen = open;
    setOpenSign(open);
    game.toast(open ? `☀️ Ngày ${game.day}: Quán mở cửa! (08:00)` : '🌙 18:00 — Quán đóng cửa. Phục vụ nốt khách còn lại.');
  }
  game.acceptingGuests = h >= OPEN_H && h < LAST_GUEST_H;
  if (!game.dayOver && h >= CLOSE_H && game.customers.length === 0) endDay();
  apply();
}

function endDay() {
  game.dayOver = true;
  const wages = game.bots.reduce((s, b) => s + WAGE[b.role], 0);
  game.money -= wages;
  const d = game.daily;
  game.summary = {
    day: game.day, served: d.served, lost: d.lost, revenue: d.revenue, tips: d.tips, spent: d.spent, wages,
    profit: d.revenue + d.tips - d.spent - wages,
  };
  game.emit('dayEnd', game.summary);
}

// Bấm Enter khi đã tổng kết → sang sáng hôm sau
export function nextDay() {
  if (!game.dayOver) return false;
  game.day++;
  game.hour = OPEN_H - 0.25;
  game.dayOver = false;
  // tiền chi trong đêm (sau khi đã tổng kết) được tính vào chi tiêu của ngày mới
  const nightSpent = Math.max(0, game.daily.spent - (game.summary ? game.summary.spent : 0));
  game.daily = { revenue: 0, tips: 0, spent: nightSpent, served: 0, lost: 0 };
  game.emit('dayStart');
  return true;
}

export function clockText() {
  const h = Math.floor(game.hour), m = Math.floor((game.hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
