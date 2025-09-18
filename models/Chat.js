import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    lastMessage: {
      type: String,
      maxlength: 500,
    },
    lastMessageAt: {
      type: Date,
    },
    type: {
      type: String,
      enum: ["seeker", "hiring", "vehicle", "other"],
      default: "other",
    },
  },
  {
    timestamps: true,
  }
);

chatSchema.index({ listing: 1, sender: 1, receiver: 1 }, { unique: true });
chatSchema.index({ sender: 1 });
chatSchema.index({ receiver: 1 });
chatSchema.index({ lastMessageAt: -1 });
chatSchema.index({ slug: 1 });

// Method to generate unique slug
chatSchema.methods.generateUniqueSlug = async function () {
  const baseSlug = `chat-${this.listing.toString().slice(-8)}-${this.sender
    .toString()
    .slice(-4)}-${this.receiver.toString().slice(-4)}`;
  let slug = baseSlug;
  let counter = 1;

  while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

// Pre-save hook to generate slug
chatSchema.pre("save", async function (next) {
  if (this.isNew && !this.slug) {
    this.slug = await this.generateUniqueSlug();
  }
  next();
});

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;
