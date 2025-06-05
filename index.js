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

import dotenv            from 'dotenv';
import path              from 'path';
import { fileURLToPath } from 'url';
import { dirname }       from 'path';
import { createClient }  from 'redis';
import { EventEmitter }  from 'events';
import msgpack           from 'notepack.io';
import Zkteco            from 'zkteco-js';
import express           from 'express';
import cors              from 'cors';
import http              from 'http';
import { Server }        from 'socket.io';

// ------------------------------------------------------------------------------------
// 1. INCREASE GLOBAL MAX LISTENERS TO AVOID WARNINGS
// ------------------------------------------------------------------------------------
// By default, EventEmitters warn if more than 10 listeners are added. Since we may
// attach many listeners (Redis, Socket.IO, device client, etc.), bump the limit:
EventEmitter.defaultMaxListeners = 20;

// ------------------------------------------------------------------------------------
// 2. LOAD ENVIRONMENT VARIABLES
// ------------------------------------------------------------------------------------
// The .env file should define variables like REDIS_HOST, DEVICE_IP, etc. Example:
//
//   REDIS_HOST=127.0.0.1
//   REDIS_PORT=6379
//   REDIS_USERNAME=default
//   REDIS_PASSWORD=
//   REDIS_CHANNEL=attendance:updates
//
//   DEVICE_IP=192.168.1.1
//   DEVICE_PORT=4370
//   SEND_TIMEOUT=20000
//   RECV_TIMEOUT=20000
//
//   SERVER_PORT=8090
//   CLIENT_ORIGIN=http://localhost:3000
//
dotenv.config({
  path: path.join(dirname(fileURLToPath(import.meta.url)), '.env'),
});

// Destructure environment variables with defaults
const {
  REDIS_HOST     = '127.0.0.1',
  REDIS_PORT     = '6379',
  REDIS_USERNAME = 'default',
  REDIS_PASSWORD = '',
  REDIS_CHANNEL  = 'attendance:updates',

  DEVICE_IP      = '192.168.1.1',
  DEVICE_PORT    = '4370',
  SEND_TIMEOUT   = '20000',
  RECV_TIMEOUT   = '20000',

  SERVER_PORT    = '8090',
  CLIENT_ORIGIN  = 'http://localhost:3000',
} = process.env;

// ------------------------------------------------------------------------------------
// 3. SET UP REDIS PUB/SUB OR FALLBACK EVENT EMITTER
// ------------------------------------------------------------------------------------
// If Redis is unavailable, we fallback to an in-process EventEmitter so the rest of
// the code doesn’t need to change.
let pub_client;
let sub_client;
const fallback_bus = new EventEmitter();
fallback_bus.setMaxListeners(20);

/**
 * initPubSub
 *
 * Attempts to connect to Redis and set up pub/sub clients. If Redis is down,
 * falls back to the in-process EventEmitter.
 */
async function initPubSub() {
  try {
    const redisClient = createClient({
      username: REDIS_USERNAME,
      password: REDIS_PASSWORD,
      socket: {
        host: REDIS_HOST,
        port: parseInt(REDIS_PORT, 10),
      },
    });

    redisClient.on('error', err => console.error('Redis Client Error:', err));
    await redisClient.connect();

    pub_client = redisClient;
    sub_client = redisClient.duplicate();
    await sub_client.connect();
    sub_client.setMaxListeners(20);

    console.log('✅ Connected to Redis Pub/Sub');
  } catch (err) {
    console.warn('⚠️  Cannot connect to Redis, using in-process EventEmitter instead');
    pub_client = fallback_bus;
    sub_client = fallback_bus;
  }
}

// ------------------------------------------------------------------------------------
// 4. BIOMETRIC DEVICE (ZKTeco) CONNECTION & HELPERS
// ------------------------------------------------------------------------------------
// We wrap all interactions with the ZKTeco device in try/catch so timeouts or disconnections
// don’t crash the app. If the device is offline, we retry connecting every minute.

/** @type {Zkteco|null} */
let device = null;

/**
 * connectDevice
 *
 * Creates a new Zkteco instance and opens a TCP socket to the device.
 * Returns true if successful, false otherwise.
 */
