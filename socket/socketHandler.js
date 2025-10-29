import redis from "../config/redis.js";
import {
  markChatMessagesAsRead,
  sendMessageSocket,
} from "../controllers/message.controller.js";

const pub = redis.duplicate();
const sub = redis.duplicate();

// Initialize Redis subscriptions
const initializeRedis = async () => {
  try {
    await sub.subscribe("Messages");
    await sub.subscribe("Typing");
    await sub.subscribe("StopTyping");
    await sub.subscribe("ChatListUpdate");
    await sub.subscribe("MessagesRead");
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

          // Emit to both users' personal rooms for chat list updates
          const senderRoom = `user:${parsedMessage.sender._id}`;
          const receiverIds =
            parsedMessage.participants?.filter(
              (id) => id !== parsedMessage.sender._id
            ) || [];

          // Update chat list for sender
          io.to(senderRoom).emit("chat-list-update", {
            chatId,
            lastMessage: parsedMessage.content,
            lastMessageAt: parsedMessage.timestamp,
            senderId: parsedMessage.sender._id,
          });

          // Update chat list for receivers and send notification
          receiverIds.forEach((receiverId) => {
            const receiverRoom = `user:${receiverId}`;
            io.to(receiverRoom).emit("chat-list-update", {
              chatId,
              lastMessage: parsedMessage.content,
              lastMessageAt: parsedMessage.timestamp,
              senderId: parsedMessage.sender._id,
              unreadIncrement: true,
            });

            // Send new message notification with full details
            io.to(receiverRoom).emit("new-message-notification", {
              chatId,
              message: parsedMessage.content,
              sender: parsedMessage.sender,
              timestamp: parsedMessage.timestamp,
            });
          });

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

        case "ChatListUpdate": {
          // Broadcast chat list updates to specific users
          const { userId, chatData } = parsedMessage;
          const userRoom = `user:${userId}`;
          io.to(userRoom).emit("chat-list-update", chatData);
          break;
        }

        case "MessagesRead": {
          // Broadcast read status updates
          const { chatId, userId, readByUserId } = parsedMessage;
          io.to(chatId).emit("messages-read", { chatId, userId, readByUserId });

          // Update chat list for the user who read the messages
          const userRoom = `user:${readByUserId}`;
          io.to(userRoom).emit("chat-list-update", {
            chatId,
            unreadReset: true,
          });
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
        const newMessage = await sendMessageSocket(chatId, content, sender);

        // Get chat participants for proper updates
        const Chat = (await import("../models/Chat.js")).default;
        const chat = await Chat.findById(chatId).populate("sender receiver");

        // Emit to chat room for real-time message display
        await pub.publish(`Messages`, JSON.stringify(newMessage));

        // Send clean chat list updates to both users
        const senderUpdate = {
          chatId,
          lastMessage: content,
          lastMessageAt: newMessage.timestamp,
          senderId: sender,
          unreadIncrement: false, // Don't increment for sender
        };

        const receiverUpdate = {
          chatId,
          lastMessage: content,
          lastMessageAt: newMessage.timestamp,
          senderId: sender,
          unreadIncrement: true, // Increment for receiver
        };

        // Send to both users' rooms for sidebar updates
        io.to(`user:${chat.sender._id}`).emit(
          "chat-update",
          chat.sender._id.toString() === sender ? senderUpdate : receiverUpdate
        );
        io.to(`user:${chat.receiver._id}`).emit(
          "chat-update",
          chat.receiver._id.toString() === sender
            ? senderUpdate
            : receiverUpdate
        );
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("mark-chat-as-read", async (chatId, userId) => {
      try {
        const modifiedCount = await markChatMessagesAsRead(chatId, userId);

        if (modifiedCount > 0) {
          // Emit to the chat room for real-time read status
          io.to(chatId).emit("messages-read", { chatId, readByUserId: userId });

          // Update user's chat list to reset unread count
          io.to(`user:${userId}`).emit("chat-read-update", { chatId });
        }
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
