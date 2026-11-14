// Server: phục vụ file game + API lưu/tải tiến trình vào PostgreSQL.
//   npm install   (lần đầu)
//   npm start     -> http://localhost:5173   (đọc DATABASE_URL trong file .env)
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db/db');
const auth = require('./server/auth');

const root = __dirname;
const port = process.env.PORT || 5173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.md': 'text/plain' };
let dbReady = false, dbError = null;

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new Error('Dữ liệu quá lớn')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('JSON không hợp lệ')); } });
    req.on('error', reject);
  });
}

const validSlot = (s) => typeof s === 'string' && s.trim().length > 0 && s.length <= 50;

// Người chơi đang đăng nhập (đọc cookie phiên), null nếu chưa đăng nhập / phiên hết hạn
async function currentUser(req) {
  const token = auth.parseCookies(req)[auth.COOKIE];
  if (!token || token.length > 100) return null;
  return db.sessionUser(auth.tokenHash(token));
}

async function startSession(req, res, user) {
  const token = auth.newToken();
  await db.createSession(user.user_id, auth.tokenHash(token), auth.SESSION_DAYS);
  res.setHeader('Set-Cookie', auth.sessionCookie(req, token));
  return sendJSON(res, 200, { user: { username: user.username } });
}

async function authApi(req, res, url) {
  if (url === '/api/auth/me' && req.method === 'GET') {
    const u = await currentUser(req);
    return u ? sendJSON(res, 200, { user: { username: u.username } }) : sendJSON(res, 401, { error: 'Chưa đăng nhập' });
  }
  if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method không hỗ trợ' });
  if (url === '/api/auth/logout') {
    const token = auth.parseCookies(req)[auth.COOKIE];
    if (token) await db.deleteSession(auth.tokenHash(token));
    res.setHeader('Set-Cookie', auth.clearCookie(req));
    return sendJSON(res, 200, { ok: true });
  }
  const body = await readBody(req);
  const username = typeof body.username === 'string' ? body.username.trim() : body.username;
  const bad = auth.checkCredentials(username, body.password);
  if (bad) return sendJSON(res, 400, { error: bad });
  if (url === '/api/auth/register') {
    const user = await db.createUser(username, auth.hashPassword(body.password));
    if (!user) return sendJSON(res, 409, { error: 'Tên đăng nhập đã có người dùng' });
    return startSession(req, res, user);
  }
  if (url === '/api/auth/login') {
    const key = auth.rateKey(req, username);
    if (auth.isLocked(key)) return sendJSON(res, 429, { error: 'Sai quá nhiều lần, thử lại sau 15 phút' });
    const user = await db.findUser(username);
    const ok = auth.verifyPassword(body.password, user ? user.password_hash : auth.DUMMY_HASH) && !!user;
    if (!ok) { auth.addFail(key); return sendJSON(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' }); }
    auth.clearFails(key);
    return startSession(req, res, user);
  }
  return sendJSON(res, 404, { error: 'Không có API này' });
}

async function api(req, res, url) {
  if (url === '/api/status') return sendJSON(res, 200, { db: dbReady, error: dbError });
  if (!dbReady) return sendJSON(res, 503, { error: 'Chưa kết nối được cơ sở dữ liệu: ' + dbError });
  // Chống CSRF: yêu cầu thay đổi dữ liệu phải có header riêng của game (trang web khác không gửi kèm được)
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'NhaHang3D') return sendJSON(res, 403, { error: 'Yêu cầu không hợp lệ' });
  if (url.startsWith('/api/auth/')) return authApi(req, res, url);

  const user = await currentUser(req);
  if (!user) return sendJSON(res, 401, { error: 'Bạn cần đăng nhập' });
  const uid = user.user_id;
  if (url === '/api/saves' && req.method === 'GET') return sendJSON(res, 200, await db.listSaves(uid));
  const m = url.match(/^\/api\/saves\/(.+)$/);
  if (!m) return sendJSON(res, 404, { error: 'Không có API này' });
  const slot = decodeURIComponent(m[1]).trim();
  if (!validSlot(slot)) return sendJSON(res, 400, { error: 'Tên ô lưu không hợp lệ (1–50 ký tự)' });
  if (req.method === 'GET') {
    const s = await db.loadSave(uid, slot);
    return s ? sendJSON(res, 200, s) : sendJSON(res, 404, { error: 'Không tìm thấy ô lưu' });
  }
  if (req.method === 'POST') {
    const id = await db.saveGame(uid, slot, await readBody(req));
    return sendJSON(res, 200, { ok: true, saveId: id });
  }
  if (req.method === 'DELETE') return sendJSON(res, 200, { ok: await db.deleteSave(uid, slot) });
  return sendJSON(res, 405, { error: 'Method không hỗ trợ' });
}

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/api/')) {
    try { await api(req, res, req.url.split('?')[0]); }
    catch (e) { console.error(e); sendJSON(res, 400, { error: e.message }); }
    return;
  }
  const file = path.normalize(path.join(root, url === '/' ? 'index.html' : url));
  const rel = path.relative(root, file);
  const blocked = rel.startsWith('..') || rel.split(path.sep).some((p) => p.startsWith('.')) // .env, .git, .claude...
    || /^(node_modules|db|server|logs|deploy|scripts|dist)(\\|\/|$)/.test(rel)
    || /^(package(-lock)?\.json|serve\.js|vercel\.json|saves-export\.json|web\.config.*|.*\.(md|ps1|zip|ya?ml))$/i.test(rel);
  if (blocked) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`Nha Hang 3D: http://localhost:${port}`));

// Kết nối CSDL; lỗi thì thử lại mỗi 15 giây (CSDL đám mây có thể đang khởi động)
function connectDb() {
  db.connect()
    .then((info) => { dbReady = true; dbError = null; console.log(`PostgreSQL OK: ${info.server}`); })
    .catch((e) => {
      dbError = e.message;
      console.error('Khong ket noi duoc PostgreSQL:', e.message, '-> thu lai sau 15 giay (game van chay nhung chua luu duoc).');
      setTimeout(connectDb, 15000);
    });
}
connectDb();