async function connectDevice() {
  try {
    device = new Zkteco(
      DEVICE_IP,
      parseInt(DEVICE_PORT, 10),
      parseInt(SEND_TIMEOUT, 10),
      parseInt(RECV_TIMEOUT, 10),
    );

    await device.createSocket();

    // Bump max listeners on the underlying socket to avoid warnings
    if (device.client && typeof device.client.setMaxListeners === 'function') {
      device.client.setMaxListeners(20);
    }

    console.log('🔌 Successfully connected to biometric device');
    return true;
  } catch (err) {
    console.error('❌ Failed to connect to biometric device:', err.message);
    return false;
  }
}

/** 
 * fetchDeviceDetailsAndUsers
 *
 * Once connected, grab static device info (firmware, OS, vendor, etc.) and the list
 * of enrolled users. These details only need to be refreshed if the device reconnects.
 */
let deviceDetails = null;   // will hold all getInfo(), getPIN(), etc.
let enrolledUsers = [];     // array of { user_id, name, role }

async function fetchDeviceDetailsAndUsers() {
  if (!device) {
    return;
  }

  try {
    // Fetch basic device information
    const info            = await device.getInfo();
    const attendanceSize  = await device.getAttendanceSize();
    const pin             = await device.getPIN();
    const currentTime     = await device.getTime();
    const faceOn          = await device.getFaceOn();
    const ssr             = await device.getSSR();
    const firmware        = await device.getDeviceVersion();
    const deviceName      = await device.getDeviceName();
    const platform        = await device.getPlatform();
    const os              = await device.getOS();
    const vendor          = await device.getVendor();
    const productTime     = await device.getProductTime();
    const macAddress      = await device.getMacAddress();

    deviceDetails = {
      info,
      attendanceSize,
      pin,
      currentTime,
      faceOn,
      ssr,
      firmware,
      deviceName,
      platform,
      os,
      vendor,
      productTime,
      macAddress,
    };

    // Fetch all enrolled users in one call
    const rawUsers = await device.getUsers();
    const usersArray = Array.isArray(rawUsers)
      ? rawUsers
      : Array.isArray(rawUsers.data)
        ? rawUsers.data
        : Object.values(rawUsers);

    enrolledUsers = usersArray.map(u => ({
      user_id: u.userId,
      name:    u.name,
      role:    u.role,
    }));

    console.log(`👥 Retrieved ${enrolledUsers.length} enrolled users`);
  } catch (err) {
    console.error('❌ Error fetching device details/users:', err.message);
  }
}

// ------------------------------------------------------------------------------------
// 5. ATTENDANCE POLLING & PUBLISHING
// ------------------------------------------------------------------------------------
// Periodically (every 60 seconds) fetch attendance logs from the device, enrich them,
// and then publish via Redis (or the fallback EventEmitter). If the device is offline,
// we log the error and try to reconnect on the next cycle.

let lastPublishedPayload = null;
let deviceWasPreviouslyActive = false;

/**
 * publishAttendances
 *
 * 1. If `device` is null or the socket is closed, attempt reconnection.
 * 2. If reconnection succeeds, re-fetch deviceDetails and enrolledUsers.
 * 3. Otherwise, skip this cycle (device is still offline).
 * 4. If device is connected, fetch all attendance logs, filter by date (start of year),
 *    enrich each record (add `name` from `enrolledUsers`), and pack into a single payload.
 * 5. Publish the payload on REDIS_CHANNEL (or via fallback bus if Redis is down).
 */
