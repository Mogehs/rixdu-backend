import express from "express";
import {
  getSubscriptionStatus,
  startFreeTrial,
  createPremiumSubscription,
  confirmPremiumSubscription,
  cancelSubscription,
  getSubscriptionHistory,
  checkListingEligibility,
  getAllSubscriptions,
} from "../controllers/subscription.controller.js";

import { protect, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// Webhooks moved to /api/v1/stripe/webhook
// Protected routes (require authentication)
router.use(protect);

// User subscription routes
router.get("/status", getSubscriptionStatus);
router.get("/history", getSubscriptionHistory);
router.get("/check-eligibility", checkListingEligibility);
router.post("/trial/start", startFreeTrial);
router.post("/premium/create", createPremiumSubscription);
router.post("/premium/confirm", confirmPremiumSubscription);
router.patch("/cancel", cancelSubscription);
// Reactivation handled by creating new subscription

// Admin routes
router.use(authorize("admin"));
router.get("/admin/all", getAllSubscriptions);

export default router;
