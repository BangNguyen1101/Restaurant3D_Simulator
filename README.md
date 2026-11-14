# 🍔 Nhà Hàng 3D (Three.js, góc nhìn thứ nhất)

## Chạy game
```
npm install      # lần đầu: cài thư viện pg
copy .env.example .env   # rồi điền DATABASE_URL (PostgreSQL, ví dụ Neon)
npm start        # = node serve.js, đọc biến trong .env
```
Mở http://localhost:5173 → chọn **Chơi mới** hoặc **Tiếp tục** một ô lưu.

**Đưa lên web (Vercel + Render + Neon):** xem [DEPLOY.md](DEPLOY.md).

## Lưu tiến trình vào PostgreSQL
- Chuỗi kết nối đặt trong biến môi trường `DATABASE_URL` (file `.env` trên máy, ô Environment trên Render).
- Khi server khởi động sẽ tự chạy `db/schema.sql` → tạo các bảng nếu chưa có. Mất kết nối thì server tự thử lại mỗi 15 giây.
- **Tự lưu** khi kết thúc mỗi ngày (kèm báo cáo ngày), **phím K** để lưu bất cứ lúc nào. Tải lại sẽ bắt đầu từ sáng của ngày đã lưu.
- **Đăng nhập:** mỗi người chơi tạo tài khoản ngay trên menu game; ô lưu thuộc về tài khoản nên mỗi người chỉ thấy, lưu, xoá được ô lưu của mình. Mật khẩu băm bằng scrypt, phiên đăng nhập là cookie HttpOnly (30 ngày), CSDL chỉ lưu mã băm SHA-256 của token. Đăng nhập sai quá 8 lần / 15 phút bị chặn tạm thời.
- Nhập ô lưu từ bản SQL Server cũ vào một tài khoản: `npm run import-saves -- saves-export.json <tên đăng nhập>`.
- Gán ô lưu cũ (tạo trước khi có đăng nhập, chưa thuộc ai) cho tài khoản: `npm run assign-save -- "<tên ô lưu>" <tên đăng nhập>`.

| Bảng | Nội dung |
|---|---|
| `users` | Tài khoản: tên đăng nhập (không phân biệt hoa thường), mã băm mật khẩu |
| `sessions` | Phiên đăng nhập: mã băm token, người dùng, hạn dùng |
| `saves` | Ô lưu của một người chơi: tên (duy nhất trong tài khoản), ngày, tiền, tổng khách phục vụ / bỏ về |
| `save_inventory` | Tồn kho từng nguyên liệu |
| `save_furniture` | Bàn ghế + thiết bị bếp đã đặt (loại, X, Z, hướng xoay); `wall_removed` = ô tường đã phá |
| `save_staff` | Nhân viên đã thuê |
| `save_expansions` | Khu đã mở rộng |
| `day_reports` | Báo cáo kinh doanh cuối mỗi ngày |
| `vw_save_overview` (view) | Tổng quan từng ô lưu: số bàn, nhân viên, tổng lãi |

API (trong `serve.js`): `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; `GET /api/saves`, `GET/POST/DELETE /api/saves/:tên` (bắt buộc đăng nhập); `GET /api/status`. Yêu cầu ghi phải có header `X-Requested-With: NhaHang3D` (chống CSRF). Code truy vấn ở `db/db.js` (dùng tham số hoá, lưu trong 1 transaction).

**Điều khiển:** WASD đi · Shift chạy · Chuột nhìn · E / Click tương tác · F cắt trên thớt · **C** sổ công thức · **N** nhập hàng · **B** xây/thuê người · 1–8 chọn (7 di chuyển đồ, 8 phá tường) · R xoay bàn · **M** tắt/bật âm thanh · **Enter** sang ngày mới · Esc tạm dừng.

**Vòng chơi:** mở cửa 08:00–18:00 (1 giờ game = 30 giây). 17:30 ngừng đón khách, 18:00 đóng cửa, phục vụ nốt rồi xem tổng kết ngày (doanh thu, tip, chi tiêu, lương). Bắt đầu với 2 bàn 2 người → mua thêm bàn → hết chỗ thì mở rộng (Phòng ăn giữa $300 → Phòng VIP $700).

## Cấu trúc code — mỗi hệ thống một file
| File | Nội dung |
|---|---|
| `js/state.js` | Trạng thái chung + event bus (`game.on / game.emit`) |
| `js/world.js` | Lưới ô 24×18, tường, **A\* pathfinding** (thay NavMesh), `Agent` tự đi đường, mở rộng quán |
| `js/items.js` | Nguyên liệu & trạng thái (sống → chín → cháy, sống → đã cắt), công thức, mesh 3D |
| `js/cooking.js` | **Hệ thống 1** – Station (thùng, thớt, bếp, quầy, đĩa, bồn rửa, thùng rác), `interact()` / `chop()` dùng chung cho người chơi và bot |
| `js/customers.js` | **Hệ thống 2** – State machine khách: FIND_SEAT → WALK_TO_SEAT → ORDER → WAITING (thanh kiên nhẫn) → EATING → PAY → LEAVE |
| `js/building.js` | **Hệ thống 3** – Bàn ghế, cửa hàng, đặt đồ theo lưới (ghost xanh/đỏ, kiểm tra không chặn lối đi) |
| `js/staff.js` | **Hệ thống 4** – Task Queue + Đầu bếp/Bồi bàn AI, mỗi công việc là 1 generator function |
| `js/people.js` | Nhân vật đa dạng: thượng lưu / thường / sinh viên, nam / nữ, vest, váy dạ hội, hoodie, mũ, kính, túi xách… |
| `js/inventory.js` | Tồn kho nguyên liệu, gói nhập hàng, cảnh báo sắp hết |
| `js/daynight.js` | Đồng hồ, bầu trời & ánh sáng theo giờ, mở/đóng cửa, lương & tổng kết ngày |
| `js/recipebook.js` | Sổ công thức từng bước (tự sinh từ dữ liệu công thức) |
| `js/street.js` | Con phố bên ngoài: vỉa hè, đường, vạch qua đường, dãy nhà + cửa hàng, đèn đường, cây, xe cộ, người đi bộ (sáng đèn về đêm) |
| `js/decor.js` | Đèn chùm, cây cảnh, tranh, đèn tường, mặt tiền + biển OPEN/CLOSED |
| `js/main.js` | Renderer, người chơi FPS, input, HUD, vòng lặp |

## Ghi chú kỹ thuật
- **Task Queue:** khách gọi món → task `cook` (đầu bếp). Đĩa hoàn chỉnh đặt lên quầy → task `deliver` (bồi bàn). Khách ăn xong → task `clean`. Task nào người chơi đã tự làm sẽ tự hết hiệu lực (`valid()`), task chưa làm được thì chờ (`ready()`).
- **Giữ chỗ (reservation):** bot giữ thớt/bếp/quầy (`reservedBy`) để 2 bot không tranh cùng 1 chỗ.
- **Debug:** mở console, gõ `game.money = 9999` hoặc `game.simulate(60)` để tua nhanh 60 giây.

## Ý tưởng làm tiếp
- Lưu/tải game (localStorage), ngày/đêm + báo cáo doanh thu cuối ngày
- Bán/di chuyển đồ đã đặt, nâng cấp bếp nấu nhanh hơn
- Thay hình khối bằng model .glb (Kenney, Quaternius – miễn phí), thêm âm thanh
- Nhân viên có lương, có thể mệt; khách VIP kiên nhẫn ít nhưng tip nhiều
