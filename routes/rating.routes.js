import express from "express";
import {
  createRating,
  getUserRatings,
  deleteRating,
} from "../controllers/rating.controller.js";

const router = express.Router();

router.post("/", createRating);
router.get("/user/:userId", getUserRatings);
router.delete("/:id", deleteRating);

export default router;
