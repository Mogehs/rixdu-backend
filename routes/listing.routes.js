import express from "express";
import {
  createListing,
  getListings,
  getListing,
  updateListing,
  deleteListing,
  getUserListings,
  searchListings,
} from "../controllers/listing.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import {
  uploadFiles,
  processFileUploads,
  handleUploadError,
} from "../middleware/listing-upload.middleware.js";

const router = express.Router();

router.route("/user").get(protect, getUserListings);

router
  .route("/")
  .post(
    protect,
    uploadFiles.array("files", 10),
    handleUploadError,
    processFileUploads,
    createListing
  )
  .get(getListings);

router.route("/search").get(searchListings);

router
  .route("/:id")
  .get(getListing)
  .put(
    protect,
    uploadFiles.array("files", 10),
    handleUploadError,
    processFileUploads,
    updateListing
  )
  .delete(protect, deleteListing);

export default router;
