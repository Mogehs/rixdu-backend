import { Worker } from "bullmq";
import redis from "../config/redis.js";
import { JOB_TYPES } from "../config/queue.js";
import {
  sendSMS,
  getVerificationSMSTemplate,
  getPasswordResetSMSTemplate,
} from "../utils/smsService.js";

export const smsWorker = new Worker(
  "sms",
  async (job) => {
    const { name: type, data } = job;

    console.log(`Processing SMS job: ${type} for ${data.to}`);

    switch (type) {
      case JOB_TYPES.SMS.VERIFICATION: {
        const smsText = getVerificationSMSTemplate(data.verificationCode);
        await sendSMS({
          to: data.to,
          body: smsText,
        });
        break;
      }

      case JOB_TYPES.SMS.PASSWORD_RESET: {
        const smsText = getPasswordResetSMSTemplate(data.resetCode);
        await sendSMS({
          to: data.to,
          body: smsText,
        });
        break;
      }

      default:
        throw new Error(`Unknown SMS job type: ${type}`);
    }

    return { success: true, type, to: data.to };
  },
  {
    connection: redis,
    concurrency: 3, // Process up to 3 SMS jobs concurrently (SMS providers often have rate limits)
    removeOnComplete: 100,
    removeOnFail: 50,
  }
);

smsWorker.on("completed", (job, result) => {
  console.log(`SMS worker completed job ${job.id}:`, result);
});

smsWorker.on("failed", (job, err) => {
  console.error(`SMS worker failed job ${job.id}:`, err.message);
});

smsWorker.on("error", (err) => {
  console.error("SMS worker error:", err);
});
