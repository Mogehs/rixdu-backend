import express from "express";

import {
  getOrCreateChat,
  getUserChats,
} from "../controllers/chat.controller.js";

const router = express.Router();

router.route("/").post(getOrCreateChat);
router.route("/:id").get(getUserChats);

export default router;
