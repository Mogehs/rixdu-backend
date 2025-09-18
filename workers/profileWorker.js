import { Worker } from "bullmq";
import redis from "../config/redis.js";
import { JOB_TYPES } from "../config/queue.js";
import { createProfile } from "../controllers/profile.controller.js";

export const profileWorker = new Worker(
  "profile",
  async (job) => {
    const { name: type, data } = job;

    console.log(`Processing profile job: ${type} for user ${data.userId}`);

    switch (type) {
      case JOB_TYPES.PROFILE.CREATE: {
        await createProfile(data.userId);
        break;
      }

      default:
        throw new Error(`Unknown profile job type: ${type}`);
    }

    return { success: true, type, userId: data.userId };
  },
  {
    connection: redis,
    concurrency: 2, // Process up to 2 profile creation jobs concurrently
    removeOnComplete: 100,
    removeOnFail: 50,
  }
);

profileWorker.on("completed", (job, result) => {
  console.log(`Profile worker completed job ${job.id}:`, result);
});

profileWorker.on("failed", (job, err) => {
  console.error(`Profile worker failed job ${job.id}:`, err.message);
});

profileWorker.on("error", (err) => {
  console.error("Profile worker error:", err);
});
