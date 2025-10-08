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
  getVehicleListings,
  getVehicleListingsAdvanced,
  getVehicleFilterOptions,
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
    uploadFiles.array("files", 15),
    handleUploadError,
    processFileUploads,
    createListing
  )
  .get(getListings);

router.route("/jobs").get(getJobsListings);

router.route("/healthcare").get(getHealthcareListings);

router.route("/vehicles").get(getVehicleListings);

router.route("/vehicles/advanced").get(getVehicleListingsAdvanced);

router.route("/vehicles/filter-options").get(getVehicleFilterOptions);

router
  .route("/healthcare/category/:categorySlug")
  .get(getHealthcareListingsByCategory);

router.route("/search").get(searchListings);

router.route("/search/:storeSlug").get(searchListings);
router.route("/search/:storeSlug/:categorySlug").get(searchListings);

router.route("/category/:slug").get(getListingsByCategorySlug);

router.route("/by-city/listing").get(getListingsByCity);

router.route("/store/:storeSlugOrId").get(getListingsByStore);

// Handle single listing by ID or multi-segment slug
// This must be the last route to catch all remaining paths
router.get("/:slug(*)", getListing);
router.put(
  "/:slug(*)",
  protect,
  uploadFiles.array("files", 15),
  handleUploadError,
  processFileUploads,
  updateListing
);
router.delete("/:slug(*)", protect, deleteListing);

export default router;
