import dotenv             from 'dotenv';
import path               from 'path';
import { fileURLToPath }  from 'url';
import { dirname, join }  from 'path';
import { createClient }   from 'redis';
import { EventEmitter }   from 'events';
import msgpack            from 'notepack.io';
import Zkteco             from 'zkteco-js';
import express            from 'express';
import http               from 'http';
import { Server }         from 'socket.io';

// Load environment variables from .env file
dotenv.config({
  path: path.join(dirname(fileURLToPath(import.meta.url)), '.env'),
});

const fallback_bus = new EventEmitter();
fallback_bus.setMaxListeners(20);

const {
  // REDIS settings
  REDIS_HOST     = '127.0.0.1',
  REDIS_PORT     = '6379',
  REDIS_USERNAME = 'default',
  REDIS_PASSWORD = '',
  REDIS_CHANNEL  = 'attendance:updates',

  // ZKTECO device settings 
  DEVICE_IP      = '192.168.1.1',
  DEVICE_PORT    = '4370',
  SEND_TIMEOUT   = '20000',
  RECV_TIMEOUT   = '20000',

  // Port and frontend url
  SERVER_PORT    = '8090',
  CLIENT_ORIGIN  = 'http://localhost:3000',
} = process.env;

let pub_client;
let sub_client;

async function init_pub_sub() {
  try {
    const redis_client = createClient({
      username: REDIS_USERNAME,
      password: REDIS_PASSWORD,
      socket: {
        host: REDIS_HOST,
        port: parseInt(REDIS_PORT, 10),
      },
    });
    redis_client.on('error', err => console.error('Redis Client Error', err));
    await redis_client.connect();

    pub_client = redis_client;
    sub_client = redis_client.duplicate();
    await sub_client.connect();
    sub_client.setMaxListeners(20);

    console.log('✅ Connected to Redis Pub/Sub');
  } catch (err) {
    console.warn('⚠️ Redis unavailable, using in-proc EventEmitter');
    pub_client = fallback_bus;
    sub_client = fallback_bus;
  }
}

;(async () => {
  // Connect to ZKTeco device
  const device = new Zkteco(
    DEVICE_IP,
    parseInt(DEVICE_PORT, 10),
    parseInt(SEND_TIMEOUT, 10),
    parseInt(RECV_TIMEOUT, 10),
  );
  await device.createSocket();

  // Retrieve device details & users
  const device_details_raw = {
    info:             await device.getInfo(),
    attendance_size:  await device.getAttendanceSize(),
    pin:              await device.getPIN(),
    current_time:     await device.getTime(),
    face_on:          await device.getFaceOn(),
    ssr:              await device.getSSR(),
    firmware:         await device.getDeviceVersion(),
    device_name:      await device.getDeviceName(),
    platform:         await device.getPlatform(),
    os:               await device.getOS(),
    vendor:           await device.getVendor(),
    product_time:     await device.getProductTime(),
    mac_address:      await device.getMacAddress(),
  };

  const raw_users_from_device = await device.getUsers();
  const users_array = Array.isArray(raw_users_from_device)
    ? raw_users_from_device
    : Array.isArray(raw_users_from_device.data)
      ? raw_users_from_device.data
      : Object.values(raw_users_from_device);

  const users_device = users_array.map(u => ({
    user_id: u.userId,
    name:    u.name,
    role:    u.role,
  }));

  // Initialize pub/sub (Redis or fallback)
  await init_pub_sub();

  // Define date window (from Jan 1 of this year to now)
  const start_of_year = new Date(new Date().getFullYear(), 0, 1).getTime();
  let last_payload_obj = null;

  // publish function (fetch logs, enrich, and publish)
  async function publish_attendances() {
    const raw_attendances = await device.getAttendances();
    const attendances_array = Array.isArray(raw_attendances)
      ? raw_attendances
      : Array.isArray(raw_attendances.data)
        ? raw_attendances.data
        : Object.values(raw_attendances);

    const enriched_logs = attendances_array
      .filter(entry => {
        const ts = new Date(entry.record_time).getTime();
        return ts >= start_of_year && ts <= Date.now();
      })
      .map(entry => ({
        sn:          entry.sn,
        employee_id: entry.user_id,
        name:        users_device.find(u => u.user_id === entry.user_id)?.name || 'Unknown',
        record_time: entry.record_time,
        type:        entry.type,
        state:       entry.state,
      }));

    const payload_obj = {
      timestamp:      Date.now(),
      device_details: device_details_raw,
      users:          users_device,
      logs:           enriched_logs,
    };
    last_payload_obj = payload_obj;

    const packed_payload = msgpack.encode(payload_obj);
    if (typeof pub_client.publish === 'function') {
      await pub_client.publish(REDIS_CHANNEL, packed_payload);
    } else {
      fallback_bus.emit(REDIS_CHANNEL, packed_payload);
    }
  }

  // Initial publish + schedule every 60 seconds
  await publish_attendances();
  setInterval(publish_attendances, 60_000);

  // Set up Express + Socket.IO HTTP server
  const app = express();
  const http_server = http.createServer(app);
  const io = new Server(http_server, {
    cors:       { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
    transports: ['websocket'],
  });

  // REST endpoint for on-demand sync
  app.get('/api/v1/bio-sync', (_, res) => {
    if (last_payload_obj) {
      return res.json(last_payload_obj);
    }
    res.sendStatus(204);
  });

  // Socket.IO connection handling
  io.on('connection', socket => {
    console.log(`Client connected: ${socket.id}`);
    if (last_payload_obj) {
      socket.emit('attendance', msgpack.encode(last_payload_obj));
    }
    const message_handler = (_ch, msg) => {
      socket.emit('attendance', msg);
    };
    sub_client.on(REDIS_CHANNEL, message_handler);

    socket.on('disconnect', () => {
      sub_client.off(REDIS_CHANNEL, message_handler);
    });
  });

  http_server.listen(parseInt(SERVER_PORT, 10), () => {
    console.log(`⚡️ Server listening on port ${SERVER_PORT}`);
  });
})().catch(err => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
