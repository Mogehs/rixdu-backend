import express from "express";

import {
  getOrCreateChat,
  getUserChats,
  getChatById,
  getChatBySlug,
  getUnreadCount,
} from "../controllers/chat.controller.js";

import {
  getMessages,
  sendMessage,
  markMessagesAsRead,
} from "../controllers/message.controller.js";

const router = express.Router();

// Message routes (must come before wildcard routes)
router.route("/messages").get(getMessages);
router.route("/messages").post(sendMessage);
router.route("/messages/read").put(markMessagesAsRead);

// Chat routes
router.route("/").post(getOrCreateChat);
router.route("/chat/:chatId").get(getChatById);
router.route("/slug/:slug").get(getChatBySlug);
router.route("/unread/:id").get(getUnreadCount); // Must come before wildcard route
router.route("/:id").get(getUserChats); // This wildcard route must come last

export default router;
