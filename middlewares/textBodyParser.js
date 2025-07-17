// Middleware parse raw text body cho các route cần nhận text/plain
export function textBodyParser(req, res, next) {
  let data = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    data += chunk;
  });
  req.on("end", () => {
    req.body = data;
    next();
  });
}
