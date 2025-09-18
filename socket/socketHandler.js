import redis from "../config/redis.js";
import {
  markChatMessagesAsRead,
  sendMessage,
} from "../controllers/message.controller.js";

const pub = redis.duplicate();
const sub = redis.duplicate();

// Initialize Redis subscriptions
const initializeRedis = async () => {
  try {
    await sub.subscribe("Messages");
    await sub.subscribe("Typing");
    await sub.subscribe("StopTyping");
    console.log("Redis subscriptions initialized");
  } catch (error) {
    console.error("Error initializing Redis subscriptions:", error);
  }
};

// Initialize Redis subscriptions
await initializeRedis();

export const socketHandler = (io) => {
  // Single message handler for all channels
  sub.on("message", (channel, message) => {
    try {
      const parsedMessage = JSON.parse(message);

      switch (channel) {
        case "Messages": {
          const chatId = parsedMessage.chat;
          io.to(chatId).emit("new-message", parsedMessage);
          console.log(`Message sent in chat ${chatId}:`, parsedMessage);
          break;
        }

        case "Typing": {
          io.to(parsedMessage.chatId).emit("user-typing", parsedMessage.userId);
          break;
        }

        case "StopTyping": {
          io.to(parsedMessage.chatId).emit(
            "user-stop-typing",
            parsedMessage.userId
          );
          break;
        }

        default:
          console.log(`Unknown channel: ${channel}`);
      }
    } catch (error) {
      console.error(`Error processing message from channel ${channel}:`, error);
    }
  });

  // Handle Redis connection errors
  sub.on("error", (error) => {
    console.error("Redis subscriber error:", error);
  });

  pub.on("error", (error) => {
    console.error("Redis publisher error:", error);
  });

  io.on("connection", (socket) => {
    console.log(`New socket connected: ${socket.id}`);

    // Handle user joining their personal notification room
    socket.on("join-user", (userId) => {
      if (userId) {
        const userRoom = `user:${userId}`;
        socket.join(userRoom);
        console.log(`Socket ${socket.id} joined user room: ${userRoom}`);
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
        await pub.publish(`Messages`, JSON.stringify(newMessage));
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

    socket.on("typing", async (chatId, userId) => {
      try {
        await pub.publish("Typing", JSON.stringify({ chatId, userId }));
      } catch (error) {
        console.error("Error publishing typing event:", error);
      }
    });

    socket.on("stop-typing", async (chatId, userId) => {
      try {
        await pub.publish("StopTyping", JSON.stringify({ chatId, userId }));
      } catch (error) {
        console.error("Error publishing stop-typing event:", error);
      }
    });

    socket.on("leave-chat", (chatId) => {
      socket.leave(chatId);
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
