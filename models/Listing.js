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
    city: {
      type: String,
      required: true,
      index: true,
    },
    serviceType: {
      type: String,
      default: "others",
    },
    // Payment and plan related fields
    plan: {
      type: String,
      enum: ["free", "premium", "featured"],
      default: "free",
      index: true,
    },
    planDuration: {
      type: Number, // Duration in days
      default: null,
    },
    planPrice: {
      type: Number,
      default: 0,
    },
    planOriginalPrice: {
      type: Number,
      default: 0,
    },
    planDiscountPercentage: {
      type: Number,
      default: 0,
    },
    planCurrency: {
      type: String,
      default: "AED",
    },
    planExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    isPremium: {
      type: Boolean,
      default: false,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Stripe payment related fields
    stripePaymentIntentId: {
      type: String,
      default: null,
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "processing", "succeeded", "failed", "canceled"],
      default: "pending",
      index: true,
    },
    paymentMethodId: {
      type: String,
      default: null,
    },
    paymentAmount: {
      type: Number,
      default: 0,
    },
    paymentCurrency: {
      type: String,
      default: "AED",
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    refundId: {
      type: String,
      default: null,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundDate: {
      type: Date,
      default: null,
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
  // Handle plan-related fields
  if (this.isModified("plan") || this.isModified("planDuration")) {
    // Set plan flags based on plan type
    this.isPremium = this.plan === "premium";
    this.isFeatured = this.plan === "featured";

    // Set verification status for paid plans
    if (this.plan !== "free" && this.paymentStatus === "succeeded") {
      this.isVerified = true;
    }

    // Calculate plan expiration date
    if (this.planDuration && this.planDuration > 0) {
      const now = new Date();
      this.planExpiresAt = new Date(
        now.getTime() + this.planDuration * 24 * 60 * 60 * 1000
      );
    }
  }

  // Handle payment status changes
  if (this.isModified("paymentStatus")) {
    if (this.paymentStatus === "succeeded") {
      this.paymentDate = new Date();
      if (this.plan !== "free") {
        this.isVerified = true;
      }
    }
  }

  // Handle location coordinates transformation before saving
  if (this.values && this.values.has && this.values.has("location")) {
    const location = this.values.get("location");
    console.log("Found location in values:", location);

    if (
      location &&
      location.coordinates &&
      typeof location.coordinates === "object"
    ) {
      const coords = location.coordinates;
      console.log("Processing coordinates:", coords, "Type:", typeof coords);

      // Check if coordinates are in {lat, lng} format and transform them
      if (coords.lat !== undefined && coords.lng !== undefined) {
        const lng = parseFloat(coords.lng);
        const lat = parseFloat(coords.lat);

        console.log("Parsed coordinates:", {
          lat,
          lng,
          "lat type": typeof lat,
          "lng type": typeof lng,
        });

        if (!isNaN(lng) && !isNaN(lat)) {
          // Convert to GeoJSON format [longitude, latitude]
          const updatedLocation = {
            ...location,
            coordinates: [lng, lat],
          };
          console.log("Setting updated location:", updatedLocation);
          this.values.set("location", updatedLocation);
        } else {
          console.error("Failed to parse coordinates to numbers:", {
            lat,
            lng,
            original: coords,
          });
        }
      }
    }
  }

  if (!this.isModified("slug") && !this.isNew) {
    return next();
  }

  try {
    if (!this.slug) {
      // Safety check - ensure values exists and is a Map
      let titleValue = null;
      if (this.values && typeof this.values.get === "function") {
        titleValue = this.values.get("title") || this.values.get("name");
      }

      // Generate a unique timestamp-based ID
      const timestamp = Date.now().toString(36);
      const randomStr = Math.random().toString(36).substring(2, 8);

      if (titleValue) {
        const baseSlug = String(titleValue)
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/[\s_-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .substring(0, 30); // Limit length

        // Format: [base-slug]_timestamp_random - can never be a MongoDB ObjectId
        this.slug = `[${baseSlug}]_${timestamp}_${randomStr}`;
      } else {
        // Format: [listing]_timestamp_random - can never be a MongoDB ObjectId
        this.slug = `[listing]_${timestamp}_${randomStr}`;
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

  return this.find(query).sort(sort).skip(skip).limit(limit).lean();
};

// Method to find premium listings
listingSchema.statics.findPremiumListings = function (options = {}) {
  const {
    categoryId,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 },
    includeExpired = false,
  } = options;

  const query = {
    isPremium: true,
    isVerified: true,
    paymentStatus: "succeeded",
  };

  if (categoryId) {
    query.categoryId = categoryId;
  }

  if (!includeExpired) {
    query.$or = [
      { planExpiresAt: null },
      { planExpiresAt: { $gt: new Date() } },
    ];
  }

  return this.find(query).sort(sort).skip(skip).limit(limit);
};

// Method to find featured listings
listingSchema.statics.findFeaturedListings = function (options = {}) {
  const {
    categoryId,
    limit = 20,
    skip = 0,
    sort = { createdAt: -1 },
    includeExpired = false,
  } = options;

  const query = {
    isFeatured: true,
    isVerified: true,
    paymentStatus: "succeeded",
  };

  if (categoryId) {
    query.categoryId = categoryId;
  }

  if (!includeExpired) {
    query.$or = [
      { planExpiresAt: null },
      { planExpiresAt: { $gt: new Date() } },
    ];
  }

  return this.find(query).sort(sort).skip(skip).limit(limit);
};

// Method to find listings by payment status
listingSchema.statics.findByPaymentStatus = function (
  paymentStatus,
  options = {}
) {
  const { limit = 20, skip = 0, sort = { createdAt: -1 } } = options;

  return this.find({ paymentStatus }).sort(sort).skip(skip).limit(limit);
};

// Instance method to check if plan is expired
listingSchema.methods.isPlanExpired = function () {
  if (!this.planExpiresAt) return false;
  return new Date() > this.planExpiresAt;
};

// Instance method to get remaining plan days
listingSchema.methods.getRemainingPlanDays = function () {
  if (!this.planExpiresAt) return null;
  const now = new Date();
  if (now > this.planExpiresAt) return 0;
  return Math.ceil((this.planExpiresAt - now) / (24 * 60 * 60 * 1000));
};

// Instance method to upgrade plan
listingSchema.methods.upgradePlan = function (newPlan, duration, price) {
  this.plan = newPlan;
  this.planDuration = duration;
  this.planPrice = price;
  this.isPremium = newPlan === "premium";
  this.isFeatured = newPlan === "featured";

  if (duration && duration > 0) {
    const now = new Date();
    this.planExpiresAt = new Date(
      now.getTime() + duration * 24 * 60 * 60 * 1000
    );
  }

  return this.save();
};

const Listing = mongoose.model("Listing", listingSchema);

export default Listing;
