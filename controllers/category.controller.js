import mongoose from "mongoose";
import Category from "../models/Category.js";
import Store from "../models/Store.js";
import redis from "../config/redis.js";
import crypto from "crypto";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

const invalidateCategoryCache = async (storeId = null, categoryId = null) => {
  try {
    const keysToDelete = [];

    // Generic category cache patterns
    keysToDelete.push("categories:*");
    keysToDelete.push("category:*");
    keysToDelete.push("category_tree:*");
    keysToDelete.push("category_search:*");
    keysToDelete.push("dynamic_filters:*");

    if (storeId) {
      keysToDelete.push(`categories:store:${storeId}:*`);
      keysToDelete.push(`category_tree:${storeId}`);
      keysToDelete.push(`dynamic_filters:store:*`);
    }

    if (categoryId) {
      keysToDelete.push(`category:${categoryId}`);
    }

    // Get all matching keys and delete them
    for (const pattern of keysToDelete) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (error) {
    console.warn("Category cache invalidation error:", error.message);
  }
};

export const createCategory = async (req, res) => {
  try {
    const {
      storeId,
      name,
      parent = null,
      isLeaf = false,
      fields = [],
    } = req.body;

    const storeExists = await Store.exists({ _id: storeId });

    if (!storeExists) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    if (parent) {
      const parentExists = await Category.exists({ _id: parent });
      if (!parentExists) {
        return res.status(404).json({
          success: false,
          message: "Parent category not found",
        });
      }
    }

    const slug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const categoryExists = await Category.exists({
      storeId,
      name,
      parent,
    });

    if (categoryExists) {
      return res.status(400).json({
        success: false,
        message:
          "A category with this name already exists under the same parent",
      });
    }
    let iconData = {};
    if (req.file) {
      iconData = await uploadToCloudinary(req.file, "categories/icons");
    }

    const newCategory = await Category.create({
      storeId,
      name,
      parent,
      isLeaf,
      fields: isLeaf ? fields : [],
      slug,
      icon: iconData,
    });

    await Store.findByIdAndUpdate(storeId, {
      $inc: { "stats.categoryCount": 1 },
    });

    await invalidateCategoryCache(storeId);

    res.status(201).json({
      success: true,
      data: newCategory,
    });
  } catch (error) {
    console.error("createCategory error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating category. Please try again.",
    });
  }
};

export const getCategories = async (req, res) => {
  try {
    const { storeId, parent, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    // Generate cache key based on query parameters
    const cacheKey = `categories:store:${storeId || "all"}:parent:${
      parent || "null"
    }:page:${page}:limit:${limit}`;

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
    } catch (cacheError) {
      console.warn("Redis cache read error:", cacheError.message);
    }

    const filter = {};
    const normalizedParent = parent === "null" || parent === "" ? null : parent;

    let actualStoreId = null;
    if (storeId) {
      if (mongoose.Types.ObjectId.isValid(storeId)) {
        actualStoreId = storeId;
      } else {
        const store = await Store.findOne({ slug: storeId });
        if (!store) {
          return res.status(404).json({
            success: false,
            message: "Store not found",
          });
        }
        actualStoreId = store._id;
      }
    }

    if (!actualStoreId && parent !== undefined) {
      filter.parent = normalizedParent;
    } else if (actualStoreId && parent === undefined) {
      filter.storeId = actualStoreId;
      filter.parent = null;
    } else if (actualStoreId && parent !== undefined) {
      filter.storeId = actualStoreId;
      filter.parent = normalizedParent;
    }

    let categories;

    if (
      filter.parent !== undefined &&
      filter.parent !== null &&
      filter.storeId
    ) {
      categories = await Category.findChildren(filter.parent, filter.storeId)
        .skip(skip)
        .limit(parseInt(limit));
    } else {
      categories = await Category.find(filter)
        .select("name slug icon isLeaf childrenCount children parent level")
        .sort("name")
        .skip(skip)
        .limit(parseInt(limit))
        .lean();
    }

    const total = await Category.countDocuments(filter);

    responseData = {
      success: true,
      count: categories.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
      data: categories,
    };

    const responseString = JSON.stringify(responseData);
    const dataHash = crypto
      .createHash("md5")
      .update(responseString)
      .digest("hex");
    const etag = `"${dataHash}"`;

    try {
      await redis.setex(cacheKey, 600, responseString); // 10 minutes cache
    } catch (cacheError) {
      console.warn("Redis cache write error:", cacheError.message);
    }

    res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    res.status(200).json(responseData);
  } catch (error) {
    console.error("Fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching categories. Please try again.",
    });
  }
};

