/**
 *
 * Streams attendance logs from a ZKTeco biometric device into Redis Pub/Sub and
 * broadcasts them over Socket.IO. Designed to run continuously—even if the device
 * temporarily goes offline—and avoid listener‐count warnings.
 *
 * USAGE:
 *   1. Copy this file into your project root (e.g., C:\inetpub\wwwroot\dtr.zkteco.api\index.js).
 *   2. Ensure you have a `.env` file in the same folder with the necessary environment variables.
 *   3. Run `npm start` (after installing dependencies).
 *
 * Key Features:
 *   • Global increase of EventEmitter max listeners to prevent “MaxListenersExceededWarning.”
 *   • Automatic reconnect logic if the biometric device is offline.
 *   • Wrapped all device calls in try/catch so the process never crashes on timeouts.
 *   • Detailed logging: “Biometric device is active” or “inactive,” with reasons.
 *   • Redis fallback to in-process EventEmitter if Redis is unavailable.
 *   • REST endpoint (/api/v1/bio-sync) to fetch the last‐published payload.
 *   • Socket.IO endpoint to push real‐time attendance updates to web clients.
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
// Import các router
import cloudRouter from "./routes/cloudRoutes.js";
// Import middleware
import { accessLogMiddleware } from "./helpers/accessLogHelper.js";
import { createRedisClient } from "./helpers/redisHelper.js";
import { setPubSub } from "./services/cloudService.js";

// Load env
dotenv.config({
  path: path.join(dirname(fileURLToPath(import.meta.url)), ".env"),
});

const {
  REDIS_HOST = "127.0.0.1",
  REDIS_PORT = "6379",
  REDIS_USERNAME = "default",
  REDIS_PASSWORD = "",
  REDIS_CHANNEL = "attendance:updates",
  SERVER_PORT = "8090",
  CLIENT_ORIGIN = "http://localhost:3000",
} = process.env;

// Khởi tạo Redis Pub/Sub (nếu cần dùng chung cho nhiều service, truyền vào từng service tương ứng)
(async () => {
  const pub_client = await createRedisClient({
    host: REDIS_HOST,
    port: REDIS_PORT,
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
  });
  setPubSub(pub_client, REDIS_CHANNEL);
})();

// Khởi tạo app
const app = express();
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "ngrok-skip-browser-warning",
    ],
  })
);
app.use(accessLogMiddleware);

// Mount các router (có thể mở rộng nhiều router khác ngoài cloudRouter)
app.use("/iclock", cloudRouter);
// Ví dụ: app.use("/api/v1", apiRouter); // nếu có thêm router khác

// Các endpoint log truy cập (có thể tách thành router riêng nếu muốn)
app.get("/api/v1/access-logs", (req, res) => {
  const logFile = path.join("logs", "access.log");
  if (!fs.existsSync(logFile))
    return res.json({ logs: [], message: "Chưa có log truy cập nào" });
  const logData = fs.readFileSync(logFile, "utf8");
  const logs = logData
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((log) => log !== null)
    .slice(-100);
  res.json({ logs, total: logs.length });
});
app.get("/api/v1/access-stats", (req, res) => {
  const logFile = path.join("logs", "access.log");
  if (!fs.existsSync(logFile))
    return res.json({
      totalRequests: 0,
      uniqueIPs: 0,
      topPages: [],
      topIPs: [],
      message: "Chưa có log truy cập nào",
    });
  const logData = fs.readFileSync(logFile, "utf8");
  const logs = logData
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((log) => log !== null);
  const stats = {
    totalRequests: logs.length,
    uniqueIPs: new Set(logs.map((log) => log.ip)).size,
    today: new Date().toISOString().split("T")[0],
  };
  const todayLogs = logs.filter((log) => log.timestamp.startsWith(stats.today));
  stats.todayRequests = todayLogs.length;
  const pageCount = {};
  logs.forEach((log) => {
    pageCount[log.url] = (pageCount[log.url] || 0) + 1;
  });
  stats.topPages = Object.entries(pageCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([url, count]) => ({ url, count }));
  const ipCount = {};
  logs.forEach((log) => {
    ipCount[log.ip] = (ipCount[log.ip] || 0) + 1;
  });
  stats.topIPs = Object.entries(ipCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));
  res.json(stats);
});

// Khởi tạo server
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "ngrok-skip-browser-warning",
    ],
  },
  transports: ["websocket"],
});

httpServer.listen(parseInt(SERVER_PORT, 10), () => {
  console.log(`⚡️ Server is listening on port ${SERVER_PORT}`);
});
