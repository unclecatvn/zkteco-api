import Zkteco from "zkteco-js";

export async function connectDevice({ ip, port, sendTimeout, recvTimeout }) {
  const device = new Zkteco(
    ip,
    parseInt(port, 10),
    parseInt(sendTimeout, 10),
    parseInt(recvTimeout, 10)
  );
  await device.createSocket();
  if (device.client && typeof device.client.setMaxListeners === "function") {
    device.client.setMaxListeners(20);
  }
  return device;
}

export async function fetchDeviceDetails(device) {
  if (!device) return null;
  try {
    const info = await device.getInfo();
    const attendanceSize = await device.getAttendanceSize();
    const pin = await device.getPIN();
    const currentTime = await device.getTime();
    const faceOn = await device.getFaceOn();
    const ssr = await device.getSSR();
    const firmware = await device.getDeviceVersion();
    const deviceName = await device.getDeviceName();
    const platform = await device.getPlatform();
    const os = await device.getOS();
    const vendor = await device.getVendor();
    const productTime = await device.getProductTime();
    const macAddress = await device.getMacAddress();
    return {
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
  } catch (err) {
    console.error("❌ Error fetching device details:", err.message);
    return null;
  }
}

export async function fetchEnrolledUsers(device) {
  if (!device) return [];
  try {
    const rawUsers = await device.getUsers();
    const usersArray = Array.isArray(rawUsers)
      ? rawUsers
      : Array.isArray(rawUsers.data)
      ? rawUsers.data
      : Object.values(rawUsers);
    return usersArray.map((u) => ({
      user_id: u.userId,
      name: u.name,
      role: u.role,
    }));
  } catch (err) {
    console.error("❌ Error fetching users:", err.message);
    return [];
  }
}