export const getCategory = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { storeId } = req.query;

    const cacheKey = `category:${identifier}:store:${storeId || "any"}`;

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
    } catch (cacheError) {
      console.warn("Redis cache read error:", cacheError.message);
    }

    let category;
    let filter = {};

    if (mongoose.Types.ObjectId.isValid(identifier)) {
      filter._id = identifier;
    } else {
      filter.slug = identifier;
    }

    if (storeId) {
      filter.storeId = storeId;
    }

    category = await Category.findOne(filter).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (category.children && category.children.length > 0) {
      const children = await Category.findChildren(
        category._id,
        category.storeId
      );
      category.childrenData = children;
    }

    responseData = {
      success: true,
      data: category,
    };

    const responseString = JSON.stringify(responseData);
    const dataHash = crypto
      .createHash("md5")
      .update(responseString)
      .digest("hex");
    const etag = `"${dataHash}"`;

    try {
      await redis.setex(cacheKey, 1200, responseString); // 20 minutes cache
    } catch (cacheError) {
      console.warn("Redis cache write error:", cacheError.message);
    }

    res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    res.status(200).json(responseData);
  } catch (error) {
    console.error("getCategory error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching category. Please try again.",
    });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { identifier } = req.params;
    const { name, isLeaf, fields } = req.body;

    let category;
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      category = await Category.findById(identifier);
    } else {
      category = await Category.findOne({ slug: identifier });
    }

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    let slug = category.slug;
    if (name && name !== category.name) {
      slug = name
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const slugExists = await Category.exists({
        slug,
        _id: { $ne: category._id },
        storeId: category.storeId,
      });

      if (slugExists) {
        slug = `${slug}-${Date.now().toString().slice(-6)}`;
      }
    }
    let iconData = category.icon;
    if (req.file) {
      try {
        if (category.icon && category.icon.public_id) {
          await deleteFromCloudinary(category.icon.public_id);
        }

        iconData = await uploadToCloudinary(req.file, "categories/icons");
        if (!iconData) {
          return res.status(400).json({
            success: false,
            message: "Error updating category icon",
          });
        }
      } catch (uploadError) {
        console.error("Icon upload error:", uploadError);
        return res.status(400).json({
          success: false,
          message: "Error updating category icon",
        });
      }
    }

    const updateData = {
      name: name || category.name,
      isLeaf: isLeaf !== undefined ? isLeaf : category.isLeaf,
      slug,
      icon: iconData,
      updatedAt: Date.now(),
    };

    if (updateData.isLeaf && fields) {
      updateData.fields = fields;
    } else if (!updateData.isLeaf) {
      updateData.fields = [];
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      category._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    await invalidateCategoryCache(category.storeId, category._id);

    res.status(200).json({
      success: true,
      data: updatedCategory,
    });
  } catch (error) {
    console.error("updateCategory error:", error);
    res.status(500).json({
      success: false,
      message: "Server error updating category. Please try again.",
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { identifier } = req.params;

    let category;
    // Check if identifier is a valid ObjectId or treat as slug
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      category = await Category.findById(identifier);
    } else {
      category = await Category.findOne({ slug: identifier });
    }

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (category.children && category.children.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete a category that has subcategories. Delete subcategories first.",
      });
    }
    if (category.icon && category.icon.public_id) {
      await deleteFromCloudinary(category.icon.public_id);
    }

    if (category.parent) {
      await Category.findByIdAndUpdate(category.parent, {
        $pull: { children: category._id },
        $inc: { childrenCount: -1 },
      });
    }
    await category.deleteOne();

    await invalidateCategoryCache(category.storeId, category._id);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCategoryTree = async (req, res) => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid store ID format",
      });
    }

    const cacheKey = `category_tree:${storeId}`;

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
    } catch (cacheError) {
      console.warn("Redis cache read error:", cacheError.message);
    }

    const categories = await Category.getFullHierarchy(storeId);

    const buildTree = (parentId = null) => {
      return categories
        .filter((category) => {
          if (parentId === null) {
            return !category.parent;
          } else {
            return (
              category.parent &&
              category.parent.toString() === parentId.toString()
            );
          }
        })
        .map((category) => ({
          _id: category._id,
          name: category.name,
          slug: category.slug,
          isLeaf: category.isLeaf,
          fields: category.fields,
          icon: category.icon,
          children: buildTree(category._id),
        }));
    };

    const tree = buildTree();

    responseData = {
      success: true,
      data: tree,
    };

    const responseString = JSON.stringify(responseData);
    const dataHash = crypto
      .createHash("md5")
      .update(responseString)
      .digest("hex");
    const etag = `"${dataHash}"`;

    try {
      await redis.setex(cacheKey, 1800, responseString); // 30 minutes cache
    } catch (cacheError) {
      console.warn("Redis cache write error:", cacheError.message);
    }

    res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    res.status(200).json(responseData);
  } catch (error) {
    console.error("getCategoryTree error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching category tree: " + error.message,
    });
  }
};

