# ZKTeco Device API Server

Streams attendance logs from a ZKTeco biometric device into Redis Pub/Sub and broadcasts them over Socket.IO.

## Features

- **Biometric Device Integration**: Connects to ZKTeco devices via TCP
- **Real-time Data Streaming**: Redis Pub/Sub and Socket.IO support
- **Automatic Reconnection**: Handles device disconnections gracefully
- **Website Access Logging**: Tracks all website visits and provides analytics
- **iClock Protocol Support**: Supports ZKTeco Cloud Server push protocol

## Website Access Logging

Hệ thống tự động ghi log tất cả các truy cập vào website của bạn với các thông tin:

- **Timestamp**: Thời gian truy cập
- **IP Address**: Địa chỉ IP người truy cập
- **User Agent**: Trình duyệt và hệ điều hành
- **Method**: HTTP method (GET, POST, etc.)
- **URL**: Đường dẫn được truy cập
- **Status Code**: Mã trạng thái HTTP
- **Response Time**: Thời gian phản hồi
- **Referer**: Trang trước đó (nếu có)

### Endpoints để xem log truy cập:

#### 1. Xem log truy cập chi tiết

```
GET /api/v1/access-logs
```

Trả về 100 log truy cập gần nhất với format:

```json
{
  "logs": [
    {
      "timestamp": "2024-01-01T10:30:00.000Z",
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "method": "GET",
      "url": "/api/v1/bio-sync",
      "statusCode": 200,
      "responseTime": "25ms",
      "referer": "direct",
      "contentLength": 1024
    }
  ],
  "total": 100
}
```

#### 2. Xem thống kê truy cập

```
GET /api/v1/access-stats
```

Trả về thống kê tổng quan:

```json
{
  "totalRequests": 1250,
  "uniqueIPs": 45,
  "todayRequests": 120,
  "today": "2024-01-01",
  "topPages": [
    { "url": "/api/v1/bio-sync", "count": 500 },
    { "url": "/iclock/register", "count": 200 }
  ],
  "topIPs": [
    { "ip": "192.168.1.100", "count": 150 },
    { "ip": "192.168.1.101", "count": 100 }
  ]
}
```

### Log Files

Tất cả log truy cập được lưu vào file `logs/access.log` với format JSON, mỗi dòng là một log entry.

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `.env` file with your configuration
4. Run: `npm start`

## Environment Variables

```env
# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=
REDIS_CHANNEL=attendance:updates

# ZKTeco Device Configuration
DEVICE_IP=192.168.1.1
DEVICE_PORT=4370
SEND_TIMEOUT=20000
RECV_TIMEOUT=20000

# Server Configuration
SERVER_PORT=8090
CLIENT_ORIGIN=http://localhost:3000
```

## API Endpoints

- `GET /api/v1/bio-sync` - Get latest biometric data
- `GET /api/v1/access-logs` - Get website access logs
- `GET /api/v1/access-stats` - Get access statistics
- `GET /iclock/register` - Device registration (iClock protocol)
- `POST /iclock/cdata` - Attendance data push (iClock protocol)
- `GET /iclock/getrequest` - Get pending commands (iClock protocol)

## Socket.IO

WebSocket endpoint for real-time attendance updates:

- Event: `attendance`
- Data: MessagePack encoded attendance data
