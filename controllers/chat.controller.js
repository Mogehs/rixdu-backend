import mongoose from "mongoose";
import Chat from "../models/Chat.js";
import Message from "../models/Message.js";

export const getOrCreateChat = async (req, res) => {
  const { listingId, senderId, receiverId } = req.body;

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
      .populate("sender")
      .populate("receiver")
      .populate({
        path: "listing",
        select: "values slug storeId",
        populate: {
          path: "storeId",
          select: "name slug icon",
        },
      })
      .lean()
      .sort({ lastMessageAt: -1 });

    const chatsWithUnread = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await Message.countUnreadMessages(chat._id, userId);

        return {
          ...chat,
          unreadCount,
        };
      })
    );

    res.status(200).json(chatsWithUnread);
  } catch (error) {
    console.error("Error in getUserChats:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
