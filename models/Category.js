import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        "text",
        "number",
        "select",
        "date",
        "checkbox",
        "radio",
        "file",
        "input",
        "point",
      ],
    },
    options: [String],
    required: { type: Boolean, default: false },
    accept: { type: String },
    multiple: { type: Boolean, default: false },
    maxSize: { type: Number },
    maxFiles: { type: Number, default: 1 },
    minFiles: { type: Number, default: 0 },
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
    // Generate unique slug if not provided or if name has changed
    if (!this.slug || this.isModified("name")) {
      this.slug = await this.generateUniqueSlug();
    }

    this.updatedAt = Date.now();

    if (this.isLeaf && (!this.fields || this.fields.length === 0)) {
      this.fields = [
        {
          name: "title",
          type: "input",
          required: true,
        },
        {
          name: "description",
          type: "text",
          required: true,
        },
        {
          name: "price",
          type: "number",
          required: true,
        },
        {
          name: "files",
          type: "file",
          required: true,
          multiple: true,
          maxFiles: 12,
          minFiles: 1,
        },
        {
          name: "location",
          type: "point",
          required: true,
        },
      ];
    }

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
        fields: 1,
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

categorySchema.statics.findBySlug = function (slug, storeId = null) {
  const filter = { slug };
  if (storeId) {
    filter.storeId = storeId;
  }
  return this.findOne(filter);
};

categorySchema.statics.findChildrenBySlug = function (parentSlug, storeId) {
  return this.aggregate([
    // First find the parent by slug
    {
      $match: {
        slug: parentSlug,
        storeId: new mongoose.Types.ObjectId(storeId),
      },
    },
    // Then find its children
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "parent",
        as: "children",
      },
    },
    { $unwind: "$children" },
    { $replaceRoot: { newRoot: "$children" } },
    { $sort: { name: 1 } },
    {
      $project: {
        name: 1,
        slug: 1,
        icon: 1,
        isLeaf: 1,
        childrenCount: 1,
        level: 1,
      },
    },
  ]);
};

categorySchema.statics.getSlugPath = async function (categoryId) {
  const category = await this.findById(categoryId);
  if (!category) return [];

  const path = [];
  let current = category;

  path.unshift(current.slug);

  while (current.parent) {
    current = await this.findById(current.parent);
    if (current) {
      path.unshift(current.slug);
    } else {
      break;
    }
  }

  return path;
};

// Method to generate unique slug
categorySchema.methods.generateUniqueSlug = async function () {
  let baseSlug = this.name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  let slug = baseSlug;
  let counter = 1;

  // Check for existing slug in the same store
  while (
    await mongoose.model("Category").exists({
      slug,
      storeId: this.storeId,
      _id: { $ne: this._id },
    })
  ) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

const Category = mongoose.model("Category", categorySchema);

export default Category;
