import express from "express";

import {
  getOrCreateChat,
  getUserChats,
  getChatById,
  getChatBySlug,
} from "../controllers/chat.controller.js";

const router = express.Router();

router.route("/").post(getOrCreateChat);
router.route("/:id").get(getUserChats);
router.route("/chat/:chatId").get(getChatById);
router.route("/slug/:slug").get(getChatBySlug);

export default router;
