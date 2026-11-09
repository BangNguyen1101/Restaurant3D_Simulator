# Hướng dẫn deploy game lên Azure (chạy 24/7, có SQL)

Kết quả cuối: link dạng `https://nhahang3d-<tên-bạn>.azurewebsites.net`, mọi người chơi được kể cả khi máy bạn tắt, tiến trình lưu vào **Azure SQL Database**.

```
Người chơi ──► Azure App Service (chạy serve.js) ──► Azure SQL Database
                     ▲
              GitHub (code của bạn) – mỗi lần push là tự deploy lại
```

Chi phí: dùng **Azure for Students** ($100 tín dụng, không cần thẻ) + gói **miễn phí** của Azure SQL và App Service → 0đ nếu làm đúng các lựa chọn bên dưới.

---

## Bước 0 — Chuẩn bị

| Cần có | Ghi chú |
|---|---|
| Tài khoản GitHub | https://github.com/signup |
| Git trên máy | https://git-scm.com/download/win (kiểm tra: `git --version`) |
| Email trường `@epu.edu.vn` | để kích hoạt Azure for Students |
| SSMS hoặc sqlcmd | để kiểm tra database trên cloud (máy bạn đã có sqlcmd) |

---

## Bước 1 — Kích hoạt Azure for Students

1. Vào https://azure.microsoft.com/free/students → **Start free**.
2. Đăng nhập bằng tài khoản Microsoft (nên dùng chính email trường).
3. Xác minh email trường → nhận **$100** tín dụng.
4. Xong sẽ vào được trang quản trị: https://portal.azure.com

> Tài khoản sinh viên có thể bị giới hạn vùng (region). Nếu tạo tài nguyên báo lỗi region, thử **Southeast Asia**, **East Asia** hoặc **Korea Central**.

---

## Bước 2 — Đưa code lên GitHub

Trong thư mục dự án (`Desktop\My Project\NhaHang3D`), mở terminal:

```bash
git init
git add .
git commit -m "Nha Hang 3D - ban dau"
```

Trên GitHub: bấm **New repository** → tên `nhahang3d` → **Private** hoặc Public → **Create** (không tick thêm README). Sau đó chạy 3 lệnh GitHub hiện ra, dạng:

```bash
git remote add origin https://github.com/<tên-github>/nhahang3d.git
git branch -M main
git push -u origin main
```

> File `.gitignore` đã loại `node_modules`, `.env`, `.claude` — mật khẩu sẽ không bị đẩy lên GitHub.

---

## Bước 3 — Tạo Azure SQL Database

1. Trên portal, ô tìm kiếm gõ **SQL databases** → **+ Create**.
2. Nếu có banner **"Want to try Azure SQL Database for free?"** → bấm **Apply offer** (gói miễn phí). ✅ Rất quan trọng để không bị trừ tiền.
3. Tab **Basics**:
   - **Subscription**: Azure for Students
   - **Resource group**: **Create new** → `nhahang3d-rg`
   - **Database name**: `NhaHang3D`
   - **Server**: **Create new**
     - **Server name**: `nhahang3d-<tên-bạn>` (phải duy nhất toàn cầu) → địa chỉ sẽ là `nhahang3d-<tên-bạn>.database.windows.net`
     - **Location**: Southeast Asia
     - **Authentication method**: **Use SQL authentication**
     - **Server admin login**: `nhahang_admin`
     - **Password**: đặt mật khẩu mạnh, **ghi lại** (cần ở bước 5)
   - **Free database offer**: chọn **Auto-pause the database until next month** khi hết hạn mức miễn phí (để không phát sinh tiền).
4. Tab **Networking**:
   - **Connectivity method**: **Public endpoint**
   - **Allow Azure services and resources to access this server**: **Yes** (để App Service kết nối được)
   - **Add current client IP address**: **Yes** (để máy bạn kết nối kiểm tra được)
5. **Review + create** → **Create**. Chờ 2–5 phút.

**Kiểm tra từ máy bạn** (thay tên server / mật khẩu):

```bash
sqlcmd -S nhahang3d-<tên-bạn>.database.windows.net -d NhaHang3D -U nhahang_admin -P "<mật-khẩu>" -Q "SELECT @@VERSION"
```

Không cần tự tạo bảng — server game sẽ tự chạy `db/schema.sql` lần đầu kết nối.

---

## Bước 4 — Tạo App Service (nơi chạy server game)

