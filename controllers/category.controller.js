import mongoose from "mongoose";
import Category from "../models/Category.js";
import Store from "../models/Store.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

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

    const filter = {};

    const normalizedParent = parent === "null" || parent === "" ? null : parent;

    if (!storeId && parent !== undefined) {
      filter.parent = normalizedParent;
    } else if (storeId && parent === undefined) {
      filter.storeId = storeId;
      filter.parent = null;
    } else if (storeId && parent !== undefined) {
      filter.storeId = storeId;
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

    res.status(200).json({
      success: true,
      count: categories.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
      data: categories,
    });
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

    let category;
    let filter = {};

    // Check if identifier is a valid ObjectId or treat as slug
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      filter._id = identifier;
    } else {
      filter.slug = identifier;
    }

    // Add storeId to filter if provided
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

    await category.remove();

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

    res.status(200).json({
      success: true,
      data: tree,
    });
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

    const category = await Category.findOne(filter).lean();

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
    const { q, storeId, isLeaf, level, page = 1, limit = 20 } = req.query;

    const skip = (page - 1) * limit;
    const filter = {};

    if (storeId) {
      filter.storeId = storeId;
    }

    if (isLeaf !== undefined) {
      filter.isLeaf = isLeaf === "true";
    }

    if (level !== undefined) {
      filter.level = parseInt(level);
    }

    // Text search
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

    res.status(200).json({
      success: true,
      count: categories.length,
      total,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
      data: categories,
    });
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
