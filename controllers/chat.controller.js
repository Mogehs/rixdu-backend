import mongoose from "mongoose";
import Chat from "../models/Chat.js";
import Message from "../models/Message.js";

export const getOrCreateChat = async (req, res) => {
  const { listingId, senderId, receiverId, type } = req.body;

  try {
    let chat = await Chat.findOne({
      listing: listingId,
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId },
      ],
    })
      .populate({
        path: "listing",
        select: "values slug storeId",
        populate: {
          path: "storeId",
          select: "name slug icon",
        },
      })
      .populate("sender")
      .populate("receiver");

    // If chat doesn't exist, create it
    if (!chat) {
      chat = new Chat({
        listing: listingId,
        sender: senderId,
        receiver: receiverId,
        type: type || "other",
      });

      await chat.save();

      // Populate after saving
      chat = await Chat.findById(chat._id)
        .populate({
          path: "listing",
          select: "values slug storeId",
          populate: {
            path: "storeId",
            select: "name slug icon",
          },
        })
        .populate("sender")
        .populate("receiver");
    }

    res.status(200).json(chat);
  } catch (error) {
    console.error("Error getting or creating chat:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getChatById = async (req, res) => {
  const { chatId } = req.params;

  try {
    let query = {};

    // Check if chatId is a valid ObjectId or treat as slug
    if (mongoose.Types.ObjectId.isValid(chatId)) {
      query._id = chatId;
    } else {
      query.slug = chatId;
    }

    const chat = await Chat.findOne(query)
      .populate("sender")
      .populate("receiver")
      .populate({
        path: "listing",
        select: "values slug storeId categoryId",
        populate: {
          path: "storeId",
          select: "name slug",
        },
      });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    res.status(200).json(chat);
  } catch (error) {
    console.error("Error in getChatById:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getChatBySlug = async (req, res) => {
  const { slug } = req.params;

  try {
    const chat = await Chat.findOne({ slug })
      .populate("sender")
      .populate("receiver")
      .populate({
        path: "listing",
        select: "values slug storeId",
        populate: {
          path: "storeId",
          select: "name slug icon",
        },
      });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    res.status(200).json(chat);
  } catch (error) {
    console.error("Error in getChatBySlug:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserChats = async (req, res) => {
  const userId = req.params.id;

  try {
    const chats = await Chat.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "name username email avatar isOnline")
      .populate("receiver", "name username email avatar isOnline")
      .populate({
        path: "listing",
        select: "values slug storeId",
        populate: {
          path: "storeId",
          select: "name slug icon",
        },
      })
      .lean()
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    const chatsWithMetadata = await Promise.all(
      chats.map(async (chat) => {
        // Get unread count
        const unreadCount = await Message.countUnreadMessages(chat._id, userId);

        // Get last message if not already present
        let lastMessage = chat.lastMessage;
        let lastMessageTime = chat.lastMessageAt;

        if (!lastMessage) {
          const recentMessage = await Message.findOne({ chat: chat._id })
            .sort({ timestamp: -1 })
            .select("content timestamp")
            .lean();

          if (recentMessage) {
            lastMessage = recentMessage.content;
            lastMessageTime = recentMessage.timestamp;
          }
        }

        return {
          ...chat,
          unreadCount,
          lastMessage,
          lastMessageTime: lastMessageTime || chat.updatedAt,
        };
      })
    );

    res.status(200).json(chatsWithMetadata);
  } catch (error) {
    console.error("Error in getUserChats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
