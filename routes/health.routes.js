import express from "express";
import process from "process";
import { QueueMonitor } from "../utils/queueMonitor.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Basic health check
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Queue health check (protected route - only for authenticated users)
router.get("/queues", protect, async (req, res) => {
  try {
    const stats = await QueueMonitor.getQueueStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error getting queue stats",
      error: error.message,
    });
  }
});

// Clean queues (admin only)
router.post("/queues/clean", protect, async (req, res) => {
  try {
    // You might want to add admin role check here
    const result = await QueueMonitor.cleanQueues();
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error cleaning queues",
      error: error.message,
    });
  }
});

// Retry failed jobs
router.post("/queues/:queueName/retry", protect, async (req, res) => {
  try {
    const { queueName } = req.params;
    const result = await QueueMonitor.retryFailedJobs(queueName);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error retrying failed jobs in ${req.params.queueName}`,
      error: error.message,
    });
  }
});

export default router;
