import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    categoryPath: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        index: true,
      },
    ],
    values: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

listingSchema.index({ categoryId: 1, createdAt: -1 });

listingSchema.index({ storeId: 1, createdAt: -1 });

listingSchema.index({ userId: 1, createdAt: -1 });

listingSchema.index({ categoryPath: 1 });

listingSchema.index(
  { "values.location.coordinates": "2dsphere" },
  { sparse: true }
);

listingSchema.index(
  {
    "values.title": "text",
    "values.description": "text",
  },
  {
    weights: {
      "values.title": 10,
      "values.description": 5,
    },
    name: "TextSearchIndex",
    sparse: true,
  }
);

listingSchema.pre("save", function (next) {
  if (!this.isModified("slug") && !this.isNew) {
    return next();
  }

  try {
    if (!this.slug) {
      const titleValue = this.values.get("title") || this.values.get("name");

      if (titleValue) {
        const baseSlug = String(titleValue)
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/[\s_-]+/g, "-")
          .replace(/^-+|-+$/g, "");

        this.slug = `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`;
      } else {
        this.slug = `listing-${Math.random().toString(36).substring(2, 15)}`;
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

listingSchema.statics.findByCategory = function (options = {}) {
  const {
    categoryId,
    categoryPathId,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 },
    filters = {},
  } = options;

  const query = {};

  if (categoryId) {
    query.categoryId = categoryId;
  } else if (categoryPathId) {
    query.categoryPath = categoryPathId;
  }

  Object.assign(query, filters);
  Object.assign(query, filters);

  return this.find(query).sort(sort).skip(skip).limit(limit).lean();
};

const Listing = mongoose.model("Listing", listingSchema);

export default Listing;
