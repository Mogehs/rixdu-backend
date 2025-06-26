import Listing from "../models/Listing.js";
import Category from "../models/Category.js";

export const createListing = async (req, res) => {
  try {
    const { storeId, categoryId, values = {} } = req.body;

    const category = await Category.findById(categoryId).lean();
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    if (!category.isLeaf) {
      return res.status(400).json({
        success: false,
        message: "You can only create listings in leaf categories",
      });
    }

    let categoryPath = [];
    if (category.path) {
      categoryPath = category.path
        .split(",")
        .filter((id) => id)
        .map((id) => id);
      categoryPath.push(category._id);
    } else {
      categoryPath = [category._id];
      let currentCategoryId = category.parent;

      const parentCategories = currentCategoryId
        ? await Category.find({
            _id: { $in: category.path ? category.path.split(",") : [] },
          }).lean()
        : [];

      const categoriesMap = {};
      parentCategories.forEach((cat) => {
        categoriesMap[cat._id.toString()] = cat;
      });

      while (currentCategoryId) {
        const parent = categoriesMap[currentCategoryId.toString()];
        if (!parent) break;

        categoryPath.unshift(parent._id);
        currentCategoryId = parent.parent;
      }
    }

    const transformedValues = new Map();
    const validationErrors = [];

    const userValues = values || {};

    for (const field of category.fields || []) {
      const fieldName = field.name;
      const fieldValue = userValues[fieldName];

      if (
        field.required &&
        (fieldValue === undefined || fieldValue === null || fieldValue === "")
      ) {
        validationErrors.push({
          field: fieldName,
          message: `Field '${field.label}' is required`,
        });
        continue;
      }

      if (fieldValue === undefined || fieldValue === null) {
        continue;
      }

      switch (field.type) {
        case "number":
          const numValue = Number(fieldValue);
          if (isNaN(numValue)) {
            validationErrors.push({
              field: fieldName,
              message: `Field '${field.label}' must be a valid number`,
            });
          } else {
            transformedValues.set(fieldName, numValue);
          }
          break;

        case "select":
          if (field.options && !field.options.includes(fieldValue)) {
            validationErrors.push({
              field: fieldName,
              message: `Field '${
                field.label
              }' must be one of the following values: ${field.options.join(
                ", "
              )}`,
            });
          } else {
            transformedValues.set(fieldName, fieldValue);
          }
          break;

        default:
          transformedValues.set(fieldName, fieldValue);
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors,
      });
    }

    const listing = await Listing.create({
      storeId,
      categoryId,
      categoryPath,
      values: transformedValues,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      data: listing,
    });
  } catch (error) {
    console.error(`Error creating listing: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Server error while creating listing. Please try again.",
    });
  }
};

export const getListings = async (req, res) => {
  try {
    const {
      categoryId,
      storeId,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
      values = {},
      fields,
    } = req.query;
    const query = {};

    if (categoryId) {
      query.$or = [{ categoryId }, { categoryPath: { $in: [categoryId] } }];
    }

    if (storeId) query.storeId = storeId;

    Object.entries(values).forEach(([key, value]) => {
      const valueKey = `values.${key}`;

      if (
        typeof value === "object" &&
        (value.min !== undefined ||
          value.max !== undefined ||
          value.start !== undefined ||
          value.end !== undefined)
      ) {
        query[valueKey] = {};

        if (value.min !== undefined) {
          query[valueKey].$gte = Number(value.min);
        }
        if (value.max !== undefined) {
          query[valueKey].$lte = Number(value.max);
        }
        if (value.start !== undefined) {
          query[valueKey].$gte = new Date(value.start);
        }
        if (value.end !== undefined) {
          query[valueKey].$lte = new Date(value.end);
        }
      } else {
        query[valueKey] = value;
      }
    });

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20)); // Cap limit
    const skip = (pageNum - 1) * limitNum;

    const sortObj = {};
    sortObj[sort] = order === "desc" ? -1 : 1;

    const projection = {};
    if (fields) {
      fields.split(",").forEach((field) => {
        projection[field.trim()] = 1;
      });
    }

    const listings = await Listing.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(Number(limit));

    const total = await Listing.countDocuments(query);

    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      data: listings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getListing = async (req, res) => {
  try {
    const listing = await Listing.findOne({ _id: req.params.id })
      .populate("categoryId", "name fields")
      .populate("userId", "name email avatar")
      .lean();

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    res.status(200).json({
      success: true,
      data: listing,
    });
  } catch (error) {
    console.error(`Error getting listing: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Server error while fetching listing",
    });
  }
};

