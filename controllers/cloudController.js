import * as cloudService from "../services/cloudService.js";

export const getRequest = async (req, res) => {
  const sn = req.query.SN || req.query.sn || "unknown";
  const info = req.query.INFO || req.query.info || "";
  console.log(`🔔 Device getrequest SN=${sn} INFO=${info}`);
  const command = await cloudService.getCommand(sn);
  res.type("text/plain").send(command || "");
};

export const postCdata = async (req, res) => {
  const sn = req.query.SN || req.query.sn || "unknown";
  const raw = req.body || "";
  console.log(`📥 cdata from SN=${sn} ("${raw.length}" chars)`);
  const result = await cloudService.handleCdata(sn, raw);
  res.type("text/plain").send(result);
};

export const getCdata = (req, res) => {
  res
    .status(405)
    .type("text/plain")
    .send(
      "Vui lòng gửi dữ liệu bằng phương thức POST (Content-Type: text/plain)"
    );
};

export const registerDevice = (req, res) => {
  const sn = req.query.SN || req.query.sn || "unknown";
  console.log(`🔔 Device register request from SN=${sn} IP=${req.ip}`);
  res.type("text/plain").send("OK");
};
