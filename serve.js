// Server: phục vụ file game + API lưu/tải tiến trình vào SQL Server.
//   npm install   (lần đầu)
//   npm start     -> http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db/db');

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

async function api(req, res, url) {
  if (url === '/api/status') return sendJSON(res, 200, { db: dbReady, error: dbError });
  if (!dbReady) return sendJSON(res, 503, { error: 'Chưa kết nối được SQL Server: ' + dbError });
  if (url === '/api/saves' && req.method === 'GET') return sendJSON(res, 200, await db.listSaves());
  const m = url.match(/^\/api\/saves\/(.+)$/);
  if (!m) return sendJSON(res, 404, { error: 'Không có API này' });
  const slot = decodeURIComponent(m[1]).trim();
  if (!validSlot(slot)) return sendJSON(res, 400, { error: 'Tên ô lưu không hợp lệ (1–50 ký tự)' });
  if (req.method === 'GET') {
    const s = await db.loadSave(slot);
    return s ? sendJSON(res, 200, s) : sendJSON(res, 404, { error: 'Không tìm thấy ô lưu' });
  }
  if (req.method === 'POST') {
    const id = await db.saveGame(slot, await readBody(req));
    return sendJSON(res, 200, { ok: true, saveId: id });
  }
  if (req.method === 'DELETE') return sendJSON(res, 200, { ok: await db.deleteSave(slot) });
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
    || /^(node_modules|db|logs|deploy)(\\|\/|$)/.test(rel)
    || /^(package(-lock)?\.json|serve\.js|web\.config.*|.*\.(md|ps1|zip))$/i.test(rel); // web.config chứa mật khẩu DB
  if (blocked) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`Nha Hang 3D: http://localhost:${port}`));

db.connect()
  .then((info) => { dbReady = true; console.log(`SQL Server OK: ${info.server} / ${info.database} (${info.auth})`); })
  .catch((e) => { dbError = e.message; console.error('Khong ket noi duoc SQL Server:', e.message, '\n-> Game van chay nhung khong luu duoc.'); });
