// Gom phần chạy trên trình duyệt (index.html + js/) vào thư mục dist/ để Vercel phục vụ.
// Chỉ những file này được đưa lên Vercel — mã máy chủ, db/, .env... không bị lộ ra ngoài.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'js'), path.join(out, 'js'), { recursive: true });
console.log('Đã tạo dist/:', fs.readdirSync(out).join(', '));
