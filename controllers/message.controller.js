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

    // Sort messages to ensure latest messages are at the end
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    return res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const sendMessage = async (chatId, content, senderId) => {
  try {
    const message = new Message({
      chat: chatId,
      sender: senderId,
      content,
    });

    await message.save();

    // Populate the sender field
    const populatedMessage = await Message.findById(message._id).populate(
      "sender"
    );

    // Update chat with last message info
    const chat = await Chat.findById(chatId);
    if (chat) {
      chat.lastMessage = content;
      chat.lastMessageAt = new Date();
      await chat.save();
    }

    return populatedMessage;
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
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
    console.error("Error marking messages as read:", error);
    throw error;
  }
};
