import mongoose from "mongoose";
import Listing from "../models/Listing.js";
import Category from "../models/Category.js";
import Profile from "../models/Profile.js";
import Store from "../models/Store.js";
import {
  resolveChannelsForUserStore,
  createAndDispatchNotification,
  buildNotification,
  notifyStoreSubscribersOnListing,
} from "./notification.controller.js";
import { getIO } from "../utils/socket.js";

const selectPrimaryImage = (listing) => {
  try {
    const v = listing?.values;
    if (!v) return null;
    const read = (key) => {
      try {
        if (typeof v.get === "function") return v.get(key);
        return v[key];
      } catch {
        return undefined;
      }
    };
    const pickUrl = (item) => {
      if (!item) return null;
      if (typeof item === "string") return item;
      if (item.url) return item.url;
      if (item.secure_url) return item.secure_url;
      return null;
    };
    const fields = [
      "images",
      "photos",
      "gallery",
      "image",
      "thumbnail",
      "cover",
      "banner",
      "files",
      "file",
    ];
    for (const key of fields) {
      const val = read(key);
      if (!val) continue;
      if (Array.isArray(val)) {
        for (const it of val) {
          if (
            it?.mimeType?.startsWith?.("image/") ||
            it?.url ||
            it?.secure_url
          ) {
            const u = pickUrl(it);
            if (u) return u;
          }
        }
      } else {
        if (
          val?.mimeType?.startsWith?.("image/") ||
          val?.url ||
          typeof val === "string"
        ) {
          const u = pickUrl(val);
          if (u) return u;
        }
      }
    }
  } catch {
    // ignore image extraction errors
  }
  return null;
};

const getListingTitle = (listing) => {
  try {
    const v = listing?.values;
    if (!v) return "Listing";
    const read = (key) => {
      try {
        if (typeof v.get === "function") return v.get(key);
        return v[key];
      } catch {
        return undefined;
      }
    };
    return (
      (read("title") && String(read("title"))) ||
      (read("name") && String(read("name"))) ||
      "Listing"
    );
  } catch {
    return "Listing";
  }
};

const formatNumber = (n) => {
  try {
    const num = Number(n);
    if (Number.isFinite(num)) return new Intl.NumberFormat().format(num);
  } catch {
    // ignore number formatting fallback
  }
  return n;
};

const buildListingDetails = (listing, storeName) => {
  const details = [];
  const v = listing?.values;
  const read = (key) => {
    try {
      if (typeof v?.get === "function") return v.get(key);
      return v?.[key];
    } catch {
      return undefined;
    }
  };
  // Price / Salary detection
  const priceKeys = ["price", "amount", "budget", "rent", "salary"];
  let priceVal;
  for (const k of priceKeys) {
    const val = read(k);
    if (val !== undefined && val !== null && val !== "") {
      priceVal = val;
      break;
    }
  }
  const currency = read("currency") || read("unit") || "";
  if (priceVal !== undefined) {
    const formatted = `${currency ? currency + " " : ""}${formatNumber(
      priceVal
    )}`.trim();
    details.push({ label: "Price", value: formatted });
  }
  if (listing?.city) details.push({ label: "City", value: listing.city });
  if (storeName) details.push({ label: "Store", value: storeName });
  const metaLine = details.map((d) => d.value).join(" • ");
  return { details, metaLine };
};

