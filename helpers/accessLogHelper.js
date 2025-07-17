import fs from "fs";
import path from "path";

export function writeAccessLog(req, res, responseTime) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip:
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "unknown",
    userAgent: req.get("User-Agent") || "unknown",
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: responseTime + "ms",
    referer: req.get("Referer") || "direct",
    contentLength: res.get("Content-Length") || 0,
  };
  // Ghi log ra console
  console.log(
    `🌐 ${logEntry.method} ${logEntry.url} - ${logEntry.statusCode} - ${logEntry.ip} - ${logEntry.responseTime}`
  );
  // Tạo folder logs nếu chưa tồn tại
  const logsDir = "logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  // Ghi log vào file
  const logString = JSON.stringify(logEntry) + "\n";
  const logFile = path.join(logsDir, "access.log");
  fs.appendFile(logFile, logString, (err) => {
    if (err) {
      console.error("❌ Error writing access log:", err);
    }
  });
}

export function accessLogMiddleware(req, res, next) {
  const startTime = Date.now();
  const originalEnd = res.end;
  res.end = function (...args) {
    const responseTime = Date.now() - startTime;
    writeAccessLog(req, res, responseTime);
    originalEnd.apply(res, args);
  };
  next();
}
