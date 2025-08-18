import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getNotifications,
  markAllAsRead,
  toggleRead,
  deleteNotification,
  getPreferences,
  upsertPreference,
  registerFCMToken,
  unregisterFCMToken,
  createTestNotification,
} from "../controllers/notification.controller.js";

const router = express.Router();

router.use(protect);

// Notifications
router.get("/", getNotifications);
router.patch("/mark-all", markAllAsRead);
router.patch("/:id/toggle", toggleRead);
router.delete("/:id", deleteNotification);

// Preferences per store
router.get("/preferences", getPreferences);
router.put("/preferences", upsertPreference);

// FCM Token Management
router.post("/fcm/register", registerFCMToken);
router.post("/fcm/unregister", unregisterFCMToken);

// Test endpoint for creating notifications
router.post("/test", createTestNotification);

export default router;
