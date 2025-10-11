import express from "express";
import { protect, optionalAuth } from "../middleware/auth.middleware.js";
import { upload, resumeUpload } from "../middleware/multer.middleware.js";
import {
  getCompleteProfile,
  getPublicProfile,
  getJobProfile,
  getProfessionalProfile,
  updatePersonalProfile,
  updateJobProfile,
  uploadResume,
  addToFavorites,
  removeFromFavorites,
  getUserFavorites,
  searchUsersBySkills,
} from "../controllers/profile.controller.js";

const router = express.Router();

router.get("/public/:userId", optionalAuth, getPublicProfile);
router.get("/search", searchUsersBySkills);

router.post("/favorites", protect, addToFavorites);
router.get("/favorites/:userId?", protect, getUserFavorites);
router.delete("/favorites/:listingId", protect, removeFromFavorites);

router.get("/me", protect, getCompleteProfile);
router.get("/job/:userId?", protect, getJobProfile);
router.get("/professional/:userId?", protect, getProfessionalProfile);
router.get("/:userId", protect, getCompleteProfile);

router.put(
  "/personal",
  protect,
  upload.single("avatar"),
  updatePersonalProfile
);
router.put("/job", protect, resumeUpload.single("resume"), updateJobProfile);
router.post(
  "/resume/upload",
  protect,
  resumeUpload.single("resume"),
  uploadResume
);

export default router;
