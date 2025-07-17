# Hướng dẫn cài đặt máy chủ

## 1. Tạo file .env

Tạo file `.env` trong thư mục gốc với nội dung:

```env
# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=
REDIS_CHANNEL=attendance:updates

# ZKTeco Device Configuration
# Thay IP này bằng IP thực tế của thiết bị ZKTeco trong mạng nội bộ
DEVICE_IP=192.168.1.100
DEVICE_PORT=4370
SEND_TIMEOUT=20000
RECV_TIMEOUT=20000

# Server Configuration
SERVER_PORT=8090
CLIENT_ORIGIN=*
```

## 2. Cài đặt Redis

### Ubuntu/Debian:

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### CentOS/RHEL:

```bash
sudo yum install redis
sudo systemctl start redis
sudo systemctl enable redis
```

## 3. Cấu hình Firewall

Mở cổng 8090 cho server:

### Ubuntu/Debian (ufw):

```bash
sudo ufw allow 8090/tcp
sudo ufw reload
```

### CentOS/RHEL (firewalld):

```bash
sudo firewall-cmd --permanent --add-port=8090/tcp
sudo firewall-cmd --reload
```

## 4. Kiểm tra kết nối

### Kiểm tra Redis:

```bash
redis-cli ping
# Kết quả: PONG
```

### Kiểm tra cổng:

```bash
netstat -tuln | grep :8090
```

### Kiểm tra thiết bị ZKTeco:

```bash
ping 192.168.1.100  # Thay IP này bằng IP thiết bị thực tế
```

## 5. Chạy ứng dụng

```bash
# Cài đặt dependencies
npm install

# Chạy ứng dụng
npm start

# Hoặc chạy với PM2 (production)
npm install -g pm2
pm2 start index.js --name "zkteco-api"
pm2 startup
pm2 save
```

## 6. Kiểm tra API

```bash
# Kiểm tra từ localhost
curl http://localhost:8090/api/v1/bio-sync

# Kiểm tra từ bên ngoài
curl http://103.90.226.61:8090/api/v1/bio-sync
```

## 7. Debug logs

```bash
# Xem logs realtime
tail -f logs/access.log

# Xem logs PM2
pm2 logs zkteco-api
```

## Lỗi thường gặp

### 1. Redis connection refused

- Cài đặt và khởi động Redis service
- Kiểm tra Redis đang chạy: `sudo systemctl status redis-server`

### 2. Cannot connect to biometric device

- Kiểm tra IP thiết bị ZKTeco trong .env
- Đảm bảo thiết bị và server cùng mạng hoặc có thể kết nối với nhau
- Kiểm tra cổng 4370 không bị block

### 3. Cannot access API from outside

- Kiểm tra firewall đã mở cổng 8090
- Kiểm tra server có bind đúng IP (0.0.0.0)
- Kiểm tra ISP có block cổng không

### 4. CORS errors

- Cấu hình CLIENT_ORIGIN=\* trong .env
- Hoặc set domain cụ thể: CLIENT_ORIGIN=https://yourdomain.com
