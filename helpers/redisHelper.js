import { createClient } from "redis";

export async function createRedisClient({ host, port, username, password }) {
  const client = createClient({
    username,
    password,
    socket: { host, port: parseInt(port, 10) },
  });
  client.on("error", (err) => console.error("Redis Client Error:", err));
  await client.connect();
  return client;
}

export async function publishToRedis(client, channel, data) {
  if (client && typeof client.publish === "function") {
    await client.publish(channel, data);
  }
}
