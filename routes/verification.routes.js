import express from "express";
import {
  submitVerification,
  getVerificationStatus,
  getPendingVerifications,
  reviewVerification,
  getVerificationDetails,
} from "../controllers/verification.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { verificationUpload } from "../middleware/verification-upload.middleware.js";

const router = express.Router();

// User routes
router.post("/submit", protect, verificationUpload, submitVerification);
router.get("/status", protect, getVerificationStatus);

// Admin routes
router.get("/pending", protect, authorize("admin"), getPendingVerifications);
router.put("/review/:userId", protect, authorize("admin"), reviewVerification);
router.get(
  "/details/:userId",
  protect,
  authorize("admin"),
  getVerificationDetails
);

export default router;
