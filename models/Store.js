import mongoose from "mongoose";

const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    icon: {
      url: {
        type: String,
        default:
          "https://res.cloudinary.com/demo/image/upload/v1580125284/default-icon.png",
      },
      public_id: {
        type: String,
        default: null,
      },
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

storeSchema.index({ name: 1 });
storeSchema.index({ slug: 1 });

storeSchema.virtual("categories", {
  ref: "Category",
  localField: "_id",
  foreignField: "storeId",
  count: true,
});

storeSchema.pre("save", function (next) {
  if (!this.slug || this.isModified("name")) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  next();
});

storeSchema.statics.findBySlug = function (slug) {
  return this.findOne({ slug }).lean();
};

storeSchema.statics.findAllStores = function () {
  return this.find().select("name icon slug").sort({ name: 1 }).lean();
};

const Store = mongoose.model("Store", storeSchema);

export default Store;