export const getCategoryPath = async (req, res) => {
  try {
    const { identifier } = req.params;
    let category;

    // Check if identifier is a valid ObjectId or treat as slug/name
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      category = await Category.findById(identifier);
    } else {
      // Try to find by slug first, then by name
      category = await Category.findOne({ slug: identifier });
      if (!category) {
        category = await Category.findOne({ name: identifier });
      }
    }

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const path = [];
    let current = category;
    let rootCategory = current;

    // Build the path from current category to root
    path.unshift({
      _id: current._id,
      name: current.name,
      slug: current.slug,
      storeId: current.storeId,
    });

    while (current.parent) {
      current = await Category.findById(current.parent);
      if (current) {
        path.unshift({
          _id: current._id,
          name: current.name,
          slug: current.slug,
          storeId: current.storeId,
        });
        rootCategory = current;
      } else {
        break;
      }
    }

    const storeId = rootCategory.storeId;

    res.status(200).json({
      success: true,
      storeId: storeId,
      data: path,
    });
  } catch (error) {
    console.error("getCategoryPath error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCategoryByStore = async (req, res) => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid store ID format",
      });
    }

    const categories = await Category.find({ storeId });

    res.status(200).json({
      success: true,
      data: { count: categories.length, categories },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCategoryBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const { storeId } = req.query;

    const filter = { slug };
    if (storeId) {
      filter.storeId = storeId;
    }

    const category = await Category.findOne(filter)
      .populate("name slug")
      .lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Get children if category has any
    if (category.children && category.children.length > 0) {
      const children = await Category.findChildren(
        category._id,
        category.storeId
      );
      category.childrenData = children;
    }

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error("getCategoryBySlug error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching category by slug. Please try again.",
    });
  }
};