1. Portal → tìm **App Services** → **+ Create** → **Web App**.
2. Tab **Basics**:
   - **Resource group**: `nhahang3d-rg` (cùng nhóm với database)
   - **Name**: `nhahang3d-<tên-bạn>` → link game: `https://nhahang3d-<tên-bạn>.azurewebsites.net`
   - **Publish**: **Code**
   - **Runtime stack**: **Node 22 LTS**
   - **Operating System**: **Linux**
   - **Region**: Southeast Asia (cùng vùng với database cho nhanh)
   - **Pricing plan**: **Create new** → chọn **Free F1** (bấm *Explore pricing plans* nếu không thấy)
3. Tab **Deployment**:
   - **Continuous deployment**: **Enable**
   - **GitHub account**: đăng nhập / cấp quyền
   - **Organization / Repository / Branch**: `<tên-github>` / `nhahang3d` / `main`
4. **Review + create** → **Create**.

Azure sẽ tự thêm một file GitHub Actions vào repo và build + deploy. Theo dõi ở GitHub → tab **Actions** (lần đầu ~3–5 phút, phải hiện ✅ xanh).

> Nếu bạn lỡ tạo App Service mà chưa bật GitHub: vào App Service → **Deployment Center** → Source: **GitHub** → chọn repo → **Save**.

---

## Bước 5 — Khai báo kết nối database cho server

App Service → **Settings** → **Environment variables** → tab **App settings** → **+ Add** từng dòng:

| Name | Value |
|---|---|
| `DB_SERVER` | `nhahang3d-<tên-bạn>.database.windows.net` |
| `DB_NAME` | `NhaHang3D` |
| `DB_USER` | `nhahang_admin` |
| `DB_PASSWORD` | mật khẩu ở bước 3 |

→ **Apply** → **Confirm**. App sẽ tự khởi động lại.

Server tự nhận ra có `DB_USER` → chuyển sang chế độ đăng nhập SQL (trên máy nhà không có biến này nên vẫn dùng tài khoản Windows như cũ).

> Không cần đặt `PORT` — Azure tự cung cấp, `serve.js` đã đọc `process.env.PORT`.

---

## Bước 6 — Kiểm tra

1. Mở `https://nhahang3d-<tên-bạn>.azurewebsites.net/api/status` → phải thấy `{"db":true,"error":null}`.
2. Mở trang chủ → menu phải hiện 🟢 **Đã kết nối SQL Server** → chơi mới, bấm **K** lưu.
3. Kiểm tra dữ liệu trên cloud:
   ```bash
   sqlcmd -S nhahang3d-<tên-bạn>.database.windows.net -d NhaHang3D -U nhahang_admin -P "<mật-khẩu>" -Q "SELECT * FROM vw_SaveOverview"
   ```
   Hoặc mở SSMS → Server name như trên → Authentication: **SQL Server Authentication**.

---

## Cập nhật game sau này

Sửa code trên máy → chạy:
```bash
git add .
git commit -m "Mo ta thay doi"
git push
```
GitHub Actions tự deploy lại sau vài phút.

---

## Gặp lỗi?

| Hiện tượng | Cách xử lý |
|---|---|
| `/api/status` báo `Login failed` | Sai `DB_USER` / `DB_PASSWORD` ở bước 5 |
| Báo `Cannot open server ... client with IP` | SQL server → **Networking** → bật *Allow Azure services…* (cho App Service) hoặc thêm IP máy bạn (cho sqlcmd/SSMS) |
| Trang báo **Application Error** | App Service → **Log stream** để xem log; hoặc **Diagnose and solve problems** |
| GitHub Actions báo đỏ | Mở tab Actions → bấm vào lần chạy lỗi → đọc bước bị đỏ |
| Lần đầu vào chậm ~20–30 giây | Bình thường với gói Free F1 (server "ngủ" khi không ai dùng) và database miễn phí tự tạm dừng; tải lại trang là được |
| Database hết hạn mức miễn phí trong tháng | Database tự tạm dừng tới đầu tháng sau (nếu bạn chọn auto-pause ở bước 3) |

---

## ⚠️ Trước khi chia sẻ link rộng rãi

Hiện game **chưa có đăng nhập người chơi**: ai vào cũng thấy và xoá được ô lưu của người khác. Gửi cho bạn bè/thầy cô demo thì ổn, nhưng nên làm thêm hệ thống tài khoản (bảng `Users`, mật khẩu băm, mỗi người chỉ thấy ô lưu của mình) trước khi công khai rộng.
