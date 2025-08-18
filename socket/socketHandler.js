import {
  markChatMessagesAsRead,
  sendMessage,
} from "../controllers/message.controller.js";

export const socketHandler = (io) => {
  io.on("connection", (socket) => {
    console.log(`New socket connected: ${socket.id}`);

    socket.on("join-user", (userId) => {
      if (userId) {
        socket.join(`user:${userId}`);
        console.log(`Socket ${socket.id} joined user room: user:${userId}`);
      }
    });

    socket.on("join-chat", (chatId) => {
      socket.join(chatId);
      console.log(`Socket ${socket.id} joined chat: ${chatId}`);
    });

    socket.on("send-message", async (message) => {
      try {
        const { chatId, content, sender } = message;
        const newMessage = await sendMessage(chatId, content, sender);
        io.to(chatId).emit("new-message", newMessage);
        console.log(`Message sent in chat ${chatId}:`, newMessage);
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("mark-chat-as-read", async (chatId, userId) => {
      try {
        await markChatMessagesAsRead(chatId, userId);
        io.to(chatId).emit("chat-read", { userId });
      } catch (error) {
        console.error("Error marking chat as read:", error);
        socket.emit("error", { message: "Failed to mark chat as read" });
      }
    });

    socket.on("typing", (chatId, userId) => {
      socket.to(chatId).emit("user-typing", userId);
    });

    socket.on("stop-typing", (chatId, userId) => {
      socket.to(chatId).emit("user-stop-typing", userId);
    });

    socket.on("leave-chat", (chatId) => {
      socket.leave(chatId);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