export const searchCategories = async (req, res) => {
  try {
    const {
      q,
      storeSlug,
      isLeaf,
      level,
      page = 1,
      limit = 20,
      parent,
    } = req.query;

    const skip = (page - 1) * limit;

    // Generate cache key based on all query parameters
    const cacheKey = `category_search:q:${q || "none"}:store:${
      storeSlug || "all"
    }:leaf:${isLeaf || "any"}:level:${level || "any"}:parent:${
      parent || "any"
    }:page:${page}:limit:${limit}`;

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
    } catch (cacheError) {
      console.warn("Redis cache read error:", cacheError.message);
    }

    const filter = {};

    if (storeSlug) {
      const store = await Store.findOne({ slug: storeSlug }).select("_id");
      if (!store) {
        return res.status(404).json({
          success: false,
          message: "Store not found",
        });
      }
      filter.storeId = store._id;
    }

    if (isLeaf !== undefined) {
      filter.isLeaf = isLeaf === "true";
    }

    if (level !== undefined) {
      filter.level = parseInt(level);
    }

    if (parent === "null" || parent === null || parent === undefined) {
      filter.parent = null;
    } else if (parent) {
      filter.parent = parent;
    }

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { slug: { $regex: q, $options: "i" } },
      ];
    }

    const categories = await Category.find(filter)
      .select("name slug icon isLeaf childrenCount level path storeId")
      .sort({ level: 1, name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Category.countDocuments(filter);

    responseData = {
      success: true,
      count: categories.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
      data: categories,
    };

    const responseString = JSON.stringify(responseData);
    const dataHash = crypto
      .createHash("md5")
      .update(responseString)
      .digest("hex");
    const etag = `"${dataHash}"`;

    try {
      await redis.setex(cacheKey, 300, responseString); // 5 minutes cache for search results
    } catch (cacheError) {
      console.warn("Redis cache write error:", cacheError.message);
    }

    res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    res.status(200).json(responseData);
  } catch (error) {
    console.error("searchCategories error:", error);
    res.status(500).json({
      success: false,
      message: "Server error searching categories. Please try again.",
    });
  }
};

export const getCategoryChildren = async (req, res) => {
  try {
    const { slug } = req.params;
    const { storeId, page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const filter = { slug };
    if (storeId) {
      filter.storeId = storeId;
    }

    const category = await Category.findOne(filter).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const children = await Category.find({
      parent: category._id,
      storeId: category.storeId,
    })
      .select("name slug icon isLeaf childrenCount level")
      .sort("name")
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Category.countDocuments({
      parent: category._id,
      storeId: category.storeId,
    });

    res.status(200).json({
      success: true,
      parentCategory: {
        _id: category._id,
        name: category.name,
        slug: category.slug,
      },
      count: children.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
      data: children,
    });
  } catch (error) {
    console.error("getCategoryChildren error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching category children. Please try again.",
    });
  }
};

// Helper function to find all leaf categories that are descendants of a parent category
// If parentId is null, returns all leaf categories in the store
const findAllLeafChildren = async (parentId, storeId) => {
  // If parentId is null, return all leaf categories in the store
  if (parentId === null || parentId === undefined) {
    return await Category.find({
      storeId: storeId,
      isLeaf: true,
    });
  }

  const allDescendants = [];

  // Recursive function to get all descendants
  const getDescendants = async (categoryId) => {
    const children = await Category.find({ parent: categoryId, storeId });

    for (const child of children) {
      allDescendants.push(child);
      // Recursively get children of this child
      await getDescendants(child._id);
    }
  };

  await getDescendants(parentId);

  // Filter only leaf categories
  return allDescendants.filter((category) => category.isLeaf);
};

// Helper function to find all leaf categories in a store
const findAllLeafCategoriesInStore = async (storeId) => {
  return await Category.find({
    storeId: storeId,
    isLeaf: true,
  });
};

