// Kết nối SQL Server + các hàm lưu/tải tiến trình.
// Hai chế độ (chọn tự động theo biến môi trường):
//  - Có DB_USER  -> đăng nhập SQL (user/mật khẩu), dùng cho Azure SQL / server trên cloud.
//  - Không có    -> Windows Authentication qua ODBC, dùng cho SQL Server trên máy bạn.
const fs = require('fs');
const path = require('path');

const USE_SQL_AUTH = !!process.env.DB_USER;
const sql = USE_SQL_AUTH ? require('mssql') : require('mssql/msnodesqlv8');

const SERVER = process.env.DB_SERVER || 'localhost';          // vd: localhost\SQLEXPRESS hoặc ten.database.windows.net
const DATABASE = process.env.DB_NAME || 'NhaHang3D';
const DRIVER = process.env.DB_DRIVER || 'ODBC Driver 17 for SQL Server';

function config(db) {
  if (USE_SQL_AUTH) {
    return {
      server: SERVER,
      port: Number(process.env.DB_PORT) || 1433,
      database: db,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: { encrypt: true, trustServerCertificate: process.env.DB_TRUST_CERT === 'true' },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    };
  }
  return { connectionString: `Driver={${DRIVER}};Server=${SERVER};Database=${db};Trusted_Connection=yes;` };
}

let pool;

// Máy nhà: tự tạo database nếu chưa có. (Trên Azure, database được tạo trên trang quản trị.)
async function ensureDatabase() {
  if (USE_SQL_AUTH) return;
  const master = await new sql.ConnectionPool(config('master')).connect();
  try {
    await master.request().input('db', sql.NVarChar(128), DATABASE)
      .query(`IF DB_ID(@db) IS NULL BEGIN DECLARE @s NVARCHAR(300) = N'CREATE DATABASE ' + QUOTENAME(@db); EXEC(@s); END`);
  } finally { await master.close(); }
}

// Chạy db/schema.sql (tách theo GO) để tạo bảng nếu chưa có
async function initSchema() {
  const script = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const batches = script.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
  for (const b of batches) await pool.request().batch(b);
}

async function connect() {
  await ensureDatabase();
  pool = await new sql.ConnectionPool(config(DATABASE)).connect();
  await initSchema();
  return { server: SERVER, database: DATABASE, auth: USE_SQL_AUTH ? 'SQL login' : 'Windows' };
}

const ITEM_TYPES = new Set(['table', 'stove', 'board', 'counter', 'plates', 'sink', 'trash',
  'crate_bun', 'crate_meat', 'crate_lettuce', 'crate_tomato']);
