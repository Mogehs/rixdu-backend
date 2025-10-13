import Message from "../models/Message.js";
import Chat from "../models/Chat.js";

export const getMessages = async (req, res) => {
  const { chatId, page = 1, limit = 50 } = req.query;

  try {
    const messages = await Message.getMessagesForChat(
      chatId,
      parseInt(page),
      parseInt(limit)
    );
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return res.status(200).json(messages);
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  const { chatId, senderId, message } = req.body;
  if (!chatId || !senderId || !message || !message.trim()) {
    return res.status(400).json({
      message: "Chat ID, sender ID, and message content are required",
    });
  }

  try {
    const newMessage = new Message({
      chat: chatId,
      sender: senderId,
      content: message.trim(),
    });

    await newMessage.save();
    const populatedMessage = await Message.findById(newMessage._id).populate(
      "sender"
    );
    const chat = await Chat.findById(chatId);
    if (chat) {
      chat.lastMessage = message;
      chat.lastMessageAt = new Date();
      await chat.save();
    }

    return res.status(201).json(populatedMessage);
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};
export const sendMessageSocket = async (chatId, content, senderId) => {
  try {
    const message = new Message({
      chat: chatId,
      sender: senderId,
      content,
    });

    await message.save();
    const populatedMessage = await Message.findById(message._id).populate(
      "sender"
    );
    const chat = await Chat.findById(chatId);
    if (chat) {
      chat.lastMessage = content;
      chat.lastMessageAt = new Date();
      await chat.save();
    }

    return populatedMessage;
  } catch (error) {
    throw error;
  }
};

export const markMessagesAsRead = async (req, res) => {
  const { chatId, userId } = req.body;

  try {
    const result = await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: userId },
        isRead: false,
      },
      { isRead: true }
    );

    return res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};
export const markChatMessagesAsRead = async (chatId, userId) => {
  try {
    const result = await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: userId },
        isRead: false,
      },
      { isRead: true }
    );
    return result.modifiedCount;
  } catch (error) {
    throw error;
  }
};
