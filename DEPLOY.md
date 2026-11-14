# Đưa game lên web: Vercel + Render + Neon (miễn phí)

```
Người chơi ──► Vercel (index.html + js/, game chạy trong trình duyệt)
                 │  /api/*  (Vercel chuyển tiếp)
                 ▼
               Render (serve.js — REST API lưu/tải game)
                 │
                 ▼
               Neon (PostgreSQL — các bảng saves, day_reports…)
```

Cả 3 dịch vụ đều **đăng nhập bằng tài khoản GitHub**, gói miễn phí, không cần thẻ. Tắt máy tính thì game vẫn chơi được.

| Dịch vụ | Chứa gì | Giới hạn gói miễn phí |
|---|---|---|
| Vercel | Phần game (`index.html`, `js/`) — tạo bằng `scripts/build-static.js` | Thoải mái cho đồ án |
| Render | Máy chủ API `serve.js` (cấu hình trong `render.yaml`) | **Ngủ sau 15 phút không ai chơi**, lần đầu vào lại chờ ~1 phút (menu hiện "Đang đánh thức máy chủ…") |
| Neon | CSDL PostgreSQL | 0,5 GB — dư cho hàng nghìn ô lưu |

---

## Bước 0 — Đưa code lên GitHub

Render và Vercel lấy code từ repo GitHub `Restaurant3D_Simulator`. Code mới nhất phải nằm ở nhánh **main** trên GitHub:

```powershell
git checkout main
git merge <nhánh đang làm>
git push origin main
```

> Các file bí mật (`.env`, `saves-export.json`) đã nằm trong `.gitignore`, không bị đẩy lên.

## Bước 1 — Tạo CSDL trên Neon

1. Vào **https://neon.tech** → **Sign up** → **Continue with GitHub**.
2. Tạo project:
   - Project name: `nhahang3d`
   - Postgres version: để mặc định
   - Region: **AWS Asia Pacific (Singapore)** (gần Việt Nam nhất, cùng khu với Render)
3. Trên trang Dashboard bấm **Connect** → copy **Connection string**, dạng:
   ```
   postgresql://neondb_owner:xxxxxxxx@ep-xxxx-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   ⚠️ Chuỗi này chứa mật khẩu — **không gửi cho ai, không dán lên GitHub**.

Không cần tạo bảng bằng tay: máy chủ tự chạy `db/schema.sql` khi khởi động.

## Bước 2 — (Tuỳ chọn) Chuyển ô lưu cũ từ SQL Server sang Neon

> Làm bước này **sau khi** đã deploy xong và tạo tài khoản trên game (ô lưu sẽ thuộc về tài khoản đó).

Ô lưu "Vua Đầu Bết" đã được xuất ra file `saves-export.json` trong thư mục dự án.

1. Trong thư mục `NhaHang3D`, tạo file **`.env`** (copy từ `.env.example`) với nội dung:
   ```
   DATABASE_URL=<chuỗi kết nối Neon ở bước 1>
   ```
2. Chạy:
   ```powershell
   npm install
   npm run import-saves -- saves-export.json <tên đăng nhập>
   ```
   Kết quả: `Đã nhập "Vua Đầu Bết": ngày 7, ... (bỏ 30 đồ trùng) ...`

Từ giờ `npm start` trên máy cũng dùng CSDL Neon này (đọc từ `.env`) — chơi trên máy hay trên web đều thấy cùng ô lưu.

## Bước 3 — Chạy API trên Render

1. Vào **https://render.com** → **Get Started** → **GitHub**.
2. Bấm **New +** → **Blueprint** → **Connect** repo `Restaurant3D_Simulator` (lần đầu phải cho Render quyền đọc repo).
3. Render đọc file `render.yaml` và hiện dịch vụ **nhahang3d-api** (gói Free). Ô **DATABASE_URL**: dán chuỗi kết nối Neon → **Apply**.
4. Chờ 2–4 phút tới khi trạng thái **Live**. Copy địa chỉ dịch vụ, dạng `https://nhahang3d-api.onrender.com` (có thể có thêm vài ký tự ngẫu nhiên).
5. Kiểm tra: mở `https://<địa-chỉ-render>/api/status` → thấy `{"db":true,"error":null}` là đã nối được Neon.

> Nếu thấy `"db":false`: vào **Environment** của dịch vụ kiểm tra lại DATABASE_URL, rồi **Manual Deploy → Deploy latest commit**.

## Bước 4 — Trỏ Vercel tới Render

Mở `vercel.json`, thay `THAY-BANG-TEN-RENDER` bằng địa chỉ Render ở bước 3:

```json
{ "source": "/api/:path*", "destination": "https://nhahang3d-api.onrender.com/api/:path*" }
```

Rồi commit + push:

```powershell
git add vercel.json
git commit -m "Tro Vercel toi API Render"
git push origin main
```

## Bước 5 — Đưa game lên Vercel

1. Vào **https://vercel.com** → **Sign Up** → **Continue with GitHub**.
2. **Add New…** → **Project** → chọn repo `Restaurant3D_Simulator` → **Import**.
3. Framework Preset: **Other** (giữ nguyên các ô khác — `vercel.json` đã cấu hình build và thư mục `dist`) → **Deploy**.
4. Xong sẽ có link dạng `https://restaurant3d-simulator.vercel.app` → **đây là link gửi cho mọi người**.

## Bước 6 — Kiểm tra

1. Mở `https://<link-vercel>/api/status` → `{"db":true,...}` (Vercel đã chuyển tiếp sang Render).
2. Mở link game → menu hiện 🟢 *Đã kết nối cơ sở dữ liệu* và danh sách ô lưu.
   - Lần đầu sau một thời gian không ai chơi, menu hiện *"Đang đánh thức máy chủ…"* khoảng 1 phút — bình thường với gói miễn phí của Render.
3. Chơi thử, bấm **K** lưu → tải lại trang → **Tiếp tục** thấy đúng tiến trình.

## Cập nhật game về sau

Chỉ cần `git push origin main` — Render và Vercel **tự build lại** trong vài phút.

---

## Lưu ý

- Game điều khiển bằng **chuột + bàn phím** — chơi trên máy tính (Chrome/Edge).
- Mỗi người chơi tự tạo tài khoản trên menu game và chỉ thấy ô lưu của mình.
- **Ô lưu tạo trước khi có đăng nhập** (ví dụ "Vua Đầu Bết") sẽ tạm thời không ai thấy. Sau khi deploy bản có đăng nhập: vào game tạo tài khoản, rồi trên máy chạy
  ```powershell
  npm run assign-save -- "Vua Đầu Bết" <tên đăng nhập của bạn>
  ```
  (file `.env` phải có DATABASE_URL của Neon). Tải lại trang là thấy ô lưu.
- Đổi mật khẩu Neon (Neon → Roles → Reset password) nếu lỡ để lộ chuỗi kết nối, rồi cập nhật lại DATABASE_URL trên Render và trong `.env`.
- Chạy trên máy cá nhân: `npm install` → tạo `.env` (bước 2) → `npm start` → http://localhost:5173.
