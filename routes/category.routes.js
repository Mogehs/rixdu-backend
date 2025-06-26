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
} from "../controllers/category.controller.js";

import { protect, authorize } from "../middleware/auth.middleware.js";
import { upload } from "../middleware/multer.middleware.js";

const router = express.Router();

router
  .route("/")
  .post(protect, authorize("admin"), upload.single("icon"), createCategory)
  .get(getCategories);
router.route("/tree/:storeId").get(getCategoryTree);
router.route("/path/:id").get(getCategoryPath);
router
  .route("/store/:storeId")
  .get(protect, authorize("admin"), getCategoryByStore);

router
  .route("/:id")
  .get(getCategory)
  .put(protect, authorize("admin"), upload.single("icon"), updateCategory)
  .delete(protect, authorize("admin"), deleteCategory);

export default router;
