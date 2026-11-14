// Gán ô lưu cũ (tạo từ trước khi game có đăng nhập, chưa thuộc tài khoản nào) cho một tài khoản.
//   npm run assign-save -- "Vua Đầu Bết" ten_dang_nhap
// Tài khoản phải được đăng ký trên game trước.
const db = require('../db/db');

const [slot, username] = process.argv.slice(2);
if (!slot || !username) {
  console.log('Cách dùng: npm run assign-save -- "<tên ô lưu>" <tên đăng nhập>');
  process.exit(1);
}

(async () => {
  await db.connect();
  const n = await db.assignSave(slot, username);
  console.log(n ? `Đã gán ô lưu "${slot}" cho tài khoản "${username}".`
    : `Không tìm thấy ô lưu "${slot}" chưa có chủ (có thể đã được gán rồi).`);
  process.exit(0);
})().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
