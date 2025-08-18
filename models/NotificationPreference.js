import mongoose from "mongoose";

const NotificationPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      index: true,
      required: true,
    },
    channels: {
      email: { type: Boolean, default: false },
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: true }, // Enable push notifications by default
    },
  },
  { timestamps: true }
);

NotificationPreferenceSchema.index({ userId: 1, storeId: 1 }, { unique: true });

const NotificationPreference = mongoose.model(
  "NotificationPreference",
  NotificationPreferenceSchema
);
export default NotificationPreference;