// Helper function to recursively collect all leaf category fields
const collectLeafCategoryFields = async (categoryId, storeId) => {
  const fieldsMap = new Map();

  const processCategory = async (catId) => {
    const category = await Category.findById(catId).lean();

    if (!category) return;

    if (category.isLeaf && category.fields && category.fields.length > 0) {
      // Process fields from leaf category
      category.fields.forEach((field) => {
        if (!fieldsMap.has(field.name)) {
          fieldsMap.set(field.name, {
            name: field.name,
            type: field.type,
            options: field.options || [],
            required: field.required || false,
            accept: field.accept,
            multiple: field.multiple || false,
            maxSize: field.maxSize,
            maxFiles: field.maxFiles,
            minFiles: field.minFiles,
            categories: [],
          });
        }

        // Add category info to the field
        fieldsMap.get(field.name).categories.push({
          _id: category._id,
          name: category.name,
          slug: category.slug,
        });

        // Merge options if they exist
        if (field.options && field.options.length > 0) {
          const existingField = fieldsMap.get(field.name);
          const allOptions = [
            ...new Set([...existingField.options, ...field.options]),
          ];
          existingField.options = allOptions;
        }
      });
    }

    // Process children
    if (category.children && category.children.length > 0) {
      for (const childId of category.children) {
        await processCategory(childId);
      }
    }
  };

  await processCategory(categoryId);
  return Array.from(fieldsMap.values());
};

// API to get dynamic filter fields from category hierarchy
export const getDynamicFilterFields = async (req, res) => {
  try {
    const { categorySlug, storeSlug } = req.params;

    // Generate cache key
    const cacheKey = `dynamic_filters:store:${storeSlug}:category:${categorySlug}`;

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
    } catch (cacheError) {
      console.warn("Redis cache read error:", cacheError.message);
    }

    // Find store by slug
    const store = await Store.findOne({ slug: storeSlug }).lean();
    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    // Find category by slug within the store
    const category = await Category.findOne({
      slug: categorySlug,
      storeId: store._id,
    }).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found in the specified store",
      });
    }

    let allFields = [];

    // Common fields to exclude from filters (these are typically displayed in listings)
    const excludedFields = ["title", "description"];

    if (category.isLeaf) {
      // If it's a leaf category, get its fields
      if (category.fields && category.fields.length > 0) {
        allFields = category.fields
          .filter((field) => !excludedFields.includes(field.name.toLowerCase()))
          .map((field) => ({
            name: field.name,
            type: field.type,
            options: field.options || [],
            required: field.required || false,
            accept: field.accept,
            multiple: field.multiple || false,
            maxSize: field.maxSize,
            maxFiles: field.maxFiles,
            minFiles: field.minFiles,
            categories: [
              {
                _id: category._id,
                name: category.name,
                slug: category.slug,
              },
            ],
          }));
      }
    } else {
      // If it has children, traverse and collect all leaf category fields
      allFields = await collectLeafCategoryFields(category._id, store._id);

      // Filter out excluded fields
      allFields = allFields.filter(
        (field) => !excludedFields.includes(field.name.toLowerCase())
      );
    }

    // Process fields for dynamic filter generation
    const filterableFields = allFields.map((field) => {
      const filterField = {
        name: field.name,
        type: field.type,
        filterType: getFilterType(field.type),
        options: field.options || [],
        multiple: field.multiple || false,
        categories: field.categories || [],
      };

      // Add specific properties based on field type
      if (field.type === "select" || field.type === "radio") {
        filterField.hasOptions = true;
      }

      if (field.type === "number") {
        filterField.supportsRange = true;
      }

      if (field.type === "date") {
        filterField.supportsDateRange = true;
      }

      return filterField;
    });

    // Group fields by type for better organization
    const groupedFields = {
      select: filterableFields.filter(
        (f) => f.type === "select" || f.type === "radio"
      ),
      range: filterableFields.filter((f) => f.type === "number"),
      date: filterableFields.filter((f) => f.type === "date"),
      checkbox: filterableFields.filter((f) => f.type === "checkbox"),
      text: filterableFields.filter(
        (f) => f.type === "text" || f.type === "input"
      ),
    };

    responseData = {
      success: true,
      store: {
        _id: store._id,
        name: store.name,
        slug: store.slug,
      },
      category: {
        _id: category._id,
        name: category.name,
        slug: category.slug,
        isLeaf: category.isLeaf,
        level: category.level,
      },
      data: {
        fields: filterableFields,
        groupedFields,
        totalFields: filterableFields.length,
        fieldTypes: Object.keys(groupedFields).filter(
          (key) => groupedFields[key].length > 0
        ),
      },
    };

    const responseString = JSON.stringify(responseData);
    const dataHash = crypto
      .createHash("md5")
      .update(responseString)
      .digest("hex");
    const etag = `"${dataHash}"`;

    try {
      await redis.setex(cacheKey, 1800, responseString); // 30 minutes cache
    } catch (cacheError) {
      console.warn("Redis cache write error:", cacheError.message);
    }

    res.set("ETag", etag);
    res.set("Cache-Control", "private, max-age=0, must-revalidate");
    res.status(200).json(responseData);
  } catch (error) {
    console.error("getDynamicFilterFields error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching dynamic filter fields. Please try again.",
    });
  }
};

