import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cluster from "cluster";
import os from "os";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import storeRoutes from "./routes/store.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import listingRoutes from "./routes/listing.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import ratingRoutes from "./routes/rating.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import messagesRoutes from "./routes/messages.routes.js";
import errorHandler, { notFound } from "./middleware/error.middleware.js";
import logger, { httpLogger } from "./utils/logger.js";
import performanceMonitor from "./middleware/performance.middleware.js";
import process from "process";
import { createServer } from "http";
import { Server } from "socket.io";
import { socketHandler } from "./socket/socketHandler.js";

dotenv.config();

const numCPUs = os.cpus().length;

if (cluster.isPrimary && process.env.NODE_ENV === "production") {
  logger.info(`Primary ${process.pid} is running`);
  logger.info(`Setting up ${numCPUs} workers...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(
      `Worker ${worker.process.pid} died with code ${code} and signal ${signal}. Restarting...`
    );
    cluster.fork();
  });
} else {
  const app = express();

  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  app.use(
    cors({
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  if (process.env.NODE_ENV !== "production") {
    app.use(morgan("dev"));
  } else {
    app.use(morgan(httpLogger));
  }

  app.use(performanceMonitor);

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again later.",
    handler: (req, res, next, options) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(options.statusCode).json({
        status: "error",
        message: options.message,
      });
    },
  });

  app.use("/api/", apiLimiter);

  connectDB();

  mongoose.set("strictQuery", true);

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected. Attempting to reconnect...");
    setTimeout(connectDB, 5000);
  });

  process.on("SIGINT", async () => {
    try {
      await mongoose.connection.close();
      logger.info("MongoDB connection closed through app termination");
      process.exit(0);
    } catch (err) {
      logger.error("Error during mongoose disconnection", err);
      process.exit(1);
    }
  });

  const apiVersion = "/api/v1";

  app.use(`${apiVersion}/auth`, authRoutes);
  app.use(`${apiVersion}/profiles`, profileRoutes);
  app.use(`${apiVersion}/users`, userRoutes);
  app.use(`${apiVersion}/stores`, storeRoutes);
  app.use(`${apiVersion}/categories`, categoryRoutes);
  app.use(`${apiVersion}/listings`, listingRoutes);
  app.use(`${apiVersion}/ratings`, ratingRoutes);
  app.use(`${apiVersion}/chats`, chatRoutes);
  app.use(`${apiVersion}/messages`, messagesRoutes);

  app.get("/api/", (req, res) => {
    res.json({
      status: "success",
      message: "Rixdu API is running",
      version: "1.0",
      serverTime: new Date().toISOString(),
    });
  });

  app.get("/api/health", (req, res) => {
    const dbStatus =
      mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: Date.now(),
      database: dbStatus,
      memoryUsage: process.memoryUsage(),
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  const PORT = process.env.PORT || 5000;

  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  server.listen(PORT, () => {
    logger.info(`Worker ${process.pid} - Server running on port ${PORT}`);
  });

  socketHandler(io);

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    server.close(() => {
      logger.info("Process terminated");
    });
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection", { reason, promise });
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception", err);
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
}
