# Chia sẻ game qua Cloudflare Tunnel

Game và SQL Server vẫn chạy **trên máy bạn**. Cloudflare Tunnel tạo một đường link `https://....trycloudflare.com` để người khác truy cập vào máy bạn qua Internet — không cần mở port modem, không cần IP tĩnh, **không cần tài khoản**, miễn phí.

```
Người chơi ──https──► Cloudflare ──đường hầm mã hoá──► cloudflared (máy bạn) ──► serve.js :5173 ──► SQL Server (máy bạn)
```

> Máy tắt / ngủ / mất mạng, hoặc bạn đóng cửa sổ tunnel → link ngừng hoạt động. Mỗi lần chạy lại, link **thay đổi**.

---

## Bước 1 — Cài cloudflared (chỉ làm 1 lần)

Mở PowerShell:

```powershell
winget install --id Cloudflare.cloudflared
```

Đóng PowerShell, mở lại, kiểm tra:

```powershell
cloudflared --version
```

> Nếu không dùng được winget: tải `cloudflared-windows-amd64.msi` từ trang chính thức
> https://github.com/cloudflare/cloudflared/releases/latest rồi cài như phần mềm bình thường.

## Bước 2 — Chạy game + mở link công khai

Trong thư mục dự án (`Desktop\My Project\NhaHang3D`):

```powershell
powershell -ExecutionPolicy Bypass -File start-public.ps1
```

Script sẽ: bật server game (kết nối SQL Server trên máy) → mở tunnel. Trong log hiện ra sẽ có khung như:

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://ten-ngau-nhien-abc-xyz.trycloudflare.com                                          |
+--------------------------------------------------------------------------------------------+
```

→ Gửi link đó cho mọi người. Đợi khoảng 10–30 giây sau khi link xuất hiện thì mới vào được.

**Dừng chia sẻ:** bấm `Ctrl + C` trong cửa sổ đó (tắt cả tunnel và server game).

### Cách làm tay (nếu không muốn dùng script)
Mở 2 cửa sổ PowerShell trong thư mục dự án:
```powershell
npm start                                        # cửa sổ 1: server game
cloudflared tunnel --url http://localhost:5173   # cửa sổ 2: tunnel
```

## Bước 3 — Kiểm tra

1. Mở `https://<link-của-bạn>/api/status` → thấy `{"db":true,...}` là game đã nối SQL Server.
2. Thử mở link bằng **điện thoại dùng 4G** (không dùng wifi nhà) để chắc chắn người ngoài vào được.

---

## Lưu ý khi demo

- **Không để máy ngủ:** Settings → System → Power → *Screen and sleep* → "When plugged in, put my device to sleep after" = **Never** trong lúc demo.
- **SQL Server phải đang chạy** (nó tự chạy cùng Windows; nếu `/api/status` báo lỗi DB thì mở *Services* → khởi động `SQL Server (MSSQLSERVER)`).
- Link miễn phí kiểu này dành cho thử nghiệm/demo: không cam kết thời gian hoạt động, giới hạn số kết nối đồng thời — thoải mái cho vài chục người chơi cùng lúc.
- Điều khiển game cần **chuột + bàn phím** (khoá chuột kiểu FPS) — chơi trên máy tính, không chơi được trên điện thoại.
- ⚠️ Chưa có đăng nhập người chơi: ai có link cũng thấy và xoá được ô lưu của người khác. Chỉ gửi link cho người bạn tin tưởng.

## Muốn link cố định (không đổi mỗi lần chạy)?

Cần: tài khoản Cloudflare (miễn phí) **và một tên miền riêng** (mua khoảng 30.000–300.000đ/năm, trỏ DNS về Cloudflare). Khi đó tạo *Named Tunnel* trong Cloudflare Zero Trust → link dạng `https://nhahang3d.ten-mien-cua-ban.com`, vẫn chạy từ máy bạn. Báo mình nếu bạn muốn làm bước này.

---

*Ghi chú: `web.config.example` và `deploy.ps1` trong thư mục là phần chuẩn bị cho việc đưa lên hosting Windows (IIS) sau này nếu bạn tìm được host phù hợp — không cần cho cách Cloudflare Tunnel.*