const INGREDIENTS = new Set(['bun', 'meat', 'lettuce', 'tomato']);
const int = (v, min = 0, max = 1e9) => {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Giá trị không hợp lệ: ${v}`);
  return n;
};

async function listSaves() {
  const r = await pool.request().query('SELECT * FROM dbo.vw_SaveOverview ORDER BY UpdatedAt DESC');
  return r.recordset;
}

async function loadSave(slot) {
  const q = (text) => pool.request().input('slot', sql.NVarChar(50), slot).query(text);
  const s = (await q('SELECT * FROM dbo.Saves WHERE SlotName = @slot')).recordset[0];
  if (!s) return null;
  const byId = (text) => pool.request().input('id', sql.Int, s.SaveId).query(text);
  const [inv, furn, staff, exp, reports] = await Promise.all([
    byId('SELECT Ingredient, Quantity FROM dbo.SaveInventory WHERE SaveId = @id'),
    byId('SELECT ItemType, X, Z, Rotation FROM dbo.SaveFurniture WHERE SaveId = @id ORDER BY FurnitureId'),
    byId('SELECT Role FROM dbo.SaveStaff WHERE SaveId = @id ORDER BY StaffId'),
    byId('SELECT ExpansionNo FROM dbo.SaveExpansions WHERE SaveId = @id ORDER BY ExpansionNo'),
    byId('SELECT Day, Served, Lost, Revenue, Tips, Spent, Wages, Profit FROM dbo.DayReports WHERE SaveId = @id ORDER BY Day'),
  ]);
  return {
    slot: s.SlotName, day: s.Day, money: s.Money, totalServed: s.TotalServed, totalLost: s.TotalLost,
    updatedAt: s.UpdatedAt,
    inventory: Object.fromEntries(inv.recordset.map((r) => [r.Ingredient, r.Quantity])),
    furniture: furn.recordset.map((r) => ({ type: r.ItemType, x: r.X, z: r.Z, rot: r.Rotation })),
    staff: staff.recordset.map((r) => r.Role),
    expansions: exp.recordset.map((r) => r.ExpansionNo),
    reports: reports.recordset,
  };
}

// Lưu toàn bộ tiến trình trong 1 transaction (ghi đè ô lưu cũ)
async function saveGame(slot, d) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const req = () => new sql.Request(tx);
    const up = await req()
      .input('slot', sql.NVarChar(50), slot)
      .input('day', sql.Int, int(d.day, 1, 100000))
      .input('money', sql.Int, int(d.money, -1e9, 1e9))
      .input('served', sql.Int, int(d.totalServed))
      .input('lost', sql.Int, int(d.totalLost))
      .query(`
        MERGE dbo.Saves WITH (HOLDLOCK) AS t
        USING (SELECT @slot AS SlotName) AS s ON t.SlotName = s.SlotName
        WHEN MATCHED THEN UPDATE SET Day=@day, Money=@money, TotalServed=@served, TotalLost=@lost, UpdatedAt=SYSDATETIME()
        WHEN NOT MATCHED THEN INSERT (SlotName, Day, Money, TotalServed, TotalLost) VALUES (@slot, @day, @money, @served, @lost)
        OUTPUT inserted.SaveId;`);
    const id = up.recordset[0].SaveId;
    for (const t of ['SaveInventory', 'SaveFurniture', 'SaveStaff', 'SaveExpansions']) {
      await req().input('id', sql.Int, id).query(`DELETE FROM dbo.${t} WHERE SaveId = @id`);
    }
    for (const [ing, qty] of Object.entries(d.inventory || {})) {
      if (!INGREDIENTS.has(ing)) throw new Error(`Nguyên liệu lạ: ${ing}`);
      await req().input('id', sql.Int, id).input('ing', sql.VarChar(20), ing).input('q', sql.Int, int(qty))
        .query('INSERT INTO dbo.SaveInventory (SaveId, Ingredient, Quantity) VALUES (@id, @ing, @q)');
    }
    for (const f of d.furniture || []) {
      if (!ITEM_TYPES.has(f.type)) throw new Error(`Loại đồ lạ: ${f.type}`);
      await req().input('id', sql.Int, id).input('type', sql.VarChar(20), f.type)
        .input('x', sql.Int, int(f.x, 0, 100)).input('z', sql.Int, int(f.z, 0, 100)).input('rot', sql.TinyInt, int(f.rot || 0, 0, 3))
        .query('INSERT INTO dbo.SaveFurniture (SaveId, ItemType, X, Z, Rotation) VALUES (@id, @type, @x, @z, @rot)');
    }
    for (const role of d.staff || []) {
      if (role !== 'chef' && role !== 'waiter') throw new Error(`Vai trò lạ: ${role}`);
      await req().input('id', sql.Int, id).input('role', sql.VarChar(10), role)
        .query('INSERT INTO dbo.SaveStaff (SaveId, Role) VALUES (@id, @role)');
    }
    for (const no of d.expansions || []) {
      await req().input('id', sql.Int, id).input('no', sql.Int, int(no, 1, 10))
        .query('INSERT INTO dbo.SaveExpansions (SaveId, ExpansionNo) VALUES (@id, @no)');
    }
    if (d.report) {
      const r = d.report;
      const rq = req().input('id', sql.Int, id);
      for (const k of ['day', 'served', 'lost', 'revenue', 'tips', 'spent', 'wages']) rq.input(k, sql.Int, int(r[k]));
      rq.input('profit', sql.Int, int(r.profit, -1e9, 1e9));
      await rq.query(`
        MERGE dbo.DayReports AS t
        USING (SELECT @id AS SaveId, @day AS Day) AS s ON t.SaveId = s.SaveId AND t.Day = s.Day
        WHEN MATCHED THEN UPDATE SET Served=@served, Lost=@lost, Revenue=@revenue, Tips=@tips, Spent=@spent, Wages=@wages, Profit=@profit
        WHEN NOT MATCHED THEN INSERT (SaveId, Day, Served, Lost, Revenue, Tips, Spent, Wages, Profit)
          VALUES (@id, @day, @served, @lost, @revenue, @tips, @spent, @wages, @profit);`);
    }
    await tx.commit();
    return id;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function deleteSave(slot) {
  const r = await pool.request().input('slot', sql.NVarChar(50), slot).query('DELETE FROM dbo.Saves WHERE SlotName = @slot');
  return r.rowsAffected[0] > 0;
}

module.exports = { connect, listSaves, loadSave, saveGame, deleteSave };
