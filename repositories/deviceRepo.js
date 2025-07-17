// Hiện tại chỉ mock, có thể mở rộng lưu DB, cache, ...
let deviceCommands = {};

export function setCommandForDevice(sn, command) {
  deviceCommands[sn] = command;
}

export function getCommandForDevice(sn) {
  return deviceCommands[sn] || "";
}
