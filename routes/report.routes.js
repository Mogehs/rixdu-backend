import express from "express";
import {
  createReport,
  getAllReports,
  getReportDetails,
  updateReportStatus,
  getListingReports,
  getUserReports,
} from "../controllers/report.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes (require authentication)
router.post("/", protect, createReport);
router.get("/my-reports", protect, getUserReports);

// Admin routes
router.get("/all", protect, authorize("admin"), getAllReports);
router.get("/:id", protect, authorize("admin"), getReportDetails);
router.put("/:id/status", protect, authorize("admin"), updateReportStatus);
router.get(
  "/listing/:listingId",
  protect,
  authorize("admin"),
  getListingReports
);

export default router;
