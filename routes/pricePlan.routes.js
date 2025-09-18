import express from "express";
import {
  createPricePlan,
  getPricePlans,
  getPricePlan,
  updatePricePlan,
  deletePricePlan,
  getPricePlansForCategory,
  getPricePlansForStore,
  getPricePlansByType,
  bulkCreateDefaultPlans,
  togglePricePlanStatus,
} from "../controllers/pricePlan.controller.js";

import { protect, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public routes
router.route("/").get(getPricePlans);
router.route("/:id").get(getPricePlan);
router.route("/category/:categoryId").get(getPricePlansForCategory);
router.route("/store/:storeId").get(getPricePlansForStore);
router.route("/type/:planType").get(getPricePlansByType);

// Protected routes (Admin only)
router.use(protect);
router.use(authorize("admin"));

router.route("/").post(createPricePlan);
router.route("/:id").put(updatePricePlan).delete(deletePricePlan);
router.route("/:id/toggle-status").patch(togglePricePlanStatus);
router.route("/bulk-create/:categoryId").post(bulkCreateDefaultPlans);

export default router;
