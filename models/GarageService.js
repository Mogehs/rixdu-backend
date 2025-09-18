import mongoose from "mongoose";

const garageServiceSchema = new mongoose.Schema({
  // Basic Service Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  // Human-friendly slug for the service (unique per garage)
  slug: {
    type: String,
    trim: true,
    index: true,
  },
  description: {
    type: String,
    required: true,
    maxlength: 500,
  },
  category: {
    type: String,
    required: true,
    enum: [
      "Engine Repair",
      "Brake Service",
      "Oil Changes",
      "Transmission Repair",
      "AC Repair",
      "Diagnostics",
      "Tire Service",
      "Battery Service",
      "Suspension Repair",
      "Electrical Work",
      "Body Work",
      "Paint Service",
      "Detailing",
      "Towing",
      "Emergency Service",
      "Hybrid Service",
      "Diesel Service",
      "Performance Tuning",
      "Restoration",
      "Custom Work",
    ],
  },

  // Garage Reference
  garage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Garage",
    required: true,
  },

  // Pricing
  priceMin: {
    type: Number,
    required: true,
    min: 0,
  },
  priceMax: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: "USD",
  },

  // Service Details
  duration: {
    type: String,
    required: true, // e.g., "2-3 hours", "Same day"
  },
  warranty: {
    type: String,
    default: "30 days", // e.g., "6 months", "1 year"
  },
  experience: {
    type: String, // e.g., "10+ years experience"
  },

  // Service Features
  features: [
    {
      type: String,
      trim: true,
    },
  ],

  // Media
  images: [
    {
      type: String, // Cloudinary URLs
      trim: true,
    },
  ],

  // Service Status
  isActive: {
    type: Boolean,
    default: true,
  },
  isPopular: {
    type: Boolean,
    default: false,
  },

  // Analytics
  totalBookings: {
    type: Number,
    default: 0,
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 },
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Indexes
garageServiceSchema.index({ garage: 1 });
garageServiceSchema.index({ category: 1 });
garageServiceSchema.index({ isActive: 1 });
garageServiceSchema.index({ "rating.average": -1 });
garageServiceSchema.index({ totalBookings: -1 });

// Pre-save middleware
garageServiceSchema.pre("save", function (next) {
  this.updatedAt = new Date();

  // Ensure priceMax is greater than or equal to priceMin
  if (this.priceMax < this.priceMin) {
    this.priceMax = this.priceMin;
  }

  // Generate slug from name if not provided or if name changed
  if (!this.slug || this.isModified("name")) {
    const base = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    this.slug = base;
  }

  next();
});

// Virtual for price range display
garageServiceSchema.virtual("priceRange").get(function () {
  if (this.priceMin === this.priceMax) {
    return `$${this.priceMin}`;
  }
  return `$${this.priceMin} - $${this.priceMax}`;
});

// Method to update rating
garageServiceSchema.methods.updateRating = function (newRating) {
  const totalRating = this.rating.average * this.rating.count + newRating;
  this.rating.count += 1;
  this.rating.average = totalRating / this.rating.count;
  return this.save();
};

// Static method to find services by category
garageServiceSchema.statics.findByCategory = function (category, options = {}) {
  const query = { category, isActive: true };
  return this.find(query)
    .populate("garage", "name slug location rating")
    .sort(options.sort || { "rating.average": -1 })
    .limit(options.limit || 20);
};

export default mongoose.model("GarageService", garageServiceSchema);
