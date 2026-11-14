// Tiện ích xác thực phía máy chủ: băm mật khẩu (scrypt), token phiên, cookie, giới hạn đăng nhập sai.
const crypto = require('crypto');

const SESSION_DAYS = 30;
const COOKIE = 'nh3d_session';

// ===== Mật khẩu: scrypt + salt ngẫu nhiên, lưu dạng "scrypt$<salt>$<hash>" =====
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [alg, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected); // so sánh thời gian hằng, tránh dò mật khẩu
}

// Mật khẩu giả để so sánh khi tên đăng nhập không tồn tại (thời gian phản hồi như nhau)
const DUMMY_HASH = hashPassword('khong-co-tai-khoan-nay');

// ===== Token phiên: gửi cho trình duyệt token gốc, CSDL chỉ lưu SHA-256 của token =====
const newToken = () => crypto.randomBytes(32).toString('base64url');
const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

// ===== Kiểm tra dữ liệu nhập =====
const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,30}$/u;
function checkCredentials(username, password) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username.trim()))
    return 'Tên đăng nhập 3–30 ký tự, chỉ gồm chữ, số và . _ -';
  if (typeof password !== 'string' || password.length < 6 || password.length > 100)
    return 'Mật khẩu từ 6 đến 100 ký tự';
  return null;
}

// ===== Cookie =====
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted;
}

function sessionCookie(req, token) {
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (isHttps(req)) attrs.push('Secure');
  return attrs.join('; ');
}

function clearCookie(req) {
  const attrs = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) attrs.push('Secure');
  return attrs.join('; ');
}

// ===== Giới hạn đăng nhập sai: tối đa 8 lần / 15 phút cho mỗi IP + tên đăng nhập =====
const fails = new Map();
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 8;
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
function rateKey(req, username) { return clientIp(req) + '|' + String(username || '').toLowerCase(); }
function isLocked(key) {
  const f = fails.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW) { fails.delete(key); return false; }
  return f.count >= MAX_FAILS;
}
function addFail(key) {
  const f = fails.get(key);
  if (!f || Date.now() - f.first > WINDOW) fails.set(key, { first: Date.now(), count: 1 });
  else f.count++;
}
const clearFails = (key) => fails.delete(key);

module.exports = {
  COOKIE, SESSION_DAYS, hashPassword, verifyPassword, DUMMY_HASH, newToken, tokenHash,
  checkCredentials, parseCookies, sessionCookie, clearCookie, rateKey, isLocked, addFail, clearFails,
};
