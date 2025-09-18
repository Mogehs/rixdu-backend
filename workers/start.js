import process from "process";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

console.log("🚀 Starting BullMQ Workers in separate process...");
console.log(`📊 Process ID: ${process.pid}`);
console.log(`🔧 Node Version: ${process.version}`);
console.log(
  `💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
);

// Import and start all workers
import "./emailWorker.js";
import "./smsWorker.js";
import "./profileWorker.js";
import "./imageUploadWorker.js";

// Health monitoring for workers
setInterval(() => {
  const memUsage = process.memoryUsage();
  console.log(`📊 Worker Health Check:`, {
    pid: process.pid,
    uptime: `${Math.floor(process.uptime())}s`,
    memory: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    timestamp: new Date().toISOString(),
  });
}, 60000); // Every minute

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  Received ${signal}, shutting down workers gracefully...`);

  try {
    const { emailWorker } = await import("./emailWorker.js");
    const { smsWorker } = await import("./smsWorker.js");
    const { profileWorker } = await import("./profileWorker.js");
    const { imageUploadWorker } = await import("./imageUploadWorker.js");

    await Promise.all([
      emailWorker.close(),
      smsWorker.close(),
      profileWorker.close(),
      imageUploadWorker.close(),
    ]);

    console.log("✅ All workers closed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during worker shutdown:", error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception in worker process:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "🚨 Unhandled Rejection in worker process:",
    promise,
    "reason:",
    reason
  );
  gracefulShutdown("unhandledRejection");
});

console.log("✅ All workers started successfully!");
console.log("📝 Workers are now processing jobs independently from API server");
console.log("🔄 Press Ctrl+C to gracefully shutdown workers");