// Helper function to determine filter type based on field type
const getFilterType = (fieldType) => {
  const filterTypeMap = {
    select: "dropdown",
    radio: "radio",
    checkbox: "checkbox",
    number: "range",
    date: "daterange",
    text: "search",
    input: "search",
  };

  return filterTypeMap[fieldType] || "search";
};

// API to update fields for all leaf children of a parent category OR all leaf categories in a store
export const updateFieldsForAllLeafChildren = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { fields } = req.body;
    console.log(categoryId, fields);

    // Validate categoryId
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    // Validate fields
    if (!fields || !Array.isArray(fields)) {
      return res.status(400).json({
        success: false,
        message: "Fields must be provided as an array",
      });
    }

    // First, try to find as a category
    let parentCategory = await Category.findById(categoryId);
    let store = null;
    let leafChildren = [];
    let entityType = "";
    let entityName = "";
    let storeId = null;

    if (parentCategory) {
      // It's a category ID
      entityType = "category";
      entityName = parentCategory.name;
      storeId = parentCategory.storeId;

      // If this category itself is a leaf, include it and its descendants
      if (parentCategory.isLeaf) {
        leafChildren = [parentCategory];
      } else {
        // Find all leaf children of this category
        leafChildren = await findAllLeafChildren(
          categoryId,
          parentCategory.storeId
        );
      }
    } else {
      // Try to find as a store
      store = await Store.findById(categoryId);

      if (!store) {
        return res.status(404).json({
          success: false,
          message: "Neither category nor store found with the provided ID",
        });
      }

      // It's a store ID - find all leaf categories in this store
      entityType = "store";
      entityName = store.name;
      storeId = store._id;

      // Find all leaf categories in this store (including top-level ones with no parent)
      leafChildren = await findAllLeafCategoriesInStore(store._id);
    }

    if (leafChildren.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No leaf categories found in this ${entityType}`,
        updatedCount: 0,
        updatedCategories: [],
        entityType,
        entityName,
      });
    }

    // Update fields for all leaf children
    const updatePromises = leafChildren.map(async (leafCategory) => {
      leafCategory.fields = fields;
      await leafCategory.save();
      return {
        _id: leafCategory._id,
        name: leafCategory.name,
        slug: leafCategory.slug,
      };
    });

    const updatedCategories = await Promise.all(updatePromises);

    // Invalidate cache for affected categories
    await invalidateCategoryCache(storeId);

    res.status(200).json({
      success: true,
      message: `Successfully updated fields for ${updatedCategories.length} leaf categories in ${entityType} "${entityName}"`,
      updatedCount: updatedCategories.length,
      updatedCategories,
      entityType,
      entityName,
      parentInfo:
        entityType === "category"
          ? {
              _id: parentCategory._id,
              name: parentCategory.name,
              slug: parentCategory.slug,
            }
          : {
              _id: store._id,
              name: store.name,
              slug: store.slug,
            },
    });
  } catch (error) {
    console.error("updateFieldsForAllLeafChildren error:", error);
    res.status(500).json({
      success: false,
      message:
        "Server error updating fields for leaf categories. Please try again.",
    });
  }
};
