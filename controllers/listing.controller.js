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
import { queueImageUpload } from "../middleware/listing-upload.middleware.js";
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
  } catch (e) {
    console.log("Error selecting primary image:", e?.message || e);
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
  } catch (e) {
    console.log("Error formatting number:", e?.message || e);
  }
  return n;
};
export const capitalizeWords = (str = "") =>
  str
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
  if (listing?.city)
    details.push({ label: "City", value: capitalizeWords(listing.city) });
  if (storeName)
    details.push({ label: "Store", value: capitalizeWords(storeName) });
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
    const hasQueuedImages =
      req.queuedImages && req.queuedImages.images.length > 0;

    for (const field of category.fields || []) {
      const fieldName = field.name;
      const fieldValue = userValues[fieldName];

      // Skip required validation for image/file fields when using queue
      const isImageOrFileField =
        field.type === "image" || field.type === "file";
      const shouldSkipRequiredValidation =
        hasQueuedImages && isImageOrFileField;

      if (
        field.required &&
        !shouldSkipRequiredValidation &&
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
        case "location": {
          if (fieldValue && typeof fieldValue === "object") {
            const locationData = { ...fieldValue };
            if (
              locationData.coordinates &&
              typeof locationData.coordinates === "object"
            ) {
              const coords = locationData.coordinates;
              if (coords.lat !== undefined && coords.lng !== undefined) {
                const lng = parseFloat(coords.lng);
                const lat = parseFloat(coords.lat);
                if (!isNaN(lng) && !isNaN(lat)) {
                  locationData.coordinates = { lat: lat, lng: lng };
                } else {
                  validationErrors.push({
                    field: fieldName,
                    message: `Invalid coordinates format for location field '${field.label}'`,
                  });
                }
              } else if (Array.isArray(coords) && coords.length === 2) {
                const lng = parseFloat(coords[0]);
                const lat = parseFloat(coords[1]);
                if (!isNaN(lng) && !isNaN(lat)) {
                  locationData.coordinates = { lat: lat, lng: lng };
                } else {
                  validationErrors.push({
                    field: fieldName,
                    message: `Invalid coordinates format for location field '${field.label}'`,
                  });
                }
              }
            }
            transformedValues.set(fieldName, locationData);
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
    const store = await Store.findById(storeId).lean();
    const isVehicleStore = !!(
      store?.name &&
      (/vehicles?/i.test(store.name) ||
        (store.slug && /vehicles?/i.test(store.slug)))
    );
    const isHealthCareStore = !!(
      store?.name &&
      (/health.*care|care.*health/i.test(store.name) ||
        /health/i.test(store.name) ||
        /care/i.test(store.name) ||
        (store.slug &&
          (/health.*care|care.*health/i.test(store.slug) ||
            /health/i.test(store.slug) ||
            /care/i.test(store.slug))))
    );
    const listing = await Listing.create({
      storeId,
      categoryId,
      categoryPath,
      values: transformedValues,
      userId: req.user.id,
      city,
      serviceType: isVehicleStore
        ? "vehicles"
        : isHealthCareStore
        ? "healthcare"
        : "others",
    });
    const categoryNames = await Category.find({
      _id: { $in: categoryPath },
    })
      .select("name")
      .lean();
    const hiringRegex = /i\s*('|'?)?\s*(a|'?)m\s*hir[a-z]{2,}/i;
    const hasHiringCategory = categoryNames.some((cat) =>
      hiringRegex.test(cat.name || "")
    );
    const isJobStore = store?.name?.toLowerCase() === "jobs";
    if (!isJobStore) {
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

    // Handle queued image uploads if present
    let imageUploadJobId = null;
    if (req.queuedImages && req.queuedImages.images.length > 0) {
      try {
        const imageJob = await queueImageUpload(listing._id, req.queuedImages);
        imageUploadJobId = imageJob.id;
        console.log(
          `Queued ${req.queuedImages.images.length} images for processing (Job ID: ${imageUploadJobId})`
        );
      } catch (error) {
        console.error("Error queuing image upload:", error);
        // Don't fail the listing creation if image queuing fails
      }
    }

    res.status(201).json({
      success: true,
      data: listing,
      imageUploadJobId, // Include job ID so frontend can track progress
      message: imageUploadJobId
        ? "Listing created successfully. Images are being processed in the background."
        : "Listing created successfully.",
    });
  } catch (error) {
    console.error(`Error creating listing: ${error}`);
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
    const excludedStores = await Store.find(
      {
        $or: [
          { name: /jobs/i },
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { name: /vehicle|vehicles/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
          { slug: /vehicle|vehicles/i },
        ],
      },
      "_id"
    ).lean();
    const excludedStoreIds = excludedStores.map((store) => store._id);
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
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
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
    let query = {};
    if (mongoose.Types.ObjectId.isValid(id)) {
      query._id = id;
    } else {
      query.slug = id;
    }
    const listing = await Listing.findOne(query)
      .populate("categoryId", "name slug fields")
      .populate("userId", "name email avatar")
      .populate("storeId", "name slug")
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
      const hasQueuedImages =
        req.queuedImages && req.queuedImages.images.length > 0;

      let retainedFiles = {};
      if (req.body.retainedFiles) {
        try {
          retainedFiles = JSON.parse(req.body.retainedFiles);
        } catch (err) {
          console.error("Error parsing retainedFiles:", err);
        }
      }
      for (const field of category.fields || []) {
        if (field.type === "file" || field.type === "image") {
          const fieldName = field.name;
          const newFieldValue = userValues[fieldName];
          const retainedFieldFiles = retainedFiles[fieldName] || [];
          let finalFieldValue = null;
          if (retainedFieldFiles.length > 0) {
            if (field.multiple) {
              finalFieldValue = [...retainedFieldFiles];
              if (newFieldValue) {
                if (Array.isArray(newFieldValue)) {
                  finalFieldValue = [...finalFieldValue, ...newFieldValue];
                } else {
                  finalFieldValue.push(newFieldValue);
                }
              }
            } else {
              if (newFieldValue) {
                finalFieldValue = newFieldValue;
              } else {
                finalFieldValue = retainedFieldFiles[0];
              }
            }
          } else if (newFieldValue) {
            finalFieldValue = newFieldValue;
          }
          if (finalFieldValue !== null) {
            transformedValues.set(fieldName, finalFieldValue);
          } else {
            transformedValues.delete(fieldName);
          }

          // Skip required validation for image/file fields when using queue
          if (
            field.required &&
            !hasQueuedImages &&
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
      for (const fieldName in userValues) {
        const fieldValue = userValues[fieldName];
        const field = category.fields.find((f) => f.name === fieldName);
        if (!field) {
          continue;
        }
        if (field.type === "file" || field.type === "image") {
          continue;
        }

        // For non-file fields, apply normal validation (not affected by queue)
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
          case "point": {
            if (fieldValue && typeof fieldValue === "object") {
              const locationData = { ...fieldValue };
              if (
                locationData.coordinates &&
                typeof locationData.coordinates === "object"
              ) {
                const coords = locationData.coordinates;
                if (coords.lat !== undefined && coords.lng !== undefined) {
                  const lng = parseFloat(coords.lng);
                  const lat = parseFloat(coords.lat);
                  if (!isNaN(lng) && !isNaN(lat)) {
                    locationData.coordinates = { lat: lat, lng: lng };
                  } else {
                    validationErrors.push({
                      field: fieldName,
                      message: `Invalid coordinates format for location field '${field.label}'`,
                    });
                  }
                } else if (Array.isArray(coords) && coords.length === 2) {
                  const lng = parseFloat(coords[0]);
                  const lat = parseFloat(coords[1]);
                  if (!isNaN(lng) && !isNaN(lat)) {
                    locationData.coordinates = { lat: lat, lng: lng };
                  } else {
                    validationErrors.push({
                      field: fieldName,
                      message: `Invalid coordinates format for location field '${field.label}'`,
                    });
                  }
                }
              }
              transformedValues.set(fieldName, locationData);
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

    // Handle queued image uploads if present
    let imageUploadJobId = null;
    if (req.queuedImages && req.queuedImages.images.length > 0) {
      try {
        const imageJob = await queueImageUpload(listing._id, req.queuedImages);
        imageUploadJobId = imageJob.id;
        console.log(
          `Queued ${req.queuedImages.images.length} images for processing during update (Job ID: ${imageUploadJobId})`
        );
      } catch (error) {
        console.error("Error queuing image upload during update:", error);
        // Don't fail the listing update if image queuing fails
      }
    }

    res.status(200).json({
      success: true,
      data: updatedListing,
      imageUploadJobId, // Include job ID so frontend can track progress
      message: imageUploadJobId
        ? "Listing updated successfully. Images are being processed in the background."
        : "Listing updated successfully.",
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
    await Profile.updateMany(
      {},
      {
        $pull: {
          "public.applications": listing._id,
        },
      }
    );
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
    const jobsStores = await Store.find(
      {
        name: /jobs/i,
        $nor: [
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { name: /vehicle|vehicles/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
          { slug: /vehicle|vehicles/i },
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
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
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
    const categoryIdentifier = categorySlug || req.params.categorySlug;
    if (!categoryIdentifier) {
      return res.status(400).json({
        success: false,
        message: "Category slug is required",
      });
    }
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
    const query = {
      storeId: { $in: healthcareStoreIds },
      $or: [
        { categoryId: { $in: categoryIdsToFilter } },
        { categoryPath: { $in: categoryIdsToFilter } },
      ],
    };
    if (values && typeof values === "object") {
      Object.entries(values).forEach(([key, value]) => {
        if (key === "search" && typeof value === "string" && value.trim()) {
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
          query["values.verified"] = true;
        } else {
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
    if (sort === "verified") {
      sortObj["values.verified"] = order === "desc" ? -1 : 1;
      sortObj["createdAt"] = -1;
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
    const categoryFilter = categoryId || categorySlug;
    if (categoryFilter) {
      let actualCategoryId = categoryFilter;
      let targetCategory = null;
      if (!mongoose.Types.ObjectId.isValid(categoryFilter)) {
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
        targetCategory = await Category.findById(actualCategoryId);
        if (!targetCategory) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }
      }
      let categoryIdsToFilter = [actualCategoryId];
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
    if (values && typeof values === "object") {
      Object.entries(values).forEach(([key, value]) => {
        if (key === "search" && typeof value === "string" && value.trim()) {
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
          const cityRegex = new RegExp(value.trim().replace(/-/g, "\\s*"), "i");
          query.$or = query.$or || [];
          query.$or.push(
            { "values.city": cityRegex },
            { "values.location.address": cityRegex },
            { city: cityRegex }
          );
        } else if (key === "verified" && (value === "true" || value === true)) {
          query["values.verified"] = true;
        } else {
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
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    const sortObj = {};
    if (sort === "verified") {
      sortObj["values.verified"] = order === "desc" ? -1 : 1;
      sortObj["createdAt"] = -1;
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
      query: searchQuery,
      category,
      purpose,
      filter,
      emirate,
      location: locationParam,
      city,
      minPrice,
      maxPrice,
      beds,
      baths,
      propertyType,
    } = req.query;
    const { storeSlug, categorySlug } = req.params;
    const query = {};
    const excludedStores = await Store.find(
      {
        $or: [
          { name: /job/i },
          { name: /jobs/i },
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /care/i },
          { name: /vehicle|vehicles/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
          { slug: /vehicle|vehicles/i },
        ],
      },
      "_id"
    ).lean();
    const excludedStoreIds = excludedStores.map((s) => s._id);
    let targetStore = null;
    let targetCategory = null;
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
    let categoryToSearch = categorySlug || category;
    if (categoryToSearch) {
      targetCategory = mongoose.Types.ObjectId.isValid(categoryToSearch)
        ? await Category.findById(categoryToSearch)
        : await Category.findOne({
            $or: [
              { slug: categoryToSearch },
              { name: { $regex: categoryToSearch, $options: "i" } },
            ],
            ...(targetStore && { storeId: targetStore._id }),
          });
      if (targetCategory) {
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
    }
    if (searchQuery && typeof searchQuery === "string" && searchQuery.trim()) {
      const searchRegex = new RegExp(searchQuery.trim(), "i");
      const searchConditions = [
        { "values.title": searchRegex },
        { "values.name": searchRegex },
        { "values.description": searchRegex },
        ...(targetCategory ? [] : [{ categoryName: searchRegex }]),
      ];
      query.$and = [...(query.$and || []), { $or: searchConditions }];
    }
    const locationValue = locationParam || city || emirate;
    if (
      locationValue &&
      typeof locationValue === "string" &&
      locationValue.trim()
    ) {
      const locationRegex = new RegExp(locationValue.trim(), "i");
      const locationCondition = {
        $or: [
          { "values.location": locationRegex },
          { "values.address": locationRegex },
          { "values.city": locationRegex },
          { "values.emirate": locationRegex },
          { "values.area": locationRegex },
          { city: locationRegex },
          { "values.neighbourhood": locationRegex },
          { "values.district": locationRegex },
        ],
      };
      query.$and = [...(query.$and || []), locationCondition];
    }
    if (purpose && typeof purpose === "string") {
      const purposeRegex = new RegExp(purpose.trim(), "i");
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { "values.purpose": purposeRegex },
            { "values.type": purposeRegex },
            { "values.listingType": purposeRegex },
          ],
        },
      ];
    }
    if (
      propertyType &&
      typeof propertyType === "string" &&
      propertyType.trim()
    ) {
      const propertyTypeRegex = new RegExp(propertyType.trim(), "i");
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { "values.propertyType": propertyTypeRegex },
            { "values.type": propertyTypeRegex },
            { "values.subType": propertyTypeRegex },
          ],
        },
      ];
    }
    if (minPrice || maxPrice) {
      const priceQuery = {};
      if (minPrice) priceQuery.$gte = Number(minPrice);
      if (maxPrice) priceQuery.$lte = Number(maxPrice);
      if (Object.keys(priceQuery).length > 0) {
        query.$and = [
          ...(query.$and || []),
          {
            $or: [
              { "values.price": priceQuery },
              { "values.rent": priceQuery },
              { "values.cost": priceQuery },
            ],
          },
        ];
      }
    }
    if (beds && Number(beds) > 0) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { "values.bedrooms": Number(beds) },
            { "values.beds": Number(beds) },
            { "values.bedroom": Number(beds) },
          ],
        },
      ];
    }
    if (baths && Number(baths) > 0) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { "values.bathrooms": Number(baths) },
            { "values.baths": Number(baths) },
            { "values.bathroom": Number(baths) },
          ],
        },
      ];
    }
    if (filter && typeof filter === "string" && filter.trim()) {
      const filterRegex = new RegExp(filter.trim(), "i");
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { "values.filter": filterRegex },
            { "values.category": filterRegex },
            { "values.subCategory": filterRegex },
          ],
        },
      ];
    }
    if (values && typeof values === "object") {
      const categoryFields = targetCategory?.fields || [];
      Object.entries(values).forEach(([key, rawValue]) => {
        if (rawValue === undefined || rawValue === null || rawValue === "")
          return;
        if (!/^[a-zA-Z0-9_]+$/.test(key)) return;
        let value = rawValue;
        if (typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === "object" && parsed !== null) {
              value = parsed;
            }
          } catch (e) {
            console.log(
              `${e}............Value for key ${key} is not JSON:`,
              value
            );
          }
        }
        const valueKey = `values.${key}`;
        const fieldDef = categoryFields.find((f) => f.name === key);
        const buildRangeQuery = (val) => {
          const range = {};
          if (val.min !== undefined) range.$gte = Number(val.min);
          if (val.max !== undefined) range.$lte = Number(val.max);
          if (val.start !== undefined) range.$gte = new Date(val.start);
          if (val.end !== undefined) range.$lte = new Date(val.end);
          return range;
        };
        if (key === "location") return;
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
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    let sortObj = {};
    const sortParam = req.query.sort || sort;
    switch (sortParam) {
      case "Popular":
        sortObj = { views: -1, createdAt: -1 };
        break;
      case "Lowest Starting Price":
        sortObj = { "values.price": 1, "values.rent": 1, createdAt: -1 };
        break;
      case "Highest Starting Price":
        sortObj = { "values.price": -1, "values.rent": -1, createdAt: -1 };
        break;
      case "newest":
        sortObj = { createdAt: -1 };
        break;
      case "oldest":
        sortObj = { createdAt: 1 };
        break;
      default:
        sortObj = { [sortParam]: order === "desc" ? -1 : 1 };
    }
    const projection = {};
    if (fields) {
      fields.split(",").forEach((f) => (projection[f.trim()] = 1));
    }
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
    const excludedStores = await Store.find(
      {
        $or: [
          { name: /job/i },
          { name: /jobs/i },
          { name: /health.*care|care.*health/i },
          { name: /health/i },
          { name: /vehicle|vehicles/i },
          { name: /care/i },
          { slug: /health.*care|care.*health/i },
          { slug: /health/i },
          { slug: /care/i },
          { slug: /vehicle|vehicles/i },
        ],
      },
      "_id"
    ).lean();
    const excludedStoreIds = excludedStores.map((store) => store._id);
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
      query.storeId = { $nin: excludedStoreIds };
    }
    const skip = (Number(page) - 1) * Number(limit);
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
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
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
export const getVehicleListings = async (req, res) => {
  try {
    const {
      categoryId,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
      fields,
      ...rest
    } = req.query;
    const values = {
      ...(rest || {}),
      ...(req.query.values || {}),
    };
    const vehicleStores = await Store.find(
      {
        $or: [{ name: /vehicle|vehicles/i }, { slug: /vehicle|vehicles/i }],
      },
      "_id"
    ).lean();
    const vehicleStoreIds = vehicleStores.map((store) => store._id);
    if (vehicleStoreIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No vehicle store found",
      });
    }
    const query = {
      storeId: { $in: vehicleStoreIds },
    };
    if (categoryId) {
      let actualCategoryId = categoryId;
      let targetCategory = null;
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        targetCategory = await Category.findOne({
          slug: categoryId,
          storeId: { $in: vehicleStoreIds },
        });
        if (!targetCategory) {
          return res
            .status(404)
            .json({ success: false, message: "Category not found" });
        }
        actualCategoryId = targetCategory._id;
      } else {
        targetCategory = await Category.findById(actualCategoryId);
        if (!targetCategory) {
          return res
            .status(404)
            .json({ success: false, message: "Category not found" });
        }
      }
      let categoryIdsToFilter = [actualCategoryId];
      if (!targetCategory.isLeaf && targetCategory.childrenCount > 0) {
        const childCategories = await Category.find(
          {
            $or: [
              { parent: actualCategoryId },
              { path: { $regex: actualCategoryId.toString() } },
            ],
            storeId: { $in: vehicleStoreIds },
          },
          "_id"
        ).lean();
        const childCategoryIds = childCategories.map((cat) => cat._id);
        categoryIdsToFilter = [...categoryIdsToFilter, ...childCategoryIds];
      }
      query.$or = [
        { categoryId: { $in: categoryIdsToFilter } },
        { categoryPath: { $in: categoryIdsToFilter } },
      ];
    }
    if (values && typeof values === "object") {
      Object.entries(values).forEach(([key, rawValue]) => {
        if (rawValue === undefined || rawValue === null || rawValue === "") {
          return;
        }
        let value = rawValue;
        if (typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === "object" && parsed !== null) {
              value = parsed;
            }
          } catch (e) {
            console.log(
              e + "Error parsing JSON for key:",
              key,
              "Value:",
              value
            );
          }
        }
        const valueKey = `values.${key}`;
        if (key === "search" && typeof value === "string" && value.trim()) {
          const searchRegex = new RegExp(value.trim(), "i");
          query.$and = query.$and || [];
          query.$and.push({ $or: [{ "values.title": searchRegex }] });
        } else if (
          key === "city" &&
          typeof value === "string" &&
          value.trim() &&
          value !== "all"
        ) {
          const cityRegex = new RegExp(value.trim().replace(/-/g, "\\s*"), "i");
          query.$and = query.$and || [];
          query.$and.push({
            $or: [
              { city: cityRegex },
              { "values.location.address": cityRegex },
              { "values.address": cityRegex },
              { city: cityRegex },
            ],
          });
        } else if (
          key === "brand" &&
          typeof value === "string" &&
          value.trim()
        ) {
          const brandRegex = new RegExp(value.trim(), "i");
          query[valueKey] = brandRegex;
        } else if (
          key === "model" &&
          typeof value === "string" &&
          value.trim()
        ) {
          const modelRegex = new RegExp(value.trim(), "i");
          query[valueKey] = modelRegex;
        } else if (
          key === "fuelType" &&
          typeof value === "string" &&
          value.trim()
        ) {
          const fuelRegex = new RegExp(value.trim(), "i");
          query[valueKey] = fuelRegex;
        } else if (
          key === "transmission" &&
          typeof value === "string" &&
          value.trim()
        ) {
          const transmissionRegex = new RegExp(value.trim(), "i");
          query[valueKey] = transmissionRegex;
        } else if (
          key === "color" &&
          typeof value === "string" &&
          value.trim()
        ) {
          const colorRegex = new RegExp(value.trim(), "i");
          query[valueKey] = colorRegex;
        } else if (
          ["price", "year", "mileage", "engineSize", "doors"].includes(key)
        ) {
          if (typeof value === "object") {
            const rangeQuery = {};
            if (value.min !== undefined) rangeQuery.$gte = Number(value.min);
            if (value.max !== undefined) rangeQuery.$lte = Number(value.max);
            if (Object.keys(rangeQuery).length > 0) {
              query[valueKey] = rangeQuery;
            }
          } else {
            query[valueKey] = Number(value);
          }
        } else if (
          key === "condition" &&
          typeof value === "string" &&
          value.trim()
        ) {
          const conditionRegex = new RegExp(value.trim(), "i");
          query[valueKey] = conditionRegex;
        } else if (key === "features" && Array.isArray(value)) {
          query[valueKey] = { $all: value };
        } else if (
          key === "isAvailable" &&
          (value === "true" || value === true)
        ) {
          query[valueKey] = true;
        } else {
          if (
            typeof value === "object" &&
            (value.min !== undefined ||
              value.max !== undefined ||
              value.start !== undefined ||
              value.end !== undefined)
          ) {
            const rangeQuery = {};
            if (value.min !== undefined) rangeQuery.$gte = Number(value.min);
            if (value.max !== undefined) rangeQuery.$lte = Number(value.max);
            if (value.start !== undefined)
              rangeQuery.$gte = new Date(value.start);
            if (value.end !== undefined) rangeQuery.$lte = new Date(value.end);
            if (Object.keys(rangeQuery).length > 0) {
              query[valueKey] = rangeQuery;
            }
          } else if (typeof value === "string") {
            query[valueKey] = { $regex: value, $options: "i" };
          } else {
            query[valueKey] = value;
          }
        }
      });
    }
    console.log(
      "Final vehicle listings query:",
      JSON.stringify(query, null, 2)
    );
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
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
      .populate({ path: "categoryId", select: "name slug icon fields" })
      .populate({ path: "storeId", select: "name slug" })
      .populate({ path: "userId", select: "name email" })
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .select(Object.keys(projection).length ? projection : {})
      .lean();
    const total = await Listing.countDocuments(query);
    let categoryInfo = null;
    if (categoryId) {
      let actualCategoryId = categoryId;
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        const category = await Category.findOne({ slug: categoryId });
        if (category) actualCategoryId = category._id;
      }
      if (actualCategoryId) {
        const category = await Category.findById(actualCategoryId).select(
          "name slug icon isLeaf childrenCount"
        );
        if (category) categoryInfo = category;
      }
    }
    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
      category: categoryInfo,
      data: listings,
    });
  } catch (error) {
    console.error("Error fetching vehicle listings:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const getVehicleListingsAdvanced = async (req, res) => {
  try {
    const {
      categoryId,
      categorySlug,
      brand,
      model,
      year,
      priceMin,
      priceMax,
      mileageMin,
      mileageMax,
      fuelType,
      transmission,
      color,
      condition,
      city,
      search,
      sort = "createdAt",
      order = "desc",
      page = 1,
      limit = 20,
      fields,
    } = req.query;
    console.log("Fetching advanced vehicle listings with params:", req.query);
    const vehicleStores = await Store.find(
      {
        $or: [
          { name: /vehicle|vehicles|car|cars|automotive|motors/i },
          { slug: /vehicle|vehicles|car|cars|automotive|motors/i },
        ],
      },
      "_id"
    ).lean();
    const vehicleStoreIds = vehicleStores.map((store) => store._id);
    if (vehicleStoreIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No vehicle store found",
      });
    }
    const query = {
      storeId: { $in: vehicleStoreIds },
    };
    const categoryFilter = categoryId || categorySlug;
    if (categoryFilter) {
      let actualCategoryId = categoryFilter;
      let targetCategory = null;
      if (!mongoose.Types.ObjectId.isValid(categoryFilter)) {
        targetCategory = await Category.findOne({
          slug: categoryFilter,
          storeId: { $in: vehicleStoreIds },
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
      if (!targetCategory.isLeaf && targetCategory.childrenCount > 0) {
        const childCategories = await Category.find(
          {
            $or: [
              { parent: actualCategoryId },
              { path: { $regex: actualCategoryId.toString() } },
            ],
            storeId: { $in: vehicleStoreIds },
          },
          "_id"
        ).lean();
        const childCategoryIds = childCategories.map((cat) => cat._id);
        categoryIdsToFilter = [...categoryIdsToFilter, ...childCategoryIds];
      }
      query.$or = [
        { categoryId: { $in: categoryIdsToFilter } },
        { categoryPath: { $in: categoryIdsToFilter } },
      ];
    }
    const filters = [];
    if (brand && brand.trim()) {
      filters.push({ "values.brand": { $regex: brand.trim(), $options: "i" } });
    }
    if (model && model.trim()) {
      filters.push({ "values.model": { $regex: model.trim(), $options: "i" } });
    }
    if (year) {
      if (typeof year === "object") {
        const yearQuery = {};
        if (year.min !== undefined) yearQuery.$gte = Number(year.min);
        if (year.max !== undefined) yearQuery.$lte = Number(year.max);
        if (Object.keys(yearQuery).length > 0) {
          filters.push({ "values.year": yearQuery });
        }
      } else {
        filters.push({ "values.year": Number(year) });
      }
    }
    if (priceMin !== undefined || priceMax !== undefined) {
      const priceQuery = {};
      if (priceMin !== undefined) priceQuery.$gte = Number(priceMin);
      if (priceMax !== undefined) priceQuery.$lte = Number(priceMax);
      if (Object.keys(priceQuery).length > 0) {
        filters.push({ "values.price": priceQuery });
      }
    }
    if (mileageMin !== undefined || mileageMax !== undefined) {
      const mileageQuery = {};
      if (mileageMin !== undefined) mileageQuery.$gte = Number(mileageMin);
      if (mileageMax !== undefined) mileageQuery.$lte = Number(mileageMax);
      if (Object.keys(mileageQuery).length > 0) {
        filters.push({ "values.mileage": mileageQuery });
      }
    }
    if (fuelType && fuelType.trim()) {
      filters.push({
        "values.fuelType": { $regex: fuelType.trim(), $options: "i" },
      });
    }
    if (transmission && transmission.trim()) {
      filters.push({
        "values.transmission": { $regex: transmission.trim(), $options: "i" },
      });
    }
    if (color && color.trim()) {
      filters.push({ "values.color": { $regex: color.trim(), $options: "i" } });
    }
    if (condition && condition.trim()) {
      filters.push({
        "values.condition": { $regex: condition.trim(), $options: "i" },
      });
    }
    if (city && city.trim() && city !== "all") {
      const cityRegex = new RegExp(city.trim().replace(/-/g, "\\s*"), "i");
      filters.push({
        $or: [
          { "values.city": cityRegex },
          { "values.location": cityRegex },
          { "values.address": cityRegex },
          { city: cityRegex },
        ],
      });
    }
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filters.push({
        $or: [
          { "values.title": searchRegex },
          { "values.brand": searchRegex },
          { "values.model": searchRegex },
          { "values.description": searchRegex },
          { "values.features": searchRegex },
        ],
      });
    }
    if (filters.length > 0) {
      query.$and = filters;
    }
    console.log(
      "Final advanced vehicle query:",
      JSON.stringify(query, null, 2)
    );
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
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
      .populate({ path: "categoryId", select: "name slug icon fields" })
      .populate({ path: "storeId", select: "name slug" })
      .populate({ path: "userId", select: "name email" })
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .select(Object.keys(projection).length ? projection : {})
      .lean();
    const total = await Listing.countDocuments(query);
    let categoryInfo = null;
    if (categoryFilter) {
      let actualCategoryId = categoryFilter;
      if (!mongoose.Types.ObjectId.isValid(categoryFilter)) {
        const category = await Category.findOne({ slug: categoryFilter });
        if (category) actualCategoryId = category._id;
      }
      if (actualCategoryId) {
        const category = await Category.findById(actualCategoryId).select(
          "name slug icon isLeaf childrenCount"
        );
        if (category) categoryInfo = category;
      }
    }
    const filterOptions = {
      brands: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("brand") || l.values?.brand)
            .filter(Boolean)
        ),
      ],
      models: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("model") || l.values?.model)
            .filter(Boolean)
        ),
      ],
      fuelTypes: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("fuelType") || l.values?.fuelType)
            .filter(Boolean)
        ),
      ],
      transmissions: [
        ...new Set(
          listings
            .map(
              (l) => l.values?.get?.("transmission") || l.values?.transmission
            )
            .filter(Boolean)
        ),
      ],
      colors: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("color") || l.values?.color)
            .filter(Boolean)
        ),
      ],
      conditions: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("condition") || l.values?.condition)
            .filter(Boolean)
        ),
      ],
    };
    res.status(200).json({
      success: true,
      count: listings.length,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      total,
      category: categoryInfo,
      filterOptions,
      data: listings,
    });
  } catch (error) {
    console.error("Error fetching advanced vehicle listings:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const getVehicleFilterOptions = async (req, res) => {
  try {
    const { categoryId, categorySlug } = req.query;
    console.log("Fetching vehicle filter options with params:", {
      categoryId,
      categorySlug,
    });
    const vehicleStores = await Store.find(
      {
        $or: [
          { name: /vehicle|vehicles|car|cars|automotive|motors/i },
          { slug: /vehicle|vehicles|car|cars|automotive|motors/i },
        ],
      },
      "_id"
    ).lean();
    const vehicleStoreIds = vehicleStores.map((store) => store._id);
    if (vehicleStoreIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No vehicle store found",
      });
    }
    const query = {
      storeId: { $in: vehicleStoreIds },
    };
    const categoryFilter = categoryId || categorySlug;
    if (categoryFilter) {
      let actualCategoryId = categoryFilter;
      let targetCategory = null;
      if (!mongoose.Types.ObjectId.isValid(categoryFilter)) {
        targetCategory = await Category.findOne({
          slug: categoryFilter,
          storeId: { $in: vehicleStoreIds },
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
      if (!targetCategory.isLeaf && targetCategory.childrenCount > 0) {
        const childCategories = await Category.find(
          {
            $or: [
              { parent: actualCategoryId },
              { path: { $regex: actualCategoryId.toString() } },
            ],
            storeId: { $in: vehicleStoreIds },
          },
          "_id"
        ).lean();
        const childCategoryIds = childCategories.map((cat) => cat._id);
        categoryIdsToFilter = [...categoryIdsToFilter, ...childCategoryIds];
      }
      query.$or = [
        { categoryId: { $in: categoryIdsToFilter } },
        { categoryPath: { $in: categoryIdsToFilter } },
      ];
    }
    const listings = await Listing.find(query).select("values city").lean();
    const filterOptions = {
      brands: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("brand") || l.values?.brand)
            .filter(Boolean)
        ),
      ].sort(),
      models: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("model") || l.values?.model)
            .filter(Boolean)
        ),
      ].sort(),
      fuelTypes: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("fuelType") || l.values?.fuelType)
            .filter(Boolean)
        ),
      ].sort(),
      transmissions: [
        ...new Set(
          listings
            .map(
              (l) => l.values?.get?.("transmission") || l.values?.transmission
            )
            .filter(Boolean)
        ),
      ].sort(),
      colors: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("color") || l.values?.color)
            .filter(Boolean)
        ),
      ].sort(),
      conditions: [
        ...new Set(
          listings
            .map((l) => l.values?.get?.("condition") || l.values?.condition)
            .filter(Boolean)
        ),
      ].sort(),
      cities: [
        ...new Set(
          listings.map((l) => l.values?.get?.("city") || l.city).filter(Boolean)
        ),
      ].sort(),
    };
    const prices = listings
      .map((l) => l.values?.get?.("price") || l.values?.price)
      .filter((p) => typeof p === "number" && !isNaN(p));
    const years = listings
      .map((l) => l.values?.get?.("year") || l.values?.year)
      .filter((y) => typeof y === "number" && !isNaN(y));
    const mileages = listings
      .map((l) => l.values?.get?.("mileage") || l.values?.mileage)
      .filter((m) => typeof m === "number" && !isNaN(m));
    const engineSizes = listings
      .map((l) => l.values?.get?.("engineSize") || l.values?.engineSize)
      .filter((e) => typeof e === "number" && !isNaN(e));
    const doors = listings
      .map((l) => l.values?.get?.("doors") || l.values?.doors)
      .filter((d) => typeof d === "number" && !isNaN(d));
    if (prices.length > 0) {
      filterOptions.priceRange = {
        min: Math.min(...prices),
        max: Math.max(...prices),
      };
    }
    if (years.length > 0) {
      filterOptions.yearRange = {
        min: Math.min(...years),
        max: Math.max(...years),
      };
    }
    if (mileages.length > 0) {
      filterOptions.mileageRange = {
        min: Math.min(...mileages),
        max: Math.max(...mileages),
      };
    }
    if (engineSizes.length > 0) {
      filterOptions.engineSizeRange = {
        min: Math.min(...engineSizes),
        max: Math.max(...engineSizes),
      };
    }
    if (doors.length > 0) {
      filterOptions.doorsRange = {
        min: Math.min(...doors),
        max: Math.max(...doors),
      };
    }
    let categoryInfo = null;
    if (categoryFilter) {
      let actualCategoryId = categoryFilter;
      if (!mongoose.Types.ObjectId.isValid(categoryFilter)) {
        const category = await Category.findOne({ slug: categoryFilter });
        if (category) actualCategoryId = category._id;
      }
      if (actualCategoryId) {
        const category = await Category.findById(actualCategoryId).select(
          "name slug icon isLeaf childrenCount"
        );
        if (category) categoryInfo = category;
      }
    }
    res.status(200).json({
      success: true,
      category: categoryInfo,
      filterOptions,
      totalListings: listings.length,
    });
  } catch (error) {
    console.error("Error fetching vehicle filter options:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
