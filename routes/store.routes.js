import express from "express";
import {
  createStore,
  getStores,
  getStore,
  updateStore,
  deleteStore,
} from "../controllers/store.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { upload, handleMulterError } from "../middleware/multer.middleware.js";

const router = express.Router();

router
  .route("/")
  .post(
    protect,
    authorize("admin"),
    upload.single("icon"),
    handleMulterError,
    createStore
  )
  .get(getStores);

router
  .route("/:idOrSlug")
  .get(getStore)
  .put(
    protect,
    authorize("admin"),
    upload.single("icon"),
    handleMulterError,
    updateStore
  )
  .delete(protect, authorize("admin"), deleteStore);

export default router;
