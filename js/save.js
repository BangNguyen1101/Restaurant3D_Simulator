// Lưu / tải tiến trình qua API của serve.js (dữ liệu nằm trong SQL Server).
import { game } from './state.js';
import { EXPANSIONS, unlockExpansion, isPartitionWall, removeWall } from './world.js';
import { Station, buildDefaultKitchen } from './cooking.js';
import { Table, buildDefaultDining } from './building.js';
import { Bot } from './staff.js';
import { stock } from './inventory.js';
import { OPEN_H } from './daynight.js';

export const saveState = { slot: null, dbOnline: false };

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export async function checkDb() {
  try { saveState.dbOnline = (await api('GET', '/api/status')).db; } catch { saveState.dbOnline = false; }
  return saveState.dbOnline;
}
export const listSaves = () => api('GET', '/api/saves');
export const deleteSave = (slot) => api('DELETE', `/api/saves/${encodeURIComponent(slot)}`);

// Chụp trạng thái hiện tại thành dữ liệu để lưu
function snapshot(day, report) {
  return {
    day,
    money: game.money,
    totalServed: game.served,
    totalLost: game.lost,
    inventory: { ...stock },
    furniture: [
      ...game.stations.map((s) => ({ type: s.type, x: s.x, z: s.z, rot: 0 })),
      ...game.tables.map((t) => ({ type: 'table', x: t.x, z: t.z, rot: t.rot })),
    ],
    staff: game.bots.map((b) => b.role),
    expansions: EXPANSIONS.filter((e) => e.unlocked).map((e) => e.no),
    report,
  };
}

export async function saveGame(day = game.day, report = null, silent = false) {
  if (!saveState.slot) return false;
  try {
    await api('POST', `/api/saves/${encodeURIComponent(saveState.slot)}`, snapshot(day, report));
    if (!silent) game.toast(`💾 Đã lưu "${saveState.slot}" vào SQL Server (tải lại sẽ bắt đầu sáng ngày ${day})`);
    return true;
  } catch (e) {
    game.toast(`⚠️ Lưu thất bại: ${e.message}`);
    return false;
  }
}

// ===== Bắt đầu ván =====
export function startNew(slot) {
  saveState.slot = slot;
  buildDefaultKitchen();
  buildDefaultDining();
  game.started = true;
  if (saveState.dbOnline) saveGame(1, null, true); // tạo ô lưu ngay
}

export async function startLoad(slot) {
  const s = await api('GET', `/api/saves/${encodeURIComponent(slot)}`);
  saveState.slot = slot;
  game.day = s.day;
  game.hour = OPEN_H - 0.25;
  game.money = s.money;
  game.served = s.totalServed;
  game.lost = s.totalLost;
  Object.assign(stock, s.inventory);
  for (const no of s.expansions) {
    const e = EXPANSIONS.find((x) => x.no === no);
    if (e) unlockExpansion(e, true);
  }
  for (const f of s.furniture) {
    if (f.type === 'table') new Table(f.x, f.z, f.rot);
    else {
      if (isPartitionWall(f.x, f.z)) removeWall(f.x, f.z); // quầy đặt thay tường bếp
      new Station(f.type, f.x, f.z);
    }
  }
  for (const role of s.staff) new Bot(role);
  game.started = true;
  game.toast(`📂 Đã tải "${slot}" — Ngày ${s.day}, $${s.money}`);
  return s;
}

// Tự lưu khi kết thúc ngày: lưu sang sáng hôm sau + báo cáo ngày vào bảng DayReports
game.on('dayEnd', (sum) => {
  if (!saveState.dbOnline || !saveState.slot) return;
  saveGame(sum.day + 1, sum, true).then((ok) => ok && game.toast(`💾 Đã tự lưu ngày ${sum.day} vào SQL Server`));
});
