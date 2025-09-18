import express from "express";
import {
  createPaymentIntent,
  confirmPayment,
  handleStripeWebhook,
  getPaymentHistory,
  refundPayment,
} from "../controllers/payment.controller.js";

import { protect, authorize } from "../middleware/auth.middleware.js";
import {
  uploadFiles,
  processFileUploads,
  handleUploadError,
} from "../middleware/listing-upload.middleware.js";

const router = express.Router();

// Webhook route (must be before protect middleware as it doesn't need auth)
router.route("/webhook").post(handleStripeWebhook);

// Protected routes
router.use(protect);

// User routes
router.route("/create-intent").post(createPaymentIntent);
router
  .route("/confirm-payment")
  .post(
    uploadFiles.array("files", 10),
    handleUploadError,
    processFileUploads,
    confirmPayment
  );
router.route("/history").get(getPaymentHistory);

// Admin routes
router.use(authorize("admin"));
router.route("/refund/:listingId").post(refundPayment);

export default router;