export const createListing = async (req, res) => {
  try {
    const { storeId, categoryId, values = {}, city } = req.body;

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
        case "number": {
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
        }

        case "select": {
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
        }

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

    // Create the listing
    const listing = await Listing.create({
      storeId,
      categoryId,
      categoryPath,
      values: transformedValues,
      userId: req.user.id,
      city,
    });

    const store = await Store.findById(storeId).lean();
    const categoryNames = await Category.find({
      _id: { $in: categoryPath },
    })
      .select("name")
      .lean();

    const hiringRegex = /i\s*('|’)?\s*(a|’)?m\s*hir[a-z]{2,}/i;
    const hasHiringCategory = categoryNames.some((cat) =>
      hiringRegex.test(cat.name || "")
    );

    const isJobStore = store?.name?.toLowerCase() === "jobs";
    const isHealthCareStore =
      store?.name &&
      (/health.*care|care.*health/i.test(store.name) ||
        /health/i.test(store.name) ||
        /care/i.test(store.name) ||
        (store.slug &&
          (/health.*care|care.*health/i.test(store.slug) ||
            /health/i.test(store.slug) ||
            /care/i.test(store.slug))));

    if (!isJobStore && !isHealthCareStore) {
      await Profile.findOneAndUpdate(
        { user: req.user.id },
        {
          $addToSet: {
            "public.ads": listing._id,
          },
        },
        { upsert: true, new: true }
      );
    } else if (hasHiringCategory) {
      await Profile.findOneAndUpdate(
        { user: req.user.id },
        {
          $addToSet: {
            "public.jobPosts": listing._id,
          },
        },
        { upsert: true, new: true }
      );
    }

    try {
      const channels = await resolveChannelsForUserStore(req.user.id, storeId);
      const ownerChannels = {
        ...channels,
        inApp: false,
        push: false,
      };

      const primaryImage = selectPrimaryImage(listing);
      const listingTitle = getListingTitle(listing);
      const { details, metaLine } = buildListingDetails(listing, store?.name);
      const payload = buildNotification({
        userId: req.user.id,
        title: listingTitle,
        message: metaLine || listingTitle,
        type: "listing_created",
        storeId,
        listingId: listing._id,
        channels: ownerChannels,
        metadata: {
          toEmail: req.user.email,
          slug: listing?.slug,
          image: primaryImage || undefined,
          details,
          metaLine,
        },
      });

      const io = getIO();
      await createAndDispatchNotification(payload, io);
      await notifyStoreSubscribersOnListing({
        storeId,
        listing,
        storeName: store?.name,
        io,
        extraUsers: [],
      });
    } catch (e) {
      console.error("Notification dispatch error:", e?.message || e);
    }

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
      fields,
    } = req.query;

    const query = {};

    // Find and exclude "jobs" stores and health/care stores
    const excludedStores = await Store.find(
      {
        $or: [
          { name: /jobs/i },
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
        ],
      },
      "_id"
    ).lean();
    const excludedStoreIds = excludedStores.map((store) => store._id);

    // Basic category filtering
    if (categoryId) {
      let actualCategoryId = categoryId;

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        const category = await Category.findOne({ slug: categoryId });
        if (!category) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }
        actualCategoryId = category._id;
      }

      query.$or = [
        { categoryId: actualCategoryId },
        { categoryPath: { $in: [actualCategoryId] } },
      ];
    }

    // Basic store filtering
    if (storeId) {
      let actualStoreId = storeId;

      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        const store = await Store.findOne({ slug: storeId });
        if (!store) {
          return res.status(404).json({
            success: false,
            message: "Store not found",
          });
        }
        actualStoreId = store._id;
      }

      query.storeId = actualStoreId;
    } else if (excludedStoreIds.length > 0) {
      query.storeId = { $nin: excludedStoreIds };
    }

    // Pagination
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortObj = {};
    sortObj[sort] = order === "desc" ? -1 : 1;

    // Field projection
    const projection = {};
    if (fields) {
      fields.split(",").forEach((field) => {
        projection[field.trim()] = 1;
      });
    }

    // Execute query
    const listings = await Listing.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .select(Object.keys(projection).length ? projection : {});

    const total = await Listing.countDocuments(query);

    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
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
    const { id } = req.params;

    console.log("Fetching listing with ID or slug:", id);
    let query = {};

    if (mongoose.Types.ObjectId.isValid(id)) {
      query._id = id;
    } else {
      query.slug = id;
    }

    const listing = await Listing.findOne(query)
      .populate("categoryId", "name slug fields")
      .populate("userId", "name email")
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
    const listingIdOrSlug = req.params.id;

    let listing;

    // Try to find listing by ObjectId or slug
    if (mongoose.Types.ObjectId.isValid(listingIdOrSlug)) {
      listing = await Listing.findById(listingIdOrSlug);
    }

    if (!listing) {
      listing = await Listing.findOne({ slug: listingIdOrSlug });
    }

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

      const transformedValues = new Map(listing.values || new Map());
      const validationErrors = [];
      const userValues = req.body.values || {};

      // Handle retainedFiles - these are files that should be kept
      let retainedFiles = {};
      if (req.body.retainedFiles) {
        try {
          retainedFiles = JSON.parse(req.body.retainedFiles);
          console.log("Parsed retainedFiles:", retainedFiles);
        } catch (err) {
          console.error("Error parsing retainedFiles:", err);
        }
      }

      console.log("userValues (new files from middleware):", userValues);
      console.log("retainedFiles (files to keep):", retainedFiles);

      // Handle file and image fields specially
      for (const field of category.fields || []) {
        if (field.type === "file" || field.type === "image") {
          const fieldName = field.name;
          const newFieldValue = userValues[fieldName]; // New uploaded files (processed by middleware)
          const retainedFieldFiles = retainedFiles[fieldName] || []; // Files to keep

          // Combine retained files with new files
          let finalFieldValue = null;

          if (retainedFieldFiles.length > 0) {
            if (field.multiple) {
              // For multiple files, start with retained files
              finalFieldValue = [...retainedFieldFiles];

              // Add new files if any
              if (newFieldValue) {
                if (Array.isArray(newFieldValue)) {
                  finalFieldValue = [...finalFieldValue, ...newFieldValue];
                } else {
                  finalFieldValue.push(newFieldValue);
                }
              }
            } else {
              // For single file, use new file if uploaded, otherwise use retained file
              if (newFieldValue) {
                finalFieldValue = newFieldValue;
              } else {
                finalFieldValue = retainedFieldFiles[0];
              }
            }
          } else if (newFieldValue) {
            // No retained files, just use new files
            finalFieldValue = newFieldValue;
          }
          // If neither retained nor new files, finalFieldValue remains null

          // Update the transformed values
          if (finalFieldValue !== null) {
            transformedValues.set(fieldName, finalFieldValue);
          } else {
            // Remove the field if no files
            transformedValues.delete(fieldName);
          }

          // Validate required file fields
          if (
            field.required &&
            (!finalFieldValue ||
              (Array.isArray(finalFieldValue) && finalFieldValue.length === 0))
          ) {
            validationErrors.push({
              field: fieldName,
              message: `Field '${field.label}' is required`,
            });
          }
        }
      }

      // Process non-file fields
      for (const fieldName in userValues) {
        const fieldValue = userValues[fieldName];
        const field = category.fields.find((f) => f.name === fieldName);

        if (!field) {
          continue;
        }

        // Skip file fields as they're handled above
        if (field.type === "file" || field.type === "image") {
          continue;
        }

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
          // For non-file fields, remove if explicitly set to null/undefined
          transformedValues.delete(fieldName);
          continue;
        }

        switch (field.type) {
          case "number": {
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
          }

          case "select": {
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
          }

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
      listing._id,
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

    await Profile.findOneAndUpdate(
      { user: listing.userId },
      {
        $pull: {
          "public.ads": listing._id,
          "public.jobPosts": listing._id,
        },
      }
    );

    // 🧹 Remove listing ID from all users' applications when a job is deleted
    await Profile.updateMany(
      {},
      {
        $pull: {
          "public.applications": listing._id,
        },
      }
    );

    // 🗑 Delete the listing
    await Listing.findByIdAndDelete(listing._id);

    res.status(200).json({
      success: true,
      message: "Listing deleted successfully",
    });
  } catch (error) {
    console.error(`Delete error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Server error while deleting listing. Please try again.",
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

export const getJobsListings = async (req, res) => {
  try {
    const {
      categoryId,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
      values = {},
      fields,
    } = req.query;

    // Find jobs stores but exclude health/care stores
    const jobsStores = await Store.find(
      {
        name: /jobs/i,
        $nor: [
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
        ],
      },
      "_id"
    ).lean();
    const jobsStoreIds = jobsStores.map((store) => store._id);

    if (jobsStoreIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No jobs store found",
      });
    }

    const hiringCategories = await Category.find(
      {
        $or: [{ name: /hiring/i }, { slug: /hiring/i }],
      },
      "_id"
    ).lean();

    const hiringCategoryIds = hiringCategories.map((cat) => cat._id);

    const query = {
      storeId: { $in: jobsStoreIds },
    };

    if (categoryId) {
      let actualCategoryId = categoryId;
      let targetCategory = null;

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        targetCategory = await Category.findOne({
          slug: categoryId,
          storeId: { $in: jobsStoreIds },
        });
        if (!targetCategory) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }
        actualCategoryId = targetCategory._id;
      } else {
        targetCategory = await Category.findById(actualCategoryId);
        if (!targetCategory) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }
      }

      let categoryIdsToFilter = [actualCategoryId];

      // If the category has children, include all descendant categories
      if (!targetCategory.isLeaf && targetCategory.childrenCount > 0) {
        const childCategories = await Category.find(
          {
            $or: [
              { parent: actualCategoryId },
              { path: { $regex: actualCategoryId.toString() } },
            ],
            storeId: { $in: jobsStoreIds },
          },
          "_id"
        ).lean();

        console.log(
          `Found ${childCategories.length} child categories:`,
          childCategories
        );

        const childCategoryIds = childCategories.map((cat) => cat._id);
        categoryIdsToFilter = [...categoryIdsToFilter, ...childCategoryIds];
      }

      console.log(`Category IDs to filter:`, categoryIdsToFilter);

      if (hiringCategoryIds.length > 0) {
        query.$and = [
          {
            $or: [
              { categoryId: { $in: categoryIdsToFilter } },
              { categoryPath: { $in: categoryIdsToFilter } },
            ],
          },
          {
            $or: [
              { categoryId: { $in: hiringCategoryIds } },
              { categoryPath: { $in: hiringCategoryIds } },
            ],
          },
        ];
      } else {
        query.$or = [
          { categoryId: { $in: categoryIdsToFilter } },
          { categoryPath: { $in: categoryIdsToFilter } },
        ];
      }
    } else if (hiringCategoryIds.length > 0) {
      query.$or = [
        { categoryId: { $in: hiringCategoryIds } },
        { categoryPath: { $in: hiringCategoryIds } },
      ];
    }

    // Process value filters
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
      .populate({ path: "categoryId", select: "name slug icon" })
      .sort(sortObj)
      .skip(skip)
      .limit(Number(limit))
      .select(Object.keys(projection).length ? projection : {});

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

export const getHealthcareListingsByCategory = async (req, res) => {
  try {
    const {
      categorySlug,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
      values = {},
      fields,
    } = req.query;

    // Get categorySlug from params if not in query
    const categoryIdentifier = categorySlug || req.params.categorySlug;

    if (!categoryIdentifier) {
      return res.status(400).json({
        success: false,
        message: "Category slug is required",
      });
    }

    // Find healthcare stores only
    const healthcareStores = await Store.find(
      {
        $or: [
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
        ],
      },
      "_id"
    ).lean();
    const healthcareStoreIds = healthcareStores.map((store) => store._id);

    if (healthcareStoreIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No healthcare store found",
      });
    }

    // Find the target category by slug within healthcare stores
    const targetCategory = await Category.findOne({
      slug: categoryIdentifier,
      storeId: { $in: healthcareStoreIds },
    });

    if (!targetCategory) {
      return res.status(404).json({
        success: false,
        message: "Healthcare category not found",
      });
    }

    let categoryIdsToFilter = [targetCategory._id];

    // If the category has children, include all descendant categories
    if (!targetCategory.isLeaf && targetCategory.childrenCount > 0) {
      console.log(`Finding child categories for parent: ${targetCategory._id}`);

      const childCategories = await Category.find(
        {
          $or: [
            { parent: targetCategory._id },
            { path: { $regex: targetCategory._id.toString() } },
          ],
          storeId: { $in: healthcareStoreIds },
        },
        "_id"
      ).lean();

      console.log(
        `Found ${childCategories.length} child categories:`,
        childCategories
      );

      const childCategoryIds = childCategories.map((cat) => cat._id);
      categoryIdsToFilter = [...categoryIdsToFilter, ...childCategoryIds];
    }

    // Build query for healthcare stores with category filtering
    const query = {
      storeId: { $in: healthcareStoreIds },
      $or: [
        { categoryId: { $in: categoryIdsToFilter } },
        { categoryPath: { $in: categoryIdsToFilter } },
      ],
    };

    // Process additional value filters
    if (values && typeof values === "object") {
      Object.entries(values).forEach(([key, value]) => {
        if (key === "search" && typeof value === "string" && value.trim()) {
          // Handle search across multiple fields
          const searchRegex = new RegExp(value.trim(), "i");
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              { "values.doctorName": searchRegex },
              { "values.name": searchRegex },
              { "values.title": searchRegex },
              { "values.specialty": searchRegex },
              { "values.services": searchRegex },
              { "values.about": searchRegex },
            ],
          });
        } else if (
          key === "city" &&
          typeof value === "string" &&
          value.trim() &&
          value !== "all"
        ) {
          // Handle city filter
          const cityRegex = new RegExp(value.trim().replace(/-/g, "\\s*"), "i");
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              { "values.city": cityRegex },
              { "values.location.address": cityRegex },
              { city: cityRegex },
            ],
          });
        } else if (key === "verified" && (value === "true" || value === true)) {
          // Handle verified filter
          query["values.verified"] = true;
        } else {
          // Handle other value filters
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
        }
      });
    }

    console.log(
      `Final healthcare category query:`,
      JSON.stringify(query, null, 2)
    );

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sortObj = {};
    // Handle special sorting cases
    if (sort === "verified") {
      sortObj["values.verified"] = order === "desc" ? -1 : 1;
      sortObj["createdAt"] = -1; // Secondary sort by creation date
    } else {
      sortObj[sort] = order === "desc" ? -1 : 1;
    }

    const projection = {};
    if (fields) {
      fields.split(",").forEach((field) => {
        projection[field.trim()] = 1;
      });
    }

    const listings = await Listing.find(query)
      .populate({ path: "categoryId", select: "name slug icon" })
      .sort(sortObj)
      .skip(skip)
      .limit(Number(limit))
      .select(Object.keys(projection).length ? projection : {});

    const total = await Listing.countDocuments(query);

    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      category: {
        name: targetCategory.name,
        slug: targetCategory.slug,
        isLeaf: targetCategory.isLeaf,
        childrenCount: targetCategory.childrenCount || 0,
      },
      data: listings,
    });
  } catch (error) {
    console.error("Error fetching healthcare listings by category:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getHealthcareListings = async (req, res) => {
  try {
    const {
      categoryId,
      categorySlug,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
      values = {},
      fields,
    } = req.query;

    // Find healthcare stores
    const healthcareStores = await Store.find(
      {
        $or: [
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
        ],
      },
      "_id"
    ).lean();
    const healthcareStoreIds = healthcareStores.map((store) => store._id);

    if (healthcareStoreIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No healthcare store found",
      });
    }

    // Find healthcare-related categories
    const healthcareCategories = await Category.find(
      {
        $or: [
          { name: /health/i },
          { name: /care/i },
          { name: /medical/i },
          { name: /clinic/i },
          { name: /hospital/i },
          { name: /doctor/i },
          { name: /nurse/i },
          { name: /pharmacy/i },
          { name: /therapy/i },
          { name: /wellness/i },
          { slug: /health/i },
          { slug: /care/i },
          { slug: /medical/i },
          { slug: /clinic/i },
          { slug: /hospital/i },
          { slug: /doctor/i },
          { slug: /nurse/i },
          { slug: /pharmacy/i },
          { slug: /therapy/i },
          { slug: /wellness/i },
        ],
      },
      "_id"
    ).lean();

    const healthcareCategoryIds = healthcareCategories.map((cat) => cat._id);

    const query = {
      storeId: { $in: healthcareStoreIds },
    };

    // Handle category filtering (by ID or slug)
    const categoryFilter = categoryId || categorySlug;
    if (categoryFilter) {
      let actualCategoryId = categoryFilter;
      let targetCategory = null;

      // Check if it's an ObjectId or slug
      if (!mongoose.Types.ObjectId.isValid(categoryFilter)) {
        // It's a slug, find the category
        targetCategory = await Category.findOne({
          slug: categoryFilter,
          storeId: { $in: healthcareStoreIds },
        });
        if (!targetCategory) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }
        actualCategoryId = targetCategory._id;
      } else {
        // It's an ObjectId
        targetCategory = await Category.findById(actualCategoryId);
        if (!targetCategory) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }
      }

      let categoryIdsToFilter = [actualCategoryId];

      // If the category has children, include all descendant categories
      if (!targetCategory.isLeaf && targetCategory.childrenCount > 0) {
        console.log(`Finding child categories for parent: ${actualCategoryId}`);

        const childCategories = await Category.find(
          {
            $or: [
              { parent: actualCategoryId },
              { path: { $regex: actualCategoryId.toString() } },
            ],
            storeId: { $in: healthcareStoreIds },
          },
          "_id"
        ).lean();

        console.log(
          `Found ${childCategories.length} child categories:`,
          childCategories
        );

        const childCategoryIds = childCategories.map((cat) => cat._id);
        categoryIdsToFilter = [...categoryIdsToFilter, ...childCategoryIds];
      }

      // Apply category filter
      if (healthcareCategoryIds.length > 0) {
        query.$and = [
          {
            $or: [
              { categoryId: { $in: categoryIdsToFilter } },
              { categoryPath: { $in: categoryIdsToFilter } },
            ],
          },
          {
            $or: [
              { categoryId: { $in: healthcareCategoryIds } },
              { categoryPath: { $in: healthcareCategoryIds } },
            ],
          },
        ];
      } else {
        query.$or = [
          { categoryId: { $in: categoryIdsToFilter } },
          { categoryPath: { $in: categoryIdsToFilter } },
        ];
      }
    } else if (healthcareCategoryIds.length > 0) {
      query.$or = [
        { categoryId: { $in: healthcareCategoryIds } },
        { categoryPath: { $in: healthcareCategoryIds } },
      ];
    }

    // Process value filters
    if (values && typeof values === "object") {
      Object.entries(values).forEach(([key, value]) => {
        if (key === "search" && typeof value === "string" && value.trim()) {
          // Handle search across multiple fields
          const searchRegex = new RegExp(value.trim(), "i");
          query.$or = query.$or || [];
          query.$or.push(
            { "values.doctorName": searchRegex },
            { "values.name": searchRegex },
            { "values.title": searchRegex },
            { "values.specialty": searchRegex },
            { "values.services": searchRegex },
            { "values.about": searchRegex },
            { "categoryId.name": searchRegex }
          );
        } else if (
          key === "city" &&
          typeof value === "string" &&
          value.trim() &&
          value !== "all"
        ) {
          // Handle city filter
          const cityRegex = new RegExp(value.trim().replace(/-/g, "\\s*"), "i");
          query.$or = query.$or || [];
          query.$or.push(
            { "values.city": cityRegex },
            { "values.location.address": cityRegex },
            { city: cityRegex }
          );
        } else if (key === "verified" && (value === "true" || value === true)) {
          // Handle verified filter
          query["values.verified"] = true;
        } else {
          // Handle other value filters
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
        }
      });
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20)); // Cap limit
    const skip = (pageNum - 1) * limitNum;

    const sortObj = {};
    // Handle special sorting cases
    if (sort === "verified") {
      sortObj["values.verified"] = order === "desc" ? -1 : 1;
      sortObj["createdAt"] = -1; // Secondary sort by creation date
    } else {
      sortObj[sort] = order === "desc" ? -1 : 1;
    }

    const projection = {};
    if (fields) {
      fields.split(",").forEach((field) => {
        projection[field.trim()] = 1;
      });
    }

    const listings = await Listing.find(query)
      .populate({ path: "categoryId", select: "name slug icon" })
      .sort(sortObj)
      .skip(skip)
      .limit(Number(limit))
      .select(Object.keys(projection).length ? projection : {});

    const total = await Listing.countDocuments(query);

    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      data: listings,
    });
  } catch (error) {
    console.error("Error fetching healthcare listings:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const searchListings = async (req, res) => {
  try {
    const {
      values = {},
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
      fields,
    } = req.query;

    const { storeSlug, categorySlug } = req.params;

    const query = {};

    // ===== Exclude default stores (jobs, health, care) =====
    const excludedStores = await Store.find(
      {
        $or: [
          { name: /jobs/i },
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
        ],
      },
      "_id"
    ).lean();

    const excludedStoreIds = excludedStores.map((s) => s._id);

    let targetStore = null;
    let targetCategory = null;

    // ===== Store filtering =====
    if (storeSlug) {
      targetStore = mongoose.Types.ObjectId.isValid(storeSlug)
        ? await Store.findById(storeSlug)
        : await Store.findOne({ slug: storeSlug });

      if (!targetStore) {
        return res
          .status(404)
          .json({ success: false, message: "Store not found" });
      }
      query.storeId = targetStore._id;
    } else {
      query.storeId = { $nin: excludedStoreIds };
    }

    // ===== Category filtering =====
    if (categorySlug) {
      targetCategory = mongoose.Types.ObjectId.isValid(categorySlug)
        ? await Category.findById(categorySlug)
        : await Category.findOne({
            slug: categorySlug,
            ...(targetStore && { storeId: targetStore._id }),
          });

      if (!targetCategory) {
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });
      }

      const categoryIdsToFilter = [targetCategory._id];

      if (!targetCategory.isLeaf && targetCategory.childrenCount > 0) {
        const childCategories = await Category.find(
          {
            $or: [
              { parent: targetCategory._id },
              { path: { $in: [targetCategory._id] } },
            ],
            ...(targetStore && { storeId: targetStore._id }),
          },
          "_id"
        ).lean();

        categoryIdsToFilter.push(...childCategories.map((c) => c._id));
      }

      query.$or = [
        { categoryId: { $in: categoryIdsToFilter } },
        { categoryPath: { $in: categoryIdsToFilter } },
      ];
    }

    // ===== Dynamic values filtering =====
    if (values && typeof values === "object") {
      const categoryFields = targetCategory?.fields || [];

      Object.entries(values).forEach(([key, rawValue]) => {
        if (rawValue === undefined || rawValue === null || rawValue === "")
          return;
        if (!/^[a-zA-Z0-9_]+$/.test(key)) return; // prevent injection

        let value = rawValue;

        // Auto-parse JSON string values into objects
        if (typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === "object" && parsed !== null) {
              value = parsed;
            }
          } catch {
            // keep as string if not JSON
          }
        }

        const valueKey = `values.${key}`;
        const fieldDef = categoryFields.find((f) => f.name === key);

        // helper for ranges
        const buildRangeQuery = (val) => {
          const range = {};
          if (val.min !== undefined) range.$gte = Number(val.min);
          if (val.max !== undefined) range.$lte = Number(val.max);
          if (val.start !== undefined) range.$gte = new Date(val.start);
          if (val.end !== undefined) range.$lte = new Date(val.end);
          return range;
        };

        // location special case
        // location special case
        if (key === "location" && typeof value === "string" && value.trim()) {
          const locationRegex = new RegExp(value.trim(), "i");

          // Build the OR condition for location-related fields
          const locationCondition = {
            $or: [
              { "values.location": locationRegex },
              { "values.address": locationRegex },
              { "values.city": locationRegex },
              { city: locationRegex },
            ],
          };

          // Add it to $and
          query.$and = [...(query.$and || []), locationCondition];

          // ✅ Debug logging: stringify regex properly
          console.log(
            "Location condition:",
            JSON.stringify(
              locationCondition,
              (k, v) => (v instanceof RegExp ? v.toString() : v),
              2
            )
          );

          return;
        }

        // ===== Force numeric handling for price, bedrooms, bathrooms =====
        if (["price", "bedrooms", "bathrooms"].includes(key)) {
          if (typeof value === "object") {
            const rangeQuery = buildRangeQuery(value);
            if (Object.keys(rangeQuery).length) {
              query[valueKey] = rangeQuery;
            }
          } else {
            query[valueKey] = Number(value);
          }
          return;
        }

        // ===== Normal field handling (based on category field type) =====
        if (fieldDef) {
          switch (fieldDef.type) {
            case "number":
              if (typeof value === "object") {
                const rangeQuery = buildRangeQuery(value);
                if (Object.keys(rangeQuery).length)
                  query[valueKey] = rangeQuery;
              } else {
                query[valueKey] = Number(value);
              }
              break;

            case "date":
              if (typeof value === "object") {
                const dateQuery = buildRangeQuery(value);
                if (Object.keys(dateQuery).length) query[valueKey] = dateQuery;
              } else {
                query[valueKey] = new Date(value);
              }
              break;

            case "checkbox":
              query[valueKey] = Array.isArray(value) ? { $all: value } : value;
              break;

            case "select":
              query[valueKey] = Array.isArray(value) ? { $in: value } : value;
              break;

            default:
              query[valueKey] =
                typeof value === "string"
                  ? { $regex: value, $options: "i" }
                  : value;
          }
        } else {
          // fallback if not in schema
          if (
            typeof value === "object" &&
            (value.min !== undefined ||
              value.max !== undefined ||
              value.start !== undefined ||
              value.end !== undefined)
          ) {
            const rangeQuery = buildRangeQuery(value);
            if (Object.keys(rangeQuery).length) query[valueKey] = rangeQuery;
          } else if (typeof value === "string") {
            query[valueKey] = { $regex: value, $options: "i" };
          } else {
            query[valueKey] = value;
          }
        }
      });
    }

    console.log("Final search query:", JSON.stringify(query, null, 2));

    // ===== Pagination =====
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // ===== Sorting =====
    const sortObj = { [sort]: order === "desc" ? -1 : 1 };

    // ===== Projection =====
    const projection = {};
    if (fields) {
      fields.split(",").forEach((f) => (projection[f.trim()] = 1));
    }

    // ===== Execute query =====
    const [listings, total] = await Promise.all([
      Listing.find(query)
        .populate("categoryId", "name slug icon")
        .populate("storeId", "name slug")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .select(Object.keys(projection).length ? projection : {})
        .lean(),
      Listing.countDocuments(query),
    ]);

    const response = {
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
      data: listings,
      ...(targetStore && {
        store: {
          _id: targetStore._id,
          name: targetStore.name,
          slug: targetStore.slug,
        },
      }),
      ...(targetCategory && {
        category: {
          _id: targetCategory._id,
          name: targetCategory.name,
          slug: targetCategory.slug,
          isLeaf: targetCategory.isLeaf,
          childrenCount: targetCategory.childrenCount || 0,
        },
      }),
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("Error in searchListings:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getListingsByCategorySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    console.log("Fetching listings for category slug:", slug);
    if (!slug) {
      return res.status(400).json({
        success: false,
        message: "Category slug is required",
      });
    }

    const category = await Category.findOne({ slug });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const listings = await Listing.find({
      $or: [
        { categoryId: category._id },
        { categoryPath: { $in: [category._id] } },
      ],
    }).populate("categoryId", "name slug icon");

    if (!listings || listings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Listings not found for this category",
      });
    }

    res.status(200).json({
      success: true,
      data: listings,
    });
  } catch (error) {
    console.error("Error fetching listings by category slug:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getListingsByCity = async (req, res) => {
  try {
    const { city, categoryId, storeId, page = 1, limit = 20 } = req.query;

    // Find and exclude excluded stores (jobs, health, care)
    const excludedStores = await Store.find(
      {
        $or: [
          { name: /job/i },
          { name: /jobs/i },
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
        ],
      },
      "_id"
    ).lean();
    const excludedStoreIds = excludedStores.map((store) => store._id);

    // Build base query
    const query = {};

    if (city) {
      query.city = { $regex: city, $options: "i" };
    }

    if (categoryId) {
      query.$or = [{ categoryId }, { categoryPath: { $in: [categoryId] } }];
    }

    if (storeId) {
      query.storeId = storeId;
    } else if (excludedStoreIds.length > 0) {
      // Exclude excluded stores (jobs, health, care) if no specific storeId is requested
      query.storeId = { $nin: excludedStoreIds };
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Fetch listings with populated store and category info
    const listings = await Listing.find(query)
      .skip(skip)
      .limit(Number(limit))
      .populate("categoryId", "name slug icon")
      .populate("storeId", "name");

    const total = await Listing.countDocuments(query);

    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / Number(limit)),
      currentPage: Number(page),
      data: listings,
    });
  } catch (error) {
    console.error("Error fetching listings by city:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getListingsByStore = async (req, res) => {
  try {
    const { storeSlugOrId } = req.params;
    const {
      categoryId,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
      fields,
      values = {},
    } = req.query;

    const query = {};

    let store = null;
    if (storeSlugOrId) {
      // Find the store by slug or ID
      if (mongoose.Types.ObjectId.isValid(storeSlugOrId)) {
        store = await Store.findById(storeSlugOrId).lean();
      } else {
        store = await Store.findOne({ slug: storeSlugOrId }).lean();
      }

      if (!store) {
        return res.status(404).json({
          success: false,
          message: "Store not found",
        });
      }

      query.storeId = store._id;
    }

    // Category filtering
    if (categoryId) {
      let actualCategoryId = categoryId;

      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        const categoryQuery = { slug: categoryId };
        if (store) categoryQuery.storeId = store._id;

        const category = await Category.findOne(categoryQuery);
        if (!category) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }
        actualCategoryId = category._id;
      }

      query.$or = [
        { categoryId: actualCategoryId },
        { categoryPath: { $in: [actualCategoryId] } },
      ];
    }

    // Process value filters for dynamic fields
    if (values && typeof values === "object") {
      Object.entries(values).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;

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
        } else if (typeof value === "string") {
          query[valueKey] = { $regex: value, $options: "i" };
        } else {
          query[valueKey] = value;
        }
      });
    }

    // Pagination
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortObj = {};
    sortObj[sort] = order === "desc" ? -1 : 1;

    // Field projection
    const projection = {};
    if (fields) {
      fields.split(",").forEach((field) => {
        projection[field.trim()] = 1;
      });
    }

    // Execute query
    const listings = await Listing.find(query)
      .populate("categoryId", "name slug icon")
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .select(Object.keys(projection).length ? projection : {})
      .lean();

    const total = await Listing.countDocuments(query);

    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
      store: store
        ? {
            _id: store._id,
            name: store.name,
            slug: store.slug,
            description: store.description,
          }
        : null,
      data: listings,
    });
    console.log(
      `Fetched ${listings.length} listings for store: ${storeSlugOrId}`
    );
  } catch (error) {
    console.error("Error fetching listings by store:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
