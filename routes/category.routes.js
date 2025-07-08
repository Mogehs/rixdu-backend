import express from "express";
import {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  getCategoryTree,
  getCategoryPath,
  getCategoryByStore,
  getCategoryBySlug,
  searchCategories,
  getCategoryChildren,
} from "../controllers/category.controller.js";

import { protect, authorize } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";

const router = express.Router();

router
  .route("/")
  .post(protect, authorize("admin"), upload.single("icon"), createCategory)
  .get(getCategories);

router.route("/search").get(searchCategories);

router.route("/store/:storeId").get(getCategoryByStore);
router.route("/store/:storeId/tree").get(getCategoryTree);

router.route("/slug/:slug").get(getCategoryBySlug);
router.route("/slug/:slug/children").get(getCategoryChildren);

router.route("/path/:identifier").get(getCategoryPath);

router
  .route("/:identifier")
  .get(getCategory)
  .put(protect, authorize("admin"), upload.single("icon"), updateCategory)
  .delete(protect, authorize("admin"), deleteCategory);

export default router;
