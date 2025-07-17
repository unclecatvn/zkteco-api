import express from "express";
import {
  getRequest,
  postCdata,
  getCdata,
  registerDevice,
} from "../controllers/cloudController.js";
import { textBodyParser } from "../middlewares/textBodyParser.js";

const router = express.Router();

router.get("/getrequest", getRequest);
router.post("/cdata", textBodyParser, postCdata);
router.get("/cdata", getCdata);
router.get("/register", registerDevice);

export default router;
