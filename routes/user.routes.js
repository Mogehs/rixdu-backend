import express from "express";
import { getUsers, getUser } from "../controllers/user.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

router.route("/").get(protect, authorize("admin"), getUsers);

router.route("/:id").get(protect, authorize("admin"), getUser);

export default router;