async function publishAttendances() {
  // (A) Check TCP socket health and reconnect if needed
  if (
    !device ||
    !device.client ||
    (device.client.destroyed || device.client.readyState === 'closed')
  ) {
    // Attempt to reconnect
    const reconnected = await connectDevice();
    if (reconnected) {
      deviceWasPreviouslyActive = true;
      await fetchDeviceDetailsAndUsers();
    } else {
      if (deviceWasPreviouslyActive) {
        console.warn('⚠️  Biometric device went offline (could not reconnect).');
        deviceWasPreviouslyActive = false;
      }
      return; // Skip fetching logs this cycle
    }
  }

  // (B) Device is (re)connected. Try fetching attendance logs.
  try {
    const rawLogs = await device.getAttendances();

    // Log success only once after reconnection or initial connect
    if (!deviceWasPreviouslyActive) {
      console.log('✅ Biometric device is active');
      deviceWasPreviouslyActive = true;
    }

    // Normalize the rawLogs into an array
    const logsArray = Array.isArray(rawLogs)
      ? rawLogs
      : Array.isArray(rawLogs.data)
        ? rawLogs.data
        : Object.values(rawLogs);

    // Filter for records from start of this year until now
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
    const now = Date.now();

    const enrichedLogs = logsArray
      .filter(entry => {
        const entryTs = new Date(entry.record_time).getTime();
        return entryTs >= startOfYear && entryTs <= now;
      })
      .map(entry => ({
        sn:          entry.sn,
        employee_id: entry.user_id,
        name:        enrolledUsers.find(u => u.user_id === entry.user_id)?.name || 'Unknown',
        record_time: entry.record_time,
        type:        entry.type,
        state:       entry.state,
      }));

    // Build a single payload object
    const payload = {
      timestamp:      Date.now(),
      device_details: deviceDetails,
      users:          enrolledUsers,
      logs:           enrichedLogs,
    };

    lastPublishedPayload = payload;
    const packed = msgpack.encode(payload);

    // Publish on Redis channel or fallback
    if (typeof pub_client.publish === 'function') {
      await pub_client.publish(REDIS_CHANNEL, packed);
    } else {
      fallback_bus.emit(REDIS_CHANNEL, packed);
    }
  } catch (err) {
    // If any call to `getAttendances()` fails (e.g., TIMEOUT), mark device inactive
    if (deviceWasPreviouslyActive) {
      console.error('❌ Biometric device is inactive:', err.message);
      deviceWasPreviouslyActive = false;
    }
    // Destroy the existing socket so the next interval will reconnect
    try {
      if (device && device.client && typeof device.client.destroy === 'function') {
        device.client.destroy();
      }
    } catch (_) {
      // ignore
    }
  }
}

// ------------------------------------------------------------------------------------
// 6. HTTP + SOCKET.IO SERVER SETUP
// ------------------------------------------------------------------------------------
// - A simple Express route `/api/v1/bio-sync` that returns `lastPublishedPayload` if available.
// - A Socket.IO namespace that broadcasts the same data in real time.
//
// Clients can either poll the REST endpoint or subscribe via WebSocket.

(async () => {
  // Step 1: Try connecting to the biometric device on startup
  const initiallyConnected = await connectDevice();
  if (initiallyConnected) {
    await fetchDeviceDetailsAndUsers();
    deviceWasPreviouslyActive = true;
  } else {
    console.warn('⚠️  Initial biometric device connection failed. Will retry soon...');
  }

  // Step 2: Initialize Redis (or fallback)
  await initPubSub();

  // Step 3: Start the attendance‐publishing loop
  // Wait 1 second before first fetch, then every 60 seconds thereafter
  setTimeout(publishAttendances, 1000);
  setInterval(publishAttendances, 60_000);

  // Step 4: Set up Express + Socket.IO
  const app = express();
  app.use(cors({
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning'
    ]
  }));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { 
      origin: CLIENT_ORIGIN,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'ngrok-skip-browser-warning'
      ]
    },
    transports: ['websocket'],
  });

  // REST endpoint: return last payload if it exists
  app.get('/api/v1/bio-sync', (_, res) => {
    if (lastPublishedPayload) {
      return res.json(lastPublishedPayload);
    }
    return res.sendStatus(204);
  });

  // WebSocket (Socket.IO) logic
  io.on('connection', socket => {
    console.log(`📡 Client connected: ${socket.id}`);

    // Immediately send the latest payload if we have one
    if (lastPublishedPayload) {
      socket.emit('attendance', msgpack.encode(lastPublishedPayload));
    }

    // On any new Redis message (or fallback bus event), push to this socket
    const messageHandler = (_channel, packedMsg) => {
      socket.emit('attendance', packedMsg);
    };
    sub_client.on(REDIS_CHANNEL, messageHandler);

    socket.on('disconnect', () => {
      sub_client.off(REDIS_CHANNEL, messageHandler);
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  // Step 5: Start listening on the specified port
  httpServer.listen(parseInt(SERVER_PORT, 10), () => {
    console.log(`⚡️ Server is listening on port ${SERVER_PORT}`);
  });
})().catch(err => {
  console.error('🚨 Fatal error during startup:', err);
  process.exit(1);
});

// ------------------------------------------------------------------------------------
// 7. GLOBAL ERROR HANDLERS
// ------------------------------------------------------------------------------------
// Prevents unhandled rejections or exceptions from crashing the process.

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at Promise:', promise, 'reason:', reason);
  // We do NOT exit; let it keep running.
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception thrown:', err);
  // We do NOT exit; let the process keep running.
});
