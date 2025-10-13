import mongoose from "mongoose";
import Store from "../models/Store.js";
import Category from "../models/Category.js";
import redis from "../config/redis.js";
import crypto from "crypto";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

const invalidateStoreCache = async (storeId = null, storeSlug = null) => {
  try {
    const keysToDelete = ["stores:all", "stores:with_categories_tree"];

    for (let i = 0; i <= 10; i++) {
      keysToDelete.push(`stores:with_categories_level_${i}`);
    }

    if (storeId) {
      keysToDelete.push(`store:${storeId}`);
    }
    if (storeSlug) {
      keysToDelete.push(`store:${storeSlug}`);
    }

    await redis.del(...keysToDelete);
  } catch (e) {
  }
};

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

    await invalidateStoreCache();

    return res.status(201).json({
      success: true,
      data: store,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error creating store",
    });
  }
};

export const getStores = async (req, res) => {
  try {
    const { level, root } = req.query;

    let cacheKey = "stores:all";
    let isRootRequest = root === "true";
    let levelNum = level !== undefined ? parseInt(level) : null;

    if (isRootRequest) {
      cacheKey = "stores:with_categories_tree";
    } else if (levelNum !== null) {
      if (isNaN(levelNum) || levelNum < 0) {
        return res.status(400).json({
          success: false,
          message: "Level must be a non-negative number",
        });
      }
      cacheKey = `stores:with_categories_level_${levelNum}`;
    }

    let responseData;
    let dataHash;

    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        dataHash = crypto.createHash("md5").update(cachedData).digest("hex");
        const etag = `"${dataHash}"`;

        const clientETag = req.headers["if-none-match"];
        if (clientETag === etag) {
          return res.status(304).end();
        }

        responseData = JSON.parse(cachedData);

        res.set("ETag", etag);
        res.set("Cache-Control", "private, max-age=0, must-revalidate");
        return res.status(200).json(responseData);
      }
    } catch (e) {
  }
const stores = await Store.findAllStores();

    if (isRootRequest) {
      const storesWithCategories = await Promise.all(
        stores.map(async (store) => {
          const categories = await Category.find({
            storeId: store._id,
          })
            .select("name slug icon isLeaf childrenCount level parent")
            .sort({ level: 1, name: 1 })
            .lean();

          const buildTree = (categories) => {
            const categoryMap = new Map();
            const roots = [];

            categories.forEach((category) => {
              categoryMap.set(category._id.toString(), {
                ...category,
                children: [],
              });
            });

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

      responseData = {
        success: true,
        count: storesWithCategories.length,
        data: storesWithCategories,
        isRootRequest: true,
      };
    } else if (levelNum !== null) {
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

      responseData = {
        success: true,
        count: storesWithCategories.length,
        data: storesWithCategories,
        categoryLevel: levelNum,
      };
    } else {
      responseData = {
        success: true,
        count: stores.length,
        data: stores,
      };
    }

    const responseString = JSON.stringify(responseData);
    dataHash = crypto.createHash("md5").update(responseString).digest("hex");
    const etag = `"${dataHash}"`;

    try {
      await redis.setex(cacheKey, 900, responseString);
    } catch (e) {
  }
res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    return res.status(200).json(responseData);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error fetching stores",
    });
  }
};

export const getStore = async (req, res) => {
  try {
    const { idOrSlug } = req.params;
    const cacheKey = `store:${idOrSlug}`;

    let responseData;
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        const dataHash = crypto
          .createHash("md5")
          .update(cachedData)
          .digest("hex");
        const etag = `"${dataHash}"`;

        const clientETag = req.headers["if-none-match"];
        if (clientETag === etag) {
          return res.status(304).end();
        }

        responseData = JSON.parse(cachedData);

        res.set("ETag", etag);
        res.set("Cache-Control", "private, max-age=0, must-revalidate");
        return res.status(200).json(responseData);
      }
    } catch (e) {
  }
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

    responseData = {
      success: true,
      data: store,
    };

    const responseString = JSON.stringify(responseData);
    const dataHash = crypto
      .createHash("md5")
      .update(responseString)
      .digest("hex");
    const etag = `"${dataHash}"`;

    try {
      await redis.setex(cacheKey, 1800, responseString);
    } catch (e) {
  }
res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    return res.status(200).json(responseData);
  } catch (error) {
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

    const oldSlug = store.slug;

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

    await invalidateStoreCache(store._id, oldSlug);
    if (store.slug !== oldSlug) {
      await invalidateStoreCache(store._id, store.slug);
    }

    return res.status(200).json({
      success: true,
      data: store,
      iconUpdated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error updating store",
    });
  }
};

export const deleteStore = async (req, res) => {
  try {
    const { idOrSlug } = req.params;

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

    if (store.icon && store.icon.public_id) {
      await deleteFromCloudinary(store.icon.public_id);
    }

    const storeId = store._id;
    const storeSlug = store.slug;

    await store.deleteOne();

    await invalidateStoreCache(storeId, storeSlug);

    return res.status(200).json({
      success: true,
      message: "Store deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error deleting store",
    });
  }
};
