import mongoose from "mongoose";
import Store from "../models/Store.js";
import Category from "../models/Category.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

export const createStore = async (req, res) => {
  try {
    const { name } = req.body;
    let iconData = null;

    const storeExists = await Store.findOne({ name }).select("_id").lean();
    if (storeExists) {
      return res.status(400).json({
        success: false,
        message: "A store with this name already exists",
      });
    }

    if (req.file) {
      iconData = await uploadToCloudinary(req.file, "stores/icons");
    }

    const store = await Store.create({
      name,
      icon: iconData ? iconData : undefined,
    });

    return res.status(201).json({
      success: true,
      data: store,
    });
  } catch (error) {
    console.error(`Error creating store: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error creating store",
    });
  }
};

export const getStores = async (req, res) => {
  try {
    const { level, root } = req.query;
    const stores = await Store.findAllStores();

    if (root === "true") {
      const storesWithCategories = await Promise.all(
        stores.map(async (store) => {
          const categories = await Category.find({
            storeId: store._id,
          })
            .select("name slug icon isLeaf childrenCount level parent")
            .sort({ level: 1, name: 1 })
            .lean();

          // Build tree structure
          const buildTree = (categories) => {
            const categoryMap = new Map();
            const roots = [];

            // Create a map of all categories
            categories.forEach((category) => {
              categoryMap.set(category._id.toString(), {
                ...category,
                children: [],
              });
            });

            // Build the tree structure
            categories.forEach((category) => {
              const categoryWithChildren = categoryMap.get(
                category._id.toString()
              );

              if (category.parent) {
                const parent = categoryMap.get(category.parent.toString());
                if (parent) {
                  parent.children.push(categoryWithChildren);
                }
              } else {
                // Root level category
                roots.push(categoryWithChildren);
              }
            });

            return roots;
          };

          const categoryTree = buildTree(categories);

          return {
            ...store,
            categories: categoryTree,
            isRootRequest: true,
            categoryCount: categories.length,
          };
        })
      );

      return res.status(200).json({
        success: true,
        count: storesWithCategories.length,
        data: storesWithCategories,
        isRootRequest: true,
      });
    }

    // If level parameter is provided, fetch categories by level for all stores
    if (level !== undefined) {
      const levelNum = parseInt(level);

      if (isNaN(levelNum) || levelNum < 0) {
        return res.status(400).json({
          success: false,
          message: "Level must be a non-negative number",
        });
      }

      // Fetch categories for all stores from level 0 to the specified level
      const storesWithCategories = await Promise.all(
        stores.map(async (store) => {
          const categories = await Category.find({
            storeId: store._id,
            level: { $lte: levelNum },
          })
            .select("name slug icon isLeaf childrenCount level parent")
            .sort({ level: 1, name: 1 })
            .lean();

          return {
            ...store,
            categories,
            categoryLevel: levelNum,
            categoryCount: categories.length,
          };
        })
      );

      return res.status(200).json({
        success: true,
        count: storesWithCategories.length,
        data: storesWithCategories,
        categoryLevel: levelNum,
      });
    }

    return res.status(200).json({
      success: true,
      count: stores.length,
      data: stores,
    });
  } catch (error) {
    console.error(`Error fetching stores: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching stores",
    });
  }
};

export const getStore = async (req, res) => {
  try {
    const { idOrSlug } = req.params;

    let store;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      store = await Store.findById(idOrSlug).lean();
    } else {
      store = await Store.findBySlug(idOrSlug);
    }

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: store,
    });
  } catch (error) {
    console.error(`Error fetching store: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error fetching store",
    });
  }
};

export const updateStore = async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const { name } = req.body;
    let iconUpdated = false;

    const store = await Store.findById(idOrSlug);
    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    if (name && name !== store.name) {
      const nameExists = await Store.findOne({
        name,
        _id: { $ne: idOrSlug },
      }).lean();

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: "Store name already exists",
        });
      }

      store.name = name;
    }

    if (req.file) {
      const oldPublicId = store.icon?.public_id;

      const iconData = await uploadToCloudinary(req.file, "stores/icons");

      if (iconData) {
        store.icon = iconData;
        iconUpdated = true;

        if (oldPublicId) {
          await deleteFromCloudinary(oldPublicId);
        }
      }
    }

    await store.save();

    return res.status(200).json({
      success: true,
      data: store,
      iconUpdated,
    });
  } catch (error) {
    console.error(`Error updating store: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error updating store",
    });
  }
};

export const deleteStore = async (req, res) => {
  try {
    const { idOrSlug } = req.params;

    // Find the store by ID or slug
    let store;
    if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
      store = await Store.findById(idOrSlug);
    } else {
      store = await Store.findOne({ slug: idOrSlug });
    }

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    // Check if store has categories
    const categoriesCount = await Category.countDocuments({
      storeId: store._id,
    });
    if (categoriesCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete store with existing categories",
        data: { categoriesCount },
      });
    }

    // Delete image from Cloudinary if exists
    if (store.icon && store.icon.public_id) {
      await deleteFromCloudinary(store.icon.public_id);
    }

    await store.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Store deleted successfully",
    });
  } catch (error) {
    console.error(`Error deleting store: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Server error deleting store",
    });
  }
};
