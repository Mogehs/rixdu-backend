import mongoose from "mongoose";

const workingHoursSchema = new mongoose.Schema(
  {
    monday: {
      open: { type: String, default: "09:00" },
      close: { type: String, default: "18:00" },
      isOpen: { type: Boolean, default: true },
    },
    tuesday: {
      open: { type: String, default: "09:00" },
      close: { type: String, default: "18:00" },
      isOpen: { type: Boolean, default: true },
    },
    wednesday: {
      open: { type: String, default: "09:00" },
      close: { type: String, default: "18:00" },
      isOpen: { type: Boolean, default: true },
    },
    thursday: {
      open: { type: String, default: "09:00" },
      close: { type: String, default: "18:00" },
      isOpen: { type: Boolean, default: true },
    },
    friday: {
      open: { type: String, default: "09:00" },
      close: { type: String, default: "18:00" },
      isOpen: { type: Boolean, default: true },
    },
    saturday: {
      open: { type: String, default: "09:00" },
      close: { type: String, default: "14:00" },
      isOpen: { type: Boolean, default: true },
    },
    sunday: {
      open: { type: String, default: "00:00" },
      close: { type: String, default: "00:00" },
      isOpen: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const trustBadgesSchema = new mongoose.Schema(
  {
    certified: { type: Boolean, default: false },
    warranty: { type: Boolean, default: false },
    fastService: { type: Boolean, default: false },
    qualityGuaranteed: { type: Boolean, default: false },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
      default: "Point",
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
  { _id: false }
);

const garageSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  website: {
    type: String,
    trim: true,
  },

  // Location
  address: {
    type: String,
    required: true,
    trim: true,
  },
  location: {
    type: locationSchema,
    required: true,
  },

  // Working Hours
  workingHours: {
    type: workingHoursSchema,
    default: () => ({}),
  },

  // Business Details
  yearEstablished: {
    type: String,
    trim: true,
  },
  licenseNumber: {
    type: String,
    trim: true,
  },
  specialties: [
    {
      type: String,
      trim: true,
    },
  ],
  certifications: [
    {
      type: String,
      trim: true,
    },
  ],

  // Media
  logo: {
    type: String, // Cloudinary URL
    trim: true,
  },
  coverImage: {
    type: String, // Cloudinary URL
    trim: true,
  },
  gallery: [
    {
      type: String, // Cloudinary URLs
      trim: true,
    },
  ],

  services: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GarageService",
    },
  ],

  // Features & Badges
  features: [
    {
      type: String,
      trim: true,
    },
  ],
  trustBadges: {
    type: trustBadgesSchema,
    default: () => ({}),
  },

  // SEO & Meta
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  metaDescription: {
    type: String,
    maxlength: 160,
  },
  keywords: [
    {
      type: String,
      trim: true,
    },
  ],

  // Status & Analytics
  isActive: {
    type: Boolean,
    default: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  totalBookings: {
    type: Number,
    default: 0,
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 },
  },
  responseTime: {
    type: String,
    default: "Within 2 hours",
  },

  // Owner Information
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
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

// Indexes for better performance
garageSchema.index({ slug: 1 });
garageSchema.index({ location: "2dsphere" });
garageSchema.index({ specialties: 1 });
garageSchema.index({ "rating.average": -1 });
garageSchema.index({ isActive: 1, isVerified: 1 });

// Pre-save middleware to update updatedAt
garageSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for computed fields
garageSchema.virtual("isOpen").get(function () {
  const now = new Date();
  const currentDay = now
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase(); // → "monday"

  const dayMapping = {
    sun: "sunday",
    mon: "monday",
    tue: "tuesday",
    wed: "wednesday",
    thu: "thursday",
    fri: "friday",
    sat: "saturday",
  };

  const daySchedule = this.workingHours[dayMapping[currentDay]];
  if (!daySchedule || !daySchedule.isOpen) return false;

  const currentTime = now.toTimeString().substring(0, 5); // HH:MM format
  return currentTime >= daySchedule.open && currentTime <= daySchedule.close;
});

// Method to generate slug from name
garageSchema.methods.generateSlug = function () {
  return this.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

// Static method to find nearby garages
garageSchema.statics.findNearby = function (lat, lng, maxDistance = 10000) {
  return this.find({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: maxDistance,
      },
    },
    isActive: true,
  });
};

export default mongoose.model("Garage", garageSchema);
