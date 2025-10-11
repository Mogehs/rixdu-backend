import express from "express";
import {
  getUsers,
  getUser,
  getUserVerificationStats,
} from "../controllers/user.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.route("/").get(protect, authorize("admin"), getUsers);
router
  .route("/verification-stats")
  .get(protect, authorize("admin"), getUserVerificationStats);

router.route("/:id").get(protect, authorize("admin"), getUser);

export default router;
