import express from "express";
import {
  createRating,
  deleteRating,
  getListingRatings,
} from "../controllers/rating.controller.js";

const router = express.Router();

router.post("/", createRating);
router.get("/user/:userId/:listingId?", getListingRatings);
router.delete("/:id", deleteRating);

export default router;
