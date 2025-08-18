import express from "express";
import {
  createListing,
  getListings,
  getListing,
  updateListing,
  deleteListing,
  getUserListings,
  searchListings,
  getJobsListings,
  getHealthcareListings,
  getHealthcareListingsByCategory,
  getListingsByCategorySlug,
  getListingsByCity,
  getListingsByStore,
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

router.route("/jobs").get(getJobsListings);

router.route("/healthcare").get(getHealthcareListings);

router
  .route("/healthcare/category/:categorySlug")
  .get(getHealthcareListingsByCategory);

router.route("/search").get(searchListings);

// Add new route for advanced search with store and category slugs
router.route("/search/:storeSlug").get(searchListings);
router.route("/search/:storeSlug/:categorySlug").get(searchListings);

router.route("/category/:slug").get(getListingsByCategorySlug);

router.route("/by-city/listing").get(getListingsByCity);

// New route for getting listings by store slug or ID
router.route("/store/:storeSlugOrId").get(getListingsByStore);

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
