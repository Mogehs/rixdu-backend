import express from "express";
import { protect } from "../middleware/auth.middleware.js";
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
  searchUsersBySkills,
} from "../controllers/profile.controller.js";

const router = express.Router();

router.get("/public/:userId", getPublicProfile);
router.get("/search", searchUsersBySkills);

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

router.post("/favorites", protect, addToFavorites);
router.delete("/favorites/:listingId", protect, removeFromFavorites);

export default router;
