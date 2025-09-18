import express from "express";
import garageController from "../controllers/garage.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { uploadMultiple } from "../middleware/multer.middleware.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/search", garageController.searchGarages);
router.get("/top-rated", garageController.getTopRatedGarages);
router.get("/all", garageController.getAllGarages);
router.get("/:slug", garageController.getGarageBySlug);
router.get("/:slug/services", garageController.getGarageServices);
// Get single service by service slug
router.get(
  "/:garageSlug/services/:serviceSlug",
  garageController.getServiceBySlug
);

// Protected routes (authentication required)
router.use(protect); // All routes below require authentication

// Garage management
router.post("/", garageController.createGarage);
router.put("/:slug", garageController.updateGarage);
router.get("/:slug/dashboard", garageController.getGarageDashboard);

// Image upload
router.post(
  "/:slug/upload-images",
  uploadMultiple("images", 10),
  garageController.uploadImages
);
// Image delete
router.delete("/:slug/images", garageController.deleteImages);

// Service management
router.post("/:slug/services", garageController.addService);
router.put("/:slug/services/:serviceId", garageController.updateService);
router.delete("/:slug/services/:serviceId", garageController.deleteService);

export default router;
