import mongoose from "mongoose";

const pricePlanSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    planType: {
      type: String,
      required: true,
      enum: ["premium", "featured"],
      index: true,
    },
    duration: {
      type: Number,
      required: true,
      enum: [7, 14, 30], // days
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "AED",
      enum: ["AED", "USD", "EUR"], // You can extend this as needed
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    features: {
      type: [String],
      default: function () {
        if (this.planType === "premium") {
          return [
            "Placed on top of all ads",
            "Get up to 25X more offers",
            "Higher visibility",
            "Priority listing",
          ];
        } else if (this.planType === "featured") {
          return [
            "Featured above standard ads",
            "Better visibility",
            "Attractive highlighting",
            "More engagement",
          ];
        }
        return [];
      },
    },
    description: {
      type: String,
      default: function () {
        if (this.planType === "premium") {
          return `Premium ad for ${this.duration} days - Get maximum visibility for your listing`;
        } else if (this.planType === "featured") {
          return `Feature your ad for ${this.duration} days - Stand out from regular listings`;
        }
        return "";
      },
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    discountedPrice: {
      type: Number,
      default: function () {
        if (this.discountPercentage > 0) {
          return this.price * (1 - this.discountPercentage / 100);
        }
        return this.price;
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for better query performance
pricePlanSchema.index(
  { categoryId: 1, planType: 1, duration: 1 },
  { unique: true }
);
pricePlanSchema.index({ storeId: 1, isActive: 1 });
pricePlanSchema.index({ categoryId: 1, isActive: 1 });
pricePlanSchema.index({ planType: 1, duration: 1, isActive: 1 });

// Virtual for formatted price display
pricePlanSchema.virtual("formattedPrice").get(function () {
  return `${this.currency} ${this.price}`;
});

// Virtual for formatted discounted price display
pricePlanSchema.virtual("formattedDiscountedPrice").get(function () {
  return `${this.currency} ${this.discountedPrice}`;
});

// Pre-save middleware
pricePlanSchema.pre("save", async function (next) {
  try {
    this.updatedAt = Date.now();

    // Calculate discounted price
    if (this.discountPercentage > 0) {
      this.discountedPrice = this.price * (1 - this.discountPercentage / 100);
    } else {
      this.discountedPrice = this.price;
    }

    // Set default description if not provided
    if (!this.description) {
      if (this.planType === "premium") {
        this.description = `Premium ad for ${this.duration} days - Get maximum visibility for your listing`;
      } else if (this.planType === "featured") {
        this.description = `Feature your ad for ${this.duration} days - Stand out from regular listings`;
      }
    }

    // Set default features if not provided
    if (!this.features || this.features.length === 0) {
      if (this.planType === "premium") {
        this.features = [
          "Placed on top of all ads",
          "Get up to 25X more offers",
          "Higher visibility",
          "Priority listing",
        ];
      } else if (this.planType === "featured") {
        this.features = [
          "Featured above standard ads",
          "Better visibility",
          "Attractive highlighting",
          "More engagement",
        ];
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Static methods
pricePlanSchema.statics.getActivePlansForCategory = function (
  categoryId,
  isActive = true
) {
  return this.find({
    categoryId,
    isActive,
  })
    .populate("categoryId", "name slug")
    .sort({ planType: 1, duration: 1 })
    .lean();
};

pricePlanSchema.statics.getActivePlansForStore = function (
  storeId,
  isActive = true
) {
  return this.find({
    storeId,
    isActive,
  })
    .populate("categoryId", "name slug")
    .sort({ planType: 1, duration: 1 })
    .lean();
};

pricePlanSchema.statics.getPlansByType = function (planType, isActive = true) {
  return this.find({
    planType,
    isActive,
  })
    .populate("categoryId", "name slug")
    .populate("storeId", "name slug")
    .sort({ duration: 1, price: 1 })
    .lean();
};

// Instance methods
pricePlanSchema.methods.activate = function () {
  this.isActive = true;
  this.updatedAt = Date.now();
  return this.save();
};

pricePlanSchema.methods.deactivate = function () {
  this.isActive = false;
  this.updatedAt = Date.now();
  return this.save();
};

pricePlanSchema.methods.updatePrice = function (
  newPrice,
  discountPercentage = 0
) {
  this.price = newPrice;
  this.discountPercentage = discountPercentage;
  this.discountedPrice = newPrice * (1 - discountPercentage / 100);
  this.updatedAt = Date.now();
  return this.save();
};

const PricePlan = mongoose.model("PricePlan", pricePlanSchema);

export default PricePlan;
