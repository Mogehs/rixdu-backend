import { Queue } from "bullmq";
import redis from "./redis.js";

// Create queues for different job types
export const emailQueue = new Queue("email", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 1, // Keep last 1 failed jobs
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: "exponential",
      delay: 2000, // Start with 2 second delay
    },
  },
});

export const smsQueue = new Queue("sms", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 1,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});

export const profileQueue = new Queue("profile", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 1,
    attempts: 5, // Profile creation is critical, so more attempts
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});

export const imageUploadQueue = new Queue("imageUpload", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 20, // Keep more completed jobs for tracking
    removeOnFail: 5, // Keep failed jobs for debugging
    attempts: 3, // Retry failed uploads
    backoff: {
      type: "exponential",
      delay: 1500,
    },
  },
});

// Job types constants
export const JOB_TYPES = {
  EMAIL: {
    VERIFICATION: "verification-email",
    PASSWORD_RESET: "password-reset-email",
  },
  SMS: {
    VERIFICATION: "verification-sms",
    PASSWORD_RESET: "password-reset-sms",
  },
  PROFILE: {
    CREATE: "create-profile",
  },
  IMAGE_UPLOAD: {
    LISTING_IMAGES: "listing-images-upload",
    BATCH_UPLOAD: "batch-images-upload",
  },
};

export const addEmailJob = async (type, data, options = {}) => {
  return await emailQueue.add(type, data, {
    priority: type.includes("verification") ? 1 : 2,
    ...options,
  });
};

export const addSmsJob = async (type, data, options = {}) => {
  return await smsQueue.add(type, data, {
    priority: type.includes("verification") ? 1 : 2,
    ...options,
  });
};

export const addProfileJob = async (type, data, options = {}) => {
  return await profileQueue.add(type, data, {
    priority: 1, // High priority for profile creation
    ...options,
  });
};

export const addImageUploadJob = async (type, data, options = {}) => {
  return await imageUploadQueue.add(type, data, {
    priority: options.priority || 2, // Medium priority for image uploads
    ...options,
  });
};

// Queue event listeners for monitoring
emailQueue.on("completed", (job) => {
  console.log(`Email job ${job.id} completed: ${job.name}`);
});

emailQueue.on("failed", (job, err) => {
  console.error(`Email job ${job.id} failed: ${job.name}`, err.message);
});

smsQueue.on("completed", (job) => {
  console.log(`SMS job ${job.id} completed: ${job.name}`);
});

smsQueue.on("failed", (job, err) => {
  console.error(`SMS job ${job.id} failed: ${job.name}`, err.message);
});

profileQueue.on("completed", (job) => {
  console.log(`Profile job ${job.id} completed: ${job.name}`);
});

profileQueue.on("failed", (job, err) => {
  console.error(`Profile job ${job.id} failed: ${job.name}`, err.message);
});

imageUploadQueue.on("completed", (job) => {
  console.log(`Image upload job ${job.id} completed: ${job.name}`);
});

imageUploadQueue.on("failed", (job, err) => {
  console.error(`Image upload job ${job.id} failed: ${job.name}`, err.message);
});

imageUploadQueue.on("progress", (job, progress) => {
  console.log(`Image upload job ${job.id} progress: ${progress}%`);
});
