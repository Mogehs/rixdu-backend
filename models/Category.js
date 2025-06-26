import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        "text",
        "number",
        "select",
        "date",
        "checkbox",
        "file",
        "image",
        "input",
      ],
    },
    options: [String],
    required: { type: Boolean, default: false },
    accept: { type: String },
    multiple: { type: Boolean, default: false },
    maxSize: { type: Number },
    maxFiles: { type: Number, default: 1 },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      index: "text",
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    isLeaf: {
      type: Boolean,
      default: false,
      index: true,
    },
    fields: [fieldSchema],
    icon: {
      public_id: { type: String },
      url: { type: String },
    },
    level: {
      type: Number,
      default: 0,
      index: true,
    },
    path: {
      type: String,
      default: "",
      index: true,
    },
    childrenCount: {
      type: Number,
      default: 0,
    },
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

categorySchema.index({ storeId: 1, isLeaf: 1 });
categorySchema.index({ storeId: 1, parent: 1 });
categorySchema.index({ storeId: 1, name: 1 });
categorySchema.index({ name: 1, slug: 1 });

categorySchema.pre("save", async function (next) {
  try {
    if (!this.slug) {
      this.slug = this.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    this.updatedAt = Date.now();

    if (this.parent && this.isModified("parent")) {
      const parent = await mongoose.model("Category").findById(this.parent);

      if (parent) {
        this.level = parent.level + 1;
        this.path = parent.path
          ? `${parent.path},${parent._id}`
          : parent._id.toString();

        if (this.isNew) {
          parent.childrenCount += 1;
          parent.children.push(this._id);
          await parent.save();
        }
      }
    } else if (!this.parent) {
      this.level = 0;
      this.path = "";
    }

    next();
  } catch (error) {
    next(error);
  }
});

categorySchema.pre("remove", async function (next) {
  try {
    if (this.parent) {
      const parent = await mongoose.model("Category").findById(this.parent);
      if (parent) {
        parent.childrenCount = Math.max(0, parent.childrenCount - 1);
        await parent.save();
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

categorySchema.statics.getFullHierarchy = async function (storeId) {
  return this.aggregate([
    { $match: { storeId: new mongoose.Types.ObjectId(storeId) } },
    { $sort: { level: 1, name: 1 } },
    {
      $project: {
        _id: 1,
        name: 1,
        parent: 1,
        level: 1,
        path: 1,
        isLeaf: 1,
        childrenCount: 1,
        slug: 1,
        icon: 1,
      },
    },
  ]);
};

categorySchema.statics.findChildren = function (parentId, storeId) {
  return this.find({ parent: parentId, storeId })
    .select("name slug icon isLeaf childrenCount")
    .sort("name")
    .lean();
};

const Category = mongoose.model("Category", categorySchema);

export default Category;
