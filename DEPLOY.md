# Hướng Dẫn Deploy Lên Railway.app

Tài liệu này hướng dẫn cách deploy ứng dụng **Football Predictor** lên [Railway.app](https://railway.app) một cách nhanh chóng và tự động.

## Các bước thực hiện (Ước tính: 10 phút)

### Bước 1: Tạo Tài Khoản Railway
1. Truy cập [Railway.app](https://railway.app/) và chọn **Sign Up**.
2. Bạn nên đăng nhập bằng tài khoản **GitHub** để dễ dàng đồng bộ mã nguồn và tự động deploy khi push code mới.

### Bước 2: Tạo Project Mới Từ Repo GitHub
1. Sau khi đăng nhập, tại dashboard của Railway, nhấn nút **New Project**.
2. Chọn **Deploy from GitHub repo**.
3. Chọn repo chứa dự án **football-predictor** của bạn. 
   *(Nếu không thấy repo, bạn hãy cấp quyền truy cập repo cho Railway thông qua GitHub app).*
4. Chọn nhánh cần deploy (thường là `main` hoặc `master`).

### Bước 3: Cấu Hình Biến Môi Trường (Environment Variables)
Railway cần các biến môi trường để chạy backend đúng cách. Hãy truy cập tab **Variables** trong service của bạn trên Railway và thêm các biến sau:

| Biến Môi Trường | Giá Trị | Ghi Chú |
|---|---|---|
| `PORT` | `3001` | Cổng dịch vụ Railway sử dụng |
| `GEMINI_API_KEY` | *(Khóa API của bạn)* | Dành cho việc phân tích AI (nếu kích hoạt lại) |
| `FOOTBALL_DATA_API_KEY` | *(Khóa API football-data.org)* | Dành cho việc cập nhật trận đấu, kết quả thực |
| `ODDS_API_KEY` | *(Khóa API the-odds-api.com)* | Dành cho việc đồng bộ tỷ lệ nhà cái (Odds API) |

> [!TIP]
> Do dự án hiện đã có `Dockerfile` ở thư mục gốc, Railway sẽ tự động phát hiện và build thông qua Docker.
> - **Root Directory**: Để trống hoặc điền `/` (thư mục gốc chứa `Dockerfile`).
> - **Volume**: Để cơ sở dữ liệu SQLite (`football.db`) không bị mất mỗi lần deploy lại, bạn hãy vào tab **Settings** -> **Volumes** trên Railway, tạo một volume mới và mount vào đường dẫn `/app/backend/db`.

### Bước 4: Tạo URL Công Khai (Public Domain)
1. Trong cấu hình Service trên Railway, chuyển sang tab **Settings**.
2. Tại phần **Networking**, chọn **Generate Domain** (hoặc thêm domain riêng của bạn).
3. Sau khoảng vài giây, Railway sẽ cung cấp một URL có định dạng dạng `*.up.railway.app`.

### Bước 5: Hoàn Tất
- Quá trình build và deploy sẽ chạy hoàn toàn tự động trong khoảng 2-3 phút.
- Bạn có thể theo dõi trực tiếp log deploy qua tab **Deployments** để kiểm tra tính trạng khởi động của server.
