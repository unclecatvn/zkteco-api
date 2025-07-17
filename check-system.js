#!/usr/bin/env node

/**
 * Script kiểm tra hệ thống và debug các vấn đề
 * Chạy: node check-system.js
 */

import dotenv from "dotenv";
import { createClient } from "redis";
import net from "net";
import fs from "fs";
import path from "path";

// Load .env
dotenv.config();

const {
  REDIS_HOST = "127.0.0.1",
  REDIS_PORT = "6379",
  REDIS_USERNAME = "default",
  REDIS_PASSWORD = "",
  DEVICE_IP = "192.168.1.1",
  DEVICE_PORT = "4370",
  SERVER_PORT = "8090",
} = process.env;

console.log("🔍 Kiểm tra hệ thống...\n");

// 1. Kiểm tra file .env
console.log("1. Kiểm tra file .env:");
if (fs.existsSync(".env")) {
  console.log("✅ File .env tồn tại");
  const envContent = fs.readFileSync(".env", "utf8");
  console.log("📋 Nội dung .env:");
  console.log(envContent);
} else {
  console.log("❌ File .env không tồn tại");
  console.log("💡 Tạo file .env theo hướng dẫn trong SERVER_SETUP.md");
}
console.log();

// 2. Kiểm tra Redis
console.log("2. Kiểm tra kết nối Redis:");
try {
  const redisClient = createClient({
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    socket: {
      host: REDIS_HOST,
      port: parseInt(REDIS_PORT, 10),
    },
  });

  redisClient.on("error", (err) => {
    console.log("❌ Redis Error:", err.message);
  });

  await redisClient.connect();
  const ping = await redisClient.ping();
  console.log("✅ Redis kết nối thành công:", ping);
  await redisClient.disconnect();
} catch (error) {
  console.log("❌ Redis kết nối thất bại:", error.message);
  console.log("💡 Cài đặt Redis:");
  console.log("   Ubuntu/Debian: sudo apt install redis-server");
  console.log("   CentOS/RHEL: sudo yum install redis");
}
console.log();

// 3. Kiểm tra kết nối thiết bị ZKTeco
console.log("3. Kiểm tra kết nối thiết bị ZKTeco:");
const checkDevice = () => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 5000);

    socket.connect(parseInt(DEVICE_PORT, 10), DEVICE_IP, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
};

const deviceConnected = await checkDevice();
if (deviceConnected) {
  console.log(
    `✅ Thiết bị ZKTeco kết nối thành công (${DEVICE_IP}:${DEVICE_PORT})`
  );
} else {
  console.log(
    `❌ Không thể kết nối thiết bị ZKTeco (${DEVICE_IP}:${DEVICE_PORT})`
  );
  console.log("💡 Kiểm tra:");
  console.log("   - IP thiết bị có đúng không?");
  console.log("   - Thiết bị có bật và kết nối mạng không?");
  console.log("   - Server và thiết bị có cùng mạng không?");
}
console.log();

// 4. Kiểm tra cổng server
console.log("4. Kiểm tra cổng server:");
const checkPort = () => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(parseInt(SERVER_PORT, 10), (err) => {
      if (err) {
        resolve(false);
      } else {
        server.close(() => resolve(true));
      }
    });
    server.on("error", () => resolve(false));
  });
};

const portAvailable = await checkPort();
if (portAvailable) {
  console.log(`✅ Cổng ${SERVER_PORT} có sẵn`);
} else {
  console.log(`❌ Cổng ${SERVER_PORT} đã được sử dụng`);
  console.log(
    "💡 Thử đổi SERVER_PORT trong .env hoặc dừng service đang dùng cổng này"
  );
}
console.log();

// 5. Kiểm tra thư mục logs
console.log("5. Kiểm tra thư mục logs:");
if (fs.existsSync("logs")) {
  console.log("✅ Thư mục logs tồn tại");
  const logFiles = fs.readdirSync("logs");
  console.log("📁 Files trong logs:", logFiles);
} else {
  console.log("⚠️  Thư mục logs chưa tồn tại (sẽ được tạo tự động)");
}
console.log();

// 6. Kiểm tra dependencies
console.log("6. Kiểm tra dependencies:");
try {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const dependencies = Object.keys(packageJson.dependencies || {});
  console.log("✅ Dependencies:", dependencies.join(", "));

  // Kiểm tra node_modules
  if (fs.existsSync("node_modules")) {
    console.log("✅ node_modules tồn tại");
  } else {
    console.log("❌ node_modules không tồn tại");
    console.log("💡 Chạy: npm install");
  }
} catch (error) {
  console.log("❌ Lỗi đọc package.json:", error.message);
}
console.log();

// 7. Kiểm tra quyền truy cập
console.log("7. Kiểm tra quyền truy cập:");
try {
  fs.accessSync(".", fs.constants.R_OK | fs.constants.W_OK);
  console.log("✅ Có quyền đọc/ghi thư mục hiện tại");
} catch (error) {
  console.log("❌ Không có quyền truy cập:", error.message);
}

console.log("\n🎯 Tóm tắt:");
console.log("- Nếu tất cả đều ✅, hãy chạy: npm start");
console.log("- Nếu có lỗi ❌, hãy xem hướng dẫn trong SERVER_SETUP.md");
console.log("- Kiểm tra firewall và mở cổng 8090 cho truy cập từ bên ngoài");

process.exit(0);
