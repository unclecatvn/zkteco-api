# DTR ZKTeco API

## Cấu trúc thư mục (chuẩn hóa)

- `index.js`: Khởi tạo app, cấu hình middleware, khởi động server.
- `routes/`: Định nghĩa các route Express (REST, cloud push, ...)
- `controllers/`: Xử lý logic cho từng route.
- `services/`: Xử lý nghiệp vụ, truy vấn, giao tiếp thiết bị, Redis, ...
- `logs/`: Chứa file log truy cập.

## Cloud Push Endpoint

- `GET /iclock/getrequest`: Máy chấm công hỏi lệnh, trả về chuỗi rỗng hoặc lệnh.
- `POST /iclock/cdata`: Máy chấm công gửi dữ liệu chấm công (ATTLOG), server parse và lưu/log/đẩy Redis.

## Hướng dẫn mở rộng

- Thêm lệnh cho máy: Sửa controller `cloudController.js`.
- Xử lý dữ liệu chấm công: Sửa service `cloudService.js`.

## Khởi động

```bash
npm install
npm start
```