export const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    if (
      listing.userId.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this listing",
      });
    }

    if (
      req.body.categoryId &&
      req.body.categoryId !== listing.categoryId.toString()
    ) {
      const newCategory = await Category.findById(req.body.categoryId);

      if (!newCategory) {
        return res.status(404).json({
          success: false,
          message: "New category not found",
        });
      }

      if (!newCategory.isLeaf) {
        return res.status(400).json({
          success: false,
          message: "You can only assign listings to leaf categories",
        });
      }

      const categoryPath = [];
      let currentCategory = newCategory;
      categoryPath.unshift(currentCategory._id);

      while (currentCategory.parent) {
        currentCategory = await Category.findById(currentCategory.parent);
        if (currentCategory) {
          categoryPath.unshift(currentCategory._id);
        } else {
          break;
        }
      }

      req.body.categoryPath = categoryPath;
    }
    if (req.body.values) {
      const category = await Category.findById(
        req.body.categoryId || listing.categoryId
      );

      const transformedValues = new Map();
      const validationErrors = [];
      const userValues = req.body.values || {};

      for (const field of category.fields) {
        const fieldName = field.name;
        const fieldValue = userValues[fieldName];

        if (
          field.required &&
          (fieldValue === undefined || fieldValue === null || fieldValue === "")
        ) {
          validationErrors.push({
            field: fieldName,
            message: `Field '${field.label}' is required`,
          });
          continue;
        }

        if (fieldValue === undefined || fieldValue === null) {
          continue;
        }

        switch (field.type) {
          case "number":
            const numValue = Number(fieldValue);
            if (isNaN(numValue)) {
              validationErrors.push({
                field: fieldName,
                message: `Field '${field.label}' must be a valid number`,
              });
            } else {
              transformedValues.set(fieldName, numValue);
            }
            break;

          case "select":
            if (field.options && !field.options.includes(fieldValue)) {
              validationErrors.push({
                field: fieldName,
                message: `Field '${
                  field.label
                }' must be one of the following values: ${field.options.join(
                  ", "
                )}`,
              });
            } else {
              transformedValues.set(fieldName, fieldValue);
            }
            break;

          default:
            transformedValues.set(fieldName, fieldValue);
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: validationErrors,
        });
      }

      req.body.values = transformedValues;
    }

    const updatedListing = await Listing.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: updatedListing,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    if (
      listing.userId.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this listing",
      });
    }

    await Listing.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Listing deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getUserListings = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { userId: req.user.id };
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const listings = await Listing.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Listing.countDocuments(query);

    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      data: listings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const searchListings = async (req, res) => {
  try {
    const {
      categoryId,
      storeId,
      values,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
    } = req.query;

    const query = { status: "active" };

    if (categoryId) {
      // Allow searching by category ID or any parent in the category path
      query.$or = [{ categoryId }, { categoryPath: categoryId }];
    }

    if (storeId) query.storeId = storeId;

    // Handle dynamic values search
    if (values && typeof values === "object") {
      // Get the category to understand field types
      const category = await Category.findById(categoryId);

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      // Process each search field
      Object.entries(values).forEach(([key, value]) => {
        // Find the field definition in the category schema
        const fieldDef = category.fields.find((f) => f.name === key);

        if (fieldDef) {
          // Apply different search strategies based on field type
          switch (fieldDef.type) {
            case "number":
              // Allow range queries for numbers
              if (typeof value === "object") {
                if (value.min !== undefined && value.max !== undefined) {
                  // Range query
                  query[`values.${key}`] = {
                    $gte: Number(value.min),
                    $lte: Number(value.max),
                  };
                } else if (value.min !== undefined) {
                  query[`values.${key}`] = { $gte: Number(value.min) };
                } else if (value.max !== undefined) {
                  query[`values.${key}`] = { $lte: Number(value.max) };
                } else {
                  // Exact match
                  query[`values.${key}`] = Number(value);
                }
              } else {
                // Exact match
                query[`values.${key}`] = Number(value);
              }
              break;

            case "date":
              // Allow range queries for dates
              if (typeof value === "object") {
                if (value.start && value.end) {
                  // Date range
                  query[`values.${key}`] = {
                    $gte: new Date(value.start),
                    $lte: new Date(value.end),
                  };
                } else if (value.start) {
                  query[`values.${key}`] = { $gte: new Date(value.start) };
                } else if (value.end) {
                  query[`values.${key}`] = { $lte: new Date(value.end) };
                }
              } else {
                // Try to match specific date
                query[`values.${key}`] = new Date(value);
              }
              break;

            case "checkbox":
              // For checkboxes, search for arrays containing all selected values
              if (Array.isArray(value)) {
                query[`values.${key}`] = { $all: value };
              } else {
                // For single checkbox, search for exact match
                query[`values.${key}`] = value;
              }
              break;

            case "select":
              // For select, search for exact match
              query[`values.${key}`] = value;
              break;

            default: // text and other types
              // Use text search (case-insensitive partial match)
              query[`values.${key}`] = { $regex: value, $options: "i" };
          }
        }
      });
    }

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Sorting
    const sortObj = {};
    sortObj[sort] = order === "desc" ? -1 : 1;

    const listings = await Listing.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(Number(limit));

    const total = await Listing.countDocuments(query);

    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      data: listings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
