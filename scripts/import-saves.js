// Nhập ô lưu từ file JSON (xuất từ bản SQL Server cũ) vào PostgreSQL đang cấu hình trong DATABASE_URL.
//   npm run import-saves -- saves-export.json <tên đăng nhập>
// (tài khoản phải được đăng ký trên game trước; ô lưu sẽ thuộc về tài khoản đó)
// File JSON có thể là 1 ô lưu (kết quả GET /api/saves/:slot) hoặc một mảng nhiều ô lưu.
// Ô lưu trùng tên sẽ bị ghi đè. Đồ đạc trùng ô (lỗi dựng chồng ở bản cũ) được gộp lại.
const fs = require('fs');
const db = require('../db/db');

const file = process.argv[2] || 'saves-export.json';
const username = process.argv[3];
if (!username) { console.log('Cách dùng: npm run import-saves -- saves-export.json <tên đăng nhập>'); process.exit(1); }

(async () => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const saves = Array.isArray(data) ? data : [data];
  await db.connect();
  const user = await db.findUser(username);
  if (!user) throw new Error(`Không có tài khoản "${username}" — hãy đăng ký trên game trước`);
  for (const s of saves) {
    const seen = new Set();
    const furniture = s.furniture.filter((f) => {
      const k = `${f.type}|${f.x}|${f.z}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    const base = {
      day: s.day, money: s.money, totalServed: s.totalServed, totalLost: s.totalLost,
      inventory: s.inventory, furniture, staff: s.staff, expansions: s.expansions,
    };
    const reports = s.reports || [];
    if (!reports.length) await db.saveGame(user.user_id, s.slot, base);
    for (const r of reports) {
      await db.saveGame(user.user_id, s.slot, { ...base, report: {
        day: r.Day, served: r.Served, lost: r.Lost, revenue: r.Revenue, tips: r.Tips,
        spent: r.Spent, wages: r.Wages, profit: r.Profit,
      } });
    }
    console.log(`Đã nhập "${s.slot}": ngày ${s.day}, $${s.money}, ${furniture.length}/${s.furniture.length} đồ đạc (bỏ ${s.furniture.length - furniture.length} đồ trùng), ${s.staff.length} nhân viên, ${reports.length} báo cáo ngày`);
  }
  process.exit(0);
})().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
