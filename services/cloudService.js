import { publishToRedis } from "../helpers/redisHelper.js";
import { getCommandForDevice } from "../repositories/deviceRepo.js";
import { parseAttlog } from "../helpers/cloudDataHelper.js";
import msgpack from "notepack.io";

let pubClient = null;
let redisChannel = null;

// Thiết lập client và channel cho Redis Pub/Sub
export function setPubSub(client, channel) {
  pubClient = client;
  redisChannel = channel;
}

// Lấy lệnh cho thiết bị (có thể mở rộng lấy từ DB, cache...)
export async function getCommand(sn) {
  return getCommandForDevice(sn);
}

// Xử lý dữ liệu chấm công gửi lên từ máy (ATTLOG)
export async function handleCdata(sn, raw) {
  // Parse ATTLOG
  const records = parseAttlog(raw).map((r) => ({ sn, ...r }));
  if (records.length && pubClient) {
    try {
      await publishToRedis(
        pubClient,
        redisChannel,
        msgpack.encode({ sn, logs: records })
      );
    } catch (e) {
      console.error("Redis publish error:", e.message);
    }
  }
  return "OK";
}
