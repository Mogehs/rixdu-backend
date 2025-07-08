import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reviewee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 500,
    },
    attributes: [
      {
        type: String,
        enum: [
          "Good Dealer",
          "Best Communication",
          "Fast Response",
          "Honest Seller",
          "Fair Pricing",
          "Quality Product",
          "Reliable",
          "Professional",
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

ratingSchema.index({ reviewee: 1 });
ratingSchema.index({ reviewer: 1, reviewee: 1 }, { unique: true });
ratingSchema.index({ stars: 1 });
ratingSchema.index({ createdAt: -1 });

export const Rating = mongoose.model("Rating", ratingSchema);
