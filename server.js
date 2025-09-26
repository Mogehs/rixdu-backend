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
import applicationRoutes from "./routes/application.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import bookingRoutes from "./routes/bookings.routes.js";
import garageRoutes from "./routes/garage.routes.js";
import errorHandler, { notFound } from "./middleware/error.middleware.js";
import logger, { httpLogger } from "./utils/logger.js";
import performanceMonitor from "./middleware/performance.middleware.js";
import process from "process";
import { createServer } from "http";
import { Server } from "socket.io";
import { socketHandler } from "./socket/socketHandler.js";
import { setIO } from "./utils/socket.js";

dotenv.config();

// =============================
// Clustering + Memory Controls
// =============================
const numCPUs = os.cpus().length;
const maxWorkers =
  parseInt(process.env.MAX_WORKERS, 10) || Math.min(numCPUs, 2);
const enableClustering = process.env.ENABLE_CLUSTERING === "true"; // explicit toggle
const memoryLimitWarning =
  parseInt(process.env.MEMORY_LIMIT_WARNING, 10) || 200; // MB

if (
  cluster.isPrimary &&
  process.env.NODE_ENV === "production" &&
  enableClustering
) {
  logger.info(`Primary ${process.pid} is running`);
  logger.info(`Setting up ${maxWorkers} workers (CPU cores: ${numCPUs})...`);

  // Master process memory monitoring
  const masterMemoryMonitor = setInterval(() => {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    if (heapUsedMB > memoryLimitWarning) {
      logger.warn(`Master process high memory usage: ${heapUsedMB}MB`);
    }
  }, 60_000);

  for (let i = 0; i < maxWorkers; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(
      `Worker ${worker.process.pid} died with code ${code} and signal ${signal}. Restarting...`
    );
    cluster.fork();
  });

  process.on("SIGTERM", () => {
    logger.info("Master process received SIGTERM, shutting down workers...");
    clearInterval(masterMemoryMonitor);
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    setTimeout(() => process.exit(0), 5000);
  });
} else {
  // =============================
  // App Setup
  // =============================
  const app = express();
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:3000",
    "http://localhost:5173",
    "https://www.rixdu.com",
  ];

  app.use(
    cors({
      origin: allowedOrigins,
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

  // =============================
  // Rate Limiting
  // =============================
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 50 : 100, // keep stricter in prod
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again later.",
    skipSuccessfulRequests: true,
    skipFailedRequests: true,
    skip: (req) => req.url === "/favicon.ico",
    handler: (req, res, _next, options) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(options.statusCode).json({
        status: "error",
        message: options.message,
      });
    },
  });
  app.use("/api/", apiLimiter);

  // =============================
  // Database
  // =============================
  connectDB();
  mongoose.set("strictQuery", true);

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected. Attempting to reconnect...");
    // Prevent multiple reconnection attempts
    if (mongoose.connection.readyState === 0) {
      setTimeout(connectDB, 5000);
    }
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

  // =============================
  // Routes
  // =============================
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
  app.use(`${apiVersion}/applications`, applicationRoutes);
  app.use(`${apiVersion}/notifications`, notificationRoutes);
  app.use(`${apiVersion}/bookings`, bookingRoutes);
  app.use(`${apiVersion}/garages`, garageRoutes);

  app.get("/api/", (_req, res) => {
    res.json({
      status: "success",
      message: "Rixdu API is running",
      version: "1.0",
      serverTime: new Date().toISOString(),
    });
  });

  // FavIcon (avoid unnecessary work)
  app.get("/favicon.ico", (_req, res) => res.status(204).send());

  app.get("/api/health", (_req, res) => {
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

  // =============================
  // Server + Socket.io
  // =============================
  const PORT = process.env.PORT || 5000;
  const server = createServer(app);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 1e6, // 1MB
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  // Register io globally for access in controllers
  setIO(io);

  // Memory monitoring (worker)
  const memoryMonitorInterval = setInterval(() => {
    const used = process.memoryUsage();
    const memoryUsageMB = {
      rss: Math.round(used.rss / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      external: Math.round(used.external / 1024 / 1024),
    };

    if (memoryUsageMB.heapUsed > memoryLimitWarning) {
      logger.warn(
        `High memory usage detected: ${JSON.stringify(memoryUsageMB)}MB`
      );
    }
  }, 30_000);

  server.listen(PORT, () => {
    logger.info(`Worker ${process.pid} - Server running on port ${PORT}`);
  });

  socketHandler(io);

  // =============================
  // Process Signals & Errors
  // =============================
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    clearInterval(memoryMonitorInterval);
    server.close(() => {
      logger.info("Process terminated");
    });
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection", { reason, promise });
  });

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught Exception", err);
    setTimeout(() => process.exit(1), 1000);
  });
}
