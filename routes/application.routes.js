import express from "express";
import { body, param } from "express-validator";
import {
  submitApplication,
  getUserApplications,
  getJobApplications,
  getApplicationById,
  updateApplicationStatus,
  withdrawApplication,
  getApplicationStats,
} from "../controllers/application.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { handleResumeUpload } from "../middleware/resume-upload.middleware.js";
import { handleMulterError } from "../middleware/multer.middleware.js";

const router = express.Router();

router.post(
  "/",
  protect,
  handleResumeUpload,
  handleMulterError,
  [
    body("jobSlug").notEmpty().withMessage("Job slug is required"),
    body("applicantData")
      .custom((value, { req }) => {
        // If it's a string (from form data), try to parse it
        if (typeof value === "string") {
          try {
            req.body.applicantData = JSON.parse(value);
            return true;
          } catch {
            throw new Error("applicantData must be valid JSON");
          }
        }
        // If it's already an object, it's valid
        return typeof value === "object";
      })
      .withMessage("Applicant data is required"),
    body("applicantData.personalInfo.fullName")
      .notEmpty()
      .withMessage("Full name is required"),
    body("applicantData.personalInfo.email")
      .isEmail()
      .withMessage("Valid email is required"),
    body("applicantData.personalInfo.phone")
      .notEmpty()
      .withMessage("Phone number is required"),
    body("coverLetter").optional().isString(),
    body("applicationMethod")
      .optional()
      .isIn(["manual", "auto"])
      .withMessage("Application method must be manual or auto"),
  ],
  submitApplication
);

router.get("/my-applications", protect, getUserApplications);

router.get("/stats", protect, getApplicationStats);

router.get(
  "/job/:jobId",
  protect,
  [param("jobId").notEmpty().withMessage("Job ID or slug is required")],
  getJobApplications
);

router.get(
  "/:applicationId",
  protect,
  [
    param("applicationId")
      .isMongoId()
      .withMessage("Valid application ID is required"),
  ],
  getApplicationById
);

router.put(
  "/:applicationId/status",
  protect,
  [
    param("applicationId")
      .isMongoId()
      .withMessage("Valid application ID is required"),
    body("status")
      .isIn(["pending", "reviewed", "shortlisted", "rejected", "hired"])
      .withMessage("Valid status is required"),
    body("notes").optional().isString(),
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
  ],
  updateApplicationStatus
);

router.delete(
  "/:applicationId",
  protect,
  [
    param("applicationId")
      .isMongoId()
      .withMessage("Valid application ID is required"),
  ],
  withdrawApplication
);

export default router;
