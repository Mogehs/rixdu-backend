import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      maxlength: 2000,
      trim: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ chat: 1, timestamp: -1 });
messageSchema.index({ sender: 1, timestamp: -1 });
messageSchema.index({ chat: 1, isRead: 1 });
messageSchema.index({ content: "text" });

messageSchema.statics.getMessagesForChat = function (
  chatId,
  page = 1,
  limit = 50
) {
  return this.find({
    chat: chatId,
  })
    .populate("sender", "username")
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
};

messageSchema.statics.countUnreadMessages = function (chatId, userId) {
  return this.countDocuments({
    chat: chatId,
    sender: { $ne: userId },
    isRead: false,
  });
};

const Message = mongoose.model("Message", messageSchema);

export default Message;
