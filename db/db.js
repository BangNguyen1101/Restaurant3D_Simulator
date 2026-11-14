// Kết nối PostgreSQL + các hàm lưu/tải tiến trình.
// Cấu hình bằng biến môi trường DATABASE_URL, ví dụ:
//   - Neon (đám mây):  postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require
//   - Máy cá nhân:     postgresql://postgres:postgres@localhost:5432/nhahang3d
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const URL = process.env.DATABASE_URL;
let pool;

function hostOf(url) {
  try { return new globalThis.URL(url).hostname; } catch { return '?'; }
}

// Chạy db/schema.sql để tạo bảng nếu chưa có
async function initSchema() {
  const script = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(script);
}

async function connect() {
  if (!URL) throw new Error('Chưa cấu hình DATABASE_URL (xem file .env.example)');
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(URL);
  pool = new Pool({
    connectionString: URL,
    ssl: local ? false : { rejectUnauthorized: false }, // Neon/Render bắt buộc SSL
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', (e) => console.error('PostgreSQL pool error:', e.message)); // mất kết nối tạm thời không làm sập server
  await initSchema();
  return { server: hostOf(URL), database: 'PostgreSQL' };
}

const ITEM_TYPES = new Set(['table', 'stove', 'board', 'counter', 'plates', 'sink', 'trash',
  'crate_bun', 'crate_meat', 'crate_lettuce', 'crate_tomato',
  'wall_removed']); // ô tường trong nhà người chơi đã phá
const INGREDIENTS = new Set(['bun', 'meat', 'lettuce', 'tomato']);
const int = (v, min = 0, max = 1e9) => {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Giá trị không hợp lệ: ${v}`);
  return n;
};

// Tên cột trả về giữ nguyên như bản SQL Server cũ (SlotName, Day…) để phần game không phải sửa
// Mọi hàm ô lưu đều lọc theo user_id: người chơi chỉ thấy, sửa, xoá được ô lưu của chính mình
async function listSaves(userId) {
  const r = await pool.query(`
    SELECT save_id AS "SaveId", slot_name AS "SlotName", day AS "Day", money AS "Money",
           total_served AS "TotalServed", total_lost AS "TotalLost", updated_at AS "UpdatedAt",
           tables AS "Tables", staff AS "Staff", total_profit AS "TotalProfit"
    FROM vw_save_overview WHERE user_id = $1 ORDER BY updated_at DESC`, [userId]);
  return r.rows;
}

async function loadSave(userId, slot) {
  const s = (await pool.query('SELECT * FROM saves WHERE user_id = $1 AND slot_name = $2', [userId, slot])).rows[0];
  if (!s) return null;
  const q = (text) => pool.query(text, [s.save_id]);
  const [inv, furn, staff, exp, reports] = await Promise.all([
    q('SELECT ingredient, quantity FROM save_inventory WHERE save_id = $1'),
    q('SELECT item_type, x, z, rotation FROM save_furniture WHERE save_id = $1 ORDER BY furniture_id'),
    q('SELECT role FROM save_staff WHERE save_id = $1 ORDER BY staff_id'),
    q('SELECT expansion_no FROM save_expansions WHERE save_id = $1 ORDER BY expansion_no'),
    q(`SELECT day AS "Day", served AS "Served", lost AS "Lost", revenue AS "Revenue", tips AS "Tips",
              spent AS "Spent", wages AS "Wages", profit AS "Profit"
       FROM day_reports WHERE save_id = $1 ORDER BY day`),
  ]);
  return {
    slot: s.slot_name, day: s.day, money: s.money, totalServed: s.total_served, totalLost: s.total_lost,
    updatedAt: s.updated_at,
    inventory: Object.fromEntries(inv.rows.map((r) => [r.ingredient, r.quantity])),
    furniture: furn.rows.map((r) => ({ type: r.item_type, x: r.x, z: r.z, rot: r.rotation })),
    staff: staff.rows.map((r) => r.role),
    expansions: exp.rows.map((r) => r.expansion_no),
    reports: reports.rows,
  };
}

// Lưu toàn bộ tiến trình trong 1 transaction (ghi đè ô lưu cũ)
async function saveGame(userId, slot, d) {
  if (!Number.isInteger(userId)) throw new Error('Thiếu người chơi');
  // kiểm tra hết dữ liệu trước khi mở transaction
  const vals = {
    day: int(d.day, 1, 100000), money: int(d.money, -1e9, 1e9),
    served: int(d.totalServed), lost: int(d.totalLost),
  };
  const inventory = Object.entries(d.inventory || {}).map(([ing, qty]) => {
    if (!INGREDIENTS.has(ing)) throw new Error(`Nguyên liệu lạ: ${ing}`);
    return [ing, int(qty)];
  });
  const furniture = (d.furniture || []).map((f) => {
    if (!ITEM_TYPES.has(f.type)) throw new Error(`Loại đồ lạ: ${f.type}`);
    return [f.type, int(f.x, 0, 100), int(f.z, 0, 100), int(f.rot || 0, 0, 3)];
  });
  const staff = (d.staff || []).map((role) => {
    if (role !== 'chef' && role !== 'waiter') throw new Error(`Vai trò lạ: ${role}`);
    return role;
  });
  const expansions = (d.expansions || []).map((no) => int(no, 1, 10));
  let report = null;
  if (d.report) {
    const r = d.report;
    report = ['day', 'served', 'lost', 'revenue', 'tips', 'spent', 'wages'].map((k) => int(r[k]));
    report.push(int(r.profit, -1e9, 1e9));
  }

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const up = await c.query(`
      INSERT INTO saves (user_id, slot_name, day, money, total_served, total_lost) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, slot_name) DO UPDATE SET day = EXCLUDED.day, money = EXCLUDED.money,
        total_served = EXCLUDED.total_served, total_lost = EXCLUDED.total_lost, updated_at = now()
      RETURNING save_id`, [userId, slot, vals.day, vals.money, vals.served, vals.lost]);
    const id = up.rows[0].save_id;
    for (const t of ['save_inventory', 'save_furniture', 'save_staff', 'save_expansions']) {
      await c.query(`DELETE FROM ${t} WHERE save_id = $1`, [id]);
    }
    for (const [ing, qty] of inventory) {
      await c.query('INSERT INTO save_inventory (save_id, ingredient, quantity) VALUES ($1, $2, $3)', [id, ing, qty]);
    }
    if (furniture.length) { // ghi nhiều dòng trong 1 câu lệnh
      const ph = furniture.map((_, i) => `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`).join(', ');
      await c.query(`INSERT INTO save_furniture (save_id, item_type, x, z, rotation) VALUES ${ph}`, [id, ...furniture.flat()]);
    }
    for (const role of staff) await c.query('INSERT INTO save_staff (save_id, role) VALUES ($1, $2)', [id, role]);
    for (const no of expansions) await c.query('INSERT INTO save_expansions (save_id, expansion_no) VALUES ($1, $2)', [id, no]);
    if (report) {
      await c.query(`
        INSERT INTO day_reports (save_id, day, served, lost, revenue, tips, spent, wages, profit)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (save_id, day) DO UPDATE SET served = EXCLUDED.served, lost = EXCLUDED.lost,
          revenue = EXCLUDED.revenue, tips = EXCLUDED.tips, spent = EXCLUDED.spent,
          wages = EXCLUDED.wages, profit = EXCLUDED.profit`, [id, ...report]);
    }
    await c.query('COMMIT');
    return id;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function deleteSave(userId, slot) {
  const r = await pool.query('DELETE FROM saves WHERE user_id = $1 AND slot_name = $2', [userId, slot]);
  return r.rowCount > 0;
}

// ===== Tài khoản & phiên đăng nhập =====
async function createUser(username, passwordHash) {
  try {
    const r = await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING user_id, username', [username, passwordHash]);
    return r.rows[0];
  } catch (e) {
    if (e.code === '23505') return null; // trùng tên đăng nhập
    throw e;
  }
}
async function findUser(username) {
  const r = await pool.query('SELECT user_id, username, password_hash FROM users WHERE lower(username) = lower($1)', [username]);
  return r.rows[0] || null;
}
async function createSession(userId, tokenHash, days) {
  await pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [tokenHash, userId, days]);
  // dọn phiên hết hạn
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
}
async function sessionUser(tokenHash) {
  const r = await pool.query(`SELECT u.user_id, u.username FROM sessions s JOIN users u ON u.user_id = s.user_id
                              WHERE s.token_hash = $1 AND s.expires_at > now()`, [tokenHash]);
  return r.rows[0] || null;
}
async function deleteSession(tokenHash) {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

// Gán ô lưu cũ (chưa có chủ, từ trước khi có đăng nhập) cho một tài khoản
async function assignSave(slot, username) {
  const u = await findUser(username);
  if (!u) throw new Error(`Không có tài khoản "${username}"`);
  const r = await pool.query('UPDATE saves SET user_id = $1 WHERE user_id IS NULL AND slot_name = $2', [u.user_id, slot]);
  return r.rowCount;
}

module.exports = {
  connect, listSaves, loadSave, saveGame, deleteSave,
  createUser, findUser, createSession, sessionUser, deleteSession, assignSave,
};
