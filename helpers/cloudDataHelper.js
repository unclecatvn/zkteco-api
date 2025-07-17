// Parse ATTLOG từ raw text
export function parseAttlog(raw) {
  return raw
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.startsWith("ATTLOG"))
    .map((l) => {
      const [, userId, time] = l.split(",");
      return { userId, time };
    });
}
